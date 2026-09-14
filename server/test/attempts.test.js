import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as attempts from '../src/services/attempts.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-attempts-'));
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

function makeExercise(db, userId, unitId, overrides = {}) {
  return exercises.create(db, userId, { unitId, question: 'O que é hipertensão?', answer: 'PA elevada', hint: 'Pense em pressão', provenance: 'MANUAL', ...overrides });
}

test('start creates an attempt pinned to the exercise\'s current version, with max_assistance NONE and status STARTED', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);

    const attempt = attempts.start(db, userId, { exerciseId: exercise.id });
    assert.equal(attempt.status, 'STARTED');
    assert.equal(attempt.maxAssistance, 'NONE');
    assert.equal(attempt.exerciseVersionId, exercise.currentVersion.id);
    assert.equal(attempt.question, 'O que é hipertensão?');
    assert.equal(attempt.maxAssistanceAvailable, 'SOLUTION');
  } finally { cleanup(); }
});

test('starting an attempt on an archived exercise is rejected', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    exercises.archive(db, userId, exercise.id);

    assert.throws(() => attempts.start(db, userId, { exerciseId: exercise.id }), (err) => err.code === 'VALIDATION_FAILED');
  } finally { cleanup(); }
});

test('useHint and revealSolution escalate max_assistance monotonically and never decrease it', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });

    const afterHint = attempts.useHint(db, userId, started.id);
    assert.equal(afterHint.hint, 'Pense em pressão');
    assert.equal(attempts.getById(db, userId, started.id).maxAssistance, 'HINT');

    const afterReveal = attempts.revealSolution(db, userId, started.id);
    assert.equal(afterReveal.answer, 'PA elevada');
    assert.equal(attempts.getById(db, userId, started.id).maxAssistance, 'SOLUTION');

    // Requesting a hint again after the solution was already revealed must
    // not demote max_assistance back down to HINT.
    attempts.useHint(db, userId, started.id);
    assert.equal(attempts.getById(db, userId, started.id).maxAssistance, 'SOLUTION');
  } finally { cleanup(); }
});

test('reveal-then-correct stays assisted: submitting CORRECT after revealSolution records assistanceUsed=SOLUTION, never independent (AC-16/AC-17)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });

    attempts.revealSolution(db, userId, started.id);
    const result = attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    assert.equal(result.assistanceUsed, 'SOLUTION');

    const event = db.prepare('SELECT * FROM learning_events WHERE id = ?').get(result.eventId);
    assert.equal(event.assistance_used, 'SOLUTION');
    assert.equal(event.outcome, 'CORRECT');
  } finally { cleanup(); }
});

test('confidence is optional, round-trips through submit, and never affects the recorded outcome', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'j2@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });

    const result = attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT', confidence: 0.2 });
    assert.equal(result.confidence, 0.2);
    const event = db.prepare('SELECT outcome, confidence FROM learning_events WHERE id = ?').get(result.eventId);
    assert.equal(event.outcome, 'CORRECT', 'a low confidence must not downgrade the recorded outcome');
    assert.equal(event.confidence, 0.2);
  } finally { cleanup(); }
});

test('missing outcome/assistance observation stays UNKNOWN, never a coerced default (MX10)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });

    // No hint/reveal action taken; outcome omitted entirely.
    const result = attempts.submit(db, userId, started.id, { assessmentMethod: 'AUTOMATIC' });
    assert.equal(result.outcome, 'UNKNOWN');
    assert.equal(result.assistanceUsed, 'NONE', 'a genuinely unassisted attempt this app fully observed is NONE, not UNKNOWN');

    const event = db.prepare('SELECT * FROM learning_events WHERE id = ?').get(result.eventId);
    assert.equal(event.outcome, 'UNKNOWN');
  } finally { cleanup(); }
});

