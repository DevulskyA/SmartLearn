import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as evidence from '../src/services/evidence.js';
import * as attempts from '../src/services/attempts.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';
import * as reviews from '../src/services/reviews.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
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

function makeUnit(db, userId, studyDate = '2026-01-01') {
  return learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate }).unit;
}

function makeSubmittedAttempt(db, userId, unitId, overrides = {}) {
  const exercise = exercises.create(db, userId, { unitId, question: 'Pergunta?', answer: 'Resposta', provenance: 'MANUAL' });
  const attempt = attempts.start(db, userId, { exerciseId: exercise.id, ...overrides });
  attempts.submit(db, userId, attempt.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
  return attempt;
}

test('create() with no attemptIds behaves exactly as before (baseline, unaffected by the new param)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = makeUnit(db, userId);
    const ev = evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 5, correctCount: 4, evidenceDate: '2026-01-02' });
    assert.equal(ev.questionsCount, 5);
    assert.equal(ev.correctCount, 4);
    assert.equal(ev.reviewTaskId, null);
  } finally { cleanup(); }
});

// FASE 8 mutation-test finding (2026-09-15): create()'s own
// correctCount > questionsCount rejection had no unit-level test in this
// file. Mutating it away survived the entire server suite except one
// incidental hit — evidence-settings.test.js's create() call happened to
// trip the DB's CHECK constraint instead, surfacing a raw SqliteError
// (not the intended EvidenceError('VALIDATION_FAILED')) since that
// wasn't the assertion the test was written to make. This test protects
// the actual contract directly: a clean, typed rejection, not an opaque
// DB-layer error a route handler would turn into a 500 instead of a 400.
test('create() rejects correctCount greater than questionsCount with a clean VALIDATION_FAILED, not a raw DB error', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'overflow@example.com');
    const unit = makeUnit(db, userId);
    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 5, correctCount: 6, evidenceDate: '2026-01-02' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.field === 'correctCount',
    );
  } finally { cleanup(); }
});

test('create() links every given submitted attempt to the new evidence row via evidence_id', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnit(db, userId);
    const a1 = makeSubmittedAttempt(db, userId, unit.id);
    const a2 = makeSubmittedAttempt(db, userId, unit.id);

    const ev = evidence.create(db, userId, {
      unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 2, correctCount: 2, evidenceDate: '2026-01-02',
      attemptIds: [a1.id, a2.id],
    });

    const row1 = db.prepare('SELECT evidence_id FROM exercise_attempts WHERE id = ?').get(a1.id);
    const row2 = db.prepare('SELECT evidence_id FROM exercise_attempts WHERE id = ?').get(a2.id);
    assert.equal(row1.evidence_id, ev.id);
    assert.equal(row2.evidence_id, ev.id);
  } finally { cleanup(); }
});

test('create() rejects an attemptId that is still STARTED, and links nothing from that call', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = makeUnit(db, userId);
    const exercise = exercises.create(db, userId, { unitId: unit.id, question: 'Q', answer: 'A', provenance: 'MANUAL' });
    const started = attempts.start(db, userId, { exerciseId: exercise.id }); // never submitted

    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [started.id] }),
      (err) => err.code === 'VALIDATION_FAILED',
    );
    const evCount = db.prepare('SELECT COUNT(*) AS n FROM learning_evidence WHERE user_id = ?').get(userId).n;
    assert.equal(evCount, 0, 'a rejected link must not leave a half-created evidence row behind');
  } finally { cleanup(); }
});

test('create() rejects an attemptId belonging to a different unit', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unitA = makeUnit(db, userId, '2026-01-01');
    const unitB = learningUnits.create(db, userId, { newSubjectName: 'Anatomia', title: 'Aula 2', studyDate: '2026-01-01' }).unit;
    const attempt = makeSubmittedAttempt(db, userId, unitA.id);

    assert.throws(
      () => evidence.create(db, userId, { unitId: unitB.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [attempt.id] }),
      (err) => err.code === 'VALIDATION_FAILED',
    );
  } finally { cleanup(); }
});

test('create() rejects an attemptId already linked to a review_task (REVIEW-context attempts are not up for grabs)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const unit = makeUnit(db, userId);
    const reviewTask = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY id LIMIT 1').get(userId, unit.id);
    const attempt = makeSubmittedAttempt(db, userId, unit.id, { reviewTaskId: reviewTask.id });

    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [attempt.id] }),
      (err) => err.code === 'VALIDATION_FAILED',
    );
  } finally { cleanup(); }
});

test('create() rejects an attemptId already linked to another evidence row (no double-claiming)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const unit = makeUnit(db, userId);
    const attempt = makeSubmittedAttempt(db, userId, unit.id);
    evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [attempt.id] });

    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-03', attemptIds: [attempt.id] }),
      (err) => err.code === 'VALIDATION_FAILED',
    );
  } finally { cleanup(); }
});

