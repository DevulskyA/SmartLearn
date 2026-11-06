import { dm, splitMessage } from '../api-error-messages.js';
import { normalizeQuestionFlag, currentQuestionFlags } from '../../../shared/question-flag.js';

// "Questao com problema": the student marks a question after answering it, and can take the mark back. Pure annotation over exercise_flag_events
// (migration 040, append-only): this file never reads or writes learning_events, learning_evidence, review_tasks or exercise_attempts, so a mark can
// never change a grade, a piece of learning evidence or a statistic. The rules (reasons, comment, current state) are shared/question-flag.js.

export class QuestionFlagError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

function events(db, userId, exerciseId) {
  const rows = exerciseId === undefined
    ? db.prepare('SELECT id, exercise_id, attempt_id, action, reason, comment, created_at FROM exercise_flag_events WHERE user_id = ? ORDER BY id').all(userId)
    : db.prepare('SELECT id, exercise_id, attempt_id, action, reason, comment, created_at FROM exercise_flag_events WHERE user_id = ? AND exercise_id = ? ORDER BY id').all(userId, exerciseId);
  return rows
    .map((row) => ({ id: row.id, exerciseId: row.exercise_id, attemptId: row.attempt_id, action: row.action, reason: row.reason, comment: row.comment, createdAt: row.created_at }));
}

/** Every question the student has marked right now. */
export function list(db, userId) {
  return currentQuestionFlags(events(db, userId));
}

/**
 * Marks the question of an ANSWERED attempt (status SUBMITTED, of this student) as problematic; marking again replaces the reason and comment.
 * @returns the current mark of that question
 */
export function flagFromAttempt(db, userId, attemptId, { reason, comment } = {}, now = () => new Date()) {
  const attempt = db.prepare('SELECT a.id, a.status, v.exercise_id FROM exercise_attempts a JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id WHERE a.user_id = ? AND a.id = ?').get(userId, attemptId);
  if (!attempt) throw new QuestionFlagError('NOT_FOUND', dm('ATTEMPT_NOT_FOUND'));
  if (attempt.status !== 'SUBMITTED') throw new QuestionFlagError('VALIDATION_FAILED', dm('ATTEMPT_NOT_SUBMITTED', { attemptId }), 'attemptId');
  let normalized;
  try {
    normalized = normalizeQuestionFlag({ reason, comment });
  } catch (err) {
    if (err instanceof RangeError) throw new QuestionFlagError('VALIDATION_FAILED', err.message, err.field);
    throw err;
  }
  db.prepare("INSERT INTO exercise_flag_events (user_id, exercise_id, attempt_id, action, reason, comment, created_at) VALUES (?, ?, ?, 'FLAG', ?, ?, ?)")
    .run(userId, attempt.exercise_id, attempt.id, normalized.reason, normalized.comment, now().toISOString());
  return currentQuestionFlags(events(db, userId, attempt.exercise_id))[0];
}

/** Takes the mark back. Repeating it, or clearing a question that is not marked, changes nothing. A new CLEAR row is added only when there was a mark. */
export function clear(db, userId, exerciseId, now = () => new Date()) {
  const exercise = db.prepare('SELECT id FROM exercises WHERE user_id = ? AND id = ?').get(userId, exerciseId);
  if (!exercise) throw new QuestionFlagError('NOT_FOUND', dm('EXERCISE_NOT_FOUND'));
  if (currentQuestionFlags(events(db, userId, exerciseId)).length > 0) {
    db.prepare("INSERT INTO exercise_flag_events (user_id, exercise_id, action, created_at) VALUES (?, ?, 'CLEAR', ?)").run(userId, exerciseId, now().toISOString());
  }
  return null;
}
