import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as evidence from '../src/services/evidence.js';
import * as settings from '../src/services/settings.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as reviews from '../src/services/reviews.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-settings-'));
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

let unitCounter = 0;
function makeUnit(db, userId, studyDate = '2026-01-01') {
  unitCounter += 1;
  return learningUnits.create(db, userId, { newSubjectName: `Disciplina ${unitCounter}`, title: 'Aula 1', studyDate }).unit;
}

test('direct evidence accepts INITIAL_PRACTICE and EXTERNAL, derives score, and rejects REVIEW as a type', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = makeUnit(db, userId);

    const practice = evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 4, correctCount: 3, evidenceDate: '2026-01-02' });
    assert.equal(practice.score, 0.75);

    const external = evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', evidenceDate: '2026-01-03' });
    assert.equal(external.score, null, 'unknown performance must not be reported as a zero score');
    assert.equal(external.questionsCount, null);

    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'REVIEW', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-04' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.field === 'type',
    );
    const { n } = db.prepare("SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ? AND type = 'REVIEW'").get(userId);
    assert.equal(n, 0, 'no REVIEW row can ever be created through the direct evidence path');
  } finally { cleanup(); }
});

test('q/c must be integers in range; correctCount without questionsCount is rejected', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnit(db, userId);

    assert.throws(() => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 0, correctCount: 0, evidenceDate: '2026-01-01' }), (err) => err.field === 'questionsCount');
    assert.throws(() => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 3, correctCount: 4, evidenceDate: '2026-01-01' }), (err) => err.field === 'correctCount');
    assert.throws(() => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 2.5, correctCount: 1, evidenceDate: '2026-01-01' }), (err) => err.field === 'questionsCount');
    assert.throws(() => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', correctCount: 2, evidenceDate: '2026-01-01' }), (err) => err.field === 'correctCount');

    const { n } = db.prepare('SELECT COUNT(*) as n FROM learning_evidence WHERE user_id = ?').get(userId);
    assert.equal(n, 0);
  } finally { cleanup(); }
});

test('list applies owned unit/date filters and denies a foreign unitId', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'c@example.com');
    const userB = makeUser(db, 'd@example.com');
    const unitA1 = makeUnit(db, userA, '2026-01-01');
    const unitA2 = makeUnit(db, userA, '2026-02-01');
    evidence.create(db, userA, { unitId: unitA1.id, type: 'EXTERNAL', evidenceDate: '2026-01-05' });
    evidence.create(db, userA, { unitId: unitA1.id, type: 'EXTERNAL', evidenceDate: '2026-03-05' });
    evidence.create(db, userA, { unitId: unitA2.id, type: 'EXTERNAL', evidenceDate: '2026-01-10' });

    assert.equal(evidence.list(db, userA, { unitId: unitA1.id }).length, 2);
    assert.equal(evidence.list(db, userA, {}).length, 3);
    assert.equal(evidence.list(db, userA, { dateFrom: '2026-02-01' }).length, 1);
    assert.equal(evidence.list(db, userA, { dateTo: '2026-01-10' }).length, 2);

    const unitB = makeUnit(db, userB);
    assert.throws(() => evidence.list(db, userB, { unitId: unitA1.id }), (err) => err.code === 'NOT_FOUND');
    assert.equal(evidence.list(db, userB, { unitId: unitB.id }).length, 0);
  } finally { cleanup(); }
});

test('REVIEW evidence bypass fails even via a raw insert attempt through the same table constraints as direct evidence would use', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const unit = makeUnit(db, userId, '2020-01-01');
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? LIMIT 1').get(userId, unit.id);
    const completed = reviews.complete(db, userId, task.id, { questionsCount: 2, correctCount: 2 });
    assert.ok(completed.evidenceId);
    const row = db.prepare('SELECT type FROM learning_evidence WHERE id = ?').get(completed.evidenceId);
    assert.equal(row.type, 'REVIEW', 'the only legitimate path to a REVIEW row is completion, not evidence.create()');
  } finally { cleanup(); }
});

test('settings: unset returns real fixed defaults without writing a row; updateTimezone validates and persists; schedule stays fixed', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const before = settings.get(db, userId);
    assert.equal(before.timezone, 'America/Sao_Paulo');
    assert.equal(before.updatedAt, null);
    const { n: before_n } = db.prepare('SELECT COUNT(*) as n FROM user_settings WHERE user_id = ?').get(userId);
    assert.equal(before_n, 0, 'a plain read must not fabricate a settings row');

    assert.throws(() => settings.updateTimezone(db, userId, 'not-a-timezone'), (err) => err.code === 'VALIDATION_FAILED');
    assert.throws(() => settings.updateTimezone(db, userId, 'Definitely/NotReal_Zone'), (err) => err.code === 'VALIDATION_FAILED');

    const updated = settings.updateTimezone(db, userId, 'America/New_York');
    assert.equal(updated.timezone, 'America/New_York');
    assert.deepEqual(updated.reviewSchedule, [1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390], 'schedule stays the fixed contract — settings has no field to change it');

    const reread = settings.get(db, userId);
    assert.equal(reread.timezone, 'America/New_York');
  } finally { cleanup(); }
});

test('settings changes are tenant scoped and never touch another user\'s factual evidence', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'g@example.com');
    const userB = makeUser(db, 'h@example.com');
    const unitA = makeUnit(db, userA);
    const recorded = evidence.create(db, userA, { unitId: unitA.id, type: 'EXTERNAL', questionsCount: 5, correctCount: 4, evidenceDate: '2026-01-01' });

    settings.updateTimezone(db, userA, 'America/New_York');
    settings.updateTimezone(db, userB, 'Europe/Lisbon');

    assert.equal(settings.get(db, userA).timezone, 'America/New_York');
    assert.equal(settings.get(db, userB).timezone, 'Europe/Lisbon');

    const stillIntact = db.prepare('SELECT * FROM learning_evidence WHERE id = ?').get(recorded.id);
    assert.equal(stillIntact.questions_count, 5);
    assert.equal(stillIntact.correct_count, 4);
  } finally { cleanup(); }
});

test('HTTP: evidence and settings endpoints over real HTTP with a real session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-settings-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpevidence@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const unitRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { newSubjectName: 'HTTP Evidence Subject', title: 'Aula HTTP', studyDate: '2026-01-01' },
    });
    const unitId = JSON.parse(unitRes.body).unit.id;

    const createRes = await app.inject({
      method: 'POST', url: '/v1/learning-evidence', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { unitId, type: 'INITIAL_PRACTICE', questionsCount: 10, correctCount: 8, evidenceDate: '2026-01-02' },
    });
    assert.equal(createRes.statusCode, 201);
    assert.equal(JSON.parse(createRes.body).evidence.score, 0.8);

    const reviewBypass = await app.inject({
      method: 'POST', url: '/v1/learning-evidence', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { unitId, type: 'REVIEW', evidenceDate: '2026-01-02' },
    });
    assert.equal(reviewBypass.statusCode, 400);

    const listRes = await app.inject({ method: 'GET', url: `/v1/learning-evidence?unitId=${unitId}`, headers: { cookie } });
    assert.equal(JSON.parse(listRes.body).evidence.length, 1);

    const getSettingsRes = await app.inject({ method: 'GET', url: '/v1/settings', headers: { cookie } });
    assert.equal(JSON.parse(getSettingsRes.body).settings.timezone, 'America/Sao_Paulo');

    const patchRes = await app.inject({
      method: 'PATCH', url: '/v1/settings', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { timezone: 'America/New_York' },
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(JSON.parse(patchRes.body).settings.timezone, 'America/New_York');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
