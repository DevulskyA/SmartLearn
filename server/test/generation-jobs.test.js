import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations, canonicalChecksum } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import {
  JOB_STATES, ACTIVE_STATES, TRANSITIONS, JobError, createJob, getJob, listJobs, transitionJob, recoverOrphanJobs, assertJobScopeIntact,
} from '../src/services/generation-jobs.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F3-01 (R-04 AC-04.1, R-12, R-13, INV-13): the generation job record and its state machine. This task only RECORDS and
// VALIDATES: no provider is ever called here (T-F3-02 runs the job).

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const PASSWORD = 'a genuinely long test password 1';
const T = (iso) => () => new Date(iso);
const FAKE = { name: 'FAKE', live: false, plannedCalls: 1 };
const CODEX = { name: 'CODEX', live: true, plannedCalls: 3 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-jobs-'));
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

/** A user with an extracted source cut into one proposal per page. */
async function userWithProposals(ctx, email, pages = ['Primeira pagina sobre fotossintese e clorofila.', 'Segunda pagina sobre respiracao celular.']) {
  const userId = makeUser(ctx.db, email);
  const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(pages), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
  const created = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: 1 });
  return { userId, source, proposalIds: created.map((p) => p.id) };
}

const refusal = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const T0 = T('2026-10-05T10:00:00.000Z');
const T1 = T('2026-10-05T10:01:00.000Z');

test('the state machine is a closed table: terminal states have no exit and every listed edge is a known state', () => {
  assert.deepEqual([...JOB_STATES].sort(), ['CALLING_PROVIDER', 'CANCELLED', 'FAILED', 'QUEUED', 'STALLED', 'SUCCEEDED']);
  assert.deepEqual([...ACTIVE_STATES].sort(), ['CALLING_PROVIDER', 'QUEUED', 'STALLED']);
  for (const terminal of ['SUCCEEDED', 'FAILED', 'CANCELLED']) assert.deepEqual([...TRANSITIONS[terminal]], [], `${terminal} must be final`);
  for (const [from, tos] of Object.entries(TRANSITIONS)) {
    assert.ok(JOB_STATES.includes(from));
    for (const to of tos) assert.ok(JOB_STATES.includes(to), `${from} -> ${to}`);
  }
});

test('valid transitions walk the job through its life and stamp the timestamps and outcome fields', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'a@example.com');
    const { job } = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 });
    assert.equal(job.state, 'QUEUED');
    assert.equal(job.phase, 'QUEUED');
    assert.equal(job.startedAt, null);

    const running = transitionJob(ctx.db, job.id, 'CALLING_PROVIDER', { now: T1 });
    assert.equal(running.state, 'CALLING_PROVIDER');
    assert.equal(running.startedAt, '2026-10-05T10:01:00.000Z');
    assert.equal(running.lastActivityAt, '2026-10-05T10:01:00.000Z');
    assert.equal(running.finishedAt, null);

    const stalled = transitionJob(ctx.db, job.id, 'STALLED', { now: T('2026-10-05T10:20:00.000Z') });
    assert.equal(stalled.state, 'STALLED');
    assert.equal(transitionJob(ctx.db, job.id, 'CALLING_PROVIDER', { now: T('2026-10-05T10:21:00.000Z') }).state, 'CALLING_PROVIDER', 'a signal of life returns a stalled job to running');

    const draft = ctx.db.prepare(`INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at)
      VALUES (?, ?, 'FAKE', 'x', '5', 'DRAFT', '{}', ?)`).run(userId, proposalIds[0], new Date().toISOString()).lastInsertRowid;
    const done = transitionJob(ctx.db, job.id, 'SUCCEEDED', { draftId: Number(draft), now: T('2026-10-05T10:30:00.000Z') });
    assert.equal(done.state, 'SUCCEEDED');
    assert.equal(done.draftId, Number(draft));
    assert.equal(done.finishedAt, '2026-10-05T10:30:00.000Z');
  } finally { ctx.cleanup(); }
});

