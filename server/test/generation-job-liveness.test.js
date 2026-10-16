import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import { createJob, getJob } from '../src/services/generation-jobs.js';
import { createJobRunner } from '../src/services/generation-job-runner.js';
import { sampleProcessTree } from '../src/services/process-liveness.js';
import { generateDraft as fakeGenerate } from '../src/ai/fake-provider.js';
import { ProviderRequestError } from '../src/ai/anthropic-provider.js';
import { callCodex } from '../src/ai/codex-provider.js';
import { fakeClock } from './fake-clock.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F3-03 (R-04 AC-04.2): liveness signal and the "stalled" policy. A long healthy step must NOT be called stuck: any signal of
// life (provider output, or CPU/handle activity of the provider's process tree) counts, and only generous TOTAL silence makes a
// job STALLED, which is a warning, never a failure. The hard limit stays the only time-based failure. Injected clock, FAKE provider.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const OPTS = { timeout: 60_000 };
const MIN = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15_000, what = 'condition') {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(15);
  }
}

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-live-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
async function oneProposal(ctx, email) {
  const now = new Date().toISOString();
  const userId = ctx.db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
  const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(['Pagina unica sobre fotossintese.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
  const [p] = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: 1 });
  return { userId, proposalId: p.id };
}

/** A provider that registers a (fake) process and then waits; the test drives output, and the probe is a fake of the process sampler. */
function waiting() {
  const p = {
    name: 'CTRL', live: true, languageContract: 'NOT_APPLICABLE', calls: 0, output: null, finish: null,
    async generate(input) {
      p.calls += 1;
      p.output = input.onActivity;
      input.onProcess?.(4242);
      await new Promise((resolve, reject) => {
        p.finish = resolve;
        input.signal.addEventListener('abort', () => reject(new ProviderRequestError('CANCELLED', 'stopped')), { once: true });
      });
      return fakeGenerate(input);
    },
  };
  return p;
}

function harness(ctx, user, { probe, silenceMs = 3 * MIN, sampleMs = 30_000, hardLimitMs = 60 * MIN } = {}) {
  const clock = fakeClock();
  const provider = waiting();
  const runner = createJobRunner(ctx.db, {
    settings: () => ({ providerImpl: provider, maxInputChars: 50_000 }),
    timers: clock, now: clock.now, hardLimitMs, cancelGraceMs: 1_000,
    liveness: { silenceMs, sampleMs, probe },
  });
  const { job } = createJob(ctx.db, user.userId, user.proposalId, { provider: { name: 'CTRL', live: true, plannedCalls: 1 }, now: clock.now });
  const done = runner.start({ ...job, userId: user.userId });
  const state = () => getJob(ctx.db, user.userId, job.id);
  return { clock, provider, runner, job, done, state };
}

test('5 minutes of output silence WITH CPU activity does not become STALLED (a long healthy step is not a stuck one)', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await oneProposal(ctx, 'a@example.com');
    let cpu = 0;
    const probe = async (pids) => { assert.deepEqual([...pids], [4242]); cpu += 4_000; return { cpuMs: cpu, handles: 120 }; };
    const h = harness(ctx, user, { probe });
    await until(() => h.provider.calls === 1);
    await h.clock.advance(5 * MIN); // the silence limit is 3 min: without the CPU signal this would be STALLED
    const j = h.state();
    assert.equal(j.state, 'CALLING_PROVIDER');
    assert.equal(j.lastActivityAt, '2026-10-05T10:05:00.000Z', 'the CPU activity keeps lastActivityAt current');
    h.provider.finish();
    await h.done;
  } finally { ctx.cleanup(); }
});

test('no CPU and no output for the silence limit becomes STALLED: a warning (no failure, no finish, no draft) and the job keeps running', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await oneProposal(ctx, 'b@example.com');
    const probe = async () => ({ cpuMs: 1_000, handles: 120 }); // frozen: the process is idle
    const h = harness(ctx, user, { probe });
    await until(() => h.provider.calls === 1);
    await h.clock.advance(2 * MIN);
    assert.equal(h.state().state, 'CALLING_PROVIDER', 'under the generous limit it is still just running');
    await h.clock.advance(2 * MIN);
    const stalled = h.state();
    assert.equal(stalled.state, 'STALLED');
    assert.equal(stalled.errorCode, null);
    assert.equal(stalled.finishedAt, null);
    assert.equal(stalled.draftId, null);
    assert.equal(stalled.phase, 'GENERATING', 'the phase is kept');
    await h.clock.advance(30 * MIN); // far past the silence limit, still under the hard limit: it stays a warning
    assert.equal(h.state().state, 'STALLED');
    assert.equal(h.provider.calls, 1);
    // a stalled job is still a live job: it can finish normally
    h.provider.finish();
    await h.done;
    assert.equal(h.state().state, 'SUCCEEDED');
  } finally { ctx.cleanup(); }
});

