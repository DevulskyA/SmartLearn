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
import * as reviews from '../src/services/reviews.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as priorities from '../src/services/priorities.js';

// TG-02 / probe P-2 (v1-closure-telemetry): complete -> reopen -> complete of the SAME review task leaves two REVIEW
// rows in the append-only ledger. Every aggregate (Stats, analytics trends, priorities) sums the rows it is given, so
// a review of 4 questions showed 8. The fix is on the READ side: list() marks a REVIEW row superseded when a later
// REVIEW row exists for the same review task, and returns only the CURRENT rows by default. No row is ever
// updated or deleted (heritage H-06, TG-09).

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-current-'));
  const db = openDb(join(dir, 'test.db'));
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

function firstTask(db, userId, studyDate = '2020-01-01') {
  const { unit } = learningUnits.create(db, userId, { newSubjectName: `Subj-${Math.random()}`, title: 'Aula', studyDate });
  const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, unit.id);
  return { unit, task };
}

function completeReopenComplete(db, userId, taskId) {
  reviews.complete(db, userId, taskId, { questionsCount: 4, correctCount: 3 });
  reviews.reopen(db, userId, taskId);
  reviews.complete(db, userId, taskId, { questionsCount: 4, correctCount: 4 });
}

test('list() returns only the CURRENT REVIEW row after complete -> reopen -> complete; the ledger keeps both rows (P-2)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'cur-a@example.com');
    const { unit, task } = firstTask(db, userId);
    completeReopenComplete(db, userId, task.id);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 2, 'append-only: both rows stay in the table');

    const current = evidence.list(db, userId, { unitId: unit.id });
    assert.equal(current.length, 1, 'one review of 4 questions must count 4 questions, not 8');
    assert.deepEqual([current[0].questionsCount, current[0].correctCount, current[0].isCurrent], [4, 4, true]);

    const all = evidence.list(db, userId, { unitId: unit.id, includeSuperseded: true });
    assert.deepEqual(all.map((r) => [r.correctCount, r.isCurrent]), [[3, false], [4, true]], 'history is still reachable, flagged');
  } finally { cleanup(); }
});

test('rows that were never superseded stay current: other review tasks, practice, external, and a reopened-but-not-recompleted review', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'cur-b@example.com');
    const a = firstTask(db, userId);
    const b = firstTask(db, userId);
    reviews.complete(db, userId, a.task.id, { questionsCount: 5, correctCount: 2 });
    reviews.reopen(db, userId, a.task.id); // reopened, never completed again: the observed fact still stands
    reviews.complete(db, userId, b.task.id, { questionsCount: 6, correctCount: 6 });
    evidence.create(db, userId, { unitId: a.unit.id, type: 'EXTERNAL', questionsCount: 10, correctCount: 7, evidenceDate: '2026-01-02' });
    evidence.create(db, userId, { unitId: a.unit.id, type: 'EXTERNAL', questionsCount: 10, correctCount: 8, evidenceDate: '2026-01-02' });

    const rows = evidence.list(db, userId);
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.isCurrent === true));
    assert.equal(evidence.list(db, userId, { includeSuperseded: true }).length, 4);
  } finally { cleanup(); }
});

test('supersession is owner-scoped and only REVIEW rows of the same task supersede each other', () => {
  const { db, cleanup } = tmpDb();
  try {
    const u1 = makeUser(db, 'cur-c1@example.com');
    const u2 = makeUser(db, 'cur-c2@example.com');
    const a = firstTask(db, u1);
    const b = firstTask(db, u2);
    completeReopenComplete(db, u1, a.task.id);
    reviews.complete(db, u2, b.task.id, { questionsCount: 4, correctCount: 1 });
    assert.equal(evidence.list(db, u1).length, 1);
    assert.equal(evidence.list(db, u2).length, 1);
  } finally { cleanup(); }
});

test('priorities count a re-completed review once (4 questions, not 8)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'cur-d@example.com');
    const { unit, task } = firstTask(db, userId);
    completeReopenComplete(db, userId, task.id);
    const today = new Date().toISOString().slice(0, 10); // reviews.complete stamps the UTC day
    const got = priorities.get(db, userId, { date: today });
    const mine = got.due.filter((d) => d.unitId === unit.id);
    assert.ok(mine.length > 0, 'the unit studied in 2020 still has overdue reviews');
    for (const d of mine) assert.equal(d.evidence.questions, 4);
  } finally { cleanup(); }
});

test('HTTP: GET /learning-evidence hides superseded rows by default and returns them flagged with includeSuperseded=true', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpcurrent@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const { task } = firstTask(db, userId);
    completeReopenComplete(db, userId, task.id);

    const def = JSON.parse((await app.inject({ method: 'GET', url: '/v1/learning-evidence', headers: { cookie } })).body).evidence;
    assert.equal(def.length, 1);
    const all = JSON.parse((await app.inject({ method: 'GET', url: '/v1/learning-evidence?includeSuperseded=true', headers: { cookie } })).body).evidence;
    assert.deepEqual(all.map((r) => r.isCurrent), [false, true]);
  } finally {
    await app.close();
    cleanup();
  }
});