test('invalid transitions are rejected with a typed error and change nothing', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'b@example.com');
    const { job } = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 });

    // QUEUED may not jump to a result: nothing ran
    for (const to of ['SUCCEEDED', 'STALLED', 'QUEUED']) {
      const err = refusal(() => transitionJob(ctx.db, job.id, to, { draftId: 1, now: T1 }));
      assert.ok(err instanceof JobError, `QUEUED -> ${to}`);
      assert.equal(err.code, 'INVALID_TRANSITION');
    }
    assert.equal(getJob(ctx.db, userId, job.id).state, 'QUEUED');

    // a finished job is final, whatever it finished as
    transitionJob(ctx.db, job.id, 'CANCELLED', { now: T1 });
    for (const to of JOB_STATES) {
      const err = refusal(() => transitionJob(ctx.db, job.id, to, { draftId: 1, errorCode: 'X', now: T1 }));
      assert.equal(err?.code, 'INVALID_TRANSITION', `CANCELLED -> ${to}`);
    }
    assert.equal(getJob(ctx.db, userId, job.id).state, 'CANCELLED');

    // unknown state and missing job are typed too
    assert.equal(refusal(() => transitionJob(ctx.db, job.id, 'RUNNING', { now: T1 }))?.code, 'VALIDATION_FAILED');
    assert.equal(refusal(() => transitionJob(ctx.db, 99999, 'FAILED', { errorCode: 'X', now: T1 }))?.code, 'NOT_FOUND');
  } finally { ctx.cleanup(); }
});

test('a result needs its evidence: FAILED carries an error code, SUCCEEDED carries the draft', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'c@example.com');
    const { job } = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 });
    transitionJob(ctx.db, job.id, 'CALLING_PROVIDER', { now: T1 });
    assert.equal(refusal(() => transitionJob(ctx.db, job.id, 'FAILED', { now: T1 }))?.code, 'VALIDATION_FAILED');
    assert.equal(refusal(() => transitionJob(ctx.db, job.id, 'SUCCEEDED', { now: T1 }))?.code, 'VALIDATION_FAILED');
    assert.equal(getJob(ctx.db, userId, job.id).state, 'CALLING_PROVIDER');
    const failed = transitionJob(ctx.db, job.id, 'FAILED', { errorCode: 'TIMEOUT', errorMessage: 'Demorou demais.', now: T1 });
    assert.equal(failed.errorCode, 'TIMEOUT');
    assert.equal(failed.errorMessage, 'Demorou demais.');
    assert.equal(failed.draftId, null, 'a failure never points at a draft');
  } finally { ctx.cleanup(); }
});

test('one ACTIVE job per proposal: a second create returns the existing job; after it finishes a new one may start', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'd@example.com');
    const first = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 });
    const second = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T1 });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.job.id, first.job.id);

    // still the same while it runs or is stalled
    transitionJob(ctx.db, first.job.id, 'CALLING_PROVIDER', { now: T1 });
    assert.equal(createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T1 }).job.id, first.job.id);

    // another proposal is independent
    assert.notEqual(createJob(ctx.db, userId, proposalIds[1], { provider: FAKE, now: T1 }).job.id, first.job.id);

    transitionJob(ctx.db, first.job.id, 'FAILED', { errorCode: 'TIMEOUT', now: T1 });
    const again = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T('2026-10-05T11:00:00.000Z') });
    assert.equal(again.created, true);
    assert.notEqual(again.job.id, first.job.id);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_jobs WHERE proposal_id = ?').get(proposalIds[0]).n, 2);
  } finally { ctx.cleanup(); }
});

test('the database itself refuses two active jobs for one proposal (the service is not the only guard)', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'e@example.com');
    createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 });
    const insert = () => ctx.db.prepare(`INSERT INTO generation_jobs (user_id, proposal_id, state, phase, provider, generation_locale, scope_digest, estimated_units, created_at, last_activity_at)
      VALUES (?, ?, 'QUEUED', 'QUEUED', 'FAKE', 'pt-BR', 'x', 0, 'n', 'n')`).run(userId, proposalIds[0]);
    assert.throws(insert, /UNIQUE/);
  } finally { ctx.cleanup(); }
});

