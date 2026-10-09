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
import { normalizeLearningEvent, LearningEventError } from '../src/domain/learning-event.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-learning-events-'));
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

function makeExerciseVersion(db, userId, unitId) {
  return exercises.create(db, userId, { unitId, question: 'Q', provenance: 'MANUAL' }).currentVersion.id;
}

function insertAttempt(db, userId, { unitId, exerciseVersionId, competencyId = null }) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO exercise_attempts (user_id, unit_id, competency_id, exercise_version_id, started_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, unitId, competencyId, exerciseVersionId, now).lastInsertRowid;
}

function baseEventRow({ userId, unitId, attemptId, exerciseVersionId, sequence = 1 }) {
  const now = new Date().toISOString();
  return {
    user_id: userId, unit_id: unitId, competency_id: null, attempt_id: attemptId,
    exercise_version_id: exerciseVersionId, corrects_event_id: null, kind: 'ATTEMPT',
    sequence, outcome: 'CORRECT', assistance_available: 'UNKNOWN', assistance_used: 'UNKNOWN',
    assessment_method: 'AUTOMATIC', provenance: 'APP', occurred_at: now, recorded_at: now,
  };
}

function insertEvent(db, row) {
  return db.prepare(`
    INSERT INTO learning_events (
      user_id, unit_id, competency_id, attempt_id, exercise_version_id, corrects_event_id,
      kind, sequence, outcome, assistance_available, assistance_used, assessment_method,
      provenance, occurred_at, recorded_at
    ) VALUES (
      @user_id, @unit_id, @competency_id, @attempt_id, @exercise_version_id, @corrects_event_id,
      @kind, @sequence, @outcome, @assistance_available, @assistance_used, @assessment_method,
      @provenance, @occurred_at, @recorded_at
    )
  `).run(row).lastInsertRowid;
}

