// "Adiar vencidas" (HG-09): overdue reviews are moved to future days. They stay PENDING, keep their stage, create no evidence, are never deleted,
// the old date is logged append-only, and repeating the action changes nothing. Disposable database only.
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
const TODAY = '2026-11-04';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-postpone-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
// 9 units studied long ago: each has several stages overdue at TODAY.
function seed(db, email = 'p@example.com', units = 9) {
  const userId = makeUser(db, email);
  const ids = [];
  let subjectId;
  for (let i = 0; i < units; i += 1) {
    const day = `2026-10-${String(10 + i).padStart(2, '0')}`;
    const { unit } = learningUnits.create(db, userId, subjectId ? { subjectId, title: `Aula ${i + 1}`, studyDate: day } : { newSubjectName: 'Medicina', title: `Aula ${i + 1}`, studyDate: day });
    subjectId = unit.subjectId;
    ids.push(unit.id);
  }
  return { userId, ids };
}
const tasks = (db, userId) => db.prepare('SELECT id, unit_id, offset_days, due_date, completed_at FROM review_tasks WHERE user_id = ? ORDER BY id').all(userId);
const counts = (db) => ({
  tasks: db.prepare('SELECT COUNT(*) AS n FROM review_tasks').get().n,
  evidence: db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n,
});

test('overdue reviews move to future days, at most perDay per day; they stay pending, keep their stage and create no evidence', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId } = seed(db);
    const before = tasks(db, userId);
    const overdueBefore = reviews.agenda(db, userId, { date: TODAY }).overdue;
    assert.ok(overdueBefore.length >= 12, 'fixture must leave a real pile overdue');
    const counted = counts(db);

    const out = reviews.postponeOverdue(db, userId, { date: TODAY, perDay: 5 });
    assert.equal(out.postponed, overdueBefore.length);
    assert.ok(out.days.every((d) => d.count <= 5 && d.date > TODAY));
    assert.equal(out.days.reduce((s, d) => s + d.count, 0), overdueBefore.length);

    const after = tasks(db, userId);
    assert.deepEqual(counts(db), counted, 'no review created or deleted, evidence stays at zero');
    assert.equal(counted.evidence, 0);
    for (const t of before) {
      const now = after.find((a) => a.id === t.id);
      assert.equal(now.offset_days, t.offset_days, 'the stage does not change');
      assert.equal(now.completed_at, t.completed_at, 'nothing is completed');
      const moved = overdueBefore.some((o) => o.id === t.id);
      assert.equal(now.due_date !== t.due_date, moved, 'exactly the overdue ones moved');
    }
    const agenda = reviews.agenda(db, userId, { date: TODAY });
    assert.equal(agenda.overdue.length, 0, 'the pile is gone from Vencidas');
    assert.equal(agenda.completedToday.length, 0);
    // a postponed review is STILL pending: it shows up as due on its new day
    const first = out.days[0].date;
    const onFirstDay = reviews.agenda(db, userId, { date: first }).today.filter((t) => out.moves.some((m) => m.id === t.id && m.to === first));
    assert.equal(onFirstDay.length, out.days[0].count, 'still pending, due on its new day');
  } finally { cleanup(); }
});


test('the old date is kept in an append-only log', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId } = seed(db);
    const before = new Map(tasks(db, userId).map((t) => [t.id, t.due_date]));
    const out = reviews.postponeOverdue(db, userId, { date: TODAY, perDay: 4 }, () => new Date('2026-11-04T12:00:00.000Z'));
    const log = db.prepare('SELECT task_id, from_due_date, to_due_date, postponed_at FROM review_task_postponements ORDER BY id').all();
    assert.equal(log.length, out.postponed);
    for (const row of log) {
      assert.equal(row.from_due_date, before.get(row.task_id));
      assert.ok(row.to_due_date > row.from_due_date);
      assert.equal(row.postponed_at, '2026-11-04T12:00:00.000Z');
    }
    assert.throws(() => db.prepare('DELETE FROM review_task_postponements').run(), /append-only/);
    assert.throws(() => db.prepare('UPDATE review_task_postponements SET to_due_date = ?').run('2030-01-01'), /append-only/);
  } finally { cleanup(); }
});

test('idempotent: repeating it the same day moves nothing and logs nothing more', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId } = seed(db);
    const first = reviews.postponeOverdue(db, userId, { date: TODAY, perDay: 5 });
    const snapshot = tasks(db, userId);
    const logged = db.prepare('SELECT COUNT(*) AS n FROM review_task_postponements').get().n;
    const second = reviews.postponeOverdue(db, userId, { date: TODAY, perDay: 5 });
    assert.ok(first.postponed > 0);
    assert.equal(second.postponed, 0);
    assert.deepEqual(second.moves, []);
    assert.deepEqual(tasks(db, userId), snapshot);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_task_postponements').get().n, logged);
  } finally { cleanup(); }
});

