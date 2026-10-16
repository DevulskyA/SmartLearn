import { buildPriorities } from '../domain/priorities.js';
import { get as getSettings } from './settings.js';
import { localDateString, list as listReviews } from './reviews.js';
import { list as listUnits } from './learning-units.js';
import { list as listSubjects } from './subjects.js';
import { list as listEvidence } from './evidence.js';
import { reinforcementByUnit } from './attempts.js';

export class PrioritiesError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

/**
 * Read-only composition of the owned inputs for the pure priorities view.
 * `date` is the caller's local day (same contract as /agenda); when omitted it
 * is derived from the user's timezone. Nothing here writes or reschedules.
 * Units of inactive (archived) subjects are never SUGGESTED as weak practice,
 * but a review that is genuinely due is still reported (same as /agenda).
 */
export function get(db, userId, { date } = {}) {
  if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)))) {
    throw new PrioritiesError('VALIDATION_FAILED', 'Data inválida (use AAAA-MM-DD).', 'date');
  }
  const today = date ?? localDateString(new Date(), getSettings(db, userId).timezone);
  const subjects = new Map(listSubjects(db, userId).map((s) => [s.id, s]));
  const units = listUnits(db, userId)
    .filter((u) => subjects.get(u.subjectId)?.isActive)
    .map((u) => ({ id: u.id, title: u.title, subjectId: u.subjectId, subjectName: subjects.get(u.subjectId).name }));
  return buildPriorities({
    today,
    units,
    reviews: listReviews(db, userId),
    evidence: listEvidence(db, userId),
    reinforcementByUnit: reinforcementByUnit(db, userId),
  });
}
