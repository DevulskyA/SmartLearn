// Estatísticas, "Análise completa" (V7.2): the 9-column table in three views (Por disciplina / Por conteúdo / Por aula),
// four filters, search, sorting, pagination, band distribution, detail dialog and CSV export.
// Numbers come from the same evidence and Analytics rules the rest of the screen uses (periodSubjectRows, unitTrend, state);
// this module only groups, filters, sorts and draws them.
import { Analytics, evidenceInPeriod, TREND_WINDOW_DAYS, validEvidence } from "./analytics.js";
import { t } from "./i18n/index.js";
import { colorVarForKey } from "./performance-thresholds.js";
import { syncSelect } from "./select-ui.js";
import { badge, esc, icon, number, percent, v5Band } from "./stats-v5.js";

const TREND_ORDER = { DECLINING: 0, STABLE: 1, IMPROVING: 2, INSUFFICIENT: 3 };
const BANDS = ["critical", "attention", "adequate", "strong", "insufficient"];
const SORT_KEYS = {
  subject: new Set(["subjectName", "unitsCount", "studyDate", "questions", "correct", "accuracy", "trendScore"]),
  unit: new Set(["subjectName", "title", "studyDate", "questions", "correct", "accuracy", "trendScore"]),
  lesson: new Set(["subjectName", "title", "studyDate", "questions", "correct", "accuracy", "trendScore"]),
};
const DESCENDING_FIRST = new Set(["accuracy", "studyDate"]);

const tableState = {
  tab: "subject", page: 1, perPage: 12, query: "", subjectId: 0, band: "all", trend: "all",
  sortKey: "accuracy", sortAsc: true, advanced: false,
};

let model = emptyModel();
let visibleRows = [];

function emptyModel() {
  return { subjects: [], contents: [], lessons: [] };
}

export const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const isoDate = (value) => (typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null);
const brDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const latest = (dates) => dates.filter(Boolean).reduce((max, d) => (max == null || d > max ? d : max), null);
const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
const trendScore = (trend) => TREND_ORDER[trend?.direction] ?? TREND_ORDER.INSUFFICIENT;

function group(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function measured(questions, correct) {
  const accuracy = questions > 0 ? (100 * correct) / questions : null;
  return { accuracy, band: v5Band({ weightedAccuracy: accuracy, totalQuestions: questions, state: Analytics.state(accuracy, questions) }) };
}

// subjectRows are the period rows the screen already computed (periodSubjectRows); lessons and contents are built from the same evidence.
export function buildTableModel({ subjectRows, evidence, units, subjects, periodValue, today }) {
  const history = validEvidence(evidence).filter((e) => e.evidenceDate <= today);
  const inPeriod = evidenceInPeriod(evidence, periodValue, today);
  const historyByUnit = group(history, (e) => e.unitId);
  const periodByUnit = group(inPeriod, (e) => e.unitId);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const visible = new Set(subjectRows.map((r) => r.subjectId));
  const unitsBySubject = group(units, (u) => u.subjectId);

  const lessons = units.filter((u) => visible.has(u.subjectId)).map((u) => {
    const own = periodByUnit.get(u.id) ?? [];
    const questions = sum(own, "questionsCount");
    const correct = sum(own, "correctCount");
    const past = historyByUnit.get(u.id) ?? [];
    const subject = subjectById.get(u.subjectId);
    const trend = Analytics.unitTrend(past);
    return {
      id: u.id, kind: "lesson", subjectId: u.subjectId, subjectName: subject?.name ?? "", color: subject?.color ?? "DISC-BLUE",
      title: u.title, studyDate: isoDate(u.studyDate), questions, correct, ...measured(questions, correct),
      trend, trendScore: trendScore(trend), lastEvidenceDate: latest(past.map((e) => e.evidenceDate)), unitIds: [u.id], unitCount: 1,
    };
  });

  const byContent = group(lessons, (l) => `${l.subjectId}:${normalize(l.title)}`);
  const contents = [...byContent].map(([key, parts]) => {
    const [first] = parts;
    const ids = new Set(parts.map((p) => p.id));
    const past = history.filter((e) => ids.has(e.unitId));
    const questions = sum(parts, "questions");
    const correct = sum(parts, "correct");
    const trend = parts.length === 1 ? first.trend : Analytics.unitTrend(past);
    return {
      id: key, kind: "content", subjectId: first.subjectId, subjectName: first.subjectName, color: first.color, title: first.title,
      studyDate: latest(parts.map((p) => p.studyDate)), questions, correct, ...measured(questions, correct),
      trend, trendScore: trendScore(trend), lastEvidenceDate: latest(parts.map((p) => p.lastEvidenceDate)),
      unitIds: parts.map((p) => p.id), unitCount: parts.length,
    };
  });

  const subjectsOut = subjectRows.map((r) => {
    const own = unitsBySubject.get(r.subjectId) ?? [];
    const ownIds = new Set(own.map((u) => u.id));
    return {
      id: r.subjectId, kind: "subject", subjectId: r.subjectId, subjectName: r.subjectName, color: r.color,
      questions: r.totalQuestions, correct: r.totalCorrect, accuracy: r.weightedAccuracy, band: v5Band(r),
      trend: r.trend, trendScore: trendScore(r.trend), unitsCount: own.length,
      studyDate: latest(own.map((u) => isoDate(u.studyDate))),
      lastEvidenceDate: latest(history.filter((e) => ownIds.has(e.unitId)).map((e) => e.evidenceDate)),
    };
  });

  return { subjects: subjectsOut, contents, lessons };
}

function filterRows(rows, { subjectId = 0, band = "all", trend = "all", query = "" } = {}) {
  const needle = normalize(query);
  return rows.filter((r) => (!subjectId || Number(r.subjectId) === Number(subjectId))
    && (band === "all" || r.band === band)
    && (trend === "all" || r.trend?.direction === trend)
    && (!needle || normalize(`${r.subjectName} ${r.title ?? ""} ${r.studyDate ?? ""} ${brDate(r.studyDate)}`).includes(needle)));
}

// Missing values always sort last, in either direction; ties keep the original order.
export function sortRows(rows, key, ascending = true) {
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const x = a.row[key];
    const y = b.row[key];
    const missingX = x == null || x === "";
    const missingY = y == null || y === "";
    if (missingX || missingY) {
      if (missingX === missingY) return a.index - b.index;
      if (missingX) return 1;
      return -1;
    }
    const delta = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    return (ascending ? delta : -delta) || a.index - b.index;
  }).map((entry) => entry.row);
}

