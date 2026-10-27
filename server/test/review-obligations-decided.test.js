// The student's experimental decisions (2026-10-19), as a named PROFILE next to the V1 one: D-13 a performed review satisfies the unit's single
// active obligation, omitted dates stay distinguishable and are never "completed", no invented evidence, pausing is not learning; D-14 the next
// interval starts on the local day of the review really done and progression advances AT MOST ONE stage per performed review, never by delay,
// dismissal or time. Disposable database only. V1 behavior (profile V1 / defaults) is proven unchanged in review-obligations-complete.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as reviews from '../src/services/reviews.js';
import * as plan from '../src/services/daily-plan-experiment.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-decided-'));
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
  const userId = makeUser(db, 'd@example.com');
  const unit = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula A', studyDate: '2026-01-01' }).unit;
  return { userId, unit };
};
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const stages = (db, unitId) => db.prepare('SELECT id, offset_days AS o, due_date AS due, completed_at AS done FROM review_tasks WHERE unit_id = ? ORDER BY offset_days').all(unitId);
const D1 = '2026-10-18';

test('profile DECIDED: the performed review advances the unit by exactly ONE stage; later stages (overdue or not) are re-dated from the real day, none retired, none completed', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    const before = stages(db, unit.id);
    const out = reviews.completeObligation(db, userId, unit.id, { date: D1, profile: 'DECIDED' });
    assert.equal(out.profile, 'DECIDED'); assert.equal(out.recovery, 'NONE'); assert.equal(out.anchor, 'ACTUAL_DATE');
    assert.equal(out.completedId, before[0].id, 'the lowest due stage (offset 1) is the one performed');
    assert.deepEqual(out.supersededIds, [], 'omitted dates are not retired: they are re-dated, and their original date is logged');
    const after = stages(db, unit.id);
    assert.equal(after.filter((t) => t.done).length, 1, 'progression moved ONE stage');
    for (const t of after.slice(1)) assert.equal(t.due, addDays(D1, t.o - 1), `stage ${t.o} keeps its gap to the performed stage, counted from the real day`);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_task_supersessions').get().n, 0);
    const log = db.prepare('SELECT task_id, from_due_date FROM review_task_reschedules ORDER BY task_id').all();
    const omitted = log.filter((r) => r.from_due_date < D1);
    assert.ok(omitted.length >= 5, 'the planned dates that passed unperformed stay distinguishable in the log');
    assert.ok(omitted.every((r) => after.find((t) => t.id === r.task_id).done === null), 'and none of them is marked completed');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 0, 'no evidence invented by a review without questions');
    assert.equal(reviews.agenda(db, userId, { date: D1 }).overdue.length, 0, 'the pile is gone because it was re-dated, not because it was forgiven');
    assert.equal(reviews.completeObligation(db, userId, unit.id, { date: D1, profile: 'DECIDED' }).completedId, null, 'nothing is owed again today: no second stage in one day');
  } finally { cleanup(); }
});

test('profile DECIDED: lateness never skips a stage - performing the next one 40 days late advances exactly one more and re-anchors again', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    reviews.completeObligation(db, userId, unit.id, { date: D1, profile: 'DECIDED' });
    const late = addDays(D1, 46); // stage offset 7 was due on D1+6; the student returns 40 days late
    const second = reviews.completeObligation(db, userId, unit.id, { date: late, profile: 'DECIDED' });
    const s = stages(db, unit.id);
    assert.equal(s.filter((t) => t.done).length, 2);
    assert.equal(s.find((t) => t.id === second.completedId).o, 7, 'the NEXT stage, not a later one');
    assert.equal(s.find((t) => t.o === 15).due, addDays(late, 15 - 7), 'the following interval starts on the day it was really done');
    assert.equal(s.filter((t) => t.done).every((t) => t.o <= 7), true);
  } finally { cleanup(); }
});

