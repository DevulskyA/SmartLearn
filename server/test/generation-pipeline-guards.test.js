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
import * as settings from '../src/services/settings.js';
import { estimateCostUnits, getUsage } from '../src/services/generation-budget.js';
import { ProviderRequestError } from '../src/ai/anthropic-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F10-04b (R-12, R-13, INV-13): the single path to a provider runs, in this order:
//   reuse -> approved scope -> content language -> estimate -> RESERVE -> provider -> validate -> SETTLE / RELEASE
// A real (live) provider is never called without a reservation inside the limits; a failure before any external call
// debits nothing; a failure after the call is charged at the estimate; no path leaves a reservation open. Providers here are
// spies: no model is ever called.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const PT = 'O rim é um órgão que filtra o sangue e a urina é formada nos néfrons, que são as unidades funcionais do rim. A taxa de filtração glomerular é o volume de plasma que é filtrado para os capilares do glomérulo por minuto e pode ser medida com a inulina, que não é reabsorvida nem secretada pelos túbulos.';
const EN = 'The kidney is an organ that filters the blood and the urine is formed in the nephrons, which are the functional units of the kidney. The glomerular filtration rate is the volume of plasma that is filtered into the capillaries of the glomerulus per minute and it can be measured with inulin that is neither reabsorbed nor secreted by the tubules.';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-pipeline-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  const id = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
  settings.ensureGenerationLocale(db, id, 'pt-BR');
  return id;
}

async function units(db, userId, sourcesDir, count = 1) {
  const pages = Array.from({ length: count }, (_, i) => `# Capitulo ${i + 1}\n${EN}`);
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(pages), originalName: 'livro.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  return proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });
}

const canned = (text, pageIndex = 1) => ({
  summary: text, summarySourceSpans: [{ pageIndex }],
  questions: [{ question: text, answer: text, explanation: null, hint: null, sourceSpans: [{ pageIndex }] }],
  modelVersion: 'spy-v1', promptVersion: '5',
});

// A LIVE provider spy: counts calls, can answer in a language, fail in a chosen way, wait (to interleave jobs), audit.
function liveSpy({ answer = PT, fail = null, wait = 0, withAudit = false, onGenerate = null } = {}) {
  const spy = {
    name: 'ANTHROPIC', live: true, calls: 0,
    generate: async (input) => {
      spy.calls += 1;
      if (onGenerate) onGenerate();
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (fail) throw fail;
      return canned(answer, input.segments[0].pageIndex);
    },
  };
  if (withAudit) spy.audit = async () => ({ malformed: false, findings: [] });
  return spy;
}

const ledger = (db) => db.prepare('SELECT state, estimated_units AS est, consumed_units AS used, consumption_basis AS basis FROM generation_reservations ORDER BY id').all();
const payloadChars = (db, userId, proposalId) => drafts.prepareGeneration(db, userId, proposalId).found.segments.reduce((n, s) => n + s.text.length, 0);
const drafted = (db) => db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n;
const OPEN = { maxPerJob: null, weekly: null, monthly: null };

test('success: a live generation reserves BEFORE the call (the provider sees the open reservation), then settles at the estimate of the calls actually made', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg1@example.com');
    const [unit] = await units(db, userId, sourcesDir);
    const chars = payloadChars(db, userId, unit.id);
    let seenDuringCall = null;
    const providerImpl = liveSpy({ onGenerate: () => { seenDuringCall = ledger(db); } });
    await drafts.createDraft(db, userId, unit.id, { providerImpl, budgetLimits: OPEN });
    assert.equal(seenDuringCall.length, 1, 'a bypass that calls the provider first would see no reservation');
    assert.equal(seenDuringCall[0].state, 'RESERVED');
    assert.equal(seenDuringCall[0].est, estimateCostUnits({ payloadChars: chars, calls: 1 }));
    const [row] = ledger(db);
    assert.equal(row.state, 'SETTLED');
    assert.equal(row.used, estimateCostUnits({ payloadChars: chars, calls: 1 }));
    assert.equal(row.basis, 'ESTIMATED');
  } finally { cleanup(); }
});

