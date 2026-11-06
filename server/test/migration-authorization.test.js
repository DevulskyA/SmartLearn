import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, readdirSync, copyFileSync, writeFileSync, existsSync, statSync, mkdirSync, symlinkSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/migrations.js';
import { isDevDatastoreDb } from '../src/dev-datastore.js';
import { parseAuthorizedVersions, checkMigrationAuthorization, assertMigrationAuthorizedForPath, AUTHORIZE_ENV } from '../src/migration-authorization.js';

test('only a plain list of positive integers authorizes anything', () => {
  assert.deepEqual([...parseAuthorizedVersions('35, 36')], [35, 36]);
  for (const bad of [undefined, '', '  ', 'all', '*', '35;36', '35,', '0', '-1', '35.5', 'v35']) {
    assert.equal(parseAuthorizedVersions(bad).size, 0, `${JSON.stringify(bad)} must authorize nothing`);
  }
});

test('a database with no history, or with nothing pending, needs no authorization', () => {
  assert.equal(checkMigrationAuthorization({ fromVersion: 0, pending: [1, 2, 3] }, {}).ok, true);
  assert.equal(checkMigrationAuthorization({ fromVersion: 38, pending: [] }, {}).ok, true);
});

test('pending migrations on a database with history are refused unless EVERY pending version is authorized', () => {
  const refused = checkMigrationAuthorization({ fromVersion: 38, pending: [39, 40] }, {});
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.unauthorized, [39, 40]);
  assert.match(refused.message, /Nothing was changed/);
  assert.equal(checkMigrationAuthorization({ fromVersion: 38, pending: [39, 40] }, { [AUTHORIZE_ENV]: '39' }).ok, false);
  assert.equal(checkMigrationAuthorization({ fromVersion: 38, pending: [39, 40] }, { [AUTHORIZE_ENV]: '39,40' }).ok, true);
  assert.equal(checkMigrationAuthorization({ fromVersion: 38, pending: [39] }, { [AUTHORIZE_ENV]: '39,40' }).ok, true);
});

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// A DEV datastore (in a temp dir) whose newest migration is "pending" again. `wal` = false leaves it in rollback-journal mode, the case
// where opening it with openDb (journal_mode = WAL) would rewrite the header.
function devDatastoreWithPendingNewest(dir, { wal }) {
  const dbPath = join(dir, 'smartlearn-dev.db');
  const db = new Database(dbPath);
  if (wal) db.pragma('journal_mode = WAL');
  runMigrations(db);
  const newest = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
  db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(newest);
  db.close();
  return { dbPath, newest };
}