export function paginate(items, requestedPage = 1, size = 12) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const raw = Number(requestedPage);
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(raw) ? Math.trunc(raw) : 1));
  const offset = (page - 1) * size;
  return { items: items.slice(offset, offset + size), page, pageCount, total: items.length, first: items.length ? offset + 1 : 0, last: Math.min(items.length, offset + size) };
}

const rowsOf = (tab, m = model) => {
  if (tab === "subject") return m.subjects;
  if (tab === "unit") return m.contents;
  return m.lessons;
};

// ---- Row builders -------------------------------------------------------------------------------------------------

const subjectChip = (row) => `<span class="v5-subject" title="${esc(row.subjectName)}" style="--v5-subject-color:var(${colorVarForKey(row.color)})">${esc(row.subjectName)}</span>`;

function trendText(trend) {
  if (trend?.direction === "IMPROVING") return `+${Math.round(100 * trend.delta)} p.p.`;
  if (trend?.direction === "DECLINING") return `${Math.round(100 * trend.delta)} p.p.`;
  if (trend?.direction === "STABLE") return t("screens.stats.table.trend.stable");
  return t("screens.stats.table.trend.none");
}

// The comparison windows stay named in the tooltip; an insufficient sample says so instead of showing a number it cannot support.
function trendTitle(trend, kind) {
  const unit = kind !== "subject";
  if (!trend || trend.direction === "INSUFFICIENT" || trend.olderAccuracy == null) {
    return t(unit ? "statsView.trend.title.unit.insufficient" : "statsView.trend.title.subject.insufficient", { days: TREND_WINDOW_DAYS });
  }
  return t(unit ? "statsView.trend.title.unit" : "statsView.trend.title.subject", {
    days: TREND_WINDOW_DAYS, from: Math.round(trend.olderAccuracy), to: Math.round(trend.recentAccuracy),
    olderQuestions: trend.olderQuestions, recentQuestions: trend.recentQuestions,
  });
}

function priorityKey(band) {
  if (band === "critical") return "high";
  if (band === "attention") return "medium";
  if (band === "insufficient") return "none";
  return "follow";
}

const priorityText = (row) => t(`screens.stats.table.priority.${priorityKey(row.band)}`);

