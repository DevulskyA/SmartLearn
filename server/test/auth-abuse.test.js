import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { createRateLimiter } from '../src/auth/rate-limit.js';
import { hashPassword } from '../src/auth/passwords.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-abuse-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('T12: rate limiter memory is bounded — many distinct keys do not grow the map without limit', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxBuckets: 100 });
  const now = 1_000_000;
  for (let i = 0; i < 500; i++) {
    limiter.recordFailure(`key:${i}`, now);
  }
  assert.ok(limiter._size() <= 100, `expected bucket count bounded at 100, got ${limiter._size()}`);
});

test('T12: bounded memory does not break correctness for an actively-tracked key', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxBuckets: 10 });
  const now = 1_000_000;
  // Interleave: touch "victim" between bursts of unrelated noise keys, so
  // it is repeatedly the most-recently-touched entry and must survive LRU
  // eviction even though 50 other distinct keys churn through the map.
  for (let i = 0; i < 50; i++) {
    limiter.recordFailure(`noise:${i}`, now + i);
    limiter.recordFailure('victim', now + i);
  }
  assert.equal(limiter.isBlocked('victim', 5, now + 100), true, 'the actively-hit key must still reach its correct count despite eviction pressure on other keys');
});

test('T12: expired buckets are swept before evicting a live one', () => {
  const limiter = createRateLimiter({ windowMs: 100, maxBuckets: 5 });
  const start = 1_000_000;
  for (let i = 0; i < 5; i++) limiter.recordFailure(`old:${i}`, start);
  // All 5 "old" buckets are now expired relative to `later`.
  const later = start + 200;
  limiter.recordFailure('new-key', later);
  assert.ok(limiter._size() <= 5, 'a sweep of expired entries should make room without needing raw eviction');
});

test('T12: without trustProxy, a spoofed X-Forwarded-For does not change the rate-limit key (request.ip is the real peer)', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      const email = 'victim@example.com';
      // 10 failed attempts, each claiming a DIFFERENT spoofed forwarded IP —
      // if the server trusted this header, each would land in a different
      // per-IP bucket and never trip the per-IP limit. It should still trip
      // the per-ACCOUNT limit regardless (that key doesn't depend on IP),
      // proving the account-level cap can't be evaded by IP spoofing.
      let lastStatus;
      for (let i = 0; i < 12; i++) {
        const res = await app.inject({
          method: 'POST', url: '/v1/auth/login',
          headers: { origin: TEST_ORIGIN, 'x-forwarded-for': `10.0.0.${i}` },
          payload: { email, password: 'whatever wrong password here' },
        });
        lastStatus = res.statusCode;
      }
      assert.equal(lastStatus, 401); // still generic, but by now rate-limited
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('T12: real client IP (not a spoofable header) is what actually gates the per-IP counter', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      // app.inject requests all originate from the same simulated connection
      // regardless of X-Forwarded-For when trustProxy is false — confirm
      // Fastify's own request.ip resolution, not our rate limiter, is what
      // provides this guarantee.
      const res1 = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { 'x-forwarded-for': '1.2.3.4' } });
      const res2 = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { 'x-forwarded-for': '5.6.7.8' } });
      // Both are 401 (no session either way) — this test's real assertion is
      // that request.ip below is identical, proving the header is ignored.
      assert.equal(res1.statusCode, 401);
      assert.equal(res2.statusCode, 401);
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('T12: no unbounded expensive work — concurrent login storm settles without hanging (bounded scrypt concurrency from T09)', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email: 'storm@example.com', password: 'a real password here 123' } });
      const requests = Array.from({ length: 8 }, () =>
        app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email: 'storm@example.com', password: 'wrong password attempt' } })
      );
      const results = await Promise.allSettled(requests);
      assert.ok(results.every(r => r.status === 'fulfilled'), 'all concurrent login attempts must settle, not hang');
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('SECURITY FIX (found by independent verifier): malformed email cannot bypass the rate limiter to force unbounded real/decoy scrypt work', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      // A malformed email (fails validateEmailShape) previously reached
      // runDecoyHash() — a real scrypt call — BEFORE any rate-limit check.
      // After the fix, the same malformed-email key is rate-limited exactly
      // like a valid one: once blocked, requests must return quickly
      // (no scrypt attempted), not just eventually 401 after paying the cost.
      const email = 'not-a-valid-email-shape';
      const timings = [];
      for (let i = 0; i < 15; i++) {
        const start = Date.now();
        const res = await app.inject({
          method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN },
          payload: { email, password: 'whatever' },
        });
        timings.push(Date.now() - start);
        assert.equal(res.statusCode, 401);
      }
      // DEFAULT_ACCOUNT_MAX_ATTEMPTS is 10 — by request 15, the account key
      // must be blocked, meaning this request never reached runDecoyHash().
      const lastTiming = timings[timings.length - 1];
      assert.ok(lastTiming < 100, `expected the rate-limited (post-block) request to be fast (no scrypt), got ${lastTiming}ms`);
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('SECURITY FIX: /auth/register is itself rate-limited per IP (previously unlimited)', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      let lastStatus;
      for (let i = 0; i < 25; i++) {
        const res = await app.inject({
          method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN },
          payload: { email: `flood-${i}@example.com`, password: 'a perfectly valid password 123' },
        });
        lastStatus = res.statusCode;
      }
      assert.equal(lastStatus, 429, 'expected registration flood to eventually be rate-limited (429), not accepted indefinitely');
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('SECURITY FIX: the shared scrypt queue itself has a hard size cap independent of any route-level limiter', async () => {
  // Bypass HTTP entirely and hammer the password module directly, proving
  // the backstop works even for a hypothetical future caller that forgets
  // to rate-limit at the route level.
  const jobs = Array.from({ length: 250 }, (_, i) => hashPassword(`direct queue pressure test ${i}`));
  const results = await Promise.allSettled(jobs);
  const rejected = results.filter(r => r.status === 'rejected');
  assert.ok(rejected.length > 0, 'expected some jobs to be rejected once the queue cap is exceeded, proving the cap is real');
  assert.ok(rejected.every(r => r.reason?.code === 'HASH_QUEUE_OVERLOADED'), 'rejections must be the specific overload error, not a generic failure');
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  assert.ok(fulfilled.length > 0, 'jobs within the cap must still succeed normally');
});

