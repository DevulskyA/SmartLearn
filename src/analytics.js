import { getState, TREND_DELTA_MIN } from './performance-thresholds.js';

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

function weightedAccuracy(evidence) {
  const q = sumField(evidence, 'questionsCount');
  const c = sumField(evidence, 'correctCount');
  return q > 0 ? (c / q) * 100 : null;
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
  return { direction, delta, olderAccuracy: olderAcc * 100, recentAccuracy: recentAcc * 100 };
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

// "Meu estudo está funcionando?" — answered from observable evidence only. No score, no
// mastery: how many subjects are improving / declining / stable / not comparable / without
// evidence, plus the ONE unit that most deserves attention and why. Deterministic:
// a DECLINING unit (largest fall first, then more recent-period questions) beats a unit that
// merely has items still wrong at their last attempt ("para reforçar", most items first).
// Subjects with no evidence are counted apart — never as bad performance.
export function studyVerdict(subjectRows, unitRows, reinforcementByUnit = {}) {
  const counts = { improving: 0, declining: 0, stable: 0, insufficient: 0, noEvidence: 0 };
  let totalQuestions = 0;
  for (const r of subjectRows) {
    if (!(r.totalQuestions > 0)) { counts.noEvidence += 1; continue; }
    totalQuestions += r.totalQuestions;
    const d = r.trend.direction;
    if (d === 'IMPROVING') counts.improving += 1;
    else if (d === 'DECLINING') counts.declining += 1;
    else if (d === 'STABLE') counts.stable += 1;
    else counts.insufficient += 1;
  }
  const compared = counts.improving + counts.declining + counts.stable;
  const state = totalQuestions === 0 ? 'NO_EVIDENCE'
    : compared === 0 ? 'INSUFFICIENT'
    : counts.improving > 0 && counts.declining > 0 ? 'MIXED'
    : counts.declining > 0 ? 'DECLINING'
    : counts.improving > 0 ? 'IMPROVING'
    : 'STABLE';

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

  return { state, counts, totalQuestions, attention };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Plain-language rendering of studyVerdict (pt-BR). Never says mastery/retention/score.
export function verdictText(v) {
  const { counts } = v;
  if (v.state === 'NO_EVIDENCE') {
    return { headline: 'Ainda não há evidência para dizer se seu estudo está funcionando.', detail: 'Registre questões ou faça revisões para começar a medir.' };
  }
  if (v.state === 'INSUFFICIENT') {
    return {
      headline: 'Ainda não há histórico suficiente para comparar.',
      detail: `Há ${plural(v.totalQuestions, 'questão registrada', 'questões registradas')}, mas cada período precisa de pelo menos 10 para indicar uma tendência.`,
    };
  }
  const headline = {
    IMPROVING: 'Seu desempenho está melhorando.',
    DECLINING: 'Seu desempenho está piorando.',
    STABLE: 'Seu desempenho está estável.',
    MIXED: 'Resultado misto: melhorando em umas áreas e piorando em outras.',
  }[v.state];
  const parts = [];
  if (counts.improving) parts.push(`${counts.improving} melhorando`);
  if (counts.declining) parts.push(`${counts.declining} piorando`);
  if (counts.stable) parts.push(`${counts.stable} ${counts.stable === 1 ? 'estável' : 'estáveis'}`);
  if (counts.insufficient) parts.push(`${counts.insufficient} com evidência insuficiente`);
  if (counts.noEvidence) parts.push(`${counts.noEvidence} sem evidência`);
  return { headline, detail: `Disciplinas: ${parts.join(' · ')}.` };
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
    const result = av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' });
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
    const subjectsById = new Map(subjects.map((s) => [s.id, s]));

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
        subjectName: subject?.name ?? 'Sem disciplina',
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
