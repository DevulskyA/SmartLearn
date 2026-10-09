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
import { acceptDraft } from '../src/services/accept-draft.js';
import { planPrefetch, DEFAULT_PREFETCH_POLICY, MAX_PREFETCH_DEPTH } from '../src/services/generation-policy.js';
import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../src/ai/fake-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F10-03 (R-12, INV-13): generation is JIT and reuses what is already valid. Navigating again or repeating the request
// never calls the provider; regenerating is an explicit act; a 100-unit book never grows a generation queue by itself.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-reuse-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

// A provider that counts every call that would have reached a model.
function spyProvider() {
  const spy = { name: FAKE_PROVIDER_NAME, live: false, calls: 0, generate: (input) => { spy.calls += 1; return fakeGenerateDraft(input); } };
  return spy;
}

async function oneUnit(db, userId, sourcesDir, text = 'conteudo de teste da aula') {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf([text]), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  return { source, proposal };
}

const ACCEPT = { newSubjectName: 'Fisiologia', studyDate: '2026-10-03' };

test('repeating the request for the same unit reuses the valid draft: ONE provider call, the same draft id, flagged as reused', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'reuse1@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const first = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    const second = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    const third = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(providerImpl.calls, 1, 'navigating/repeating never reaches the provider again');
    assert.equal(second.id, first.id);
    assert.equal(third.id, first.id);
    assert.ok(!first.reused);
    assert.equal(second.reused, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generated_drafts WHERE user_id = ?').get(userId).n, 1);
  } finally { cleanup(); }
});

test('regenerate:true is the explicit act: exactly one more provider call, a NEW draft, the previous one untouched', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'reuse2@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const first = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    const rowBefore = JSON.stringify(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(first.id));
    const again = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true });
    assert.equal(providerImpl.calls, 2);
    assert.notEqual(again.id, first.id);
    assert.ok(!again.reused);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(first.id)), rowBefore);
  } finally { cleanup(); }
});

test('an ACCEPTED lesson is reused too: asking to generate that unit again does not call the provider', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'reuse3@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision });
    const again = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(providerImpl.calls, 1);
    assert.equal(again.id, draft.id);
    assert.equal(again.status, 'ACCEPTED');
    assert.equal(again.reused, true);
  } finally { cleanup(); }
});

test('a STALE draft (source text changed) is not reusable: generating again is allowed and calls the provider once', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'reuse4@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const first = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    db.prepare("UPDATE generated_drafts SET input_sha256 = 'changed' WHERE id = ?").run(first.id);
    assert.equal(drafts.generationState(db, userId, proposal.id), 'STALE');
    const next = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(providerImpl.calls, 2);
    assert.notEqual(next.id, first.id);
  } finally { cleanup(); }
});

test('reuse never leaks across users: another user gets NOT_FOUND and the provider is not called', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const owner = makeUser(db, 'reuse5a@example.com');
    const stranger = makeUser(db, 'reuse5b@example.com');
    const { proposal } = await oneUnit(db, owner, sourcesDir);
    const providerImpl = spyProvider();
    await drafts.createDraft(db, owner, proposal.id, { providerImpl });
    await assert.rejects(() => drafts.createDraft(db, stranger, proposal.id, { providerImpl }), (e) => e.code === 'NOT_FOUND');
    assert.equal(providerImpl.calls, 1);
  } finally { cleanup(); }
});

test('generationState follows the unit: NOT_GENERATED -> DRAFT -> ACCEPTED, and a book with many units stays NOT_GENERATED until each is asked for', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'reuse6@example.com');
    const pages = Array.from({ length: 6 }, (_, i) => `# Capitulo ${i + 1}\ntexto da unidade ${i + 1} sobre fisiologia renal e filtracao glomerular numero ${i + 1}`);
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(pages), originalName: 'livro.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(db, userId, source.id, { sourcesDir });
    const units = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });
    assert.ok(units.length >= 3, 'the fixture book has several units');
    const providerImpl = spyProvider();
    assert.ok(units.every((u) => drafts.generationState(db, userId, u.id) === 'NOT_GENERATED'));
    const draft = await drafts.createDraft(db, userId, units[0].id, { providerImpl });
    assert.equal(drafts.generationState(db, userId, units[0].id), 'DRAFT');
    assert.ok(units.slice(1).every((u) => drafts.generationState(db, userId, u.id) === 'NOT_GENERATED'), 'asking for unit 1 does not generate the others');
    assert.equal(providerImpl.calls, 1);
    acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision });
    assert.equal(drafts.generationState(db, userId, units[0].id), 'ACCEPTED');
  } finally { cleanup(); }
});

