const DIRECT_TYPES = new Set(['INITIAL_PRACTICE', 'EXTERNAL']);

export class EvidenceError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

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
  };
}

/**
 * Direct evidence reporting accepts only INITIAL_PRACTICE and EXTERNAL —
 * REVIEW evidence is a side effect of reviews.complete() alone (design.md:
 * "REVIEW evidence comes through completion"). This function has no way to
 * write type='REVIEW' at all — the check happens before any other
 * validation, so there is no path that could accidentally let it through.
 */
export function create(db, userId, { unitId, type, questionsCount, correctCount, evidenceDate }) {
  if (!DIRECT_TYPES.has(type)) {
    throw new EvidenceError('VALIDATION_FAILED', 'type deve ser INITIAL_PRACTICE ou EXTERNAL. Evidência REVIEW só é criada ao concluir uma revisão.', 'type');
  }
  if (!findOwnedUnit(db, userId, unitId)) throw new EvidenceError('NOT_FOUND', 'Aula não encontrada.');

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

  if (typeof evidenceDate !== 'string' || Number.isNaN(new Date(`${evidenceDate}T00:00:00.000Z`).getTime())) {
    throw new EvidenceError('VALIDATION_FAILED', 'evidenceDate é obrigatória e deve ser uma data válida (YYYY-MM-DD).', 'evidenceDate');
  }

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO learning_evidence (user_id, unit_id, review_task_id, type, questions_count, correct_count, evidence_date, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
  `).run(userId, unitId, type, hasQuestions ? questionsCount : null, hasQuestions ? correctCount : null, evidenceDate, now);

  return toDto(db.prepare('SELECT * FROM learning_evidence WHERE user_id = ? AND id = ?').get(userId, result.lastInsertRowid));
}

/** Owned unit/date filters — unit ownership is checked when unitId is given. */
export function list(db, userId, { unitId, dateFrom, dateTo } = {}) {
  if (unitId !== undefined && !findOwnedUnit(db, userId, unitId)) throw new EvidenceError('NOT_FOUND', 'Aula não encontrada.');

  const clauses = ['user_id = ?'];
  const params = [userId];
  if (unitId !== undefined) { clauses.push('unit_id = ?'); params.push(unitId); }
  if (dateFrom) { clauses.push('evidence_date >= ?'); params.push(dateFrom); }
  if (dateTo) { clauses.push('evidence_date <= ?'); params.push(dateTo); }

  return db.prepare(`SELECT * FROM learning_evidence WHERE ${clauses.join(' AND ')} ORDER BY evidence_date, id`).all(...params).map(toDto);
}
