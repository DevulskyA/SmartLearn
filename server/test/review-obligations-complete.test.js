// HG-09 experimental D4b: doing the required review of a unit, with D-13 (recovery) and D-14 (anchor) as NAMED parameters.
// Defaults reproduce today's V1 calendar exactly; the student's decisions only choose among implemented options. Disposable database only.
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
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const TODAY = '2026-10-18';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-obl-complete-'));
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
  const userId = makeUser(db, 'o@example.com');
  const unit = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula A', studyDate: '2026-01-01' }).unit;
  return { userId, unit };
};
const tasks = (db, unitId) => db.prepare('SELECT id, offset_days AS o, due_date AS due, completed_at AS done FROM review_tasks WHERE unit_id = ? ORDER BY offset_days').all(unitId);
const agendaOverdue = (db, userId) => reviews.agenda(db, userId, { date: TODAY }).overdue.length;

test('defaults (recovery NONE, anchor PLANNED_DATE) = today\'s calendar: only the required review is completed, no date moves, nothing is retired', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    const before = tasks(db, unit.id);
    const out = reviews.completeObligation(db, userId, unit.id, { date: TODAY });
    assert.equal(out.recovery, 'NONE'); assert.equal(out.anchor, 'PLANNED_DATE');
    assert.deepEqual(out.supersededIds, []); assert.deepEqual(out.rescheduled, []);
    const after = tasks(db, unit.id);
    assert.equal(after.filter((t) => t.done).length, 1);
    assert.deepEqual(after.map((t) => t.due), before.map((t) => t.due), 'no date moved');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_task_supersessions').get().n, 0);
    assert.equal(reviews.obligations(db, userId, { date: TODAY }).units[0].required.id !== out.completedId, true, 'the next overdue stage is owed in turn: the pile is only reordered');
  } finally { cleanup(); }
});

test('SUPERSEDE_OVERDUE retires the older overdue stages as NOT performed: not completed, no evidence, still in the history, gone from the agenda', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    const total = tasks(db, unit.id).length;
    const overdueBefore = agendaOverdue(db, userId);
    assert.ok(overdueBefore >= 6);
    const out = reviews.completeObligation(db, userId, unit.id, { date: TODAY, recovery: 'SUPERSEDE_OVERDUE' });
    assert.equal(out.supersededIds.length, overdueBefore - 1);
    const after = tasks(db, unit.id);
    assert.equal(after.length, total, 'history rows are all still there');
    assert.equal(after.filter((t) => t.done).length, 1, 'only the performed review is completed');
    assert.ok(out.supersededIds.every((id) => after.find((t) => t.id === id).done === null), 'superseded is not completed');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 0, 'no evidence was invented (review without questions)');
    assert.equal(agendaOverdue(db, userId), 0, 'the retired stages are no longer asked for');
    assert.equal(reviews.obligations(db, userId, { date: TODAY }).units[0].required, null);
    assert.throws(() => db.prepare('DELETE FROM review_task_supersessions').run(), /append-only/);
    assert.throws(() => db.prepare("UPDATE review_task_supersessions SET policy = 'SUPERSEDE_OVERDUE'").run(), /append-only/);
  } finally { cleanup(); }
});

test('ACTUAL_DATE anchors the NEXT intervals on the day the review was really done; the original dates are kept; omitted/retired stages do not advance the progression', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    const before = tasks(db, unit.id);
    const out = reviews.completeObligation(db, userId, unit.id, { date: TODAY, recovery: 'SUPERSEDE_OVERDUE', anchor: 'ACTUAL_DATE' });
    const done = before.find((t) => t.id === out.completedId);
    const after = tasks(db, unit.id);
    const pendingFuture = after.filter((t) => !t.done && !out.supersededIds.includes(t.id));
    assert.ok(pendingFuture.length > 0);
    const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    for (const t of pendingFuture) assert.equal(t.due, addDays(TODAY, t.o - done.o), `stage ${t.o}: gap to the performed stage, counted from the real day`);
    const log = db.prepare('SELECT * FROM review_task_reschedules').all();
    assert.equal(log.length, pendingFuture.length);
    assert.ok(log.every((r) => r.anchor === 'ACTUAL_DATE' && r.anchored_on_task_id === out.completedId));
    for (const r of log) assert.equal(r.from_due_date, before.find((t) => t.id === r.task_id).due, 'the planned date is kept');
    assert.deepEqual(after.filter((t) => out.supersededIds.includes(t.id)).map((t) => t.due), before.filter((t) => out.supersededIds.includes(t.id)).map((t) => t.due), 'retired stages keep their dates');
  } finally { cleanup(); }
});

test('validated named parameters, nothing to do is a no-op, a unit of another user is NOT_FOUND-like (no effect), and a second call never double-completes', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit } = seed(db);
    assert.throws(() => reviews.completeObligation(db, userId, unit.id, { date: TODAY, recovery: 'INVENTED' }), /recovery/);
    assert.throws(() => reviews.completeObligation(db, userId, unit.id, { date: TODAY, anchor: 'INVENTED' }), /anchor/);
    const other = makeUser(db, 'x@example.com');
    assert.deepEqual(reviews.completeObligation(db, other, unit.id, { date: TODAY }).completedId, null);
    assert.equal(tasks(db, unit.id).filter((t) => t.done).length, 0);
    reviews.completeObligation(db, userId, unit.id, { date: TODAY, recovery: 'SUPERSEDE_OVERDUE' });
    const again = reviews.completeObligation(db, userId, unit.id, { date: TODAY, recovery: 'SUPERSEDE_OVERDUE' });
    assert.equal(again.completedId, null, 'nothing is owed any more: no second completion');
    assert.equal(tasks(db, unit.id).filter((t) => t.done).length, 1);
  } finally { cleanup(); }
});

test('POST /v1/review-obligations/:unitId/complete: owner only, parameters validated, anonymous is 401', async () => {
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
    const aliceId = db.prepare("SELECT id FROM users WHERE email = 'alice@example.com'").get().id;
    const unit = learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-01-01' }).unit;
    const post = (s, body, unitId = unit.id) => app.inject({ method: 'POST', url: `/v1/review-obligations/${unitId}/complete`, headers: { origin: ORIGIN, 'content-type': 'application/json', ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}) }, payload: body });
    assert.equal((await post(null, {})).statusCode, 401);
    assert.equal((await post(alice, { recovery: 'INVENTED' })).statusCode, 400);
    const ok = await post(alice, { date: TODAY, recovery: 'SUPERSEDE_OVERDUE', anchor: 'ACTUAL_DATE' });
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.ok(body.completedId && body.supersededIds.length > 0 && body.rescheduled.length > 0, JSON.stringify(body).slice(0, 300));
  } finally { await app.close(); cleanup(); }
});
