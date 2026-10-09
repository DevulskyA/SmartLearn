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
import { acceptDraft, previewAcceptance } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F2-05: the acceptance preview is read-only and is computed by the SAME preparation as the real acceptance, so what it
// shows (unit, exercises with their source question ids, excluded questions) is what acceptDraft then creates.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const SPANS = [{ pageIndex: 1 }];
const json = (x) => JSON.stringify(x);

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-preview-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

const q = (x, extra = {}) => ({ question: `Pergunta ${x}?`, answer: `Resposta ${x}`, explanation: `Explicação ${x}`, hint: `Dica ${x}`, sourceSpans: SPANS, ...extra });

// A lesson with a rejected question, an edited one and a human-added one: every case the preview has to get right.
async function richLesson(db, sourcesDir, userId) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['conteudo de teste da aula']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const generated = await drafts.createDraft(db, userId, proposal.id, {});
  let d = drafts.replaceDraftContent(db, userId, generated.id, { summary: 'Resumo da aula revisado', questions: ['A', 'B', 'C', 'D'].map((x) => q(x)) });
  d = drafts.reviseQuestion(db, userId, generated.id, d.questions[1].id, { status: 'REJECTED' });
  d = drafts.reviseQuestion(db, userId, generated.id, d.questions[2].id, { answer: 'Resposta C corrigida' });
  d = drafts.addQuestion(db, userId, generated.id, q('E'));
  return { draftId: generated.id, draft: d };
}

const INPUT = { newSubjectName: 'Fisiologia Renal', studyDate: '2026-10-03' };
const counts = (db) => Object.fromEntries(['subjects', 'learning_units', 'review_tasks', 'exercises', 'exercise_versions', 'exercise_source_citations', 'unit_summary_citations']
  .map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
const draftRow = (db, id) => json(db.prepare('SELECT status, revision, updated_at, draft_json, accepted_at, accepted_unit_id, acceptance_result_json FROM generated_drafts WHERE id = ?').get(id));

test('the preview equals what acceptDraft then creates: unit, summary, date, reviews, each exercise (text + order + pages) and the excluded questions', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pv1@example.com');
    const { draftId, draft } = await richLesson(db, sourcesDir, userId);
    const preview = previewAcceptance(db, userId, draftId, { ...INPUT, expectedRevision: draft.revision });
    const result = acceptDraft(db, userId, draftId, { ...INPUT, expectedRevision: draft.revision });

    assert.equal(preview.status, 'DRAFT');
    assert.equal(preview.revision, draft.revision);
    assert.equal(preview.subject.name, result.subject.name);
    assert.equal(preview.subject.isNew, true);
    assert.equal(preview.unit.title, result.unit.title);
    assert.equal(preview.unit.summary, result.unit.summaryBody);
    assert.equal(preview.unit.studyDate, result.unit.studyDate);
    assert.equal(preview.reviews.count, result.reviewCount);
    const dueDates = db.prepare('SELECT due_date FROM review_tasks WHERE unit_id = ? ORDER BY offset_days').all(result.unit.id).map((r) => r.due_date);
    assert.deepEqual(preview.reviews.dueDates, dueDates);

    assert.equal(preview.exercises.length, result.exerciseCount);
    const created = db.prepare('SELECT e.id AS exerciseId, v.id AS versionId, v.question, v.answer, v.explanation, v.hint, v.question_type AS questionType FROM exercises e JOIN exercise_versions v ON v.exercise_id = e.id WHERE e.unit_id = ? ORDER BY e.order_index').all(result.unit.id);
    created.forEach((row, i) => {
      const p = preview.exercises[i];
      assert.equal(p.order, i);
      assert.equal(p.question, row.question);
      assert.equal(p.answer, row.answer);
      assert.equal(p.explanation, row.explanation ?? null);
      assert.equal(p.hint, row.hint ?? null);
      assert.equal(p.questionType, row.questionType ?? null);
      const pages = db.prepare('SELECT page_index FROM exercise_source_citations WHERE exercise_version_id = ? ORDER BY page_index').all(row.versionId).map((r) => r.page_index);
      assert.deepEqual(p.pages, pages);
    });

    const all = draft.questions.map((x) => x.id);
    const keptIds = preview.exercises.map((e) => e.questionId);
    const excludedIds = preview.excluded.map((e) => e.questionId);
    assert.deepEqual(excludedIds, draft.questions.filter((x) => x.status === 'REJECTED').map((x) => x.id));
    assert.deepEqual([...keptIds, ...excludedIds].sort(), [...all].sort(), 'every question is either an exercise or excluded, never both, never lost');
    assert.ok(preview.excluded.every((e) => e.reason === 'REJECTED'));
    assert.ok(preview.exercises.some((e) => e.origin === 'HUMAN_ADDED') && preview.exercises.some((e) => e.origin === 'HUMAN_EDITED'));
  } finally { cleanup(); }
});

