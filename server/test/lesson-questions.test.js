import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { acceptDraft, previewAcceptance } from '../src/services/accept-draft.js';
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// DEFECT (found 2026-11-13, journey "accept the summary without questions, ask for questions later"): once the summary-only draft was
// accepted there was NO way to get questions for that lesson. The questions for an EXISTING lesson are written into a draft of their own
// (so they are reviewed like any AI output), and accepting it ADDS exercises to the lesson: no new lesson, no new review calendar.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-lesson-questions-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email = 'l@example.com') {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

const summaryOnlyProvider = () => ({
  name: CODEX_PROVIDER_NAME, live: false,
  async generate() {
    return { summary: '## Filtracao glomerular\n\nA filtracao depende da pressao hidrostatica.', summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR' };
  },
});
const good = (n, page = 1) => ({ question: `Pergunta ${n}: de que depende a filtracao glomerular?`, answer: 'Da pressao hidrostatica.', explanation: 'A pressao empurra o filtrado.', hint: 'Pense na forca.', questionType: 'OPEN', sourceSpans: [{ pageIndex: page }] });
const questionProvider = (list) => ({ ...summaryOnlyProvider(), async generateQuestions() { return { summary: '-', summarySourceSpans: [], summaryEvidence: [], questions: list, modelVersion: 'codex:test', promptVersion: '10' }; } });

/** A lesson accepted from a summary-first draft: summary only, no exercises. */
async function lessonWithoutQuestions(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Filtracao glomerular depende da pressao.', 'Segunda pagina da aula.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const proposal = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
  const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl: summaryOnlyProvider(), codex: { deferQuestions: true }, generationLocaleOverride: 'pt-BR' });
  const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Fisiologia', studyDate: '2026-11-20', expectedRevision: draft.revision, acknowledgeSummaryFindings: true });
  return { proposal, source, unitId: result.unit.id, acceptedDraftId: draft.id, reviewCount: result.reviewCount };
}

test('a lesson accepted without questions can get them later: a draft of its own, reviewed, then ADDED to the same lesson', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const lesson = await lessonWithoutQuestions(db, userId, sourcesDir);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM exercises WHERE unit_id = ?').get(lesson.unitId).n, 0);

    // the student asks for the questions of this lesson: an empty, summary-first style draft hangs on the lesson, no model involved
    const questionsDraft = drafts.createLessonQuestionsDraft(db, userId, lesson.unitId);
    assert.equal(questionsDraft.targetUnitId, lesson.unitId);
    assert.equal(questionsDraft.status, 'DRAFT');
    assert.equal(questionsDraft.questionsDeferred, true);
    assert.equal(questionsDraft.questions.length, 0);
    assert.match(questionsDraft.summary, /Filtracao glomerular/, 'it carries the lesson summary, read only');
    assert.equal(drafts.createLessonQuestionsDraft(db, userId, lesson.unitId).id, questionsDraft.id, 'asking again returns the same draft');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM generated_drafts WHERE status = 'DRAFT'").get().n, 1);

    // the summary belongs to the lesson: it is not edited through this draft
    assert.throws(() => drafts.reviseSummary(db, userId, questionsDraft.id, { summary: 'Outro texto', expectedVersion: questionsDraft.summaryVersion }), (err) => err.code === 'INVALID_STATE');

    // the questions are written into that draft, as PROPOSED (human review still decides)
    const written = await drafts.generateDeferredQuestions(db, userId, questionsDraft.id, { providerImpl: questionProvider([good(1), good(2, 2), good(3)]) });
    assert.equal(written.questions.length, 3);
    assert.ok(written.questions.every((q) => q.origin === 'GENERATED' && q.status !== 'ACCEPTED'));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM exercises WHERE unit_id = ?').get(lesson.unitId).n, 0, 'nothing reaches the lesson before the review');

    // review: the student rejects one
    const afterReject = drafts.reviseQuestion(db, userId, questionsDraft.id, written.questions[2].id, { status: 'REJECTED', expectedVersion: written.questions[2].version });
    assert.equal(afterReject.questions[2].status, 'REJECTED');

    const current = drafts.getDraft(db, userId, questionsDraft.id);
    const preview = previewAcceptance(db, userId, questionsDraft.id, { expectedRevision: current.revision });
    assert.equal(preview.addToLessonId, lesson.unitId);
    assert.equal(preview.exercises.length, 2);
    assert.equal(preview.reviews?.count ?? 0, 0, 'no new review calendar');

    const unitsBefore = db.prepare('SELECT COUNT(*) n FROM learning_units').get().n;
    const reviewsBefore = db.prepare('SELECT COUNT(*) n FROM review_tasks').get().n;
    const summaryBefore = db.prepare('SELECT summary_body FROM learning_units WHERE id = ?').get(lesson.unitId).summary_body;
    const result = acceptDraft(db, userId, questionsDraft.id, { expectedRevision: current.revision });
    assert.equal(result.exerciseCount, 2);
    assert.equal(result.unit.id, lesson.unitId);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM learning_units').get().n, unitsBefore, 'no second lesson');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM review_tasks').get().n, reviewsBefore, 'the review calendar is untouched');
    assert.equal(db.prepare('SELECT summary_body FROM learning_units WHERE id = ?').get(lesson.unitId).summary_body, summaryBefore);
    const rows = db.prepare(`SELECT e.order_index, v.provenance, v.question, (SELECT COUNT(*) FROM exercise_source_citations c WHERE c.exercise_version_id = v.id) AS cites
      FROM exercises e JOIN exercise_versions v ON v.exercise_id = e.id WHERE e.unit_id = ? ORDER BY e.order_index`).all(lesson.unitId);
    assert.deepEqual(rows.map((r) => r.order_index), [0, 1]);
    assert.ok(rows.every((r) => r.provenance === 'AI_GENERATED' && r.cites === 1));
    assert.equal(acceptDraft(db, userId, questionsDraft.id, { expectedRevision: current.revision }).exerciseCount, 2, 'a repeat returns the first result');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM exercises WHERE unit_id = ?').get(lesson.unitId).n, 2, 'and adds nothing');
  } finally { cleanup(); }
});

