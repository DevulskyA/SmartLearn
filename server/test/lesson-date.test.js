import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as units from '../src/services/learning-units.js';

// lessonDate (the day the class was given) is a different fact from studyDate (the day the content was studied; the anchor of the 16 reviews).
// It is optional, never moves the review schedule, and can never be later than the study date.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-lesson-date-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const now = new Date().toISOString();
  const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('a@example.com', 'a@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
  return { db, userId, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

let n = 0;
// each call gets its own subject name: creating the same new subject twice is (correctly) refused
const base = { get newSubjectName() { return `Fisiologia ${++n}`; }, title: 'Potencial de ação', studyDate: '2026-11-10' };
const unitData = (extra = {}) => ({ newSubjectName: base.newSubjectName, title: base.title, studyDate: base.studyDate, ...extra });
const reviewDates = (db, unitId) => db.prepare('SELECT due_date FROM review_tasks WHERE unit_id = ? ORDER BY offset_days').all(unitId).map((r) => r.due_date);

test('a unit created without lessonDate has lessonDate null (existing behaviour unchanged)', () => {
  const { db, userId, cleanup } = setup();
  try {
    const { unit } = units.create(db, userId, unitData());
    assert.equal(unit.lessonDate, null);
    assert.equal(unit.studyDate, '2026-11-10');
  } finally { cleanup(); }
});

test('lessonDate is stored, returned by create/list/getById, and does not move the review schedule', () => {
  const { db, userId, cleanup } = setup();
  try {
    const withLesson = units.create(db, userId, unitData({ lessonDate: '2026-11-03', title: 'Com data da aula' })).unit;
    const without = units.create(db, userId, unitData({ title: 'Sem data da aula' })).unit;
    assert.equal(withLesson.lessonDate, '2026-11-03');
    assert.equal(units.getById(db, userId, withLesson.id).lessonDate, '2026-11-03');
    assert.equal(units.list(db, userId).find((u) => u.id === withLesson.id).lessonDate, '2026-11-03');
    assert.deepEqual(reviewDates(db, withLesson.id), reviewDates(db, without.id), 'reviews hang from studyDate only');
  } finally { cleanup(); }
});

test('lessonDate equal to the study date is valid; empty string and null mean "unknown"', () => {
  const { db, userId, cleanup } = setup();
  try {
    assert.equal(units.create(db, userId, unitData({ lessonDate: '2026-11-10', title: 'Mesmo dia' })).unit.lessonDate, '2026-11-10');
    assert.equal(units.create(db, userId, unitData({ lessonDate: '', title: 'Vazia' })).unit.lessonDate, null);
    assert.equal(units.create(db, userId, unitData({ lessonDate: null, title: 'Nula' })).unit.lessonDate, null);
  } finally { cleanup(); }
});

test('an invalid or later-than-study lessonDate is refused with field lessonDate and nothing is written', () => {
  const { db, userId, cleanup } = setup();
  try {
    for (const lessonDate of ['10/11/2026', '2026-02-30', '2026-11-11', 'ontem']) {
      assert.throws(() => units.create(db, userId, unitData({ lessonDate })), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'lessonDate', lessonDate);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_units').get().n, 0);
  } finally { cleanup(); }
});

test('updateFields sets, keeps and clears lessonDate; it refuses a date after the study date; studyDate stays untouched', () => {
  const { db, userId, cleanup } = setup();
  try {
    const { unit } = units.create(db, userId, unitData());
    assert.equal(units.updateFields(db, userId, unit.id, { lessonDate: '2026-11-05' }).lessonDate, '2026-11-05');
    assert.equal(units.updateFields(db, userId, unit.id, { title: 'Novo título' }).lessonDate, '2026-11-05', 'omitted = kept');
    assert.throws(() => units.updateFields(db, userId, unit.id, { lessonDate: '2026-12-01' }), (err) => err.field === 'lessonDate');
    const cleared = units.updateFields(db, userId, unit.id, { lessonDate: null });
    assert.equal(cleared.lessonDate, null);
    assert.equal(cleared.studyDate, '2026-11-10');
  } finally { cleanup(); }
});

test('the database itself refuses a malformed lesson_date', () => {
  const { db, userId, cleanup } = setup();
  try {
    const { unit } = units.create(db, userId, unitData());
    assert.throws(() => db.prepare('UPDATE learning_units SET lesson_date = ? WHERE id = ?').run('amanhã', unit.id), /CHECK|constraint/i);
  } finally { cleanup(); }
});