test('create() with attemptIds on type EXTERNAL is rejected (EXTERNAL never has in-app attempts)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    const unit = makeUnit(db, userId);
    const attempt = makeSubmittedAttempt(db, userId, unit.id);

    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [attempt.id] }),
      (err) => err.code === 'VALIDATION_FAILED',
    );
  } finally { cleanup(); }
});

test('create() cannot be tricked into linking another user\'s attempt', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'h@example.com');
    const otherUserId = makeUser(db, 'i@example.com');
    const unit = makeUnit(db, userId);
    const otherUnit = makeUnit(db, otherUserId);
    const otherAttempt = makeSubmittedAttempt(db, otherUserId, otherUnit.id);

    assert.throws(
      () => evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [otherAttempt.id] }),
      (err) => err.code === 'NOT_FOUND',
    );
  } finally { cleanup(); }
});

test('reviews.complete() REVIEW evidence still gets no evidence_id link — it is reconciled via review_task_id instead, exactly as T31 designed', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'j@example.com');
    const unit = makeUnit(db, userId);
    const reviewTask = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY id LIMIT 1').get(userId, unit.id);
    const attempt = makeSubmittedAttempt(db, userId, unit.id, { reviewTaskId: reviewTask.id });

    const completion = reviews.complete(db, userId, reviewTask.id, { questionsCount: 1, correctCount: 1 });
    const evRow = db.prepare('SELECT * FROM learning_evidence WHERE user_id = ? AND review_task_id = ?').get(userId, reviewTask.id);
    assert.equal(completion.evidenceId, evRow.id);

    const attemptRow = db.prepare('SELECT evidence_id, review_task_id FROM exercise_attempts WHERE id = ?').get(attempt.id);
    assert.equal(attemptRow.evidence_id, null, 'REVIEW-context attempts link via review_task_id, not evidence_id');
    assert.equal(attemptRow.review_task_id, reviewTask.id);
  } finally { cleanup(); }
});

// TG-04 / probe P-5 (v1-closure-telemetry): create() used to accept 2099-01-01, 1900-01-01 and 2026-02-31
// (V8 rolls the impossible day over, so "parseable" was the only check). The client always sends its local day,
// so this is a contract guard against bad data in the ledger, not a UI path.
test('create() rejects impossible, future and absurd evidence dates with VALIDATION_FAILED on evidenceDate (TG-04)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'dates@example.com');
    const unit = makeUnit(db, userId);
    const bad = ['2026-02-31', '2026-13-01', '2026-00-10', '2025-02-29', '2099-01-01', '1900-01-01', '2026-1-5', '20260105', '2026-01-05T10:00:00Z', ' 2026-01-05', ''];
    for (const evidenceDate of bad) {
      assert.throws(
        () => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 2, correctCount: 1, evidenceDate }),
        (err) => err.code === 'VALIDATION_FAILED' && err.field === 'evidenceDate',
        `should reject ${JSON.stringify(evidenceDate)}`,
      );
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 0, 'nothing written for rejected dates');
  } finally { cleanup(); }
});

test('create() accepts today, the local day one ahead of UTC, and past dates; rejects two days ahead (TG-04)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'dates-ok@example.com');
    const unit = makeUnit(db, userId);
    const clock = () => new Date('2026-10-17T02:30:00.000Z');
    const create = (evidenceDate) => evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', evidenceDate }, clock);
    assert.equal(create('2026-10-17').evidenceDate, '2026-10-17');
    assert.equal(create('2026-10-16').evidenceDate, '2026-10-16');
    assert.equal(create('2024-02-29').evidenceDate, '2024-02-29', 'real leap day');
    // UTC+14 is already on the 18th while the server is still on the 17th: that is a legitimate local day.
    assert.equal(create('2026-10-18').evidenceDate, '2026-10-18');
    assert.throws(() => create('2026-10-19'), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'evidenceDate');
  } finally { cleanup(); }
});

test('HTTP: POST /learning-evidence answers 400 with field evidenceDate for an impossible or future date (TG-04)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-date-http-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const origin = 'https://smartlearn.test';
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [origin] });
  try {
    const email = 'httpdates@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin }, payload: { email, password } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin }, payload: { email, password } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const headers = { origin, cookie, 'x-csrf-token': JSON.parse(me.body).csrfToken };
    const unitRes = await app.inject({ method: 'POST', url: '/v1/learning-units', headers, payload: { newSubjectName: 'Disciplina HTTP', title: 'Aula', studyDate: '2026-01-01' } });
    const unitId = JSON.parse(unitRes.body).unit.id;
    for (const evidenceDate of ['2026-02-31', '2099-01-01', '1900-01-01']) {
      const res = await app.inject({ method: 'POST', url: '/v1/learning-evidence', headers, payload: { unitId, type: 'EXTERNAL', evidenceDate } });
      assert.equal(res.statusCode, 400, evidenceDate);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_FAILED');
      assert.equal(body.error.field, 'evidenceDate');
    }
    const ok = await app.inject({ method: 'POST', url: '/v1/learning-evidence', headers, payload: { unitId, type: 'EXTERNAL', evidenceDate: '2026-01-02' } });
    assert.equal(ok.statusCode, 201);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
