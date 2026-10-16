import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as learningUnits from '../src/services/learning-units.js';
import { IdempotencyConflictError } from '../src/services/idempotency.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-createunit-'));
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

test('creates exactly one subject, one unit, and 16 review_tasks with correct offsets', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const result = learningUnits.create(db, userId, {
      newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate: '2026-03-01',
    });
    assert.equal(result.reviewCount, 16);

    const { n: subjectCount } = db.prepare('SELECT COUNT(*) as n FROM subjects WHERE user_id = ?').get(userId);
    const { n: unitCount } = db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId);
    const { n: reviewCount } = db.prepare('SELECT COUNT(*) as n FROM review_tasks WHERE user_id = ?').get(userId);
    assert.equal(subjectCount, 1);
    assert.equal(unitCount, 1);
    assert.equal(reviewCount, 16);
  } finally { cleanup(); }
});

test('reusing an existing subjectId does not create a new subject', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const r1 = learningUnits.create(db, userId, { newSubjectName: 'Anatomia', title: 'Aula 1', studyDate: '2026-01-01' });
    learningUnits.create(db, userId, { subjectId: r1.subject.id, title: 'Aula 2', studyDate: '2026-01-02' });
    const { n } = db.prepare('SELECT COUNT(*) as n FROM subjects WHERE user_id = ?').get(userId);
    assert.equal(n, 1);
  } finally { cleanup(); }
});

test('due dates are exactly correct across a leap day (2026-02-01 + offsets crosses Feb 29 2028... use a real leap year in range)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    // 2028 is a leap year. Studying on 2028-01-15 + 30 days crosses Feb 29.
    const result = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Leap test', studyDate: '2028-01-15' });
    const reviews = db.prepare('SELECT due_date FROM review_tasks WHERE user_id = ? ORDER BY offset_days').all(userId);
    const dueDates = reviews.map(r => r.due_date);
    // offset 30 from 2028-01-15 = 2028-02-14; offset 60 = 2028-03-15 (crosses Feb 29 correctly)
    assert.equal(dueDates[3], '2028-02-14'); // offset 30
    assert.equal(dueDates[4], '2028-03-15'); // offset 60, spans the leap day correctly
    assert.equal(dueDates.length, 16);
    assert.equal(result.reviewCount, 16);
  } finally { cleanup(); }
});

test('due dates computed in UTC calendar arithmetic, independent of test-runner local timezone', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    learningUnits.create(db, userId, { newSubjectName: 'Bioquímica', title: 'TZ test', studyDate: '2026-12-31' });
    const first = db.prepare('SELECT due_date FROM review_tasks WHERE user_id = ? ORDER BY offset_days LIMIT 1').get(userId);
    assert.equal(first.due_date, '2027-01-01'); // +1 day crosses year boundary correctly regardless of local TZ
  } finally { cleanup(); }
});

test('an error during unit/review creation leaves zero partial rows (subject also not created)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    assert.throws(() => learningUnits.create(db, userId, {
      newSubjectName: 'Patologia', title: 'x'.repeat(300), studyDate: '2026-01-01', // title too long
    }));
    const { n: subjectCount } = db.prepare('SELECT COUNT(*) as n FROM subjects WHERE user_id = ?').get(userId);
    assert.equal(subjectCount, 0, 'a validation failure before the transaction must create nothing at all');
  } finally { cleanup(); }
});

test('an error from an invalid calendar date leaves zero partial rows', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    assert.throws(() => learningUnits.create(db, userId, {
      newSubjectName: 'Radiologia', title: 'Valid title', studyDate: '2026-02-30', // Feb 30 doesn't exist
    }));
    const { n } = db.prepare('SELECT COUNT(*) as n FROM subjects WHERE user_id = ?').get(userId);
    assert.equal(n, 0);
  } finally { cleanup(); }
});

test('a real mid-transaction failure (bad subjectId injected after title/date validation) leaves zero partial rows', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    // subjectId that doesn't exist — passes shape/date validation, fails
    // inside resolveOrCreateSubject, which runs INSIDE the transaction.
    assert.throws(() => learningUnits.create(db, userId, {
      subjectId: 999999, title: 'Should not persist', studyDate: '2026-01-01',
    }));
    const { n: unitCount } = db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId);
    const { n: reviewCount } = db.prepare('SELECT COUNT(*) as n FROM review_tasks WHERE user_id = ?').get(userId);
    assert.equal(unitCount, 0);
    assert.equal(reviewCount, 0);
  } finally { cleanup(); }
});

