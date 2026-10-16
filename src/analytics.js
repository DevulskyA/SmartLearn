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

// Rows without a lastEvidence date are excluded by a period filter (there's
// nothing recent to include), never shown as if they matched.
export function filterByPeriod(results, periodValue, today) {
  if (!periodValue) return results;
  const days = periodValue === 'last-30' ? 30 : periodValue === 'last-90' ? 90 : 365;
  const cutoff = subtractDays(today, days);
  return results.filter((r) => r.lastEvidence?.evidenceDate != null && r.lastEvidence.evidenceDate >= cutoff);
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

// Evolution chart data (Estatísticas): per subject, accuracy in percent for each calendar month ("YYYY-MM") that has evidence,
// null where a subject has none. `periodMonths` > 0 keeps the last N months counted from `today` (UTC month arithmetic);
// 0 keeps everything. `subjectFilter` is a subject id as a string, "" for all. Pure: the chart drawing stays in app.js.
export function monthlyAccuracySeries(evidence, units, subjects, { subjectFilter = '', periodMonths = 6, today } = {}) {
  const cutoff = periodMonths > 0
    ? (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - periodMonths); return d.toISOString().slice(0, 7); })()
    : '0000-01';
  const unitToSubject = new Map(units.map((u) => [u.id, u.subjectId]));
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  const dataBySubject = new Map();
  for (const ev of evidence) {
    const month = ev.evidenceDate.slice(0, 7);
    if (month < cutoff) continue;
    const subjectId = unitToSubject.get(ev.unitId);
    if (!subjectId) continue;
    if (subjectFilter && String(subjectId) !== subjectFilter) continue;
    if (!dataBySubject.has(subjectId)) dataBySubject.set(subjectId, new Map());
    const monthMap = dataBySubject.get(subjectId);
    if (!monthMap.has(month)) monthMap.set(month, { q: 0, c: 0 });
    const m = monthMap.get(month);
    m.q += ev.questionsCount;
    m.c += ev.correctCount;
  }
  if (dataBySubject.size === 0) return { months: [], series: [] };

  const months = [...new Set([...dataBySubject.values()].flatMap((mm) => [...mm.keys()]))].sort();
  const series = [];
  for (const [subjectId, monthMap] of dataBySubject) {
    const points = months.map((m) => {
      const d = monthMap.get(m);
      return d && d.q > 0 ? (d.c / d.q) * 100 : null;
    });
    series.push({ subject: subjectsById.get(subjectId), points, subjectId });
  }
  return { months, series };
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
