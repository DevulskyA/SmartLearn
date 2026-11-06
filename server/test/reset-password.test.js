import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { issueResetToken, consumeResetToken } from '../src/auth/reset-tokens.js';
import * as users from '../src/repositories/users.js';
import { hashPassword } from '../src/auth/passwords.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-reset-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

async function seedUser(db, email = 'reset@example.com') {
  const { hash, salt, algorithm, params } = await hashPassword('original password 12345');
  return users.createUser(db, { email, emailDisplay: email, passwordHash: hash, passwordSalt: salt, passwordAlgorithm: algorithm, passwordParams: params });
}

test('issueResetToken returns null for an unknown account (no enumeration via the CLI path)', () => {
  const { db, cleanup } = tmpDb();
  try {
    assert.equal(issueResetToken(db, 'nobody@example.com'), null);
  } finally { cleanup(); }
});

test('consumeResetToken is single-use', async () => {
  const { db, cleanup } = tmpDb();
  try {
    await seedUser(db);
    const token = issueResetToken(db, 'reset@example.com');
    const userId = consumeResetToken(db, token);
    assert.ok(userId);
    assert.throws(() => consumeResetToken(db, token), /already been used/);
  } finally { cleanup(); }
});

test('consumeResetToken rejects an expired token', async () => {
  const { db, cleanup } = tmpDb();
  try {
    await seedUser(db);
    const issuedAt = new Date('2026-01-01T00:00:00Z');
    const token = issueResetToken(db, 'reset@example.com', issuedAt);
    const later = new Date('2026-01-01T01:00:00Z'); // 1h later, lifetime is 30min
    assert.throws(() => consumeResetToken(db, token, later), /expired/);
  } finally { cleanup(); }
});

test('consumeResetToken rejects an unknown/tampered token', () => {
  const { db, cleanup } = tmpDb();
  try {
    assert.throws(() => consumeResetToken(db, 'not-a-real-token'), /Invalid or unknown/);
  } finally { cleanup(); }
});

test('HTTP /v1/auth/reset-password: valid token sets new password and revokes all sessions', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    try {
      await seedUser(db);
      const loginRes = await app.inject({
        method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN },
        payload: { email: 'reset@example.com', password: 'original password 12345' },
      });
      const cookie = loginRes.headers['set-cookie'].split(';')[0];
      const meBefore = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
      assert.equal(meBefore.statusCode, 200);

      const token = issueResetToken(db, 'reset@example.com');
      const resetRes = await app.inject({
        method: 'POST', url: '/v1/auth/reset-password', headers: { origin: TEST_ORIGIN },
        payload: { token, newPassword: 'brand new password 999' },
      });
      assert.equal(resetRes.statusCode, 200);

      const meAfter = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
      assert.equal(meAfter.statusCode, 401, 'existing session must be revoked by a password reset');

      const newLogin = await app.inject({
        method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN },
        payload: { email: 'reset@example.com', password: 'brand new password 999' },
      });
      assert.equal(newLogin.statusCode, 200);
    } finally { await app.close(); }
  } finally { cleanup(); }
});

test('HTTP /v1/auth/reset-password: invalid token returns a generic error, not password validation details', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    try {
      const res = await app.inject({
        method: 'POST', url: '/v1/auth/reset-password', headers: { origin: TEST_ORIGIN },
        payload: { token: 'bogus-token-value', newPassword: 'a perfectly valid new password' },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).error.code, 'INVALID_RESET_TOKEN');
    } finally { await app.close(); }
  } finally { cleanup(); }
});
