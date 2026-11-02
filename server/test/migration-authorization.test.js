import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/migrations.js';
import { parseAuthorizedVersions, checkMigrationAuthorization, assertMigrationAuthorized, AUTHORIZE_ENV } from '../src/migration-authorization.js';

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

test('assertMigrationAuthorized guards the DEV datastore only, and leaves the database untouched when it refuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-migauth-'));
  try {
    const dbPath = join(dir, 'smartlearn-dev.db');
    const db = new Database(dbPath);
    runMigrations(db);
    const newest = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(newest); // the newest migration is "pending" again
    const before = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    const env = { SMARTLEARN_DEV_DATA_DIR: dir };
    assert.throws(() => assertMigrationAuthorized(db, dbPath, env), /not authorized/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, before, 'refusing changes nothing');
    assert.doesNotThrow(() => assertMigrationAuthorized(db, dbPath, { ...env, [AUTHORIZE_ENV]: String(newest) }));
    // any other database (tests, e2e, scratch copies) is not guarded
    assert.doesNotThrow(() => assertMigrationAuthorized(db, join(dir, 'other.db'), env));
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