function rowLabelHtml(row, tab) {
  if (tab === "subject") {
    const key = row.unitsCount === 1 ? "screens.stats.table.lessonRegistered" : "screens.stats.table.lessonsRegistered";
    const registeredLabel = esc(t(key, { count: number(row.unitsCount) }));
    const contentsLabel = esc(t("screens.stats.table.seeContents"));
    return `<strong>${registeredLabel}</strong><small>${contentsLabel}</small>`;
  }
  let linkedLessons = "";
  if (row.unitCount > 1) {
    linkedLessons = `<small>${esc(t("screens.stats.table.linkedLessons", { count: row.unitCount }))}</small>`;
  }
  return `<strong>${esc(row.title)}</strong>${linkedLessons}`;
}

function rowHtml(row, tab) {
  const label = rowLabelHtml(row, tab);
  const date = row.studyDate ? brDate(row.studyDate) : t("screens.stats.table.noDate");
  const name = tab === "subject" ? row.subjectName : row.title;
  return `<tr data-v5-row="${row.kind}" data-key="${esc(row.id)}"><td>${subjectChip(row)}</td><td><span class="v5-content-name">${label}</span></td><td class="v5-data-muted">${esc(date)}</td><td class="v5-number">${number(row.questions)}</td><td class="v5-number">${number(row.correct)}</td><td>${badge(row)}</td><td><span class="v5-trend" data-trend="${row.trend?.direction ?? "INSUFFICIENT"}" title="${esc(trendTitle(row.trend, tab))}">${esc(trendText(row.trend))}</span></td><td><span class="v5-priority" data-band="${row.band}">${esc(priorityText(row))}</span></td><td><button type="button" class="v5-row-action" data-v5="inspect" data-kind="${row.kind}" data-id="${esc(row.id)}" aria-label="${esc(t("screens.stats.table.inspectLabel", { name }))}" title="${esc(t("screens.stats.table.inspect"))}">${icon("search")}</button></td></tr>`;
}

function sortHeaderPresentation(key) {
  if (tableState.sortKey !== key) return { ariaSort: "none", glyph: "↕" };
  if (tableState.sortAsc) return { ariaSort: "ascending", glyph: "↑" };
  return { ariaSort: "descending", glyph: "↓" };
}

function sortableHeaderHtml(label, key) {
  const presentation = sortHeaderPresentation(key);
  const buttonHtml = `<button type="button" data-v5="sort" data-value="${key}" class="v5-th-sort" aria-label="${esc(t("screens.stats.table.sortBy", { label }))}">${esc(label)}<span aria-hidden="true">${presentation.glyph}</span></button>`;
  return `<th scope="col" aria-sort="${presentation.ariaSort}">${buttonHtml}</th>`;
}

function headerHtml(tab) {
  const columns = [
    [t("screens.form.subject"), "subjectName"],
    [tab === "subject" ? t("screens.stats.table.col.lessons") : t("screens.stats.table.col.contentLesson"), tab === "subject" ? "unitsCount" : "title"],
    [t("screens.stats.table.col.lastStudy"), "studyDate"],
    [t("screens.stats.table.col.questions"), "questions"],
    [t("screens.stats.table.col.correct"), "correct"],
    [t("screens.stats.col.performance"), "accuracy"],
    [t("screens.stats.col.trend"), "trendScore"],
    [t("screens.stats.table.col.priority"), null],
    [t("screens.stats.table.col.actions"), null],
  ];
  const headers = columns.map(([label, key]) => {
    if (key) return sortableHeaderHtml(label, key);
    return `<th scope="col">${esc(label)}</th>`;
  }).join("");
  return `<tr>${headers}</tr>`;
}

function tableHtml(tab, items) {
  const body = items.map((row) => rowHtml(row, tab)).join("")
    || `<tr><td colspan="9" class="v5-empty">${esc(t("screens.stats.table.empty"))}</td></tr>`;
  return `<div class="v5-table-scroll table-scroll" tabindex="0" role="region" aria-label="${esc(t("screens.stats.table.scrollLabel"))}"><table class="v5-data-table stats-table matrix-table"><thead>${headerHtml(tab)}</thead><tbody id="${tab === "subject" ? "subject-kpi-list" : "unit-stats-list"}">${body}</tbody></table></div>`;
}

