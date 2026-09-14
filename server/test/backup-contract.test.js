import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { createLogicalExport, createPhysicalBackup, verifyPhysicalBackup, BackupError, LOGICAL_EXPORT_VERSION } from '../src/backup.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';
import * as evidence from '../src/services/evidence.js';
import * as settings from '../src/services/settings.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb(prefix = 'sl-backup-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, dir, path, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'REAL_HASH_MUST_NEVER_LEAK', 'REAL_SALT_MUST_NEVER_LEAK', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

test('logical export round trip matches every owned row and relation, and includes schema/export metadata', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate: '2026-01-01' }).unit;
    const exercise = exercises.create(db, userId, { unitId: unit.id, question: 'Q1', answer: 'A1', hint: 'H1', provenance: 'MANUAL' });
    exercises.edit(db, userId, exercise.id, { question: 'Q1 revisada', provenance: 'AI_GENERATED' });
    evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 5, correctCount: 4, evidenceDate: '2026-01-05' });
    settings.updateTimezone(db, userId, 'America/New_York');

    const exp = createLogicalExport(db, userId);

    assert.equal(exp.exportVersion, LOGICAL_EXPORT_VERSION);
    assert.equal(typeof exp.schemaVersion, 'number');
    assert.equal(exp.user.email, 'a@example.com');
    assert.equal(exp.settings.timezone, 'America/New_York');

    const dbSubjects = db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY id').all(userId);
    assert.deepEqual(exp.subjects, dbSubjects);
    const dbUnits = db.prepare('SELECT * FROM learning_units WHERE user_id = ? ORDER BY id').all(userId);
    assert.deepEqual(exp.learningUnits, dbUnits);
    assert.equal(exp.reviewTasks.length, 16);
    assert.ok(exp.reviewTasks.every(t => t.unit_id === unit.id), 'every review task must relate back to the exported unit');

    assert.equal(exp.exercises.length, 1);
    assert.equal(exp.exerciseVersions.length, 2, 'both the original and the edited version must be present — export is not just current state');
    assert.ok(exp.exerciseVersions.every(v => v.exercise_id === exp.exercises[0].id));

    assert.equal(exp.learningEvidence.length, 1);
    assert.equal(exp.learningEvidence[0].correct_count, 4);
  } finally { cleanup(); }
});

test('export contains no password/session fields and no other user\'s rows', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'b@example.com');
    const userB = makeUser(db, 'c@example.com');
    learningUnits.create(db, userA, { newSubjectName: 'Subj A', title: 'Aula A', studyDate: '2026-01-01' });
    learningUnits.create(db, userB, { newSubjectName: 'Subj B', title: 'Aula B', studyDate: '2026-01-01' });

    const exp = createLogicalExport(db, userA);
    const serialized = JSON.stringify(exp);

    assert.ok(!('passwordHash' in exp.user) && !('password_hash' in exp.user));
    assert.ok(!serialized.includes('REAL_HASH_MUST_NEVER_LEAK'));
    assert.ok(!serialized.includes('REAL_SALT_MUST_NEVER_LEAK'));
    assert.ok(!('sessions' in exp));
    assert.ok(!serialized.includes('Subj B'), 'user A export must contain zero trace of user B data');
    assert.equal(exp.subjects.length, 1);
    assert.equal(exp.subjects[0].name, 'Subj A');
  } finally { cleanup(); }
});

test('exporting an unknown user is rejected', () => {
  const { db, cleanup } = tmpDb();
  try {
    assert.throws(() => createLogicalExport(db, 999999), (err) => err instanceof BackupError && err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('physical backup passes integrity check and exact content comparison against a real multi-user database', async () => {
  const { db, dir, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'd@example.com');
    const userB = makeUser(db, 'e@example.com');
    learningUnits.create(db, userA, { newSubjectName: 'Subj A2', title: 'Aula', studyDate: '2026-01-01' });
    learningUnits.create(db, userB, { newSubjectName: 'Subj B2', title: 'Aula', studyDate: '2026-01-01' });

    const destPath = join(dir, 'backup.db');
    const result = await createPhysicalBackup(db, destPath);
    assert.ok(existsSync(destPath));
    assert.equal(result.path, destPath);

    const verification = verifyPhysicalBackup(db, destPath);
    assert.equal(verification.integrityCheck, 'ok');
    assert.ok(Object.values(verification.tableCounts).every(t => t.match));
    assert.equal(verification.tableCounts.users.sourceCount, 2);
    assert.equal(verification.tableCounts.subjects.sourceCount, 2);
  } finally { cleanup(); }
});

test('a mismatched/tampered backup file is rejected by verification, not silently accepted', () => {
  const { db, cleanup } = tmpDb();
  const stale = tmpDb('sl-backup-stale-');
  try {
    makeUser(db, 'f@example.com');
    // stale.path is a real, structurally valid SQLite DB (migrations ran)
    // but has zero users — standing in for a stale/incomplete backup that
    // must never be accepted as current just because it opens cleanly.
    assert.throws(
      () => verifyPhysicalBackup(db, stale.path),
      (err) => err instanceof BackupError && err.code === 'CONTENT_MISMATCH',
    );
  } finally { cleanup(); stale.cleanup(); }
});

test('a failed physical backup leaves the source database completely untouched and removes only its own temp file', async () => {
  const { db, dir, cleanup } = tmpDb();
  try {
    makeUser(db, 'g@example.com');
    const { n: beforeCount } = db.prepare('SELECT COUNT(*) as n FROM users').get();

    // An invalid destination directory forces the backup to fail.
    const invalidDest = join(dir, 'nonexistent-subdir', 'backup.db');
    await assert.rejects(() => createPhysicalBackup(db, invalidDest), (err) => err instanceof BackupError && err.code === 'BACKUP_FAILED');

    const { n: afterCount } = db.prepare('SELECT COUNT(*) as n FROM users').get();
    assert.equal(afterCount, beforeCount, 'source database must be unaffected by a failed backup attempt');

    const leftoverTmp = readdirSync(dir).filter(f => f.includes('.tmp-'));
    assert.deepEqual(leftoverTmp, [], 'no temp backup file should remain after a failed attempt');
  } finally { cleanup(); }
});

test('HTTP: GET /v1/export returns only the caller\'s own data over a real session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-backup-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const emailA = 'httpexporta@example.com';
    const emailB = 'httpexportb@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email: emailA, password: 'a genuinely long test password 1' } });
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email: emailB, password: 'a genuinely long test password 1' } });
    const loginA = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email: emailA, password: 'a genuinely long test password 1' } });
    const cookieA = loginA.headers['set-cookie'].split(';')[0];
    const meA = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie: cookieA } });
    const csrfA = JSON.parse(meA.body).csrfToken;

    await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie: cookieA, 'x-csrf-token': csrfA },
      payload: { newSubjectName: 'HTTP Export Subject A', title: 'Aula A', studyDate: '2026-01-01' },
    });

    const exportRes = await app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: cookieA } });
    assert.equal(exportRes.statusCode, 200);
    const body = JSON.parse(exportRes.body);
    assert.equal(body.user.email, emailA);
    assert.equal(body.subjects.length, 1);
    assert.equal(body.subjects[0].name, 'HTTP Export Subject A');
    assert.ok(!JSON.stringify(body).includes('password'));

    const unauthenticated = await app.inject({ method: 'GET', url: '/v1/export' });
    assert.equal(unauthenticated.statusCode, 401);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