test('creation records the contract: user, proposal, scope digest, languages, estimate; it validates like generation does and calls no provider', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'f@example.com', ['Pagina um com texto.', 'Pagina dois com texto.', 'Pagina tres com texto.']);
    const { job } = createJob(ctx.db, userId, proposalIds[0], { provider: CODEX, now: T0 });
    assert.equal(job.proposalId, proposalIds[0]);
    assert.equal(job.provider, 'CODEX');
    assert.equal(job.generationLocale, 'pt-BR');
    assert.ok(job.sourceLanguage === null || typeof job.sourceLanguage === 'string');
    assert.ok(job.estimatedUnits > 0, 'a live provider has a cost estimate recorded');
    assert.equal(job.consumedUnits, null);
    assert.equal(job.reservationId, null, 'the reservation is taken when the job runs (T-F3-02), not at creation');
    assert.equal(createJob(ctx.db, userId, proposalIds[1], { provider: FAKE, now: T0 }).job.estimatedUnits, 0, 'the test double spends nothing');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_reservations').get().n, 0, 'creation never touches the credit ledger');

    // refused BEFORE any job exists: unknown proposal, over-size input
    assert.equal(refusal(() => createJob(ctx.db, userId, 987654, { provider: FAKE, now: T0 }))?.code, 'NOT_FOUND');
    const big = refusal(() => createJob(ctx.db, userId, proposalIds[2], { provider: { name: 'X', live: false }, maxInputChars: 5, now: T0 }));
    assert.equal(big?.code, 'INPUT_TOO_LARGE');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_jobs').get().n, 2, 'a refused creation leaves no row');
  } finally { ctx.cleanup(); }
});

test('INV-13: a job never widens its scope — the DB refuses edits of scope/estimate/provider and a changed source is detected', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'g@example.com');
    const { job } = createJob(ctx.db, userId, proposalIds[0], { provider: CODEX, now: T0 });
    for (const [column, value] of [['proposal_id', proposalIds[1]], ['scope_digest', 'other'], ['estimated_units', 1], ['generation_locale', 'en-US'], ['provider', 'FAKE'], ['user_id', userId + 1]]) {
      assert.throws(() => ctx.db.prepare(`UPDATE generation_jobs SET ${column} = ? WHERE id = ?`).run(value, job.id), /immutable/, column);
    }
    const stored = getJob(ctx.db, userId, job.id);
    assert.equal(stored.proposalId, proposalIds[0]);
    assert.equal(stored.estimatedUnits, job.estimatedUnits);

    assertJobScopeIntact(ctx.db, userId, job.id); // unchanged text: fine

    // the proposal's text changes after the job was created (re-extraction): the job must NOT silently run on the new text
    ctx.db.prepare('UPDATE source_pages SET text = ? WHERE user_id = ? AND source_id = (SELECT source_id FROM content_proposals WHERE id = ?)').run('texto inteiramente diferente e maior', userId, proposalIds[0]);
    assert.equal(refusal(() => assertJobScopeIntact(ctx.db, userId, job.id))?.code, 'SCOPE_CHANGED');
  } finally { ctx.cleanup(); }
});

test('tenant isolation: a user never sees, lists or acts on another user\'s jobs, and cannot create one on another user\'s proposal', async () => {
  const ctx = tmpDb();
  try {
    const a = await userWithProposals(ctx, 'h1@example.com');
    const b = await userWithProposals(ctx, 'h2@example.com');
    const { job } = createJob(ctx.db, a.userId, a.proposalIds[0], { provider: FAKE, now: T0 });
    assert.equal(refusal(() => getJob(ctx.db, b.userId, job.id))?.code, 'NOT_FOUND');
    assert.deepEqual(listJobs(ctx.db, b.userId), []);
    assert.deepEqual(listJobs(ctx.db, a.userId).map((j) => j.id), [job.id]);
    assert.equal(refusal(() => createJob(ctx.db, b.userId, a.proposalIds[0], { provider: FAKE, now: T0 }))?.code, 'NOT_FOUND');
    const bJob = createJob(ctx.db, b.userId, b.proposalIds[0], { provider: FAKE, now: T0 }).job;
    assert.notEqual(bJob.id, job.id);
    assert.deepEqual(listJobs(ctx.db, a.userId, { proposalId: a.proposalIds[0] }).map((j) => j.id), [job.id]);
  } finally { ctx.cleanup(); }
});

