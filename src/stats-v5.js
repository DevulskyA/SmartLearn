// Estatísticas, composição V5 da V7.2: Panorama por disciplina e "Onde preciso melhorar".
// Pure view builders over the rows the screen already computes with Analytics (periodSubjectRows): no calculation lives here.
import { t } from "./i18n/index.js";
import { MIN_SAMPLE_QUESTIONS } from "./performance-thresholds.js";

const PAGE = 8;
const BAND_BY_STATE = { CRITICAL: "critical", ATTENTION: "attention", ADEQUATE: "adequate", STRONG: "strong" };
const ICONS = {
  chart: "M3 17h4v-7H3v7Zm7 0h4V6h-4v11Zm7 0h4V3h-4v14Z",
  target: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  warning: "M12 2 1.5 21h21L12 2Zm0 6v6m0 3h.01",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  search: "m20 20-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  award: "M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm-3 11-1.5 9L12 19l4.5 3L15 13",
};

export const statsOverviewState = { page: 1, order: "best" };

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const icon = (name) => `<svg class="v5-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
export const number = (value) => Number(value ?? 0).toLocaleString("pt-BR");
export const percent = (value) => (value == null ? "—" : `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function bandLabel(key) {
  return t(`screens.stats.v5.band.${key}`);
}

// Below the sample minimum a discipline is "pouca evidência", whatever its percentage (one rule for every presentation).
export function v5Band(row) {
  if (row.weightedAccuracy == null || row.totalQuestions < MIN_SAMPLE_QUESTIONS) return "insufficient";
  return BAND_BY_STATE[row.state] ?? "insufficient";
}

const view = (row) => ({
  id: row.subjectId,
  name: row.subjectName,
  accuracy: row.weightedAccuracy,
  questions: row.totalQuestions,
  band: v5Band(row),
});

export function badge(row) {
  return `<span class="v5-grade" data-band="${row.band}" title="${esc(bandLabel(row.band))} — ${number(row.questions)} ${esc(t("screens.stats.v5.questions"))}">${percent(row.accuracy)}</span>`;
}

function meter(row) {
  const value = Math.max(0, Math.min(100, row.accuracy ?? 0));
  const valueAttr = row.accuracy == null ? `aria-valuetext="${esc(t("screens.stats.v5.noEvidence"))}"` : `aria-valuenow="${Math.round(value)}"`;
  return `<span class="v5-meter" data-band="${row.band}" role="meter" aria-label="${esc(t("screens.stats.v5.meterLabel", { name: row.name }))}" aria-valuemin="0" aria-valuemax="100" ${valueAttr}><span style="width:${value}%"></span></span>`;
}

const rankBest = (rows) => rows.filter((r) => r.accuracy != null && r.questions >= MIN_SAMPLE_QUESTIONS).sort((a, b) => b.accuracy - a.accuracy || b.questions - a.questions || a.name.localeCompare(b.name, "pt-BR"));
const rankWorst = (rows) => [...rankBest(rows)].reverse();

