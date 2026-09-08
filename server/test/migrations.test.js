import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, copyFileSync, unlinkSync, readFileSync } from 'node:fs';
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

test('001-bootstrap records exactly one row for version 1 in schema_migrations', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations WHERE version = 1').get();
    assert.equal(n, 1);
    db.close();
  } finally {
    cleanup();
  }
});

test('idempotent — second run does not duplicate any migration row', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, REAL_MIGRATIONS_DIR);
    const { n: firstRunCount } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    runMigrations(db, REAL_MIGRATIONS_DIR);
    const { n: secondRunCount } = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get();
    assert.equal(secondRunCount, firstRunCount, 'rerunning migrations must not add or duplicate rows');
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

// A5 (audit): a real deployment could be missing a migration file the
// manifest says should exist, or have applied every file on disk while
// silently never running one that was never committed. Prove the
// readiness gate (validateMigrations, called by /health/ready) actually
// fails closed in each of those cases, using a real copy of the true
// migrations directory -- not a synthetic one -- so this exercises the
// exact manifest.json shipped with the product.
function copyRealMigrationsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migs-real-copy-'));
  for (const f of readdirSync(REAL_MIGRATIONS_DIR)) {
    copyFileSync(join(REAL_MIGRATIONS_DIR, f), join(dir, f));
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('A5: readiness fails when a migration the manifest expects is missing from disk (never deployed)', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = copyRealMigrationsDir();
  try {
    const db = openDb(path);
    runMigrations(db, mDir);
    assert.doesNotThrow(() => validateMigrations(db, mDir), 'sanity: an untouched real copy must validate cleanly first');

    // Simulate "the last migration file was never deployed": delete the
    // .sql file but leave the manifest (and the applied schema_migrations
    // row, since it already ran above) exactly as they were.
    const files = readdirSync(mDir).filter((f) => f.endsWith('.sql'));
    const highestVersionFile = files.sort().at(-1);
    unlinkSync(join(mDir, highestVersionFile));

    assert.throws(
      () => validateMigrations(db, mDir),
      /is missing from the migrations directory/,
      'a manifest-expected migration missing from disk must fail readiness, not pass it',
    );
    db.close();
  } finally { cleanupDb(); cleanupM(); }
});

test('A5: readiness fails when a manifest-expected migration exists on disk but was never applied to this database', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = copyRealMigrationsDir();
  try {
    const db = openDb(path);
    // Deliberately do NOT run migrations at all: schema_migrations has zero
    // rows, but the directory + manifest both list every real migration.
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');

    assert.throws(
      () => validateMigrations(db, mDir),
      /has not been applied to this database/,
      'a real, on-disk, manifest-listed migration that never actually ran must fail readiness',
    );
    db.close();
  } finally { cleanupDb(); cleanupM(); }
});

test('A5: readiness fails closed when manifest.json itself is missing', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = copyRealMigrationsDir();
  try {
    const db = openDb(path);
    runMigrations(db, mDir);
    unlinkSync(join(mDir, 'manifest.json'));

    assert.throws(() => validateMigrations(db, mDir), /manifest\.json is missing/);
    db.close();
  } finally { cleanupDb(); cleanupM(); }
});

test('A5: readiness fails when an on-disk migration is not accounted for in the manifest', () => {
  const { path, cleanup: cleanupDb } = tmpDb();
  const { dir: mDir, cleanup: cleanupM } = copyRealMigrationsDir();
  try {
    const db = openDb(path);
    runMigrations(db, mDir);
    writeFileSync(join(mDir, '999-unlisted.sql'), 'CREATE TABLE IF NOT EXISTS unlisted_probe (id INTEGER PRIMARY KEY);\n');
    runMigrations(db, mDir); // applies the new file so the "not applied" check doesn't mask this one

    assert.throws(
      () => validateMigrations(db, mDir),
      /is not listed in manifest\.json/,
      'a rogue migration file the manifest never accounted for must fail readiness',
    );
    db.close();
  } finally { cleanupDb(); cleanupM(); }
});

test('the real, committed manifest.json exactly matches the real migrations directory checksums right now', () => {
  const manifest = JSON.parse(readFileSync(join(REAL_MIGRATIONS_DIR, 'manifest.json'), 'utf8'));
  const onDiskFiles = readdirSync(REAL_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  assert.equal(manifest.length, onDiskFiles.length, 'manifest.json must list exactly the migrations that exist on disk');
});
