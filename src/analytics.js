import { getState, TREND_DELTA_MIN, VERDICT_MIXED_VOLUME_SHARE_MIN } from './performance-thresholds.js';
import { compareText } from './i18n/format.js';
import { t } from './i18n/index.js';

function getLocalDateValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sumField(arr, field) {
  return arr.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
}

function windowEvidence(evidence, fromDate, toDate) {
  return evidence.filter((e) => e.evidenceDate >= fromDate && e.evidenceDate <= toDate);
}

export function subtractDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// TREND CONTRACT (operational rule, not a cognitive law). Only observable history counts
// (learning_evidence rows: date + questions + correct; a retest right after feedback writes
// none, so it cannot inflate a trend). A trend compares an OLDER period with a RECENT one,
// each POOLED as total_correct / total_questions — never a mean of per-row percentages, so
// a 1/1 row weighs 1 question and a 50/100 row weighs 100. When the comparison is not
// honest (a period under `minQuestions`, or nothing to compare) the answer is INSUFFICIENT:
// "I don't know", never 0%, never "stable".
function comparePeriods(olderEvidence, recentEvidence, minQuestions, minDelta) {
  const olderQ = sumField(olderEvidence, 'questionsCount');
  const recentQ = sumField(recentEvidence, 'questionsCount');
  if (olderQ < minQuestions || recentQ < minQuestions) {
    return { direction: 'INSUFFICIENT', delta: null };
  }
  const olderAcc = sumField(olderEvidence, 'correctCount') / olderQ;
  const recentAcc = sumField(recentEvidence, 'correctCount') / recentQ;
  const delta = recentAcc - olderAcc;
  const direction = delta > minDelta ? 'IMPROVING'
    : delta < -minDelta ? 'DECLINING'
    : 'STABLE';
  // olderQuestions/recentQuestions: the evidence volume this comparison actually rests on (VERDICT-1 weighs by it).
  return { direction, delta, olderAccuracy: olderAcc * 100, recentAccuracy: recentAcc * 100, olderQuestions: olderQ, recentQuestions: recentQ };
}

// Subject trend: last 30 days vs the 30 before, min 10 questions in each
export function subjectTrend(recentEvidence, previousEvidence, minQuestions = 10) {
  return comparePeriods(previousEvidence, recentEvidence, minQuestions, TREND_DELTA_MIN);
}

// Unit trend: a unit's evidence is sparse, so instead of calendar windows its own history is
// split by DATE — the older half of the distinct evidence days vs the newer half (rows on the
// same day are one moment and never straddle the split) — min 10 questions in each half.
export function unitTrend(unitEvidence, minQuestions = 10, threshold = 0.05) {
  const rows = (unitEvidence ?? [])
    .filter((e) => e.evidenceDate != null && Number(e.questionsCount) > 0)
    .slice()
    .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || (a.id ?? 0) - (b.id ?? 0));
  const dates = [...new Set(rows.map((e) => e.evidenceDate))];
  if (dates.length < 2) return { direction: 'INSUFFICIENT', delta: null };
  const firstRecentDate = dates[Math.floor(dates.length / 2)];
  return comparePeriods(
    rows.filter((e) => e.evidenceDate < firstRecentDate),
    rows.filter((e) => e.evidenceDate >= firstRecentDate),
    minQuestions,
    threshold,
  );
}

// Questions a comparable trend rests on. Every comparable trend carries both periods (each at least the
// minimum), so this is always positive for IMPROVING / DECLINING / STABLE.
function comparedVolume(trend) {
  return (Number(trend.olderQuestions) || 0) + (Number(trend.recentQuestions) || 0);
}

// Cautious-first order for an exact volume tie.
const TIE_ORDER = ['DECLINING', 'STABLE', 'IMPROVING'];

function aggregateDirection(volumes) {
  const { improving, declining, stable, compared } = volumes;
  const min = VERDICT_MIXED_VOLUME_SHARE_MIN * compared;
  if (improving > 0 && declining > 0 && improving >= min && declining >= min) return 'MIXED';
  const byDirection = { DECLINING: declining, STABLE: stable, IMPROVING: improving };
  return TIE_ORDER.reduce((best, d) => (byDirection[d] > byDirection[best] ? d : best), TIE_ORDER[0]);
}

