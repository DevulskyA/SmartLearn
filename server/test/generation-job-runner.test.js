import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import { createJob, getJob } from '../src/services/generation-jobs.js';
import { createJobRunner } from '../src/services/generation-job-runner.js';
import { generateDraft as fakeGenerate } from '../src/ai/fake-provider.js';
import { ProviderRequestError } from '../src/ai/anthropic-provider.js';
import { callCodex, killProcessTree } from '../src/ai/codex-provider.js';
import { fakeClock } from './fake-clock.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F3-02 (R-04 AC-04.1, AC-04.4, R-12): the job runs OUTSIDE the request, has a hard time limit and can be cancelled, which
// terminates the provider's whole PROCESS TREE. Every provider here is a controllable FAKE: no Codex, no model, no network.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const PASSWORD = 'a genuinely long test password 1';
const OPTS = { timeout: 60_000 };

const flush = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15_000, what = 'condition') {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(15);
  }
}

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-runner-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, path, db, sourcesDir: join(dir, 'sources'), cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}
async function userWithProposals(ctx, email, pages = ['Primeira pagina sobre fotossintese e clorofila.', 'Segunda pagina sobre respiracao celular.']) {
  const userId = makeUser(ctx.db, email);
  const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(pages), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
  const created = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: 1 });
  return { userId, source, proposalIds: created.map((p) => p.id) };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const draftCount = (db) => db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n;
const reservations = (db) => db.prepare('SELECT * FROM generation_reservations ORDER BY id').all();

/**
 * A live-looking FAKE provider whose generate() the test controls. mode 'hang' waits for the stop signal; 'tree' starts a REAL child
 * that starts a REAL grandchild and ends them with the repo's killProcessTree when the signal fires; 'stubborn' ignores the signal
 * until the test releases it; 'ok' answers at once.
 */
function controllable(mode, extra = {}) {
  const p = {
    name: 'CTRL', live: true, languageContract: 'NOT_APPLICABLE', calls: 0, pids: null, release: null, phasesSeen: [], ...extra,
    async generate(input) {
      p.calls += 1;
      p.phasesSeen.push(extra.phaseProbe?.());
      if (mode === 'ok') return fakeGenerate(input);
      if (mode === 'fail') throw new ProviderRequestError(extra.failCode ?? 'PROVIDER_ERROR', 'boom');
      if (mode === 'stubborn') { await new Promise((r) => { p.release = r; }); return fakeGenerate(input); }
      if (mode === 'hang') {
        await new Promise((_, reject) => input.signal.addEventListener('abort', () => reject(new ProviderRequestError('CANCELLED', 'stopped')), { once: true }));
      }
      // tree
      const script = "const {spawn}=require('node:child_process');"
        + "const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});"
        + "console.log(g.pid);setInterval(()=>{},1000);";
      const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, detached: process.platform !== 'win32' });
      const grandchild = await new Promise((resolve) => child.stdout.once('data', (d) => resolve(Number(String(d).trim()))));
      p.pids = { child: child.pid, grandchild };
      return new Promise((_, reject) => {
        const onStop = () => { killProcessTree(child); child.once('close', () => reject(new ProviderRequestError('CANCELLED', 'stopped'))); };
        if (input.signal.aborted) onStop(); else input.signal.addEventListener('abort', onStop, { once: true });
      });
    },
  };
  return p;
}

const describe = (p) => ({ name: p.name, live: true, plannedCalls: 1 + (p.audit ? 1 : 0) + (p.repair ? 1 : 0) });
function setup(ctx, user, provider, runnerOptions = {}) {
  const runner = createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider, maxInputChars: 50_000 }), cancelGraceMs: 20_000, hardLimitMs: 60_000, ...runnerOptions });
  const { job } = createJob(ctx.db, user.userId, user.proposalIds[0], { provider: describe(provider) });
  const started = () => runner.start({ ...job, userId: user.userId });
  return { runner, job, started };
}

