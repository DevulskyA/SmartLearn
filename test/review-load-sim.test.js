// HG-09 decision aid: the load simulation must agree with itself before its numbers are read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../scripts/review-load-sim.mjs';

const studyDays = Array.from({ length: 10 }, (_, i) => i);
const base = { studyDays, capacity: 15, horizon: 200 };
const everyDay = () => true;
const absent60 = (d) => d < 20 || d > 79;

test('with no absence both policies produce the same schedule: option 3 reduces to today when reviews happen on time', () => {
  const a = simulate({ ...base, active: everyDay, policy: 'FIXED16' });
  const b = simulate({ ...base, active: everyDay, policy: 'ONE_ACTIVE' });
  assert.deepEqual(b, a);
  assert.equal(a.backlogOnReturn, 0);
});

test('ONE_ACTIVE never holds more due items than there are units, however long the absence', () => {
  const b = simulate({ ...base, active: absent60, policy: 'ONE_ACTIVE' });
  assert.ok(b.peakBacklog <= studyDays.length);
});

test('after a 60-day absence FIXED16 returns to a larger pile than ONE_ACTIVE (load only; no claim about retention)', () => {
  const a = simulate({ ...base, active: absent60, policy: 'FIXED16' });
  const b = simulate({ ...base, active: absent60, policy: 'ONE_ACTIVE' });
  assert.ok(a.backlogOnReturn > b.backlogOnReturn, `${a.backlogOnReturn} vs ${b.backlogOnReturn}`);
  assert.ok(b.performed < a.performed, 'fewer exposures too: the lower load is not "better", it is less repetition');
});
