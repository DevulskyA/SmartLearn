import { obligations } from './reviews.js';
import { planDay } from '../../../shared/daily-plan.js';

/**
 * EXPERIMENTAL (HG-14 prototype), read-only: today's plan by the minutes the student says they have. The items are the ONE required review per
 * unit (HG-09 experimental read-model). The caller supplies `perReviewMinutes` (the product holds no estimate and none is invented: without it every
 * item is UNESTIMATED) and, optionally, `exams` = { [subjectId]: 'YYYY-MM-DD' }. Weights are the prototype's named defaults, not an approved
 * priority policy. Writes nothing; no screen uses it.
 */
export function dailyPlan(db, userId, { date, timezoneOverride, availableMinutes, perReviewMinutes, exams = {} } = {}) {
  if (!Number.isFinite(availableMinutes) || availableMinutes < 0) throw new Error('availableMinutes must be a non-negative number');
  const view = obligations(db, userId, { date, timezoneOverride });
  const required = view.units.filter((u) => u.required);
  const items = required.map((u) => ({
    id: `review:${u.required.id}`,
    minutes: Number.isFinite(perReviewMinutes) ? perReviewMinutes : null,
    dueDate: u.required.dueDate,
    required: true,
    ...(exams[u.subjectId] ? { examDate: exams[u.subjectId] } : {}),
  }));
  const result = planDay({ items, availableMinutes, today: view.date });
  const unitOf = new Map(required.map((u) => [`review:${u.required.id}`, { unitId: u.unitId, unitTitle: u.unitTitle }]));
  const decorate = (x) => ({ ...x, ...unitOf.get(x.id) });
  return { date: view.date, ...result, planned: result.planned.map(decorate), deferred: result.deferred.map(decorate) };
}
