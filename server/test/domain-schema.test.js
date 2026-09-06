import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-domain-'));
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

test('004-learning-domain creates all six domain tables plus user_settings', () => {
  const { db, cleanup } = freshDb();
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN
      ('subjects','learning_units','review_tasks','exercises','exercise_versions','learning_evidence','user_settings')
    `).all().map(r => r.name).sort();
    assert.deepEqual(tables, ['exercise_versions', 'exercises', 'learning_evidence', 'learning_units', 'review_tasks', 'subjects', 'user_settings']);
  } finally { cleanup(); }
});

test('idempotent rerun does not duplicate the migration row or fail', () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations WHERE version = 4').get();
    assert.equal(n, 1);
  } finally { cleanup(); }
});

test('existing users/sessions infrastructure survives this migration untouched', () => {
  const { db, cleanup } = freshDb();
  try {
    const userId = makeUser(db, 'preserved@example.com');
    runMigrations(db, MIGRATIONS_DIR); // rerun, must not disturb existing rows
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    assert.equal(row.email, 'preserved@example.com');
  } finally { cleanup(); }
});

test('cross-user subject reference is rejected at the database level (composite FK)', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'a@example.com');
    const userB = makeUser(db, 'b@example.com');
    const now = new Date().toISOString();
    const subjectOfA = db.prepare(`
      INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Subject A', ?, ?)
    `).run(userA, now, now).lastInsertRowid;

    assert.throws(
      () => db.prepare(`
        INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at)
        VALUES (?, ?, 'Cross-user unit attempt', ?, ?, ?)
      `).run(userB, subjectOfA, now, now, now),
      /FOREIGN KEY/,
      'a unit owned by user B must not be insertable against a subject owned by user A, even with a correct raw subject id'
    );
  } finally { cleanup(); }
});

test('cross-unit review_task reference is rejected at the database level', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'c@example.com');
    const userB = makeUser(db, 'd@example.com');
    const now = new Date().toISOString();
    const subjectA = db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'S', ?, ?)`).run(userA, now, now).lastInsertRowid;
    const unitA = db.prepare(`INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, 'U', ?, ?, ?)`).run(userA, subjectA, now, now, now).lastInsertRowid;

    assert.throws(
      () => db.prepare(`INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, created_at) VALUES (?, ?, 1, ?, ?)`)
        .run(userB, unitA, now, now),
      /FOREIGN KEY/,
    );
  } finally { cleanup(); }
});

test('positive integer count invariant: questions_count must be > 0, not zero or negative', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'e@example.com');
    const now = new Date().toISOString();
    const subjectA = db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'S', ?, ?)`).run(userA, now, now).lastInsertRowid;
    const unitA = db.prepare(`INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, 'U', ?, ?, ?)`).run(userA, subjectA, now, now, now).lastInsertRowid;

    assert.throws(
      () => db.prepare(`INSERT INTO learning_evidence (user_id, unit_id, type, questions_count, correct_count, evidence_date, created_at) VALUES (?, ?, 'EXTERNAL', 0, 0, ?, ?)`)
        .run(userA, unitA, now, now),
      /CHECK/,
    );
  } finally { cleanup(); }
});

test('context invariant: correct_count cannot exceed questions_count', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'f@example.com');
    const now = new Date().toISOString();
    const subjectA = db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'S', ?, ?)`).run(userA, now, now).lastInsertRowid;
    const unitA = db.prepare(`INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, 'U', ?, ?, ?)`).run(userA, subjectA, now, now, now).lastInsertRowid;

    assert.throws(
      () => db.prepare(`INSERT INTO learning_evidence (user_id, unit_id, type, questions_count, correct_count, evidence_date, created_at) VALUES (?, ?, 'EXTERNAL', 5, 6, ?, ?)`)
        .run(userA, unitA, now, now),
      /CHECK/,
    );
  } finally { cleanup(); }
});

test('learning_evidence with NULL review_task_id (external practice) is valid regardless of owner', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'g@example.com');
    const now = new Date().toISOString();
    const subjectA = db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'S', ?, ?)`).run(userA, now, now).lastInsertRowid;
    const unitA = db.prepare(`INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, 'U', ?, ?, ?)`).run(userA, subjectA, now, now, now).lastInsertRowid;

    assert.doesNotThrow(() =>
      db.prepare(`INSERT INTO learning_evidence (user_id, unit_id, review_task_id, type, questions_count, correct_count, evidence_date, created_at) VALUES (?, ?, NULL, 'EXTERNAL', 10, 7, ?, ?)`)
        .run(userA, unitA, now, now)
    );
  } finally { cleanup(); }
});

test('invalid evidence type is rejected', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'h@example.com');
    const now = new Date().toISOString();
    const subjectA = db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'S', ?, ?)`).run(userA, now, now).lastInsertRowid;
    const unitA = db.prepare(`INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, 'U', ?, ?, ?)`).run(userA, subjectA, now, now, now).lastInsertRowid;

    assert.throws(
      () => db.prepare(`INSERT INTO learning_evidence (user_id, unit_id, type, evidence_date, created_at) VALUES (?, ?, 'BOGUS_TYPE', ?, ?)`)
        .run(userA, unitA, now, now),
      /CHECK/,
    );
  } finally { cleanup(); }
});

test('two different users can each own a subject with the same name (per-user uniqueness, not global)', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'i@example.com');
    const userB = makeUser(db, 'j@example.com');
    const now = new Date().toISOString();
    assert.doesNotThrow(() => {
      db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Farmacologia', ?, ?)`).run(userA, now, now);
      db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Farmacologia', ?, ?)`).run(userB, now, now);
    });
  } finally { cleanup(); }
});

test('same user cannot create duplicate subject names, case-insensitively', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'k@example.com');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Farmacologia', ?, ?)`).run(userA, now, now);
    assert.throws(
      () => db.prepare(`INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'FARMACOLOGIA', ?, ?)`).run(userA, now, now),
      /UNIQUE/,
    );
  } finally { cleanup(); }
});
