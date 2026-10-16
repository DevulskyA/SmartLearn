import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceProfile, EVIDENCE_PROFILE_POLICY_VERSION } from '../src/domain/evidence-profile.js';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z'; // +24h
const T2 = '2026-01-10T00:00:00.000Z'; // +9 days
const ASOF = '2026-02-01T00:00:00.000Z';

function ev(overrides) {
  return {
    eventId: 1, attemptId: 1, sequence: 1, outcome: 'CORRECT', assistanceUsed: 'NONE',
    occurredAt: T0, exerciseVersionId: 1, ...overrides,
  };
}

test('empty input is a safe boundary: all counts zero, no error', () => {
  const profile = buildEvidenceProfile([], { asOf: ASOF });
  assert.equal(profile.totalObservedCount, 0);
  assert.equal(profile.independentCorrectCount, 0);
  assert.equal(profile.unknownCount, 0);
  assert.equal(profile.hasConflictingIndependentEvidence, false);
  assert.equal(profile.latestIndependentOutcome, null);
  assert.equal(profile.policyVersion, EVIDENCE_PROFILE_POLICY_VERSION);
});

test('invalid asOf throws rather than silently defaulting to "now"', () => {
  assert.throws(() => buildEvidenceProfile([], { asOf: 'not-a-date' }), TypeError);
  assert.throws(() => buildEvidenceProfile([], {}), TypeError);
});

test('basic classification: independent correct/incorrect, assisted, and unknown are counted into distinct buckets', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE' }),
    ev({ eventId: 2, attemptId: 2, outcome: 'INCORRECT', assistanceUsed: 'NONE' }),
    ev({ eventId: 3, attemptId: 3, outcome: 'CORRECT', assistanceUsed: 'HINT' }),
    ev({ eventId: 4, attemptId: 4, outcome: 'UNKNOWN', assistanceUsed: 'NONE' }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, 1);
  assert.equal(profile.independentIncorrectCount, 1);
  assert.equal(profile.assistedCount, 1);
  assert.equal(profile.unknownCount, 1);
  assert.deepEqual(profile.independentCorrectEventIds, [1]);
});

test('ELC-X01: omitted/UNKNOWN assistance is never counted as independent, regardless of a CORRECT outcome (MX10)', () => {
  const events = [ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'UNKNOWN' })];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, 0);
  assert.equal(profile.unknownCount, 1);
  assert.deepEqual(profile.missingObservationEventIds, [1]);
});

test('ELC-X02: the same event delivered twice (exact duplicate eventId) is counted once, and duplicate attempt submissions never double-count (MX11)', () => {
  const duplicated = ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE' });
  const profile = buildEvidenceProfile([duplicated, { ...duplicated }], { asOf: ASOF });
  assert.equal(profile.totalObservedCount, 1);
  assert.equal(profile.independentCorrectCount, 1);
});

test('out-of-order and shuffled input never changes the result (determinism/invariance)', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: T0 }),
    ev({ eventId: 2, attemptId: 2, outcome: 'INCORRECT', assistanceUsed: 'HINT', occurredAt: T2 }),
    ev({ eventId: 3, attemptId: 3, outcome: 'UNKNOWN', assistanceUsed: 'UNKNOWN', occurredAt: T1 }),
  ];
  const forward = buildEvidenceProfile(events, { asOf: ASOF });
  const reversed = buildEvidenceProfile([...events].reverse(), { asOf: ASOF });
  assert.deepEqual(forward, reversed);
});

test('a CORRECTION (higher sequence) for the same attempt supersedes the original, never both counted (retry/correction path)', () => {
  const original = ev({ eventId: 1, attemptId: 1, sequence: 1, outcome: 'INCORRECT', assistanceUsed: 'NONE' });
  const correction = ev({ eventId: 2, attemptId: 1, sequence: 2, outcome: 'CORRECT', assistanceUsed: 'NONE' });
  const profile = buildEvidenceProfile([original, correction], { asOf: ASOF });
  assert.equal(profile.totalObservedCount, 1, 'one attempt, one effective observation');
  assert.equal(profile.independentCorrectCount, 1);
  assert.equal(profile.independentIncorrectCount, 0);
  assert.deepEqual(profile.independentCorrectEventIds, [2]);
});

