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
import { getAttemptDetails, ExerciseReviewError } from '../src/services/exercise-review.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exercise-review-'));
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
  return exercises.create(db, userId, { unitId, question: 'Pergunta padrão?', answer: 'Resposta padrão', provenance: 'MANUAL', ...overrides });
}

test('PRACTICE source: an INITIAL_PRACTICE evidence row with linked attempts returns real question/answer/outcome', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id, { question: 'O que é hipertensão?', answer: 'PA elevada' });
    const attempt = attempts.start(db, userId, { exerciseId: exercise.id });
    attempts.submit(db, userId, attempt.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    const ev = evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [attempt.id] });

    const result = getAttemptDetails(db, userId, ev.id);
    assert.equal(result.source, 'PRACTICE');
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].question, 'O que é hipertensão?');
    assert.equal(result.attempts[0].answer, 'PA elevada');
    assert.equal(result.attempts[0].outcome, 'CORRECT');
  } finally { cleanup(); }
});

test('REVIEW source: reconciles via review_task_id, no evidence_id link needed', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnit(db, userId);
    const reviewTask = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY id LIMIT 1').get(userId, unit.id);
    const exercise = makeExercise(db, userId, unit.id, { question: 'Qual a dose de X?', answer: '10mg' });
    const attempt = attempts.start(db, userId, { exerciseId: exercise.id, reviewTaskId: reviewTask.id });
    attempts.submit(db, userId, attempt.id, { outcome: 'INCORRECT', assessmentMethod: 'SELF_REPORT' });
    const completion = reviews.complete(db, userId, reviewTask.id, { questionsCount: 1, correctCount: 0 });

    const result = getAttemptDetails(db, userId, completion.evidenceId);
    assert.equal(result.source, 'REVIEW');
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].question, 'Qual a dose de X?');
    assert.equal(result.attempts[0].outcome, 'INCORRECT');
  } finally { cleanup(); }
});

test('NONE source: EXTERNAL evidence never has attempts to return', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = makeUnit(db, userId);
    const ev = evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 5, correctCount: 3, evidenceDate: '2026-01-02' });

    const result = getAttemptDetails(db, userId, ev.id);
    assert.equal(result.source, 'NONE');
    assert.deepEqual(result.attempts, []);
  } finally { cleanup(); }
});

test('NONE source: INITIAL_PRACTICE evidence created with no attemptIds (old data, or a caller that never linked) never guesses attempts', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unit = makeUnit(db, userId);
    // A real attempt exists on this same unit, around the same time, but was
    // never handed to evidence.create — must NOT be picked up by proximity.
    const exercise = makeExercise(db, userId, unit.id);
    const attempt = attempts.start(db, userId, { exerciseId: exercise.id });
    attempts.submit(db, userId, attempt.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });

    const ev = evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02' });

    const result = getAttemptDetails(db, userId, ev.id);
    assert.equal(result.source, 'NONE');
    assert.deepEqual(result.attempts, []);
  } finally { cleanup(); }
});

test('a STARTED (never submitted) attempt linked to evidence shows outcome null, never guessed as correct or incorrect', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const unit = makeUnit(db, userId);
    const exercise = makeExercise(db, userId, unit.id);
    const attempt = attempts.start(db, userId, { exerciseId: exercise.id });
    // Never submitted — evidence.create only accepts SUBMITTED attemptIds,
    // so simulate the one path that CAN still produce a linked-but-open
    // attempt: link it directly (a real caller cannot do this; this proves
    // the read side degrades honestly if it ever happened).
    db.prepare('UPDATE exercise_attempts SET evidence_id = ? WHERE id = ?').run(999, attempt.id);
    db.prepare(`
      INSERT INTO learning_evidence (id, user_id, unit_id, type, questions_count, correct_count, evidence_date, created_at)
      VALUES (999, ?, ?, 'INITIAL_PRACTICE', 1, 0, '2026-01-02', '2026-01-02T00:00:00.000Z')
    `).run(userId, unit.id);

    const result = getAttemptDetails(db, userId, 999);
    assert.equal(result.attempts[0].outcome, null);
  } finally { cleanup(); }
});

test('getAttemptDetails is owner-scoped: a user cannot read another user\'s evidence detail', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const otherUserId = makeUser(db, 'g@example.com');
    const unit = makeUnit(db, otherUserId);
    const ev = evidence.create(db, otherUserId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02' });

    assert.throws(() => getAttemptDetails(db, userId, ev.id), (err) => err instanceof ExerciseReviewError && err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});
