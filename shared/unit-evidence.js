// EXPERIMENTAL (knowledge-and-gaps component, reversible, NOT wired into the product; granularity and links to questions stay a student decision,
// so the smallest existing unit - the lesson/unit - is the only grain used). Pure: it reads ledger events and says what was OBSERVED, with how
// much evidence. It never says "mastered" and never infers a level: the vocabulary is INSUFFICIENT | GAP_SIGNAL | NO_GAP_SIGNAL.
//
// event = { id, unitId, exerciseVersionId, kind: 'ATTEMPT'|'CORRECTION', correctsEventId, outcome: 'CORRECT'|'INCORRECT'|'UNKNOWN',
//           assistanceUsed: 'NONE'|'HINT'|'PARTIAL_SOLUTION'|'SOLUTION'|'UNKNOWN', occurredAt }

/** Upper bound of the 95% Wilson score interval for k successes in n trials. */
export function wilsonUpper(k, n) {
  if (n === 0) return 1;
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  return (p + (z * z) / (2 * n) + z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
}

export const MIN_DISTINCT_QUESTIONS = 3;
export const MIN_ATTEMPTS = 5;
export const GAP_BELOW = 0.7;

/** Too little evidence is INSUFFICIENT whatever the accuracy; a gap SIGNAL needs the upper end of the interval below the line. */
export function cautiousState({ attempts, correct, distinct }) {
  if (distinct < MIN_DISTINCT_QUESTIONS || attempts < MIN_ATTEMPTS) return 'INSUFFICIENT';
  return wilsonUpper(correct, attempts) < GAP_BELOW ? 'GAP' : 'OK';
}

/** The outcome that stands for an attempt event: the latest CORRECTION of it (corrections are new events; the original is never edited). */
function effectiveOutcomes(events) {
  const latestCorrection = new Map();
  for (const e of events) {
    if (e.kind === 'CORRECTION' && e.correctsEventId != null) {
      const prev = latestCorrection.get(e.correctsEventId);
      if (!prev || e.id > prev.id) latestCorrection.set(e.correctsEventId, e);
    }
  }
  return events.filter((e) => e.kind === 'ATTEMPT').map((e) => ({ ...e, outcome: latestCorrection.get(e.id)?.outcome ?? e.outcome }));
}

/** Observed evidence per unit: the grain is the existing learning unit. */
export function unitEvidence(events) {
  return groupEvidence(events, (e) => e.unitId).map(({ key, ...rest }) => ({ unitId: key, ...rest })).sort((a, b) => a.unitId - b.unitId);
}

/**
 * The same observed-evidence summary for ANY grouping the caller can SUSTAIN (e.g. a section of the source). `keyOf(attempt)` returns the group
 * key, or null/undefined to leave the attempt out (an attempt that cannot be attributed is never forced into a group).
 */
export function groupEvidence(events, keyOf) {
  const byKey = new Map();
  for (const attempt of effectiveOutcomes(events)) {
    const key = keyOf(attempt);
    if (key === null || key === undefined) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(attempt);
  }
  return [...byKey.entries()].map(([unitId, list]) => {
    const known = list.filter((a) => a.outcome !== 'UNKNOWN');
    const independent = known.filter((a) => a.assistanceUsed === 'NONE');
    const correct = independent.filter((a) => a.outcome === 'CORRECT').length;
    const distinct = new Set(independent.map((a) => a.exerciseVersionId)).size;
    const sorted = [...list].sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || a.id - b.id);
    return {
      key: unitId,
      attempts: list.length,
      independent: { attempts: independent.length, correct, distinctQuestions: distinct },
      assisted: known.filter((a) => a.assistanceUsed !== 'NONE' && a.assistanceUsed !== 'UNKNOWN').length,
      assistanceUnknown: known.filter((a) => a.assistanceUsed === 'UNKNOWN').length,
      outcomeUnknown: list.length - known.length,
      signal: cautiousState({ attempts: independent.length, correct, distinct }) === 'GAP' ? 'GAP_SIGNAL'
        : cautiousState({ attempts: independent.length, correct, distinct }) === 'OK' ? 'NO_GAP_SIGNAL' : 'INSUFFICIENT',
      recent: sorted.slice(-5).map((a) => a.outcome),
    };
  });
}
