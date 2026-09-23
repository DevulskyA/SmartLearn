import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as exams from '../src/services/exams.js';
import * as exercises from '../src/services/exercises.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as attempts from '../src/services/attempts.js';
import * as evidence from '../src/services/evidence.js';

// EXAM-3: a finished exam is not a dead end — the corrected result enters the SAME longitudinal ledger the
// rest of the product reads: exactly one aggregate evidence row + one submitted attempt per item.
// review_tasks != learning_evidence: an exam creates no review, no schedule, no mastery.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exams-final-'));
  const db = openDb(join(dir, 'test.db'));
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

function judgedExam(db, userId, outcomes) {
  const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' });
  outcomes.forEach((_, i) => exercises.create(db, userId, { unitId: unit.id, question: `Q${i + 1}?`, answer: `A${i + 1}`, provenance: 'MANUAL' }));
  const started = exams.start(db, userId, { unitId: unit.id }).exam;
  const submitted = exams.submit(db, userId, started.id);
  outcomes.forEach((outcome, i) => { if (outcome) exams.judge(db, userId, submitted.id, submitted.items[i].id, { outcome }); });
  return { unit, exam: exams.get(db, userId, submitted.id) };
}

const count = (db, sql, ...args) => db.prepare(sql).get(...args).n;

test('finalizing writes exactly ONE aggregate evidence row with the right counts and one linked attempt per item', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { unit, exam } = judgedExam(db, userId, ['CORRECT', 'INCORRECT', 'CORRECT']);
    const done = exams.finalize(db, userId, exam.id, { evidenceDate: '2026-04-02' });
    assert.equal(done.status, 'CORRECTED');
    assert.ok(done.evidenceId);
    assert.deepEqual(done.score, { correct: 2, total: 3, percent: (2 / 3) * 100 });

    const rows = evidence.list(db, userId, { unitId: unit.id });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, done.evidenceId);
    assert.deepEqual([rows[0].context ?? rows[0].type, rows[0].questionsCount, rows[0].correctCount, rows[0].evidenceDate], ['INITIAL_PRACTICE', 3, 2, '2026-04-02']);

    const linked = db.prepare('SELECT a.id, a.status, a.review_task_id, a.evidence_id FROM exercise_attempts a WHERE a.user_id = ? AND a.unit_id = ? ORDER BY a.id').all(userId, unit.id);
    assert.equal(linked.length, 3);
    assert.ok(linked.every((a) => a.status === 'SUBMITTED' && a.review_task_id === null && a.evidence_id === done.evidenceId));
    const outcomes = db.prepare(`
      SELECT e.outcome FROM learning_events e JOIN exercise_attempts a ON a.id = e.attempt_id AND a.user_id = e.user_id
      WHERE a.user_id = ? AND a.unit_id = ? ORDER BY a.id, e.sequence
    `).all(userId, unit.id).map((r) => r.outcome);
    assert.deepEqual(outcomes, ['CORRECT', 'INCORRECT', 'CORRECT']);
  } finally { cleanup(); }
});

test('finalize is idempotent: a second call (retry, double click) creates no second evidence and no second set of attempts', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { unit, exam } = judgedExam(db, userId, ['CORRECT', 'CORRECT']);
    const first = exams.finalize(db, userId, exam.id, { evidenceDate: '2026-04-02' });
    const second = exams.finalize(db, userId, exam.id, { evidenceDate: '2030-01-01' });
    assert.equal(second.evidenceId, first.evidenceId);
    assert.equal(second.correctedAt, first.correctedAt);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM learning_evidence WHERE user_id = ? AND unit_id = ?', userId, unit.id), 1);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM exercise_attempts WHERE user_id = ? AND unit_id = ?', userId, unit.id), 2);
  } finally { cleanup(); }
});

test('an incomplete or unsubmitted exam cannot be finalized, and a failure leaves no partial evidence or attempts', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const { unit, exam } = judgedExam(db, userId, ['CORRECT', null, 'INCORRECT']);
    assert.throws(() => exams.finalize(db, userId, exam.id), (e) => e.code === 'INCOMPLETE' && /1 questão/.test(e.message));
    assert.equal(count(db, 'SELECT COUNT(*) n FROM learning_evidence WHERE user_id = ?', userId), 0);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM exercise_attempts WHERE user_id = ?', userId), 0);
    assert.equal(exams.get(db, userId, exam.id).status, 'SUBMITTED');

    const other = learningUnits.create(db, userId, { newSubjectName: 'Outra', title: 'Aula 2', summaryBody: 'r', studyDate: '2026-03-01' }).unit;
    exercises.create(db, userId, { unitId: other.id, question: 'Q?', answer: 'A', provenance: 'MANUAL' });
    const inProgress = exams.start(db, userId, { unitId: other.id }).exam;
    assert.throws(() => exams.finalize(db, userId, inProgress.id), (e) => e.code === 'INVALID_STATE');
    assert.ok(unit.id);
  } finally { cleanup(); }
});

test('the exam feeds the existing "para reforçar" signal (last attempt wrong) and a later redo does NOT add evidence', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const { unit, exam } = judgedExam(db, userId, ['CORRECT', 'INCORRECT']);
    exams.finalize(db, userId, exam.id, { evidenceDate: '2026-04-02' });
    const wrongExercise = exam.items[1].exerciseId;
    assert.deepEqual(attempts.reinforcementByUnit(db, userId)[unit.id], [wrongExercise]);

    // an immediate redo (no reviewTaskId) marked correct clears the signal but writes NO evidence
    const redo = attempts.start(db, userId, { exerciseId: wrongExercise });
    attempts.submit(db, userId, redo.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    assert.deepEqual(attempts.reinforcementByUnit(db, userId)[unit.id] ?? [], []);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM learning_evidence WHERE user_id = ? AND unit_id = ?', userId, unit.id), 1);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM review_tasks WHERE user_id = ? AND unit_id = ? AND id IN (SELECT review_task_id FROM exercise_attempts WHERE review_task_id IS NOT NULL)', userId, unit.id), 0);
  } finally { cleanup(); }
});

test('after CORRECTED the answers and judgements are final, and a new exam can be started for the unit', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const { unit, exam } = judgedExam(db, userId, ['CORRECT', 'INCORRECT']);
    exams.finalize(db, userId, exam.id, { evidenceDate: '2026-04-02' });
    assert.throws(() => exams.judge(db, userId, exam.id, exam.items[0].id, { outcome: 'INCORRECT' }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => exams.saveAnswer(db, userId, exam.id, exam.items[0].id, { answer: 'x' }), (e) => e.code === 'INVALID_STATE');
    const next = exams.start(db, userId, { unitId: unit.id });
    assert.equal(next.resumed, false);
    assert.notEqual(next.exam.id, exam.id);
    assert.equal(next.exam.status, 'IN_PROGRESS');
  } finally { cleanup(); }
});
