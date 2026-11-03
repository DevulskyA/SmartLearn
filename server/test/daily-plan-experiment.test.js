// HG-14 experimental: the daily-plan prototype over the REAL review tables of a disposable database. Read-only; no estimate is invented
// (minutes per review come from the caller), the exam date is optional, nothing the student owes disappears silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as plan from '../src/services/daily-plan-experiment.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const TODAY = '2026-10-18';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-plan-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
const seed = (db) => {
  const userId = makeUser(db, 'p@example.com');
  const a = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula A', studyDate: '2026-09-01' });
  const b = learningUnits.create(db, userId, { newSubjectName: 'Anatomia', title: 'Aula B', studyDate: '2026-09-10' });
  return { userId, a: a.unit, b: b.unit };
};
const digest = (db) => JSON.stringify(db.prepare('SELECT * FROM review_tasks ORDER BY id').all());

test('plans one required review per unit within the minutes; what does not fit is deferred WITH a reason; nothing is written', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a, b } = seed(db);
    const before = digest(db);
    const out = plan.dailyPlan(db, userId, { date: TODAY, availableMinutes: 5, perReviewMinutes: 5 });
    assert.equal(digest(db), before, 'read-only');
    assert.equal(out.planned.length + out.deferred.length, 2, 'one required review per unit, none lost');
    assert.equal(out.planned.length, 1);
    assert.equal(out.deferred[0].reason, 'NO_TIME_LEFT');
    assert.deepEqual(out.requiredDeferred, [out.deferred[0].id], 'a required review that did not fit is reported');
    assert.ok(out.usedMinutes <= 5);
    assert.ok([a.id, b.id].every((id) => [...out.planned, ...out.deferred].some((x) => x.unitId === id)));
  } finally { cleanup(); }
});

test('without minutes per review nothing is guessed: everything is UNESTIMATED; an exam date for one subject moves its review first', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, b } = seed(db);
    const none = plan.dailyPlan(db, userId, { date: TODAY, availableMinutes: 60 });
    assert.equal(none.planned.length, 0);
    assert.ok(none.deferred.every((d) => d.reason === 'UNESTIMATED'));
    const subjectB = db.prepare('SELECT subject_id FROM learning_units WHERE id = ?').get(b.id).subject_id;
    const withExam = plan.dailyPlan(db, userId, { date: TODAY, availableMinutes: 5, perReviewMinutes: 5, exams: { [subjectB]: '2026-10-21' } });
    assert.equal(withExam.planned[0].unitId, b.id, 'the subject with the near exam wins the only slot');
    assert.ok(withExam.planned[0].reasons.some((r) => r.startsWith('EXAM_IN_')));
    assert.throws(() => plan.dailyPlan(db, userId, { date: TODAY, availableMinutes: -1 }), /availableMinutes/);
  } finally { cleanup(); }
});

test('GET /v1/daily-plan-experiment: owner only; minutes must be a number; anonymous is 401', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const pw = 'a genuinely long test password 1';
    const session = async (email) => {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      return res.headers['set-cookie'].split(';')[0];
    };
    const alice = await session('alice@example.com');
    const bob = await session('bob@example.com');
    const aliceId = db.prepare("SELECT id FROM users WHERE email = 'alice@example.com'").get().id;
    learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-09-01' });
    const get = (cookie, qs) => app.inject({ method: 'GET', url: `/v1/daily-plan-experiment?${qs}`, headers: cookie ? { cookie } : {} });
    const ok = await get(alice, `date=${TODAY}&availableMinutes=30&perReviewMinutes=10`);
    assert.equal(ok.statusCode, 200);
    assert.equal(JSON.parse(ok.body).planned.length, 1);
    assert.equal(JSON.parse((await get(bob, `date=${TODAY}&availableMinutes=30&perReviewMinutes=10`)).body).planned.length, 0);
    assert.equal((await get(alice, 'availableMinutes=abc')).statusCode, 400);
    assert.equal((await get(null, 'availableMinutes=30')).statusCode, 401);
  } finally { await app.close(); cleanup(); }
});