test('STALLED returns to CALLING_PROVIDER when a signal of life returns (provider output, then CPU)', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await oneProposal(ctx, 'c@example.com');
    let cpu = 1_000;
    const probe = async () => ({ cpuMs: cpu, handles: 120 });
    const h = harness(ctx, user, { probe });
    await until(() => h.provider.calls === 1);
    await h.clock.advance(4 * MIN);
    assert.equal(h.state().state, 'STALLED');

    h.provider.output(); // the provider speaks again
    assert.equal(h.state().state, 'CALLING_PROVIDER');

    await h.clock.advance(4 * MIN);
    assert.equal(h.state().state, 'STALLED', 'silent again');
    cpu += 5_000; // the process wakes up
    await h.clock.advance(30_000);
    assert.equal(h.state().state, 'CALLING_PROVIDER');
    h.provider.finish();
    await h.done;
  } finally { ctx.cleanup(); }
});

test('the hard limit is still the only time-based FAILURE: a stalled job fails only by TIMEOUT', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await oneProposal(ctx, 'd@example.com');
    const h = harness(ctx, user, { probe: async () => ({ cpuMs: 1, handles: 1 }), hardLimitMs: 20 * MIN });
    await until(() => h.provider.calls === 1);
    await h.clock.advance(19 * MIN);
    assert.equal(h.state().state, 'STALLED');
    await h.clock.advance(2 * MIN);
    await h.done;
    const j = h.state();
    assert.deepEqual([j.state, j.errorCode], ['FAILED', 'TIMEOUT']);
  } finally { ctx.cleanup(); }
});

test('output alone keeps a job healthy even without a probe (no process to sample)', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await oneProposal(ctx, 'e@example.com');
    const h = harness(ctx, user, { probe: null });
    await until(() => h.provider.calls === 1);
    for (let i = 0; i < 6; i += 1) { await h.clock.advance(MIN); h.provider.output(); }
    assert.equal(h.state().state, 'CALLING_PROVIDER');
    await h.clock.advance(4 * MIN);
    assert.equal(h.state().state, 'STALLED');
    h.provider.finish();
    await h.done;
  } finally { ctx.cleanup(); }
});

test('the real sampler sees CPU of the whole process tree: an idle child with a BUSY grandchild shows CPU growth, an idle tree does not', OPTS, async () => {
  const idle = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  const busyScript = "const {spawn}=require('node:child_process');"
    + "spawn(process.execPath,['-e','for(;;){}'],{stdio:'ignore'});setInterval(()=>{},1000);";
  const busy = spawn(process.execPath, ['-e', busyScript], { stdio: 'ignore', windowsHide: true });
  try {
    await sleep(1_500);
    const idleA = await sampleProcessTree(idle.pid);
    const busyA = await sampleProcessTree(busy.pid);
    await sleep(2_000);
    const idleB = await sampleProcessTree(idle.pid);
    const busyB = await sampleProcessTree(busy.pid);
    for (const s of [idleA, idleB, busyA, busyB]) assert.ok(s && Number.isFinite(s.cpuMs) && Number.isFinite(s.handles), JSON.stringify(s));
    assert.ok(busyB.cpuMs - busyA.cpuMs > 500, `busy tree grew ${busyB.cpuMs - busyA.cpuMs}ms`);
    assert.ok(idleB.cpuMs - idleA.cpuMs < 200, `idle tree grew ${idleB.cpuMs - idleA.cpuMs}ms`);
    assert.equal(await sampleProcessTree(2 ** 30), null, 'a process that does not exist is "no signal", never a crash');
  } finally {
    for (const c of [idle, busy]) { try { process.kill(c.pid, 'SIGKILL'); } catch { /* gone */ } }
    spawn('taskkill', ['/pid', String(busy.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {});
  }
});

test('the Codex provider reports its process and every chunk of output to the job (fake codex executable, no model)', OPTS, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-codex-live-'));
  try {
    writeFileSync(join(dir, 'codex-fake.mjs'), `
const args = process.argv.slice(2);
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
console.log('{"type":"event"}');
setInterval(() => console.log('{"type":"event"}'), 100);
`);
    const controller = new AbortController();
    const seen = { pids: [], chunks: 0 };
    const call = callCodex('prompt', { type: 'object' }, 'generate', { command: join(dir, 'codex-fake.mjs'), timeoutMs: 60_000, state: {} },
      { signal: controller.signal, onProcess: (pid) => seen.pids.push(pid), onActivity: () => { seen.chunks += 1; } });
    const outcome = call.then(() => null, (e) => e);
    await until(() => seen.chunks >= 3, 15_000, 'output chunks');
    assert.ok(seen.pids.length >= 1 && seen.pids.every((p) => Number.isInteger(p) && p > 0), 'it reports the pid of the process it started (login check and the call)');
    controller.abort();
    assert.equal((await outcome).code, 'CANCELLED');
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
