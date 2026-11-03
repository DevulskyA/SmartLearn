import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as attempts from '../src/services/attempts.js';
import * as evidence from '../src/services/evidence.js';
import * as exercises from '../src/services/exercises.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as reviews from '../src/services/reviews.js';
import * as subjects from '../src/services/subjects.js';

// TG-09 (v1-closure-telemetry): learning_events and learning_evidence are append-only LEDGERS (heritage H-06:
// history is distinct from schedule; a correction must never erase observed fact). Until now that was a convention
// only. This file pins it three ways:
//   1. STATIC  - no SQL in server/src or server/migrations updates, deletes, replaces, drops or renames either table.
//   2. BEHAVIOR - the flows that touch a ledger's neighbours (reopen, recomplete, archive, delete subject) leave
//                 every existing ledger row byte-for-byte unchanged.
//   3. SCHEMA  - no foreign key cascades into the ledgers, so deleting a parent cannot silently delete history.
// ALLOWLIST: empty on purpose. Proven legitimate exceptions found while writing this test: NONE. (Restore and
// import only INSERT; exercise_attempts IS mutable by design - state machine, max_assistance, evidence_id link -
// but it is a different table and is not covered by this guard.) Adding an exception needs a human gate.
const LEDGERS = ['learning_events', 'learning_evidence'];
const ALLOWLIST = [];

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function walk(dir, extensions) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

function stripComments(text, sql) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return sql ? noBlock.replace(/--[^\n]*/g, ' ') : noBlock.replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/**
 * Returns the offending statements found in `text`. A statement offends when it mutates a ledger table by name, or
 * when it is a dynamic UPDATE/DELETE whose table name is interpolated (so it could be a ledger and cannot be
 * checked by name).
 */