test('cancel during the provider call terminates the whole process tree (child AND grandchild), ends CANCELLED, leaves no draft, charges the call made', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'a@example.com');
    const provider = controllable('tree');
    const { runner, job, started } = setup(ctx, user, provider);
    const done = started();
    await until(() => provider.pids, 15_000, 'the provider tree');
    assert.ok(alive(provider.pids.child) && alive(provider.pids.grandchild), 'both processes are really running');
    assert.equal(getJob(ctx.db, user.userId, job.id).state, 'CALLING_PROVIDER');

    const cancelled = await runner.cancel(user.userId, job.id);
    await done;
    assert.equal(cancelled.state, 'CANCELLED');
    assert.ok(cancelled.cancelRequestedAt);
    assert.equal(cancelled.draftId, null);
    await until(() => !alive(provider.pids.child) && !alive(provider.pids.grandchild), 10_000, 'the whole tree to die');
    assert.equal(draftCount(ctx.db), 0, 'no partial draft');
    // the call had started: charged at the estimate of the calls made (R-12), tied to the job
    const [r] = reservations(ctx.db);
    assert.equal(r.state, 'SETTLED');
    assert.equal(cancelled.reservationId, r.id);
    assert.equal(cancelled.consumedUnits, r.consumed_units);
    assert.ok(r.consumed_units > 0);

    // idempotent; another user cannot touch it
    assert.equal((await runner.cancel(user.userId, job.id)).state, 'CANCELLED');
    const other = makeUser(ctx.db, 'other@example.com');
    await assert.rejects(() => runner.cancel(other, job.id), (e) => e.code === 'NOT_FOUND');
    // the proposal can be generated again
    assert.equal(createJob(ctx.db, user.userId, user.proposalIds[0], { provider: describe(provider) }).created, true);
  } finally { ctx.cleanup(); }
});

test('hard time limit (injected clock): the job ends FAILED(TIMEOUT), the process tree dies, no draft is created', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'b@example.com');
    const clock = fakeClock();
    const provider = controllable('tree');
    const { job, started } = setup(ctx, user, provider, { timers: clock, now: clock.now, hardLimitMs: 45 * 60_000, cancelGraceMs: 6 * 60 * 60_000, liveness: { probe: null, silenceMs: 24 * 60 * 60_000 } });
    const done = started();
    await until(() => provider.pids, 15_000, 'the provider tree');
    await clock.advance(44 * 60_000);
    assert.equal(getJob(ctx.db, user.userId, job.id).state, 'CALLING_PROVIDER', 'one minute short of the limit it is still running');
    await clock.advance(61_000);
    await done;
    const failed = getJob(ctx.db, user.userId, job.id);
    assert.equal(failed.state, 'FAILED');
    assert.equal(failed.errorCode, 'TIMEOUT');
    assert.equal(failed.draftId, null);
    await until(() => !alive(provider.pids.child) && !alive(provider.pids.grandchild), 10_000, 'the whole tree to die');
    assert.equal(draftCount(ctx.db), 0);
    assert.equal(reservations(ctx.db)[0].state, 'SETTLED', 'the call started: charged at the estimate');
  } finally { ctx.cleanup(); }
});

test('the default hard limit is above the 20 minutes the product told the student to expect, and is configurable', () => {
  const ctx = tmpDb();
  try {
    // exercised through the config the runner reads
    return import('../src/config.js').then(({ config }) => {
      assert.ok(config.generationJobTimeoutMs > 20 * 60_000);
    });
  } finally { ctx.cleanup(); }
});

test('a failed provider call leaves no draft: FAILED with the error code; released when nothing could leave, settled when it may have', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const a = await userWithProposals(ctx, 'c@example.com');
    const failing = controllable('fail');
    const s1 = setup(ctx, a, failing);
    await s1.started();
    const j1 = getJob(ctx.db, a.userId, s1.job.id);
    assert.deepEqual([j1.state, j1.errorCode, j1.draftId], ['FAILED', 'PROVIDER_ERROR', null]);
    assert.equal(reservations(ctx.db)[0].state, 'SETTLED');

    const noCreds = controllable('fail', { failCode: 'MISSING_CREDENTIALS' });
    const s2 = setup(ctx, { ...a, proposalIds: [a.proposalIds[1]] }, noCreds);
    await s2.started();
    const j2 = getJob(ctx.db, a.userId, s2.job.id);
    assert.deepEqual([j2.state, j2.errorCode], ['FAILED', 'MISSING_CREDENTIALS']);
    assert.equal(reservations(ctx.db)[1].state, 'RELEASED', 'nothing left the machine: the balance returns');
    assert.equal(j2.consumedUnits, 0);
    assert.equal(draftCount(ctx.db), 0);
  } finally { ctx.cleanup(); }
});

test('a provider that ignores the stop signal is abandoned after the grace; its late answer can never create a draft', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'd@example.com');
    const clock = fakeClock();
    const provider = controllable('stubborn');
    const { runner, job, started } = setup(ctx, user, provider, { timers: clock, now: clock.now, cancelGraceMs: 5_000 });
    const done = started();
    await until(() => provider.release, 15_000, 'the provider call');
    const pending = runner.cancel(user.userId, job.id);
    await flush();
    await clock.advance(5_001);
    assert.equal((await pending).state, 'CANCELLED');
    await done;
    provider.release(); // the provider finally answers with a complete, valid draft
    await sleep(100);
    assert.equal(draftCount(ctx.db), 0, 'a stopped job never stores a draft, even a complete one that arrives late');
    assert.equal(getJob(ctx.db, user.userId, job.id).state, 'CANCELLED');
  } finally { ctx.cleanup(); }
});

