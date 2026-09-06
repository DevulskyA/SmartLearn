// design.md §3 auth abuse: bounded per-IP plus per-account failure counters,
// generic login errors, no secret logging. Caps are time-windowed (not a
// permanent lockout) specifically so an attacker cannot weaponize the
// counter to lock a *victim* account out indefinitely just by sending
// failed attempts against their email from elsewhere.

export const DEFAULT_ACCOUNT_MAX_ATTEMPTS = 10;
export const DEFAULT_IP_MAX_ATTEMPTS = 60;
export const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS } = {}) {
  const buckets = new Map(); // key -> { count, windowStart }

  function prune(key, nowMs) {
    const bucket = buckets.get(key);
    if (bucket && nowMs - bucket.windowStart >= windowMs) {
      buckets.delete(key);
      return null;
    }
    return bucket ?? null;
  }

  return {
    recordFailure(key, nowMs = Date.now()) {
      const existing = prune(key, nowMs);
      if (existing) {
        existing.count += 1;
        return existing.count;
      }
      buckets.set(key, { count: 1, windowStart: nowMs });
      return 1;
    },

    isBlocked(key, maxAttempts, nowMs = Date.now()) {
      const bucket = prune(key, nowMs);
      return !!bucket && bucket.count >= maxAttempts;
    },

    reset(key) {
      buckets.delete(key);
    },

    // Test/ops visibility only — never exposed over HTTP.
    _debugBucket(key) {
      return buckets.get(key) ?? null;
    },
  };
}