test('HTTP: POST /proposals/:id/drafts twice answers 201 then 200 (reused) and the provider is called once; regenerate:true answers 201 again', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const providerImpl = spyProvider();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl } });
  try {
    const email = 'reuse7@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const post = (payload) => app.inject({ method: 'POST', url: `/v1/proposals/${proposal.id}/drafts`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload });

    const a = await post({});
    const b = await post({});
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 200);
    assert.equal(JSON.parse(b.body).draft.id, JSON.parse(a.body).draft.id);
    assert.equal(providerImpl.calls, 1);
    const c = await post({ regenerate: true });
    assert.equal(c.statusCode, 201);
    assert.equal(providerImpl.calls, 2);
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('HTTP: the proposals list and a single proposal expose the generation state of each unit', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const providerImpl = spyProvider();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl } });
  try {
    const email = 'reuse8@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const { source, proposal } = await oneUnit(db, userId, sourcesDir);
    const list = async () => JSON.parse((await app.inject({ method: 'GET', url: `/v1/sources/${source.id}/proposals`, headers: { cookie } })).body).proposals;
    assert.deepEqual((await list()).map((p) => p.generationState), ['NOT_GENERATED']);
    await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.deepEqual((await list()).map((p) => p.generationState), ['DRAFT']);
    const one = JSON.parse((await app.inject({ method: 'GET', url: `/v1/proposals/${proposal.id}`, headers: { cookie } })).body).proposal;
    assert.equal(one.generationState, 'DRAFT');
    assert.equal(providerImpl.calls, 1, 'reading the states calls nothing');
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

// ---- prefetch policy: a pure function; nothing here runs a provider ------------------------------------------------

const ids = Array.from({ length: 120 }, (_, i) => `u${i + 1}`);
const allNew = () => new Map(ids.map((id) => [id, 'NOT_GENERATED']));
const AMPLE = { remainingUnits: 1_000_000, estimateOf: () => 1_000 };

test('prefetch policy: the default is pure JIT (depth 0) — nothing is planned', () => {
  assert.equal(DEFAULT_PREFETCH_POLICY.depth, 0);
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), ...AMPLE }), []);
});

test('prefetch policy: depth 1 plans only the NEXT unit and the other 118 stay NOT_GENERATED', () => {
  const plan = planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), ...AMPLE, policy: { depth: 1, comfortFactor: 3 } });
  assert.deepEqual(plan, ['u2']);
});

test('prefetch policy: a hostile or careless depth is capped hard (a queue can never be asked for)', () => {
  const plan = planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), ...AMPLE, policy: { depth: 500, comfortFactor: 1 } });
  assert.ok(plan.length <= MAX_PREFETCH_DEPTH);
  assert.ok(plan.length < ids.length - 1);
});

test('prefetch policy: never the current unit, never one already generated or accepted, and the window does not slide past them', () => {
  const states = allNew();
  states.set('u2', 'DRAFT');
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'u1', states, ...AMPLE, policy: { depth: 1, comfortFactor: 3 } }), [], 'the window is the next unit; it is already generated, so nothing is spent');
  states.set('u2', 'NOT_GENERATED');
  states.set('u3', 'ACCEPTED');
  const plan = planPrefetch({ orderedIds: ids, currentId: 'u1', states, ...AMPLE, policy: { depth: 2, comfortFactor: 3 } });
  assert.deepEqual(plan, ['u2'], 'u3 is accepted: it is skipped, not replaced by u4');
});

test('prefetch policy: no comfortable budget, an unknown current unit or a job already in flight means no prefetch', () => {
  const policy = { depth: 1, comfortFactor: 3 };
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), remainingUnits: 2_999, estimateOf: () => 1_000, policy }), [], 'less than 3x the estimate');
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), remainingUnits: 3_000, estimateOf: () => 1_000, policy }), ['u2'], 'exactly 3x is comfortable');
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'nope', states: allNew(), ...AMPLE, policy }), []);
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), ...AMPLE, policy, inFlight: 1 }), [], 'prefetch is subordinate to work already running');
  assert.deepEqual(planPrefetch({ orderedIds: ids, currentId: 'u120', states: allNew(), ...AMPLE, policy }), [], 'end of the book');
});

test('prefetch policy: an unlimited budget (null) counts as comfortable, but the depth cap still applies', () => {
  const plan = planPrefetch({ orderedIds: ids, currentId: 'u1', states: allNew(), remainingUnits: null, estimateOf: () => 1_000, policy: { depth: 2, comfortFactor: 3 } });
  assert.deepEqual(plan, ['u2', 'u3']);
});
