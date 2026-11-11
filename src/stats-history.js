// Estatísticas, "Histórico de exercícios" (V7.2): search, discipline filter, six sortable columns, 12 per page, CSV.
// Rows are the real completed exercises from Stats.calculate; nothing is recomputed here.
import { t } from "./i18n/index.js";
import { syncSelect } from "./select-ui.js";
import { colorVarForKey, getState, MIN_SAMPLE_QUESTIONS } from "./performance-thresholds.js";
import { csvFrom, downloadCsv, normalize, paginate, sortRows } from "./stats-table.js";
import { bandLabel, esc, number, percent } from "./stats-v5.js";

const PER_PAGE = 12;
export const historyState = { query: "", subjectId: 0, sortKey: "date", sortAsc: false, page: 1 };
const COLUMNS = [["date", "screens.stats.history.col.date"], ["subjectName", "screens.stats.history.col.subject"], ["title", "screens.stats.history.col.content"], ["questions", "screens.stats.history.col.questions"], ["correct", "screens.stats.history.col.correct"], ["accuracy", "screens.stats.history.col.result"]];

let rows = [];
let openExercise = () => {};
let visible = [];

const brDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const $ = (selector) => document.querySelector(selector);

export function buildHistoryRows(exercises, units, subjects) {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  return exercises.map((exercise) => {
    const unit = unitById.get(exercise.unitId);
    const subject = subjectById.get(unit?.subjectId);
    return {
      id: exercise.id, exercise, date: String(exercise.evidenceDate ?? "").slice(0, 10), subjectId: subject?.id ?? 0, subjectName: exercise.subjectName,
      color: subject?.color ?? "DISC-BLUE", title: exercise.title, type: exercise.type, questions: exercise.questionsCount, correct: exercise.correctCount, accuracy: exercise.scorePercent,
    };
  });
}

export function setHistory(next, onOpen) {
  rows = next;
  openExercise = onOpen;
  renderHistory();
}

function typeLabel(type) {
  const key = `screens.stats.history.type.${type}`;
  const label = t(key);
  return label === key ? "" : label;
}

// The percentage wears the same band colour as every other Estatísticas table (contrato cromático V7.2, no green).
// Fewer than MIN_SAMPLE_QUESTIONS questions is "Amostra insuficiente": neutral colour, never a confident band.
const BAND_BY_STATE = { CRITICAL: "critical", ATTENTION: "attention", ADEQUATE: "adequate", STRONG: "strong" };
function gradeHtml(row) {
  const enough = row.accuracy != null && (row.questions ?? 0) >= MIN_SAMPLE_QUESTIONS;
  const band = enough ? BAND_BY_STATE[getState(row.accuracy, row.questions)] ?? "insufficient" : "insufficient";
  const title = enough ? bandLabel(band) : t(row.questions ? "screens.stats.v5.band.insufficient" : "screens.stats.v5.noEvidence");
  return `<span class="v5-grade" data-band="${band}" title="${esc(title)}">${percent(row.accuracy)}</span>`;
}

function rowHtml(row) {
  const caption = typeLabel(row.type);
  return `<tr class="exercise-row" tabindex="0" data-evidence-id="${esc(row.id)}"><td>${esc(brDate(row.date))}</td><td><span class="subject-chip" style="--subject-color:var(${colorVarForKey(row.color)})">${esc(row.subjectName)}</span></td><td>${esc(row.title)}${caption ? `<span class="sl-block sl-caption">${esc(caption)}</span>` : ""}</td><td>${row.questions == null ? "—" : number(row.questions)}</td><td>${number(row.correct)}</td><td>${gradeHtml(row)}</td></tr>`;
}

export function renderHistory() {
  const body = $("#exercise-notes-body");
  if (!body) return;
  const needle = normalize(historyState.query);
  visible = sortRows(rows.filter((r) => (!historyState.subjectId || r.subjectId === historyState.subjectId)
    && (!needle || normalize(`${r.title} ${r.subjectName} ${r.date} ${brDate(r.date)}`).includes(needle))), historyState.sortKey, historyState.sortAsc);
  const page = paginate(visible, historyState.page, PER_PAGE);
  historyState.page = page.page;
  body.innerHTML = page.items.map(rowHtml).join("");
  const empty = $("#exercise-notes-empty");
  if (empty) empty.hidden = visible.length > 0;

  for (const th of document.querySelectorAll("#stats-history-table th[data-history-key]")) {
    const key = th.dataset.historyKey;
    const active = key === historyState.sortKey;
    th.setAttribute("aria-sort", active ? (historyState.sortAsc ? "ascending" : "descending") : "none");
    th.querySelector(".sl-sort-glyph").textContent = active ? (historyState.sortAsc ? "↑" : "↓") : "↕";
  }
  const select = $("#stats-history-subject");
  if (select && select.options.length !== new Set(rows.map((r) => r.subjectId)).size + 1) {
    const subjects = [...new Map(rows.map((r) => [r.subjectId, r.subjectName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    select.innerHTML = `<option value="0">${esc(t("screens.filter.allSubjects"))}</option>${subjects.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join("")}`;
    select.value = String(historyState.subjectId);
    syncSelect(select);
  }
  const count = $("#evidence-count");
  if (count) count.textContent = t("screens.stats.history.range", { first: page.first, last: page.last, total: number(page.total), page: page.page, pages: page.pageCount });
  $('[data-history="prev"]')?.toggleAttribute("disabled", page.page <= 1);
  $('[data-history="next"]')?.toggleAttribute("disabled", page.page >= page.pageCount);
}

export function historyCsv() {
  const heading = COLUMNS.map(([, key]) => t(key));
  return csvFrom([heading, ...visible.map((r) => [brDate(r.date), r.subjectName, r.title, r.questions ?? "", r.correct, r.accuracy == null ? "" : Number(r.accuracy).toFixed(1), typeLabel(r.type)])]);
}

// Delegated wiring on the history panel; returns nothing, safe to call once.
export function wireHistory() {
  const panel = $("#stats-history-panel");
  if (!panel) return;
  panel.addEventListener("click", (event) => {
    const sort = event.target.closest("[data-history-sort]");
    if (sort) {
      const key = sort.dataset.historySort;
      if (historyState.sortKey === key) historyState.sortAsc = !historyState.sortAsc;
      else Object.assign(historyState, { sortKey: key, sortAsc: key === "subjectName" || key === "title" });
      historyState.page = 1;
      renderHistory();
      return;
    }
    const pager = event.target.closest("[data-history]");
    if (pager && !pager.disabled) {
      historyState.page += pager.dataset.history === "next" ? 1 : -1;
      renderHistory();
      return;
    }
    if (event.target.closest("#stats-export")) {
      downloadCsv("smartlearn-historico.csv", historyCsv());
      return;
    }
    const row = event.target.closest("tr[data-evidence-id]");
    if (row) openExercise(rows.find((r) => String(r.id) === row.dataset.evidenceId)?.exercise);
  });
  panel.addEventListener("keydown", (event) => {
    const row = event.target.closest?.("tr[data-evidence-id]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openExercise(rows.find((r) => String(r.id) === row.dataset.evidenceId)?.exercise);
    }
  });
  panel.addEventListener("input", (event) => {
    if (event.target.id !== "stats-history-search") return;
    historyState.query = event.target.value;
    historyState.page = 1;
    renderHistory();
  });
  panel.addEventListener("change", (event) => {
    if (event.target.id !== "stats-history-subject") return;
    historyState.subjectId = Number(event.target.value);
    historyState.page = 1;
    renderHistory();
  });
}
