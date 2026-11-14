import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admit, LIMITS, spawnSupervised, listRuns, stopRun, gc, EXIT } from '../scripts/process-supervisor.mjs';

// Real, disposable processes. Windows only: the Job Object is the mechanism under test (elsewhere the supervisor is a plain spawn).
const WIN = process.platform === 'win32';
const TREE = fileURLToPath(new URL('./fixtures/process-tree.mjs', import.meta.url));
const HOST = fileURLToPath(new URL('./fixtures/supervisor-host.mjs', import.meta.url));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};
const portFree = (port) => new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
const lineWith = (child, prefix) => new Promise((resolve, reject) => {
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; const m = buf.split(/\r?\n/).find((l) => l.startsWith(prefix)); if (m) resolve(m.split(' ').slice(1)); });
  child.once('exit', () => reject(new Error(`exited before "${prefix}": ${buf}`)));
});
const newDir = () => mkdtempSync(join(tmpdir(), 'sl-sup-test-'));

/** Starts the tree under a supervised run in `dir`; resolves once the grandchild listens. */
async function startTree(dir, extra = {}) {
  const run = spawnSupervised({ exe: process.execPath, args: [TREE], stdio: ['ignore', 'pipe', 'inherit'], label: 'test-tree', dir, ...extra });
  const [treePid, grandchildPid, port] = await lineWith(run.child, 'TREE');
  return { ...run, treePid: Number(treePid), grandchildPid: Number(grandchildPid), port: Number(port) };
}
const treeGone = (t) => until(() => !alive(t.treePid) && !alive(t.grandchildPid) && !alive(t.child.pid));

test('admission: plenty of memory keeps the requested workers; low memory reduces them; pressure refuses', () => {
  const base = { cores: 12, cpuBusy: 0.1, active: 0, requestedWorkers: 3 };
  assert.deepEqual(admit({ ...base, freeMB: 8000 }), { ok: true, workers: 3, notes: [] });
  const low = admit({ ...base, freeMB: LIMITS.reserveMB + LIMITS.baseMB + LIMITS.perWorkerMB + 10 });
  assert.equal(low.ok, true);
  assert.equal(low.workers, 1);
  assert.match(low.notes[0], /memory/);
  const pressure = admit({ ...base, freeMB: LIMITS.reserveMB });
  assert.equal(pressure.ok, false);
  assert.match(pressure.notes[0], /memory pressure/);
});

test('admission: global concurrency, CPU load and a core reserve are enforced', () => {
  const base = { freeMB: 20000, cores: 12, cpuBusy: 0.1, active: 0, requestedWorkers: 3 };
  assert.equal(admit({ ...base, active: LIMITS.maxActive }).ok, false, 'too many active runs across worktrees');
  assert.equal(admit({ ...base, cpuBusy: 0.95 }).ok, false, 'CPU saturated');
  assert.equal(admit({ ...base, cpuBusy: 0.8 }).workers, 1, 'busy CPU halves workers (3 -> 1)');
  assert.equal(admit({ ...base, cores: 6, requestedWorkers: 6 }).workers, 2, 'cores minus the reserve');
});

