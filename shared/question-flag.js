// "Questao com problema": after answering, the student can mark a question as problematic (confusing statement, doubtful answer key, content
// error, other), with an optional comment, and take the mark back. Pure and shared by the server and the local store, so both promise the same
// rules. A mark is an ANNOTATION about the question: it is never a grade, never learning evidence and never enters any statistic, so nothing in
// this file knows about outcomes or scores. Marks are kept as an append-only list of events (FLAG / CLEAR); the CURRENT state of a question is
// derived from them, which makes "unmark" a new fact instead of an erasure.

export const QUESTION_FLAG_REASONS = Object.freeze(['CONFUSING_STATEMENT', 'DOUBTFUL_ANSWER_KEY', 'CONTENT_ERROR', 'OTHER']);
export const QUESTION_FLAG_COMMENT_MAX = 500;

/** @returns {{ reason: string, comment: string|null }}  throws RangeError (with .field) when the reason is unknown or the comment is too long */
export function normalizeQuestionFlag({ reason, comment } = {}) {
  if (!QUESTION_FLAG_REASONS.includes(reason)) throw Object.assign(new RangeError(`reason must be one of ${QUESTION_FLAG_REASONS.join(', ')}`), { field: 'reason' });
  if (comment !== undefined && comment !== null && typeof comment !== 'string') throw Object.assign(new RangeError('comment must be text'), { field: 'comment' });
  const text = (comment ?? '').trim();
  if (text.length > QUESTION_FLAG_COMMENT_MAX) throw Object.assign(new RangeError(`comment must have at most ${QUESTION_FLAG_COMMENT_MAX} characters`), { field: 'comment' });
  return { reason, comment: text === '' ? null : text };
}

/**
 * The questions that are marked NOW.
 * @param events  every event, any order: { id, exerciseId, action: 'FLAG'|'CLEAR', attemptId?, reason?, comment?, createdAt }
 * @returns [{ exerciseId, attemptId, reason, comment, flaggedAt }]  the latest event of each question decides; a CLEAR removes it. Oldest mark first (by event order, which never ties).
 */
export function currentQuestionFlags(events) {
  const latest = new Map();
  for (const event of [...events].sort((a, b) => a.id - b.id)) latest.set(event.exerciseId, event);
  return [...latest.values()]
    .filter((event) => event.action === 'FLAG')
    .sort((a, b) => a.id - b.id)
    .map((event) => ({ exerciseId: event.exerciseId, attemptId: event.attemptId ?? null, reason: event.reason, comment: event.comment ?? null, flaggedAt: event.createdAt }));
}
