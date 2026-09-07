import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as imports from '../src/services/imports.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function loadFixture(name) {
  const path = fileURLToPath(new URL('./import-fixtures/' + name, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-imports-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function post(app, url, payload, headers = {}) {
  return app.inject({ method: 'POST', url, payload, headers: { origin: TEST_ORIGIN, ...headers } });
}

async function registerAndAuth(app, email) {
  await post(app, '/v1/auth/register', { email, password: 'a genuinely long test password 1' });
  const loginRes = await post(app, '/v1/auth/login', { email, password: 'a genuinely long test password 1' });
  const cookie = loginRes.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  const body = JSON.parse(me.body);
  return { cookie, csrfToken: body.csrfToken, userId: body.user.id };
}

function countRows(db, table, userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;
}

test('T26: preview changes zero learning rows and reports real counts', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'alice@example.com');
    const rawSource = loadFixture('v3-schema.json');

    const res = await post(app, '/v1/imports/preview', { rawSource }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 200);
    const { preview } = JSON.parse(res.body);
    assert.equal(preview.sourceVersion, 3);
    assert.deepEqual(preview.counts, { subjects: 1, learningUnits: 1, reviewTasks: 2, exercises: 1, learningEvidence: 1 });
    assert.equal(preview.conflicts.length, 0);
    assert.equal(preview.mapping.filter((m) => m.entity === 'subject' && m.action === 'CREATE').length, 1);

    for (const table of ['subjects', 'learning_units', 'review_tasks', 'exercises', 'learning_evidence']) {
      assert.equal(countRows(db, table, userId), 0, table + ' must be untouched by a preview');
    }
  } finally { cleanup(); }
});

test('T26: a subject name colliding with an existing owned subject is reported as a conflict, not silently mapped to CREATE', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'bob@example.com');
    await post(app, '/v1/subjects', { name: 'Farmacologia' }, { cookie, 'x-csrf-token': csrfToken });

    const res = await post(app, '/v1/imports/preview', { rawSource: loadFixture('v3-schema.json') }, { cookie, 'x-csrf-token': csrfToken });
    const { preview } = JSON.parse(res.body);
    assert.equal(preview.conflicts.length, 1);
    assert.equal(preview.conflicts[0].reason, 'NAME_ALREADY_EXISTS');
    const subjectMapping = preview.mapping.find((m) => m.entity === 'subject');
    assert.equal(subjectMapping.action, 'CONFLICT');
  } finally { cleanup(); }
});

test('T26: cross-user reuse fails — a preview owned by one account is invisible to another', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie: cookieA, csrfToken: csrfA } = await registerAndAuth(app, 'carol@example.com');
    const createRes = await post(app, '/v1/imports/preview', { rawSource: loadFixture('v3-schema.json') }, { cookie: cookieA, 'x-csrf-token': csrfA });
    const previewId = JSON.parse(createRes.body).preview.id;

    const { cookie: cookieB } = await registerAndAuth(app, 'dave@example.com');
    const getAsB = await app.inject({ method: 'GET', url: '/v1/imports/' + previewId, headers: { origin: TEST_ORIGIN, cookie: cookieB } });
    assert.equal(getAsB.statusCode, 404);

    const getAsA = await app.inject({ method: 'GET', url: '/v1/imports/' + previewId, headers: { origin: TEST_ORIGIN, cookie: cookieA } });
    assert.equal(getAsA.statusCode, 200);
  } finally { cleanup(); }
});

test('T26: an unsupported/unknown source schema is rejected, no preview row is created', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'erin@example.com');
    const res = await post(app, '/v1/imports/preview', { rawSource: loadFixture('unsupported-version.json') }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_SOURCE');
    assert.ok(body.error.details.issues.some((i) => i.code === 'UNSUPPORTED_VERSION'));

    const { count } = db.prepare('SELECT COUNT(*) AS count FROM import_previews WHERE user_id = ?').get(userId);
    assert.equal(count, 0);
  } finally { cleanup(); }
});

test('T26: resubmitting the exact same bytes renews the same preview row instead of creating a duplicate', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'frank@example.com');
    const rawSource = loadFixture('v3-schema.json');
    const first = JSON.parse((await post(app, '/v1/imports/preview', { rawSource }, { cookie, 'x-csrf-token': csrfToken })).body).preview;
    const second = JSON.parse((await post(app, '/v1/imports/preview', { rawSource }, { cookie, 'x-csrf-token': csrfToken })).body).preview;
    assert.equal(first.id, second.id);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM import_previews WHERE user_id = ?').get(userId);
    assert.equal(count, 1);
  } finally { cleanup(); }
});

// --- service-level: expiry and tamper detection (needs an injectable clock) ---

test('T26: a stale (expired) preview is rejected, not silently served', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { userId } = await registerAndAuth(app, 'grace@example.com');
    const rawSource = loadFixture('v3-schema.json');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const preview = imports.createPreview(db, userId, rawSource, createdAt);

    const wellPast = new Date(createdAt.getTime() + imports.PREVIEW_LIFETIME_MS + 1000);
    assert.throws(
      () => imports.getPreview(db, userId, preview.id, wellPast),
      (err) => err instanceof imports.ImportError && err.code === 'PREVIEW_EXPIRED',
    );
  } finally { cleanup(); }
});

test('T26: a tampered resubmission (bytes changed after preview) is rejected by verifyPreview', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { userId } = await registerAndAuth(app, 'heidi@example.com');
    const rawSource = loadFixture('v3-schema.json');
    const now = new Date('2026-01-01T00:00:00.000Z');
    const preview = imports.createPreview(db, userId, rawSource, now);

    const tampered = JSON.parse(JSON.stringify(rawSource));
    tampered.learningUnits[0].title = 'Something else entirely';
    assert.throws(
      () => imports.verifyPreview(db, userId, preview.id, tampered, now),
      (err) => err instanceof imports.ImportError && err.code === 'PREVIEW_TAMPERED',
    );

    // The untampered original still verifies fine at the same instant.
    const verified = imports.verifyPreview(db, userId, preview.id, rawSource, now);
    assert.equal(verified.id, preview.id);
  } finally { cleanup(); }
});
