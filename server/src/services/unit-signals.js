import { unitEvidence } from '../../../shared/unit-evidence.js';

/**
 * EXPERIMENTAL (knowledge-and-gaps component), read-only: what the ledger OBSERVED per unit, with how much evidence. Independent attempts only
 * feed the accuracy; assisted and unknown ones are counted apart; the vocabulary is INSUFFICIENT | GAP_SIGNAL | NO_GAP_SIGNAL, never a level.
 * Writes nothing. The grain is the existing unit; no subtopic entity exists or is created. No screen uses it.
 */
export function unitSignals(db, userId) {
  const rows = db.prepare(`
    SELECT e.id, e.unit_id AS unitId, e.exercise_version_id AS exerciseVersionId, e.kind, e.corrects_event_id AS correctsEventId,
           e.outcome, e.assistance_used AS assistanceUsed, e.occurred_at AS occurredAt, u.title AS unitTitle
    FROM learning_events e JOIN learning_units u ON u.user_id = e.user_id AND u.id = e.unit_id
    WHERE e.user_id = ?
  `).all(userId);
  const titles = new Map(rows.map((r) => [r.unitId, r.unitTitle]));
  return { units: unitEvidence(rows).map((u) => ({ ...u, unitTitle: titles.get(u.unitId) })) };
}
