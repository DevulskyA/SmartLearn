import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F2-02: add a question and reorder questions BY ID. Ids are never reused; a reorder moves whole questions (text, version,
// review status, citations) and never swaps a status onto another question's content; nothing is deleted implicitly.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const SPANS = [{ pageIndex: 1 }];

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-addreorder-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

async function lessonOf(db, sourcesDir, userId, labels) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['conteudo de teste da aula']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const generated = await drafts.createDraft(db, userId, proposal.id, {});
  const draft = drafts.replaceDraftContent(db, userId, generated.id, {
    summary: 'Resumo inicial',
    questions: labels.map((x) => ({ question: `Pergunta ${x}?`, answer: `Resposta ${x}`, explanation: null, hint: null, sourceSpans: SPANS })),
  });
  return { draftId: generated.id, draft };
}

const newQuestion = (label) => ({ question: `Pergunta ${label}?`, answer: `Resposta ${label}`, explanation: null, hint: null, sourceSpans: SPANS });
const json = (x) => JSON.stringify(x);
const reread = (db, userId, draftId) => drafts.getDraft(db, userId, draftId);

test('addQuestion appends a new question with a fresh id, version 1 and origin HUMAN_ADDED; everything else is byte-identical', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'add1@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B', 'C']);
    const after = drafts.addQuestion(db, userId, draftId, newQuestion('D'));
    assert.equal(after.questions.length, 4);
    assert.equal(after.revision, draft.revision + 1);
    assert.equal(after.summary, draft.summary);
    assert.equal(after.summaryVersion, draft.summaryVersion);
    for (let i = 0; i < 3; i++) assert.equal(json(after.questions[i]), json(draft.questions[i]), `question ${i} untouched`);
    const added = after.questions[3];
    assert.ok(/^q\d+$/.test(added.id));
    assert.ok(!draft.questions.some((q) => q.id === added.id));
    assert.equal(added.version, 1);
    assert.equal(added.origin, 'HUMAN_ADDED');
    assert.equal(added.question, 'Pergunta D?');
    assert.equal(json(reread(db, userId, draftId).questions[3]), json(added), 'persisted, not only returned');
  } finally { cleanup(); }
});

test('ids are never reused: delete the newest question, add another, and the new id is a different one', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'add2@example.com');
    const { draftId } = await lessonOf(db, sourcesDir, userId, ['A', 'B', 'C']);
    const withD = drafts.addQuestion(db, userId, draftId, newQuestion('D'));
    const removedId = withD.questions[3].id;
    drafts.deleteQuestion(db, userId, draftId, removedId);
    const withE = drafts.addQuestion(db, userId, draftId, newQuestion('E'));
    const ids = withE.questions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!ids.includes(removedId), 'the removed id was not handed out again');
  } finally { cleanup(); }
});

test('addQuestion with a citation outside the unit pages is refused and persists nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'add3@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B']);
    assert.throws(() => drafts.addQuestion(db, userId, draftId, { ...newQuestion('X'), sourceSpans: [{ pageIndex: 99 }] }), (e) => e.code === 'INVALID_DRAFT');
    assert.throws(() => drafts.addQuestion(db, userId, draftId, { answer: 'sem pergunta', sourceSpans: SPANS }), (e) => ['VALIDATION_FAILED', 'INVALID_DRAFT'].includes(e.code));
    const now = reread(db, userId, draftId);
    assert.equal(now.revision, draft.revision);
    assert.equal(now.questions.length, 2);
  } finally { cleanup(); }
});

test('reorder moves whole questions by id: a REJECTED status stays on the SAME question content', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ord1@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B', 'C', 'D']);
    const [a, b, c, d] = draft.questions;
    const rejected = drafts.reviseQuestion(db, userId, draftId, b.id, { status: 'REJECTED' });
    const before = Object.fromEntries(rejected.questions.map((q) => [q.id, json(q)]));
    const after = drafts.reorderQuestions(db, userId, draftId, [d.id, b.id, a.id, c.id]);
    assert.deepEqual(after.questions.map((q) => q.id), [d.id, b.id, a.id, c.id]);
    for (const q of after.questions) assert.equal(json(q), before[q.id], `${q.id} identical apart from its position`);
    assert.equal(after.questions.find((q) => q.id === b.id).status, 'REJECTED');
    assert.equal(after.questions.filter((q) => q.status === 'REJECTED').length, 1);
    assert.equal(after.revision, rejected.revision + 1);
    assert.equal(after.summary, rejected.summary);
  } finally { cleanup(); }
});

test('the new order persists: re-read from the database after reordering', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ord2@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B', 'C']);
    const [a, b, c] = draft.questions;
    drafts.reorderQuestions(db, userId, draftId, [c.id, a.id, b.id]);
    assert.deepEqual(reread(db, userId, draftId).questions.map((q) => q.id), [c.id, a.id, b.id]);
  } finally { cleanup(); }
});

test('reorder refuses a list that omits, adds, repeats or invents an id, and persists nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ord3@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B', 'C']);
    const [a, b, c] = draft.questions;
    const bad = [[a.id, b.id], [a.id, b.id, c.id, 'q99'], [a.id, a.id, b.id], [a.id, b.id, 'q99'], [], 'not-a-list', undefined];
    for (const order of bad) {
      assert.throws(() => drafts.reorderQuestions(db, userId, draftId, order), (e) => e.code === 'VALIDATION_FAILED', `refused: ${json(order)}`);
    }
    const now = reread(db, userId, draftId);
    assert.equal(now.revision, draft.revision);
    assert.deepEqual(now.questions.map((q) => q.id), [a.id, b.id, c.id]);
  } finally { cleanup(); }
});