test('startup recovery: orphan CALLING_PROVIDER (and STALLED) jobs become FAILED(SERVER_RESTARTED); nothing else is touched', async () => {
  const ctx = tmpDb();
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'i@example.com', ['p um texto', 'p dois texto', 'p tres texto']);
    const running = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 }).job;
    transitionJob(ctx.db, running.id, 'CALLING_PROVIDER', { now: T0 });
    const stalled = createJob(ctx.db, userId, proposalIds[1], { provider: FAKE, now: T0 }).job;
    transitionJob(ctx.db, stalled.id, 'CALLING_PROVIDER', { now: T0 });
    transitionJob(ctx.db, stalled.id, 'STALLED', { now: T0 });
    const queued = createJob(ctx.db, userId, proposalIds[2], { provider: FAKE, now: T0 }).job;

    const changed = recoverOrphanJobs(ctx.db, { now: T1 });
    assert.equal(changed, 2);
    for (const id of [running.id, stalled.id]) {
      const j = getJob(ctx.db, userId, id);
      assert.equal(j.state, 'FAILED');
      assert.equal(j.errorCode, 'SERVER_RESTARTED');
      assert.equal(j.finishedAt, '2026-10-05T10:01:00.000Z');
      assert.equal(j.draftId, null);
    }
    assert.equal(getJob(ctx.db, userId, queued.id).state, 'QUEUED');
    assert.equal(recoverOrphanJobs(ctx.db, { now: T1 }), 0, 'idempotent');
    // a recovered proposal can be generated again
    assert.equal(createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T1 }).created, true);
  } finally { ctx.cleanup(); }
});

