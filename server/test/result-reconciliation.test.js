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
import * as reviews from '../src/services/reviews.js';
import * as evidence from '../src/services/evidence.js';
import * as reviewResults from '../src/services/review-results.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-reconcile-'));
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

function makeUnitWithReviewTask(db, userId, studyDate = '2026-01-01') {
  const unit = learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate }).unit;
  const reviewTaskId = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND unit_id = ? ORDER BY id LIMIT 1').get(userId, unit.id).id;
  return { unit, reviewTaskId };
}

function makeExercise(db, userId, unitId) {
  return exercises.create(db, userId, { unitId, question: 'Q', answer: 'A', hint: 'H', provenance: 'MANUAL' });
}

function submittedAttempt(db, userId, { unitId, exerciseId, reviewTaskId, outcome }) {
  const started = attempts.start(db, userId, { exerciseId, reviewTaskId });
  return attempts.submit(db, userId, started.id, { outcome, assessmentMethod: 'SELF_REPORT' });
}

test('items-only: no aggregate saved yet, reconcile derives totals purely from item events (ITEMS_ONLY)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { unit, reviewTaskId } = makeUnitWithReviewTask(db, userId);
    const ex1 = makeExercise(db, userId, unit.id);
    const ex2 = makeExercise(db, userId, unit.id);
    submittedAttempt(db, userId, { unitId: unit.id, exerciseId: ex1.id, reviewTaskId, outcome: 'CORRECT' });
    submittedAttempt(db, userId, { unitId: unit.id, exerciseId: ex2.id, reviewTaskId, outcome: 'INCORRECT' });

    const result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.source, 'ITEMS_ONLY');
    assert.equal(result.reconciledTotalCount, 2);
    assert.equal(result.reconciledCorrectCount, 1);
    assert.equal(result.aggregate, null);
    assert.equal(result.itemEvents.length, 2);
  } finally { cleanup(); }
});

test('aggregate-only: a review-only completion with no item practice reports the manual q/c, no fabricated items', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { reviewTaskId } = makeUnitWithReviewTask(db, userId);
    reviews.complete(db, userId, reviewTaskId, { questionsCount: 5, correctCount: 3 });

    const result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.source, 'AGGREGATE_ONLY');
    assert.equal(result.reconciledTotalCount, 5);
    assert.equal(result.reconciledCorrectCount, 3);
    assert.equal(result.itemEvents.length, 0);
  } finally { cleanup(); }
});

test('the same practice produces correct totals exactly once: item events + a matching aggregate never get summed (no double count)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const { unit, reviewTaskId } = makeUnitWithReviewTask(db, userId);
    const ex1 = makeExercise(db, userId, unit.id);
    const ex2 = makeExercise(db, userId, unit.id);
    // Same two Acertei/Errei clicks the UI both tallies into the aggregate
    // save AND (since T30) records as item-level attempts.
    submittedAttempt(db, userId, { unitId: unit.id, exerciseId: ex1.id, reviewTaskId, outcome: 'CORRECT' });
    submittedAttempt(db, userId, { unitId: unit.id, exerciseId: ex2.id, reviewTaskId, outcome: 'CORRECT' });
    reviews.complete(db, userId, reviewTaskId, { questionsCount: 2, correctCount: 2 });

    const result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.source, 'ITEMS_OVER_AGGREGATE');
    assert.equal(result.reconciledTotalCount, 2, 'must read 2, never 4 (2 items + 2 aggregate summed)');
    assert.equal(result.reconciledCorrectCount, 2);
    assert.ok(result.aggregate, 'the aggregate must still be surfaced for cross-reference');
    assert.equal(result.aggregate.questionsCount, 2);
  } finally { cleanup(); }
});

test('assistance stays available to evidence views: itemEvents carries assistanceUsed per attempt', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const { unit, reviewTaskId } = makeUnitWithReviewTask(db, userId);
    const ex1 = makeExercise(db, userId, unit.id);
    const started = attempts.start(db, userId, { exerciseId: ex1.id, reviewTaskId });
    attempts.revealSolution(db, userId, started.id);
    attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });

    const result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.itemEvents[0].assistanceUsed, 'SOLUTION');
  } finally { cleanup(); }
});

test('review-only completion with zero practice reports NONE, never a fabricated score (MX07)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const { reviewTaskId } = makeUnitWithReviewTask(db, userId);
    reviews.complete(db, userId, reviewTaskId, {});

    const result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.source, 'NONE');
    assert.equal(result.reconciledTotalCount, null);
    assert.equal(result.reconciledCorrectCount, null);
  } finally { cleanup(); }
});

test('imported/manual EXTERNAL evidence never becomes a reconciled review result (manual external q/c stays aggregate-only)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const { unit, reviewTaskId } = makeUnitWithReviewTask(db, userId);
    evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 10, correctCount: 9, evidenceDate: '2026-01-05' });

    const result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.source, 'NONE', 'EXTERNAL evidence has no review_task_id and must never leak into this review\'s reconciliation');
    assert.equal(result.aggregate, null);

    const { n } = db.prepare('SELECT COUNT(*) as n FROM exercise_attempts WHERE user_id = ?').get(userId);
    assert.equal(n, 0, 'creating manual EXTERNAL evidence must never create an item-level attempt');
  } finally { cleanup(); }
});

test('correction/retry path: correctItemEvent appends an audited correction that reconcile picks up, without touching the original event', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    const { unit, reviewTaskId } = makeUnitWithReviewTask(db, userId);
    const ex1 = makeExercise(db, userId, unit.id);
    const submitted = submittedAttempt(db, userId, { unitId: unit.id, exerciseId: ex1.id, reviewTaskId, outcome: 'INCORRECT' });

    let result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.reconciledCorrectCount, 0);

    const correction = reviewResults.correctItemEvent(db, userId, submitted.eventId, { outcome: 'CORRECT' });
    assert.equal(correction.correctsEventId, submitted.eventId);

    result = reviewResults.reconcile(db, userId, reviewTaskId);
    assert.equal(result.reconciledTotalCount, 1, 'a correction revises the SAME attempt\'s fact, not a second observation');
    assert.equal(result.reconciledCorrectCount, 1);
    assert.equal(result.itemEvents[0].eventId, correction.eventId);

    const originalEvent = db.prepare('SELECT outcome FROM learning_events WHERE id = ?').get(submitted.eventId);
    assert.equal(originalEvent.outcome, 'INCORRECT', 'the original event must remain byte-identical after a correction');
  } finally { cleanup(); }
});

test('a user cannot reconcile another user\'s review task, or correct another user\'s event', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'h@example.com');
    const userB = makeUser(db, 'i@example.com');
    const { unit, reviewTaskId } = makeUnitWithReviewTask(db, userA);
    const ex1 = makeExercise(db, userA, unit.id);
    const submitted = submittedAttempt(db, userA, { unitId: unit.id, exerciseId: ex1.id, reviewTaskId, outcome: 'CORRECT' });

    assert.throws(() => reviewResults.reconcile(db, userB, reviewTaskId), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => reviewResults.correctItemEvent(db, userB, submitted.eventId, { outcome: 'INCORRECT' }), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});
