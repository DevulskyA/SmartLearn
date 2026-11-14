// BANK PRACTICE: extra questions for a lesson, drawn from the student's OWN accepted questions of OTHER lessons that match it by text.
// Read-only, calls no model and spends no credit. It is PRACTICE, not review: the questions come from other lessons, so they are never
// attached to this lesson's review task (an attempt with a reviewTaskId must belong to that task's lesson, attempts.js `start`); answering
// them starts ordinary attempts with no review task and leaves the review schedule untouched.
import { openPrivateBank, recentlyExposedIds } from './private-bank.js';

export const BANK_PRACTICE_DEFAULT = 5;
export const BANK_PRACTICE_MAX = 10;

/**
 * @returns {{ lesson, bank, items: Array<{exerciseId, unitId, unitTitle, question, itemType, needsVerification}> }} or null when the lesson
 * does not belong to this account. Questions of the lesson itself, recently shown ones (14 days, as in review) and problem-flagged or
 * archived ones (never in the bank) are left out. Ordered by text relevance to the lesson title.
 */
export function bankPracticeFor(db, userId, unitId, { limit = BANK_PRACTICE_DEFAULT, now = new Date(), repeatAfterDays = 14 } = {}) {
  const lesson = db.prepare('SELECT id, title FROM learning_units WHERE user_id = ? AND id = ?').get(userId, unitId);
  if (!lesson) return null;
  const take = Math.min(Math.max(Math.trunc(limit) || BANK_PRACTICE_DEFAULT, 1), BANK_PRACTICE_MAX);
  const corpus = openPrivateBank(db, userId);
  const exposed = recentlyExposedIds(db, userId, { now, repeatAfterDays });
  // Over-fetch: the lesson's own questions are dropped after the search, and they would otherwise crowd the answer out.
  const found = corpus.search({ query: lesson.title, excludeIds: exposed, limit: BANK_PRACTICE_MAX * 4 });
  const items = found
    .filter((c) => c.item.unit_id !== unitId && c.score > 0)
    .slice(0, take)
    .map((c) => ({
      exerciseId: Number(c.item.id.slice(2)), unitId: c.item.unit_id, unitTitle: c.item.topic, question: c.item.stem,
      itemType: c.item.item_type, needsVerification: c.item.needs_verification === true,
    }));
  return { lesson: { id: lesson.id, title: lesson.title }, bank: corpus.size, items };
}
