// D6 (experimental, disposable DB): the decided profile over a whole life of a unit - returns after any delay, repeated clicks, a failed completion,
// a restart of the database - never breaks the invariants the student decided: at most ONE obligation per unit, ONE stage per performed review,
// no stage skipped because of delay, no completion or evidence out of thin air, history only grows.
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

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const stages = (db, unitId) => db.prepare('SELECT id, offset_days AS o, due_date AS due, completed_at AS done FROM review_tasks WHERE unit_id = ? ORDER BY offset_days').all(unitId);

function openFresh() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-timeline-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const now = new Date().toISOString();
  const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('t@example.com', 't@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
  return { dir, path, db, userId, cleanup: (d) => { d.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('over 25 seeded lives with random absences: one stage per performed review, in order, never skipped by delay, due dates stay increasing, history only grows', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const { db, userId, cleanup } = openFresh();
    try {
      const rnd = mulberry32(seed);
      const unit = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: `Aula ${seed}`, studyDate: '2026-01-01' }).unit;
      const total = stages(db, unit.id).length;
      let today = '2026-01-02';
      let performed = 0;
      for (let step = 0; step < 40 && performed < total; step += 1) {
        const before = stages(db, unit.id);
        const out = reviews.completeObligation(db, userId, unit.id, { date: today, profile: 'DECIDED' });
        const after = stages(db, unit.id);
        assert.equal(after.length, total, `seed ${seed}: history rows never disappear`);
        const completed = after.filter((t) => t.done);
        if (out.completedId === null) {
          assert.equal(completed.length, performed, `seed ${seed}: nothing owed = nothing completed`);
        } else {
          performed += 1;
          assert.equal(completed.length, performed, `seed ${seed}: exactly one more stage per performed review`);
          assert.deepEqual(completed.map((t) => t.o), after.slice(0, performed).map((t) => t.o), `seed ${seed}: stages are performed in order, none skipped by delay`);
          const next = after[performed];
          if (next) assert.equal(next.due, addDays(today, next.o - after[performed - 1].o), `seed ${seed}: the next interval starts on the day it was really done`);
        }
        const pending = after.filter((t) => !t.done);
        assert.ok(pending.every((t, i) => i === 0 || pending[i - 1].due < t.due), `seed ${seed}: pending dates strictly increase`);
        assert.ok(reviews.obligations(db, userId, { date: today }).units.filter((u) => u.required).length <= 1);
        assert.equal(before.filter((t) => t.done).every((t) => after.find((x) => x.id === t.id).done === t.done), true, 'a completion is never undone');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 0, 'no evidence out of thin air');
        // the student returns after a random absence: some days, some weeks, sometimes more than a year
        const gap = rnd() < 0.15 ? 200 + Math.floor(rnd() * 400) : 1 + Math.floor(rnd() * 60);
        today = addDays(today, gap);
      }
      assert.ok(performed >= 3, `seed ${seed}: the life produced real progress (${performed})`);
    } finally { cleanup(db); }
  }
});

test('a failed completion leaves NOTHING behind (atomic): no completion, no re-dating, no log row', () => {
  const { db, userId, cleanup } = openFresh();
  try {
    const unit = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-01-01' }).unit;
    const digest = () => JSON.stringify([stages(db, unit.id), db.prepare('SELECT COUNT(*) AS n FROM review_task_reschedules').get(), db.prepare('SELECT COUNT(*) AS n FROM review_task_supersessions').get()]);
    const before = digest();
    assert.throws(() => reviews.completeObligation(db, userId, unit.id, { date: '2026-10-18', profile: 'DECIDED', questionsCount: 5, correctCount: 9 }), /correctCount/);
    assert.equal(digest(), before);
  } finally { cleanup(db); }
});

test('the state survives closing and reopening the database file (persistence), and a double click the same day performs nothing twice', () => {
  const { db, path, dir, userId } = openFresh();
  let reopened;
  try {
    const unit = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-01-01' }).unit;
    const first = reviews.completeObligation(db, userId, unit.id, { date: '2026-10-18', profile: 'DECIDED' });
    const twice = reviews.completeObligation(db, userId, unit.id, { date: '2026-10-18', profile: 'DECIDED' });
    assert.ok(first.completedId); assert.equal(twice.completedId, null);
    reviews.pauseUnit(db, userId, unit.id);
    const snapshot = JSON.stringify([stages(db, unit.id), reviews.obligations(db, userId, { date: '2026-10-18' }).units]);
    db.close();
    reopened = openDb(path);
    runMigrations(reopened, MIGRATIONS_DIR);
    assert.equal(JSON.stringify([stages(reopened, unit.id), reviews.obligations(reopened, userId, { date: '2026-10-18' }).units]), snapshot);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM review_task_reschedules').get().n > 0, true);
  } finally { (reopened ?? db).close?.(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