test('with an existing active subject the preview names it (isNew false) and the acceptance uses the same one', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pv2@example.com');
    const { draftId, draft } = await richLesson(db, sourcesDir, userId);
    const now = new Date().toISOString();
    const subjectId = db.prepare(`INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?, 'Fisiologia', 'DISC-BLUE', 1, 0, ?, ?)`).run(userId, now, now).lastInsertRowid;
    const preview = previewAcceptance(db, userId, draftId, { subjectId: Number(subjectId), studyDate: '2026-10-03' });
    assert.equal(preview.subject.isNew, false);
    assert.equal(preview.subject.id, Number(subjectId));
    const result = acceptDraft(db, userId, draftId, { subjectId: Number(subjectId), studyDate: '2026-10-03', expectedRevision: draft.revision });
    assert.equal(result.subject.id, preview.subject.id);
    assert.equal(result.subject.name, preview.subject.name);
  } finally { cleanup(); }
});

test('the preview writes NOTHING: no new rows anywhere and the draft row is byte-identical', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pv3@example.com');
    const { draftId, draft } = await richLesson(db, sourcesDir, userId);
    const before = { counts: counts(db), row: draftRow(db, draftId) };
    previewAcceptance(db, userId, draftId, { ...INPUT, expectedRevision: draft.revision });
    previewAcceptance(db, userId, draftId, { ...INPUT });
    assert.deepEqual(counts(db), before.counts);
    assert.equal(draftRow(db, draftId), before.row);
  } finally { cleanup(); }
});

