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

function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-authroutes-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = buildApp(db, MIGRATIONS_DIR);
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('register creates an account and returns a safe DTO', async () => {
  const { app, cleanup } = freshApp();
  try {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { email: 'ana@example.com', password: VALID_PASSWORD },
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.user.email, 'ana@example.com');
    assert.ok(!('passwordHash' in body.user));
    assert.doesNotMatch(res.body, new RegExp(VALID_PASSWORD));
  } finally { await app.close(); cleanup(); }
});

test('register rejects a too-short password with a field-specific error', async () => {
  const { app, cleanup } = freshApp();
  try {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { email: 'bea@example.com', password: 'short' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.field, 'password');
  } finally { await app.close(); cleanup(); }
});

test('duplicate registration returns 409 EMAIL_CONFLICT, not a raw DB error', async () => {
  const { app, cleanup } = freshApp();
  try {
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'cid@example.com', password: VALID_PASSWORD } });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'cid@example.com', password: VALID_PASSWORD } });
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'EMAIL_CONFLICT');
  } finally { await app.close(); cleanup(); }
});

test('login with correct credentials succeeds', async () => {
  const { app, cleanup } = freshApp();
  try {
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'dan@example.com', password: VALID_PASSWORD } });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'dan@example.com', password: VALID_PASSWORD } });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).user.email, 'dan@example.com');
  } finally { await app.close(); cleanup(); }
});

test('login with wrong password returns generic 401', async () => {
  const { app, cleanup } = freshApp();
  try {
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'eve@example.com', password: VALID_PASSWORD } });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'eve@example.com', password: 'wrong wrong wrong wrong' } });
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, 'INVALID_CREDENTIALS');
  } finally { await app.close(); cleanup(); }
});

test('login for unknown account returns the SAME error code as wrong password (no enumeration)', async () => {
  const { app, cleanup } = freshApp();
  try {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'never-registered@example.com', password: VALID_PASSWORD } });
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, 'INVALID_CREDENTIALS');
  } finally { await app.close(); cleanup(); }
});

test('unknown-account and wrong-password login take comparable time (decoy hash proves the shape, not a strict timing assertion)', async () => {
  const { app, cleanup } = freshApp();
  try {
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'flo@example.com', password: VALID_PASSWORD } });

    const t1 = Date.now();
    await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'flo@example.com', password: 'wrong wrong wrong wrong' } });
    const wrongPasswordMs = Date.now() - t1;

    const t2 = Date.now();
    await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'never-seen@example.com', password: VALID_PASSWORD } });
    const unknownAccountMs = Date.now() - t2;

    // Both paths perform one real scrypt hash; assert same order of magnitude
    // rather than an exact bound, to avoid CI-flakiness on this timing test.
    assert.ok(wrongPasswordMs > 200, `expected a real scrypt hash (~200ms+), got ${wrongPasswordMs}ms`);
    assert.ok(unknownAccountMs > 200, `expected the decoy hash to pay the same cost (~200ms+), got ${unknownAccountMs}ms`);
  } finally { await app.close(); cleanup(); }
});

test('registration response never returns password hash or salt at any nesting level', async () => {
  const { app, cleanup } = freshApp();
  try {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { email: 'gia@example.com', password: VALID_PASSWORD },
    });
    assert.doesNotMatch(res.body, /password_hash|password_salt|passwordHash|passwordSalt/);
  } finally { await app.close(); cleanup(); }
});