function footerRangeHtml(page, unit) {
  const placeholder = "\u0000";
  const range = t("screens.stats.table.range", { first: page.first, last: page.last, total: placeholder, unit, page: page.page, pages: page.pageCount });
  const total = `<strong>${number(page.total)}</strong>`;
  return `<span>${esc(range.replace(placeholder, total))}</span>`;
}

function footerPageButtonHtml(numberValue, currentPage) {
  const current = numberValue === currentPage;
  const className = current ? "is-current" : "";
  const ariaCurrent = current ? 'aria-current="page"' : "";
  const label = esc(t("screens.stats.table.goPage", { page: numberValue }));
  return `<button type="button" class="${className}" data-v5="page-go" data-value="${numberValue}" aria-label="${label}" ${ariaCurrent}>${numberValue}</button>`;
}

function footerHtml(tab, page) {
  const unit = t(`screens.stats.table.unit.${tab}`);
  const numbers = [...new Set([1, page.page - 1, page.page, page.page + 1, page.pageCount].filter((n) => n >= 1 && n <= page.pageCount))].sort((a, b) => a - b);
  const previousDisabled = page.page <= 1 ? "disabled" : "";
  const nextDisabled = page.page >= page.pageCount ? "disabled" : "";
  const previousLabel = esc(t("screens.stats.table.prevPage"));
  const nextLabel = esc(t("screens.stats.table.nextPage"));
  const pageButtons = numbers.map((numberValue) => footerPageButtonHtml(numberValue, page.page)).join("");
  const range = footerRangeHtml(page, unit);
  return `${range}<div class="v5-pages"><button type="button" data-v5="page-prev" aria-label="${previousLabel}" ${previousDisabled}>‹</button>${pageButtons}<button type="button" data-v5="page-next" aria-label="${nextLabel}" ${nextDisabled}>›</button></div>`;
}

function distributionHtml(subjects) {
  const counts = Object.fromEntries(BANDS.map((band) => [band, subjects.filter((s) => s.band === band).length]));
  return `<h3>${esc(t("screens.stats.table.distribution.title", { count: subjects.length }))}</h3><p class="v5-chart-note">${esc(t("screens.stats.table.distribution.note"))}</p><div class="v5-band-grid">${BANDS.map((band) => {
    const label = t(`screens.stats.table.distribution.${band}`);
    return `<button type="button" data-v5="filter-band" data-band="${band}" aria-label="${esc(t("screens.stats.table.distribution.aria", { label, count: counts[band] }))}"><i aria-hidden="true"></i><strong>${counts[band]}</strong><span>${esc(label)}</span></button>`;
  }).join("")}</div>`;
}

function detailHtml(row, lessons) {
  const list = lessons.slice().sort((a, b) => (b.studyDate ?? "").localeCompare(a.studyDate ?? ""));
  const items = list.map(detailLessonHtml).join("")
    || `<p>${esc(t("screens.stats.table.noLessons"))}</p>`;
  return `<div class="v5-detail-top">${subjectChip(row)}${badge(row)}<span>${esc(t("screens.stats.table.questionsCorrect", { questions: number(row.questions), correct: number(row.correct) }))}</span></div><p class="v5-detail-explain">${esc(t("screens.stats.table.detail.explain"))}</p><dl class="v5-detail-kpis"><div><dt>${esc(t("screens.stats.table.detail.lastAnswer"))}</dt><dd>${esc(row.lastEvidenceDate ? brDate(row.lastEvidenceDate) : t("screens.stats.table.detail.none"))}</dd></div><div><dt>${esc(t("screens.stats.col.trend"))}</dt><dd>${esc(trendText(row.trend))}</dd></div><div><dt>${esc(t("screens.stats.table.detail.linked"))}</dt><dd>${list.length}</dd></div></dl><h3>${esc(t("screens.stats.table.detail.heading"))}</h3><div class="v5-detail-lessons">${items}</div>`;
}

function detailLessonHtml(unit) {
  const date = unit.studyDate ? brDate(unit.studyDate) : t("screens.stats.table.noDate");
  const questionCount = t("screens.stats.table.questionsCount", { count: number(unit.questions) });
  const summary = `${date} · ${questionCount} · ${percent(unit.accuracy)}`;
  const title = esc(unit.title);
  const openSummary = esc(t("screens.stats.table.openSummary"));
  return `<div><span><strong>${title}</strong><small>${esc(summary)}</small></span><button type="button" class="v5-link-button" data-v5="open-unit" data-id="${unit.id}">${openSummary} ${icon("arrow")}</button></div>`;
}