// "Meu estudo está funcionando?" — answered from observable evidence only. No score, no
// mastery: how many subjects are improving / declining / stable / not comparable / without
// evidence, plus the ONE unit that most deserves attention and why.
//
// VERDICT-1: the AGGREGATE state weighs each comparable subject by the questions its comparison
// rests on (older + recent period), not one vote per subject. The state is "MIXED" only when
// improving AND declining each hold at least VERDICT_MIXED_VOLUME_SHARE_MIN of the compared
// volume; otherwise it is the direction holding the most volume, and on an exact tie the more
// cautious label wins (DECLINING > STABLE > IMPROVING) so the headline never overstates progress.
// "Insufficient" and "no evidence" subjects never vote for a direction. Per-subject
// classifications (counts) and the attention unit are NOT affected by the weighting. Deterministic:
// a DECLINING unit (largest fall first, then more recent-period questions) beats a unit that
// merely has items still wrong at their last attempt ("para reforçar", most items first).
// Subjects with no evidence are counted apart — never as bad performance.
export function studyVerdict(subjectRows, unitRows, reinforcementByUnit = {}) {
  const counts = { improving: 0, declining: 0, stable: 0, insufficient: 0, noEvidence: 0 };
  const volumes = { improving: 0, declining: 0, stable: 0, compared: 0 };
  let totalQuestions = 0;
  for (const r of subjectRows) {
    if (!(r.totalQuestions > 0)) { counts.noEvidence += 1; continue; }
    totalQuestions += r.totalQuestions;
    const d = r.trend.direction;
    const volume = comparedVolume(r.trend);
    if (d === 'IMPROVING') { counts.improving += 1; volumes.improving += volume; }
    else if (d === 'DECLINING') { counts.declining += 1; volumes.declining += volume; }
    else if (d === 'STABLE') { counts.stable += 1; volumes.stable += volume; }
    else counts.insufficient += 1;
  }
  volumes.compared = volumes.improving + volumes.declining + volumes.stable;
  const compared = counts.improving + counts.declining + counts.stable;
  const state = totalQuestions === 0 ? 'NO_EVIDENCE'
    : compared === 0 ? 'INSUFFICIENT'
    : aggregateDirection(volumes);

  const reinforceOf = (u) => (reinforcementByUnit[u.unitId] ?? []).length;
  const describe = (u, reason) => ({
    reason,
    unitId: u.unitId,
    unitTitle: u.unitTitle,
    subjectName: u.subjectName,
    olderAccuracy: u.trend.olderAccuracy ?? null,
    recentAccuracy: u.trend.recentAccuracy ?? null,
    reinforceCount: reinforceOf(u),
  });
  const declining = unitRows
    .filter((u) => u.trend.direction === 'DECLINING')
    .sort((a, b) => a.trend.delta - b.trend.delta || b.totalQuestions - a.totalQuestions);
  const reinforce = unitRows
    .filter((u) => reinforceOf(u) > 0)
    .sort((a, b) => reinforceOf(b) - reinforceOf(a) || b.totalQuestions - a.totalQuestions);
  const attention = declining.length > 0 ? describe(declining[0], 'DECLINING')
    : reinforce.length > 0 ? describe(reinforce[0], 'REINFORCE')
    : null;

  return { state, counts, volumes, totalQuestions, attention };
}

// Fixed pt-BR thousands separator ("1.020"): independent of the runtime's ICU data.
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Singular only for exactly 1 (the catalog plural rule would also treat 0 as singular, so the choice is explicit here).
const questions = (n) => (n === 1
  ? t('analytics.verdict.questions.one', { count: thousands(n) })
  : t('analytics.verdict.questions.other', { count: thousands(n) }));