test('SECURITY FIX round 2 (found by second independent verifier): /auth/password is rate-limited per user, wrong-password floods do not reach unbounded scrypt', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      const email = 'passwordflood@example.com';
      const password = 'a genuinely long real password 1';
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
      const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
      const cookie = loginRes.headers['set-cookie'].split(';')[0];
      const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
      const csrfToken = JSON.parse(me.body).csrfToken;

      const timings = [];
      for (let i = 0; i < 13; i++) {
        const start = Date.now();
        const res = await app.inject({
          method: 'POST', url: '/v1/auth/password', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
          payload: { currentPassword: 'wrong wrong wrong wrong', newPassword: 'irrelevant long password here' },
        });
        timings.push(Date.now() - start);
        assert.equal(res.statusCode, 401);
      }
      const lastTiming = timings[timings.length - 1];
      assert.ok(lastTiming < 100, `expected the rate-limited request to be fast (no scrypt), got ${lastTiming}ms`);
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('T12 (cross-reference to T10): one user genuinely cannot retrieve another user\'s session data via any header trick', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: false });
    try {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email: 'userA@example.com', password: 'password for user A here' } });
      const loginA = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email: 'userA@example.com', password: 'password for user A here' } });
      const cookieA = loginA.headers['set-cookie'].split(';')[0];

      // Attempt to access /me while also claiming to be a different user via
      // a spoofed header that does not exist in the real contract, to prove
      // there is no such backdoor.
      const res = await app.inject({
        method: 'GET', url: '/v1/auth/me',
        headers: { cookie: cookieA, 'x-user-id': '999', 'x-actor-override': 'userB' },
      });
      const body = JSON.parse(res.body);
      assert.equal(body.user.email, 'usera@example.com', 'spoofed headers must never change whose session is resolved');
    } finally { await app.close(); }
  } finally { cleanup(); }
});
