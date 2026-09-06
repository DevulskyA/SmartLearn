import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const VALID_PASSWORD = 'a genuinely long passphrase 99';
const TEST_ORIGIN = 'https://smartlearn.test';

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-authroutes-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function post(app, url, payload, extraHeaders = {}) {
  return app.inject({
    method: 'POST', url, payload,
    headers: { origin: TEST_ORIGIN, ...extraHeaders },
  });
}

function extractCookie(res) {
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw.split(';')[0]; // "name=value"
}

async function registerAndLogin(app, email = 'dan@example.com', password = VALID_PASSWORD) {
  await post(app, '/v1/auth/register', { email, password });
  const res = await post(app, '/v1/auth/login', { email, password });
  const cookie = extractCookie(res);
  const csrfToken = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
  return { cookie, csrfToken, loginRes: res };
}

test('register creates an account and returns a safe DTO', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const res = await post(app, '/v1/auth/register', { email: 'ana@example.com', password: VALID_PASSWORD });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.user.email, 'ana@example.com');
    assert.ok(!('passwordHash' in body.user));
    assert.doesNotMatch(res.body, new RegExp(VALID_PASSWORD));
  } finally { await app.close(); cleanup(); }
});

test('register rejects a too-short password with a field-specific error', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const res = await post(app, '/v1/auth/register', { email: 'bea@example.com', password: 'short' });
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.field, 'password');
  } finally { await app.close(); cleanup(); }
});

test('duplicate registration returns 409 EMAIL_CONFLICT, not a raw DB error', async () => {
  const { app, cleanup } = await freshApp();
  try {
    await post(app, '/v1/auth/register', { email: 'cid@example.com', password: VALID_PASSWORD });
    const res = await post(app, '/v1/auth/register', { email: 'cid@example.com', password: VALID_PASSWORD });
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'EMAIL_CONFLICT');
  } finally { await app.close(); cleanup(); }
});

test('login with correct credentials succeeds and sets a session cookie', async () => {
  const { app, cleanup } = await freshApp();
  try {
    await post(app, '/v1/auth/register', { email: 'dan@example.com', password: VALID_PASSWORD });
    const res = await post(app, '/v1/auth/login', { email: 'dan@example.com', password: VALID_PASSWORD });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).user.email, 'dan@example.com');
    assert.ok(res.headers['set-cookie'], 'expected a session cookie to be set');
    const cookieHeader = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'][0] : res.headers['set-cookie'];
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Lax/i);
  } finally { await app.close(); cleanup(); }
});

test('login with wrong password returns generic 401', async () => {
  const { app, cleanup } = await freshApp();
  try {
    await post(app, '/v1/auth/register', { email: 'eve@example.com', password: VALID_PASSWORD });
    const res = await post(app, '/v1/auth/login', { email: 'eve@example.com', password: 'wrong wrong wrong wrong' });
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, 'INVALID_CREDENTIALS');
  } finally { await app.close(); cleanup(); }
});

test('login for unknown account returns the SAME error code as wrong password (no enumeration)', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const res = await post(app, '/v1/auth/login', { email: 'never-registered@example.com', password: VALID_PASSWORD });
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, 'INVALID_CREDENTIALS');
  } finally { await app.close(); cleanup(); }
});

test('unknown-account and wrong-password login take comparable time (both pay one real scrypt cost)', async () => {
  const { app, cleanup } = await freshApp();
  try {
    await post(app, '/v1/auth/register', { email: 'flo@example.com', password: VALID_PASSWORD });

    const t1 = Date.now();
    await post(app, '/v1/auth/login', { email: 'flo@example.com', password: 'wrong wrong wrong wrong' });
    const wrongPasswordMs = Date.now() - t1;

    const t2 = Date.now();
    await post(app, '/v1/auth/login', { email: 'never-seen@example.com', password: VALID_PASSWORD });
    const unknownAccountMs = Date.now() - t2;

    assert.ok(wrongPasswordMs > 200, `expected a real scrypt hash (~200ms+), got ${wrongPasswordMs}ms`);
    assert.ok(unknownAccountMs > 200, `expected the decoy hash to pay the same cost (~200ms+), got ${unknownAccountMs}ms`);
  } finally { await app.close(); cleanup(); }
});