test('idempotency: same operationKey and same payload returns the ORIGINAL result, adds nothing new', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'h@example.com');
    const payload = { newSubjectName: 'Genética', title: 'Aula X', studyDate: '2026-05-01', operationKey: 'op-123' };
    const r1 = learningUnits.create(db, userId, payload);
    const r2 = learningUnits.create(db, userId, payload);
    assert.deepEqual(r1, r2);
    const { n: unitCount } = db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId);
    assert.equal(unitCount, 1, 'retrying the same operation key must not create a second unit');
  } finally { cleanup(); }
});

test('idempotency: same operationKey with a DIFFERENT payload conflicts, does not silently do something else', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'i@example.com');
    learningUnits.create(db, userId, { newSubjectName: 'Imunologia', title: 'Aula 1', studyDate: '2026-05-01', operationKey: 'op-456' });
    assert.throws(
      () => learningUnits.create(db, userId, { newSubjectName: 'Imunologia', title: 'Aula 2 - different', studyDate: '2026-05-01', operationKey: 'op-456' }),
      (err) => err instanceof IdempotencyConflictError
    );
  } finally { cleanup(); }
});

test('HTTP: POST /v1/learning-units requires exactly one of subjectId or newSubjectName', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-createunit-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpcreate@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const bothRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { subjectId: 1, newSubjectName: 'X', title: 'T', studyDate: '2026-01-01' },
    });
    assert.equal(bothRes.statusCode, 400);

    const neitherRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { title: 'T', studyDate: '2026-01-01' },
    });
    assert.equal(neitherRes.statusCode, 400);

    const okRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { newSubjectName: 'Nova Disciplina HTTP', title: 'Aula real', studyDate: '2026-06-01' },
    });
    assert.equal(okRes.statusCode, 201);
    assert.equal(JSON.parse(okRes.body).reviewCount, 16);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('T20: list returns only the owner\'s units; getById denies a foreign id; updateFields edits title/sourceText/summaryBody but never studyDate', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'k@example.com');
    const userB = makeUser(db, 'l@example.com');
    const rA = learningUnits.create(db, userA, { newSubjectName: 'Subj A', title: 'Aula A', studyDate: '2026-01-01' });
    learningUnits.create(db, userB, { newSubjectName: 'Subj B', title: 'Aula B', studyDate: '2026-01-01' });

    const listA = learningUnits.list(db, userA);
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, rA.unit.id);

    assert.throws(() => learningUnits.getById(db, userB, rA.unit.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => learningUnits.updateFields(db, userB, rA.unit.id, { title: 'hacked' }), (err) => err.code === 'NOT_FOUND');

    const updated = learningUnits.updateFields(db, userA, rA.unit.id, { title: 'Aula A revisada', summaryBody: 'Resumo novo' });
    assert.equal(updated.title, 'Aula A revisada');
    assert.equal(updated.summaryBody, 'Resumo novo');
    assert.equal(updated.studyDate, '2026-01-01', 'studyDate must be unchanged — date correction is out of this scope');
  } finally { cleanup(); }
});

test('T20: HTTP GET/PATCH learning-units reject an unrecognized field (e.g. studyDate) and deny cross-user access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-units-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpunits@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const createRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { newSubjectName: 'HTTP Units Subject', title: 'Aula', studyDate: '2026-01-01' },
    });
    const unitId = JSON.parse(createRes.body).unit.id;

    const listRes = await app.inject({ method: 'GET', url: '/v1/learning-units', headers: { cookie } });
    assert.equal(listRes.statusCode, 200);
    assert.equal(JSON.parse(listRes.body).units.length, 1);

    const getRes = await app.inject({ method: 'GET', url: `/v1/learning-units/${unitId}`, headers: { cookie } });
    assert.equal(getRes.statusCode, 200);

    const patchStudyDate = await app.inject({
      method: 'PATCH', url: `/v1/learning-units/${unitId}`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { studyDate: '2030-01-01' },
    });
    assert.equal(patchStudyDate.statusCode, 400, 'studyDate is not in the PATCH schema, so it is a clean rejection, not a silent no-op');

    const patchTitle = await app.inject({
      method: 'PATCH', url: `/v1/learning-units/${unitId}`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { title: 'Título atualizado' },
    });
    assert.equal(patchTitle.statusCode, 200);
    assert.equal(JSON.parse(patchTitle.body).unit.title, 'Título atualizado');

    const emailB = 'httpunitsb@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email: emailB, password: 'a genuinely long test password 1' } });
    const loginB = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email: emailB, password: 'a genuinely long test password 1' } });
    const cookieB = loginB.headers['set-cookie'].split(';')[0];
    const getForeign = await app.inject({ method: 'GET', url: `/v1/learning-units/${unitId}`, headers: { cookie: cookieB } });
    assert.equal(getForeign.statusCode, 404);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
