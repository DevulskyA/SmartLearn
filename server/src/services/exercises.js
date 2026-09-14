const PROVENANCE_VALUES = new Set(['MANUAL', 'SOURCE', 'AI_GENERATED']);

export class ExerciseError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

function findOwnedUnit(db, userId, unitId) {
  return db.prepare('SELECT id FROM learning_units WHERE user_id = ? AND id = ?').get(userId, unitId);
}

function findOwnedExercise(db, userId, id) {
  return db.prepare('SELECT * FROM exercises WHERE user_id = ? AND id = ?').get(userId, id);
}

function latestVersionRow(db, userId, exerciseId) {
  return db.prepare(`
    SELECT * FROM exercise_versions
    WHERE user_id = ? AND exercise_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(userId, exerciseId);
}

function toDto(exerciseRow, versionRow) {
  return {
    id: exerciseRow.id,
    unitId: exerciseRow.unit_id,
    orderIndex: exerciseRow.order_index,
    archivedAt: exerciseRow.archived_at,
    createdAt: exerciseRow.created_at,
    updatedAt: exerciseRow.updated_at,
    currentVersion: versionRow ? versionToDto(versionRow) : null,
  };
}

function versionToDto(row) {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    question: row.question,
    answer: row.answer,
    hint: row.hint,
    provenance: row.provenance,
    createdAt: row.created_at,
  };
}

function validateQuestionAndProvenance({ question, provenance }) {
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new ExerciseError('VALIDATION_FAILED', 'A questão é obrigatória.', 'question');
  }
  if (!PROVENANCE_VALUES.has(provenance)) {
    throw new ExerciseError('VALIDATION_FAILED', 'provenance deve ser MANUAL, SOURCE ou AI_GENERATED.', 'provenance');
  }
}

function nextOrderIndex(db, userId, unitId) {
  const { next } = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM exercises WHERE user_id = ? AND unit_id = ?').get(userId, unitId);
  return next;
}

/** Owned list, ordered deterministically by order_index then id; archived
 * items are excluded by default (still readable individually by id — see
 * getById — since a past attempt may still need to resolve them). */
export function list(db, userId, unitId, { includeArchived = false } = {}) {
  if (!findOwnedUnit(db, userId, unitId)) throw new ExerciseError('NOT_FOUND', 'Aula não encontrada.');
  const rows = db.prepare(`
    SELECT * FROM exercises WHERE user_id = ? AND unit_id = ? ${includeArchived ? '' : 'AND archived_at IS NULL'}
    ORDER BY order_index, id
  `).all(userId, unitId);
  return rows.map(row => toDto(row, latestVersionRow(db, userId, row.id)));
}

export function getById(db, userId, id) {
  const exercise = findOwnedExercise(db, userId, id);
  if (!exercise) throw new ExerciseError('NOT_FOUND', 'Exercício não encontrado.');
  return toDto(exercise, latestVersionRow(db, userId, id));
}

/** Creates an exercise and its first immutable version in one transaction. */
export function create(db, userId, { unitId, question, answer, hint, provenance }) {
  if (!findOwnedUnit(db, userId, unitId)) throw new ExerciseError('NOT_FOUND', 'Aula não encontrada.');
  validateQuestionAndProvenance({ question, provenance });

  const run = db.transaction(() => {
    const now = new Date().toISOString();
    const orderIndex = nextOrderIndex(db, userId, unitId);
    const exerciseResult = db.prepare(`
      INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, unitId, orderIndex, now, now);
    const exerciseId = exerciseResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO exercise_versions (user_id, exercise_id, question, answer, hint, provenance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, exerciseId, question, answer ?? null, hint ?? null, provenance, now);

    return exerciseId;
  });

  return getById(db, userId, run());
}

/**
 * Editing NEVER rewrites a prior version row — it appends a new one
 * (AC-18: a past attempt scored against an earlier version must keep
 * seeing exactly what was shown then, even after later edits). A
 * partial update (any subset of question/answer/hint/provenance,
 * matching every other update endpoint in this codebase) is merged onto
 * the current version's values before validating and inserting — a
 * caller correcting only a typo in the hint should not have to resend
 * the full question/provenance too.
 */
export function edit(db, userId, exerciseId, { question, answer, hint, provenance } = {}) {
  const exercise = findOwnedExercise(db, userId, exerciseId);
  if (!exercise) throw new ExerciseError('NOT_FOUND', 'Exercício não encontrado.');
  const current = latestVersionRow(db, userId, exerciseId);

  const nextQuestion = question !== undefined ? question : current.question;
  const nextAnswer = answer !== undefined ? answer : current.answer;
  const nextHint = hint !== undefined ? hint : current.hint;
  const nextProvenance = provenance !== undefined ? provenance : current.provenance;
  validateQuestionAndProvenance({ question: nextQuestion, provenance: nextProvenance });

  db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO exercise_versions (user_id, exercise_id, question, answer, hint, provenance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, exerciseId, nextQuestion, nextAnswer ?? null, nextHint ?? null, nextProvenance, now);
    db.prepare('UPDATE exercises SET updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, exerciseId);
  })();

  return getById(db, userId, exerciseId);
}

/** Returns one immutable version by id, regardless of whether the parent
 * exercise was later edited or archived — this is what a past attempt
 * reference must keep resolving to. */
export function getVersion(db, userId, versionId) {
  const row = db.prepare('SELECT * FROM exercise_versions WHERE user_id = ? AND id = ?').get(userId, versionId);
  if (!row) throw new ExerciseError('NOT_FOUND', 'Versão do exercício não encontrada.');
  return versionToDto(row);
}

export function archive(db, userId, id) {
  const exercise = findOwnedExercise(db, userId, id);
  if (!exercise) throw new ExerciseError('NOT_FOUND', 'Exercício não encontrado.');
  const now = new Date().toISOString();
  db.prepare('UPDATE exercises SET archived_at = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(now, now, userId, id);
  return getById(db, userId, id);
}

export function reactivate(db, userId, id) {
  const exercise = findOwnedExercise(db, userId, id);
  if (!exercise) throw new ExerciseError('NOT_FOUND', 'Exercício não encontrado.');
  const now = new Date().toISOString();
  db.prepare('UPDATE exercises SET archived_at = NULL, updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, id);
  return getById(db, userId, id);
}

/** Deterministic reorder scoped to one unit — a foreign-owned or
 * cross-unit id in the list fails the whole call without effect. */
export function reorder(db, userId, unitId, orderedIds) {
  if (!findOwnedUnit(db, userId, unitId)) throw new ExerciseError('NOT_FOUND', 'Aula não encontrada.');
  const owned = new Set(db.prepare('SELECT id FROM exercises WHERE user_id = ? AND unit_id = ?').all(userId, unitId).map(r => r.id));
  for (const id of orderedIds) {
    if (!owned.has(id)) throw new ExerciseError('NOT_FOUND', 'Exercício não encontrado.');
  }
  const now = new Date().toISOString();
  const update = db.prepare('UPDATE exercises SET order_index = ?, updated_at = ? WHERE user_id = ? AND id = ?');
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, now, userId, id));
  })();
  return list(db, userId, unitId, { includeArchived: true });
}
