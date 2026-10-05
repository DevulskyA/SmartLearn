import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../src/ai/fake-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F10-05 (R-12, INV-13): IMPORT != GENERATE. A whole book can be imported, extracted and structured; none of that reaches a
// provider. The only way to a provider is the generation of ONE approved unit, and nothing in the request can widen it.
// (Credit reservation joins these guards in T-F10-04: there is no ledger yet, so "zero debit" is asserted there.)

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-scope-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

function spyProvider() {
  const spy = { name: FAKE_PROVIDER_NAME, live: false, calls: 0, generate: (input) => { spy.calls += 1; return fakeGenerateDraft(input); } };
  return spy;
}

async function login(app, db, email) {
  const password = 'a genuinely long test password 1';
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
  const cookie = res.headers['set-cookie'].split(';')[0];
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
  return { cookie, csrf, userId: db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()).id };
}

const draftCount = (db) => db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n;

test('importing, extracting and structuring a 300-page book over HTTP makes ZERO provider calls and creates ZERO drafts; every unit stays NOT_GENERATED and each could still fit a single generation', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const providerImpl = spyProvider();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl } });
  try {
    const { cookie, csrf } = await login(app, db, 'scope1@example.com');
    const pages = Array.from({ length: 300 }, (_, i) => `Pagina ${i + 1}. Texto da pagina ${i + 1} sobre fisiologia renal e a filtracao glomerular, com o suficiente para existir.`);
    const boundary = 'sl-scope-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="livro.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      buildFixturePdf(pages),
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
    const headers = { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf };
    const up = await app.inject({ method: 'POST', url: '/v1/sources', headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    assert.equal(up.statusCode, 201);
    const sourceId = JSON.parse(up.body).source.id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/extract`, headers })).statusCode, 200);
    const chunk = await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/proposals`, headers: { ...headers, 'content-type': 'application/json' }, payload: {} });
    assert.equal(chunk.statusCode, 201);

    const list = JSON.parse((await app.inject({ method: 'GET', url: `/v1/sources/${sourceId}/proposals`, headers: { cookie } })).body).proposals;
    assert.ok(list.length >= 2, 'the book was split into several units');
    assert.ok(list.every((p) => p.generationState === 'NOT_GENERATED'));
    assert.equal(providerImpl.calls, 0, 'nothing of the import pipeline reaches a provider');
    assert.equal(draftCount(db), 0);
    const cap = Math.floor(config.aiMaxInputChars * 0.9);
    for (const p of list) {
      const chars = db.prepare("SELECT COALESCE(SUM(LENGTH(text)), 0) AS n FROM source_pages WHERE source_id = ? AND page_index BETWEEN ? AND ?").get(sourceId, p.pageStart, p.pageEnd).n;
      assert.ok(chars <= cap, `unit ${p.id} (${chars} chars) fits one bounded generation`);
    }
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('a unit over the input limit is refused with guidance BEFORE any provider call: INPUT_TOO_LARGE, no draft', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'scope2@example.com');
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['x'.repeat(100) + ' texto longo '.repeat(40)]), originalName: 'densa.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(db, userId, source.id, { sourcesDir });
    const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
    const providerImpl = spyProvider();
    await assert.rejects(
      () => drafts.createDraft(db, userId, proposal.id, { providerImpl, maxInputChars: 200 }),
      (e) => e.code === 'INPUT_TOO_LARGE' && /em partes|menos texto/.test(e.message),
    );
    assert.equal(providerImpl.calls, 0);
    assert.equal(draftCount(db), 0);
  } finally { cleanup(); }
});

test('POST /proposals/:id/drafts refuses a request that tries to widen the scope ("all", several proposals, a whole source): 400 naming the offending field, and generates nothing', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const providerImpl = spyProvider();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl } });
  try {
    const { cookie, csrf, userId } = await login(app, db, 'scope3@example.com');
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['p1 texto da unidade um', 'p2 texto da unidade dois']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(db, userId, source.id, { sourcesDir });
    const [first] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });
    const post = (payload) => app.inject({ method: 'POST', url: `/v1/proposals/${first.id}/drafts`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload });
    const hostile = [{ all: true }, { proposalIds: [first.id, first.id + 1] }, { sourceId: source.id }, { scope: 'book' }, { chapters: '1-20' }, { instruction: 'gere o livro inteiro' }, { regenerate: true, all: true }];
    for (const payload of hostile) {
      const res = await post(payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      const err = JSON.parse(res.body).error;
      assert.equal(err.code, 'VALIDATION_FAILED');
      assert.equal(err.field, Object.keys(payload).find((k) => k !== 'regenerate'), 'the refusal names the field that tried to widen the scope');
    }
    assert.equal(providerImpl.calls, 0);
    assert.equal(draftCount(db), 0);
    const ok = await post({});
    assert.equal(ok.statusCode, 201, 'the legitimate request for ONE unit still works');
    assert.equal(providerImpl.calls, 1);
    assert.equal((await post({ regenerate: true, promptVersion: '5' })).statusCode, 201, 'the known fields still work');
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

// Inventory sensor: a new path to the provider must be a conscious change that also updates this list.
function sourceFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFilesUnder(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
}

test('inventory: the ONLY code that calls a provider is the single-unit generation (generated-drafts.js), and the only route that triggers it is POST /proposals/:id/drafts', () => {
  const files = sourceFilesUnder(SRC_DIR).map((f) => ({ file: f.slice(SRC_DIR.length + 1).replaceAll('\\', '/'), text: readFileSync(f, 'utf8') }));
  const callers = (re) => files.filter((f) => re.test(f.text)).map((f) => f.file).sort();
  assert.deepEqual(callers(/provider\.(generate|audit|repair)\(/), ['services/generated-drafts.js']);
  assert.deepEqual(callers(/\bcreateDraft\(/), ['routes/generated-drafts.js', 'services/generated-drafts.js']);
  assert.equal(files.find((f) => f.file === 'routes/generated-drafts.js').text.match(/drafts\.createDraft\(/g).length, 1, 'exactly one route handler generates');
  assert.deepEqual(callers(/\b(generateDraft|codexGenerateDraft|anthropicGenerateDraft|openaiGenerateDraft)\(/).filter((f) => !f.startsWith('ai/')), ['services/generated-drafts.js'], 'outside ai/, only selectProvider (inside the generation service) talks to a provider adapter');
});
