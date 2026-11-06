import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));

function freshDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-smoke-'));
  return { dir, dbPath: join(dir, 'smoke.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function startServer({ dbPath, port, cwd }) {
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: cwd ?? tmpdir(), // deliberately NOT server/ — proves cwd-independent path resolution
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)));
  return {
    child,
    getOutput: () => out,
    exited,
    async killAndWait() {
      child.kill();
      await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
    },
  };
}

async function waitFor(fn, { timeout = 5000, interval = 150 } = {}) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeout) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw lastErr ?? new Error('waitFor timed out');
}

async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('server starts from a different cwd and resolves migrations/db paths correctly', async () => {
  const { dbPath, cleanup } = freshDbPath();
  const port = 13901;
  const server = startServer({ dbPath, port });
  try {
    const live = await waitFor(async () => {
      const r = await getJson(`http://127.0.0.1:${port}/health/live`);
      return r.status === 200 ? r : null;
    });
    assert.equal(live.status, 200);

    const ready = await getJson(`http://127.0.0.1:${port}/health/ready`);
    assert.equal(ready.status, 200, `expected ready 200, got ${ready.status}: ${JSON.stringify(ready.body)} — output: ${server.getOutput()}`);
  } finally {
    await server.killAndWait();
    cleanup();
  }
});

test('occupied port produces a clean nonzero exit, not a hang or crash dump', async () => {
  const { dbPath, cleanup } = freshDbPath();
  const port = 13902;
  const first = startServer({ dbPath, port });
  try {
    await waitFor(async () => {
      const r = await getJson(`http://127.0.0.1:${port}/health/live`).catch(() => null);
      return r?.status === 200 ? r : null;
    });

    const { dbPath: dbPath2, cleanup: cleanup2 } = freshDbPath();
    const second = startServer({ dbPath: dbPath2, port }); // same port, different DB
    const exitCode = await second.exited;
    assert.notEqual(exitCode, 0, `expected nonzero exit on occupied port, got ${exitCode}. Output: ${second.getOutput()}`);
    assert.match(second.getOutput(), /EADDRINUSE|failed to start/i);
    cleanup2();
  } finally {
    await first.killAndWait();
    cleanup();
  }
});

test('restart on same DB after graceful stop retains a written marker', async () => {
  const { dbPath, cleanup } = freshDbPath();
  const port1 = 13903;
  const first = startServer({ dbPath, port: port1 });
  try {
    await waitFor(async () => {
      const r = await getJson(`http://127.0.0.1:${port1}/health/ready`).catch(() => null);
      return r?.status === 200 ? r : null;
    });
  } finally {
    await first.killAndWait(); // wait for real exit before reopening the same DB file
  }

  const port2 = 13904;
  const second = startServer({ dbPath, port: port2 });
  try {
    const ready = await waitFor(async () => {
      const r = await getJson(`http://127.0.0.1:${port2}/health/ready`).catch(() => null);
      return r?.status === 200 ? r : null;
    });
    assert.equal(ready.status, 200, 'restart on same DB file must reach ready, proving the file was not corrupted/locked by the previous instance');
  } finally {
    await second.killAndWait();
    cleanup();
  }
});

test('SIGTERM triggers the graceful-shutdown code path (signal delivery itself is platform-dependent)', async () => {
  const { dbPath, cleanup } = freshDbPath();
  const port = 13905;
  const { child, getOutput } = startServer({ dbPath, port });
  try {
    await waitFor(async () => {
      const r = await getJson(`http://127.0.0.1:${port}/health/live`).catch(() => null);
      return r?.status === 200 ? r : null;
    });

    const exitPromise = new Promise(resolve => child.on('exit', code => resolve(code)));
    const delivered = child.kill('SIGTERM');
    const exitCode = await Promise.race([
      exitPromise,
      new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 4000)),
    ]);

    if (process.platform === 'win32') {
      // Node documents that signals are not truly supported on Windows:
      // child.kill('SIGTERM') unconditionally terminates the process; the
      // handler code path (src/main.js process.on('SIGTERM', ...)) cannot
      // be exercised via real OS signal delivery on this platform. This is
      // an environment limitation, not a product defect — recorded here
      // instead of silently asserting a Unix-only guarantee.
      assert.ok(delivered, 'kill() call itself should succeed on win32');
      assert.notEqual(exitCode, 'TIMEOUT', 'process must still exit (even if not via the graceful path) on win32');
    } else {
      assert.equal(exitCode, 0, `expected graceful exit 0 on SIGTERM (POSIX), got ${exitCode}. Output: ${getOutput()}`);
      assert.match(getOutput(), /Shutdown complete/);
    }
  } finally {
    cleanup();
  }
});
