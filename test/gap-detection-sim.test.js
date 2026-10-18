// F4 decision aid: the experiment must be deterministic and its rules must behave as documented before its table is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wilsonUpper, cautiousState, naiveFlag, evaluate } from '../scripts/gap-detection-sim.mjs';

test('wilsonUpper: no data cannot support a claim; more data at the same rate tightens the bound', () => {
  assert.equal(wilsonUpper(0, 0), 1);
  assert.ok(wilsonUpper(3, 5) > wilsonUpper(30, 50));
  assert.ok(wilsonUpper(30, 50) > 0.6 && wilsonUpper(30, 50) < 0.74);
});

test('cautiousState: too few distinct questions or attempts is INSUFFICIENT, never GAP, whatever the accuracy', () => {
  assert.equal(cautiousState({ attempts: 4, correct: 0, distinct: 4 }), 'INSUFFICIENT');
  assert.equal(cautiousState({ attempts: 9, correct: 1, distinct: 2 }), 'INSUFFICIENT');
  assert.equal(cautiousState({ attempts: 9, correct: 1, distinct: 5 }), 'GAP');
  assert.equal(cautiousState({ attempts: 9, correct: 8, distinct: 5 }), 'OK');
});

test('naiveFlag condemns a subtopic after one wrong answer; that is the cost the cautious rule avoids', () => {
  assert.equal(naiveFlag({ attempts: 1, correct: 0 }), true);
  assert.equal(cautiousState({ attempts: 1, correct: 0, distinct: 1 }), 'INSUFFICIENT');
});

test('evaluate is deterministic and, with little data, the cautious rule abstains instead of raising false alarms', () => {
  const a = evaluate({ attempts: 16, students: 60 });
  assert.deepEqual(evaluate({ attempts: 16, students: 60 }), a);
  assert.equal(a.CAUTIOUS.falseFlagsPerStudent, 0);
  assert.ok(a.CAUTIOUS.insufficient > 0.9);
  assert.ok(a.NAIVE.falseFlagsPerStudent > 0.3);
  const rich = evaluate({ attempts: 320, students: 60 });
  assert.ok(rich.CAUTIOUS.recall > 0.9, 'with enough evidence the cautious rule does find the weak subtopics');
});
