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
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-lesson-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

// A draft with three questions, built through the real validation path (a full-list revise of the generated draft).
async function lessonWithThreeQuestions(db, sourcesDir) {
  const userId = makeUser(db, 'lesson@example.com');
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['conteudo de teste da aula']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const generated = await drafts.createDraft(db, userId, proposal.id, {});
  const spans = [{ pageIndex: 1 }];
  const withThree = drafts.reviseDraft(db, userId, generated.id, {
    summary: 'Resumo inicial',
    questions: ['A', 'B', 'C'].map((x) => ({ question: `Pergunta ${x}?`, answer: `Resposta ${x}`, explanation: null, hint: null, sourceSpans: spans })),
  });
  return { userId, draftId: generated.id, draft: withThree };
}

const snapshot = (q) => JSON.stringify(q);

test('every question has a stable id, a version and a review status; the summary has its own version', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const ids = draft.questions.map((q) => q.id);
    assert.equal(new Set(ids).size, 3);
    assert.ok(ids.every((id) => /^q\d+$/.test(id)));
    assert.ok(draft.questions.every((q) => Number.isInteger(q.version) && q.status));
    assert.ok(Number.isInteger(draft.summaryVersion));
  } finally { cleanup(); }
});

test('editing ONE question changes only that question: the summary and the other questions are byte-identical', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const [q1, q2, q3] = draft.questions;
    const after = drafts.reviseQuestion(db, userId, draftId, q2.id, { answer: 'Resposta B corrigida' });
    assert.equal(after.summary, draft.summary);
    assert.equal(after.summaryVersion, draft.summaryVersion);
    assert.equal(snapshot(after.questions[0]), snapshot(q1));
    assert.equal(snapshot(after.questions[2]), snapshot(q3));
    assert.equal(after.questions[1].id, q2.id);
    assert.equal(after.questions[1].answer, 'Resposta B corrigida');
    assert.equal(after.questions[1].version, q2.version + 1);
    assert.equal(after.revision, draft.revision + 1);
  } finally { cleanup(); }
});

test('editing ONLY the summary leaves every question untouched (ids, texts, versions)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const after = drafts.reviseSummary(db, userId, draftId, { summary: 'Resumo novo, só do resumo' });
    assert.equal(after.summary, 'Resumo novo, só do resumo');
    assert.equal(after.summaryVersion, draft.summaryVersion + 1);
    assert.deepEqual(after.questions.map(snapshot), draft.questions.map(snapshot));
  } finally { cleanup(); }
});

test('a stale entity version is refused (ENTITY_CONFLICT), not silently overwritten', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const q = draft.questions[0];
    drafts.reviseQuestion(db, userId, draftId, q.id, { answer: 'primeira edição' });
    assert.throws(() => drafts.reviseQuestion(db, userId, draftId, q.id, { answer: 'edição velha', expectedVersion: q.version }), (e) => e.code === 'ENTITY_CONFLICT');
    assert.throws(() => drafts.reviseSummary(db, userId, draftId, { summary: 'x', expectedVersion: draft.summaryVersion + 5 }), (e) => e.code === 'ENTITY_CONFLICT');
  } finally { cleanup(); }
});

test('a question citation outside the unit pages is rejected for a single-question edit', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    assert.throws(() => drafts.reviseQuestion(db, userId, draftId, draft.questions[0].id, { sourceSpans: [{ pageIndex: 99 }] }), (e) => e.code === 'INVALID_DRAFT');
  } finally { cleanup(); }
});

test('deleting a question keeps the other ids stable and never reuses the removed id; the last question cannot be removed', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const [q1, q2, q3] = draft.questions;
    let after = drafts.deleteQuestion(db, userId, draftId, q2.id);
    assert.deepEqual(after.questions.map((q) => q.id), [q1.id, q3.id]);
    assert.throws(() => drafts.reviseQuestion(db, userId, draftId, q2.id, { answer: 'x' }), (e) => e.code === 'NOT_FOUND');
    after = drafts.deleteQuestion(db, userId, draftId, q3.id);
    assert.throws(() => drafts.deleteQuestion(db, userId, draftId, q1.id), (e) => e.code === 'INVALID_STATE');
  } finally { cleanup(); }
});

test('rejecting a question keeps it in the draft but accepting the lesson creates exercises only for the others', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const rejected = drafts.reviseQuestion(db, userId, draftId, draft.questions[1].id, { status: 'REJECTED' });
    assert.equal(rejected.questions[1].status, 'REJECTED');
    assert.equal(rejected.questions.length, 3);
    const result = acceptDraft(db, userId, draftId, { newSubjectName: 'Fisiologia', studyDate: '2026-10-03', expectedRevision: rejected.revision });
    assert.equal(result.exerciseCount, 2);
  } finally { cleanup(); }
});

test('audit findings reference the entity they are about (stable id), not only an index', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const after = drafts.reviseQuestion(db, userId, draftId, draft.questions[0].id, { answer: 'Resposta com valor 999 mg que a fonte não tem' });
    const ids = new Set(after.questions.map((q) => q.id));
    assert.ok(after.audit.findings.length > 0);
    for (const f of after.audit.findings) {
      assert.ok(['SUMMARY', 'QUESTION', 'DRAFT'].includes(f.entityType));
      if (f.entityType === 'QUESTION') assert.ok(ids.has(f.entityId));
    }
  } finally { cleanup(); }
});

