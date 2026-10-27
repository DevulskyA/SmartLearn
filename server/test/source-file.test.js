// R4 (back to the material): the student can open the ORIGINAL PDF of a source. Only its owner, only bytes that still match the
// checksum recorded at upload, read-only, never cached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const UPLOAD = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const PASSWORD = 'a genuinely long test password 1';

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-source-file-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const sourcesDir = join(dir, 'sources');
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir, ...UPLOAD } });
  const login = async (email) => {
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
    const cookie = res.headers['set-cookie'].split(';')[0];
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
    return { cookie, csrf: me.csrfToken };
  };
  const upload = async ({ cookie, csrf }, buffer) => {
    const boundary = '----slboundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aula.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      buffer, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({ method: 'POST', url: '/v1/sources', headers: { origin: ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    return JSON.parse(res.body).source.id;
  };
  return { app, db, dir, sourcesDir, login, upload, cleanup: async () => { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('the owner opens the original PDF: exact bytes, inline, never cached; others and anonymous get nothing', async () => {
  const t = await boot();
  try {
    const alice = await t.login('alice@example.com');
    const bob = await t.login('bob@example.com');
    const pdf = buildFixturePdf(['pagina um', 'pagina dois']);
    const id = await t.upload(alice, pdf);

    const ok = await t.app.inject({ method: 'GET', url: `/v1/sources/${id}/file`, headers: { cookie: alice.cookie } });
    assert.equal(ok.statusCode, 200);
    assert.match(ok.headers['content-type'], /^application\/pdf/);
    assert.match(ok.headers['content-disposition'], /^inline/);
    assert.match(ok.headers['cache-control'], /no-store/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.ok(Buffer.compare(ok.rawPayload, pdf) === 0, 'the bytes are the uploaded bytes');

    assert.equal((await t.app.inject({ method: 'GET', url: `/v1/sources/${id}/file`, headers: { cookie: bob.cookie } })).statusCode, 404, 'another user cannot read it');
    assert.equal((await t.app.inject({ method: 'GET', url: `/v1/sources/${id}/file` })).statusCode, 401, 'anonymous cannot read it');
    assert.equal((await t.app.inject({ method: 'GET', url: '/v1/sources/abc/file', headers: { cookie: alice.cookie } })).statusCode, 400);
  } finally { await t.cleanup(); }
});

test('a stored file that no longer matches its checksum, or is gone, is refused (409) instead of served', async () => {
  const t = await boot();
  try {
    const alice = await t.login('alice@example.com');
    const id = await t.upload(alice, buildFixturePdf(['pagina um']));
    const [stored] = readdirSync(t.sourcesDir);
    writeFileSync(join(t.sourcesDir, stored), Buffer.from('%PDF-1.4 tampered'));
    const tampered = await t.app.inject({ method: 'GET', url: `/v1/sources/${id}/file`, headers: { cookie: alice.cookie } });
    assert.equal(tampered.statusCode, 409);
    assert.equal(JSON.parse(tampered.body).error.code, 'SOURCE_INTEGRITY_FAILED');
    rmSync(join(t.sourcesDir, stored));
    const gone = await t.app.inject({ method: 'GET', url: `/v1/sources/${id}/file`, headers: { cookie: alice.cookie } });
    assert.equal(gone.statusCode, 409);
    assert.equal(JSON.parse(gone.body).error.code, 'SOURCE_FILE_MISSING');
  } finally { await t.cleanup(); }
});
