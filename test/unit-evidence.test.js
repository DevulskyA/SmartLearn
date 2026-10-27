// Knowledge/gaps component (experimental): observed evidence only, never mastery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unitEvidence, cautiousState, wilsonUpper } from '../shared/unit-evidence.js';

let id = 0;
const ev = (unitId, ex, outcome, assistanceUsed = 'NONE', extra = {}) => ({ id: ++id, unitId, exerciseVersionId: ex, kind: 'ATTEMPT', correctsEventId: null, outcome, assistanceUsed, occurredAt: `2026-10-${String(10 + (id % 18)).padStart(2, '0')}T10:00:00Z`, ...extra });

test('little evidence is INSUFFICIENT whatever the accuracy; enough weak independent evidence is a GAP SIGNAL, never "low mastery"', () => {
  const few = unitEvidence([ev(1, 1, 'INCORRECT'), ev(1, 2, 'INCORRECT')])[0];
  assert.equal(few.signal, 'INSUFFICIENT');
  const weak = unitEvidence(Array.from({ length: 9 }, (_, i) => ev(2, (i % 5) + 1, i === 0 ? 'CORRECT' : 'INCORRECT')))[0];
  assert.equal(weak.signal, 'GAP_SIGNAL');
  const strong = unitEvidence(Array.from({ length: 9 }, (_, i) => ev(3, (i % 5) + 1, 'CORRECT')))[0];
  assert.equal(strong.signal, 'NO_GAP_SIGNAL');
  for (const u of [few, weak, strong]) assert.ok(!('mastery' in u) && !('level' in u) && !('score' in u), 'no inferred level in the output');
});

test('assisted attempts and unknown outcomes never enter the accuracy; they are counted apart (assistance is not mastery)', () => {
  const events = [
    ...Array.from({ length: 6 }, (_, i) => ev(1, i + 1, 'CORRECT', 'SOLUTION')),
    ...Array.from({ length: 2 }, (_, i) => ev(1, i + 1, 'INCORRECT', 'UNKNOWN')),
    ev(1, 9, 'UNKNOWN', 'NONE'),
    ev(1, 10, 'CORRECT', 'NONE'),
  ];
  const u = unitEvidence(events)[0];
  assert.deepEqual(u.independent, { attempts: 1, correct: 1, distinctQuestions: 1 });
  assert.equal(u.assisted, 6);
  assert.equal(u.assistanceUnknown, 2);
  assert.equal(u.outcomeUnknown, 1);
  assert.equal(u.signal, 'INSUFFICIENT', 'six right answers WITH the solution shown prove nothing');
});

test('a CORRECTION is a new event that overrides the attempt\'s outcome; the latest one wins; inputs are not mutated', () => {
  const a = ev(1, 1, 'INCORRECT');
  const fix1 = { id: ++id, unitId: 1, exerciseVersionId: 1, kind: 'CORRECTION', correctsEventId: a.id, outcome: 'CORRECT', assistanceUsed: 'NONE', occurredAt: '2026-10-20T10:00:00Z' };
  const fix2 = { ...fix1, id: ++id, outcome: 'INCORRECT' };
  const events = [a, fix1];
  const before = JSON.stringify(events);
  assert.equal(unitEvidence(events)[0].independent.correct, 1);
  assert.equal(unitEvidence([a, fix1, fix2])[0].independent.correct, 0, 'the later correction stands');
  assert.equal(JSON.stringify(events), before);
  assert.equal(unitEvidence([a, fix1])[0].attempts, 1, 'the correction is not a second attempt');
});

test('units are separate, recent history is chronological, and no events means nothing', () => {
  const out = unitEvidence([ev(2, 1, 'CORRECT'), ev(1, 1, 'INCORRECT')]);
  assert.deepEqual(out.map((u) => u.unitId), [1, 2]);
  assert.deepEqual(unitEvidence([]), []);
  const many = unitEvidence(Array.from({ length: 8 }, (_, i) => ev(5, i + 1, i % 2 ? 'CORRECT' : 'INCORRECT', 'NONE', { occurredAt: `2026-10-${String(i + 1).padStart(2, '0')}T08:00:00Z` })))[0];
  assert.equal(many.recent.length, 5);
});

test('the shared rule is the one the experiment measured: thresholds and Wilson bound', () => {
  assert.equal(cautiousState({ attempts: 4, correct: 0, distinct: 4 }), 'INSUFFICIENT');
  assert.equal(cautiousState({ attempts: 9, correct: 1, distinct: 2 }), 'INSUFFICIENT');
  assert.equal(cautiousState({ attempts: 9, correct: 1, distinct: 5 }), 'GAP');
  assert.equal(cautiousState({ attempts: 9, correct: 8, distinct: 5 }), 'OK');
  assert.equal(wilsonUpper(0, 0), 1);
});
