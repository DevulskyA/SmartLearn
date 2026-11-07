export class ProgressWatchdogError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ProgressWatchdogError';
    this.details = details;
  }
}

const fingerprint = (state) => {
  if (typeof state === 'string') return state;
  try { return JSON.stringify(state); } catch { return String(state); }
};

/**
 * Wait for a meaningful application state transition.
 *
 * This is intentionally not a blind sleep: every sample is a state snapshot.
 * A slow operation is accepted while its snapshot changes; a stalled operation
 * fails early with the last observed state and sample count.
 */
export function waitForProgress({
  label,
  readState,
  isComplete,
  timeoutMs = 15_000,
  quietMs = 5_000,
  sampleMs = 100,
  onProgress,
  onFailure,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  if (!label || typeof readState !== 'function' || typeof isComplete !== 'function') {
    throw new TypeError('waitForProgress requires label, readState and isComplete');
  }
  if (timeoutMs <= 0 || quietMs <= 0 || sampleMs <= 0) {
    throw new RangeError('waitForProgress limits must be positive');
  }

  const startedAt = now();
  let lastProgressAt = startedAt;
  let lastFingerprint;
  let lastState;
  let samples = 0;
  let timer;
  let settled = false;

  const diagnostics = (reason, error) => ({
    label,
    reason,
    elapsedMs: now() - startedAt,
    quietMs,
    timeoutMs,
    samples,
    lastState,
    error: error?.message,
  });

  return new Promise((resolve, reject) => {
    const finish = async (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) cancel(timer);
      await callback(value);
    };

    const fail = async (reason, error) => {
      const details = diagnostics(reason, error);
      const failure = error instanceof ProgressWatchdogError
        ? error
        : new ProgressWatchdogError(
          `[${label}] ${reason === 'no-progress' ? 'sem progresso observável' : 'tempo limite excedido'}`,
          details,
        );
      failure.details = details;
      await finish(async () => {
        try { await onFailure?.(details); } finally { reject(failure); }
      });
    };

    const tick = async () => {
      if (settled) return;
      try {
        lastState = await readState();
        samples += 1;
        const currentFingerprint = fingerprint(lastState);
        if (currentFingerprint !== lastFingerprint) {
          lastFingerprint = currentFingerprint;
          lastProgressAt = now();
          await onProgress?.({ label, elapsedMs: lastProgressAt - startedAt, state: lastState, samples });
        }
        if (await isComplete(lastState)) {
          await finish(async () => resolve({ state: lastState, elapsedMs: now() - startedAt, samples }));
          return;
        }
        const elapsedMs = now() - startedAt;
        if (elapsedMs >= timeoutMs) return fail('timeout');
        if (now() - lastProgressAt >= quietMs) return fail('no-progress');
        timer = schedule(tick, Math.min(sampleMs, timeoutMs - elapsedMs));
      } catch (error) {
        await fail('read-error', error);
      }
    };

    void tick();
  });
}

export async function timedStep(testApi, title, action) {
  const startedAt = Date.now();
  return testApi.step(title, async () => {
    try {
      return await action();
    } finally {
      console.log(`[e2e-timing] ${title}: ${Date.now() - startedAt}ms`);
    }
  });
}
