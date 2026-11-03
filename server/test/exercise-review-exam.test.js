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
import { getAttemptDetails } from '../src/services/exercise-review.js';

// ATTEMPT-1: reviewing an exam's evidence shows what the STUDENT wrote (exam_items.student_answer), next to the
// gabarito. Study evidence has no such field (nothing invented), and another exam of the same question never leaks.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-review-exam-'));
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

/** Runs one whole exam over the unit and returns its (single) evidence row. */
function runExam(db, userId, unitId, answersByQuestion, outcome = 'CORRECT') {
  const started = exams.start(db, userId, { unitId }).exam;
  for (const item of started.items) exams.saveAnswer(db, userId, started.id, item.id, { answer: answersByQuestion[item.question] ?? '' });
  const submitted = exams.submit(db, userId, started.id);
  for (const item of submitted.items) exams.judge(db, userId, submitted.id, item.id, { outcome });
  const done = exams.finalize(db, userId, submitted.id, { evidenceDate: '2026-04-02' });
  return done.evidenceIds[0];
}

test('exam evidence returns the student\'s own answer per attempt; an unanswered item is null; source stays PRACTICE', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' });
    exercises.create(db, userId, { unitId: unit.id, question: 'Q1?', answer: 'Gabarito 1', provenance: 'MANUAL' });
    exercises.create(db, userId, { unitId: unit.id, question: 'Q2?', answer: 'Gabarito 2', provenance: 'MANUAL' });
    const evidenceId = runExam(db, userId, unit.id, { 'Q1?': 'minha resposta 1' });
    const details = getAttemptDetails(db, userId, evidenceId);
    assert.equal(details.source, 'PRACTICE');
    assert.equal(details.origin, 'EXAM');
    assert.deepEqual(details.attempts.map((a) => [a.question, a.answer, a.studentAnswer]), [['Q1?', 'Gabarito 1', 'minha resposta 1'], ['Q2?', 'Gabarito 2', null]]);
  } finally { cleanup(); }
});

test('two exams of the same question: each evidence shows ITS OWN answer; study evidence carries no studentAnswer field', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' });
    const ex = exercises.create(db, userId, { unitId: unit.id, question: 'Q1?', answer: 'Gabarito 1', provenance: 'MANUAL' });
    const first = runExam(db, userId, unit.id, { 'Q1?': 'primeira tentativa' }, 'INCORRECT');
    const second = runExam(db, userId, unit.id, { 'Q1?': 'segunda tentativa' });
    assert.notEqual(first, second);
    assert.equal(getAttemptDetails(db, userId, first).attempts[0].studentAnswer, 'primeira tentativa');
    assert.equal(getAttemptDetails(db, userId, second).attempts[0].studentAnswer, 'segunda tentativa');

    // a study pass ("Estudar agora" shape) has no typed answer to show
    const attempt = attempts.start(db, userId, { exerciseId: ex.exercise?.id ?? ex.id });
    attempts.submit(db, userId, attempt.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    const study = evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-04-03', attemptIds: [attempt.id] });
    const studyDetails = getAttemptDetails(db, userId, study.id);
    assert.equal(studyDetails.source, 'PRACTICE');
    assert.equal(studyDetails.origin, undefined);
    assert.ok(!('studentAnswer' in studyDetails.attempts[0]));
  } finally { cleanup(); }
});
