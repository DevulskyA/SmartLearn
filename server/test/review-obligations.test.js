// HG-09 experimental (D-12 option 3), D4a: the read-only view of "one required review per unit" over the REAL tables of a disposable database.
// It writes nothing, changes no due date and decides neither D-13 (what recovers) nor D-14 (the anchor).
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

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-obligations-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
const rowsDigest = (db) => JSON.stringify(db.prepare('SELECT * FROM review_tasks ORDER BY id').all());

test('obligations(): many overdue stages become ONE required review per unit; nothing is written and no date moves', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'o@example.com');
    const a = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula A', studyDate: '2026-01-01' }).unit;
    const b = learningUnits.create(db, userId, { newSubjectName: 'Anatomia', title: 'Aula B', studyDate: '2026-09-25' }).unit;
    const before = rowsDigest(db);
    const out = reviews.obligations(db, userId, { date: '2026-10-18' });
    assert.equal(rowsDigest(db), before, 'read-only: the review_tasks rows are byte-identical');
    assert.equal(out.recovery, 'NONE');
    const byUnit = Object.fromEntries(out.units.map((u) => [u.unitId, u]));
    assert.ok(byUnit[a.id].required, 'the long-overdue unit owes exactly one');
    assert.ok(byUnit[a.id].collapsedCount >= 5, 'its older overdue stages are counted, not asked one by one');
    assert.equal(byUnit[a.id].unitTitle, 'Aula A');
    assert.ok(byUnit[b.id].required && byUnit[b.id].collapsedCount < byUnit[a.id].collapsedCount);
    assert.equal(out.units.filter((u) => u.required).length, 2, 'at most one required review per unit');
    const agenda = reviews.agenda(db, userId, { date: '2026-10-18' });
    assert.ok(agenda.overdue.length > out.units.filter((u) => u.required).length, 'today\'s agenda lists every overdue stage; obligations() collapses them');
  } finally { cleanup(); }
});

test('GET /v1/review-obligations: owner only, recovery is a validated named parameter, 401 when anonymous', async () => {
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
    learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula A', studyDate: '2026-01-01' });

    const ok = await app.inject({ method: 'GET', url: '/v1/review-obligations?date=2026-10-18', headers: { cookie: alice } });
    assert.equal(ok.statusCode, 200);
    assert.equal(JSON.parse(ok.body).units.length, 1);
    const sup = await app.inject({ method: 'GET', url: '/v1/review-obligations?date=2026-10-18&recovery=SUPERSEDE_OVERDUE', headers: { cookie: alice } });
    assert.equal(JSON.parse(sup.body).recovery, 'SUPERSEDE_OVERDUE');
    assert.equal((await app.inject({ method: 'GET', url: '/v1/review-obligations?recovery=INVENTED', headers: { cookie: alice } })).statusCode, 400);
    assert.equal(JSON.parse((await app.inject({ method: 'GET', url: '/v1/review-obligations?date=2026-10-18', headers: { cookie: bob } })).body).units.length, 0, 'another user sees none of it');
    assert.equal((await app.inject({ method: 'GET', url: '/v1/review-obligations' })).statusCode, 401);
  } finally { await app.close(); cleanup(); }
});
