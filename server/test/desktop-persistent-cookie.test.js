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
  resolveSessionPolicy, SESSION_ABSOLUTE_LIFETIME_MS, SESSION_INACTIVITY_LIFETIME_MS,
} from '../src/auth/session-tokens.js';

// The packaged Desktop runs a LOOPBACK, non-production backend (src-tauri/src/lib.rs deliberately does not set NODE_ENV=production)
// and does not set SMARTLEARN_DEV_PERSISTENT_SESSION. A cookie without Max-Age is a session cookie: WebView2 drops it when the
// app closes, so the owner had to sign in at every launch even though the server-side session was still valid for 30 days.
// Rule under test: the loopback server bounds the cookie by the SAME absolute lifetime as the server row (never longer), keeping
// HttpOnly/SameSite and the 7-day inactivity window; HTTPS production keeps its browser-session cookie.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'http://localhost:5173';
const CREDS = { email: 'desktop-cookie@example.com', password: 'a genuinely long test password 1' };
const ABSOLUTE_SECONDS = SESSION_ABSOLUTE_LIFETIME_MS / 1000;

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-desktopcookie-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, path, cleanup: () => { try { db.close(); } catch { /* already closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

const sessionSetCookie = (res) => [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sl_session_dev=')) ?? null;
const cookieHeader = (setCookie) => setCookie.split(';')[0];
const me = (app, cookie) => app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });

async function registerAndLogin(app) {
  const reg = await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: CREDS });
  assert.ok([200, 201].includes(reg.statusCode), `register ${reg.statusCode}`);
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: CREDS });
  assert.equal(res.statusCode, 200);
  return res;
}

test('policy: loopback (non-production) gets a persistent cookie bounded by the absolute lifetime; HTTPS production stays a session cookie', () => {
  assert.deepEqual(resolveSessionPolicy({ isProduction: false }), {
    absoluteMs: SESSION_ABSOLUTE_LIFETIME_MS, inactivityMs: SESSION_INACTIVITY_LIFETIME_MS, cookieMaxAgeSeconds: ABSOLUTE_SECONDS,
  });
  assert.deepEqual(resolveSessionPolicy({ isProduction: true }), {
    absoluteMs: SESSION_ABSOLUTE_LIFETIME_MS, inactivityMs: SESSION_INACTIVITY_LIFETIME_MS, cookieMaxAgeSeconds: null,
  });
});

test('Desktop (loopback, no dev flag): login issues Max-Age = absolute lifetime, HttpOnly, SameSite=Lax; survives a backend restart', async () => {
  const { db, path, cleanup } = tmpDb();
  try {
    let app = await buildApp(db, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN] });
    const set = sessionSetCookie(await registerAndLogin(app));
    assert.ok(set, 'a session cookie is issued');
    assert.match(set, new RegExp(`Max-Age=${ABSOLUTE_SECONDS}(;|$)`), 'persistent: survives the WebView2 closing');
    assert.match(set, /HttpOnly/i);
    assert.match(set, /SameSite=Lax/i);
    const row = db.prepare('SELECT issued_at, expires_at FROM sessions ORDER BY id DESC LIMIT 1').get();
    assert.ok(Math.abs((new Date(row.expires_at) - new Date(row.issued_at)) - SESSION_ABSOLUTE_LIFETIME_MS) < 5000, 'row keeps the 30-day absolute lifetime');
    const cookie = cookieHeader(set);
    assert.equal((await me(app, cookie)).statusCode, 200);
    await app.close();
    db.close();
    // "close the app": a new backend process opens the same database and the same cookie is presented
    const db2 = openDb(path);
    runMigrations(db2, MIGRATIONS_DIR);
    app = await buildApp(db2, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN] });
    assert.equal((await me(app, cookie)).statusCode, 200, 'still signed in after restart');
    await app.close();
    db2.close();
  } finally { cleanup(); }
});

test('Desktop persistent cookie does not weaken server policy: idle > 7 days and absolute > 30 days are still rejected', async () => {
  const day = 24 * 3600 * 1000;
  for (const [column, ageDays] of [['last_seen', 8], ['expires_at', 1]]) {
    const { db, cleanup } = tmpDb();
    try {
      const app = await buildApp(db, MIGRATIONS_DIR, { allowedOrigins: [ORIGIN] });
      const cookie = cookieHeader(sessionSetCookie(await registerAndLogin(app)));
      db.prepare(`UPDATE sessions SET ${column} = ?`).run(new Date(Date.now() - ageDays * day).toISOString());
      assert.equal((await me(app, cookie)).statusCode, 401, `${column} past policy -> signed out`);
      await app.close();
    } finally { cleanup(); }
  }
});
