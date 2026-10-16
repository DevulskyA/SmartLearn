// T32: pure, deterministic evidence profile over a set of already-fetched
// learning_events (design.md: "Rebuild pure functions with explicit
// inputs, clock/cutoff and policy version: ... derive evidence profile").
// No DB access, no wall-clock reads, no mastery verdict — this reports
// what was OBSERVED, with supporting event IDs, never a pass/fail claim.
// The experimental mastery/error challenger (T33) is a separate, disabled-
// by-default module; nothing here feeds a "mastered" label.

export const EVIDENCE_PROFILE_POLICY_VERSION = 1;

const INDEPENDENT_ASSISTANCE = 'NONE';

/**
 * Classifies one already-effective (post-correction) event into one of
 * four buckets. Assisted correctness is never independent evidence (the
 * old core's ELC-X08 lesson: "exposure/solution reveal never counts as
 * independent performance") — assistance dominates the classification
 * regardless of outcome. UNKNOWN outcome or UNKNOWN assistance means the
 * observation itself is uninformative, not a coerced NONE (MX10).
 */
function classify(event) {
  if (event.assistanceUsed === 'UNKNOWN' || event.outcome === 'UNKNOWN') return 'UNKNOWN';
  if (event.assistanceUsed !== INDEPENDENT_ASSISTANCE) return 'ASSISTED';
  return event.outcome === 'CORRECT' ? 'INDEPENDENT_CORRECT' : 'INDEPENDENT_INCORRECT';
}

/**
 * Collapses duplicate/out-of-order input down to one effective event per
 * attempt: highest sequence wins (a CORRECTION always has a higher
 * sequence than what it corrects, per the schema's own CHECK, so this is
 * never ambiguous), and exact duplicate eventIds collapse to one. Order of
 * the input array must never affect the result (ELC-X02's duplicate-event
 * risk, restated as an invariance requirement).
 */
function effectiveEvents(events) {
  const byId = new Map();
  for (const e of events) byId.set(e.eventId, e); // exact dup eventId -> last write wins, same object either way
  const byAttempt = new Map();
  for (const e of byId.values()) {
    const current = byAttempt.get(e.attemptId);
    if (!current || e.sequence > current.sequence) byAttempt.set(e.attemptId, e);
  }
  return [...byAttempt.values()];
}

/**
 * Builds a transparent evidence profile as of `asOf` (an ISO timestamp,
 * explicit — never `new Date()` read internally). Events with
 * `occurredAt > asOf` are excluded, so a profile is always a reproducible
 * point-in-time reconstruction, not "whatever exists right now".
 *
 * `events` is a flat array already scoped to one owner+unit (or
 * competency) by the caller — this function has no owner/scope concept of
 * its own, by design (pure, no DB access). Each event:
 *   { eventId, attemptId, sequence, outcome, assistanceUsed, occurredAt,
 *     exerciseVersionId, confidence?, isTransfer? }
 * `isTransfer` is OPTIONAL and must come from already-reviewed exercise
 * metadata upstream — this function never infers transfer from a numeric
 * distance or a client string (design.md), so its absence means "not
 * tracked", not "not transfer".
 */
export function buildEvidenceProfile(events, { asOf, policyVersion = EVIDENCE_PROFILE_POLICY_VERSION } = {}) {
  if (typeof asOf !== 'string' || Number.isNaN(Date.parse(asOf))) {
    throw new TypeError('asOf deve ser uma data ISO válida.');
  }

  const inScope = (events ?? []).filter(e => e && typeof e.occurredAt === 'string' && Date.parse(e.occurredAt) <= Date.parse(asOf));
  const effective = effectiveEvents(inScope).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  const independentCorrect = [];
  const independentIncorrect = [];
  const assisted = [];
  const unknown = [];
  for (const e of effective) {
    const bucket = classify(e);
    if (bucket === 'INDEPENDENT_CORRECT') independentCorrect.push(e);
    else if (bucket === 'INDEPENDENT_INCORRECT') independentIncorrect.push(e);
    else if (bucket === 'ASSISTED') assisted.push(e);
    else unknown.push(e);
  }

  // Conflicting independent evidence: both an independent CORRECT and an
  // independent INCORRECT observation exist for this scope. This is
  // reported as a fact with both sides' event IDs — never auto-resolved
  // into a single verdict (ELC-X05/X09: a later success does not erase an
  // earlier confident failure, and vice versa).
  const hasConflictingIndependentEvidence = independentCorrect.length > 0 && independentIncorrect.length > 0;
  const latestIndependent = [...independentCorrect, ...independentIncorrect].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null;

  // Time separation is reported as a plain computed fact (actual elapsed
  // hours between the very first observation in scope and each independent
  // CORRECT event), never compared against a magic threshold here — the
  // old core's 24h cutoff is a policy-layer heuristic (T33), not a fact
  // this transparent profile asserts (design.md: "not validated
  // constants"). A single event has no separation to report.
  const firstObservedAt = effective.length > 0 ? effective[0].occurredAt : null;
  const delayedIndependentCorrect = firstObservedAt
    ? independentCorrect
        .filter(e => e.occurredAt !== firstObservedAt)
        .map(e => ({ eventId: e.eventId, hoursSinceFirstObservation: (Date.parse(e.occurredAt) - Date.parse(firstObservedAt)) / 3_600_000 }))
    : [];

  // Transfer evidence only exists if an upstream, already-reviewed source
  // marked an event isTransfer:true — never inferred here.
  const transferEvents = effective.filter(e => e.isTransfer === true);
  const independentTransferCorrect = transferEvents.filter(e => classify(e) === 'INDEPENDENT_CORRECT');

  return Object.freeze({
    policyVersion,
    asOf,
    totalObservedCount: effective.length,
    independentCorrectCount: independentCorrect.length,
    independentIncorrectCount: independentIncorrect.length,
    assistedCount: assisted.length,
    unknownCount: unknown.length,
    missingObservationEventIds: unknown.map(e => e.eventId),
    independentCorrectEventIds: independentCorrect.map(e => e.eventId),
    independentIncorrectEventIds: independentIncorrect.map(e => e.eventId),
    assistedEventIds: assisted.map(e => e.eventId),
    hasConflictingIndependentEvidence,
    latestIndependentOutcome: latestIndependent ? { eventId: latestIndependent.eventId, outcome: latestIndependent.outcome, occurredAt: latestIndependent.occurredAt } : null,
    delayedIndependentCorrect,
    transferEvidence: {
      observedCount: transferEvents.length,
      independentCorrectCount: independentTransferCorrect.length,
      eventIds: independentTransferCorrect.map(e => e.eventId),
    },
  });
}