test('an independent audit counts as a call: the reservation covers generate+audit and settles at the two calls made', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg2@example.com');
    const [unit] = await units(db, userId, sourcesDir);
    const chars = payloadChars(db, userId, unit.id);
    await drafts.createDraft(db, userId, unit.id, { providerImpl: liveSpy({ withAudit: true }), budgetLimits: OPEN });
    const [row] = ledger(db);
    assert.equal(row.est, estimateCostUnits({ payloadChars: chars, calls: 2 }));
    assert.equal(row.used, estimateCostUnits({ payloadChars: chars, calls: 2 }));
  } finally { cleanup(); }
});

test('insufficient balance (per job, weekly, monthly): refused BEFORE the provider, nothing reserved, nothing stored, BUDGET_EXCEEDED', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg3@example.com');
    const [unit] = await units(db, userId, sourcesDir);
    for (const limits of [{ ...OPEN, maxPerJob: 10 }, { ...OPEN, weekly: 10 }, { ...OPEN, monthly: 10 }]) {
      const providerImpl = liveSpy();
      await assert.rejects(() => drafts.createDraft(db, userId, unit.id, { providerImpl, budgetLimits: limits }), (e) => e.code === 'BUDGET_EXCEEDED', JSON.stringify(limits));
      assert.equal(providerImpl.calls, 0);
    }
    assert.deepEqual(ledger(db), []);
    assert.equal(drafted(db), 0);
  } finally { cleanup(); }
});

test('failure BEFORE any external call (no credentials, CLI missing/not logged in) RELEASES the reservation: zero debit, balance intact', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg4@example.com');
    const [unit] = await units(db, userId, sourcesDir);
    for (const code of ['MISSING_CREDENTIALS', 'CODEX_NOT_FOUND', 'CODEX_NOT_AUTHENTICATED', 'CALL_LIMIT_EXCEEDED']) {
      await assert.rejects(() => drafts.createDraft(db, userId, unit.id, { providerImpl: liveSpy({ fail: new ProviderRequestError(code, 'x') }), budgetLimits: OPEN }), (e) => e.code === code);
    }
    const rows = ledger(db);
    assert.equal(rows.length, 4, 'each attempt reserved first, then released');
    assert.ok(rows.every((r) => r.state === 'RELEASED' && r.used === 0));
    assert.equal(getUsage(db, userId, { limits: { ...OPEN, weekly: 1_000_000 } }).weekly.consumed, 0);
    assert.equal(drafted(db), 0);
  } finally { cleanup(); }
});

test('failure AFTER the call may have been made (timeout, provider error, invalid draft, wrong language) is charged at the estimate and leaves no open reservation', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg5@example.com');
    const [unit] = await units(db, userId, sourcesDir);
    const chars = payloadChars(db, userId, unit.id);
    const cases = [
      ['provider error', liveSpy({ fail: new ProviderRequestError('PROVIDER_ERROR', 'boom') }), 'PROVIDER_ERROR'],
      ['timeout', liveSpy({ wait: 60 }), 'TIMEOUT'],
      ['wrong language', liveSpy({ answer: EN }), 'LANGUAGE_MISMATCH'],
    ];
    for (const [label, providerImpl, code] of cases) {
      await assert.rejects(() => drafts.createDraft(db, userId, unit.id, { providerImpl, budgetLimits: OPEN, timeoutMs: label === 'timeout' ? 10 : 30_000 }), (e) => e.code === code, label);
    }
    const rows = ledger(db);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.state === 'SETTLED' && r.used === estimateCostUnits({ payloadChars: chars, calls: 1 }) && r.basis === 'ESTIMATED'));
    assert.equal(drafted(db), 0, 'nothing was stored in any of them');
  } finally { cleanup(); }
});

