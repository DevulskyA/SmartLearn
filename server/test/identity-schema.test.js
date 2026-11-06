import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as users from '../src/repositories/users.js';
import * as sessions from '../src/repositories/sessions.js';

const REAL_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// maxRetries/retryDelay: on Windows, a just-closed SQLite file handle (WAL
// mode, opened/closed more than once in the same test) is not always
// released instantly — rmSync's built-in retry avoids a flaky EPERM/EBUSY
// that has nothing to do with product correctness.
const RM_OPTS = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-identity-'));
  return { dir, path: join(dir, 'test.db'), cleanup: () => rmSync(dir, RM_OPTS) };
}

function tmpMigDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-identity-migs-'));
  return { dir, cleanup: () => rmSync(dir, RM_OPTS) };
}

function freshDb() {
  const { path, cleanup } = tmpDb();
  const db = openDb(path);
  runMigrations(db, REAL_MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); cleanup(); } };
}

test('002-identity creates users and sessions tables', () => {
  const { db, cleanup } = freshDb();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions')").all();
    assert.deepEqual(tables.map(t => t.name).sort(), ['sessions', 'users']);
  } finally { cleanup(); }
});

test('002-identity applies idempotently on rerun (no duplicate row)', () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db, REAL_MIGRATIONS_DIR); // second run, same dir
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations WHERE version = 2').get();
    assert.equal(n, 1);
  } finally { cleanup(); }
});

test('applies cleanly on top of an existing 001-only foundation database (upgrade path)', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db1 = openDb(path);
    // Simulate the pre-T08 foundation: only 001-bootstrap applied. Must be
    // byte-identical to the real file, or runMigrations correctly (by
    // design) throws a checksum mismatch when db2 later reads the real
    // migrations dir — that's the checksum-tamper guard working, not a bug.
    const realBootstrapContent = readFileSync(join(REAL_MIGRATIONS_DIR, '001-bootstrap.sql'), 'utf8');
    const { dir: mDir, cleanup: cleanupM } = tmpMigDir();
    try {
      writeFileSync(join(mDir, '001-bootstrap.sql'), realBootstrapContent);
      runMigrations(db1, mDir);
    } finally { cleanupM(); }
    db1.pragma('wal_checkpoint(TRUNCATE)');
    db1.close();

    const db2 = openDb(path);
    runMigrations(db2, REAL_MIGRATIONS_DIR); // now apply through 002 on the same file
    const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    assert.equal(tables.length, 1, 'users table must exist after upgrading an existing foundation database');
    db2.pragma('wal_checkpoint(TRUNCATE)');
    db2.close();
  } finally { cleanup(); }
});

test('broken migration in the identity range rolls back fully', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = tmpMigDir();
  try {
    writeFileSync(join(mDir, '001-bootstrap.sql'), 'CREATE TABLE IF NOT EXISTS server_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);\n');
    writeFileSync(join(mDir, '002-broken.sql'), 'CREATE TABLE broken_users (id INTEGER PRIMARY KEY);\nINSERT INTO nonexistent_xyz (v) VALUES (1);\n');
    const db = openDb(path);
    assert.throws(() => runMigrations(db, mDir));
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='broken_users'").get();
    assert.equal(table, undefined, 'partial table from the broken migration must not exist');
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    assert.equal(n, 1, 'only 001 recorded; broken 002 must not be recorded');
    db.close();
  } finally { cleanupDb(); cleanupM(); }
});

test('duplicate email is rejected with a stable conflict code, not a raw SQL error', () => {
  const { db, cleanup } = freshDb();
  try {
    users.createUser(db, {
      email: 'ana@example.com', emailDisplay: 'Ana@Example.com',
      passwordHash: 'h1', passwordSalt: 's1', passwordAlgorithm: 'scrypt', passwordParams: '{}',
    });
    assert.throws(
      () => users.createUser(db, {
        email: 'ana@example.com', emailDisplay: 'ANA@EXAMPLE.COM',
        passwordHash: 'h2', passwordSalt: 's2', passwordAlgorithm: 'scrypt', passwordParams: '{}',
      }),
      (err) => err.code === 'EMAIL_CONFLICT'
    );
  } finally { cleanup(); }
});

test('session cannot reference a missing user (FK enforced)', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.throws(
      () => sessions.createSession(db, { tokenHash: 'abc', userId: 999999, issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z' }),
      (err) => err.code === 'INVALID_USER'
    );
  } finally { cleanup(); }
});

test('safe user DTO never exposes password hash/salt/params', () => {
  const { db, cleanup } = freshDb();
  try {
    const user = users.createUser(db, {
      email: 'bea@example.com', emailDisplay: 'Bea@Example.com',
      passwordHash: 'super-secret-hash', passwordSalt: 'super-secret-salt', passwordAlgorithm: 'scrypt', passwordParams: '{"N":131072}',
    });
    const serialized = JSON.stringify(user);
    assert.doesNotMatch(serialized, /super-secret/);
    assert.ok(!('passwordHash' in user));
    assert.ok(!('password_hash' in user));
  } finally { cleanup(); }
});

test('WAL, foreign_keys and synchronous=FULL are active on identity databases (T08 durability upgrade)', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.pragma('synchronous', { simple: true }), 2); // FULL = 2 in SQLite's pragma encoding (OFF=0, NORMAL=1, FULL=2)
  } finally { cleanup(); }
});

test('session persists and can be found active by token hash, then revoked', () => {
  const { db, cleanup } = freshDb();
  try {
    const user = users.createUser(db, {
      email: 'cid@example.com', emailDisplay: 'Cid@Example.com',
      passwordHash: 'h', passwordSalt: 's', passwordAlgorithm: 'scrypt', passwordParams: '{}',
    });
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const session = sessions.createSession(db, { tokenHash: 'tok-hash-1', userId: user.id, issuedAt: now, expiresAt: future });
    assert.equal(session.userId, user.id);

    const found = sessions.findActiveByTokenHash(db, 'tok-hash-1', now);
    assert.ok(found);
    assert.equal(found.id, session.id);

    sessions.revoke(db, session.id);
    const afterRevoke = sessions.findActiveByTokenHash(db, 'tok-hash-1', now);
    assert.equal(afterRevoke, null);
  } finally { cleanup(); }
});
