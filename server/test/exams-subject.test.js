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

// EXAM-4: a discipline exam draws questions from SEVERAL units, never leaks the gabarito while in progress,
// and on finalizing writes exactly ONE evidence row PER UNIT (each unit's history counts only its own questions).

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exams-subject-'));
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

/** A discipline with `counts.length` units, unit i having counts[i] questions named U<i>Q<j>. */
function discipline(db, userId, counts, name = 'Fisiologia') {
  const units = [];
  let subjectId = null;
  counts.forEach((n, i) => {
    const { unit } = learningUnits.create(db, userId, { ...(subjectId ? { subjectId } : { newSubjectName: name }), title: `Aula ${i + 1}`, summaryBody: 'r', studyDate: '2026-03-01' });
    subjectId ??= db.prepare('SELECT subject_id FROM learning_units WHERE id = ?').get(unit.id).subject_id;
    for (let j = 1; j <= n; j += 1) exercises.create(db, userId, { unitId: unit.id, question: `U${i + 1}Q${j}?`, answer: `R${i + 1}${j}`, provenance: 'MANUAL' });
    units.push(unit);
  });
  return { subjectId, units };
}

const questionsOf = (exam) => exam.items.map((i) => i.question);

test('a discipline exam mixes the units, is deterministic, resumes, and returns NO gabarito while in progress', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { subjectId, units } = discipline(db, userId, [3, 2]);
    const { exam, resumed } = exams.startSubject(db, userId, { subjectId });
    assert.equal(resumed, false);
    assert.equal(exam.scope, 'SUBJECT');
    assert.equal(exam.title, 'Fisiologia');
    assert.deepEqual(questionsOf(exam), ['U1Q1?', 'U1Q2?', 'U1Q3?', 'U2Q1?', 'U2Q2?']); // all 5, grouped by unit
    const leaked = JSON.stringify(exam);
    for (const secret of ['R11', 'R21', 'explanation', 'hint', 'answer"', 'outcome']) assert.ok(!leaked.includes(secret), `leaked ${secret}`);
    assert.equal(exams.startSubject(db, userId, { subjectId }).resumed, true);
    assert.equal(exams.startSubject(db, userId, { subjectId }).exam.id, exam.id);
    // the classic unit exam is independent of the open discipline exam
    assert.notEqual(exams.start(db, userId, { unitId: units[0].id }).exam.id, exam.id);
  } finally { cleanup(); }
});

test('at most 20 questions; no unit swallows the exam (round-robin) and questions the student got wrong come first', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { subjectId, units } = discipline(db, userId, [15, 15]);
    // a wrong last attempt on unit 2's LAST question: it must be in the exam even though the round-robin would not reach it
    const ex = exercises.list(db, userId, units[1].id);
    const last = ex[ex.length - 1];
    const a = attempts.start(db, userId, { exerciseId: last.id });
    attempts.submit(db, userId, a.id, { outcome: 'INCORRECT', assessmentMethod: 'SELF_REPORT' });

    const { exam } = exams.startSubject(db, userId, { subjectId });
    const qs = questionsOf(exam);
    assert.equal(qs.length, 20);
    assert.ok(qs.includes('U2Q15?'), 'the weak question comes first');
    const fromU1 = qs.filter((q) => q.startsWith('U1')).length;
    const fromU2 = qs.filter((q) => q.startsWith('U2')).length;
    assert.deepEqual([fromU1, fromU2], [10, 10]); // 1 weak + 9 round-robin from U2 vs 10 from U1
  } finally { cleanup(); }
});

test('finalizing writes ONE evidence row per unit with only that unit\'s counts, links them all, and is idempotent', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { subjectId, units } = discipline(db, userId, [2, 2]);
    const started = exams.startSubject(db, userId, { subjectId }).exam;
    const submitted = exams.submit(db, userId, started.id);
    // U1: 1/2 right, U2: 2/2 right
    ['INCORRECT', 'CORRECT', 'CORRECT', 'CORRECT'].forEach((outcome, i) => exams.judge(db, userId, submitted.id, submitted.items[i].id, { outcome }));
    assert.deepEqual(submitted.items.map((i) => i.unitTitle), ['Aula 1', 'Aula 1', 'Aula 2', 'Aula 2']);
    const done = exams.finalize(db, userId, submitted.id, { evidenceDate: '2026-04-02' });
    assert.equal(done.status, 'CORRECTED');
    assert.deepEqual(done.score, { correct: 3, total: 4, percent: 75 });
    assert.equal(done.evidenceIds.length, 2);

    const rows = [units[0], units[1]].map((u) => evidence.list(db, userId, { unitId: u.id }));
    assert.deepEqual(rows.map((r) => r.length), [1, 1]);
    assert.deepEqual(rows.map((r) => [r[0].questionsCount, r[0].correctCount, r[0].type, r[0].origin]), [[2, 1, 'INITIAL_PRACTICE', 'EXAM'], [2, 2, 'INITIAL_PRACTICE', 'EXAM']]);

    // idempotent: finalizing again changes nothing
    exams.finalize(db, userId, submitted.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence WHERE user_id = ?').get(userId).n, 2);
    // and a new discipline exam can start now that the last one is corrected
    assert.equal(exams.startSubject(db, userId, { subjectId }).resumed, false);
  } finally { cleanup(); }
});

test('validation and ownership: unknown/other user discipline is NOT_FOUND, an empty discipline is NO_QUESTIONS', () => {
  const { db, cleanup } = tmpDb();
  try {
    const owner = makeUser(db, 'a@example.com');
    const other = makeUser(db, 'b@example.com');
    const { subjectId } = discipline(db, owner, [1]);
    assert.throws(() => exams.startSubject(db, other, { subjectId }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => exams.startSubject(db, owner, { subjectId: 99999 }), (e) => e.code === 'NOT_FOUND');
    const { unit } = learningUnits.create(db, owner, { newSubjectName: 'Vazia', title: 'Sem questoes', summaryBody: 'r', studyDate: '2026-03-01' });
    const emptySubject = db.prepare('SELECT subject_id FROM learning_units WHERE id = ?').get(unit.id).subject_id;
    assert.throws(() => exams.startSubject(db, owner, { subjectId: emptySubject }), (e) => e.code === 'NO_QUESTIONS');
  } finally { cleanup(); }
});
