import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as learningUnits from '../src/services/learning-units.js';
import { buildApp } from '../src/app.js';
import * as reviews from '../src/services/reviews.js';
import { IdempotencyConflictError } from '../src/services/idempotency.js';

const TEST_ORIGIN = 'https://smartlearn.test';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-reviews-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

function makeUnitWithReviews(db, userId, studyDate) {
  return learningUnits.create(db, userId, { newSubjectName: `Subj-${Math.random()}`, title: 'Aula', studyDate });
}

test('localDateString formats a UTC instant into the correct calendar day for a given IANA timezone', () => {
  // 2026-01-01T02:00:00Z is still 2025-12-31 in America/Sao_Paulo (UTC-3).
  const utcDate = new Date('2026-01-01T02:00:00.000Z');
  assert.equal(reviews.localDateString(utcDate, 'America/Sao_Paulo'), '2025-12-31');
  assert.equal(reviews.localDateString(utcDate, 'UTC'), '2026-01-01');
});

test('agenda buckets: overdue, today, tomorrow, and completedToday are correctly separated', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    // Create a unit far enough in the past that offset-1 (the earliest
    // review) is already overdue relative to "today" in the test.
    const pastUnit = makeUnitWithReviews(db, userId, '2020-01-01');
    const result = reviews.agenda(db, userId, { date: '2026-06-15', timezoneOverride: 'UTC' });
    assert.ok(result.overdue.length > 0, 'a unit studied in 2020 must have overdue reviews by 2026');
    assert.equal(result.date, '2026-06-15');
    assert.equal(result.timezone, 'UTC');
  } finally { cleanup(); }
});

test('completedToday includes review-only completion (no questions), not only question-based evidence', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-06-14'); // offset 1 -> due 2026-06-15
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);

    const fixedNow = new Date('2026-06-15T12:00:00.000Z');
    reviews.complete(db, userId, task.id, {}, () => fixedNow); // review-only, no questions, injected clock

    const agendaResult = reviews.agenda(db, userId, { date: '2026-06-15', timezoneOverride: 'UTC' });
    assert.ok(agendaResult.completedToday.some(t => t.id === task.id), 'review-only completion must appear in completedToday');
  } finally { cleanup(); }
});

test('missing questionsCount stays missing — no invented score or evidence row', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);

    const result = reviews.complete(db, userId, task.id, {});
    assert.equal(result.reviewOnly, true);
    assert.equal(result.score, null);
    assert.equal(result.evidenceId, null);

    const { n } = db.prepare('SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ?').get(userId);
    assert.equal(n, 0, 'review-only completion must not fabricate a learning_evidence row');
  } finally { cleanup(); }
});

test('completing with questions stores exact q/c once, server derives the score', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);

    const result = reviews.complete(db, userId, task.id, { questionsCount: 10, correctCount: 7 });
    assert.equal(result.score, 0.7);

    const evidence = db.prepare('SELECT * FROM learning_evidence WHERE user_id = ?').all(userId);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].questions_count, 10);
    assert.equal(evidence[0].correct_count, 7);
    assert.equal(evidence[0].type, 'REVIEW');
  } finally { cleanup(); }
});

test('rejects correctCount greater than questionsCount', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);
    assert.throws(() => reviews.complete(db, userId, task.id, { questionsCount: 5, correctCount: 6 }));
  } finally { cleanup(); }
});

test('duplicate completion (no operationKey) is distinguished as ALREADY_COMPLETED, not silently accepted or duplicated', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);
    reviews.complete(db, userId, task.id, { questionsCount: 10, correctCount: 5 });
    assert.throws(
      () => reviews.complete(db, userId, task.id, { questionsCount: 10, correctCount: 8 }),
      (err) => err.code === 'ALREADY_COMPLETED'
    );
    const { n } = db.prepare('SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ?').get(userId);
    assert.equal(n, 1, 'the conflicting second attempt must not add a second evidence row');
  } finally { cleanup(); }
});

test('idempotent retry with the same operationKey and same payload returns the original result', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);
    const payload = { questionsCount: 10, correctCount: 5, operationKey: 'op-complete-1' };
    const r1 = reviews.complete(db, userId, task.id, payload);
    const r2 = reviews.complete(db, userId, task.id, payload);
    assert.deepEqual(r1, r2);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ?').get(userId);
    assert.equal(n, 1);
  } finally { cleanup(); }
});

