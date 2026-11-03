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
import { config } from '../src/config.js';
import * as imports from '../src/services/imports.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function loadFixture(name) {
  const path = fileURLToPath(new URL('./import-fixtures/' + name, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-import-commit-'));
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

function countAll(db, userId) {
  return {
    subjects: countRows(db, 'subjects', userId),
    learning_units: countRows(db, 'learning_units', userId),
    review_tasks: countRows(db, 'review_tasks', userId),
    exercises: countRows(db, 'exercises', userId),
    exercise_versions: countRows(db, 'exercise_versions', userId),
    learning_evidence: countRows(db, 'learning_evidence', userId),
  };
}

async function previewFor(app, cookie, csrfToken, fixture = 'v3-schema.json') {
  const res = await post(app, '/v1/imports/preview', { rawSource: loadFixture(fixture) }, { cookie, 'x-csrf-token': csrfToken });
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body).preview;
}

test('T27: commit applies the previewed rows exactly once, in one bounded transaction', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'alice@example.com');
    const preview = await previewFor(app, cookie, csrfToken);

    const res = await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 200);
    const { commit } = JSON.parse(res.body);
    assert.deepEqual(commit.counts, { subjects: 1, learningUnits: 1, reviewTasks: 2, exercises: 1, learningEvidence: 1 });

    assert.deepEqual(countAll(db, userId), {
      subjects: 1, learning_units: 1, review_tasks: 2, exercises: 1, exercise_versions: 1, learning_evidence: 1,
    });

    const unit = db.prepare('SELECT * FROM learning_units WHERE user_id = ?').get(userId);
    assert.equal(unit.title, 'Farmacocinetica');
    const tasks = db.prepare('SELECT offset_days, due_date FROM review_tasks WHERE user_id = ? ORDER BY due_date').all(userId);
    assert.deepEqual(tasks.map(t => t.offset_days), [1, 7]);
  } finally { cleanup(); }
});

test('T27: re-committing the same previewId returns the original result and adds zero records', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'bob@example.com');
    const preview = await previewFor(app, cookie, csrfToken);

    const first = JSON.parse((await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken })).body).commit;
    const beforeSecond = countAll(db, userId);
    const second = JSON.parse((await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken })).body).commit;

    assert.deepEqual(second, first);
    assert.deepEqual(countAll(db, userId), beforeSecond);
  } finally { cleanup(); }
});

test('T27: a preview owned by a different user cannot be committed (404, no rows created)', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie: cookieA, csrfToken: csrfA } = await registerAndAuth(app, 'carol@example.com');
    const preview = await previewFor(app, cookieA, csrfA);

    const { cookie: cookieB, csrfToken: csrfB, userId: userB } = await registerAndAuth(app, 'dave@example.com');
    const res = await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie: cookieB, 'x-csrf-token': csrfB });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(countRows(db, 'subjects', userB), 0);
  } finally { cleanup(); }
});

test('T27: an unresolved name conflict refuses the whole commit, zero rows created', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'erin@example.com');
    await post(app, '/v1/subjects', { name: 'Farmacologia' }, { cookie, 'x-csrf-token': csrfToken });
    const preview = await previewFor(app, cookie, csrfToken);
    assert.equal(preview.conflicts.length, 1);

    const res = await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'IMPORT_HAS_CONFLICTS');
    assert.equal(countRows(db, 'learning_units', userId), 0);
  } finally { cleanup(); }
});

test('T27: a batch over the configured row limit is rejected before any write', async () => {
  const { app, db, cleanup } = await freshApp();
  const originalMax = config.importMaxRows;
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'frank@example.com');
    const preview = await previewFor(app, cookie, csrfToken);

    config.importMaxRows = 2; // v3-schema.json normalizes to 5 total rows
    const res = await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 413);
    assert.equal(JSON.parse(res.body).error.code, 'IMPORT_TOO_LARGE');
    assert.deepEqual(countAll(db, userId), {
      subjects: 0, learning_units: 0, review_tasks: 0, exercises: 0, exercise_versions: 0, learning_evidence: 0,
    });
  } finally { config.importMaxRows = originalMax; cleanup(); }
});

// --- injected mid-commit corruption: every entity boundary rolls back everything ---

async function corruptedCommitAttempt(app, db, cookie, csrfToken, mutateNormalized) {
  const preview = await previewFor(app, cookie, csrfToken);
  const row = db.prepare('SELECT normalized_json FROM import_previews WHERE id = ?').get(preview.id);
  const normalized = JSON.parse(row.normalized_json);
  mutateNormalized(normalized);
  db.prepare('UPDATE import_previews SET normalized_json = ? WHERE id = ?').run(JSON.stringify(normalized), preview.id);
  return post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken });
}