test('what is not overdue is untouched: today, future, completed, other users and paused units', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, ids } = seed(db, 'a@example.com', 3);
    const other = seed(db, 'b@example.com', 2);
    // one stage done long ago (completed): it must keep its date
    const doneTask = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY offset_days LIMIT 1').get(userId, ids[0]);
    reviews.complete(db, userId, doneTask.id, {});
    const doneBefore = tasks(db, userId).find((t) => t.id === doneTask.id);
    // a paused unit is not asked for today, so it is not touched
    reviews.pauseUnit(db, userId, ids[1]);
    const pausedBefore = tasks(db, userId).filter((t) => t.unit_id === ids[1]);
    const futureBefore = tasks(db, userId).filter((t) => t.due_date >= TODAY && t.unit_id !== ids[1]);
    const otherBefore = tasks(db, other.userId);

    reviews.postponeOverdue(db, userId, { date: TODAY, perDay: 5 });

    assert.deepEqual(tasks(db, userId).find((t) => t.id === doneTask.id), doneBefore);
    assert.deepEqual(tasks(db, userId).filter((t) => t.unit_id === ids[1]), pausedBefore);
    for (const t of futureBefore) assert.equal(tasks(db, userId).find((a) => a.id === t.id).due_date, t.due_date);
    assert.deepEqual(tasks(db, other.userId), otherBefore, 'another account is never touched');
    assert.equal(reviews.agenda(db, other.userId, { date: TODAY }).overdue.length > 0, true);
  } finally { cleanup(); }
});

test('a postponed review is still completed the normal way, with evidence only when the student answers', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, ids } = seed(db, 'c@example.com', 1);
    const out = reviews.postponeOverdue(db, userId, { date: TODAY, perDay: 5 });
    const move = out.moves[0];
    const result = reviews.complete(db, userId, move.id, { questionsCount: 4, correctCount: 3 });
    assert.equal(result.reviewOnly, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?').get(ids[0]).n, 1, 'evidence exists only because the student answered');
  } finally { cleanup(); }
});

test('validation: perDay out of range or a malformed date is refused and nothing moves', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId } = seed(db);
    const snapshot = tasks(db, userId);
    for (const perDay of [0, -3, 1.5, 31, 'x']) assert.throws(() => reviews.postponeOverdue(db, userId, { date: TODAY, perDay }), (e) => e.code === 'VALIDATION_FAILED' && e.field === 'perDay', String(perDay));
    assert.throws(() => reviews.postponeOverdue(db, userId, { date: '04/11/2026', perDay: 5 }), (e) => e.code === 'VALIDATION_FAILED' && e.field === 'date');
    assert.deepEqual(tasks(db, userId), snapshot);
  } finally { cleanup(); }
});

test('HTTP: POST /v1/review-tasks/postpone-overdue needs a session and a CSRF token, is owner-scoped and validates input', async () => {
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
    learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-10-01' });
    const post = (s, body = {}, extra = {}) => app.inject({ method: 'POST', url: '/v1/review-tasks/postpone-overdue', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(s ? { cookie: s.cookie, ...(extra.noCsrf ? {} : { 'x-csrf-token': s.csrf }) } : {}) }, payload: body });
    assert.equal((await post(null, { date: TODAY })).statusCode, 401);
    assert.equal((await post(alice, { date: TODAY }, { noCsrf: true })).statusCode, 403);
    assert.equal((await post(alice, { date: TODAY, perDay: 0 })).statusCode, 400);
    const bobOut = await post(bob, { date: TODAY });
    assert.equal(JSON.parse(bobOut.body).postponed, 0, 'bob has nothing overdue; alice\'s reviews are not his');
    const overdue = reviews.agenda(db, aliceId, { date: TODAY }).overdue.length;
    assert.ok(overdue > 0);
    const ok = await post(alice, { date: TODAY, perDay: 3 });
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.equal(body.postponed, overdue);
    assert.equal(body.perDay, 3);
    assert.ok(body.days.every((d) => d.count <= 3));
    assert.equal(reviews.agenda(db, aliceId, { date: TODAY }).overdue.length, 0);
    assert.equal(JSON.parse((await post(alice, { date: TODAY, perDay: 3 })).body).postponed, 0, 'second call: nothing left to move');
  } finally { await app.close(); cleanup(); }
});