// ---- CSV ----------------------------------------------------------------------------------------------------------

export function csvFrom(lines) {
  const safeText = (text) => (/^\s*[=+@-]/.test(text) ? `'${text}` : text);
  const cell = (value) => {
    const text = String(value ?? "");
    return `"${safeText(text).replace(/"/g, '""')}"`;
  };
  return `﻿${lines.map((line) => line.map(cell).join(";")).join("\r\n")}`;
}

function csvText(rows, tab) {
  const heading = ["subject", "contentLesson", "studyDate", "lastAnswer", "questions", "correct", "performance", "trend", "lessons"].map((key) => t(`screens.stats.table.csv.${key}`));
  return csvFrom([heading, ...rows.map((r) => [r.subjectName ?? "", tab === "subject" ? "" : r.title ?? "", r.studyDate ?? "", r.lastEvidenceDate ?? "", r.questions ?? 0, r.correct ?? 0, r.accuracy == null ? "" : r.accuracy.toFixed(2), r.trend?.direction ?? "INSUFFICIENT", r.unitCount ?? r.unitsCount ?? ""])]);
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Screen wiring ------------------------------------------------------------------------------------------------

const $ = (selector) => document.querySelector(selector);

export function setTableModel(next) {
  model = next ?? emptyModel();
  renderStatsTable();
}

function fillSubjectFilter() {
  const select = $("#stats-filter-subject");
  if (!select) return;
  const wanted = model.subjects.length + 1;
  if (select.options.length !== wanted || select.dataset.count !== String(model.subjects.length)) {
    select.dataset.count = String(model.subjects.length);
    select.innerHTML = subjectFilterOptionsHtml(model.subjects);
  }
  select.value = String(tableState.subjectId);
  syncSelect(select);
}

function subjectFilterOptionsHtml(subjects) {
  const allSubjects = esc(t("screens.stats.table.allSubjects", { count: subjects.length }));
  const options = subjects.map((subject) => `<option value="${subject.id}">${esc(subject.subjectName)}</option>`).join("");
  return `<option value="0">${allSubjects}</option>${options}`;
}

function syncFilterControls() {
  for (const [selector, value] of [["#stats-filter-band", tableState.band], ["#stats-filter-trend", tableState.trend], ["#stats-page-size", String(tableState.perPage)]]) {
    const select = $(selector);
    if (select && select.value !== value) {
      select.value = value;
      syncSelect(select);
    }
  }
  for (const id of ["#stats-global-search", "#stats-table-search"]) {
    const input = $(id);
    if (input && input.value !== tableState.query) input.value = tableState.query;
  }
}

function syncTableTabs() {
  for (const tab of document.querySelectorAll('#screen-stats [data-v5="tab"]')) {
    const active = tab.dataset.value === tableState.tab;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle("is-active", active);
  }
}

function renderStatsTable() {
  const body = $("#stats-body");
  if (!body) return;
  if (!SORT_KEYS[tableState.tab].has(tableState.sortKey)) {
    tableState.sortKey = "accuracy";
    tableState.sortAsc = true;
  }
  visibleRows = sortRows(filterRows(rowsOf(tableState.tab), tableState), tableState.sortKey, tableState.sortAsc);
  const page = paginate(visibleRows, tableState.page, tableState.perPage);
  tableState.page = page.page;
  fillSubjectFilter();
  syncFilterControls();
  syncTableTabs();
  body.innerHTML = tableHtml(tableState.tab, page.items);
  body.setAttribute("aria-labelledby", `tab-stats-${tableState.tab}`);
  const footer = $("#stats-table-footer");
  if (footer) footer.innerHTML = footerHtml(tableState.tab, page);
  const feedback = $("#stats-global-search-count");
  if (feedback) feedback.textContent = tableState.query ? t("screens.stats.table.searchCount", { count: number(page.total) }) : "";
  const extra = $("#stats-extra-analysis");
  if (extra) {
    extra.innerHTML = distributionHtml(model.subjects);
    extra.hidden = !tableState.advanced;
  }
  $('[data-v5="advanced"]')?.setAttribute("aria-expanded", String(tableState.advanced));
  const summary = $("#stats-summary-count");
  if (summary) summary.textContent = t("screens.stats.table.summary", { subjects: model.subjects.length, lessons: model.lessons.length, contents: model.contents.length });
}

const scrollToCard = () => $("#stats-analysis-card")?.scrollIntoView({ behavior: "smooth", block: "start" });

function detailTab(kind) {
  if (kind === "subject") return "subject";
  if (kind === "content") return "unit";
  return "lesson";
}

function detailLessons(kind, row) {
  if (kind === "subject") return model.lessons.filter((lesson) => lesson.subjectId === row.id);
  if (kind === "content") return model.lessons.filter((lesson) => row.unitIds.includes(lesson.id));
  return [row];
}

function openDetail(kind, id) {
  const tab = detailTab(kind);
  const row = rowsOf(tab).find((r) => String(r.id) === String(id));
  const dialog = $("#stats-detail-dialog");
  if (!row || !dialog) return;
  const lessons = detailLessons(kind, row);
  $("#stats-detail-title").textContent = kind === "subject" ? row.subjectName : row.title;
  $("#stats-detail-body").innerHTML = detailHtml(row, lessons);
  dialog.showModal();
}

export function focusSubject(subjectId) {
  Object.assign(tableState, { tab: "unit", subjectId: Number(subjectId), page: 1, sortKey: "accuracy", sortAsc: true, band: "all", trend: "all", query: "" });
  renderStatsTable();
  scrollToCard();
}

// Returns true when the action belongs to the table. ctx.openUnit(unitId) opens a lesson in Plano.
export function handleTableAction(button, ctx) {
  const action = button.dataset.v5;
  switch (action) {
    case "focus-subject": focusSubject(button.dataset.id); return true;
    case "see-all-subjects": case "see-best": case "see-weak":
      Object.assign(tableState, { tab: "subject", subjectId: 0, band: "all", trend: "all", query: "", page: 1, sortKey: "accuracy", sortAsc: action === "see-weak" });
      renderStatsTable();
      scrollToCard();
      return true;
    case "tab": Object.assign(tableState, { tab: button.dataset.value, page: 1, sortKey: "accuracy", sortAsc: true }); renderStatsTable(); return true;
    case "sort": {
      const key = button.dataset.value;
      if (tableState.sortKey === key) tableState.sortAsc = !tableState.sortAsc;
      else Object.assign(tableState, { sortKey: key, sortAsc: !DESCENDING_FIRST.has(key) });
      tableState.page = 1;
      renderStatsTable();
      $(`[data-v5="sort"][data-value="${key}"]`)?.focus({ preventScroll: true });
      return true;
    }
    case "page-prev": tableState.page -= 1; renderStatsTable(); return true;
    case "page-next": tableState.page += 1; renderStatsTable(); return true;
    case "page-go": tableState.page = Number(button.dataset.value); renderStatsTable(); return true;
    case "inspect": openDetail(button.dataset.kind, button.dataset.id); return true;
    case "close-detail": $("#stats-detail-dialog")?.close(); return true;
    case "open-unit":
      // The dialog stays open (with the reason) when the lesson is gone; it closes only once Plano has really opened it.
      Promise.resolve(ctx.openUnit(Number(button.dataset.id))).then((opened) => {
        const body = $("#stats-detail-body");
        body?.querySelector(".form-message")?.remove();
        if (opened) { $("#stats-detail-dialog")?.close(); return; }
        const note = document.createElement("p");
        note.className = "form-message is-error";
        note.setAttribute("role", "status");
        note.textContent = t("plan.openLesson.missing");
        body?.append(note);
      });
      return true;
    case "filter-band":
      Object.assign(tableState, { tab: "subject", band: button.dataset.band, subjectId: 0, query: "", trend: "all", page: 1 });
      renderStatsTable();
      scrollToCard();
      return true;
    case "export-table": downloadCsv(`smartlearn-analise-${tableState.tab}.csv`, csvText(visibleRows, tableState.tab)); return true;
    case "advanced": tableState.advanced = !tableState.advanced; renderStatsTable(); return true;
    default: return false;
  }
}

// change / input on the table's own controls; returns true when handled.
export function handleTableControl(target) {
  switch (target.id) {
    case "stats-filter-subject": tableState.subjectId = Number(target.value); break;
    case "stats-filter-band": tableState.band = target.value; break;
    case "stats-filter-trend": tableState.trend = target.value; break;
    case "stats-page-size": tableState.perPage = Number(target.value); break;
    case "stats-global-search": case "stats-table-search": tableState.query = target.value; break;
    default: return false;
  }
  tableState.page = 1;
  renderStatsTable();
  return true;
}