export function renderOverview(subjectRows) {
  const rows = subjectRows.map(view);
  const ranked = statsOverviewState.order === "worst" ? rankWorst(rows) : rankBest(rows);
  const list = ranked.concat(rows.filter((r) => !ranked.includes(r))); // every subject appears, including the ones without enough evidence
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE));
  statsOverviewState.page = Math.min(Math.max(1, statsOverviewState.page), pageCount);
  const start = (statsOverviewState.page - 1) * PAGE;
  const items = list.slice(start, start + PAGE);
  const first = list.length ? start + 1 : 0;
  const last = start + items.length;
  const rowsHtml = items.map((r, i) => `<li><button type="button" class="v5-overview-row" data-v5="focus-subject" data-id="${r.id}" title="${esc(t("screens.stats.v5.focusTitle", { name: r.name }))}"><span class="v5-rank">${first + i}</span><span class="v5-overview-name">${esc(r.name)}</span>${meter(r)}${badge(r)}<span class="v5-questions">${number(r.questions)} ${esc(t("screens.stats.v5.questions"))}</span></button></li>`).join("")
    || `<li class="v5-empty">${esc(t("screens.stats.v5.overview.empty"))}</li>`;
  return `<div class="v5-card-head"><div><span class="v5-heading-icon">${icon("chart")}</span><h2 id="v5-overview-title">${esc(t("screens.stats.v5.overview.title"))}</h2><p>${esc(t("screens.stats.v5.overview.lede"))}</p></div><button type="button" class="v5-link-button" data-v5="see-all-subjects">${esc(t("screens.stats.v5.overview.seeAll", { count: list.length }))} ${icon("arrow")}</button></div>
<div class="v5-ranking-options"><label for="v5-ranking-order">${esc(t("screens.stats.v5.overview.order"))}</label><select id="v5-ranking-order" aria-label="${esc(t("screens.stats.v5.overview.orderLabel"))}"><option value="best" ${statsOverviewState.order === "best" ? "selected" : ""}>${esc(t("screens.stats.v5.overview.best"))}</option><option value="worst" ${statsOverviewState.order === "worst" ? "selected" : ""}>${esc(t("screens.stats.v5.overview.worst"))}</option></select></div>
<ol class="v5-overview-rows" start="${first || 1}">${rowsHtml}</ol>
<div class="v5-overview-footer"><span>${esc(t("screens.stats.v5.overview.range", { first, last, total: list.length }))}</span><div><button type="button" data-v5="overview-prev" aria-label="${esc(t("screens.stats.v5.overview.prev"))}" ${statsOverviewState.page <= 1 ? "disabled" : ""}>‹</button><span>${statsOverviewState.page} / ${pageCount}</span><button type="button" data-v5="overview-next" aria-label="${esc(t("screens.stats.v5.overview.next"))}" ${statsOverviewState.page >= pageCount ? "disabled" : ""}>›</button></div></div>`;
}

export function renderMiniRanks(subjectRows) {
  const rows = subjectRows.map(view);
  const best = rankBest(rows).slice(0, 3);
  const weak = rankWorst(rows).filter((r) => r.accuracy < 80).slice(0, 3);
  const list = (items) => items.map((r, i) => `<button type="button" class="v5-mini-row" data-v5="focus-subject" data-id="${r.id}"><span class="v5-mini-index">${i + 1}</span><span>${esc(r.name)}</span>${badge(r)}</button>`).join("") || `<p class="v5-empty">${esc(t("screens.stats.v5.mini.empty"))}</p>`;
  const card = (iconName, title, lede, items, action, label) => `<section class="v5-card v5-mini-card"><div class="v5-card-head"><div><span class="v5-heading-icon">${icon(iconName)}</span><h2>${esc(title)}</h2><p>${esc(lede)}</p></div></div><div>${list(items)}</div><button type="button" class="v5-subtle-button" data-v5="${action}">${esc(label)} ${icon("arrow")}</button></section>`;
  return `<div class="v5-side-rank">${card("award", t("screens.stats.v5.mini.bestTitle"), t("screens.stats.v5.mini.bestLede"), best, "see-best", t("screens.stats.v5.mini.bestAll"))}${card("target", t("screens.stats.v5.mini.weakTitle"), t("screens.stats.v5.mini.weakLede"), weak, "see-weak", t("screens.stats.v5.mini.weakAll"))}</div>`;
}

export function renderAttention(subjectRows) {
  const shown = rankWorst(subjectRows.map(view)).filter((r) => r.accuracy < 80).slice(0, 4);
  const rowsHtml = shown.map((r) => `<button type="button" class="v5-attention-row" data-v5="focus-subject" data-id="${r.id}"><span class="v5-attention-symbol" data-band="${r.band}">${icon("warning")}</span><span><strong>${esc(r.name)}</strong><small>${number(r.questions)} ${esc(t("screens.stats.v5.questions"))} · ${esc(bandLabel(r.band))}</small></span>${badge(r)}</button>`).join("")
    || `<p class="v5-empty">${esc(t("screens.stats.v5.attention.empty"))}</p>`;
  return `<div class="v5-card-head"><div><span class="v5-heading-icon">${icon("target")}</span><h2 id="v5-attention-title">${esc(t("screens.stats.v5.attention.title"))}</h2><p>${esc(t("screens.stats.v5.attention.lede"))}</p></div></div>
<div class="v5-attention-rows">${rowsHtml}</div>
<button type="button" data-v5="see-weak" class="v5-text-link">${esc(t("screens.stats.v5.attention.seeRanking"))} ${icon("arrow")}</button>`;
}