test('questions added to a lesson that already has exercises keep the existing ones and continue the order; the proposal still shows the lesson, not the questions draft', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const lesson = await lessonWithoutQuestions(db, userId, sourcesDir);
    const now = new Date().toISOString();
    const ex = db.prepare('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(userId, lesson.unitId, now, now);
    db.prepare("INSERT INTO exercise_versions (user_id, exercise_id, question, answer, provenance, created_at) VALUES (?, ?, 'Minha pergunta', 'Minha resposta', 'MANUAL', ?)").run(userId, ex.lastInsertRowid, now);

    const qd = drafts.createLessonQuestionsDraft(db, userId, lesson.unitId);
    await drafts.generateDeferredQuestions(db, userId, qd.id, { providerImpl: questionProvider([good(1)]) });
    // Materiais keeps showing the lesson (ACCEPTED) as the unit's newest draft, and tells the student questions are being reviewed
    const listed = proposals.listProposals(db, userId, lesson.source.id).find((p) => p.id === lesson.proposal.id);
    assert.equal(listed.latestDraft.status, 'ACCEPTED');
    assert.equal(listed.latestDraft.acceptedUnitId, lesson.unitId);
    assert.deepEqual(listed.latestDraft.lessonQuestions, { state: 'IN_REVIEW', draftId: qd.id });
    // a normal generation request is still answered by the lesson, never by the questions draft
    const reused = await drafts.createDraft(db, userId, lesson.proposal.id, { providerImpl: summaryOnlyProvider() });
    assert.equal(reused.id, lesson.acceptedDraftId);

    const current = drafts.getDraft(db, userId, qd.id);
    acceptDraft(db, userId, qd.id, { expectedRevision: current.revision });
    const orders = db.prepare('SELECT e.order_index, v.question FROM exercises e JOIN exercise_versions v ON v.exercise_id = e.id WHERE e.unit_id = ? ORDER BY e.order_index').all(lesson.unitId);
    assert.deepEqual(orders.map((r) => r.order_index), [0, 1]);
    assert.equal(orders[0].question, 'Minha pergunta', 'the exercise the student already had is untouched');
  } finally { cleanup(); }
});

test('questions for a lesson: refused for a lesson that did not come from a source, for another student, and when the source text changed', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const other = makeUser(db, 'o@example.com');
    const lesson = await lessonWithoutQuestions(db, userId, sourcesDir);
    assert.throws(() => drafts.createLessonQuestionsDraft(db, other, lesson.unitId), (err) => err.code === 'NOT_FOUND');
    const now = new Date().toISOString();
    const subjectId = db.prepare('SELECT subject_id FROM learning_units WHERE id = ?').get(lesson.unitId).subject_id;
    const manual = db.prepare("INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at) VALUES (?, ?, 'Feita a mao', NULL, 'Resumo', '2026-11-20', ?, ?)").run(userId, subjectId, now, now).lastInsertRowid;
    assert.throws(() => drafts.createLessonQuestionsDraft(db, userId, manual), (err) => err.code === 'NOT_FOUND', 'no source to write questions from');

    const qd = drafts.createLessonQuestionsDraft(db, userId, lesson.unitId);
    await drafts.generateDeferredQuestions(db, userId, qd.id, { providerImpl: questionProvider([good(1)]) });
    db.prepare('UPDATE source_pages SET text = ? WHERE source_id = ? AND page_index = 1').run('Outro texto da pagina.', lesson.source.id);
    const current = drafts.getDraft(db, userId, qd.id);
    assert.throws(() => acceptDraft(db, userId, qd.id, { expectedRevision: current.revision }), (err) => err.code === 'SOURCE_CHANGED');
  } finally { cleanup(); }
});
