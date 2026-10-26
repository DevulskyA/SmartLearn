import { dm, splitMessage } from '../api-error-messages.js';

const DIRECT_TYPES = new Set(['INITIAL_PRACTICE', 'EXTERNAL']);

export class EvidenceError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

// Earliest day the ledger accepts: anything before is a typo, not study history. The upper bound is "tomorrow"
// in UTC, because the client sends its LOCAL day and UTC+14 is already a calendar day ahead of the server.
export const EVIDENCE_DATE_MIN = '2000-01-01';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar day in YYYY-MM-DD form inside [EVIDENCE_DATE_MIN, UTC tomorrow of `now`].
 * "Parseable" is not enough: V8 rolls 2026-02-31 over to March, so the round trip must give the same string back.
 */
export function isAcceptableEvidenceDate(value, now = () => new Date()) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const tomorrow = new Date(now().getTime() + 86_400_000).toISOString().slice(0, 10);
  return value >= EVIDENCE_DATE_MIN && value <= tomorrow;
}

export const EVIDENCE_DATE_MESSAGE = 'evidenceDate é obrigatória e deve ser um dia real (YYYY-MM-DD), a partir de 2000-01-01 e não no futuro.';

// A row is current unless a LATER row of the same user exists for the same review task (NULL never equals NULL, so
// practice/external/exam rows are always current). Pure SQL over the existing columns: no schema change.
const IS_CURRENT_SQL = `NOT EXISTS (
  SELECT 1 FROM learning_evidence later
  WHERE later.user_id = le.user_id AND later.review_task_id = le.review_task_id AND later.id > le.id
)`;

function findOwnedUnit(db, userId, unitId) {
  return db.prepare('SELECT id FROM learning_units WHERE user_id = ? AND id = ?').get(userId, unitId);
}

function toDto(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    reviewTaskId: row.review_task_id,
    type: row.type,
    questionsCount: row.questions_count,
    correctCount: row.correct_count,
    // Unknown performance (no questions reported) is a real, distinct state —
    // it must never be conflated with a proven-zero score.
    score: row.questions_count != null ? row.correct_count / row.questions_count : null,
    evidenceDate: row.evidence_date,
    createdAt: row.created_at,
    // Only listings know it (computed in list()). false = a LATER REVIEW row exists for the same review task
    // (complete -> reopen -> complete): the older row is kept as history but is no longer the task's result.
    ...(row.is_current != null ? { isCurrent: row.is_current === 1 } : {}),
    // Only listings know it (LEFT JOIN below). The TYPE stays INITIAL_PRACTICE; "origin" only says a corrected
    // exam produced the row, so the history can tell an exam from a study pass. Absent = not from an exam.
    ...(row.from_exam ? { origin: 'EXAM' } : {}),
  };
}

/**
 * Direct evidence reporting accepts only INITIAL_PRACTICE and EXTERNAL —
 * REVIEW evidence is a side effect of reviews.complete() alone (design.md:
 * "REVIEW evidence comes through completion"). This function has no way to
 * write type='REVIEW' at all — the check happens before any other
 * validation, so there is no path that could accidentally let it through.
 *
 * `attemptIds` (021-practice-evidence-attempt-link.sql) is the
 * INITIAL_PRACTICE counterpart of REVIEW's review_task_id link: the caller
 * (Study Now) already knows exactly which server-owned attempts belonged to
 * this session, so it hands them over once, here, instead of the server
 * guessing by unit/time-window. Every id is verified owned, SUBMITTED,
 * same-unit, and not already linked to another evidence/review before being
 * claimed — a bad id is rejected, never silently dropped, so a caller can't
 * end up with fewer linked attempts than it thinks it asked for.
 */