// Plain-language rendering of studyVerdict (pt-BR). Never says mastery/retention/score.
export function verdictText(v) {
  const { counts } = v;
  if (v.state === 'NO_EVIDENCE') {
    return { headline: t('analytics.verdict.none.headline'), detail: t('analytics.verdict.none.detail') };
  }
  if (v.state === 'INSUFFICIENT') {
    return {
      headline: t('analytics.verdict.insufficient.headline'),
      detail: v.totalQuestions === 1
        ? t('analytics.verdict.insufficient.detail.one', { count: v.totalQuestions })
        : t('analytics.verdict.insufficient.detail.other', { count: v.totalQuestions }),
    };
  }
  const headline = {
    IMPROVING: () => t('analytics.verdict.improving.headline'),
    DECLINING: () => t('analytics.verdict.declining.headline'),
    STABLE: () => t('analytics.verdict.stable.headline'),
    MIXED: () => t('analytics.verdict.mixed.headline'),
  }[v.state]?.();
  // Each direction shows the questions it rests on (VERDICT-1), so a headline carried by a few
  // questions is visible as such.
  const { volumes } = v;
  const parts = [];
  if (counts.improving) parts.push(t('analytics.verdict.part.improving', { count: counts.improving, questions: questions(volumes.improving) }));
  if (counts.declining) parts.push(t('analytics.verdict.part.declining', { count: counts.declining, questions: questions(volumes.declining) }));
  if (counts.stable) {
    const params = { count: counts.stable, questions: questions(volumes.stable) };
    parts.push(counts.stable === 1 ? t('analytics.verdict.part.stable.one', params) : t('analytics.verdict.part.stable.other', params));
  }
  if (counts.insufficient) parts.push(t('analytics.verdict.part.insufficient', { count: counts.insufficient }));
  if (counts.noEvidence) parts.push(t('analytics.verdict.part.noEvidence', { count: counts.noEvidence }));
  return { headline, detail: t('analytics.verdict.detail.subjects', { parts: parts.join(' · ') }) };
}

// ---------------------------------------------------------------------------
// ESTATÍSTICAS: UMA ÚNICA BASE DE EVIDÊNCIAS POR PERÍODO
// The header, the discipline table, the distribution and the evolution chart all derive from
// evidenceInPeriod(): the same valid rows, the same window. A period never filters finished
// rows by "last activity" (that kept old questions in the totals); it selects evidence first and
// every number is recomputed from it. The average is POOLED (sum correct / sum questions), never a
// mean of percentages. A discipline with no evidence in the period is "no evidence", never 0%.
// ---------------------------------------------------------------------------
const PERIOD_DAYS = { 'last-30': 30, 'last-90': 90, 'last-365': 365 };
export const TREND_WINDOW_DAYS = 30;

const dayNumber = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

// First day (ISO) of the period, N days ending today inclusive; null for "any period".
export function periodStart(periodValue, today) {
  const days = PERIOD_DAYS[periodValue];
  return days ? subtractDays(today, days - 1) : null;
}

// Only observable, internally consistent rows: a date, at least one question, 0 <= correct <= questions.
export function validEvidence(evidence) {
  return (evidence ?? []).filter((e) => {
    const q = Number(e.questionsCount);
    const c = Number(e.correctCount);
    return typeof e.evidenceDate === 'string' && e.evidenceDate.length >= 10
      && Number.isInteger(q) && q > 0 && Number.isInteger(c) && c >= 0 && c <= q;
  });
}

export function evidenceInPeriod(evidence, periodValue, today) {
  const from = periodStart(periodValue, today);
  return validEvidence(evidence).filter((e) => e.evidenceDate <= today && (from == null || e.evidenceDate >= from));
}

// Subject rows for the period. Performance, volume and last activity come from the period's evidence only;
// the TREND keeps its own explicit windows (last 30 days vs the 30 before, relative to today), so it is
// not truncated by a short period. Archived subjects appear only when they have evidence in the period.
export function periodSubjectRows(evidence, units, subjects, { periodValue = '', today = getLocalDateValue() } = {}) {
  const valid = validEvidence(evidence).filter((e) => e.evidenceDate <= today);
  const trendBySubject = new Map(Analytics.bySubject(valid, units, subjects, today).map((r) => [r.subjectId, r.trend]));
  const inPeriod = evidenceInPeriod(evidence, periodValue, today);
  const activeById = new Map(subjects.map((s) => [s.id, s.isActive !== false]));
  return Analytics.bySubject(inPeriod, units, subjects, today)
    .filter((r) => activeById.get(r.subjectId) || r.totalQuestions > 0)
    .map((r) => ({ ...r, trend: trendBySubject.get(r.subjectId) ?? r.trend }));
}

// Header numbers, taken from the very rows the table shows (so they always reconcile).
export function periodSummary(rows) {
  const totalQuestions = sumField(rows, 'totalQuestions');
  const totalCorrect = sumField(rows, 'totalCorrect');
  return {
    totalQuestions,
    totalCorrect,
    average: totalQuestions > 0 ? (100 * totalCorrect) / totalQuestions : null,
    subjectCount: rows.length,
    withEvidence: rows.filter((r) => r.totalQuestions > 0).length,
  };
}

// Whole percentages that always add up to 100 (largest remainder); all zeros when there is nothing to split.
export function largestRemainderPercents(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (100 * c) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floors[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; floors[i] += 1; left -= 1; }
  return floors;
}

