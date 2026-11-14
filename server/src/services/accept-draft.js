import { generateReviewDates, REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';
import { resolveOrCreateSubject, describeSubject, normalizeLessonDate, LearningUnitError } from './learning-units.js';
import { isDraftStale, normalizeContent, acceptanceBlockers } from './generated-drafts.js';
import { contributeAcceptedDraft } from './shared-reuse.js';
import { findUnresolvedRefs, refsMessage } from './visual-assets.js';
import { carry, dm, splitMessage } from '../api-error-messages.js';
import { SOURCE_KINDS } from '../../../shared/source-kinds.js';

export class AcceptDraftError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function subjectDto(row) {
  return { id: row.id, name: row.name, color: row.color, isActive: !!row.is_active };
}

function unitDto(row) {
  return {
    id: row.id, subjectId: row.subject_id, title: row.title,
    sourceText: row.source_text, summaryBody: row.summary_body, studyDate: row.study_date, lessonDate: row.lesson_date ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/**
 * Everything acceptance needs BEFORE it writes, in the order acceptance has always checked it: the revision the reviewer saw,
 * the study date, the unit the draft hangs on, whether the source text still matches, and which questions become exercises.
 * Shared by acceptDraft and previewAcceptance so the preview can never describe something acceptance would not do.
 * `requireRevision` is true for acceptance; the preview only checks a revision it was given.
 */
function prepareAcceptance(db, userId, draftRow, { studyDate, lessonDate, expectedRevision, requireRevision, acknowledgeSummaryFindings = false }) {
  // C3 (audit): the caller must identify EXACTLY the revision it reviewed.
  // A concurrent edit (replaceDraftContent) bumps this draft's revision — if that
  // happened between the caller's last read and this accept call, fail
  // closed rather than silently publishing whatever content now happens
  // to be in draft_json (which the caller never actually saw).
  const checkRevision = requireRevision || (expectedRevision !== undefined && expectedRevision !== null);
  if (checkRevision && !Number.isInteger(expectedRevision)) {
    throw new AcceptDraftError('VALIDATION_FAILED', 'Informe expectedRevision (a revisão do rascunho que foi revisada).', 'expectedRevision');
  }
  if (checkRevision && expectedRevision !== draftRow.revision) {
    throw new AcceptDraftError('REVISION_CONFLICT', dm('ACCEPT_REVISION_CONFLICT'));
  }

  if (!DATE_RE.test(studyDate ?? '')) {
    throw new AcceptDraftError('VALIDATION_FAILED', dm('STUDY_DATE_INVALID'), 'studyDate');
  }
  let dueDates;
  try {
    dueDates = generateReviewDates(studyDate); // throws on a calendar-invalid date (e.g. Feb 30)
  } catch {
    // Was an untyped Error (an HTTP 500); found by the preview/accept parity test. A bad date is the caller's mistake.
    throw new AcceptDraftError('VALIDATION_FAILED', dm('STUDY_DATE_INVALID'), 'studyDate');
  }
  const storedLessonDate = normalizeLessonDate(lessonDate, studyDate, AcceptDraftError); // optional; never moves the schedule

  const proposal = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, draftRow.proposal_id);
  if (!proposal) throw new AcceptDraftError('NOT_FOUND', dm('SOURCE_PROPOSAL_NOT_FOUND'));

  // SPRINT-04: the draft was generated from specific source text. If the proposal's pages now hold different text
  // (re-extraction), freezing citations from them would attribute text B to content produced from text A.
  if (isDraftStale(db, userId, draftRow)) {
    throw new AcceptDraftError('SOURCE_CHANGED', dm('SOURCE_CHANGED_SINCE_DRAFT'));
  }

  const content = normalizeContent(JSON.parse(draftRow.draft_json));
  const blockers = acceptanceBlockers(content, { acknowledgeSummaryFindings });
  // A question the reviewer rejected never becomes an exercise; the rest of the lesson is unaffected.
  const excluded = content.questions.filter((q) => q.status === 'REJECTED');
  const draftContent = { ...content, questions: content.questions.filter((q) => q.status !== 'REJECTED') };
  // A summary-only draft (questionsDeferred, nothing rejected) becomes a lesson without exercises, exactly like a lesson written by hand;
  // a draft that had questions and lost them all to rejection is still refused.
  const summaryOnly = content.questionsDeferred === true && content.questions.length === 0;
  if (draftContent.questions.length === 0 && !summaryOnly) {
    throw new AcceptDraftError('VALIDATION_FAILED', dm('ALL_QUESTIONS_REJECTED'), 'questions');
  }

  // A1 (audit): source_pages is a mutable, recomputable projection
  // (re-extraction replaces it wholesale) — a citation is about to become
  // part of accepted history and must freeze what it actually cites RIGHT
  // NOW, independent of anything that might happen to source_pages later.
  const sourceRow = db.prepare('SELECT parser_version FROM sources WHERE user_id = ? AND id = ?').get(userId, proposal.source_id);
  const pageTextByIndex = new Map(
    db.prepare('SELECT page_index, text FROM source_pages WHERE user_id = ? AND source_id = ?').all(userId, proposal.source_id)
      .map((row) => [row.page_index, row.text]),
  );


  return { storedLessonDate, proposal, dueDates, draftContent, excluded, pageTextByIndex, sourceRow, blockers };
}

/** One exercise (with its first version and its frozen citations) per question, numbered from `firstIndex`. Shared by both acceptances. */
function insertQuestionsAsExercises(db, userId, unitId, firstIndex, questions, { sourceId, pageTextByIndex, parserVersion }, nowIso) {
  const insertExercise = db.prepare('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  const insertVersion = db.prepare(`
    INSERT INTO exercise_versions (user_id, exercise_id, question, answer, explanation, hint, provenance, created_at, question_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCitation = db.prepare(`
    INSERT INTO exercise_source_citations (user_id, exercise_version_id, source_id, page_index, created_at, page_text_snapshot, parser_version_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  questions.forEach((question, index) => {
    const exerciseResult = insertExercise.run(userId, unitId, firstIndex + index, nowIso, nowIso);
    const versionResult = insertVersion.run(userId, exerciseResult.lastInsertRowid, question.question, question.answer, question.explanation ?? null, question.hint ?? null,
      // a question the student wrote is theirs, never labelled as AI; AI text the student edited stays AI-derived
      question.origin === 'HUMAN_ADDED' ? 'MANUAL' : 'AI_GENERATED', nowIso, question.questionType ?? null);
    for (const span of question.sourceSpans) {
      insertCitation.run(userId, versionResult.lastInsertRowid, sourceId, span.pageIndex, nowIso, pageTextByIndex.get(span.pageIndex) ?? null, parserVersion);
    }
  });
}

/**
 * QUESTIONS FOR AN EXISTING LESSON (draft with target_unit_id, migration 045). Same guarantees as an acceptance -- the revision the student
 * reviewed, a source that still holds the text, no unresolved critical finding, rejected questions left out -- but it creates no lesson and
 * no review calendar: the kept questions are APPENDED to the lesson, after the exercises it already has, which are untouched. The lesson's
 * summary is not part of it (it is shown read-only), so summary findings and the study date do not apply.
 */
function prepareLessonQuestions(db, userId, draftRow, { expectedRevision, requireRevision }) {
  const checkRevision = requireRevision || (expectedRevision !== undefined && expectedRevision !== null);
  if (checkRevision && !Number.isInteger(expectedRevision)) {
    throw new AcceptDraftError('VALIDATION_FAILED', 'Informe expectedRevision (a revisão do rascunho que foi revisada).', 'expectedRevision');
  }
  if (checkRevision && expectedRevision !== draftRow.revision) throw new AcceptDraftError('REVISION_CONFLICT', dm('ACCEPT_REVISION_CONFLICT'));
  const unit = db.prepare('SELECT * FROM learning_units WHERE user_id = ? AND id = ?').get(userId, draftRow.target_unit_id);
  if (!unit) throw new AcceptDraftError('NOT_FOUND', dm('UNIT_NOT_FOUND'));
  const proposal = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, draftRow.proposal_id);
  if (!proposal) throw new AcceptDraftError('NOT_FOUND', dm('SOURCE_PROPOSAL_NOT_FOUND'));
  if (isDraftStale(db, userId, draftRow)) throw new AcceptDraftError('SOURCE_CHANGED', dm('SOURCE_CHANGED_SINCE_DRAFT'));
  const content = normalizeContent(JSON.parse(draftRow.draft_json));
  const blockers = acceptanceBlockers(content, { acknowledgeSummaryFindings: true });
  const kept = content.questions.filter((q) => q.status !== 'REJECTED');
  const excluded = content.questions.filter((q) => q.status === 'REJECTED');
  return { unit, proposal, blockers, kept, excluded };
}

/** Offering the accepted AI content to other students is optional and consent-based; a failure here never undoes an acceptance. */
function contributeQuietly(db, userId, draftId, sourceId, now) {
  try {
    const row = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
    contributeAcceptedDraft(db, userId, row, normalizeContent(JSON.parse(row.draft_json)), { sourceId, now });
  } catch { /* the lesson is already accepted */ }
}

function acceptLessonQuestions(db, userId, draftRow, { expectedRevision }, now) {
  const { unit, proposal, blockers, kept } = prepareLessonQuestions(db, userId, draftRow, { expectedRevision, requireRevision: true });
  if (blockers.questions.length > 0) throw new AcceptDraftError('FINDINGS_UNRESOLVED', dm('FINDINGS_UNRESOLVED', { questions: blockers.questions.length, summary: 0 }));
  if (kept.length === 0) throw new AcceptDraftError('VALIDATION_FAILED', dm('QUESTIONS_NOTHING_TO_ADD'), 'questions');
  const sourceRow = db.prepare('SELECT parser_version FROM sources WHERE user_id = ? AND id = ?').get(userId, proposal.source_id);
  const pageTextByIndex = new Map(
    db.prepare('SELECT page_index, text FROM source_pages WHERE user_id = ? AND source_id = ?').all(userId, proposal.source_id).map((row) => [row.page_index, row.text]),
  );
  const accepted = db.transaction(() => {
    const nowIso = now().toISOString();
    const { next } = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM exercises WHERE user_id = ? AND unit_id = ?').get(userId, unit.id);
    insertQuestionsAsExercises(db, userId, unit.id, next, kept, { sourceId: proposal.source_id, pageTextByIndex, parserVersion: sourceRow?.parser_version ?? null }, nowIso);
    db.prepare('UPDATE learning_units SET updated_at = ? WHERE user_id = ? AND id = ?').run(nowIso, userId, unit.id);
    const subject = db.prepare('SELECT * FROM subjects WHERE user_id = ? AND id = ?').get(userId, unit.subject_id);
    const result = {
      subject: subject ? subjectDto(subject) : null,
      unit: unitDto(db.prepare('SELECT * FROM learning_units WHERE id = ?').get(unit.id)),
      reviewCount: 0,
      exerciseCount: kept.length,
      addedToLessonId: unit.id,
      draftId: draftRow.id,
      acceptedBy: userId,
      acceptedAt: nowIso,
    };
    db.prepare("UPDATE generated_drafts SET status = 'ACCEPTED', accepted_at = ?, accepted_unit_id = ?, acceptance_result_json = ? WHERE user_id = ? AND id = ?")
      .run(nowIso, unit.id, JSON.stringify(result), userId, draftRow.id);
    return result;
  }).immediate();
  contributeQuietly(db, userId, draftRow.id, proposal.source_id, now);
  return accepted;
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
export function acceptDraft(db, userId, draftId, { subjectId, newSubjectName, newSubjectColor, studyDate, lessonDate, sourceKind, expectedRevision, acknowledgeSummaryFindings } = {}, now = () => new Date()) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new AcceptDraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));

  if (draftRow.status === 'ACCEPTED') {
    return JSON.parse(draftRow.acceptance_result_json);
  }
  if (draftRow.status !== 'DRAFT') {
    throw new AcceptDraftError('INVALID_STATE', dm('DRAFT_STATE_NOT_ACCEPTABLE', { status: draftRow.status }));
  }

  if (draftRow.target_unit_id != null) return acceptLessonQuestions(db, userId, draftRow, { expectedRevision }, now);

  const plan = prepareAcceptance(db, userId, draftRow, { studyDate, lessonDate, expectedRevision, requireRevision: true, acknowledgeSummaryFindings });
  const { storedLessonDate, proposal, dueDates, draftContent, pageTextByIndex, sourceRow, blockers } = plan;
  if (blockers.questions.length > 0 || blockers.summary > 0) {
    throw new AcceptDraftError('FINDINGS_UNRESOLVED', dm('FINDINGS_UNRESOLVED', { questions: blockers.questions.length, summary: blockers.summary }));
  }

  const run = db.transaction(() => {
    // Inside the transaction: the figures the summary points at must STILL be the student's own, from this draft's source, at the moment
    // the lesson is created. The references travel with the summary text into the new lesson; nothing is accepted with a dead one.
    const refProblems = findUnresolvedRefs(db, userId, draftContent.summary, { sourceId: proposal.source_id });
    if (refProblems.length > 0) throw new AcceptDraftError('VALIDATION_FAILED', refsMessage(refProblems), 'summary');
    let subject;
    try {
      subject = resolveOrCreateSubject(db, userId, { subjectId, newSubjectName, newSubjectColor });
    } catch (err) {
      if (err instanceof LearningUnitError) throw new AcceptDraftError(err.code, carry(err), err.field);
      throw err;
    }

    const nowIso = now().toISOString();
    if (sourceKind != null && !SOURCE_KINDS.includes(sourceKind)) throw new AcceptDraftError('VALIDATION_FAILED', dm('INPUT_INVALID', { field: 'sourceKind' }), 'sourceKind');
    const storedSourceKind = sourceKind ?? null;
    const unitResult = db.prepare(`
      INSERT INTO learning_units (user_id, subject_id, title, source_text, source_kind, summary_body, study_date, lesson_date, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(userId, subject.id, proposal.title, storedSourceKind, draftContent.summary, studyDate, storedLessonDate, nowIso, nowIso);
    const unit = db.prepare('SELECT * FROM learning_units WHERE id = ?').get(unitResult.lastInsertRowid);

    // The summary's own provenance, frozen like a question citation. A draft created before summary
    // spans existed falls back to the proposal's whole page range — never to an empty/unknown origin.
    const summaryPages = (draftContent.summarySourceSpans?.length
      ? draftContent.summarySourceSpans.map((span) => span.pageIndex)
      : [...pageTextByIndex.keys()].filter((i) => i >= proposal.page_start && i <= proposal.page_end));
    const insertSummaryCitation = db.prepare(`
      INSERT INTO unit_summary_citations (user_id, unit_id, source_id, page_index, page_text_snapshot, parser_version_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const pageIndex of [...new Set(summaryPages)].sort((a, b) => a - b)) {
      insertSummaryCitation.run(userId, unit.id, proposal.source_id, pageIndex, pageTextByIndex.get(pageIndex) ?? null, sourceRow?.parser_version ?? null, nowIso);
    }

    const insertReview = db.prepare('INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, created_at) VALUES (?, ?, ?, ?, ?)');
    dueDates.forEach((dueDate, i) => insertReview.run(userId, unit.id, REVIEW_DAY_OFFSETS[i], dueDate, nowIso));

    insertQuestionsAsExercises(db, userId, unit.id, 0, draftContent.questions, { sourceId: proposal.source_id, pageTextByIndex, parserVersion: sourceRow?.parser_version ?? null }, nowIso);

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

  const result = run();
  contributeQuietly(db, userId, draftId, proposal.source_id, now);
  return result;
}

/**
 * READ-ONLY preview of what acceptDraft would create, shown before the final button. It runs the SAME preparation as the
 * acceptance (revision if given, date, source freshness, rejected questions) and the SAME subject validation, then describes
 * the result; it writes nothing. An already accepted draft returns the frozen result of its acceptance.
 */
export function previewAcceptance(db, userId, draftId, { subjectId, newSubjectName, newSubjectColor, studyDate, lessonDate, expectedRevision, acknowledgeSummaryFindings } = {}) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new AcceptDraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  if (draftRow.status === 'ACCEPTED') {
    return { status: 'ACCEPTED', draftId: draftRow.id, revision: draftRow.revision, acceptance: JSON.parse(draftRow.acceptance_result_json) };
  }
  if (draftRow.status !== 'DRAFT') {
    throw new AcceptDraftError('INVALID_STATE', dm('DRAFT_STATE_NOT_ACCEPTABLE', { status: draftRow.status }));
  }
  if (draftRow.target_unit_id != null) {
    const { unit, kept, excluded: rejected, blockers: found } = prepareLessonQuestions(db, userId, draftRow, { expectedRevision, requireRevision: false });
    return {
      status: 'DRAFT',
      draftId: draftRow.id,
      revision: draftRow.revision,
      addToLessonId: unit.id,
      unit: { id: unit.id, title: unit.title, summary: unit.summary_body, studyDate: unit.study_date, lessonDate: unit.lesson_date ?? null, summaryPages: [] },
      reviews: { count: 0, dueDates: [] },
      exercises: kept.map((q, order) => ({
        order, questionId: q.id, question: q.question, answer: q.answer, explanation: q.explanation ?? null, hint: q.hint ?? null,
        questionType: q.questionType ?? null, pages: q.sourceSpans.map((span) => span.pageIndex), origin: q.origin,
      })),
      excluded: rejected.map((q) => ({ questionId: q.id, question: q.question, reason: 'REJECTED' })),
      blockers: { questions: found.questions, summary: 0 },
    };
  }
  const { storedLessonDate, proposal, dueDates, draftContent, excluded, pageTextByIndex, blockers } = prepareAcceptance(db, userId, draftRow, { studyDate, lessonDate, expectedRevision, requireRevision: false, acknowledgeSummaryFindings });
  let subject;
  try {
    subject = describeSubject(db, userId, { subjectId, newSubjectName, newSubjectColor });
  } catch (err) {
    if (err instanceof LearningUnitError) throw new AcceptDraftError(err.code, carry(err), err.field);
    throw err;
  }
  const summaryPages = draftContent.summarySourceSpans?.length
    ? draftContent.summarySourceSpans.map((span) => span.pageIndex)
    : [...pageTextByIndex.keys()].filter((i) => i >= proposal.page_start && i <= proposal.page_end);
  return {
    status: 'DRAFT',
    draftId: draftRow.id,
    revision: draftRow.revision,
    subject: subject.existing
      ? { id: subject.existing.id, name: subject.existing.name, color: subject.existing.color, isNew: false }
      : { id: null, name: subject.create.name, color: subject.create.color, isNew: true },
    unit: { title: proposal.title, summary: draftContent.summary, studyDate, lessonDate: storedLessonDate, summaryPages: [...new Set(summaryPages)].sort((a, b) => a - b) },
    reviews: { count: dueDates.length, dueDates },
    exercises: draftContent.questions.map((q, order) => ({
      order,
      questionId: q.id,
      question: q.question,
      answer: q.answer,
      explanation: q.explanation ?? null,
      hint: q.hint ?? null,
      questionType: q.questionType ?? null,
      pages: q.sourceSpans.map((span) => span.pageIndex),
      origin: q.origin,
    })),
    excluded: excluded.map((q) => ({ questionId: q.id, question: q.question, reason: 'REJECTED' })),
    // what acceptance would refuse right now (the same rule acceptDraft applies): questions with a critical finding still undecided, and unacknowledged critical findings on the summary
    blockers,
  };
}
