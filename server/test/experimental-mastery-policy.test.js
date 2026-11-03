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
import { buildEvidenceProfile } from '../src/domain/evidence-profile.js';
import { evaluateChallenger, PROVISIONAL_THRESHOLDS, CHALLENGER_LABELS, CHALLENGER_POLICY_VERSION } from '../src/domain/experimental/mastery-policy.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ASOF = '2026-06-01T00:00:00.000Z';

function ev(overrides) {
  return { eventId: 1, attemptId: 1, sequence: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: '2026-01-01T00:00:00.000Z', exerciseVersionId: 1, ...overrides };
}

test('preserved historical thresholds are the literal documented constants (24h / 0.8 / 0.35), carried forward as provisional, not re-derived', () => {
  assert.equal(PROVISIONAL_THRESHOLDS.delayHoursThreshold, 24);
  assert.equal(PROVISIONAL_THRESHOLDS.highConfidenceCutoff, 0.8);
  assert.equal(PROVISIONAL_THRESHOLDS.lowConfidenceFloor, 0.35);
});

test('no label is ever named "mastered" or any variant — a structural guard, not a convention', () => {
  assert.ok(!CHALLENGER_LABELS.some(l => /master/i.test(l)));
});

test('disabled by default: returns a real inert object, not an exception, with label null and validated false', () => {
  const profile = buildEvidenceProfile([ev({ eventId: 1 }), ev({ eventId: 2, attemptId: 2 })], { asOf: ASOF });
  const result = evaluateChallenger(profile);
  assert.equal(result.enabled, false);
  assert.equal(result.label, null);
  assert.equal(result.validated, false);
  assert.deepEqual(result.hypotheses, []);
  assert.equal(result.policyVersion, CHALLENGER_POLICY_VERSION);
});

test('one correct recognition is not mastery, even with the challenger explicitly enabled: below minIndependentCorrectForPattern stays INSUFFICIENT_EVIDENCE', () => {
  const profile = buildEvidenceProfile([ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE' })], { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, 1);
  const result = evaluateChallenger(profile, { enabled: true });
  assert.equal(result.label, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.validated, false, 'validated must be false regardless of label');
});

test('enabled + at least minIndependentCorrectForPattern independent correct observations, no conflicts: PROVISIONAL_INDEPENDENT_PATTERN (never "mastered")', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: '2026-01-01T00:00:00.000Z' }),
    ev({ eventId: 2, attemptId: 2, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: '2026-01-02T00:00:00.000Z' }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, PROVISIONAL_THRESHOLDS.minIndependentCorrectForPattern);
  const result = evaluateChallenger(profile, { enabled: true });
  assert.equal(result.label, 'PROVISIONAL_INDEPENDENT_PATTERN');
  assert.equal(result.validated, false);
  assert.match(result.humanReadableCaveat, /não representa domínio/i);
});

test('conflicting independent evidence always wins the label, even alongside enough independent-correct volume', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: '2026-01-01T00:00:00.000Z' }),
    ev({ eventId: 2, attemptId: 2, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: '2026-01-02T00:00:00.000Z' }),
    ev({ eventId: 3, attemptId: 3, outcome: 'INCORRECT', assistanceUsed: 'NONE', occurredAt: '2026-01-03T00:00:00.000Z' }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  const result = evaluateChallenger(profile, { enabled: true });
  assert.equal(result.label, 'CONFLICTING_EVIDENCE');
  const conflictHypothesis = result.hypotheses.find(h => h.id === 'CONFLICTING_EVIDENCE');
  assert.ok(conflictHypothesis);
  assert.deepEqual(conflictHypothesis.supportingEventIds.sort(), [1, 2, 3]);
});

test('assisted-only evidence (no independent correct) suggests NEEDS_MORE_INDEPENDENT_PRACTICE with the assisted event IDs as support', () => {
  const events = [ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'HINT' })];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  const result = evaluateChallenger(profile, { enabled: true });
  assert.equal(result.label, 'NEEDS_MORE_INDEPENDENT_PRACTICE');
  const hypothesis = result.hypotheses.find(h => h.id === 'NEEDS_MORE_INDEPENDENT_PRACTICE');
  assert.deepEqual(hypothesis.supportingEventIds, [1]);
});

test('missing observations (UNKNOWN) suggest MISSING_OBSERVATIONS_LIMIT_CONFIDENCE alongside whatever other label applies', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'UNKNOWN', assistanceUsed: 'UNKNOWN' }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  const result = evaluateChallenger(profile, { enabled: true });
  const hypothesis = result.hypotheses.find(h => h.id === 'MISSING_OBSERVATIONS_LIMIT_CONFIDENCE');
  assert.ok(hypothesis);
  assert.deepEqual(hypothesis.supportingEventIds, [1]);
});

test('no effect: enabling the challenger against a real profile built from real DB events changes zero stored rows (schedules, evidence and learning_events are untouched)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-challenger-noeffect-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  try {
    const now = new Date().toISOString();
    const userId = db.prepare(`
      INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
      VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
    `).run('challenger@example.com', 'challenger@example.com', now, now).lastInsertRowid;
    const unit = learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate: '2026-01-01' }).unit;
    const exercise = exercises.create(db, userId, { unitId: unit.id, question: 'Q', answer: 'A', provenance: 'MANUAL' });
    const started = attempts.start(db, userId, { exerciseId: exercise.id });
    attempts.submit(db, userId, started.id, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });

    const snapshot = (table) => JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const before = {
      reviewTasks: snapshot('review_tasks'),
      evidence: snapshot('learning_evidence'),
      events: snapshot('learning_events'),
      attempts: snapshot('exercise_attempts'),
    };

    const rows = db.prepare('SELECT * FROM learning_events WHERE user_id = ?').all(userId).map(r => ({
      eventId: r.id, attemptId: r.attempt_id, sequence: r.sequence, outcome: r.outcome,
      assistanceUsed: r.assistance_used, occurredAt: r.occurred_at, exerciseVersionId: r.exercise_version_id,
    }));
    const profile = buildEvidenceProfile(rows, { asOf: new Date().toISOString() });
    evaluateChallenger(profile, { enabled: true }); // result deliberately discarded — this is the point

    const after = {
      reviewTasks: snapshot('review_tasks'),
      evidence: snapshot('learning_evidence'),
      events: snapshot('learning_events'),
      attempts: snapshot('exercise_attempts'),
    };
    assert.deepEqual(after, before, 'invoking the challenger, enabled or not, must never change any stored row');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