test('success: phases are reported while running, activity is stamped, the draft is attached and the consumption recorded', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'e@example.com');
    const clock = fakeClock();
    const seen = [];
    const provider = controllable('ok', {
      phaseProbe: () => seen.push(['generate', getJob(ctx.db, user.userId, jobIdRef.id).phase]),
      audit: async ({ signal }) => { seen.push(['audit', getJob(ctx.db, user.userId, jobIdRef.id).phase, signal instanceof AbortSignal]); return { findings: [], malformed: false }; },
    });
    const jobIdRef = {};
    const { job, started } = setup(ctx, user, provider, { now: clock.now });
    jobIdRef.id = job.id;
    await started();
    assert.deepEqual(seen.filter((s) => s[0] === 'generate').map((s) => s[1]), ['GENERATING']);
    assert.deepEqual(seen.find((s) => s[0] === 'audit').slice(1), ['AUDITING', true], 'the provider receives the stop signal on every call');
    const done = getJob(ctx.db, user.userId, job.id);
    assert.equal(done.state, 'SUCCEEDED');
    assert.equal(done.phase, 'FINISHED');
    assert.ok(Number.isInteger(done.draftId));
    assert.equal(draftCount(ctx.db), 1);
    assert.equal(done.startedAt, '2026-10-05T10:00:00.000Z');
    assert.equal(done.reservationId, reservations(ctx.db)[0].id);
    assert.equal(done.consumedUnits, reservations(ctx.db)[0].consumed_units);
  } finally { ctx.cleanup(); }
});

test('one runner per job: starting twice, or from two runners, calls the provider once (the claim is a compare-and-set)', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'f@example.com');
    const provider = controllable('ok');
    const { runner, job, started } = setup(ctx, user, provider);
    const second = createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider, maxInputChars: 50_000 }) });
    await Promise.all([started(), started(), runner.start({ ...job, userId: user.userId }), second.start({ ...job, userId: user.userId })]);
    assert.equal(provider.calls, 1);
    assert.equal(draftCount(ctx.db), 1);
    assert.equal(getJob(ctx.db, user.userId, job.id).state, 'SUCCEEDED');
  } finally { ctx.cleanup(); }
});

test('QUEUED recovery: a job left QUEUED with no runner is resumed at startup and can never block its proposal', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'g@example.com');
    const provider = controllable('ok');
    const { job } = createJob(ctx.db, user.userId, user.proposalIds[0], { provider: describe(provider) }); // QUEUED, nobody runs it
    const runner = createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider, maxInputChars: 50_000 }) });
    assert.equal(runner.resumeQueued(), 1);
    await until(() => getJob(ctx.db, user.userId, job.id).state === 'SUCCEEDED', 15_000, 'the resumed job');
    assert.equal(provider.calls, 1);
    assert.equal(draftCount(ctx.db), 1);
    assert.equal(runner.resumeQueued(), 0, 'nothing is left queued');
  } finally { ctx.cleanup(); }
});

test('cancelling a job nobody runs (QUEUED orphan) still works', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'h@example.com');
    const provider = controllable('ok');
    const { job } = createJob(ctx.db, user.userId, user.proposalIds[0], { provider: describe(provider) });
    const runner = createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider }) });
    assert.equal((await runner.cancel(user.userId, job.id)).state, 'CANCELLED');
    assert.equal(provider.calls, 0);
  } finally { ctx.cleanup(); }
});

test('shutdown stops every provider tree; the running job ends FAILED(SERVER_RESTARTED) and a waiting one stays QUEUED', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'i@example.com');
    const provider = controllable('tree');
    const runner = createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider, maxInputChars: 50_000 }), maxConcurrent: 1 });
    const a = createJob(ctx.db, user.userId, user.proposalIds[0], { provider: describe(provider) }).job;
    const b = createJob(ctx.db, user.userId, user.proposalIds[1], { provider: describe(provider) }).job;
    runner.start({ ...a, userId: user.userId });
    runner.start({ ...b, userId: user.userId });
    await until(() => provider.pids, 15_000, 'the provider tree');
    await runner.shutdown();
    assert.deepEqual([getJob(ctx.db, user.userId, a.id).state, getJob(ctx.db, user.userId, a.id).errorCode], ['FAILED', 'SERVER_RESTARTED']);
    assert.equal(getJob(ctx.db, user.userId, b.id).state, 'QUEUED');
    await until(() => !alive(provider.pids.child) && !alive(provider.pids.grandchild), 10_000, 'the tree to die');
    assert.equal(provider.calls, 1);
  } finally { ctx.cleanup(); }
});

