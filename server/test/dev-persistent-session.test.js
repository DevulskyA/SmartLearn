import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import {
  resolveSessionPolicy, SESSION_ABSOLUTE_LIFETIME_MS, SESSION_INACTIVITY_LIFETIME_MS, DEV_SESSION_LIFETIME_MS,
} from '../src/auth/session-tokens.js';

// DEV PERSISTENT SESSION: the human Desktop DEV (launcher sets SMARTLEARN_DEV_PERSISTENT_SESSION=true) stays signed in until an
// explicit "Sair". The same auth mechanism, only a longer policy, never available in production.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'http://localhost:5173';
const CREDS = { email: 'dev-session@example.com', password: 'a genuinely long test password 1' };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-devsession-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, path, dir, cleanup: () => { try { db.close(); } catch { /* already closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

const cookieOf = (res) => {
  const header = [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sl_session_dev='));
  return header ?? null;
};
const cookieHeader = (setCookie) => setCookie.split(';')[0];

async function register(app) {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: CREDS });
  assert.ok([200, 201].includes(res.statusCode), `register ${res.statusCode}`);
}
async function login(app) {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: CREDS });
  assert.equal(res.statusCode, 200);
  return res;
}
const me = (app, cookie) => app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });

test('policy: production defaults are unchanged and the dev flag is refused in production', () => {
  assert.deepEqual(resolveSessionPolicy({ isProduction: true }), { absoluteMs: SESSION_ABSOLUTE_LIFETIME_MS, inactivityMs: SESSION_INACTIVITY_LIFETIME_MS, cookieMaxAgeSeconds: null });
  assert.deepEqual(resolveSessionPolicy({ isProduction: false }), { absoluteMs: SESSION_ABSOLUTE_LIFETIME_MS, inactivityMs: SESSION_INACTIVITY_LIFETIME_MS, cookieMaxAgeSeconds: null });
  assert.throws(() => resolveSessionPolicy({ isProduction: true, devPersistent: true }), /production/i);
  const dev = resolveSessionPolicy({ isProduction: false, devPersistent: true });
  assert.equal(dev.absoluteMs, DEV_SESSION_LIFETIME_MS);
  assert.equal(dev.inactivityMs, DEV_SESSION_LIFETIME_MS);
  assert.equal(dev.cookieMaxAgeSeconds, DEV_SESSION_LIFETIME_MS / 1000);
});

test('buildApp refuses to start in production with the dev persistent session enabled', async () => {
  const { db, cleanup } = tmpDb();
  try {
    await assert.rejects(() => buildApp(db, MIGRATIONS_DIR, { isProduction: true, allowedOrigins: [ORIGIN], devPersistentSession: true }), /production/i);
  } finally { cleanup(); }
});

test('WITHOUT the flag: the session cookie is a browser-session cookie (no Max-Age) and the row expires in 30 days', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN] });
    await register(app);
    const res = await login(app);
    const set = cookieOf(res);
    assert.ok(set, 'a session cookie is issued');
    assert.doesNotMatch(set, /Max-Age|Expires/i);
    const row = db.prepare('SELECT issued_at, expires_at FROM sessions ORDER BY id DESC LIMIT 1').get();
    const span = new Date(row.expires_at) - new Date(row.issued_at);
    assert.ok(Math.abs(span - SESSION_ABSOLUTE_LIFETIME_MS) < 5000);
    await app.close();
  } finally { cleanup(); }
});

test('WITH the flag: the cookie is persistent and the row lives ~10 years; login -> restart -> still signed in -> again', async () => {
  const { db, path, dir, cleanup } = tmpDb();
  try {
    let app = await buildApp(db, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN], devPersistentSession: true });
    await register(app);
    const set = cookieOf(await login(app));
    assert.match(set, new RegExp(`Max-Age=${DEV_SESSION_LIFETIME_MS / 1000}`));
    const row = db.prepare('SELECT issued_at, expires_at FROM sessions ORDER BY id DESC LIMIT 1').get();
    assert.ok(new Date(row.expires_at) - new Date(row.issued_at) > 9 * 365 * 24 * 3600 * 1000);
    const cookie = cookieHeader(set);
    assert.equal((await me(app, cookie)).statusCode, 200);
    // "close the app": the server process goes away and a NEW one opens the same database
    await app.close();
    db.close();
    const db2 = openDb(path);
    runMigrations(db2, MIGRATIONS_DIR);
    app = await buildApp(db2, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN], devPersistentSession: true });
    assert.equal((await me(app, cookie)).statusCode, 200, 'still signed in after restart');
    assert.equal((await me(app, cookie)).statusCode, 200, 'and again');
    await app.close();
    db2.close();
  } finally { cleanup(); }
});

test('a session idle for 8 days survives with the flag and is revoked without it (the inactivity window is the discriminator)', async () => {
  for (const devPersistentSession of [true, false]) {
    const { db, cleanup } = tmpDb();
    try {
      const app = await buildApp(db, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN], devPersistentSession });
      await register(app);
      const cookie = cookieHeader(cookieOf(await login(app)));
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
      db.prepare('UPDATE sessions SET last_seen = ?').run(eightDaysAgo);
      assert.equal((await me(app, cookie)).statusCode, devPersistentSession ? 200 : 401);
      await app.close();
    } finally { cleanup(); }
  }
});

test('explicit logout invalidates the persisted session; reopening needs a login; a new login persists again', async () => {
  const { db, path, cleanup } = tmpDb();
  try {
    let app = await buildApp(db, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN], devPersistentSession: true });
    await register(app);
    const first = cookieHeader(cookieOf(await login(app)));
    const csrf = (await me(app, first)).json().csrfToken;
    const out = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { cookie: first, origin: ORIGIN, 'x-csrf-token': csrf } });
    assert.equal(out.statusCode, 204);
    assert.match([].concat(out.headers['set-cookie'] ?? []).join(';'), /sl_session_dev=;/, 'the cookie is cleared');
    assert.equal((await me(app, first)).statusCode, 401, 'the old token is dead server-side');
    await app.close();
    db.close();
    const db2 = openDb(path);
    runMigrations(db2, MIGRATIONS_DIR);
    app = await buildApp(db2, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN], devPersistentSession: true });
    assert.equal((await me(app, first)).statusCode, 401, 'after reopening the old session is still dead');
    const second = cookieHeader(cookieOf(await login(app)));
    assert.equal((await me(app, second)).statusCode, 200);
    assert.notEqual(second, first);
    await app.close();
    db2.close();
  } finally { cleanup(); }
});