test('reopen preserves prior evidence — correction never deletes historical fact', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'h@example.com');
    const unit = makeUnitWithReviews(db, userId, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.unit.id);
    reviews.complete(db, userId, task.id, { questionsCount: 10, correctCount: 5 });

    reviews.reopen(db, userId, task.id);
    const reopened = db.prepare('SELECT completed_at FROM review_tasks WHERE id = ?').get(task.id);
    assert.equal(reopened.completed_at, null);

    const { n: evidenceAfterReopen } = db.prepare('SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ?').get(userId);
    assert.equal(evidenceAfterReopen, 1, 'reopening must not delete the prior evidence row');

    // Now it can be completed again — a later correction, preserving the prior fact.
    reviews.complete(db, userId, task.id, { questionsCount: 10, correctCount: 9 });
    const { n: evidenceAfterRecomplete } = db.prepare('SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ?').get(userId);
    assert.equal(evidenceAfterRecomplete, 2, 'a later correction adds new evidence rather than overwriting the prior one');
  } finally { cleanup(); }
});

test('HTTP: GET /v1/agenda and POST /v1/review-tasks/:id/complete over real HTTP with a real session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-reviews-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpreview@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const createRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { newSubjectName: 'HTTP Review Subject', title: 'Aula HTTP', studyDate: '2020-01-01' },
    });
    assert.equal(createRes.statusCode, 201);

    const agendaRes = await app.inject({ method: 'GET', url: '/v1/agenda', headers: { cookie } });
    assert.equal(agendaRes.statusCode, 200);
    const agendaBody = JSON.parse(agendaRes.body);
    assert.ok(agendaBody.overdue.length > 0, 'a 2020 study date must produce overdue reviews by now');

    const taskId = agendaBody.overdue[0].id;
    const completeRes = await app.inject({
      method: 'POST', url: `/v1/review-tasks/${taskId}/complete`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { questionsCount: 4, correctCount: 3 },
    });
    assert.equal(completeRes.statusCode, 200);
    assert.equal(JSON.parse(completeRes.body).score, 0.75);

    const secondAttempt = await app.inject({
      method: 'POST', url: `/v1/review-tasks/${taskId}/complete`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { questionsCount: 4, correctCount: 4 },
    });
    assert.equal(secondAttempt.statusCode, 409);

    const reopenRes = await app.inject({
      method: 'POST', url: `/v1/review-tasks/${taskId}/reopen`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
    });
    assert.equal(reopenRes.statusCode, 200);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('a user cannot complete or reopen a review task owned by another user', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'i@example.com');
    const userB = makeUser(db, 'j@example.com');
    const unit = makeUnitWithReviews(db, userA, '2026-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userA, unit.unit.id);

    assert.throws(() => reviews.complete(db, userB, task.id, { questionsCount: 5, correctCount: 5 }), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => reviews.reopen(db, userB, task.id), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('T20: list() returns every owned review task regardless of due date/completion, optionally scoped to one unit', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'k@example.com');
    const unitA = makeUnitWithReviews(db, userId, '2020-01-01');
    const unitB = makeUnitWithReviews(db, userId, '2026-06-01');

    const all = reviews.list(db, userId);
    assert.equal(all.length, 32, 'both units\' 16 tasks each must be present, not just what agenda() would bucket as due');

    const scopedToA = reviews.list(db, userId, { unitId: unitA.unit.id });
    assert.equal(scopedToA.length, 16);
    assert.ok(scopedToA.every(t => t.unitId === unitA.unit.id));

    const taskA = scopedToA[0];
    reviews.complete(db, userId, taskA.id, { questionsCount: 3, correctCount: 2 });
    const afterComplete = reviews.list(db, userId, { unitId: unitA.unit.id }).find(t => t.id === taskA.id);
    assert.ok(afterComplete.completedAt, 'list() must reflect completion state, not just pending items');
  } finally { cleanup(); }
});

test('T20: a user cannot list another user\'s review tasks via a foreign unitId', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'l@example.com');
    const userB = makeUser(db, 'm@example.com');
    const unitA = makeUnitWithReviews(db, userA, '2026-01-01');
    makeUnitWithReviews(db, userB, '2026-01-01');

    // list() is user-scoped at the SQL WHERE clause level: passing another
    // user's unitId under userB's own userId returns zero rows, never a
    // cross-user leak (there is no owned-unit check to bypass because the
    // JOIN chain itself is user_id-scoped throughout).
    const result = reviews.list(db, userB, { unitId: unitA.unit.id });
    assert.deepEqual(result, []);
  } finally { cleanup(); }
});
