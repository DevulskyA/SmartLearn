import { validateNamingField, normalizeEntityName, nameKey } from '../../../shared/text-validation.js';
import { generateReviewDates, REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';
import { checkIdempotency, recordIdempotency } from './idempotency.js';

export class LearningUnitError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateTitleField(value) {
  if (typeof value !== 'string') return 'O conteúdo estudado deve ser uma string.';
  const trimmed = value.normalize('NFC').trim();
  if (!trimmed) return 'Informe o conteúdo estudado.';
  if (trimmed.length > 240) return 'O conteúdo estudado excede o tamanho máximo permitido.';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return 'O conteúdo estudado contém caracteres de controle não permitidos.';
  return null;
}

function subjectDto(row) {
  return { id: row.id, name: row.name, color: row.color, isActive: !!row.is_active };
}

function unitDto(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    sourceText: row.source_text,
    summaryBody: row.summary_body,
    studyDate: row.study_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolves an existing subjectId or creates a new one FROM WITHIN the
 * caller's transaction — this function issues raw SQL rather than calling
 * services/subjects.js's create(), because that function is not itself
 * transaction-aware and this resolution must commit atomically with the
 * unit + review rows it's part of (AC-03/AC-04).
 */
export function resolveOrCreateSubject(db, userId, { subjectId, newSubjectName, newSubjectColor }) {
  if (newSubjectName) {
    const error = validateNamingField(newSubjectName, 'o nome da disciplina');
    if (error) throw new LearningUnitError('VALIDATION_FAILED', error, 'newSubjectName');

    const key = nameKey(newSubjectName);
    const existing = db.prepare('SELECT id, is_active FROM subjects WHERE user_id = ? AND LOWER(name) = ?').get(userId, key);
    if (existing) {
      throw new LearningUnitError('SUBJECT_CONFLICT', existing.is_active
        ? 'Já existe uma disciplina com esse nome.'
        : 'Já existe uma disciplina arquivada com esse nome. Reative-a em vez de criar uma nova.', 'newSubjectName');
    }

    const now = new Date().toISOString();
    const { next } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM subjects WHERE user_id = ?').get(userId);
    const result = db.prepare(`
      INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(userId, normalizeEntityName(newSubjectName), newSubjectColor || 'DISC-BLUE', next, now, now);
    return db.prepare('SELECT * FROM subjects WHERE id = ?').get(result.lastInsertRowid);
  }

  // SMARTLEARN_PRODUCT_FIRST_V1 Slice 4: found in a real manual journey —
  // this message previously leaked raw API field names ("Informe subjectId
  // ou newSubjectName.") straight to the end user.
  if (!subjectId) throw new LearningUnitError('VALIDATION_FAILED', 'Informe uma disciplina para esta aula.', 'subjectId');
  const subject = db.prepare('SELECT * FROM subjects WHERE user_id = ? AND id = ?').get(userId, subjectId);
  if (!subject) throw new LearningUnitError('NOT_FOUND', 'Disciplina não encontrada.', 'subjectId');
  if (!subject.is_active) throw new LearningUnitError('VALIDATION_FAILED', 'Selecione uma disciplina ativa.', 'subjectId');
  return subject;
}

/**
 * Creates (or reuses) a subject, creates the learning unit, and creates
 * exactly 16 review_tasks — all in ONE SQLite transaction. AC-03/AC-04: any
 * failure at any point leaves zero partial rows; a repeated call with the
 * same operationKey and an equal payload returns the original result
 * without creating anything twice; a changed payload under the same key
 * conflicts (409) rather than silently doing something different.
 */
export function create(db, userId, data) {
  const { subjectId, newSubjectName, newSubjectColor, title, sourceText, summaryBody, studyDate, operationKey } = data;

  const titleError = validateTitleField(title);
  if (titleError) throw new LearningUnitError('VALIDATION_FAILED', titleError, 'title');
  if (!DATE_RE.test(studyDate ?? '')) throw new LearningUnitError('VALIDATION_FAILED', 'Informe uma data de estudo válida (YYYY-MM-DD).', 'studyDate');
  generateReviewDates(studyDate); // throws if calendar-invalid (e.g. Feb 30)

  const idempotencyPayload = { subjectId, newSubjectName, newSubjectColor, title, sourceText, summaryBody, studyDate };
  const check = checkIdempotency(db, { userId, operation: 'create-learning-unit', operationKey, payload: idempotencyPayload });
  if (check.cached) return check.result;

  const run = db.transaction(() => {
    const subject = resolveOrCreateSubject(db, userId, { subjectId, newSubjectName, newSubjectColor });

    const now = new Date().toISOString();
    const unitResult = db.prepare(`
      INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, subject.id, normalizeEntityName(title) || title.trim(), sourceText ?? null, summaryBody ?? null, studyDate, now, now);
    const unit = db.prepare('SELECT * FROM learning_units WHERE id = ?').get(unitResult.lastInsertRowid);

    const dueDates = generateReviewDates(studyDate);
    const insertReview = db.prepare(`
      INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, created_at) VALUES (?, ?, ?, ?, ?)
    `);
    dueDates.forEach((dueDate, i) => insertReview.run(userId, unit.id, REVIEW_DAY_OFFSETS[i], dueDate, now));

    const result = { subject: subjectDto(subject), unit: unitDto(unit), reviewCount: dueDates.length };

    recordIdempotency(db, {
      userId, operation: 'create-learning-unit', operationKey,
      payloadHash: check.payloadHash, result,
    });

    return result;
  });

  return run();
}

function findOwned(db, userId, id) {
  return db.prepare('SELECT * FROM learning_units WHERE user_id = ? AND id = ?').get(userId, id);
}

export function list(db, userId) {
  return db.prepare('SELECT * FROM learning_units WHERE user_id = ? ORDER BY study_date DESC, id DESC').all(userId).map(unitDto);
}

export function getById(db, userId, id) {
  const unit = findOwned(db, userId, id);
  if (!unit) throw new LearningUnitError('NOT_FOUND', 'Aula não encontrada.');
  return unitDto(unit);
}

/**
 * Updates title/sourceText/summaryBody only. studyDate is deliberately NOT
 * accepted here — design.md §4's date-correction contract (atomically
 * reprojecting still-pending review offsets while preserving completed
 * tasks/evidence) is real scheduling surgery, not a plain field edit, and
 * is out of this task's scope; a caller must get a clear rejection, not a
 * silent no-op, if they try.
 */
export function updateFields(db, userId, id, { title, sourceText, summaryBody } = {}) {
  const unit = findOwned(db, userId, id);
  if (!unit) throw new LearningUnitError('NOT_FOUND', 'Aula não encontrada.');

  const nextTitle = title !== undefined ? title : unit.title;
  const titleError = validateTitleField(nextTitle);
  if (titleError) throw new LearningUnitError('VALIDATION_FAILED', titleError, 'title');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE learning_units SET title = ?, source_text = ?, summary_body = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(
    normalizeEntityName(nextTitle) || nextTitle.trim(),
    sourceText !== undefined ? sourceText : unit.source_text,
    summaryBody !== undefined ? summaryBody : unit.summary_body,
    now, userId, id,
  );
  return getById(db, userId, id);
}
