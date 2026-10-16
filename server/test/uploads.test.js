import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function validPdfBuffer(extra = '') {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n' + extra + '%%EOF', 'latin1');
}

function encryptedPdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF', 'latin1');
}

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-uploads-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const sourcesDir = join(dir, 'sources');
  return { db, sourcesDir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

const DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

test('a valid PDF is accepted, stored under a random filename inside sourcesDir, and recorded with its checksum', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const buffer = validPdfBuffer();
    const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'notes.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });
    assert.equal(source.originalName, 'notes.pdf');
    assert.equal(source.byteSize, buffer.length);
    assert.equal(source.checksum, sourceStorage.sha256Hex(buffer));

    const files = readdirSync(sourcesDir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^[0-9a-f]{32}\.pdf$/, 'on-disk filename must be random, never the original name');
  } finally { cleanup(); }
});

test('a fake PDF (wrong magic bytes) is rejected without creating any row or file', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const fake = Buffer.from('this is just a text file pretending to be a pdf', 'utf8');
    assert.throws(
      () => sourceStorage.acceptUpload(db, userId, { buffer: fake, originalName: 'fake.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS }),
      (err) => err.code === 'UNSUPPORTED_FILE_TYPE',
    );
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM sources WHERE user_id = ?').get(userId).n, 0);
    assert.equal(existsSync(sourcesDir) ? readdirSync(sourcesDir).length : 0, 0);
  } finally { cleanup(); }
});

test('a PDF whose trailer references /Encrypt is rejected as encrypted, with zero residual rows/files', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    assert.throws(
      () => sourceStorage.acceptUpload(db, userId, { buffer: encryptedPdfBuffer(), originalName: 'enc.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS }),
      (err) => err.code === 'ENCRYPTED_FILE_REJECTED',
    );
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM sources WHERE user_id = ?').get(userId).n, 0);
    assert.equal(existsSync(sourcesDir) ? readdirSync(sourcesDir).length : 0, 0);
  } finally { cleanup(); }
});

test('an oversize upload is rejected before any write, with zero residual rows/files', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const buffer = validPdfBuffer();
    assert.throws(
      () => sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'big.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: buffer.length - 1, quotaBytes: DEFAULTS.quotaBytes }),
      (err) => err.code === 'FILE_TOO_LARGE',
    );
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM sources WHERE user_id = ?').get(userId).n, 0);
    assert.equal(existsSync(sourcesDir) ? readdirSync(sourcesDir).length : 0, 0);
  } finally { cleanup(); }
});

test('a path-traversal payload in the original filename never escapes sourcesDir and is stored only as sanitized display metadata', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const buffer = validPdfBuffer();
    const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: '../../../../etc/passwd.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });
    assert.ok(!source.originalName.includes('/'), 'sanitized display name must never contain a path separator');
    assert.ok(!existsSync(join(sourcesDir, '..', '..', '..', '..', 'etc', 'passwd.pdf')), 'no file may ever be written outside sourcesDir');
    const files = readdirSync(sourcesDir);
    assert.equal(files.length, 1, 'exactly one file, inside sourcesDir, at the random on-disk name');
  } finally { cleanup(); }
});

test('duplicate checksum handling is explicit: a byte-identical re-upload by the same user returns the SAME source, never a second row or file', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const buffer = validPdfBuffer();
    const first = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });
    const second = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'a-copy.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });
    assert.equal(second.id, first.id);
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM sources WHERE user_id = ?').get(userId).n, 1);
    assert.equal(readdirSync(sourcesDir).length, 1);
  } finally { cleanup(); }
});

test('two different users may each upload byte-identical content without conflicting with each other', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'g@example.com');
    const userB = makeUser(db, 'h@example.com');
    const buffer = validPdfBuffer();
    const a = sourceStorage.acceptUpload(db, userA, { buffer, originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });
    const b = sourceStorage.acceptUpload(db, userB, { buffer, originalName: 'b.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });
    assert.notEqual(a.id, b.id);
    assert.equal(readdirSync(sourcesDir).length, 2);
  } finally { cleanup(); }
});

