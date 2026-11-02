import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, readdirSync, copyFileSync, writeFileSync, existsSync, statSync, mkdirSync, symlinkSync } from 'node:fs';
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

test('a DEV database that cannot be inspected read-only is refused (fail closed), not migrated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
  try {
    const dbPath = join(dir, 'smartlearn-dev.db');
    writeFileSync(dbPath, 'this is not a sqlite database, but it is long enough to be read as one header '.repeat(20));
    assert.throws(() => assertMigrationAuthorizedForPath(dbPath, { SMARTLEARN_DEV_DATA_DIR: dir }), /could not be inspected read-only/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