test('T27: a corrupted subject reference on a learning unit rolls back the whole commit', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'grace@example.com');
    const res = await corruptedCommitAttempt(app, db, cookie, csrfToken, (n) => { n.learningUnits[0].legacySubjectId = 999; });
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.parse(res.body).error.code, 'IMPORT_INTEGRITY_ERROR');
    assert.deepEqual(countAll(db, userId), {
      subjects: 0, learning_units: 0, review_tasks: 0, exercises: 0, exercise_versions: 0, learning_evidence: 0,
    });
  } finally { cleanup(); }
});

test('T27: a corrupted unit reference on a review task rolls back the whole commit', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'heidi@example.com');
    const res = await corruptedCommitAttempt(app, db, cookie, csrfToken, (n) => { n.reviewTasks[0].legacyUnitId = 999; });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(countAll(db, userId), {
      subjects: 0, learning_units: 0, review_tasks: 0, exercises: 0, exercise_versions: 0, learning_evidence: 0,
    });
  } finally { cleanup(); }
});

test('T27: a corrupted unit reference on an exercise rolls back the whole commit', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'ivan@example.com');
    const res = await corruptedCommitAttempt(app, db, cookie, csrfToken, (n) => { n.exercises[0].legacyUnitId = 999; });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(countAll(db, userId), {
      subjects: 0, learning_units: 0, review_tasks: 0, exercises: 0, exercise_versions: 0, learning_evidence: 0,
    });
  } finally { cleanup(); }
});

test('T27: a corrupted review-task reference on a learning-evidence row rolls back the whole commit', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'judy@example.com');
    const res = await corruptedCommitAttempt(app, db, cookie, csrfToken, (n) => { n.learningEvidence[0].legacyReviewTaskId = 999; });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(countAll(db, userId), {
      subjects: 0, learning_units: 0, review_tasks: 0, exercises: 0, exercise_versions: 0, learning_evidence: 0,
    });
  } finally { cleanup(); }
});

test('T27: a stored count that no longer matches the actual data is caught by reconciliation, not silently committed', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken, userId } = await registerAndAuth(app, 'kevin@example.com');
    const preview = await previewFor(app, cookie, csrfToken);
    const row = db.prepare('SELECT report_json FROM import_previews WHERE id = ?').get(preview.id);
    const report = JSON.parse(row.report_json);
    report.counts.subjects = 2; // claims 2 subjects; the normalized data still only has 1
    db.prepare('UPDATE import_previews SET report_json = ? WHERE id = ?').run(JSON.stringify(report), preview.id);

    const res = await post(app, `/v1/imports/${preview.id}/commit`, {}, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.parse(res.body).error.code, 'IMPORT_INTEGRITY_ERROR');
    assert.deepEqual(countAll(db, userId), {
      subjects: 0, learning_units: 0, review_tasks: 0, exercises: 0, exercise_versions: 0, learning_evidence: 0,
    });
  } finally { cleanup(); }
});

test('T28 independent-review fix: re-committing an ALREADY-committed preview still returns the original result even after its original expiry window has passed', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { userId } = await registerAndAuth(app, 'mallory@example.com');
    const rawSource = loadFixture('v3-schema.json');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const preview = imports.createPreview(db, userId, rawSource, createdAt);

    const withinWindow = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const first = imports.commitImport(db, userId, preview.id, withinWindow);

    const wellPastOriginalExpiry = new Date(createdAt.getTime() + imports.PREVIEW_LIFETIME_MS + 60 * 60 * 1000);
    const second = imports.commitImport(db, userId, preview.id, wellPastOriginalExpiry);

    assert.deepEqual(second, first);
    assert.equal(countRows(db, 'subjects', userId), 1); // still exactly the one real commit — no duplicate, no crash
  } finally { cleanup(); }
});

test('T27: an expired preview cannot be committed', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { userId } = await registerAndAuth(app, 'liam@example.com');
    const rawSource = loadFixture('v3-schema.json');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const preview = imports.createPreview(db, userId, rawSource, createdAt);

    const wellPast = new Date(createdAt.getTime() + imports.PREVIEW_LIFETIME_MS + 1000);
    assert.throws(
      () => imports.commitImport(db, userId, preview.id, wellPast),
      (err) => err instanceof imports.ImportError && err.code === 'PREVIEW_EXPIRED',
    );
    assert.equal(countRows(db, 'subjects', userId), 0);
  } finally { cleanup(); }
});
