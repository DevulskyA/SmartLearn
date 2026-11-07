import assert from 'node:assert/strict';
import test from 'node:test';
import { ProgressWatchdogError, waitForProgress } from '../e2e/support/progress-watchdog.js';

test('progress watchdog accepts immediate completion', async () => {
  const result = await waitForProgress({
    label: 'quick',
    readState: async () => ({ phase: 'done' }),
    isComplete: (state) => state.phase === 'done',
    timeoutMs: 100,
    quietMs: 50,
    sampleMs: 1,
  });
  assert.equal(result.state.phase, 'done');
  assert.equal(result.samples, 1);
});

test('progress watchdog accepts slow work while state advances', async () => {
  let phase = 0;
  const result = await waitForProgress({
    label: 'slow',
    readState: async () => ({ phase: phase++ < 3 ? `loading-${phase}` : 'done' }),
    isComplete: (state) => state.phase === 'done',
    timeoutMs: 200,
    quietMs: 20,
    sampleMs: 2,
  });
  assert.equal(result.state.phase, 'done');
  assert.ok(result.samples >= 4);
});

test('progress watchdog diagnoses a real stall', async () => {
  await assert.rejects(
    waitForProgress({
      label: 'stalled',
      readState: async () => ({ phase: 'loading' }),
      isComplete: (state) => state.phase === 'done',
      timeoutMs: 200,
      quietMs: 15,
      sampleMs: 2,
    }),
    (error) => {
      assert.ok(error instanceof ProgressWatchdogError);
      assert.equal(error.details.reason, 'no-progress');
      assert.deepEqual(error.details.lastState, { phase: 'loading' });
      assert.ok(error.details.samples > 1);
      return true;
    },
  );
});
