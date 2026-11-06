// Knowledge/gaps (experimental, reversible): the read-only view of observed evidence per unit over the REAL ledger of a disposable database.
// It writes nothing, never says "mastery", and counts only unassisted attempts as independent evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';
import * as attempts from '../src/services/attempts.js';
import * as evidence from '../src/services/unit-signals.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-signals-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
const answer = (db, userId, exerciseId, outcome, { reveal = false } = {}) => {
  const a = attempts.start(db, userId, { exerciseId });
  if (reveal) attempts.revealSolution(db, userId, a.id);
  return attempts.submit(db, userId, a.id, { outcome, assessmentMethod: 'SELF_REPORT' });
};

test('unitSignals(): independent wrong answers on enough distinct questions are a GAP_SIGNAL; the same answers with the solution shown are not evidence; nothing is written', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 's@example.com');
    const weak = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula fraca', studyDate: '2026-01-01' }).unit;
    const shown = learningUnits.create(db, userId, { newSubjectName: 'Anatomia', title: 'Aula com solução', studyDate: '2026-01-01' }).unit;
    const quiet = learningUnits.create(db, userId, { newSubjectName: 'Histologia', title: 'Aula sem tentativas', studyDate: '2026-01-01' }).unit;
    const mk = (unit, n) => Array.from({ length: n }, (_, i) => exercises.create(db, userId, { unitId: unit.id, question: `Pergunta ${unit.id}-${i}?`, answer: 'R', provenance: 'MANUAL' }));
    const weakEx = mk(weak, 5);
    const shownEx = mk(shown, 5);
    for (const [i, ex] of weakEx.entries()) answer(db, userId, ex.id, i === 0 ? 'CORRECT' : 'INCORRECT');
    for (const ex of weakEx.slice(0, 2)) answer(db, userId, ex.id, 'INCORRECT');
    for (const ex of shownEx) answer(db, userId, ex.id, 'INCORRECT', { reveal: true });
    const digest = JSON.stringify(db.prepare('SELECT * FROM learning_events ORDER BY id').all());

    const out = evidence.unitSignals(db, userId);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM learning_events ORDER BY id').all()), digest, 'read-only');
    const byUnit = Object.fromEntries(out.units.map((u) => [u.unitId, u]));
    assert.equal(byUnit[weak.id].signal, 'GAP_SIGNAL');
    assert.deepEqual(byUnit[weak.id].independent, { attempts: 7, correct: 1, distinctQuestions: 5 });
    assert.equal(byUnit[shown.id].signal, 'INSUFFICIENT', 'five wrong answers WITH the solution revealed are not independent evidence');
    assert.equal(byUnit[shown.id].assisted, 5);
    assert.equal(byUnit[quiet.id], undefined, 'a unit with no attempts has no entry (no invented zero)');
    for (const u of out.units) assert.ok(!('mastery' in u) && !('level' in u));
  } finally { cleanup(); }
});

test('GET /v1/unit-signals: owner only, anonymous is 401, another user sees nothing', async () => {
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
    const unit = learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-01-01' }).unit;
    const ex = exercises.create(db, aliceId, { unitId: unit.id, question: 'P?', answer: 'R', provenance: 'MANUAL' });
    answer(db, aliceId, ex.id, 'CORRECT');
    const mine = JSON.parse((await app.inject({ method: 'GET', url: '/v1/unit-signals', headers: { cookie: alice } })).body);
    assert.equal(mine.units.length, 1);
    assert.equal(mine.units[0].signal, 'INSUFFICIENT');
    assert.equal(JSON.parse((await app.inject({ method: 'GET', url: '/v1/unit-signals', headers: { cookie: bob } })).body).units.length, 0);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/unit-signals' })).statusCode, 401);
  } finally { await app.close(); cleanup(); }
});