export function findLedgerMutations(text, { sql = false } = {}) {
  const body = stripComments(text, sql);
  const names = LEDGERS.join('|');
  const patterns = [
    new RegExp(`\\bUPDATE\\s+(?:OR\\s+\\w+\\s+)?["\`]?(?:${names})\\b`, 'gi'),
    new RegExp(`\\bDELETE\\s+FROM\\s+["\`]?(?:${names})\\b`, 'gi'),
    new RegExp(`\\bREPLACE\\s+INTO\\s+["\`]?(?:${names})\\b`, 'gi'),
    new RegExp(`\\bINSERT\\s+OR\\s+REPLACE\\s+INTO\\s+["\`]?(?:${names})\\b`, 'gi'),
    new RegExp(`\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?["\`]?(?:${names})\\b`, 'gi'),
    new RegExp(`\\bTRUNCATE\\s+(?:TABLE\\s+)?["\`]?(?:${names})\\b`, 'gi'),
    new RegExp(`\\bALTER\\s+TABLE\\s+["\`]?(?:${names})["\`]?\\s+(?:RENAME|DROP)\\b`, 'gi'),
    new RegExp(`\\bDO\\s+UPDATE\\b[^;]*?\\b(?:${names})\\b`, 'gi'),
    // INSERT ... ON CONFLICT DO UPDATE into a ledger rewrites an existing row.
    new RegExp(`\\bINSERT\\s+INTO\\s+["\`]?(?:${names})\\b[^;]*?\\bON\\s+CONFLICT\\b[^;]*?\\bDO\\s+UPDATE\\b`, 'gi'),
    // The table name is a variable: it could be a ledger, so it is not allowed in a mutation at all.
    /\b(?:UPDATE|DELETE\s+FROM)\s+\$\{/gi,
  ];
  const hits = [];
  for (const re of patterns) for (const m of body.matchAll(re)) hits.push(m[0].replace(/\s+/g, ' ').trim());
  return hits;
}

test('static: the scanner really detects each kind of ledger mutation (it is not vacuous)', () => {
  const bad = [
    "db.prepare('UPDATE learning_events SET outcome = ? WHERE id = ?')",
    'db.prepare(`DELETE FROM learning_evidence WHERE id = ?`)',
    "db.exec('delete  from  learning_events')",
    "INSERT OR REPLACE INTO learning_evidence (id) VALUES (1)",
    "REPLACE INTO learning_events (id) VALUES (1)",
    'DROP TABLE learning_events',
    'ALTER TABLE learning_evidence RENAME TO old',
    'INSERT INTO learning_evidence (id) VALUES (1) ON CONFLICT(id) DO UPDATE SET correct_count = 0',
    'db.prepare(`UPDATE ${table} SET x = 1`)',
    'db.prepare(`DELETE FROM ${table}`)',
    'UPDATE OR IGNORE learning_events SET kind = 1',
  ];
  for (const text of bad) assert.ok(findLedgerMutations(text).length > 0, `must flag: ${text}`);

  const fine = [
    "INSERT INTO learning_evidence (user_id) VALUES (?)",
    "SELECT * FROM learning_events WHERE id = ?",
    "UPDATE exercise_attempts SET evidence_id = ? WHERE id = ?",
    'ALTER TABLE learning_events ADD COLUMN confidence REAL',
    "// UPDATE learning_events is forbidden",
    "/* DELETE FROM learning_evidence */",
    "DELETE FROM sessions WHERE id = ?",
  ];
  for (const text of fine) assert.deepEqual(findLedgerMutations(text), [], `must not flag: ${text}`);
  assert.deepEqual(findLedgerMutations('-- DELETE FROM learning_events', { sql: true }), []);
});

test('static: nothing in server/src or server/migrations updates, deletes, replaces, drops or renames learning_events / learning_evidence', () => {
  const files = [
    ...walk(SRC_DIR, ['.js']).map((f) => ({ f, sql: false })),
    ...walk(MIGRATIONS_DIR, ['.sql']).map((f) => ({ f, sql: true })),
  ];
  assert.ok(files.length > 50, 'the scan must actually cover the server tree');
  const offenders = [];
  for (const { f, sql } of files) {
    const hits = findLedgerMutations(readFileSync(f, 'utf8'), { sql });
    for (const hit of hits) {
      const rel = relative(join(SRC_DIR, '..'), f).replaceAll('\\', '/');
      if (!ALLOWLIST.some((a) => a.file === rel && hit.includes(a.fragment))) offenders.push(`${rel}: ${hit}`);
    }
  }
  assert.deepEqual(offenders, [], 'ledger tables are append-only; see the header of this test before adding an exception');
});

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-ledger-'));
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

const snapshot = (db) => ({
  events: db.prepare('SELECT * FROM learning_events ORDER BY id').all(),
  evidence: db.prepare('SELECT * FROM learning_evidence ORDER BY id').all(),
});

test('behavior: reopen, recomplete, archive, edit and empty-subject delete never change an existing ledger row', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'ledger@example.com');
    const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', studyDate: '2020-01-01' });
    const exercise = exercises.create(db, userId, { unitId: unit.id, question: 'Q?', answer: 'A', provenance: 'MANUAL' });
    const attempt = attempts.start(db, userId, { exerciseId: exercise.id });
    attempts.submit(db, userId, attempt.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    evidence.create(db, userId, { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-02', attemptIds: [attempt.id] });
    const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? ORDER BY offset_days LIMIT 1').get(userId);
    reviews.complete(db, userId, task.id, { questionsCount: 4, correctCount: 3 });

    const before = snapshot(db);
    assert.ok(before.events.length >= 1 && before.evidence.length >= 2, 'the fixture must have ledger rows to protect');

    reviews.reopen(db, userId, task.id);
    reviews.complete(db, userId, task.id, { questionsCount: 4, correctCount: 4 });
    exercises.edit(db, userId, exercise.id, { question: 'Q2?', answer: 'A2' });
    exercises.archive(db, userId, exercise.id);
    exercises.reactivate(db, userId, exercise.id);
    const emptySubject = subjects.create(db, userId, { name: 'Vazia' });
    subjects.deleteEmpty(db, userId, emptySubject.id);

    const after = snapshot(db);
    assert.deepEqual(after.events, before.events, 'every learning_events row is unchanged');
    assert.deepEqual(after.evidence.slice(0, before.evidence.length), before.evidence, 'every pre-existing learning_evidence row is unchanged');
    assert.equal(after.evidence.length, before.evidence.length + 1, 'recompleting only APPENDED one row');
  } finally { cleanup(); }
});

test('schema: no foreign key cascades into the ledgers, so deleting a parent cannot silently delete history', () => {
  const { db, cleanup } = tmpDb();
  try {
    for (const table of LEDGERS) {
      const fks = db.pragma(`foreign_key_list(${table})`);
      assert.ok(fks.length > 0);
      assert.deepEqual(fks.filter((fk) => fk.on_delete !== 'NO ACTION' && fk.on_delete !== 'RESTRICT'), [], `${table} has no cascading FK`);
    }
    // And the database really refuses: a unit that has evidence cannot be removed from under it.
    const userId = makeUser(db, 'fk@example.com');
    const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Disciplina FK', title: 'Aula FK', studyDate: '2020-01-01' });
    evidence.create(db, userId, { unitId: unit.id, type: 'EXTERNAL', questionsCount: 2, correctCount: 1, evidenceDate: '2026-01-02' });
    assert.throws(() => db.prepare('DELETE FROM learning_units WHERE id = ?').run(unit.id), /FOREIGN KEY/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n, 1);
  } finally { cleanup(); }
});
