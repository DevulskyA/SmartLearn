import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/migrations.js';

const BACKUP = fileURLToPath(new URL('../scripts/backup.mjs', import.meta.url));
const RESET = fileURLToPath(new URL('../scripts/reset-password.mjs', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
// SQLite creates EMPTY -wal/-shm sidecars for any reader of a WAL database; the guarantee is that nothing is ever written into them.
const walIsEmpty = (dbPath) => !existsSync(`${dbPath}-wal`) || statSync(`${dbPath}-wal`).size === 0;

// A DEV datastore migrated up to the second-to-last migration: the newest one is genuinely pending (nobody authorized it).
function pendingDevDatastore() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-bkpend-'));
  mkdirSync(join(dir, 'sources'));
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const older = join(dir, 'older-migrations');
  mkdirSync(older);
  for (const f of files.slice(0, -1)) copyFileSync(join(MIGRATIONS, f), join(older, f));
  const dbPath = join(dir, 'smartlearn-dev.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db, older);
  const applied = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
  db.close();
  return { dir, dbPath, applied, newest: parseInt(files.at(-1), 10) };
}

const run = (dir, dbPath, args, authorize = '') => spawnSync(process.execPath, [BACKUP, ...args], {
  cwd: tmpdir(), encoding: 'utf8',
  env: { ...process.env, SMARTLEARN_DEV_DATA_DIR: dir, SMARTLEARN_DB_PATH: dbPath, SMARTLEARN_SOURCES_DIR: join(dir, 'sources'), SMARTLEARN_AUTHORIZE_MIGRATIONS: authorize },
});

test('the backup of a DEV datastore with an unauthorized pending migration still works, as-is, and never migrates or writes to it', () => {
  const w = pendingDevDatastore();
  try {
    const before = sha256(w.dbPath);
    const pkg = join(w.dir, 'package');
    const result = run(w.dir, w.dbPath, ['--package', pkg]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stderr, /not migrating/);
    assert.equal(sha256(w.dbPath), before, 'the live database file is byte-identical');
    assert.ok(walIsEmpty(w.dbPath), 'nothing was written to the write-ahead log');
    const live = new Database(w.dbPath, { readonly: true });
    assert.equal(live.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, w.applied, 'the migration did not run');
    live.close();
    assert.equal(JSON.parse(readFileSync(join(pkg, 'manifest.json'), 'utf8')).schemaVersion, w.applied, 'the package holds the schema the database really had');
    const verify = run(w.dir, w.dbPath, ['--verify', pkg]);
    assert.equal(verify.status, 0, verify.stderr + verify.stdout);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('the same backup with the pending migration authorized migrates first, as before', () => {
  const w = pendingDevDatastore();
  try {
    const pkg = join(w.dir, 'package');
    const result = run(w.dir, w.dbPath, ['--package', pkg], String(w.newest));
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(JSON.parse(readFileSync(join(pkg, 'manifest.json'), 'utf8')).schemaVersion, w.newest);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('reset-password on a DEV datastore with an unauthorized pending migration is refused and leaves the database byte-identical', () => {
  const w = pendingDevDatastore();
  try {
    const before = sha256(w.dbPath);
    const result = spawnSync(process.execPath, [RESET, 'someone@example.test', '--db', w.dbPath], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, SMARTLEARN_DEV_DATA_DIR: w.dir, SMARTLEARN_AUTHORIZE_MIGRATIONS: '' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not authorized/);
    assert.equal(sha256(w.dbPath), before);
    assert.ok(walIsEmpty(w.dbPath));
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});