test('submit is idempotent under a repeated operationKey; without one, resubmitting a SUBMITTED attempt fails closed (concurrent/repeated submit)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });

    const first = attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT', operationKey: 'op-1' });
    const second = attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT', operationKey: 'op-1' });
    assert.deepEqual(first, second);

    const { n } = db.prepare('SELECT COUNT(*) as n FROM learning_events WHERE attempt_id = ?').get(started.id);
    assert.equal(n, 1, 'a repeated same-key submit must not create a second event');

    assert.throws(
      () => attempts.submit(db, userId, started.id, { outcome: 'INCORRECT', assessmentMethod: 'SELF_REPORT' }),
      (err) => err.code === 'ALREADY_SUBMITTED',
    );
    const { n: stillOne } = db.prepare('SELECT COUNT(*) as n FROM learning_events WHERE attempt_id = ?').get(started.id);
    assert.equal(stillOne, 1);
  } finally { cleanup(); }
});

test('editing an exercise after an attempt started leaves the attempt\'s historical version content intact (AC-18)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });
    const originalVersionId = started.exerciseVersionId;

    exercises.edit(db, userId, exercise.id, { question: 'Pergunta editada', answer: 'Resposta editada', provenance: 'MANUAL' });

    const result = attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'AUTOMATIC' });
    const event = db.prepare('SELECT * FROM learning_events WHERE id = ?').get(result.eventId);
    assert.equal(event.exercise_version_id, originalVersionId, 'the event must reference the version shown at attempt start, not the edited one');

    const originalVersion = exercises.getVersion(db, userId, originalVersionId);
    assert.equal(originalVersion.question, 'O que é hipertensão?', 'the original version content must remain byte-identical after the edit');
  } finally { cleanup(); }
});

test('a user cannot start, hint, reveal, submit, or read an attempt owned by another user', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'h@example.com');
    const userB = makeUser(db, 'i@example.com');
    const unitA = makeUnit(db, userA);
    const exerciseA = makeExercise(db, userA, unitA.id);
    const started = attempts.start(db, userA, { exerciseId: exerciseA.id });

    assert.throws(() => attempts.start(db, userB, { exerciseId: exerciseA.id }), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => attempts.getById(db, userB, started.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => attempts.useHint(db, userB, started.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => attempts.revealSolution(db, userB, started.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => attempts.submit(db, userB, started.id, { assessmentMethod: 'AUTOMATIC' }), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('hint/reveal against an already-SUBMITTED attempt fail closed, never reopening or corrupting a finished attempt', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'j@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: exercise.id });
    attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });

    assert.throws(() => attempts.useHint(db, userId, started.id), (err) => err.code === 'ALREADY_SUBMITTED');
    assert.throws(() => attempts.revealSolution(db, userId, started.id), (err) => err.code === 'ALREADY_SUBMITTED');
    assert.equal(attempts.getById(db, userId, started.id).status, 'SUBMITTED', 'the finished attempt must remain SUBMITTED, not reopened');
  } finally { cleanup(); }
});

test('HTTP: full attempt lifecycle over real HTTP with a real session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-attempts-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpattempts@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const unitRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { newSubjectName: 'HTTP Attempt Subject', title: 'Aula HTTP', studyDate: '2026-01-01' },
    });
    const unitId = JSON.parse(unitRes.body).unit.id;

    const exerciseRes = await app.inject({
      method: 'POST', url: `/v1/learning-units/${unitId}/exercises`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { question: 'Pergunta HTTP', answer: 'Resposta HTTP', hint: 'Dica HTTP', provenance: 'MANUAL' },
    });
    const exerciseId = JSON.parse(exerciseRes.body).exercise.id;

    const startRes = await app.inject({
      method: 'POST', url: `/v1/exercises/${exerciseId}/attempts`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken }, payload: {},
    });
    assert.equal(startRes.statusCode, 201);
    const attemptId = JSON.parse(startRes.body).attempt.id;

    const hintRes = await app.inject({ method: 'POST', url: `/v1/attempts/${attemptId}/hint`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken } });
    assert.equal(hintRes.statusCode, 200);
    assert.equal(JSON.parse(hintRes.body).hint, 'Dica HTTP');

    const submitRes = await app.inject({
      method: 'POST', url: `/v1/attempts/${attemptId}/submit`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' },
    });
    assert.equal(submitRes.statusCode, 200);
    assert.equal(JSON.parse(submitRes.body).assistanceUsed, 'HINT');

    const getRes = await app.inject({ method: 'GET', url: `/v1/attempts/${attemptId}`, headers: { cookie } });
    assert.equal(JSON.parse(getRes.body).attempt.status, 'SUBMITTED');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
