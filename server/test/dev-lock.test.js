import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { acquireDevLock, assertDevLockFree, isDevDatastoreDb, devDbPaths } from '../src/dev-datastore.js';

const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));
const tmpDir = () => mkdtempSync(join(tmpdir(), 'sl-devlock-'));

test('acquire: the first writer creates dev.lock, a live second writer is refused naming the holder, release removes only its own lock', () => {
  const dir = tmpDir();
  try {
    const release = acquireDevLock(dir, { pid: 1111, root: 'C:/worktree-A', isAlive: () => true });
    assert.equal(JSON.parse(readFileSync(join(dir, 'dev.lock'), 'utf8')).pid, 1111);
    assert.throws(() => acquireDevLock(dir, { pid: 2222, root: 'C:/worktree-B', isAlive: () => true }), /already in use by pid 1111 from C:\/worktree-A/);
    assert.throws(() => assertDevLockFree(dir, { pid: 2222, isAlive: () => true }), /already in use by pid 1111/);
    release();
    assert.equal(existsSync(join(dir, 'dev.lock')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('acquire: a dead holder, a corrupt lock and our own earlier lock are all taken over', () => {
  const dir = tmpDir();
  try {
    acquireDevLock(dir, { pid: 1111, isAlive: () => true });
    acquireDevLock(dir, { pid: 2222, isAlive: () => false }); // holder 1111 is dead
    assert.equal(JSON.parse(readFileSync(join(dir, 'dev.lock'), 'utf8')).pid, 2222);
    writeFileSync(join(dir, 'dev.lock'), '{not json');
    assert.doesNotThrow(() => acquireDevLock(dir, { pid: 3333, isAlive: () => true }));
    assert.doesNotThrow(() => acquireDevLock(dir, { pid: 3333, isAlive: () => true }), 're-acquiring our own lock is allowed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('acquire: the lock is created exclusively, so a lock appearing between check and create cannot be overwritten', () => {
  const dir = tmpDir();
  try {
    mkdirSync(dir, { recursive: true });
    let reads = 0;
    // the other writer wins the race: its (live) lock is already on disk when we try to create ours
    writeFileSync(join(dir, 'dev.lock'), JSON.stringify({ pid: 4444, root: 'R', startedAt: 'T' }));
    assert.throws(() => acquireDevLock(dir, { pid: 5555, isAlive: (pid) => { reads += 1; return pid === 4444; } }), /pid 4444/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'dev.lock'), 'utf8')).pid, 4444, 'the winner keeps its lock');
    assert.ok(reads >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('isDevDatastoreDb recognises only the persistent DEV database file', () => {
  const env = { SMARTLEARN_DEV_DATA_DIR: join(tmpdir(), 'sl-dev-data-x') };
  assert.equal(isDevDatastoreDb(devDbPaths(env, '/h').dbPath, env, '/h'), true);
  assert.equal(isDevDatastoreDb(join(tmpdir(), 'other', 'smartlearn-dev.db'), env, '/h'), false);
  assert.equal(isDevDatastoreDb(join(env.SMARTLEARN_DEV_DATA_DIR, 'snapshots', 'smartlearn-dev.db'), env, '/h'), false);
});

function startBackend({ dataDir, port }) {
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: tmpdir(),
    env: { ...process.env, SMARTLEARN_DEV_DATA_DIR: dataDir, SMARTLEARN_DB_PATH: join(dataDir, 'smartlearn-dev.db'), PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, exited, output: () => out };
}

async function waitFor(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('waitFor timed out');
}

test('two real backends on the persistent DEV database: the second is refused naming the first; after a forced kill the lock is stale and a new backend starts', async () => {
  const dataDir = tmpDir();
  const first = startBackend({ dataDir, port: 13906 });
  try {
    await waitFor(async () => (await fetch('http://127.0.0.1:13906/health/live')).status === 200);
    assert.equal(JSON.parse(readFileSync(join(dataDir, 'dev.lock'), 'utf8')).pid, first.child.pid, 'the backend itself holds the lock');

    const second = startBackend({ dataDir, port: 13907 });
    const code = await second.exited;
    assert.notEqual(code, 0, `second backend must refuse to start. Output: ${second.output()}`);
    assert.match(second.output(), new RegExp(`already in use by pid ${first.child.pid}`));

    first.child.kill(); // forced on Windows: no graceful shutdown, so the lock file stays behind
    await first.exited;
    const third = startBackend({ dataDir, port: 13907 });
    try {
      await waitFor(async () => (await fetch('http://127.0.0.1:13907/health/live')).status === 200);
      assert.equal(JSON.parse(readFileSync(join(dataDir, 'dev.lock'), 'utf8')).pid, third.child.pid, 'a dead holder is taken over');
    } finally { third.child.kill(); await third.exited; }
  } finally {
    first.child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a backend on any other database (every test and e2e database) takes no lock', async () => {
  const dataDir = tmpDir();
  const otherDb = join(dataDir, 'not-the-dev-db.db');
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: tmpdir(),
    env: { ...process.env, SMARTLEARN_DEV_DATA_DIR: dataDir, SMARTLEARN_DB_PATH: otherDb, PORT: '13908', HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  try {
    await waitFor(async () => (await fetch('http://127.0.0.1:13908/health/live')).status === 200);
    assert.equal(existsSync(join(dataDir, 'dev.lock')), false);
  } finally { child.kill(); await exited; rmSync(dataDir, { recursive: true, force: true }); }
});
