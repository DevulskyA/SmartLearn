import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { canonicalHash, checkIdempotency, recordIdempotency, IdempotencyConflictError } from '../src/services/idempotency.js';

// TEST_COVERAGE_MATRIX.md gap #3: idempotency.js is cross-cutting (every
// mutating endpoint with an operationKey depends on it) but had no test of
// its own — only incidentally exercised through each service's own
// idempotent-retry test. This gives it a direct unit suite.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-idempotency-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

test('canonicalHash is stable regardless of top-level key insertion order (flat payload — the only shape any real caller uses today)', () => {
  const a = canonicalHash({ attemptId: 1, outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
  const b = canonicalHash({ assessmentMethod: 'SELF_REPORT', attemptId: 1, outcome: 'CORRECT' });
  assert.equal(a, b);
});

test('canonicalHash changes when any value changes', () => {
  const a = canonicalHash({ attemptId: 1, outcome: 'CORRECT' });
  const b = canonicalHash({ attemptId: 1, outcome: 'INCORRECT' });
  assert.notEqual(a, b);
});

test('canonicalHash is stable regardless of key order INSIDE a nested object too', () => {
  const a = canonicalHash({ nested: { x: 1, y: 2 } });
  const b = canonicalHash({ nested: { y: 2, x: 1 } });
  assert.equal(a, b);
});

// Regression for the bug this test file's first draft found: JSON.stringify's
// array-replacer form whitelists property names against ONE fixed list at
// every nesting level (the payload's own top-level keys) — a nested object
// whose keys don't match a top-level key name used to serialize to `{}`,
// so two payloads differing only inside a same-shaped nested object
// silently hashed identically. That would make checkIdempotency wrongly
// replay the first request's cached result for a genuinely different
// second request — no error, just the wrong answer.
test('REGRESSION: two payloads with the SAME nested key names but DIFFERENT nested values never collapse to the same hash', () => {
  const a = canonicalHash({ nested: { x: 1, y: 2 } });
  const b = canonicalHash({ nested: { x: 99, y: -5 } });
  assert.notEqual(a, b);
});

test('checkIdempotency with no operationKey is always a fresh call — idempotency is opt-in per call', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const result = checkIdempotency(db, { userId, operation: 'test-op', operationKey: undefined, payload: { x: 1 } });
    assert.deepEqual(result, { cached: false });
  } finally { cleanup(); }
});

test('checkIdempotency with an unseen key returns cached:false plus the payloadHash for the caller to record', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const result = checkIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payload: { x: 1 } });
    assert.equal(result.cached, false);
    assert.equal(result.payloadHash, canonicalHash({ x: 1 }));
  } finally { cleanup(); }
});

test('same (user, operation, key) + same payload replays the exact stored result, second call never re-runs the side effect', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const payload = { amount: 42 };
    const first = checkIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payload });
    recordIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payloadHash: first.payloadHash, result: { total: 100, nested: { ok: true } } });

    const second = checkIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payload });
    assert.equal(second.cached, true);
    assert.deepEqual(second.result, { total: 100, nested: { ok: true } });
  } finally { cleanup(); }
});

test('same (user, operation, key) with a DIFFERENT payload throws IdempotencyConflictError, never silently overwrites or silently replays the wrong result', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const first = checkIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payload: { amount: 42 } });
    recordIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payloadHash: first.payloadHash, result: { total: 100 } });

    assert.throws(
      () => checkIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payload: { amount: 999 } }),
      (err) => err instanceof IdempotencyConflictError && err.code === 'IDEMPOTENCY_CONFLICT',
    );
  } finally { cleanup(); }
});

test('the same operationKey is isolated per OPERATION — two different endpoints reusing an identical client-generated key never collide', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const opA = checkIdempotency(db, { userId, operation: 'operation-a', operationKey: 'shared-key', payload: { x: 1 } });
    recordIdempotency(db, { userId, operation: 'operation-a', operationKey: 'shared-key', payloadHash: opA.payloadHash, result: { from: 'a' } });

    // Same key, same payload shape, DIFFERENT operation string — must be a fresh call, not a collision with operation-a's record.
    const opB = checkIdempotency(db, { userId, operation: 'operation-b', operationKey: 'shared-key', payload: { x: 1 } });
    assert.equal(opB.cached, false);
  } finally { cleanup(); }
});

test('the same operationKey is isolated per USER — cannot read or collide with another user\'s cached result', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const otherUserId = makeUser(db, 'g@example.com');
    const mine = checkIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payload: { x: 1 } });
    recordIdempotency(db, { userId, operation: 'test-op', operationKey: 'k1', payloadHash: mine.payloadHash, result: { secret: 'mine' } });

    const theirs = checkIdempotency(db, { userId: otherUserId, operation: 'test-op', operationKey: 'k1', payload: { x: 1 } });
    assert.equal(theirs.cached, false, 'another user with the same key/payload must never see the first user\'s cached result');
  } finally { cleanup(); }
});

test('recordIdempotency is a no-op when no operationKey was supplied (matches checkIdempotency\'s opt-in contract)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'h@example.com');
    recordIdempotency(db, { userId, operation: 'test-op', operationKey: undefined, payloadHash: 'irrelevant', result: { x: 1 } });
    const row = db.prepare('SELECT COUNT(*) AS n FROM idempotency_keys WHERE user_id = ?').get(userId);
    assert.equal(row.n, 0);
  } finally { cleanup(); }
});