test('a stale expectedRevision on reorder is refused (REVISION_CONFLICT), not silently applied', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ord4@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B']);
    const [a, b] = draft.questions;
    drafts.reviseSummary(db, userId, draftId, { summary: 'Resumo editado depois da leitura' });
    assert.throws(() => drafts.reorderQuestions(db, userId, draftId, [b.id, a.id], { expectedRevision: draft.revision }), (e) => e.code === 'REVISION_CONFLICT');
    assert.deepEqual(reread(db, userId, draftId).questions.map((q) => q.id), [a.id, b.id]);
  } finally { cleanup(); }
});

test('audit findings follow the QUESTION by id when it moves (a positional reference would point at the wrong question)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ord5@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B', 'C']);
    const [a, b, c] = draft.questions;
    const flagged = drafts.reviseQuestion(db, userId, draftId, a.id, { answer: 'Resposta com valor 999 mg que a fonte não tem' });
    // Findings grouped by the question they are about. The per-read counter id (f1, f2...) and the positional `scope`
    // ("question:N") legitimately change when a question moves; what must not change is WHICH question each finding names.
    const byEntity = (d) => Object.fromEntries(d.questions.map((q) => [q.id, json(d.audit.findings.filter((f) => f.entityId === q.id).map(({ id, scope, ...rest }) => rest))]));
    const before = byEntity(flagged);
    assert.ok(JSON.parse(before[a.id]).length > 0, 'precondition: the edited question has findings');
    const moved = drafts.reorderQuestions(db, userId, draftId, [b.id, c.id, a.id]);
    assert.deepEqual(byEntity(moved), before, 'after the move every question keeps exactly its own findings');
    const added = drafts.addQuestion(db, userId, draftId, newQuestion('D'));
    const afterAdd = byEntity(added);
    for (const q of [a, b, c]) assert.equal(afterAdd[q.id], before[q.id], q.id + ' keeps its findings when another question is added');
  } finally { cleanup(); }
});

test('an accepted draft cannot be extended or reordered', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ord6@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, userId, ['A', 'B']);
    const { acceptDraft } = await import('../src/services/accept-draft.js');
    acceptDraft(db, userId, draftId, { newSubjectName: 'Fisiologia', studyDate: '2026-10-03', expectedRevision: draft.revision });
    assert.throws(() => drafts.addQuestion(db, userId, draftId, newQuestion('X')), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => drafts.reorderQuestions(db, userId, draftId, draft.questions.map((q) => q.id).reverse()), (e) => e.code === 'INVALID_STATE');
  } finally { cleanup(); }
});

test('HTTP: POST /drafts/:id/questions adds, PATCH /drafts/:id/questions/order reorders; both need a session and are scoped to the owner', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS } });
  try {
    async function login(email) {
      const password = 'a genuinely long test password 1';
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
      const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
      const cookie = res.headers['set-cookie'].split(';')[0];
      const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
      const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()).id;
      return { cookie, csrfToken: me.csrfToken, userId };
    }
    const owner = await login('http-owner@example.com');
    const stranger = await login('http-stranger@example.com');
    const { draftId, draft } = await lessonOf(db, sourcesDir, owner.userId, ['A', 'B']);
    const call = (who, method, url, payload) => app.inject({ method, url, headers: { origin: TEST_ORIGIN, cookie: who.cookie, 'x-csrf-token': who.csrfToken, 'content-type': 'application/json' }, payload });

    const added = await call(owner, 'POST', `/v1/drafts/${draftId}/questions`, newQuestion('C'));
    assert.equal(added.statusCode, 201);
    const addedDraft = JSON.parse(added.body).draft;
    assert.equal(addedDraft.questions.length, 3);
    assert.equal(addedDraft.questions[2].origin, 'HUMAN_ADDED');

    const [a, b, c] = addedDraft.questions;
    const reordered = await call(owner, 'PATCH', `/v1/drafts/${draftId}/questions/order`, { order: [c.id, b.id, a.id] });
    assert.equal(reordered.statusCode, 200);
    assert.deepEqual(JSON.parse(reordered.body).draft.questions.map((q) => q.id), [c.id, b.id, a.id]);

    const invalid = await call(owner, 'PATCH', `/v1/drafts/${draftId}/questions/order`, { order: [c.id, b.id] });
    assert.equal(invalid.statusCode, 400);
    assert.equal(JSON.parse(invalid.body).error.code, 'VALIDATION_FAILED');

    const asStranger = await call(stranger, 'POST', `/v1/drafts/${draftId}/questions`, newQuestion('Z'));
    assert.equal(asStranger.statusCode, 404);
    const strangerOrder = await call(stranger, 'PATCH', `/v1/drafts/${draftId}/questions/order`, { order: [a.id, b.id, c.id] });
    assert.equal(strangerOrder.statusCode, 404);

    const noSession = await app.inject({ method: 'POST', url: `/v1/drafts/${draftId}/questions`, headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' }, payload: newQuestion('Y') });
    assert.ok([401, 403].includes(noSession.statusCode));
    assert.equal(draft.questions.length, 2, 'precondition draft had two questions');
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