// Canonical bands (getState), worst first; counts are disciplines.
export const PERFORMANCE_BAND_ORDER = ['CRITICAL', 'ATTENTION', 'ADEQUATE', 'STRONG', 'NO_EVIDENCE'];
export function performanceDistribution(rows) {
  const counts = PERFORMANCE_BAND_ORDER.map((state) => rows.filter((r) => r.state === state).length);
  const percents = largestRemainderPercents(counts);
  return PERFORMANCE_BAND_ORDER.map((state, i) => ({ state, count: counts[i], percent: percents[i] }));
}

// General evolution: pooled accuracy per time bucket. Buckets are anchored to the period start and
// placed by DATE (offset in days), so a quiet stretch looks quiet. A bucket without questions is not a
// point, and a gap between two non-adjacent buckets breaks the line into separate segments.
export function evolutionSeries(evidence, units, { periodValue = '', today = getLocalDateValue(), subjectIds = null } = {}) {
  const unitToSubject = new Map(units.map((u) => [u.id, u.subjectId]));
  const rows = evidenceInPeriod(evidence, periodValue, today).filter((e) => {
    const sid = unitToSubject.get(e.unitId);
    return sid != null && (subjectIds == null || subjectIds.has(sid));
  });
  if (rows.length === 0) return { from: null, to: today, spanDays: 0, bucketDays: 0, points: [], segments: [] };
  const from = periodStart(periodValue, today) ?? rows.reduce((min, e) => (e.evidenceDate < min ? e.evidenceDate : min), today);
  const spanDays = dayNumber(today) - dayNumber(from) + 1;
  const bucketDays = spanDays <= 35 ? 3 : spanDays <= 100 ? 7 : 30;
  const buckets = new Map();
  for (const e of rows) {
    const index = Math.floor((dayNumber(e.evidenceDate) - dayNumber(from)) / bucketDays);
    const b = buckets.get(index) ?? { index, questions: 0, correct: 0 };
    b.questions += Number(e.questionsCount);
    b.correct += Number(e.correctCount);
    buckets.set(index, b);
  }
  const points = [...buckets.values()].sort((a, b) => a.index - b.index).map((b) => {
    const startOffset = b.index * bucketDays;
    const lengthDays = Math.min(bucketDays, spanDays - startOffset);
    return {
      index: b.index,
      from: subtractDays(from, -startOffset),
      to: subtractDays(from, -(startOffset + lengthDays - 1)),
      offset: startOffset + (lengthDays - 1) / 2,
      questions: b.questions,
      correct: b.correct,
      accuracy: (100 * b.correct) / b.questions,
    };
  });
  const segments = [];
  for (const p of points) {
    const last = segments[segments.length - 1];
    if (last && p.index - last[last.length - 1].index === 1) last.push(p);
    else segments.push([p]);
  }
  return { from, to: today, spanDays, bucketDays, points, segments };
}

// Header-click sorting for the Estatísticas matrix tables (Por disciplina /
// Por conteúdo). One {key,dir} pair drives every supported column.
export function sortMatrixRows(results, { key, dir }) {
  const cmp = (get) => (a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir === 'asc' ? av - bv : bv - av;
  };
  // String comparator for the two functionally-restored sort modes
  // (P0-3: "Disciplina" alphabetical + "Última atividade" recency, both
  // previously available via a now-removed dropdown). Nulls sort last
  // regardless of direction, matching the numeric comparator's own
  // established no-evidence-last convention above.
  const cmpString = (get) => (a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const result = compareText(av, bv, { sensitivity: 'base' });
    return dir === 'asc' ? result : -result;
  };
  if (key === 'practice') return [...results].sort(cmp((r) => r.totalQuestions));
  if (key === 'trend') {
    const order = { DECLINING: 0, INSUFFICIENT: 1, STABLE: 2, IMPROVING: 3 };
    return [...results].sort(cmp((r) => order[r.trend.direction] ?? 1));
  }
  // Alphabetical identity: subjectName alone for Por disciplina rows;
  // subjectName + unitTitle for Por conteúdo rows (unitTitle is undefined
  // on subject rows, so this degrades to subjectName-only there).
  if (key === 'identity') {
    return [...results].sort(cmpString((r) => `${r.subjectName ?? ''} ${r.unitTitle ?? ''}`.trim()));
  }
  // Recency: most/least recent real evidence date, ISO strings sort
  // lexicographically the same as chronologically.
  if (key === 'recency') {
    return [...results].sort(cmpString((r) => r.lastEvidence?.evidenceDate ?? null));
  }
  return [...results].sort(cmp((r) => r.weightedAccuracy)); // "performance"
}