test('registration response never returns password hash or salt at any nesting level', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const res = await post(app, '/v1/auth/register', { email: 'gia@example.com', password: VALID_PASSWORD });
    assert.doesNotMatch(res.body, /password_hash|password_salt|passwordHash|passwordSalt/);
  } finally { await app.close(); cleanup(); }
});

test('AC-07: /v1/auth/me without a session cookie is denied 401', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    assert.equal(res.statusCode, 401);
  } finally { await app.close(); cleanup(); }
});

test('/v1/auth/me with a valid session cookie returns the user and a CSRF token', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie } = await registerAndLogin(app);
    const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.user.email, 'dan@example.com');
    assert.ok(body.csrfToken, 'expected a per-session CSRF token from bootstrap');
  } finally { await app.close(); cleanup(); }
});

test('AC-08: a mutating authenticated request without a matching CSRF token is rejected 403', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie } = await registerAndLogin(app);
    const res = await post(app, '/v1/auth/password', { currentPassword: VALID_PASSWORD, newPassword: 'another long passphrase 2' }, { cookie });
    assert.equal(res.statusCode, 403, 'missing/wrong X-CSRF-Token must be rejected even with a valid session cookie');
  } finally { await app.close(); cleanup(); }
});

test('password change with correct current password + valid CSRF token succeeds, revokes OTHER sessions only', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie: cookie1, csrfToken } = await registerAndLogin(app);
    // Second login = second session for the same account.
    const login2 = await post(app, '/v1/auth/login', { email: 'dan@example.com', password: VALID_PASSWORD });
    const cookie2 = extractCookie(login2);

    const newPassword = 'a brand new passphrase 2026';
    const changeRes = await post(app, '/v1/auth/password',
      { currentPassword: VALID_PASSWORD, newPassword },
      { cookie: cookie1, 'x-csrf-token': csrfToken });
    assert.equal(changeRes.statusCode, 200);

    // The session that made the change stays valid.
    const meAfter1 = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie: cookie1 } });
    assert.equal(meAfter1.statusCode, 200, 'the session that performed the password change must remain valid');

    // The OTHER session must be revoked.
    const meAfter2 = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie: cookie2 } });
    assert.equal(meAfter2.statusCode, 401, 'other sessions must be revoked by a password change');

    // New password logs in; old password no longer works.
    const loginNew = await post(app, '/v1/auth/login', { email: 'dan@example.com', password: newPassword });
    assert.equal(loginNew.statusCode, 200);
    const loginOld = await post(app, '/v1/auth/login', { email: 'dan@example.com', password: VALID_PASSWORD });
    assert.equal(loginOld.statusCode, 401);
  } finally { await app.close(); cleanup(); }
});

test('password change with wrong current password is rejected, session stays valid', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndLogin(app);
    const res = await post(app, '/v1/auth/password',
      { currentPassword: 'totally wrong current password', newPassword: 'a brand new passphrase xyz' },
      { cookie, 'x-csrf-token': csrfToken });
    assert.equal(res.statusCode, 401);
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    assert.equal(me.statusCode, 200, 'a failed password-change attempt must not revoke the current session');
  } finally { await app.close(); cleanup(); }
});

test('logout revokes the session — subsequent requests with the same cookie are denied', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndLogin(app);
    const logoutRes = await post(app, '/v1/auth/logout', {}, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(logoutRes.statusCode, 204);
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    assert.equal(me.statusCode, 401, 'a revoked session must not authenticate further requests');
  } finally { await app.close(); cleanup(); }
});

test('session cookie from account A does not authenticate as account B (cross-account isolation)', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie: cookieA } = await registerAndLogin(app, 'accountA@example.com');
    await post(app, '/v1/auth/register', { email: 'accountB@example.com', password: VALID_PASSWORD });
    const meA = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie: cookieA } });
    assert.equal(JSON.parse(meA.body).user.emailDisplay, 'accountA@example.com', 'session must resolve to its own owner, never another account');
  } finally { await app.close(); cleanup(); }
});