test('re-cutting the source while a job is active is refused (nothing deleted under the job); once it is cancelled the cut works; a finished job survives a discarded draft', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await userWithProposals(ctx, 'j@example.com');
    const provider = controllable('hang');
    const { runner, job, started } = setup(ctx, user, provider);
    const done = started();
    await until(() => provider.calls === 1, 15_000, 'the call');
    const before = proposals.listProposals(ctx.db, user.userId, user.source.id).map((p) => p.id);
    assert.throws(() => proposals.chunkSource(ctx.db, user.userId, user.source.id, { maxPagesPerChunk: 1 }), (e) => e.code === 'GENERATION_IN_PROGRESS');
    assert.deepEqual(proposals.listProposals(ctx.db, user.userId, user.source.id).map((p) => p.id), before, 'nothing was deleted');
    await runner.cancel(user.userId, job.id);
    await done;
    assert.equal(draftCount(ctx.db), 0);

    // a SUCCEEDED job points at its draft; discarding that draft on an explicit re-cut must not crash on the foreign key
    const ok = controllable('ok');
    const s2 = setup(ctx, user, ok);
    await s2.started();
    assert.ok(getJob(ctx.db, user.userId, s2.job.id).draftId);
    proposals.chunkSource(ctx.db, user.userId, user.source.id, { maxPagesPerChunk: 1, discardDrafts: true });
    const after = getJob(ctx.db, user.userId, s2.job.id);
    assert.equal(after.state, 'SUCCEEDED');
    assert.equal(after.draftId, null, 'the job stays as history; its draft is gone');
  } finally { ctx.cleanup(); }
});