test('wiring: starting the real server process recovers orphan jobs before serving', async () => {
  const ctx = tmpDb();
  let child;
  try {
    const { userId, proposalIds } = await userWithProposals(ctx, 'j@example.com');
    const job = createJob(ctx.db, userId, proposalIds[0], { provider: FAKE, now: T0 }).job;
    transitionJob(ctx.db, job.id, 'CALLING_PROVIDER', { now: T0 });
    ctx.db.close();

    child = spawn(process.execPath, [MAIN_JS], {
      cwd: tmpdir(),
      env: { ...process.env, SMARTLEARN_DB_PATH: ctx.path, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const started = Date.now();
    while (!/server listening/.test(out) && Date.now() - started < 15_000) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, /server listening/, out);
    assert.match(out, /recovered 1 orphaned generation job/);

    const reopened = openDb(ctx.path);
    try {
      const row = reopened.prepare('SELECT state, error_code AS code FROM generation_jobs WHERE id = ?').get(job.id);
      assert.deepEqual({ ...row }, { state: 'FAILED', code: 'SERVER_RESTARTED' });
    } finally { reopened.close(); }
  } finally {
    child?.kill();
    await new Promise((r) => setTimeout(r, 300));
    ctx.cleanup();
  }
});

test('migration 033 is additive, its manifest checksum matches the file, and it needs no change to the pre-migrate backup path', () => {
  const ctx = tmpDb();
  try {
    const sql = readFileSync(join(MIGRATIONS_DIR, '033-generation-jobs.sql'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'manifest.json'), 'utf8')).find((m) => m.version === 33);
    assert.equal(manifest.name, 'generation-jobs');
    assert.equal(manifest.checksum, canonicalChecksum(sql));
    assert.equal(ctx.db.prepare('SELECT checksum FROM schema_migrations WHERE version = 33').get().checksum, manifest.checksum);
    const code = sql.replace(/--[^\n]*/g, '');
    assert.ok(!/DROP\s|DELETE\s+FROM|ALTER\s+TABLE/i.test(code), 'forward-only: it only creates new objects, no existing table is touched');
    assert.ok(/CREATE TABLE generation_jobs/.test(code));
  } finally { ctx.cleanup(); }
});

async function login(app, email) {
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
  const cookie = res.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  return { cookie, csrf: JSON.parse(me.body).csrfToken, userId: JSON.parse(me.body).user?.id };
}

test('HTTP: POST /v1/generation-jobs (auth + CSRF + validation), idempotent, GET list/detail, tenant isolated; no provider is called', async () => {
  const ctx = tmpDb();
  const app = await buildApp(ctx.db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS } });
  try {
    const alice = await login(app, 'alice-jobs@example.com');
    const bob = await login(app, 'bob-jobs@example.com');
    const aliceId = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get('alice-jobs@example.com').id;
    const source = sourceStorage.acceptUpload(ctx.db, aliceId, { buffer: buildFixturePdf(['Texto da unidade um.', 'Texto da unidade dois.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(ctx.db, aliceId, source.id, { sourcesDir: ctx.sourcesDir });
    const [p1] = proposals.chunkSource(ctx.db, aliceId, source.id, { maxPagesPerChunk: 1 });
    const post = (who, payload, extra = {}) => app.inject({ method: 'POST', url: '/v1/generation-jobs', headers: { origin: TEST_ORIGIN, cookie: who.cookie, 'x-csrf-token': who.csrf, 'content-type': 'application/json', ...extra }, payload });

    assert.equal((await app.inject({ method: 'POST', url: '/v1/generation-jobs', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' }, payload: { proposalId: p1.id } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/generation-jobs', headers: { origin: TEST_ORIGIN, cookie: alice.cookie, 'content-type': 'application/json' }, payload: { proposalId: p1.id } })).statusCode, 403, 'no CSRF token');
    assert.equal((await post(alice, { proposalId: 'x' })).statusCode, 400);
    assert.equal((await post(alice, {})).statusCode, 400);
    assert.equal((await post(alice, { proposalId: p1.id, userId: 99 })).statusCode, 400, 'a client-supplied owner is rejected, never trusted');

    const created = await post(alice, { proposalId: p1.id });
    assert.equal(created.statusCode, 201);
    const job = JSON.parse(created.body).job;
    assert.equal(job.state, 'QUEUED');
    assert.equal(job.proposalId, p1.id);

    const again = await post(alice, { proposalId: p1.id });
    assert.equal(again.statusCode, 200);
    assert.equal(JSON.parse(again.body).job.id, job.id);

    const list = JSON.parse((await app.inject({ method: 'GET', url: '/v1/generation-jobs', headers: { cookie: alice.cookie } })).body);
    assert.deepEqual(list.jobs.map((j) => j.id), [job.id]);
    const detail = await app.inject({ method: 'GET', url: `/v1/generation-jobs/${job.id}`, headers: { cookie: alice.cookie } });
    assert.equal(JSON.parse(detail.body).job.id, job.id);

    assert.equal((await app.inject({ method: 'GET', url: `/v1/generation-jobs/${job.id}`, headers: { cookie: bob.cookie } })).statusCode, 404);
    assert.deepEqual(JSON.parse((await app.inject({ method: 'GET', url: '/v1/generation-jobs', headers: { cookie: bob.cookie } })).body).jobs, []);
    assert.equal((await post(bob, { proposalId: p1.id })).statusCode, 404, 'another user\'s proposal looks like it does not exist');
    assert.equal((await app.inject({ method: 'GET', url: '/v1/generation-jobs/abc', headers: { cookie: alice.cookie } })).statusCode, 400);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n, 0, 'creating a job generates nothing');
  } finally {
    await app.close();
    ctx.cleanup();
  }
});
