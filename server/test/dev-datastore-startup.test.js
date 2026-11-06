import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync, mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/migrations.js';
import { isValidSnapshot } from '../src/dev-snapshot.js';

const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

// A DEV datastore (inside a temp directory) already migrated up to the second-to-last migration, with a row of history in it.
function olderDevDatastore() {
  const dataDir = mkdtempSync(join(tmpdir(), 'sl-startup-'));
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const older = join(dataDir, 'older-migrations');
  mkdirSync(older);
  for (const f of files.slice(0, -1)) copyFileSync(join(MIGRATIONS, f), join(older, f));
  const latest = files.at(-1);
  const dbPath = join(dataDir, 'smartlearn-dev.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db, older);
  const fromVersion = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
  db.close();
  return { dataDir, dbPath, fromVersion, latest };
}

// `authorize` = the value of SMARTLEARN_AUTHORIZE_MIGRATIONS for this process ('' = nothing authorized).
function start(dataDir, dbPath, port, authorize = '') {
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: tmpdir(),
    env: { ...process.env, SMARTLEARN_DEV_DATA_DIR: dataDir, SMARTLEARN_DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', SMARTLEARN_AUTHORIZE_MIGRATIONS: authorize },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return { child, output: () => out, exited: new Promise((resolve) => child.on('exit', resolve)) };
}

async function ready(port) {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health/ready`)).status === 200) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

test('starting the backend on the DEV datastore with a pending migration takes a verified pre-migrate snapshot and a daily snapshot first, then migrates', async () => {
  const w = olderDevDatastore();
  const server = start(w.dataDir, w.dbPath, 13909, String(parseInt(w.latest, 10)));
  try {
    assert.equal(await ready(13909), true, server.output());
    const snaps = join(w.dataDir, 'snapshots');
    const pre = join(snaps, `pre-migrate-v${w.fromVersion}`);
    assert.ok(existsSync(pre), `pre-migrate snapshot expected. Output: ${server.output()}`);
    assert.equal(isValidSnapshot(pre), true);
    assert.equal(JSON.parse(readFileSync(join(pre, 'manifest.json'), 'utf8')).schemaVersion, w.fromVersion, 'the snapshot holds the OLD schema');
    assert.ok(readdirSync(snaps).some((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)), 'a daily snapshot was taken');
    const live = new Database(w.dbPath, { readonly: true });
    assert.ok(live.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v > w.fromVersion, 'and the live database was then migrated');
    live.close();
  } finally { server.child.kill(); await server.exited; rmSync(w.dataDir, { recursive: true, force: true }); }
});

test('if the pre-migration snapshot cannot be taken the backend refuses to migrate and the database stays on the old schema', async () => {
  const w = olderDevDatastore();
  // a FILE where the snapshots directory must be: mkdir fails, so no backup can exist
  writeFileSync(join(w.dataDir, 'snapshots'), 'not a directory');
  const server = start(w.dataDir, w.dbPath, 13910, String(parseInt(w.latest, 10)));
  try {
    const code = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
    assert.equal(code, 1, server.output());
    assert.match(server.output(), /REFUSING to migrate/);
    const live = new Database(w.dbPath, { readonly: true });
    assert.equal(live.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, w.fromVersion, 'the migration did not run');
    live.close();
  } finally { server.child.kill(); rmSync(w.dataDir, { recursive: true, force: true }); }
});

test('a pending migration on the DEV datastore that nobody authorized is refused before anything is written: no snapshot, schema unchanged', async () => {
  const w = olderDevDatastore();
  const before = createHash('sha256').update(readFileSync(w.dbPath)).digest('hex');
  const server = start(w.dataDir, w.dbPath, 13911);
  try {
    const code = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
    assert.equal(code, 1, server.output());
    assert.match(server.output(), /REFUSING to migrate: .*not authorized/);
    assert.equal(existsSync(join(w.dataDir, 'snapshots')), false, 'nothing was written to the datastore');
    assert.equal(createHash('sha256').update(readFileSync(w.dbPath)).digest('hex'), before, 'the database file is byte-identical');
    assert.ok(!existsSync(`${w.dbPath}-wal`) || statSync(`${w.dbPath}-wal`).size === 0, 'the write-ahead log holds nothing (the gate only read)');
    const live = new Database(w.dbPath, { readonly: true });
    assert.equal(live.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, w.fromVersion, 'the migration did not run');
    live.close();
  } finally { server.child.kill(); rmSync(w.dataDir, { recursive: true, force: true }); }
});

test('an existing DEV database with tables but no migration history is refused at startup, even with a full authorization list, and is left byte-identical', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'sl-startup-'));
  const dbPath = join(dataDir, 'smartlearn-dev.db');
  const seed = new Database(dbPath);
  seed.exec("CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO subjects (name) VALUES ('Farmacologia')");
  seed.close();
  const before = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
  const everything = Array.from({ length: 200 }, (_, i) => i + 1).join(',');
  const server = start(dataDir, dbPath, 13914, everything);
  try {
    const code = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
    assert.equal(code, 1, server.output());
    assert.match(server.output(), /no migration history/);
    assert.equal(createHash('sha256').update(readFileSync(dbPath)).digest('hex'), before, 'the database file is byte-identical');
    assert.equal(existsSync(join(dataDir, 'snapshots')), false);
  } finally { server.child.kill(); rmSync(dataDir, { recursive: true, force: true }); }
});

test('authorizing a different version does not authorize the pending one', async () => {
  const w = olderDevDatastore();
  const server = start(w.dataDir, w.dbPath, 13912, String(parseInt(w.latest, 10) + 1));
  try {
    const code = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
    assert.equal(code, 1, server.output());
    const live = new Database(w.dbPath, { readonly: true });
    assert.equal(live.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, w.fromVersion);
    live.close();
  } finally { server.child.kill(); rmSync(w.dataDir, { recursive: true, force: true }); }
});

test('a DEV datastore that is already fully migrated starts with no authorization at all (applied migrations stay recognised)', async () => {
  const w = olderDevDatastore();
  const db = new Database(w.dbPath);
  runMigrations(db);
  db.close();
  const server = start(w.dataDir, w.dbPath, 13913);
  try {
    assert.equal(await ready(13913), true, server.output());
  } finally { server.child.kill(); await server.exited; rmSync(w.dataDir, { recursive: true, force: true }); }
});
