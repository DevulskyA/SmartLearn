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
import * as evidence from '../src/services/evidence.js';

// EXAM-5: an evidence row that came from a corrected exam says so (origin: 'EXAM'); study and external
// evidence do not. The evidence TYPE stays INITIAL_PRACTICE, so analytics and the schema are untouched.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-origin-'));
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

test('evidence from a corrected exam carries origin EXAM; study and external evidence carry none', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' });
    exercises.create(db, userId, { unitId: unit.id, question: 'Q1?', answer: 'A1', provenance: 'MANUAL' });
    evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-04-01' });
    evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 10, correctCount: 7, evidenceDate: '2026-04-02' });
    const started = exams.start(db, userId, { unitId: unit.id }).exam;
    const submitted = exams.submit(db, userId, started.id);
    exams.judge(db, userId, submitted.id, submitted.items[0].id, { outcome: 'INCORRECT' });
    exams.finalize(db, userId, submitted.id, { evidenceDate: '2026-04-03' });

    const rows = evidence.list(db, userId, { unitId: unit.id });
    assert.deepEqual(rows.map((r) => [r.type, r.evidenceDate, r.origin ?? null]), [
      ['INITIAL_PRACTICE', '2026-04-01', null],
      ['EXTERNAL', '2026-04-02', null],
      ['INITIAL_PRACTICE', '2026-04-03', 'EXAM'],
    ]);
  } finally { cleanup(); }
});
