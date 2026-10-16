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

// EXAM-2: after submitting, the student judges each item with the gabarito in front of them; the score
// exists ONLY when every item is judged, and is derived (correct/total), never stored or guessed.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exams-judge-'));
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

function submittedExam(db, userId, count = 3) {
  const { unit } = learningUnits.create(db, userId, { newSubjectName: `D ${Math.random()}`, title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' });
  for (let i = 1; i <= count; i += 1) exercises.create(db, userId, { unitId: unit.id, question: `Q${i}?`, answer: `A${i}`, explanation: `E${i}`, provenance: 'MANUAL' });
  const { exam } = exams.start(db, userId, { unitId: unit.id });
  return exams.submit(db, userId, exam.id);
}

test('judging is only possible AFTER submitting; the score appears only when every item is judged and is derived from the judgements', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' });
    for (let i = 1; i <= 3; i += 1) exercises.create(db, userId, { unitId: unit.id, question: `Q${i}?`, answer: `A${i}`, provenance: 'MANUAL' });
    const inProgress = exams.start(db, userId, { unitId: unit.id }).exam;
    assert.throws(() => exams.judge(db, userId, inProgress.id, inProgress.items[0].id, { outcome: 'CORRECT' }), (e) => e.code === 'INVALID_STATE');

    const submitted = exams.submit(db, userId, inProgress.id);
    assert.equal(submitted.score, null);
    assert.ok(submitted.items.every((i) => i.outcome === null), 'nothing is pre-judged');

    let exam = exams.judge(db, userId, submitted.id, submitted.items[0].id, { outcome: 'CORRECT' });
    exam = exams.judge(db, userId, submitted.id, submitted.items[1].id, { outcome: 'INCORRECT' });
    assert.equal(exam.score, null, 'two of three judged: no score yet — never a partial score dressed as a result');
    exam = exams.judge(db, userId, submitted.id, submitted.items[2].id, { outcome: 'CORRECT' });
    assert.deepEqual(exam.score, { correct: 2, total: 3, percent: (2 / 3) * 100 });
    assert.deepEqual(exam.items.map((i) => i.outcome), ['CORRECT', 'INCORRECT', 'CORRECT']);

    // the student may change their mind before the correction is finished
    exam = exams.judge(db, userId, submitted.id, submitted.items[1].id, { outcome: 'CORRECT' });
    assert.equal(exam.score.correct, 3);
    // the judgement never touches the typed answer or the exam status
    assert.equal(exam.status, 'SUBMITTED');
  } finally { cleanup(); }
});

test('bad outcomes, foreign items and other users are rejected; an item of another exam cannot be judged through this one', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const otherId = makeUser(db, 'b2@example.com');
    const exam = submittedExam(db, userId, 2);
    assert.throws(() => exams.judge(db, userId, exam.id, exam.items[0].id, { outcome: 'MAYBE' }), (e) => e.code === 'VALIDATION_FAILED');
    assert.throws(() => exams.judge(db, userId, exam.id, exam.items[0].id, {}), (e) => e.code === 'VALIDATION_FAILED');
    assert.throws(() => exams.judge(db, otherId, exam.id, exam.items[0].id, { outcome: 'CORRECT' }), (e) => e.code === 'NOT_FOUND');
    const other = submittedExam(db, userId, 1);
    assert.throws(() => exams.judge(db, userId, exam.id, other.items[0].id, { outcome: 'CORRECT' }), (e) => e.code === 'NOT_FOUND');
  } finally { cleanup(); }
});
