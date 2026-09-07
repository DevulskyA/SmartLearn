import { generateReviewDates, REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';
import { resolveOrCreateSubject, LearningUnitError } from './learning-units.js';

export class AcceptDraftError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function subjectDto(row) {
  return { id: row.id, name: row.name, color: row.color, isActive: !!row.is_active };
}

function unitDto(row) {
  return {
    id: row.id, subjectId: row.subject_id, title: row.title,
    sourceText: row.source_text, summaryBody: row.summary_body, studyDate: row.study_date,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/**
 * Accepts one DRAFT-status generated draft into normal study: creates (or
 * reuses) a subject, one learning unit, exactly 16 review_tasks, and one
 * exercise+exercise_version PER draft question — all in a SINGLE
 * transaction, so any failure at any point leaves zero partial rows
 * (AC-20/AC-21, mirroring T15's own create-unit atomicity). Each created
 * exercise_version is provenance='AI_GENERATED' (distinct from a manually
 * authored MANUAL exercise on the same unit) and gets one
 * exercise_source_citations row per real page its question cited — a
 * structural link, never text stuffed into the hint field.
 *
 * DRAFT -> ACCEPTED is a one-way transition: accepting an ALREADY-accepted
 * draft returns the exact result the first acceptance produced, verbatim,
 * without touching the database again (mirrors T27's commitImport). This
 * function never declares the accepted content scientifically or
 * medically validated — it is ordinary, editable learning material like
 * any manually created exercise, just tagged with its real provenance.
 */
export function acceptDraft(db, userId, draftId, { subjectId, newSubjectName, newSubjectColor, studyDate } = {}, now = () => new Date()) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new AcceptDraftError('NOT_FOUND', 'Rascunho não encontrado.');

  if (draftRow.status === 'ACCEPTED') {
    return JSON.parse(draftRow.acceptance_result_json);
  }
  if (draftRow.status !== 'DRAFT') {
    throw new AcceptDraftError('INVALID_STATE', `Rascunho no estado ${draftRow.status} não pode ser aceito.`);
  }

  if (!DATE_RE.test(studyDate ?? '')) {
    throw new AcceptDraftError('VALIDATION_FAILED', 'Informe uma data de estudo válida (YYYY-MM-DD).', 'studyDate');
  }
  const dueDates = generateReviewDates(studyDate); // throws on a calendar-invalid date (e.g. Feb 30)

  const proposal = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, draftRow.proposal_id);
  if (!proposal) throw new AcceptDraftError('NOT_FOUND', 'Proposta de origem não encontrada.');

  const draftContent = JSON.parse(draftRow.draft_json);

  const run = db.transaction(() => {
    let subject;
    try {
      subject = resolveOrCreateSubject(db, userId, { subjectId, newSubjectName, newSubjectColor });
    } catch (err) {
      if (err instanceof LearningUnitError) throw new AcceptDraftError(err.code, err.message, err.field);
      throw err;
    }

    const nowIso = now().toISOString();
    const unitResult = db.prepare(`
      INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
    `).run(userId, subject.id, proposal.title, draftContent.summary, studyDate, nowIso, nowIso);
    const unit = db.prepare('SELECT * FROM learning_units WHERE id = ?').get(unitResult.lastInsertRowid);

    const insertReview = db.prepare('INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, created_at) VALUES (?, ?, ?, ?, ?)');
    dueDates.forEach((dueDate, i) => insertReview.run(userId, unit.id, REVIEW_DAY_OFFSETS[i], dueDate, nowIso));

    const insertExercise = db.prepare('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    const insertVersion = db.prepare(`
      INSERT INTO exercise_versions (user_id, exercise_id, question, answer, hint, provenance, created_at)
      VALUES (?, ?, ?, ?, ?, 'AI_GENERATED', ?)
    `);
    const insertCitation = db.prepare(`
      INSERT INTO exercise_source_citations (user_id, exercise_version_id, source_id, page_index, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    draftContent.questions.forEach((question, index) => {
      const exerciseResult = insertExercise.run(userId, unit.id, index, nowIso, nowIso);
      const versionResult = insertVersion.run(userId, exerciseResult.lastInsertRowid, question.question, question.answer, question.hint ?? null, nowIso);
      for (const span of question.sourceSpans) {
        insertCitation.run(userId, versionResult.lastInsertRowid, proposal.source_id, span.pageIndex, nowIso);
      }
    });

    const result = {
      subject: subjectDto(subject),
      unit: unitDto(unit),
      reviewCount: dueDates.length,
      exerciseCount: draftContent.questions.length,
      draftId: draftRow.id,
      acceptedBy: userId,
      acceptedAt: nowIso,
    };

    db.prepare(`
      UPDATE generated_drafts SET status = 'ACCEPTED', accepted_at = ?, accepted_unit_id = ?, acceptance_result_json = ?
      WHERE user_id = ? AND id = ?
    `).run(nowIso, unit.id, JSON.stringify(result), userId, draftId);

    return result;
  });

  return run();
}