test('assertMigrationAuthorizedForPath guards the DEV datastore only, and a refusal leaves the database file byte-identical (WAL or not)', () => {
  for (const wal of [true, false]) {
    const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
    try {
      const { dbPath, newest } = devDatastoreWithPendingNewest(dir, { wal });
      const env = { SMARTLEARN_DEV_DATA_DIR: dir };
      const before = sha256(dbPath);
      assert.throws(() => assertMigrationAuthorizedForPath(dbPath, env), /not authorized/);
      assert.equal(sha256(dbPath), before, `wal=${wal}: refusing must not write to the database file`);
      // SQLite itself creates EMPTY -wal/-shm sidecars for any reader of a WAL database; no content may ever be in them
      assert.ok(readdirSync(dir).every((name) => name === 'smartlearn-dev.db' || /-(wal|shm)$/.test(name)), `wal=${wal}: no other file appears`);
      const walFile = `${dbPath}-wal`;
      assert.ok(!existsSync(walFile) || statSync(walFile).size === 0, `wal=${wal}: the write-ahead log holds nothing`);
      const check = new Database(dbPath, { readonly: true });
      assert.equal(check.pragma('journal_mode', { simple: true }), wal ? 'wal' : 'delete', 'the journal mode was not switched');
      check.close();
      // the pending version, and only it, is what authorization names
      assert.doesNotThrow(() => assertMigrationAuthorizedForPath(dbPath, { ...env, [AUTHORIZE_ENV]: String(newest) }));
      assert.throws(() => assertMigrationAuthorizedForPath(dbPath, { ...env, [AUTHORIZE_ENV]: String(newest + 1) }), /not authorized/);
      // any other database (tests, e2e, scratch copies) is not guarded
      const other = join(dir, 'other.db');
      copyFileSync(dbPath, other);
      assert.doesNotThrow(() => assertMigrationAuthorizedForPath(other, env));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the DEV datastore is recognised through a junction/symlink and through 8.3 or different-case spellings, so the gate cannot be walked around', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
  try {
    const dataDir = join(dir, 'DevData');
    mkdirSync(dataDir);
    const { dbPath } = devDatastoreWithPendingNewest(dataDir, { wal: true });
    const link = join(dir, 'alias');
    symlinkSync(dataDir, link, 'junction');
    const env = { SMARTLEARN_DEV_DATA_DIR: dataDir };
    assert.equal(isDevDatastoreDb(join(link, 'smartlearn-dev.db'), env), true, 'a junction to the datastore is the datastore');
    assert.throws(() => assertMigrationAuthorizedForPath(join(link, 'smartlearn-dev.db'), env), /not authorized/);
    if (process.platform === 'win32') { // the Windows file system ignores case; others do not
      assert.throws(() => assertMigrationAuthorizedForPath(dbPath.toUpperCase().replace(dir.toUpperCase(), dir), env), /not authorized/);
    }
    // and the datastore pointed at THROUGH the alias guards the real file as well
    assert.throws(() => assertMigrationAuthorizedForPath(dbPath, { SMARTLEARN_DEV_DATA_DIR: link }), /not authorized/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the DEV database is recognised through a hard link or a symlink to the FILE itself, not only through its folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
  try {
    const dataDir = join(dir, 'DevData');
    mkdirSync(dataDir);
    const { dbPath } = devDatastoreWithPendingNewest(dataDir, { wal: true });
    const env = { SMARTLEARN_DEV_DATA_DIR: dataDir };
    const hard = join(dir, 'hard.db');
    linkSync(dbPath, hard); // another name for the same file (no privilege needed)
    assert.equal(isDevDatastoreDb(hard, env), true, 'a hard link is the same database');
    assert.throws(() => assertMigrationAuthorizedForPath(hard, env), /not authorized/);
    const sym = join(dir, 'sym.db');
    let symlinked = true;
    try { symlinkSync(dbPath, sym, 'file'); } catch (err) { if (err.code === 'EPERM') symlinked = false; else throw err; } // Windows needs a privilege for file symlinks
    if (symlinked) {
      assert.equal(isDevDatastoreDb(sym, env), true, 'a symlink to the database file is the database');
      assert.throws(() => assertMigrationAuthorizedForPath(sym, env), /not authorized/);
    }
    // a different database that merely sits next to it is not the DEV database
    const sibling = join(dataDir, 'other.db');
    copyFileSync(dbPath, sibling);
    assert.equal(isDevDatastoreDb(sibling, env), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an EXISTING DEV database with tables but no migration history is refused (never treated as new); a new, empty or header-only file is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
  try {
    const dbPath = join(dir, 'smartlearn-dev.db');
    const env = { SMARTLEARN_DEV_DATA_DIR: dir };
    // a database somebody already filled, with no schema_migrations table at all
    let db = new Database(dbPath);
    db.exec("CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO subjects (name) VALUES ('Farmacologia')");
    db.close();
    const before = sha256(dbPath);
    assert.throws(() => assertMigrationAuthorizedForPath(dbPath, env), /no migration history/);
    assert.throws(() => assertMigrationAuthorizedForPath(dbPath, { ...env, [AUTHORIZE_ENV]: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38' }), /no migration history/, 'no authorization list opens this door');
    assert.equal(sha256(dbPath), before, 'refusing changes nothing');
    // history table present but empty, with other tables: same thing
    db = new Database(dbPath);
    db.exec('CREATE TABLE schema_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
    db.close();
    assert.throws(() => assertMigrationAuthorizedForPath(dbPath, env), /no migration history/);
    // a file that does not exist yet, an empty file, and a header-only WAL database (a crash between openDb and the first migration) are new
    assert.doesNotThrow(() => assertMigrationAuthorizedForPath(join(dir, 'smartlearn-dev.db.missing'), env));
    rmSync(dbPath);
    writeFileSync(dbPath, '');
    assert.doesNotThrow(() => assertMigrationAuthorizedForPath(dbPath, env));
    rmSync(dbPath);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.close();
    assert.doesNotThrow(() => assertMigrationAuthorizedForPath(dbPath, env));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a DEV database that cannot be inspected read-only is refused (fail closed), not migrated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
  try {
    const dbPath = join(dir, 'smartlearn-dev.db');
    writeFileSync(dbPath, 'this is not a sqlite database, but it is long enough to be read as one header '.repeat(20));
    assert.throws(() => assertMigrationAuthorizedForPath(dbPath, { SMARTLEARN_DEV_DATA_DIR: dir }), /could not be inspected read-only/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