test('CONCURRENT generations contend for one balance: 5 interleaved requests for room for 2 -> 2 reach the provider, 3 get BUDGET_EXCEEDED', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg6@example.com');
    const found = await units(db, userId, sourcesDir, 5);
    const one = estimateCostUnits({ payloadChars: payloadChars(db, userId, found[0].id), calls: 1 });
    const limits = { ...OPEN, weekly: one * 2 + 5 };
    const providerImpl = liveSpy({ wait: 15 });
    const results = await Promise.allSettled(found.map((u) => drafts.createDraft(db, userId, u.id, { providerImpl, budgetLimits: limits })));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.code === 'BUDGET_EXCEEDED').length, 3);
    assert.equal(providerImpl.calls, 2, 'only the reservations that fit ever reached the provider');
    const u = getUsage(db, userId, { limits });
    assert.ok(u.weekly.reserved + u.weekly.consumed <= limits.weekly);
  } finally { cleanup(); }
});

test('"generate chapters 1-20" as 20 requests stays bounded by the period: only as many units as the balance allows reach the provider', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg7@example.com');
    const found = await units(db, userId, sourcesDir, 20);
    const one = estimateCostUnits({ payloadChars: payloadChars(db, userId, found[0].id), calls: 1 });
    const limits = { ...OPEN, weekly: one * 3 + 10 };
    const providerImpl = liveSpy();
    let ok = 0;
    for (const u of found) {
      try { await drafts.createDraft(db, userId, u.id, { providerImpl, budgetLimits: limits }); ok += 1; } catch (e) { assert.equal(e.code, 'BUDGET_EXCEEDED'); }
    }
    assert.equal(ok, 3);
    assert.equal(providerImpl.calls, 3);
    assert.equal(ledger(db).length, 3);
  } finally { cleanup(); }
});

test('reuse, a non-live provider, a refused scope and a refused provider selection NEVER touch the ledger', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'pg8@example.com');
    const [unit] = await units(db, userId, sourcesDir);
    // reuse: the second request returns the first draft with no reservation
    const live = liveSpy();
    await drafts.createDraft(db, userId, unit.id, { providerImpl: live, budgetLimits: OPEN });
    const before = ledger(db);
    await drafts.createDraft(db, userId, unit.id, { providerImpl: live, budgetLimits: OPEN });
    assert.deepEqual(ledger(db), before);
    // a non-live provider (the deterministic double) spends nothing external
    const fake = { name: 'FAKE', live: false, generate: async () => canned(PT) };
    await drafts.createDraft(db, userId, unit.id, { providerImpl: fake, budgetLimits: { ...OPEN, weekly: 1 }, regenerate: true });
    assert.deepEqual(ledger(db), before);
    // a scope refusal comes before any reservation
    await assert.rejects(() => drafts.createDraft(db, userId, unit.id, { providerImpl: liveSpy(), budgetLimits: OPEN, regenerate: true, maxInputChars: 5 }), (e) => e.code === 'INPUT_TOO_LARGE');
    // a declared provider that cannot be selected (no credentials) fails before any reservation
    await assert.rejects(() => drafts.createDraft(db, userId, unit.id, { provider: 'ANTHROPIC', budgetLimits: OPEN, regenerate: true }), (e) => e.code === 'MISSING_CREDENTIALS');
    assert.deepEqual(ledger(db), before);
  } finally { cleanup(); }
});

test('HTTP: an exhausted balance answers 429 BUDGET_EXCEEDED with the dimension in the message and calls nothing', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const providerImpl = liveSpy();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl, budgetLimits: { ...OPEN, weekly: 5 } } });
  try {
    const email = 'pg9@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const [unit] = await units(db, userId, sourcesDir);
    const res = await app.inject({ method: 'POST', url: `/v1/proposals/${unit.id}/drafts`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload: {} });
    assert.equal(res.statusCode, 429);
    const err = JSON.parse(res.body).error;
    assert.equal(err.code, 'BUDGET_EXCEEDED');
    assert.match(err.message, /semanal/);
    assert.equal(providerImpl.calls, 0);
    assert.deepEqual(ledger(db), []);
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
