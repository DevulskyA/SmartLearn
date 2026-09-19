import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as priorities from '../src/services/priorities.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as subjects from '../src/services/subjects.js';
import * as evidence from '../src/services/evidence.js';
import * as exercises from '../src/services/exercises.js';
import * as attempts from '../src/services/attempts.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';
const TODAY = '2026-09-19';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-priorities-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, dir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

test('real owned data: overdue reviews come first with reason codes, weak practice comes from observed evidence, and it is owner-scoped', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = makeUser(db, 'prio-a@example.com');
    const b = makeUser(db, 'prio-b@example.com');
    const studied = learningUnits.create(db, a, { newSubjectName: 'Fisiologia', title: 'Renal', studyDate: '2026-09-01' }).unit;
    const other = learningUnits.create(db, a, { subjectId: studied.subjectId, title: 'Cardio', studyDate: '2026-09-18' }).unit;
    // Cardio: recent, insufficient-for-due volume but clearly weak by observed evidence.
    evidence.create(db, a, { unitId: other.id, type: 'EXTERNAL', questionsCount: 20, correctCount: 6, evidenceDate: '2026-09-18' });

    const got = priorities.get(db, a, { date: TODAY });
    assert.equal(got.asOf, TODAY);
    const overdue = got.due.filter((d) => d.kind === 'OVERDUE');
    assert.ok(overdue.length > 0, 'a unit studied 18 days ago has overdue reviews');
    assert.deepEqual(got.due.map((d) => d.dueDate), [...got.due.map((d) => d.dueDate)].sort(), 'oldest due first');
    assert.ok(got.due.every((d) => d.reasonCodes[0] === d.kind));
    // Every due review of the Renal unit is explained as having no evidence yet (never a fake 0%).
    const renal = got.due.filter((d) => d.unitId === studied.id);
    assert.ok(renal.length > 0 && renal.every((d) => d.evidence.accuracyPct === null && d.reasonCodes.includes('NO_EVIDENCE_YET')));

    const weakIds = got.weakPractice.map((w) => w.unitId);
    const cardioDue = got.due.some((d) => d.unitId === other.id);
    assert.ok(cardioDue !== weakIds.includes(other.id), 'a unit is either explained inside due or suggested as weak, never both');

    const asB = priorities.get(db, b, { date: TODAY });
    assert.deepEqual(asB.due, []);
    assert.deepEqual(asB.weakPractice, []);
  } finally { cleanup(); }
});

test('ledger errors surface a unit through reinforcement without touching its aggregate sample; inactive subjects are never suggested', () => {
  const { db, cleanup } = tmpDb();
  try {
    const u = makeUser(db, 'prio-c@example.com');
    const future = learningUnits.create(db, u, { newSubjectName: 'Farmaco', title: 'Ansioliticos', studyDate: '2026-09-25' }).unit;
    const archivedUnit = learningUnits.create(db, u, { newSubjectName: 'Arquivada', title: 'Velha', studyDate: '2026-09-25' }).unit;
    const ex = exercises.create(db, u, { unitId: future.id, question: 'Q?', answer: 'A', provenance: 'MANUAL' });
    const exOld = exercises.create(db, u, { unitId: archivedUnit.id, question: 'Q2?', answer: 'A', provenance: 'MANUAL' });
    for (const e of [ex, exOld]) {
      const at = attempts.start(db, u, { exerciseId: e.id });
      attempts.submit(db, u, at.id, { outcome: 'INCORRECT', assessmentMethod: 'SELF_REPORT' });
    }
    subjects.archive(db, u, archivedUnit.subjectId);

    const got = priorities.get(db, u, { date: TODAY });
    assert.deepEqual(got.weakPractice.map((w) => w.unitId), [future.id]);
    assert.deepEqual(got.weakPractice[0].reasonCodes, ['ITEMS_TO_REINFORCE']);
    assert.equal(got.weakPractice[0].reinforceCount, 1);
    assert.equal(got.weakPractice[0].evidence.questions, 0, 'a ledger attempt is not aggregate evidence');
  } finally { cleanup(); }
});

test('invalid date is a validation error, not a crash; read-only: reviews and evidence are unchanged after a call', () => {
  const { db, cleanup } = tmpDb();
  try {
    const u = makeUser(db, 'prio-d@example.com');
    learningUnits.create(db, u, { newSubjectName: 'Biologia', title: 'Celula', studyDate: '2026-09-01' });
    for (const bad of ['ontem', '2026-13-45', '2026-9-1']) {
      assert.throws(() => priorities.get(db, u, { date: bad }), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'date');
    }
    const snap = () => JSON.stringify([
      db.prepare('SELECT * FROM review_tasks WHERE user_id = ? ORDER BY id').all(u),
      db.prepare('SELECT * FROM learning_evidence WHERE user_id = ? ORDER BY id').all(u),
    ]);
    const before = snap();
    priorities.get(db, u, { date: TODAY });
    assert.equal(snap(), before);
  } finally { cleanup(); }
});

test('GET /v1/priorities: 401 anonymous, 400 on a bad date, 200 with the priorities shape for a signed-in user', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/v1/priorities' })).statusCode, 401);
    const email = 'httpprio@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    assert.equal((await app.inject({ method: 'GET', url: '/v1/priorities?date=nope', headers: { cookie } })).statusCode, 400);
    const ok = await app.inject({ method: 'GET', url: `/v1/priorities?date=${TODAY}`, headers: { cookie } });
    assert.equal(ok.statusCode, 200);
    const body = ok.json();
    assert.equal(body.asOf, TODAY);
    assert.deepEqual(body.due, []);
    assert.deepEqual(body.weakPractice, []);
    assert.equal(body.policyVersion, 1);
  } finally { await app.close(); cleanup(); }
});
