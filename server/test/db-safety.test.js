import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertTestDbIsDisposable } from '../src/db-safety.js';

const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

test('a NODE_ENV=test server may only use a database inside the OS temp directory', () => {
  const tmpDb = join(tmpdir(), 'sl-x', 'a.db');
  assert.doesNotThrow(() => assertTestDbIsDisposable('test', tmpDb));
  assert.throws(() => assertTestDbIsDisposable('test', join(SERVER_DIR, 'data', 'smartlearn.db')), /REFUSING TO START/);
  assert.throws(() => assertTestDbIsDisposable('test', './data/smartlearn.db'), /REFUSING TO START/, 'the relative default is refused too');
  assert.throws(() => assertTestDbIsDisposable('test', join(tmpdir(), '..', 'elsewhere', 'a.db')), /REFUSING TO START/, 'a .. escape out of tmp is refused');
  // Only NODE_ENV=test is constrained: dev/production keep their configured path.
  assert.doesNotThrow(() => assertTestDbIsDisposable('development', join(SERVER_DIR, 'data', 'smartlearn.db')));
  assert.doesNotThrow(() => assertTestDbIsDisposable(undefined, join(SERVER_DIR, 'data', 'smartlearn.db')));
});

test('the real server process refuses NODE_ENV=test against a non-temp database and creates nothing there', async () => {
  const forbiddenDir = mkdtempSync(join(SERVER_DIR, '.refuse-test-'));
  const forbiddenDb = join(forbiddenDir, 'must-not-exist.db');
  try {
    const child = spawn(process.execPath, [MAIN_JS], {
      cwd: SERVER_DIR,
      env: { ...process.env, NODE_ENV: 'test', SMARTLEARN_DB_PATH: forbiddenDb, PORT: '0', HOST: '127.0.0.1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const result = await new Promise((resolveExit) => {
      const timer = setTimeout(() => { child.kill(); resolveExit({ code: 'still-running' }); }, 6000);
      child.on('exit', (code) => { clearTimeout(timer); resolveExit({ code }); });
    });
    assert.equal(result.code, 1, `server must exit 1, got ${result.code}`);
    assert.match(stderr, /REFUSING TO START/);
    assert.equal(existsSync(forbiddenDb), false, 'no database file may be created at the refused path');
  } finally {
    rmSync(forbiddenDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('a legitimate temp database still starts (the guard does not break the test/e2e setup)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-guard-ok-'));
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: SERVER_DIR,
    env: { ...process.env, NODE_ENV: 'test', SMARTLEARN_DB_PATH: join(dir, 'ok.db'), SMARTLEARN_SOURCES_DIR: join(dir, 's'), PORT: '13990', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const started = await new Promise((resolveStart) => {
      const timer = setTimeout(() => resolveStart(false), 8000);
      child.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(timer); resolveStart(true); } });
      child.on('exit', () => { clearTimeout(timer); resolveStart(false); });
    });
    assert.equal(started, true);
    assert.equal(existsSync(join(dir, 'ok.db')), true);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
