import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSessionToken, hashToken, isSessionInactive,
  sessionCookieOptions, sessionCookieName,
  SESSION_INACTIVITY_LIFETIME_MS,
} from '../src/auth/session-tokens.js';
import { generateCsrfToken, csrfTokensMatch, originIsAllowed, requiresCsrfCheck } from '../src/auth/csrf.js';
import { createRateLimiter } from '../src/auth/rate-limit.js';

test('generateSessionToken produces distinct 32-byte-derived tokens', () => {
  const a = generateSessionToken();
  const b = generateSessionToken();
  assert.notEqual(a, b);
  assert.ok(a.length > 30);
});

test('hashToken is deterministic and never returns the raw token', () => {
  const token = generateSessionToken();
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, token);
});

test('production cookie is Secure with __Host- prefix; dev cookie is not', () => {
  assert.equal(sessionCookieName(true), '__Host-sl_session');
  assert.equal(sessionCookieOptions(true).secure, true);
  assert.equal(sessionCookieName(false), 'sl_session_dev');
  assert.equal(sessionCookieOptions(false).secure, false);
});

test('cookie is always HttpOnly, SameSite=Lax, Path=/', () => {
  for (const isProd of [true, false]) {
    const opts = sessionCookieOptions(isProd);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, 'lax');
    assert.equal(opts.path, '/');
  }
});

test('injected clock: session becomes inactive exactly after 7 days of no activity', () => {
  const lastSeen = '2026-01-01T00:00:00.000Z';
  const justUnder = new Date(lastSeen).getTime() + SESSION_INACTIVITY_LIFETIME_MS - 1000;
  const justOver = new Date(lastSeen).getTime() + SESSION_INACTIVITY_LIFETIME_MS + 1000;
  assert.equal(isSessionInactive(lastSeen, justUnder), false);
  assert.equal(isSessionInactive(lastSeen, justOver), true);
});

test('CSRF token match is constant-time-safe and rejects non-string/mismatched-length input', () => {
  const token = generateCsrfToken();
  assert.equal(csrfTokensMatch(token, token), true);
  assert.equal(csrfTokensMatch(token, token + 'x'), false);
  assert.equal(csrfTokensMatch(token, 'short'), false);
  assert.equal(csrfTokensMatch(null, token), false);
  assert.equal(csrfTokensMatch(token, undefined), false);
});

test('origin check fails closed for missing, null, or unexpected Origin', () => {
  const allowed = ['https://smartlearn.example.com'];
  assert.equal(originIsAllowed('https://smartlearn.example.com', allowed), true);
  assert.equal(originIsAllowed(undefined, allowed), false);
  assert.equal(originIsAllowed('null', allowed), false);
  assert.equal(originIsAllowed('https://evil.example.com', allowed), false);
});

test('CSRF check applies to mutating methods only', () => {
  assert.equal(requiresCsrfCheck('POST'), true);
  assert.equal(requiresCsrfCheck('PUT'), true);
  assert.equal(requiresCsrfCheck('PATCH'), true);
  assert.equal(requiresCsrfCheck('DELETE'), true);
  assert.equal(requiresCsrfCheck('GET'), false);
  assert.equal(requiresCsrfCheck('HEAD'), false);
});

test('rate limiter blocks after max attempts within the window, per key', () => {
  const limiter = createRateLimiter({ windowMs: 1000 });
  const now = 1_000_000;
  for (let i = 0; i < 4; i++) limiter.recordFailure('acct:x', now);
  assert.equal(limiter.isBlocked('acct:x', 5, now), false);
  limiter.recordFailure('acct:x', now);
  assert.equal(limiter.isBlocked('acct:x', 5, now), true);
  assert.equal(limiter.isBlocked('acct:y', 5, now), false, 'a different key must not be affected');
});

test('rate limiter window expires — no permanent lockout from attacker input', () => {
  const limiter = createRateLimiter({ windowMs: 1000 });
  const start = 1_000_000;
  for (let i = 0; i < 10; i++) limiter.recordFailure('acct:z', start);
  assert.equal(limiter.isBlocked('acct:z', 5, start), true);
  const afterWindow = start + 1001;
  assert.equal(limiter.isBlocked('acct:z', 5, afterWindow), false, 'block must expire once the window elapses');
});

test('rate limiter reset clears the counter immediately (e.g. on successful login)', () => {
  const limiter = createRateLimiter({ windowMs: 60_000 });
  const now = 1_000_000;
  for (let i = 0; i < 10; i++) limiter.recordFailure('acct:w', now);
  assert.equal(limiter.isBlocked('acct:w', 5, now), true);
  limiter.reset('acct:w');
  assert.equal(limiter.isBlocked('acct:w', 5, now), false);
});