test('the real Codex provider honours the stop signal: its process tree dies and the call rejects CANCELLED (fake codex executable, no model)', OPTS, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-codex-abort-'));
  try {
    const pidFile = join(dir, 'pids.json').replaceAll('\\', '/');
    writeFileSync(join(dir, 'codex-fake.mjs'), `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ child: process.pid, grandchild: g.pid }));
setInterval(() => {}, 1000);
`);
    const controller = new AbortController();
    const call = callCodex('prompt', { type: 'object' }, 'generate', { command: join(dir, 'codex-fake.mjs'), timeoutMs: 60_000, state: {} }, { signal: controller.signal });
    const outcome = call.then(() => null, (e) => e);
    await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').includes('grandchild'), 15_000, 'the fake codex tree');
    const pids = JSON.parse(readFileSync(pidFile, 'utf8'));
    assert.ok(alive(pids.child) && alive(pids.grandchild));
    controller.abort();
    const err = await outcome;
    assert.ok(err instanceof ProviderRequestError);
    assert.equal(err.code, 'CANCELLED');
    await until(() => !alive(pids.child) && !alive(pids.grandchild), 10_000, 'the whole tree to die');
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

async function login(app, email) {
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
  const cookie = res.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  return { cookie, csrf: JSON.parse(me.body).csrfToken };
}

test('HTTP: POST returns the job at once and the work proceeds in the background; cancel is auth+CSRF protected, tenant isolated and idempotent', OPTS, async () => {
  const ctx = tmpDb();
  const provider = controllable('hang');
  const app = await buildApp(ctx.db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl: provider } });
  try {
    const alice = await login(app, 'alice-run@example.com');
    const bob = await login(app, 'bob-run@example.com');
    const aliceId = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get('alice-run@example.com').id;
    const source = sourceStorage.acceptUpload(ctx.db, aliceId, { buffer: buildFixturePdf(['Texto da unidade um.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(ctx.db, aliceId, source.id, { sourcesDir: ctx.sourcesDir });
    const [p1] = proposals.chunkSource(ctx.db, aliceId, source.id, { maxPagesPerChunk: 1 });
    const call = (who, method, url, payload) => app.inject({ method, url, headers: { origin: TEST_ORIGIN, cookie: who.cookie, 'x-csrf-token': who.csrf, 'content-type': 'application/json' }, payload });

    const created = await call(alice, 'POST', '/v1/generation-jobs', { proposalId: p1.id });
    assert.equal(created.statusCode, 201);
    const job = JSON.parse(created.body).job;
    assert.equal(job.state, 'QUEUED', 'the request returns the job; it did not wait for the provider');
    await until(() => provider.calls === 1, 15_000, 'the background call');
    assert.equal(JSON.parse((await app.inject({ method: 'GET', url: `/v1/generation-jobs/${job.id}`, headers: { cookie: alice.cookie } })).body).job.state, 'CALLING_PROVIDER');
    assert.equal(provider.calls, 1);
    assert.equal(JSON.parse((await call(alice, 'POST', '/v1/generation-jobs', { proposalId: p1.id })).body).job.id, job.id);
    await sleep(50);
    assert.equal(provider.calls, 1, 'asking again does not start a second run');

    assert.equal((await app.inject({ method: 'POST', url: `/v1/generation-jobs/${job.id}/cancel`, headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' }, payload: {} })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/generation-jobs/${job.id}/cancel`, headers: { origin: TEST_ORIGIN, cookie: alice.cookie, 'content-type': 'application/json' }, payload: {} })).statusCode, 403, 'no CSRF token');
    assert.equal((await call(bob, 'POST', `/v1/generation-jobs/${job.id}/cancel`, {})).statusCode, 404);
    assert.equal((await call(alice, 'POST', '/v1/generation-jobs/abc/cancel', {})).statusCode, 400);
    assert.equal(getJob(ctx.db, aliceId, job.id).state, 'CALLING_PROVIDER', 'a refused cancel changed nothing');

    const cancelled = await call(alice, 'POST', `/v1/generation-jobs/${job.id}/cancel`, {});
    assert.equal(cancelled.statusCode, 200);
    assert.equal(JSON.parse(cancelled.body).job.state, 'CANCELLED');
    const again = await call(alice, 'POST', `/v1/generation-jobs/${job.id}/cancel`, {});
    assert.equal(again.statusCode, 200);
    assert.equal(JSON.parse(again.body).job.state, 'CANCELLED');
    assert.equal(draftCount(ctx.db), 0);
  } finally {
    await app.close();
    ctx.cleanup();
  }
});

test('HTTP: asking for a proposal whose job was left QUEUED by a crash hands it to the runner instead of waiting forever', OPTS, async () => {
  const ctx = tmpDb();
  const provider = controllable('ok');
  const app = await buildApp(ctx.db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl: provider } });
  try {
    const alice = await login(app, 'alice-q@example.com');
    const aliceId = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get('alice-q@example.com').id;
    const source = sourceStorage.acceptUpload(ctx.db, aliceId, { buffer: buildFixturePdf(['Texto da unidade um.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(ctx.db, aliceId, source.id, { sourcesDir: ctx.sourcesDir });
    const [p1] = proposals.chunkSource(ctx.db, aliceId, source.id, { maxPagesPerChunk: 1 });
    const orphan = createJob(ctx.db, aliceId, p1.id, { provider: describe(provider) }).job; // QUEUED, no runner owns it
    const res = await app.inject({ method: 'POST', url: '/v1/generation-jobs', headers: { origin: TEST_ORIGIN, cookie: alice.cookie, 'x-csrf-token': alice.csrf, 'content-type': 'application/json' }, payload: { proposalId: p1.id } });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).job.id, orphan.id);
    await until(() => getJob(ctx.db, aliceId, orphan.id).state === 'SUCCEEDED', 15_000, 'the orphan job to run');
  } finally {
    await app.close();
    ctx.cleanup();
  }
});

test('wiring: the real server process resumes a QUEUED job after a restart (FAKE provider, no model)', OPTS, async () => {
  const ctx = tmpDb();
  let child;
  try {
    const user = await userWithProposals(ctx, 'k@example.com');
    const job = createJob(ctx.db, user.userId, user.proposalIds[0], { provider: { name: 'FAKE', live: false, plannedCalls: 1 } }).job;
    ctx.db.close();
    child = spawn(process.execPath, [MAIN_JS], {
      cwd: tmpdir(),
      env: { ...process.env, SMARTLEARN_DB_PATH: ctx.path, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', SMARTLEARN_AI_PROVIDER: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    await until(() => /resumed 1 queued generation job/.test(out), 20_000, `the resume message\n${out}`);
    const reopened = openDb(ctx.path);
    try {
      await until(() => reopened.prepare('SELECT state FROM generation_jobs WHERE id = ?').get(job.id).state === 'SUCCEEDED', 20_000, 'the job to finish');
      assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n, 1);
    } finally { reopened.close(); }
  } finally {
    child?.kill();
    await sleep(300);
    ctx.cleanup();
  }
});