test('pausing a unit: nothing is owed, nothing completes, nothing re-dates, no evidence; resuming brings back the SAME stage; both are idempotent and append-only', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    const required = reviews.obligations(db, userId, { date: D1 }).units[0].required;
    const dates = JSON.stringify(stages(db, unit.id));
    const first = reviews.pauseUnit(db, userId, unit.id);
    const second = reviews.pauseUnit(db, userId, unit.id);
    assert.equal(first.paused, true); assert.equal(second.paused, true); assert.equal(second.changed, false, 'pausing twice is one fact');
    const view = reviews.obligations(db, userId, { date: D1 }).units[0];
    assert.equal(view.paused, true); assert.equal(view.required, null);
    assert.equal(reviews.completeObligation(db, userId, unit.id, { date: D1, profile: 'DECIDED' }).completedId, null);
    assert.equal(reviews.agenda(db, userId, { date: D1 }).overdue.length, 0, 'a paused unit is not asked for');
    assert.equal(JSON.stringify(stages(db, unit.id)), dates, 'no date moved, nothing completed');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 0);
    const resumed = reviews.resumeUnit(db, userId, unit.id);
    assert.equal(resumed.paused, false);
    assert.equal(reviews.resumeUnit(db, userId, unit.id).changed, false);
    assert.equal(reviews.obligations(db, userId, { date: D1 }).units[0].required.id, required.id, 'the same stage is owed: time paused did not advance the progression');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_unit_pauses').get().n, 2);
    assert.throws(() => db.prepare('DELETE FROM review_unit_pauses').run(), /append-only/);
    const other = makeUser(db, 'x@example.com');
    assert.throws(() => reviews.pauseUnit(db, other, unit.id), /não encontrada/i);
  } finally { cleanup(); }
});

test('the plan keeps a paused unit VISIBLE as deferred with the reason PAUSED, and plans the others', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    const b = learningUnits.create(db, userId, { newSubjectName: 'Anatomia', title: 'Aula B', studyDate: '2026-09-10' }).unit;
    reviews.pauseUnit(db, userId, unit.id);
    const out = plan.dailyPlan(db, userId, { date: D1, availableMinutes: 30, perReviewMinutes: 10 });
    assert.deepEqual(out.planned.map((p) => p.unitId), [b.id]);
    const paused = out.deferred.find((d) => d.unitId === unit.id);
    assert.equal(paused.reason, 'PAUSED');
    assert.equal(out.planned.length + out.deferred.length, 2, 'nothing disappears');
  } finally { cleanup(); }
});

test('HTTP: pause / resume / complete?profile=DECIDED are owner-only and validated', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const pw = 'a genuinely long test password 1';
    const session = async (email) => {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const cookie = login.headers['set-cookie'].split(';')[0];
      const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
      return { cookie, csrf: me.csrfToken };
    };
    const alice = await session('alice@example.com');
    const bob = await session('bob@example.com');
    const aliceId = db.prepare("SELECT id FROM users WHERE email = 'alice@example.com'").get().id;
    const unit = learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-01-01' }).unit;
    const post = (s, path, body = {}) => app.inject({ method: 'POST', url: `/v1/review-obligations/${unit.id}/${path}`, headers: { origin: ORIGIN, 'content-type': 'application/json', ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}) }, payload: body });
    assert.equal((await post(null, 'pause')).statusCode, 401);
    assert.equal((await post(bob, 'pause')).statusCode, 404, 'another user cannot pause it');
    assert.equal((await post(alice, 'complete', { profile: 'INVENTED' })).statusCode, 400);
    assert.equal(JSON.parse((await post(alice, 'pause')).body).paused, true);
    assert.equal(JSON.parse((await post(alice, 'complete', { date: D1, profile: 'DECIDED' })).body).completedId, null);
    assert.equal(JSON.parse((await post(alice, 'resume')).body).paused, false);
    const done = JSON.parse((await post(alice, 'complete', { date: D1, profile: 'DECIDED' })).body);
    assert.ok(done.completedId && done.rescheduled.length > 0 && done.supersededIds.length === 0);
  } finally { await app.close(); cleanup(); }
});