test('ELC-X05/X09: a later independent INCORRECT after an earlier independent CORRECT is surfaced as a conflict, never silently resolved to one verdict', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: T0 }),
    ev({ eventId: 2, attemptId: 2, outcome: 'INCORRECT', assistanceUsed: 'NONE', occurredAt: T2 }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  assert.equal(profile.hasConflictingIndependentEvidence, true);
  assert.equal(profile.latestIndependentOutcome.eventId, 2);
  assert.equal(profile.latestIndependentOutcome.outcome, 'INCORRECT');
  // Both sides remain individually inspectable — nothing is erased.
  assert.deepEqual(profile.independentCorrectEventIds, [1]);
  assert.deepEqual(profile.independentIncorrectEventIds, [2]);
});

test('ELC-X08: a correct outcome after assistance never becomes independent evidence, no matter how it might otherwise look', () => {
  const events = [ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'SOLUTION' })];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, 0);
  assert.equal(profile.assistedCount, 1);
  assert.deepEqual(profile.assistedEventIds, [1]);
});

test('one correct recognition is not mastery: a single independent correct event reports a count of 1, and the profile makes no mastery claim at all', () => {
  const profile = buildEvidenceProfile([ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE' })], { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, 1);
  const keys = Object.keys(profile);
  assert.ok(!keys.some(k => /master/i.test(k)), 'profile must never expose a mastery/mastered field — that verdict belongs to a separate, disabled-by-default policy (T33)');
});

test('confidence never affects classification: a low-confidence CORRECT and a high-confidence CORRECT classify identically', () => {
  const lowConfidence = ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', confidence: 0.05 });
  const highConfidence = ev({ eventId: 2, attemptId: 2, outcome: 'CORRECT', assistanceUsed: 'NONE', confidence: 0.98 });
  const profile = buildEvidenceProfile([lowConfidence, highConfidence], { asOf: ASOF });
  assert.equal(profile.independentCorrectCount, 2);
});

test('MX12: a caller-supplied delayHours-shaped field on the event is never trusted — time separation is computed only from real occurredAt timestamps', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: T0 }),
    // A forged/attacker-supplied delayHours claiming a huge gap must have zero effect.
    ev({ eventId: 2, attemptId: 2, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: T1, delayHours: 999999 }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  const delayed = profile.delayedIndependentCorrect.find(d => d.eventId === 2);
  assert.ok(delayed);
  assert.equal(delayed.hoursSinceFirstObservation, 24, 'must be the REAL elapsed hours between real timestamps, not the forged field');
});

test('transfer evidence is reported only when an already-reviewed source marked isTransfer:true — never inferred', () => {
  const untaggedEvents = [ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE' })];
  const untaggedProfile = buildEvidenceProfile(untaggedEvents, { asOf: ASOF });
  assert.equal(untaggedProfile.transferEvidence.observedCount, 0);

  const taggedEvents = [ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', isTransfer: true })];
  const taggedProfile = buildEvidenceProfile(taggedEvents, { asOf: ASOF });
  assert.equal(taggedProfile.transferEvidence.observedCount, 1);
  assert.equal(taggedProfile.transferEvidence.independentCorrectCount, 1);
});

test('asOf is a real point-in-time cutoff: an event occurring after asOf is excluded from the profile', () => {
  const events = [
    ev({ eventId: 1, attemptId: 1, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: T0 }),
    ev({ eventId: 2, attemptId: 2, outcome: 'INCORRECT', assistanceUsed: 'NONE', occurredAt: '2026-06-01T00:00:00.000Z' }),
  ];
  const profile = buildEvidenceProfile(events, { asOf: ASOF });
  assert.equal(profile.totalObservedCount, 1);
  assert.deepEqual(profile.independentCorrectEventIds, [1]);
});
