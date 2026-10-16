// T45: pure, deterministic, explainable study priorities. Same contract as
// evidence-profile.js: explicit inputs (`today` is passed in, never read from
// the clock), no DB access, no mutation, and no mastery verdict — it reports
// what was OBSERVED (with sample sizes and reason codes) and how the work is
// ordered. It is a recalculable VIEW: it never changes the fixed review
// schedule and never writes evidence.
//
// Two separate signals, deliberately never summed (a practice session that
// wrote an aggregate evidence row AND item-level attempts would otherwise be
// counted twice):
//   - aggregate `learning_evidence` (volume-weighted accuracy over a recent
//     window; EXTERNAL rows are self-reported and stay distinguishable), and
//   - the attempt ledger's "wrong at the last attempt" items (reinforcement).
// Absent evidence is a state of its own (accuracy null), never a coerced 0.

export const PRIORITIES_POLICY_VERSION = 1;
export const RECENT_WINDOW_DAYS = 30;
export const MIN_SAMPLE_QUESTIONS = 10;
// Same value as the client's THRESHOLDS.ADEQUATE (src/performance-thresholds.js);
// a test pins the equality so the two cannot drift apart silently.
export const WEAK_BELOW_PCT = 65;
export const MAX_WEAK_SUGGESTIONS = 5;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new TypeError('today must be an explicit YYYY-MM-DD local date');
  }
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86_400_000);
}

const round1 = (n) => Math.round(n * 10) / 10;

export function buildPriorities(
  { today, units = [], reviews = [], evidence = [], reinforcementByUnit = {} } = {},
  { windowDays = RECENT_WINDOW_DAYS, minSampleQuestions = MIN_SAMPLE_QUESTIONS, weakBelowPct = WEAK_BELOW_PCT, maxWeak = MAX_WEAK_SUGGESTIONS } = {},
) {
  assertDate(today);
  const from = addDays(today, -(windowDays - 1));

  const everSeen = new Set();
  const sampleByUnit = new Map();
  for (const row of evidence) {
    if (!(row.questionsCount > 0)) continue;
    everSeen.add(row.unitId);
    if (row.evidenceDate < from || row.evidenceDate > today) continue;
    const s = sampleByUnit.get(row.unitId) ?? { questions: 0, correct: 0, bySource: {} };
    s.questions += row.questionsCount;
    s.correct += row.correctCount;
    const src = s.bySource[row.type] ?? { questions: 0, correct: 0 };
    src.questions += row.questionsCount;
    src.correct += row.correctCount;
    s.bySource[row.type] = src;
    sampleByUnit.set(row.unitId, s);
  }

  function evidenceOf(unitId) {
    const s = sampleByUnit.get(unitId);
    if (!s) {
      return { status: everSeen.has(unitId) ? 'NONE_IN_WINDOW' : 'NONE', windowDays, from, to: today, questions: 0, correct: 0, accuracyPct: null, bySource: {} };
    }
    return {
      status: s.questions >= minSampleQuestions ? 'SUFFICIENT' : 'INSUFFICIENT',
      windowDays, from, to: today,
      questions: s.questions,
      correct: s.correct,
      accuracyPct: round1((s.correct / s.questions) * 100),
      bySource: s.bySource,
      rawAccuracy: (s.correct / s.questions) * 100,
    };
  }

  function signalOf(unitId) {
    const e = evidenceOf(unitId);
    const { rawAccuracy, ...publicEvidence } = e;
    const weak = e.status === 'SUFFICIENT' && rawAccuracy < weakBelowPct;
    const reinforceCount = (reinforcementByUnit[unitId] ?? []).length;
    return { evidence: publicEvidence, weak, reinforceCount };
  }

  const unitsById = new Map(units.map((u) => [u.id, u]));

  const dueRows = reviews
    .filter((r) => !r.completedAt && r.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);

  const due = dueRows.map((r) => {
    const kind = r.dueDate < today ? 'OVERDUE' : 'DUE_TODAY';
    const { evidence: e, weak, reinforceCount } = signalOf(r.unitId);
    const reasonCodes = [kind];
    if (reinforceCount > 0) reasonCodes.push('ITEMS_TO_REINFORCE');
    if (e.status === 'NONE') reasonCodes.push('NO_EVIDENCE_YET');
    else if (e.status === 'NONE_IN_WINDOW') reasonCodes.push('NO_RECENT_EVIDENCE');
    else if (e.status === 'INSUFFICIENT') reasonCodes.push('INSUFFICIENT_SAMPLE');
    else if (weak) reasonCodes.push('LOW_RECENT_ACCURACY');
    const unit = unitsById.get(r.unitId);
    return {
      kind,
      reviewTaskId: r.id,
      unitId: r.unitId,
      unitTitle: r.unitTitle ?? unit?.title ?? null,
      subjectId: r.subjectId ?? unit?.subjectId ?? null,
      subjectName: r.subjectName ?? unit?.subjectName ?? null,
      dueDate: r.dueDate,
      daysOverdue: daysBetween(r.dueDate, today),
      reasonCodes,
      reinforceCount,
      evidence: e,
    };
  });

  const dueUnitIds = new Set(due.map((d) => d.unitId));
  const weakPractice = [];
  for (const unit of units) {
    if (dueUnitIds.has(unit.id)) continue;
    const { evidence: e, weak, reinforceCount } = signalOf(unit.id);
    if (!weak && reinforceCount === 0) continue;
    const reasonCodes = [];
    if (weak) reasonCodes.push('LOW_RECENT_ACCURACY');
    if (reinforceCount > 0) reasonCodes.push('ITEMS_TO_REINFORCE');
    weakPractice.push({
      unitId: unit.id,
      unitTitle: unit.title,
      subjectId: unit.subjectId,
      subjectName: unit.subjectName,
      reasonCodes,
      reinforceCount,
      evidence: e,
    });
  }
  weakPractice.sort((a, b) => (a.evidence.accuracyPct ?? Infinity) - (b.evidence.accuracyPct ?? Infinity)
    || b.reinforceCount - a.reinforceCount
    || a.unitId - b.unitId);

  return {
    policyVersion: PRIORITIES_POLICY_VERSION,
    asOf: today,
    window: { days: windowDays, from, to: today },
    due,
    weakPractice: weakPractice.slice(0, maxWeak),
  };
}
