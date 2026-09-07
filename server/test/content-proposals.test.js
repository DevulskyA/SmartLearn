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
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-proposals-'));
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

async function extractedSource(db, userId, sourcesDir, pagesText) {
  const buffer = buildFixturePdf(pagesText);
  const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  return source;
}

test('chunking a source that has not been extracted yet is rejected', () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const buffer = buildFixturePdf(['page one']);
    const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'x.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });

    assert.throws(() => proposals.chunkSource(db, userId, source.id), (err) => err.code === 'NOT_EXTRACTED');
  } finally { cleanup(); }
});

test('chunk boundaries partition every page exactly once, in order, with no page silently discarded', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const pagesText = Array.from({ length: 5 }, (_, i) => `page ${i + 1} content`);
    const source = await extractedSource(db, userId, sourcesDir, pagesText);

    const result = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 2 });
    assert.equal(result.length, 3);
    assert.deepEqual(result.map(p => [p.pageStart, p.pageEnd]), [[1, 2], [3, 4], [5, 5]]);
    assert.deepEqual(result.map(p => p.chunkIndex), [0, 1, 2]);

    // Union of every chunk's page range must equal exactly pages 1..5, no gaps or overlaps.
    const coveredPages = new Set();
    for (const p of result) for (let page = p.pageStart; page <= p.pageEnd; page++) coveredPages.add(page);
    assert.deepEqual([...coveredPages].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  } finally { cleanup(); }
});

test('every proposed unit is attributable to exact source segments: the excerpt is the real, unmodified source text for that page range', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const source = await extractedSource(db, userId, sourcesDir, ['Introdução à Farmacologia', 'Mecanismos de ação']);

    const created = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });
    assert.equal(created.length, 2);

    const first = proposals.getProposal(db, userId, created[0].id);
    assert.equal(first.excerpt, 'Introdução à Farmacologia');
    const second = proposals.getProposal(db, userId, created[1].id);
    assert.equal(second.excerpt, 'Mecanismos de ação');
  } finally { cleanup(); }
});

test('listProposals returns a truncated excerpt for quick preview; getProposal returns the full text for real inspection', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const longText = 'X'.repeat(500);
    const source = await extractedSource(db, userId, sourcesDir, [longText]);
    const created = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });

    const listed = proposals.listProposals(db, userId, source.id);
    assert.ok(listed[0].excerpt.length < 500, 'list view must truncate for preview');

    const detail = proposals.getProposal(db, userId, created[0].id);
    assert.equal(detail.excerpt.length, 500, 'detail view must return the untruncated text');
  } finally { cleanup(); }
});

test('manual correction before acceptance: renaming a proposal updates its title; an empty title is rejected', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const source = await extractedSource(db, userId, sourcesDir, ['conteudo']);
    const [created] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });

    const renamed = proposals.renameProposal(db, userId, created.id, 'Aula revisada: introdução');
    assert.equal(renamed.title, 'Aula revisada: introdução');
    assert.equal(proposals.getProposal(db, userId, created.id).title, 'Aula revisada: introdução');

    assert.throws(() => proposals.renameProposal(db, userId, created.id, '   '), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'title');
  } finally { cleanup(); }
});

test('re-chunking a source replaces its prior proposals wholesale, never accumulating stale ones', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const source = await extractedSource(db, userId, sourcesDir, ['p1', 'p2', 'p3', 'p4']);

    proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 2 });
    assert.equal(proposals.listProposals(db, userId, source.id).length, 2);

    proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });
    const rechunked = proposals.listProposals(db, userId, source.id);
    assert.equal(rechunked.length, 4, 're-chunking must replace, not append to, the previous proposal set');
  } finally { cleanup(); }
});

test('a user cannot chunk, list, inspect, or rename proposals for a source owned by another user', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'g@example.com');
    const userB = makeUser(db, 'h@example.com');
    const source = await extractedSource(db, userA, sourcesDir, ['owned by A']);
    const [created] = proposals.chunkSource(db, userA, source.id, { maxPagesPerChunk: 1 });

    assert.throws(() => proposals.chunkSource(db, userB, source.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => proposals.listProposals(db, userB, source.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => proposals.getProposal(db, userB, created.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => proposals.renameProposal(db, userB, created.id, 'hacked'), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

function buildMultipartBody(boundary, { fieldName, filename, contentType, buffer }) {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([head, buffer, tail]);
}

test('HTTP: full pipeline over real HTTP — upload, extract, chunk, list, inspect, and rename a proposal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-proposals-http-'));
  const path = join(dir, 'test.db');
  const sourcesDir = join(dir, 'sources');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, {
    isProduction: false, allowedOrigins: [TEST_ORIGIN],
    sources: { sourcesDir, ...UPLOAD_DEFAULTS },
  });
  try {
    const email = 'httpproposals@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const boundary = 'sl-proposals-boundary';
    const body = buildMultipartBody(boundary, { fieldName: 'file', filename: 'aula.pdf', contentType: 'application/pdf', buffer: buildFixturePdf(['pagina um', 'pagina dois']) });
    const uploadRes = await app.inject({
      method: 'POST', url: '/v1/sources',
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    assert.equal(uploadRes.statusCode, 201);
    const sourceId = JSON.parse(uploadRes.body).source.id;

    const extractRes = await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/extract`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken } });
    assert.equal(extractRes.statusCode, 200);
    assert.equal(JSON.parse(extractRes.body).extraction.status, 'EXTRACTED');

    const chunkRes = await app.inject({
      method: 'POST', url: `/v1/sources/${sourceId}/proposals`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { maxPagesPerChunk: 1 },
    });
    assert.equal(chunkRes.statusCode, 201);
    const created = JSON.parse(chunkRes.body).proposals;
    assert.equal(created.length, 2);

    const listRes = await app.inject({ method: 'GET', url: `/v1/sources/${sourceId}/proposals`, headers: { cookie } });
    assert.equal(JSON.parse(listRes.body).proposals.length, 2);

    const detailRes = await app.inject({ method: 'GET', url: `/v1/proposals/${created[0].id}`, headers: { cookie } });
    assert.equal(JSON.parse(detailRes.body).proposal.excerpt, 'pagina um');

    const renameRes = await app.inject({
      method: 'PATCH', url: `/v1/proposals/${created[0].id}`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { title: 'Aula: primeira parte' },
    });
    assert.equal(renameRes.statusCode, 200);
    assert.equal(JSON.parse(renameRes.body).proposal.title, 'Aula: primeira parte');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
