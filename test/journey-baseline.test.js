import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, compare } from '../scripts/journey-baseline.mjs';

const steps = (durations) => durations.map((durationMs, i) => ({ step: i + 1, durationMs }));
const baseline = measure(steps([5000, 10000, 20000]));

test('measure sums the steps and ignores a step with no duration', () => {
  assert.deepEqual(measure([{ step: 1, durationMs: 100 }, { step: 2 }, { step: 3, durationMs: 50 }]), { total: 150, steps: { 1: 100, 3: 50 } });
});

test('no baseline is reported as such, not as a pass', () => {
  assert.equal(compare(null, measure(steps([1000]))).status, 'NO_BASELINE');
});

test('a run equal to the baseline is OK, and small noise on a short step is ignored', () => {
  assert.equal(compare(baseline, measure(steps([5000, 10000, 20000]))).status, 'OK');
  assert.equal(compare(measure(steps([300, 10000])), measure(steps([700, 10000]))).status, 'OK', '300 -> 700 ms is under the 2 s floor');
});

test('a much slower step and a much faster step are both deviations (slower = target or regression, faster = skipped work)', () => {
  const slower = compare(baseline, measure(steps([5000, 25000, 20000])));
  assert.equal(slower.status, 'DEVIATION');
  assert.deepEqual(slower.deviations.filter((d) => d.step === '2').map((d) => d.kind), ['slower']);
  const faster = compare(baseline, measure(steps([5000, 10000, 4000])));
  assert.deepEqual(faster.deviations.filter((d) => d.step === '3').map((d) => d.kind), ['faster']);
});

test('a step that did not run, or one the baseline never saw, is a deviation', () => {
  assert.deepEqual(compare(baseline, measure(steps([5000, 10000]))).deviations.map((d) => [d.step, d.kind]).filter(([s]) => s === '3'), [['3', 'not run']]);
  assert.deepEqual(compare(baseline, measure(steps([5000, 10000, 20000, 3000]))).deviations.map((d) => [d.step, d.kind]), [['4', 'not in baseline']]);
});
