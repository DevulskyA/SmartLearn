// design.md §3 auth abuse: bounded per-IP plus per-account failure counters,
// generic login errors, no secret logging. Caps are time-windowed (not a
// permanent lockout) specifically so an attacker cannot weaponize the
// counter to lock a *victim* account out indefinitely just by sending
// failed attempts against their email from elsewhere.

export const DEFAULT_ACCOUNT_MAX_ATTEMPTS = 10;
export const DEFAULT_IP_MAX_ATTEMPTS = 60;
export const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// T12: bounded memory. Without a cap, an attacker (or just a lot of
// distinct anonymous IPs/emails failing once) could grow this Map without
// bound, since a bucket that is never queried again is never pruned. Once
// the cap is reached, a new key first triggers a full expired-entry sweep;
// if that isn't enough, the single oldest bucket is evicted (LRU-ish by
// window start) to make room — bounded memory, not bounded correctness for
// any individual actively-tracked key.
export const DEFAULT_MAX_BUCKETS = 50_000;

export function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS, maxBuckets = DEFAULT_MAX_BUCKETS } = {}) {
  const buckets = new Map(); // key -> { count, windowStart }

  function prune(key, nowMs) {
    const bucket = buckets.get(key);
    if (bucket && nowMs - bucket.windowStart >= windowMs) {
      buckets.delete(key);
      return null;
    }
    return bucket ?? null;
  }

  function sweepExpired(nowMs) {
    for (const [k, b] of buckets) {
      if (nowMs - b.windowStart >= windowMs) buckets.delete(k);
    }
  }

  function evictOldestIfNeeded(nowMs) {
    if (buckets.size < maxBuckets) return;
    sweepExpired(nowMs);
    if (buckets.size < maxBuckets) return;
    const oldestKey = buckets.keys().next().value; // Map preserves insertion order
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  }

  return {
    recordFailure(key, nowMs = Date.now()) {
      const existing = prune(key, nowMs);
      if (existing) {
        existing.count += 1;
        // Re-insert to move this key to the end of Map iteration order —
        // a genuinely least-recently-*touched* eviction order, not merely
        // "oldest by original insertion". Without this, a repeatedly-hit
        // key (the one that most matters) would be the FIRST evicted once
        // the map fills with unrelated one-off keys, since it was also the
        // first one ever inserted.
        buckets.delete(key);
        buckets.set(key, existing);
        return existing.count;
      }
      evictOldestIfNeeded(nowMs);
      buckets.set(key, { count: 1, windowStart: nowMs });
      return 1;
    },

    // Test/ops visibility only.
    _size() {
      return buckets.size;
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