test('the preview refuses exactly what acceptDraft refuses, with the same error code (parity table)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pv4@example.com');
    const { draftId, draft } = await richLesson(db, sourcesDir, userId);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?, 'Existente', 'DISC-BLUE', 1, 0, ?, ?)`).run(userId, now, now);
    db.prepare(`INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?, 'Arquivada', 'DISC-BLUE', 0, 1, ?, ?)`).run(userId, now, now);
    const archivedId = db.prepare("SELECT id FROM subjects WHERE name = 'Arquivada'").get().id;
    const cases = [
      ['invalid date', { ...INPUT, studyDate: '2026-02-30' }, 'VALIDATION_FAILED'],
      ['malformed date', { ...INPUT, studyDate: 'amanhã' }, 'VALIDATION_FAILED'],
      ['no subject at all', { studyDate: '2026-10-03' }, 'VALIDATION_FAILED'],
      ['unknown subject id', { subjectId: 999999, studyDate: '2026-10-03' }, 'NOT_FOUND'],
      ['archived subject', { subjectId: archivedId, studyDate: '2026-10-03' }, 'VALIDATION_FAILED'],
      ['name already taken', { newSubjectName: 'Existente', studyDate: '2026-10-03' }, 'SUBJECT_CONFLICT'],
      ['stale revision', { ...INPUT, expectedRevision: draft.revision - 1 }, 'REVISION_CONFLICT'],
    ];
    for (const [label, input, code] of cases) {
      const withRev = { expectedRevision: draft.revision, ...input };
      assert.throws(() => acceptDraft(db, userId, draftId, withRev), (e) => e.code === code, `acceptDraft: ${label}`);
      assert.throws(() => previewAcceptance(db, userId, draftId, withRev), (e) => e.code === code, `preview: ${label}`);
    }
    assert.equal(db.prepare("SELECT status FROM generated_drafts WHERE id = ?").get(draftId).status, 'DRAFT', 'the refusals above accepted nothing');

    // source text changed after generation
    db.prepare("UPDATE generated_drafts SET input_sha256 = 'changed' WHERE id = ?").run(draftId);
    assert.throws(() => acceptDraft(db, userId, draftId, { ...INPUT, expectedRevision: draft.revision }), (e) => e.code === 'SOURCE_CHANGED');
    assert.throws(() => previewAcceptance(db, userId, draftId, INPUT), (e) => e.code === 'SOURCE_CHANGED');
  } finally { cleanup(); }
});

test('a lesson whose questions are all rejected cannot be previewed (same refusal as accepting)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pv5@example.com');
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['conteudo de teste da aula']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(db, userId, source.id, { sourcesDir });
    const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
    const generated = await drafts.createDraft(db, userId, proposal.id, {});
    let d = drafts.replaceDraftContent(db, userId, generated.id, { summary: 'Resumo', questions: [q('A'), q('B')] });
    for (const x of d.questions) d = drafts.reviseQuestion(db, userId, generated.id, x.id, { status: 'REJECTED' });
    assert.throws(() => acceptDraft(db, userId, generated.id, { ...INPUT, expectedRevision: d.revision }), (e) => e.code === 'VALIDATION_FAILED');
    assert.throws(() => previewAcceptance(db, userId, generated.id, INPUT), (e) => e.code === 'VALIDATION_FAILED');
  } finally { cleanup(); }
});

test('previewing an ALREADY accepted draft returns the frozen result of the acceptance and nothing else', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pv6@example.com');
    const { draftId, draft } = await richLesson(db, sourcesDir, userId);
    const result = acceptDraft(db, userId, draftId, { ...INPUT, expectedRevision: draft.revision });
    const preview = previewAcceptance(db, userId, draftId, { newSubjectName: 'Outra', studyDate: '2027-01-01' });
    assert.equal(preview.status, 'ACCEPTED');
    assert.deepEqual(preview.acceptance, result);
  } finally { cleanup(); }
});

test('HTTP: GET /v1/drafts/:id/accept-preview needs a session, is scoped to the owner and does not change the draft', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS } });
  try {
    async function login(email) {
      const password = 'a genuinely long test password 1';
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
      const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
      const cookie = res.headers['set-cookie'].split(';')[0];
      return { cookie, userId: db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()).id };
    }
    const owner = await login('pv-owner@example.com');
    const stranger = await login('pv-stranger@example.com');
    const { draftId, draft } = await richLesson(db, sourcesDir, owner.userId);
    const url = `/v1/drafts/${draftId}/accept-preview?newSubjectName=${encodeURIComponent('Fisiologia Renal')}&studyDate=2026-10-03&expectedRevision=${draft.revision}`;
    const before = { counts: counts(db), row: draftRow(db, draftId) };

    const ok = await app.inject({ method: 'GET', url, headers: { cookie: owner.cookie } });
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body).preview;
    assert.equal(body.exercises.length, 4);
    assert.equal(body.excluded.length, 1);

    assert.equal((await app.inject({ method: 'GET', url, headers: { cookie: stranger.cookie } })).statusCode, 404);
    assert.ok([401, 403].includes((await app.inject({ method: 'GET', url })).statusCode));
    const bad = await app.inject({ method: 'GET', url: `/v1/drafts/${draftId}/accept-preview?studyDate=2026-02-30&newSubjectName=X`, headers: { cookie: owner.cookie } });
    assert.equal(bad.statusCode, 400);

    assert.deepEqual(counts(db), before.counts);
    assert.equal(draftRow(db, draftId), before.row);
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