export function create(db, userId, { unitId, type, questionsCount, correctCount, evidenceDate, attemptIds }, now = () => new Date()) {
  if (!DIRECT_TYPES.has(type)) {
    throw new EvidenceError('VALIDATION_FAILED', 'type deve ser INITIAL_PRACTICE ou EXTERNAL. Evidência REVIEW só é criada ao concluir uma revisão.', 'type');
  }
  if (!findOwnedUnit(db, userId, unitId)) throw new EvidenceError('NOT_FOUND', dm('UNIT_NOT_FOUND'));

  const hasQuestions = questionsCount !== undefined && questionsCount !== null;
  if (hasQuestions) {
    if (!Number.isInteger(questionsCount) || questionsCount <= 0) {
      throw new EvidenceError('VALIDATION_FAILED', 'questionsCount deve ser um inteiro positivo.', 'questionsCount');
    }
    if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > questionsCount) {
      throw new EvidenceError('VALIDATION_FAILED', 'correctCount deve ser um inteiro entre 0 e questionsCount.', 'correctCount');
    }
  } else if (correctCount !== undefined && correctCount !== null) {
    throw new EvidenceError('VALIDATION_FAILED', 'correctCount não pode ser informado sem questionsCount.', 'correctCount');
  }

  if (!isAcceptableEvidenceDate(evidenceDate, now)) {
    throw new EvidenceError('VALIDATION_FAILED', EVIDENCE_DATE_MESSAGE, 'evidenceDate');
  }

  const ids = Array.isArray(attemptIds) ? [...new Set(attemptIds)] : [];
  if (ids.length > 0) {
    if (type !== 'INITIAL_PRACTICE') {
      throw new EvidenceError('VALIDATION_FAILED', 'attemptIds só é aceito para type INITIAL_PRACTICE.', 'attemptIds');
    }
    if (!ids.every((id) => Number.isInteger(id))) {
      throw new EvidenceError('VALIDATION_FAILED', 'attemptIds deve conter apenas inteiros.', 'attemptIds');
    }
    for (const attemptId of ids) {
      const attempt = db.prepare('SELECT * FROM exercise_attempts WHERE user_id = ? AND id = ?').get(userId, attemptId);
      if (!attempt) throw new EvidenceError('NOT_FOUND', `Tentativa ${attemptId} não encontrada.`, 'attemptIds');
      if (attempt.unit_id !== unitId) throw new EvidenceError('VALIDATION_FAILED', `Tentativa ${attemptId} pertence a outra aula.`, 'attemptIds');
      if (attempt.status !== 'SUBMITTED') throw new EvidenceError('VALIDATION_FAILED', `Tentativa ${attemptId} ainda não foi finalizada.`, 'attemptIds');
      if (attempt.review_task_id != null) throw new EvidenceError('VALIDATION_FAILED', `Tentativa ${attemptId} já pertence a uma revisão.`, 'attemptIds');
      if (attempt.evidence_id != null) throw new EvidenceError('VALIDATION_FAILED', `Tentativa ${attemptId} já está vinculada a outra evidência.`, 'attemptIds');
    }
  }

  const createdAt = now().toISOString();
  const run = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO learning_evidence (user_id, unit_id, review_task_id, type, questions_count, correct_count, evidence_date, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(userId, unitId, type, hasQuestions ? questionsCount : null, hasQuestions ? correctCount : null, evidenceDate, createdAt);

    const evidenceId = result.lastInsertRowid;
    const linkAttempt = db.prepare('UPDATE exercise_attempts SET evidence_id = ? WHERE user_id = ? AND id = ?');
    for (const attemptId of ids) linkAttempt.run(evidenceId, userId, attemptId);

    return evidenceId;
  });

  return toDto(db.prepare('SELECT * FROM learning_evidence WHERE user_id = ? AND id = ?').get(userId, run()));
}

/**
 * Owned unit/date filters — unit ownership is checked when unitId is given.
 *
 * By default only CURRENT evidence is returned (TG-02): a REVIEW row is superseded when a later REVIEW row exists
 * for the same review task (complete -> reopen -> complete), so every aggregate that sums this list (Stats,
 * analytics, priorities) counts a re-completed review once. Nothing is updated or deleted: superseded rows stay
 * in the ledger and come back flagged `isCurrent: false` with `includeSuperseded`. Rows without a review task
 * (practice, external, exams) are never superseded.
 */
export function list(db, userId, { unitId, dateFrom, dateTo, includeSuperseded = false } = {}) {
  if (unitId !== undefined && !findOwnedUnit(db, userId, unitId)) throw new EvidenceError('NOT_FOUND', dm('UNIT_NOT_FOUND'));

  const clauses = ['le.user_id = ?'];
  const params = [userId];
  if (unitId !== undefined) { clauses.push('le.unit_id = ?'); params.push(unitId); }
  if (dateFrom) { clauses.push('le.evidence_date >= ?'); params.push(dateFrom); }
  if (dateTo) { clauses.push('le.evidence_date <= ?'); params.push(dateTo); }
  if (!includeSuperseded) clauses.push(IS_CURRENT_SQL);

  return db.prepare(`
    SELECT le.*,
      EXISTS(SELECT 1 FROM exam_evidence x WHERE x.user_id = le.user_id AND x.evidence_id = le.id) AS from_exam,
      CASE WHEN ${IS_CURRENT_SQL} THEN 1 ELSE 0 END AS is_current
    FROM learning_evidence le WHERE ${clauses.join(' AND ')} ORDER BY le.evidence_date, le.id
  `).all(...params).map(toDto);
}