test('normal completion: the command exit code comes back and the registry is clean', { skip: !WIN }, async () => {
  const dir = newDir();
  const { child } = spawnSupervised({ exe: process.execPath, args: [TREE, 'exit', '7'], stdio: 'ignore', dir });
  const code = await new Promise((r) => child.once('exit', r));
  assert.equal(code, 7);
  assert.deepEqual(listRuns(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test('protection failure: when the command cannot be put in the job it never runs', { skip: !WIN }, async () => {
  const dir = newDir();
  const { child } = spawnSupervised({ exe: join(dir, 'does-not-exist.exe'), stdio: 'ignore', dir });
  const code = await new Promise((r) => child.once('exit', r));
  assert.ok([EXIT.PROTECTION_FAILED, EXIT.START_FAILED].includes(code), `exit ${code}`);
  rmSync(dir, { recursive: true, force: true });
});

test('cancellation by run id kills the whole tree, frees the port and leaves foreign processes alone', { skip: !WIN }, async () => {
  const dir = newDir();
  const foreign = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const t = await startTree(dir);
  assert.equal(await portFree(t.port), false, 'the grandchild holds the port');
  assert.equal(listRuns(dir).find((r) => r.runId === t.runId)?.state, 'ACTIVE');
  assert.equal(stopRun(t.runId, dir).stopped, true);
  assert.equal(await treeGone(t), true, 'tree, grandchild and helper are gone');
  assert.equal(await until(() => portFree(t.port)), true, 'port released');
  assert.equal(alive(foreign.pid), true, 'a process that is not part of the run is untouched');
  assert.equal(stopRun('no-such-run', dir).stopped, false);
  foreign.kill();
  assert.deepEqual(gc(dir).residue, []);
  rmSync(dir, { recursive: true, force: true });
});

test('timeout ends the run with code 124 and no descendants', { skip: !WIN }, async () => {
  const dir = newDir();
  const t = await startTree(dir, { timeoutSec: 2 });
  const code = await new Promise((r) => t.child.once('exit', r));
  assert.equal(code, EXIT.TIMEOUT);
  assert.equal(await treeGone(t), true);
  assert.equal(await until(() => portFree(t.port)), true);
  rmSync(dir, { recursive: true, force: true });
});

test('killing the supervisor by force ends the whole tree (no orphans)', { skip: !WIN }, async () => {
  const dir = newDir();
  const host = spawn(process.execPath, [HOST], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, SL_TEST_REGISTRY: dir } });
  const [runId, helperPid] = await lineWith(host, 'RUN');
  const [treePid, grandchildPid, port] = await new Promise((resolve) => { let b = ''; host.stdout.on('data', (d) => { b += d; const m = b.split(/\r?\n/).find((l) => l.startsWith('TREE')); if (m) resolve(m.split(' ').slice(1)); }); });
  assert.equal(alive(Number(grandchildPid)), true);
  host.kill('SIGKILL'); // no destructor, no handler: only the OS can clean up
  const gone = await until(() => ![Number(helperPid), Number(treePid), Number(grandchildPid)].some(alive), 20000);
  assert.equal(gone, true, `run ${runId}: helper, tree and grandchild must all be gone`);
  assert.equal(await until(() => portFree(Number(port))), true);
  assert.equal(gc(dir).residue.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('two runs at once are independent: stopping one leaves the other running', { skip: !WIN }, async () => {
  const dir = newDir();
  const [a, b] = await Promise.all([startTree(dir), startTree(dir)]);
  assert.equal(listRuns(dir).filter((r) => r.state === 'ACTIVE').length, 2);
  stopRun(a.runId, dir);
  assert.equal(await treeGone(a), true);
  assert.equal(alive(b.grandchildPid), true, 'run B untouched');
  stopRun(b.runId, dir);
  assert.equal(await treeGone(b), true);
  rmSync(dir, { recursive: true, force: true });
});

test('three short cycles leave no processes, no ports and no records behind', { skip: !WIN }, async () => {
  const dir = newDir();
  const seen = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const t = await startTree(dir);
    seen.push(t);
    stopRun(t.runId, dir);
    assert.equal(await treeGone(t), true, `cycle ${cycle}`);
  }
  assert.equal(seen.some((t) => alive(t.treePid) || alive(t.grandchildPid) || alive(t.child.pid)), false);
  for (const t of seen) assert.equal(await until(() => portFree(t.port)), true);
  assert.deepEqual(listRuns(dir).filter((r) => r.state === 'ACTIVE'), []);
  assert.equal(existsSync(dir) && readFileSync, readFileSync, 'registry dir readable');
  rmSync(dir, { recursive: true, force: true });
});