test('a legacy draft (no ids) gets deterministic ids that do not change between reads', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId } = await lessonWithThreeQuestions(db, sourcesDir);
    const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draftId);
    const legacy = JSON.parse(row.draft_json);
    for (const q of legacy.questions) { delete q.id; delete q.status; delete q.version; }
    delete legacy.summaryVersion; delete legacy.questionSeq;
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(legacy), draftId);
    const first = drafts.getDraft(db, userId, draftId).questions.map((q) => q.id);
    const second = drafts.getDraft(db, userId, draftId).questions.map((q) => q.id);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ['q1', 'q2', 'q3']);
  } finally { cleanup(); }
});

test('critical sequence on 4 questions, each step re-read from the database: Q3 edit, summary edit, Q2 rejected then accepted', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId } = await lessonWithThreeQuestions(db, sourcesDir);
    const spans = [{ pageIndex: 1 }];
    const base = drafts.reviseDraft(db, userId, draftId, {
      summary: 'Resumo inicial',
      questions: ['A', 'B', 'C', 'D'].map((x) => ({ question: `Pergunta ${x}?`, answer: `Resposta ${x}`, explanation: null, hint: null, sourceSpans: spans })),
    });
    const [q1, q2, q3, q4] = base.questions;

    drafts.reviseQuestion(db, userId, draftId, q3.id, { answer: 'Resposta C editada' });
    let fresh = drafts.getDraft(db, userId, draftId);
    assert.equal(snapshot(fresh.questions[0]), snapshot(q1));
    assert.equal(snapshot(fresh.questions[1]), snapshot(q2));
    assert.equal(snapshot(fresh.questions[3]), snapshot(q4));
    assert.equal(fresh.questions[2].id, q3.id);
    assert.equal(fresh.questions[2].answer, 'Resposta C editada');
    assert.equal(fresh.summary, base.summary);
    assert.equal(fresh.summaryVersion, base.summaryVersion);

    const q3After = snapshot(fresh.questions[2]);
    drafts.reviseSummary(db, userId, draftId, { summary: 'Resumo editado' });
    fresh = drafts.getDraft(db, userId, draftId);
    assert.equal(fresh.summary, 'Resumo editado');
    assert.equal(snapshot(fresh.questions[0]), snapshot(q1));
    assert.equal(snapshot(fresh.questions[1]), snapshot(q2));
    assert.equal(snapshot(fresh.questions[2]), q3After);
    assert.equal(snapshot(fresh.questions[3]), snapshot(q4));

    drafts.reviseQuestion(db, userId, draftId, q2.id, { status: 'REJECTED' });
    fresh = drafts.getDraft(db, userId, draftId);
    assert.equal(fresh.questions[1].status, 'REJECTED');
    const result = acceptDraft(db, userId, draftId, { newSubjectName: 'Fisiologia', studyDate: '2026-10-03', expectedRevision: fresh.revision });
    assert.equal(result.exerciseCount, 3);
    const texts = db.prepare('SELECT * FROM exercises').all().map((r) => JSON.stringify(r)).join('|');
    assert.ok(!texts.includes('Pergunta B?'), 'rejected question must not become an exercise');
    assert.equal(drafts.getDraft(db, userId, draftId).questions[1].status, 'REJECTED');
  } finally { cleanup(); }
});

test('persisted pedagogical content carries no audit text and no UI text', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const after = drafts.reviseQuestion(db, userId, draftId, draft.questions[0].id, { answer: 'Resposta com valor 999 mg que a fonte não tem' });
    assert.ok(after.audit.findings.length > 0);
    const content = JSON.stringify({ summary: after.summary, questions: after.questions.map(({ question, answer, explanation, hint }) => ({ question, answer, explanation, hint })) });
    for (const f of after.audit.findings) assert.ok(!content.includes(f.message ?? '\u0000'), 'audit message leaked into content');
    assert.ok(!/Sinalizada|Conceito|Recordação|Rejeitar|Salvar/.test(content), 'UI label leaked into content');
    assert.ok(!('audit' in after.questions[0]) && !('findings' in after.questions[0]));
  } finally { cleanup(); }
});

test('a whole-list revise that changes the question count never silently re-activates a rejected question', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await lessonWithThreeQuestions(db, sourcesDir);
    const rejected = drafts.reviseQuestion(db, userId, draftId, draft.questions[1].id, { status: 'REJECTED' });
    const spans = [{ pageIndex: 1 }];
    const twoOnly = rejected.questions.slice(0, 2).map((q) => ({ question: q.question, answer: q.answer, explanation: null, hint: null, sourceSpans: spans }));
    assert.throws(() => drafts.reviseDraft(db, userId, draftId, { questions: twoOnly }), (e) => e.code === 'ENTITY_CONFLICT');
    const after = drafts.getDraft(db, userId, draftId);
    assert.equal(after.questions[1].status, 'REJECTED');
    assert.equal(after.revision, rejected.revision);
  } finally { cleanup(); }
});