test('per-account quota is enforced: an upload that would exceed it is rejected with zero residual rows/files', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'i@example.com');
    const first = validPdfBuffer('AAAAAAAAAA');
    sourceStorage.acceptUpload(db, userId, { buffer: first, originalName: 'first.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: DEFAULTS.maxBytes, quotaBytes: first.length + 5 });

    const second = validPdfBuffer('BBBBBBBBBBBBBBBBBBBB'); // different content, different checksum, pushes usage over quota
    assert.throws(
      () => sourceStorage.acceptUpload(db, userId, { buffer: second, originalName: 'second.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: DEFAULTS.maxBytes, quotaBytes: first.length + 5 }),
      (err) => err.code === 'QUOTA_EXCEEDED',
    );
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM sources WHERE user_id = ?').get(userId).n, 1, 'only the first accepted upload counts');
    assert.equal(readdirSync(sourcesDir).length, 1);
  } finally { cleanup(); }
});

test('a wrong declared content-type is rejected even if the bytes happen to be a real PDF', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'j@example.com');
    assert.throws(
      () => sourceStorage.acceptUpload(db, userId, { buffer: validPdfBuffer(), originalName: 'x.pdf', contentType: 'text/plain', sourcesDir, ...DEFAULTS }),
      (err) => err.code === 'UNSUPPORTED_FILE_TYPE' && err.field === 'contentType',
    );
  } finally { cleanup(); }
});

test('a user cannot fetch a source owned by another user', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'k@example.com');
    const userB = makeUser(db, 'l@example.com');
    const source = sourceStorage.acceptUpload(db, userA, { buffer: validPdfBuffer(), originalName: 'mine.pdf', contentType: 'application/pdf', sourcesDir, ...DEFAULTS });

    assert.throws(() => sourceStorage.getById(db, userB, source.id), (err) => err.code === 'NOT_FOUND');
    assert.deepEqual(sourceStorage.list(db, userB), []);
  } finally { cleanup(); }
});

function buildMultipartBody(boundary, { fieldName, filename, contentType, buffer }) {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([head, buffer, tail]);
}

test('HTTP: full upload lifecycle over real multipart HTTP with a real session — wrong user gets 404, owner gets the source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-uploads-http-'));
  const path = join(dir, 'test.db');
  const sourcesDir = join(dir, 'sources');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, {
    isProduction: false, allowedOrigins: [TEST_ORIGIN],
    sources: { sourcesDir, maxBytes: DEFAULTS.maxBytes, quotaBytes: DEFAULTS.quotaBytes },
  });
  try {
    async function registerAndLogin(email) {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
      const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
      const cookie = loginRes.headers['set-cookie'].split(';')[0];
      const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
      return { cookie, csrfToken: JSON.parse(me.body).csrfToken };
    }

    const owner = await registerAndLogin('httpupload-owner@example.com');
    const stranger = await registerAndLogin('httpupload-stranger@example.com');

    const boundary = 'sl-test-boundary-1234';
    const body = buildMultipartBody(boundary, { fieldName: 'file', filename: 'aula.pdf', contentType: 'application/pdf', buffer: validPdfBuffer() });

    const uploadRes = await app.inject({
      method: 'POST', url: '/v1/sources',
      headers: { origin: TEST_ORIGIN, cookie: owner.cookie, 'x-csrf-token': owner.csrfToken, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    assert.equal(uploadRes.statusCode, 201);
    const sourceId = JSON.parse(uploadRes.body).source.id;

    const ownerGet = await app.inject({ method: 'GET', url: `/v1/sources/${sourceId}`, headers: { cookie: owner.cookie } });
    assert.equal(ownerGet.statusCode, 200);
    assert.equal(JSON.parse(ownerGet.body).source.originalName, 'aula.pdf');

    const strangerGet = await app.inject({ method: 'GET', url: `/v1/sources/${sourceId}`, headers: { cookie: stranger.cookie } });
    assert.equal(strangerGet.statusCode, 404);

    const listRes = await app.inject({ method: 'GET', url: '/v1/sources', headers: { cookie: owner.cookie } });
    assert.equal(JSON.parse(listRes.body).sources.length, 1);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('HTTP: an unsupported (non-PDF) upload is rejected with 400 and creates no source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-uploads-http2-'));
  const path = join(dir, 'test.db');
  const sourcesDir = join(dir, 'sources');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, {
    isProduction: false, allowedOrigins: [TEST_ORIGIN],
    sources: { sourcesDir, maxBytes: DEFAULTS.maxBytes, quotaBytes: DEFAULTS.quotaBytes },
  });
  try {
    const email = 'httpupload-badfile@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const boundary = 'sl-test-boundary-5678';
    const body = buildMultipartBody(boundary, { fieldName: 'file', filename: 'notes.pdf', contentType: 'application/pdf', buffer: Buffer.from('not a pdf', 'utf8') });

    const uploadRes = await app.inject({
      method: 'POST', url: '/v1/sources',
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    assert.equal(uploadRes.statusCode, 400);
    assert.equal(JSON.parse(uploadRes.body).error.code, 'UNSUPPORTED_FILE_TYPE');

    const listRes = await app.inject({ method: 'GET', url: '/v1/sources', headers: { cookie } });
    assert.equal(JSON.parse(listRes.body).sources.length, 0);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
