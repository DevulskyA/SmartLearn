import { validateNamingField, normalizeEntityName, nameKey } from '../../../shared/text-validation.js';
import { generateReviewDates, REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';
import { checkIdempotency, recordIdempotency } from './idempotency.js';
import { findUnresolvedRefs, refsMessage } from './visual-assets.js';
import { dm, splitMessage } from '../api-error-messages.js';
import { firstUnusedColor } from './subjects.js';
import { SOURCE_KINDS } from '../../../shared/source-kinds.js';

/** null/undefined = not said; anything else must be one of the four kinds. */
function normalizeSourceKind(kind) {
  if (kind === undefined || kind === null) return null;
  if (!SOURCE_KINDS.includes(kind)) throw new LearningUnitError('VALIDATION_FAILED', dm('INPUT_INVALID', { field: 'sourceKind' }), 'sourceKind');
  return kind;
}

export class LearningUnitError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * lessonDate = the day the class was given; studyDate = the day it was studied (the anchor of the review schedule). They are different facts.
 * lessonDate is optional ("" and null mean unknown), must be a real calendar day and cannot be later than the study date.
 * Returns the value to store (an ISO day or null); never touches the review schedule.
 */
export function normalizeLessonDate(lessonDate, studyDate, ErrorClass = LearningUnitError) {
  if (lessonDate === undefined || lessonDate === null || lessonDate === '') return null;
  const valid = typeof lessonDate === 'string' && DATE_RE.test(lessonDate) && new Date(`${lessonDate}T00:00:00.000Z`).toISOString().slice(0, 10) === lessonDate;
  if (!valid) throw new ErrorClass('VALIDATION_FAILED', dm('LESSON_DATE_INVALID'), 'lessonDate');
  if (lessonDate > studyDate) throw new ErrorClass('VALIDATION_FAILED', dm('LESSON_DATE_AFTER_STUDY'), 'lessonDate');
  return lessonDate;
}

// A [[fig:UUID]] in a summary must point at one of the student's own visual assets; anything else is refused instead of saved as a dead reference.
function assertFigureRefs(db, userId, summaryBody) {
  if (typeof summaryBody !== 'string' || !summaryBody.includes('[[fig:')) return;
  const problems = findUnresolvedRefs(db, userId, summaryBody);
  if (problems.length > 0) throw new LearningUnitError('VALIDATION_FAILED', refsMessage(problems), 'summaryBody');
}

function validateTitleField(value) {
  if (typeof value !== 'string') return 'O conteúdo estudado deve ser uma string.';
  const trimmed = value.normalize('NFC').trim();
  if (!trimmed) return 'Informe o conteúdo estudado.';
  if (trimmed.length > 240) return 'O conteúdo estudado excede o tamanho máximo permitido.';
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
    sourceKind: row.source_kind ?? null,
    summaryBody: row.summary_body,
    studyDate: row.study_date,
    lessonDate: row.lesson_date ?? null,
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
/**
 * Validates a subject input exactly as accepting a lesson does, WITHOUT writing: returns the existing active subject, or the
 * subject that would be created. Shared by resolveOrCreateSubject and by the acceptance preview, so what the preview says
 * about the subject is what the acceptance then does.
 */
export function describeSubject(db, userId, { subjectId, newSubjectName, newSubjectColor }) {
  if (newSubjectName) {
    const error = validateNamingField(newSubjectName, 'o nome da disciplina');
    if (error) throw new LearningUnitError('VALIDATION_FAILED', error, 'newSubjectName');

    const key = nameKey(newSubjectName);
    const existing = db.prepare('SELECT id, is_active FROM subjects WHERE user_id = ? AND LOWER(name) = ?').get(userId, key);
    if (existing) {
      throw new LearningUnitError('SUBJECT_CONFLICT', dm(existing.is_active ? 'SUBJECT_NAME_CONFLICT' : 'SUBJECT_ARCHIVED_NAME_CONFLICT'), 'newSubjectName');
    }

    return { existing: null, create: { name: normalizeEntityName(newSubjectName), color: newSubjectColor || firstUnusedColor(db, userId) } };
  }

  // SMARTLEARN_PRODUCT_FIRST_V1 Slice 4: found in a real manual journey —
  // this message previously leaked raw API field names ("Informe subjectId
  // ou newSubjectName.") straight to the end user.
  if (!subjectId) throw new LearningUnitError('VALIDATION_FAILED', dm('SUBJECT_REQUIRED'), 'subjectId');
  const subject = db.prepare('SELECT * FROM subjects WHERE user_id = ? AND id = ?').get(userId, subjectId);
  if (!subject) throw new LearningUnitError('NOT_FOUND', dm('SUBJECT_NOT_FOUND'), 'subjectId');
  if (!subject.is_active) throw new LearningUnitError('VALIDATION_FAILED', dm('SUBJECT_INACTIVE'), 'subjectId');
  return { existing: subject, create: null };
}

export function resolveOrCreateSubject(db, userId, input) {
  const { existing, create } = describeSubject(db, userId, input);
  if (existing) return existing;
  const now = new Date().toISOString();
  const { next } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM subjects WHERE user_id = ?').get(userId);
  const result = db.prepare(`
    INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(userId, create.name, create.color, next, now, now);
  return db.prepare('SELECT * FROM subjects WHERE id = ?').get(result.lastInsertRowid);
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
  const { subjectId, newSubjectName, newSubjectColor, title, sourceText, summaryBody, studyDate, lessonDate, operationKey, sourceKind } = data;

  const titleError = validateTitleField(title);
  if (titleError) throw new LearningUnitError('VALIDATION_FAILED', titleError, 'title');
  if (!DATE_RE.test(studyDate ?? '')) throw new LearningUnitError('VALIDATION_FAILED', dm('STUDY_DATE_INVALID'), 'studyDate');
  // a calendar-impossible day (e.g. 31 February) is the student's mistake, not a server failure: it is answered as a refused field
  try { generateReviewDates(studyDate); } catch { throw new LearningUnitError('VALIDATION_FAILED', dm('STUDY_DATE_INVALID'), 'studyDate'); }
  const storedLessonDate = normalizeLessonDate(lessonDate, studyDate);
  const storedSourceKind = normalizeSourceKind(sourceKind);
  assertFigureRefs(db, userId, summaryBody);

  const idempotencyPayload = { subjectId, newSubjectName, newSubjectColor, title, sourceText, sourceKind: storedSourceKind, summaryBody, studyDate, lessonDate: storedLessonDate };
  const check = checkIdempotency(db, { userId, operation: 'create-learning-unit', operationKey, payload: idempotencyPayload });
  if (check.cached) return check.result;

  const run = db.transaction(() => {
    const subject = resolveOrCreateSubject(db, userId, { subjectId, newSubjectName, newSubjectColor });

    const now = new Date().toISOString();
    const unitResult = db.prepare(`
      INSERT INTO learning_units (user_id, subject_id, title, source_text, source_kind, summary_body, study_date, lesson_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, subject.id, normalizeEntityName(title) || title.trim(), sourceText ?? null, storedSourceKind, summaryBody ?? null, studyDate, storedLessonDate, now, now);
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

const SUMMARY_SOURCE_TEXT_CAP = 2000;

/** The source pages an AI-generated unit's Resumo Mestre was drafted from (frozen at acceptance).
 * [] for manual units and for units accepted before summary provenance existed — nothing invented. */
export function summarySources(db, userId, id) {
  if (!findOwned(db, userId, id)) throw new LearningUnitError('NOT_FOUND', dm('UNIT_NOT_FOUND'));
  return db.prepare(`
    SELECT c.source_id, c.page_index, c.page_text_snapshot, s.original_name
    FROM unit_summary_citations c
    JOIN sources s ON s.user_id = c.user_id AND s.id = c.source_id
    WHERE c.user_id = ? AND c.unit_id = ?
    ORDER BY c.page_index, c.id
  `).all(userId, id).map((r) => ({
    sourceId: r.source_id,
    sourceName: r.original_name,
    pageIndex: r.page_index,
    pageText: r.page_text_snapshot == null ? null : r.page_text_snapshot.slice(0, SUMMARY_SOURCE_TEXT_CAP),
  }));
}

export function getById(db, userId, id) {
  const unit = findOwned(db, userId, id);
  if (!unit) throw new LearningUnitError('NOT_FOUND', dm('UNIT_NOT_FOUND'));
  return unitDto(unit);
}

/**
 * Updates title/sourceText/summaryBody/lessonDate only. studyDate is deliberately NOT
 * accepted here — design.md §4's date-correction contract (atomically
 * reprojecting still-pending review offsets while preserving completed
 * tasks/evidence) is real scheduling surgery, not a plain field edit, and
 * is out of this task's scope; a caller must get a clear rejection, not a
 * silent no-op, if they try.
 */
export function updateFields(db, userId, id, { title, sourceText, sourceKind, summaryBody, lessonDate } = {}) {
  const unit = findOwned(db, userId, id);
  if (!unit) throw new LearningUnitError('NOT_FOUND', dm('UNIT_NOT_FOUND'));

  const nextTitle = title !== undefined ? title : unit.title;
  const titleError = validateTitleField(nextTitle);
  if (titleError) throw new LearningUnitError('VALIDATION_FAILED', titleError, 'title');

  assertFigureRefs(db, userId, summaryBody);
  const nextLessonDate = lessonDate !== undefined ? normalizeLessonDate(lessonDate, unit.study_date) : (unit.lesson_date ?? null);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE learning_units SET title = ?, source_text = ?, source_kind = ?, summary_body = ?, lesson_date = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(
    normalizeEntityName(nextTitle) || nextTitle.trim(),
    sourceText !== undefined ? sourceText : unit.source_text,
    sourceKind !== undefined ? normalizeSourceKind(sourceKind) : (unit.source_kind ?? null),
    summaryBody !== undefined ? summaryBody : unit.summary_body,
    nextLessonDate,
    now, userId, id,
  );
  return getById(db, userId, id);
}