export const Analytics = {
  // Returns performance summary per subject
  bySubject(evidence, units, subjects, today = getLocalDateValue()) {
    const unitsById = new Map(units.map((u) => [u.id, u]));

    const evidenceBySubject = new Map();
    for (const e of evidence) {
      const unit = unitsById.get(e.unitId);
      if (!unit) continue;
      const subjectId = unit.subjectId;
      if (!evidenceBySubject.has(subjectId)) evidenceBySubject.set(subjectId, []);
      evidenceBySubject.get(subjectId).push(e);
    }

    const results = [];
    for (const subject of subjects) {
      const subjectEvidenceSorted = (evidenceBySubject.get(subject.id) ?? [])
        .slice()
        .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id);
      const subjectEvidence = subjectEvidenceSorted;
      const totalQ = sumField(subjectEvidence, 'questionsCount');
      const totalC = sumField(subjectEvidence, 'correctCount');
      const acc = totalQ > 0 ? (totalC / totalQ) * 100 : null;

      const recentFrom = subtractDays(today, 29);
      const prevFrom = subtractDays(today, 59);
      const prevTo = subtractDays(today, 30);
      const recentEv = windowEvidence(subjectEvidence, recentFrom, today);
      const prevEv = windowEvidence(subjectEvidence, prevFrom, prevTo);
      const trend = subjectTrend(recentEv, prevEv);
      const lastEvidence = subjectEvidenceSorted.length > 0
        ? subjectEvidenceSorted[subjectEvidenceSorted.length - 1]
        : null;

      results.push({
        subjectId: subject.id,
        subjectName: subject.name,
        color: subject.color ?? 'DISC-BLUE',
        totalQuestions: totalQ,
        totalCorrect: totalC,
        weightedAccuracy: acc,
        state: getState(acc, totalQ),
        trend,
        recentQuestions: sumField(recentEv, 'questionsCount'),
        evidenceCount: subjectEvidence.length,
        lastEvidence,
      });
    }
    return results.sort((a, b) => {
      if (a.state === 'NO_EVIDENCE' && b.state !== 'NO_EVIDENCE') return 1;
      if (b.state === 'NO_EVIDENCE' && a.state !== 'NO_EVIDENCE') return -1;
      if (a.weightedAccuracy == null) return 1;
      if (b.weightedAccuracy == null) return -1;
      return a.weightedAccuracy - b.weightedAccuracy;
    });
  },

  // Returns performance summary per learning unit
  byUnit(evidence, units, subjects) {
    const subjectsById = new Map(subjects.map((s) => [s.id, s]));
    const evidenceByUnit = new Map();
    for (const e of evidence) {
      if (!evidenceByUnit.has(e.unitId)) evidenceByUnit.set(e.unitId, []);
      evidenceByUnit.get(e.unitId).push(e);
    }

    const results = [];
    for (const unit of units) {
      const unitEvidence = (evidenceByUnit.get(unit.id) ?? [])
        .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id);
      const totalQ = sumField(unitEvidence, 'questionsCount');
      const totalC = sumField(unitEvidence, 'correctCount');
      const acc = totalQ > 0 ? (totalC / totalQ) * 100 : null;
      const scoresSequence = unitEvidence
        .filter((e) => e.questionsCount > 0)
        .map((e) => (e.correctCount / e.questionsCount) * 100);
      const trend = unitTrend(unitEvidence);
      const lastEvidence = unitEvidence.length > 0 ? unitEvidence[unitEvidence.length - 1] : null;
      const subject = subjectsById.get(unit.subjectId);

      results.push({
        unitId: unit.id,
        unitTitle: unit.title,
        subjectId: unit.subjectId,
        subjectName: subject?.name ?? t('analytics.subject.none'),
        color: subject?.color ?? 'DISC-BLUE',
        totalQuestions: totalQ,
        weightedAccuracy: acc,
        state: getState(acc, totalQ),
        trend,
        scoresSequence,
        lastEvidence,
        evidenceCount: unitEvidence.length,
      });
    }
    return results;
  },

  // Returns state for given weighted accuracy and question count
  state: getState,

  subjectTrend,
  unitTrend,
  studyVerdict,
};