test('009-learning-events creates competencies, exercise_attempts and learning_events', () => {
  const { db, cleanup } = freshDb();
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('competencies','exercise_attempts','learning_events')
    `).all().map(r => r.name).sort();
    assert.deepEqual(tables, ['competencies', 'exercise_attempts', 'learning_events']);
  } finally { cleanup(); }
});

test('idempotent rerun does not duplicate the migration row or fail', () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations WHERE version = 9').get();
    assert.equal(n, 1);
  } finally { cleanup(); }
});

test('exercise_attempts.max_assistance defaults to NONE (an app-observed fact), never UNKNOWN', () => {
  const { db, cleanup } = freshDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = makeUnit(db, userId);
    const versionId = makeExerciseVersion(db, userId, unit.id);
    const attemptId = insertAttempt(db, userId, { unitId: unit.id, exerciseVersionId: versionId });
    const row = db.prepare('SELECT max_assistance, status FROM exercise_attempts WHERE id = ?').get(attemptId);
    assert.equal(row.max_assistance, 'NONE');
    assert.equal(row.status, 'STARTED');
  } finally { cleanup(); }
});

test('learning_events.assistance_used and assistance_available default to UNKNOWN, never NONE (MX10)', () => {
  const { db, cleanup } = freshDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnit(db, userId);
    const versionId = makeExerciseVersion(db, userId, unit.id);
    const attemptId = insertAttempt(db, userId, { unitId: unit.id, exerciseVersionId: versionId });
    const now = new Date().toISOString();
    const id = db.prepare(`
      INSERT INTO learning_events (user_id, unit_id, attempt_id, exercise_version_id, kind, sequence, outcome, assessment_method, occurred_at, recorded_at)
      VALUES (?, ?, ?, ?, 'ATTEMPT', 1, 'UNKNOWN', 'AUTOMATIC', ?, ?)
    `).run(userId, unit.id, attemptId, versionId, now, now).lastInsertRowid;
    const row = db.prepare('SELECT assistance_available, assistance_used FROM learning_events WHERE id = ?').get(id);
    assert.equal(row.assistance_available, 'UNKNOWN');
    assert.equal(row.assistance_used, 'UNKNOWN');
  } finally { cleanup(); }
});

test('duplicate (attempt_id, sequence) is rejected at the database level (MX11: no double-counting a replayed event)', () => {
  const { db, cleanup } = freshDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = makeUnit(db, userId);
    const versionId = makeExerciseVersion(db, userId, unit.id);
    const attemptId = insertAttempt(db, userId, { unitId: unit.id, exerciseVersionId: versionId });
    insertEvent(db, baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId, sequence: 1 }));
    assert.throws(
      () => insertEvent(db, baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId, sequence: 1 })),
      /UNIQUE/,
    );
  } finally { cleanup(); }
});

test('a CORRECTION event without corrects_event_id is rejected; an ATTEMPT event with one is rejected too', () => {
  const { db, cleanup } = freshDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unit = makeUnit(db, userId);
    const versionId = makeExerciseVersion(db, userId, unit.id);
    const attemptId = insertAttempt(db, userId, { unitId: unit.id, exerciseVersionId: versionId });
    const original = insertEvent(db, baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId, sequence: 1 }));

    assert.throws(
      () => insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId, sequence: 2 }), kind: 'CORRECTION' }),
      /CHECK/,
      'CORRECTION with no corrects_event_id must fail',
    );
    assert.throws(
      () => insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId, sequence: 3 }), corrects_event_id: original }),
      /CHECK/,
      'ATTEMPT carrying a corrects_event_id must fail',
    );

    // The valid shape succeeds and leaves the original untouched.
    const correctionId = insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId, sequence: 4 }), kind: 'CORRECTION', corrects_event_id: original, outcome: 'INCORRECT' });
    const originalRow = db.prepare('SELECT outcome FROM learning_events WHERE id = ?').get(original);
    assert.equal(originalRow.outcome, 'CORRECT', 'the original event must remain byte-identical');
    const correctionRow = db.prepare('SELECT corrects_event_id, outcome FROM learning_events WHERE id = ?').get(correctionId);
    assert.equal(correctionRow.corrects_event_id, original);
    assert.equal(correctionRow.outcome, 'INCORRECT');
  } finally { cleanup(); }
});

test('cross-user attempt reference is rejected at the database level (composite FK)', () => {
  const { db, cleanup } = freshDb();
  try {
    const userA = makeUser(db, 'e@example.com');
    const userB = makeUser(db, 'f@example.com');
    const unitA = makeUnit(db, userA);
    const versionA = makeExerciseVersion(db, userA, unitA.id);
    const attemptA = insertAttempt(db, userA, { unitId: unitA.id, exerciseVersionId: versionA });

    assert.throws(
      () => insertEvent(db, baseEventRow({ userId: userB, unitId: unitA.id, attemptId: attemptA, exerciseVersionId: versionA, sequence: 1 })),
      /FOREIGN KEY/,
      'an event owned by user B must not reference an attempt/unit/version owned by user A',
    );
  } finally { cleanup(); }
});

test('invalid kind/outcome/assistance/assessment_method values are rejected', () => {
  const { db, cleanup } = freshDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    const unit = makeUnit(db, userId);
    const versionId = makeExerciseVersion(db, userId, unit.id);
    const attemptId = insertAttempt(db, userId, { unitId: unit.id, exerciseVersionId: versionId });

    assert.throws(() => insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId }), kind: 'BOGUS' }), /CHECK/);
    assert.throws(() => insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId }), outcome: 'MAYBE' }), /CHECK/);
    assert.throws(() => insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId }), assistance_used: 'FULL' }), /CHECK/);
    assert.throws(() => insertEvent(db, { ...baseEventRow({ userId, unitId: unit.id, attemptId, exerciseVersionId: versionId }), assessment_method: 'GUESS' }), /CHECK/);
  } finally { cleanup(); }
});

// --- domain/learning-event.js: pure normalization boundary ---

test('normalizeLearningEvent: omitted assistance/outcome stay UNKNOWN, never coerced to NONE/CORRECT (MX10)', () => {
  const now = '2026-01-01T00:00:00.000Z';
  const result = normalizeLearningEvent({
    unitId: 1, attemptId: 1, exerciseVersionId: 1, sequence: 1,
    assessmentMethod: 'AUTOMATIC', occurredAt: now,
  }, { now });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.assistanceAvailable, 'UNKNOWN');
  assert.equal(result.assistanceUsed, 'UNKNOWN');
  assert.equal(result.confidence, null, 'omitted confidence must stay null, never a coerced 0');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.recordedAt, now);
});

test('normalizeLearningEvent: confidence is validated (0-1) but never affects outcome/assistance validation or classification (design.md: kept separate from correctness)', () => {
  const now = '2026-01-01T00:00:00.000Z';
  const base = { unitId: 1, attemptId: 1, exerciseVersionId: 1, sequence: 1, assessmentMethod: 'SELF_REPORT', occurredAt: now };

  const lowConfidenceCorrect = normalizeLearningEvent({ ...base, outcome: 'CORRECT', confidence: 0.1 }, { now });
  assert.equal(lowConfidenceCorrect.outcome, 'CORRECT', 'low confidence must not downgrade a CORRECT outcome');
  assert.equal(lowConfidenceCorrect.confidence, 0.1);

  const highConfidenceIncorrect = normalizeLearningEvent({ ...base, outcome: 'INCORRECT', confidence: 0.95 }, { now });
  assert.equal(highConfidenceIncorrect.outcome, 'INCORRECT', 'high confidence must not upgrade an INCORRECT outcome');

  assert.throws(() => normalizeLearningEvent({ ...base, confidence: 1.5 }, { now }), (e) => e.field === 'confidence');
  assert.throws(() => normalizeLearningEvent({ ...base, confidence: -0.1 }, { now }), (e) => e.field === 'confidence');
  assert.throws(() => normalizeLearningEvent({ ...base, confidence: 'high' }, { now }), (e) => e.field === 'confidence');
});

test('normalizeLearningEvent: rejects unknown enum values and non-integer coercion attempts', () => {
  const now = '2026-01-01T00:00:00.000Z';
  const base = { unitId: 1, attemptId: 1, exerciseVersionId: 1, sequence: 1, assessmentMethod: 'AUTOMATIC', occurredAt: now };

  assert.throws(() => normalizeLearningEvent({ ...base, outcome: 'PROBABLY' }, { now }), (e) => e instanceof LearningEventError && e.field === 'outcome');
  assert.throws(() => normalizeLearningEvent({ ...base, assistanceUsed: 'FULL_ANSWER' }, { now }), (e) => e.field === 'assistanceUsed');
  assert.throws(() => normalizeLearningEvent({ ...base, assessmentMethod: 'GUESS' }, { now }), (e) => e.field === 'assessmentMethod');
  // A numeric-string sequence must not be silently coerced into a valid integer.
  assert.throws(() => normalizeLearningEvent({ ...base, sequence: '1' }, { now }), (e) => e.field === 'sequence');
  // An object competencyId must not be accepted (contrast with the old core's '[object Object]' coercion, ELC-X10).
  assert.throws(() => normalizeLearningEvent({ ...base, competencyId: {} }, { now }), (e) => e.field === 'competencyId');
});

test('normalizeLearningEvent: CORRECTION requires correctsEventId; ATTEMPT forbids it', () => {
  const now = '2026-01-01T00:00:00.000Z';
  const base = { unitId: 1, attemptId: 1, exerciseVersionId: 1, sequence: 2, assessmentMethod: 'AUTOMATIC', occurredAt: now };

  assert.throws(() => normalizeLearningEvent({ ...base, kind: 'CORRECTION' }, { now }), (e) => e.field === 'correctsEventId');
  assert.throws(() => normalizeLearningEvent({ ...base, correctsEventId: 1 }, { now }), (e) => e.field === 'correctsEventId');

  const ok = normalizeLearningEvent({ ...base, kind: 'CORRECTION', correctsEventId: 1 }, { now });
  assert.equal(ok.correctsEventId, 1);
});
