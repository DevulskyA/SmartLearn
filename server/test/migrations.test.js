import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations, validateMigrations } from '../src/migrations.js';

const REAL_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-mig-'));
  return { dir, path: join(dir, 'test.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function tmpMigDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migs-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('001-bootstrap creates server_meta', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='server_meta'").get();
    assert.ok(tbl, 'server_meta table missing');
    db.close();
  } finally {
    cleanup();
  }
});

test('001-bootstrap records one row in schema_migrations', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    assert.equal(n, 1);
    db.close();
  } finally {
    cleanup();
  }
});

test('idempotent — second run does not duplicate rows', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    assert.equal(n, 1);
    db.close();
  } finally {
    cleanup();
  }
});

test('checksum mismatch on applied migration throws', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = tmpMigDir();
  try {
    const original = 'CREATE TABLE IF NOT EXISTS chk_test (id INTEGER PRIMARY KEY);\n';
    writeFileSync(join(mDir, '001-chk.sql'), original);

    const db = openDb(path);
    runMigrations(db, mDir);
    db.close();

    // Tamper the file after first apply
    writeFileSync(join(mDir, '001-chk.sql'), original + '-- tampered\n');

    const db2 = openDb(path);
    assert.throws(
      () => runMigrations(db2, mDir),
      (err) => err instanceof Error && /checksum mismatch/i.test(err.message)
    );
    db2.close();
  } finally {
    cleanupDb();
    cleanupM();
  }
});

test('broken migration rolls back — no row in schema_migrations', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = tmpMigDir();
  try {
    writeFileSync(join(mDir, '001-bad.sql'), 'INSERT INTO nonexistent_table_xyz (v) VALUES (1);\n');

    const db = openDb(path);
    assert.throws(() => runMigrations(db, mDir));

    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    assert.equal(n, 0, 'schema_migrations should be empty after rollback');
    db.close();
  } finally {
    cleanupDb();
    cleanupM();
  }
});

test('broken migration is fully atomic — no partial table created', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = tmpMigDir();
  try {
    // Two statements: first creates a table (would persist without transaction),
    // second fails. Without db.transaction() the partial CREATE would survive.
    writeFileSync(
      join(mDir, '001-partial.sql'),
      'CREATE TABLE partial_rollback_probe (id INTEGER PRIMARY KEY);\nINSERT INTO nonexistent_xyz (v) VALUES (1);\n'
    );

    const db = openDb(path);
    assert.throws(() => runMigrations(db, mDir));

    const tbl = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='partial_rollback_probe'"
    ).get();
    assert.equal(tbl, undefined, 'partial table must not exist after rollback');

    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    assert.equal(n, 0, 'schema_migrations must be empty after rollback');
    db.close();
  } finally {
    cleanupDb();
    cleanupM();
  }
});

test('validateMigrations passes after correct apply', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    assert.doesNotThrow(() => validateMigrations(db, REAL_MIGRATIONS_DIR));
    db.close();
  } finally {
    cleanup();
  }
});
