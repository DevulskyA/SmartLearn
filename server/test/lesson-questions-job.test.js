import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { createQuestionsJob, getJob, recoverOrphanJobs } from '../src/services/generation-jobs.js';
import { createJobRunner } from '../src/services/generation-job-runner.js';
import { reconcileOrphans } from '../src/services/generation-budget.js';
import { ProviderRequestError } from '../src/ai/anthropic-provider.js';
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// The questions of a summary-first draft (or of an existing lesson) written by a BACKGROUND JOB: the same generation_jobs record,
// credit ledger, consent, cancellation and concurrency as the summary job, plus what only a second AI call needs -- never a double
// charge, an interrupted call is reconciled and retried on purpose, and nothing the student already wrote or approved is lost.
// Every provider is a controllable FAKE: no Codex, no model, no network.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const OPTS = { timeout: 60_000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10_000, what = 'condition') {
  const start = Date.now();
  while (!fn()) { if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-questions-job-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
function makeUser(db) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('q@example.com', 'q@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
}
const summaryOnly = () => ({
  name: CODEX_PROVIDER_NAME, live: false,
  async generate() { return { summary: '## Filtracao glomerular\n\nA filtracao depende da pressao hidrostatica.', summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR' }; },
});
const good = (n) => ({ question: `Pergunta ${n}: de que depende a filtracao glomerular?`, answer: 'Da pressao hidrostatica.', explanation: 'A pressao empurra o filtrado.', hint: 'Pense na forca.', questionType: 'OPEN', sourceSpans: [{ pageIndex: 1 }] });

/** A LIVE-looking provider for the questions call. mode: 'ok' answers at once; 'hang' waits for the stop signal; 'gate' waits for the test to open it. */
function questionProvider(mode, list = [good(1), good(2)]) {
  const p = {
    name: 'CTRLQ', live: true, languageContract: 'NOT_APPLICABLE', calls: 0, open: null,
    async generate() { throw new Error('the questions job must never call the summary generation'); },
    async generateQuestions(input) {
      p.calls += 1;
      if (mode === 'hang') await new Promise((_, reject) => input.signal.addEventListener('abort', () => reject(new ProviderRequestError('CANCELLED', 'stopped')), { once: true }));
      if (mode === 'gate') await new Promise((r) => { p.open = r; });
      return { summary: '-', summarySourceSpans: [], summaryEvidence: [], questions: list, modelVersion: 'codex:test', promptVersion: '10' };
    },
  };
  return p;
}
const describeProvider = (p) => ({ name: p.name, live: true, plannedCalls: 1 });
const reservations = (db) => db.prepare('SELECT * FROM generation_reservations ORDER BY id').all();

async function summaryFirstDraft(ctx) {
  const userId = makeUser(ctx.db);
  const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(['Filtracao glomerular depende da pressao.', 'Segunda pagina da aula.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
  const proposal = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: 10 })[0];
  const draft = await drafts.createDraft(ctx.db, userId, proposal.id, { providerImpl: summaryOnly(), codex: { deferQuestions: true }, generationLocaleOverride: 'pt-BR' });
  return { userId, source, proposal, draft };
}
function runnerFor(ctx, provider, extra = {}, settings = {}) {
  return createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider, maxInputChars: 50_000, ...settings }), cancelGraceMs: 20_000, hardLimitMs: 60_000, ...extra });
}
function startJob(ctx, runner, user, provider, draftId) {
  const { job, created } = createQuestionsJob(ctx.db, user.userId, draftId, { provider: describeProvider(provider) });
  return { job, created, done: created ? runner.start({ ...job, userId: user.userId }) : null };
}

test('success: the questions job writes into the SAME draft, one reservation settled once, the job carries that draft', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const provider = questionProvider('ok');
    const runner = runnerFor(ctx, provider);
    const { job, done } = startJob(ctx, runner, user, provider, user.draft.id);
    assert.equal(job.kind, 'QUESTIONS');
    assert.equal(job.targetDraftId, user.draft.id);
    assert.ok(job.estimatedUnits > 0, 'a live provider is priced before it runs');
    await done;
    const finished = getJob(ctx.db, user.userId, job.id);
    assert.equal(finished.state, 'SUCCEEDED');
    assert.equal(finished.draftId, user.draft.id);
    assert.equal(provider.calls, 1);
    const after = drafts.getDraft(ctx.db, user.userId, user.draft.id);
    assert.equal(after.questions.length, 2);
    assert.ok(after.questions.every((q) => q.origin === 'GENERATED' && q.status !== 'ACCEPTED'), 'AI output stays a draft for the human review');
    assert.equal(after.questionsDeferred, false);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM generated_drafts').get().n, 1, 'no second draft');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM learning_units').get().n, 0);
    const ledger = reservations(ctx.db);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].state, 'SETTLED');
    assert.equal(finished.consumedUnits, ledger[0].consumed_units);
  } finally { ctx.cleanup(); }
});

test('repeated attempt: asking again while it runs gives the same job and one provider call; asking after it succeeded starts nothing and charges nothing', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const provider = questionProvider('gate');
    const runner = runnerFor(ctx, provider);
    const first = startJob(ctx, runner, user, provider, user.draft.id);
    const again = startJob(ctx, runner, user, provider, user.draft.id);
    assert.equal(again.created, false);
    assert.equal(again.job.id, first.job.id);
    await until(() => provider.open, 5000, 'the provider call');
    provider.open();
    await first.done;
    assert.equal(provider.calls, 1);
    assert.throws(() => createQuestionsJob(ctx.db, user.userId, user.draft.id, { provider: describeProvider(provider) }), (err) => err.code === 'INVALID_STATE', 'the questions are already there');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM generation_jobs').get().n, 1);
    assert.equal(reservations(ctx.db).length, 1, 'no new reservation');
  } finally { ctx.cleanup(); }
});

test('interruption: a shutdown during the call fails the job once, the call made is charged ONCE, the draft is untouched, and the retry is a new, separate attempt', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const hanging = questionProvider('hang');
    const runner = runnerFor(ctx, hanging);
    const { job, done } = startJob(ctx, runner, user, hanging, user.draft.id);
    await until(() => hanging.calls === 1, 5000, 'the provider call');
    await runner.shutdown();
    await done;
    const failed = getJob(ctx.db, user.userId, job.id);
    assert.equal(failed.state, 'FAILED');
    assert.equal(failed.errorCode, 'SERVER_RESTARTED');
    assert.equal(drafts.getDraft(ctx.db, user.userId, user.draft.id).questions.length, 0, 'nothing partial was saved');
    assert.equal(drafts.getDraft(ctx.db, user.userId, user.draft.id).questionsDeferred, true, 'it can still be asked for');
    assert.deepEqual(reservations(ctx.db).map((r) => r.state), ['SETTLED'], 'the interrupted call may have been charged: settled, never refunded, never twice');

    // after the restart the student retries ON PURPOSE: a new job, a new reservation, and the draft gets its questions
    const ok = questionProvider('ok');
    const runner2 = runnerFor(ctx, ok);
    const retry = startJob(ctx, runner2, user, ok, user.draft.id);
    assert.equal(retry.created, true);
    assert.notEqual(retry.job.id, job.id);
    await retry.done;
    assert.equal(getJob(ctx.db, user.userId, retry.job.id).state, 'SUCCEEDED');
    assert.equal(drafts.getDraft(ctx.db, user.userId, user.draft.id).questions.length, 2);
    assert.deepEqual(reservations(ctx.db).map((r) => r.state), ['SETTLED', 'SETTLED']);
  } finally { ctx.cleanup(); }
});

test('crash recovery: a job left CALLING_PROVIDER is failed at startup, its open reservation is settled at the estimate (no free credit), and a QUEUED one is resumed', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const provider = questionProvider('ok');
    const { job } = createQuestionsJob(ctx.db, user.userId, user.draft.id, { provider: describeProvider(provider) });
    // a process that died mid-call: the job says CALLING_PROVIDER and the ledger still holds the reservation
    const at = new Date(Date.now() - 3 * 3600_000).toISOString();
    ctx.db.prepare("UPDATE generation_jobs SET state = 'CALLING_PROVIDER', phase = 'GENERATING', started_at = ? WHERE id = ?").run(at, job.id);
    const r = ctx.db.prepare("INSERT INTO generation_reservations (user_id, proposal_id, state, estimated_units, week_key, month_key, created_at) VALUES (?, ?, 'RESERVED', ?, '2026-W46', '2026-11', ?)").run(user.userId, user.proposal.id, job.estimatedUnits, at);
    ctx.db.prepare('UPDATE generation_jobs SET reservation_id = ? WHERE id = ?').run(r.lastInsertRowid, job.id);
    assert.equal(recoverOrphanJobs(ctx.db), 1);
    assert.equal(reconcileOrphans(ctx.db, { maxAgeMs: 0 }), 1);
    assert.equal(getJob(ctx.db, user.userId, job.id).errorCode, 'SERVER_RESTARTED');
    assert.deepEqual(reservations(ctx.db).map((x) => [x.state, x.consumed_units]), [['SETTLED', job.estimatedUnits]]);

    // the proposal is free again: a fresh job is created and, left QUEUED by another crash, is resumed (not abandoned)
    const retry = createQuestionsJob(ctx.db, user.userId, user.draft.id, { provider: describeProvider(provider) });
    assert.equal(retry.created, true);
    const runner = runnerFor(ctx, provider);
    assert.equal(runner.resumeQueued(), 1);
    await until(() => getJob(ctx.db, user.userId, retry.job.id).state === 'SUCCEEDED', 10_000, 'the resumed job');
    assert.equal(drafts.getDraft(ctx.db, user.userId, user.draft.id).questions.length, 2);
  } finally { ctx.cleanup(); }
});

test('cancel during the call: CANCELLED, nothing saved, the call made is charged once', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const provider = questionProvider('hang');
    const runner = runnerFor(ctx, provider);
    const { job, done } = startJob(ctx, runner, user, provider, user.draft.id);
    await until(() => provider.calls === 1, 5000, 'the provider call');
    const cancelled = await runner.cancel(user.userId, job.id);
    await done;
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal(drafts.getDraft(ctx.db, user.userId, user.draft.id).questions.length, 0);
    assert.deepEqual(reservations(ctx.db).map((x) => x.state), ['SETTLED']);
  } finally { ctx.cleanup(); }
});

test('budget and consent are the same gates as the summary: over the limit, or no consent, the provider is never called and nothing is reserved or charged', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const provider = questionProvider('ok');
    const limited = runnerFor(ctx, provider, {}, { budgetLimits: { maxPerJob: 1, weekly: null, monthly: null } });
    const a = startJob(ctx, limited, user, provider, user.draft.id);
    await a.done;
    const refused = getJob(ctx.db, user.userId, a.job.id);
    assert.equal(refused.state, 'FAILED');
    assert.equal(refused.errorCode, 'BUDGET_EXCEEDED');
    assert.equal(provider.calls, 0);
    assert.equal(reservations(ctx.db).length, 0);

    // no providerImpl: the declared Codex provider needs the student's consent
    const noConsent = createJobRunner(ctx.db, { settings: () => ({ provider: 'CODEX', consentGranted: false, maxInputChars: 50_000, codex: {} }), cancelGraceMs: 20_000, hardLimitMs: 60_000 });
    const codexDescription = { name: CODEX_PROVIDER_NAME, live: true, plannedCalls: 1 };
    const { job } = createQuestionsJob(ctx.db, user.userId, user.draft.id, { provider: codexDescription });
    await noConsent.start({ ...job, userId: user.userId });
    const blocked = getJob(ctx.db, user.userId, job.id);
    assert.equal(blocked.state, 'FAILED');
    assert.equal(reservations(ctx.db).length, 0, 'no consent, no reservation');
    assert.equal(drafts.getDraft(ctx.db, user.userId, user.draft.id).questions.length, 0);
  } finally { ctx.cleanup(); }
});

test('the student edits the summary WHILE the questions are being written: the edit is kept and the questions still arrive', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const provider = questionProvider('gate');
    const runner = runnerFor(ctx, provider);
    const { job, done } = startJob(ctx, runner, user, provider, user.draft.id);
    await until(() => provider.open, 5000, 'the provider call');
    const current = drafts.getDraft(ctx.db, user.userId, user.draft.id);
    drafts.reviseSummary(ctx.db, user.userId, user.draft.id, { summary: '## Filtracao glomerular\n\nTexto reescrito pelo aluno durante a geracao.', expectedVersion: current.summaryVersion });
    provider.open();
    await done;
    assert.equal(getJob(ctx.db, user.userId, job.id).state, 'SUCCEEDED');
    const after = drafts.getDraft(ctx.db, user.userId, user.draft.id);
    assert.match(after.summary, /reescrito pelo aluno/);
    assert.equal(after.questions.length, 2);
  } finally { ctx.cleanup(); }
});

test('what the student already wrote is preserved: their own question keeps its id and text, the new ones are added after it, a duplicate is not added twice', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const mine = drafts.addQuestion(ctx.db, user.userId, user.draft.id, { ...good(7), question: 'Minha propria pergunta sobre filtracao?' });
    const myId = mine.questions[0].id;
    const approved = drafts.reviseQuestion(ctx.db, user.userId, user.draft.id, myId, { status: 'ACCEPTED', expectedVersion: mine.questions[0].version });
    assert.equal(approved.questions[0].status, 'ACCEPTED');
    const provider = questionProvider('ok', [good(1), { ...good(2), question: 'Minha propria pergunta sobre filtracao?' }, good(3)]);
    const runner = runnerFor(ctx, provider);
    await startJob(ctx, runner, user, provider, user.draft.id).done;
    const after = drafts.getDraft(ctx.db, user.userId, user.draft.id);
    assert.equal(after.questions[0].id, myId);
    assert.equal(after.questions[0].status, 'ACCEPTED', 'an approved question stays approved');
    assert.equal(after.questions[0].origin, 'HUMAN_ADDED');
    assert.deepEqual(after.questions.slice(1).map((q) => q.question.slice(0, 10)), ['Pergunta 1', 'Pergunta 3'], 'the duplicate of the student\'s own question was not added');
    assert.equal(new Set(after.questions.map((q) => q.id)).size, after.questions.length, 'every question has its own id');
  } finally { ctx.cleanup(); }
});

test('an existing lesson: the job writes into the lesson\'s questions draft, and accepting it appends the exercises', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const user = await summaryFirstDraft(ctx);
    const result = acceptDraft(ctx.db, user.userId, user.draft.id, { newSubjectName: 'Fisiologia', studyDate: '2026-11-20', expectedRevision: user.draft.revision, acknowledgeSummaryFindings: true });
    const qd = drafts.createLessonQuestionsDraft(ctx.db, user.userId, result.unit.id);
    const provider = questionProvider('ok');
    const runner = runnerFor(ctx, provider);
    const started = startJob(ctx, runner, user, provider, qd.id);
    // the proposal has its lesson (ACCEPTED draft) and this questions draft: both are fine for the job record
    await started.done;
    assert.equal(getJob(ctx.db, user.userId, started.job.id).state, 'SUCCEEDED');
    const current = drafts.getDraft(ctx.db, user.userId, qd.id);
    assert.equal(current.questions.length, 2);
    assert.equal(acceptDraft(ctx.db, user.userId, qd.id, { expectedRevision: current.revision }).exerciseCount, 2);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM exercises WHERE unit_id = ?').get(result.unit.id).n, 2);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM learning_units').get().n, 1);
  } finally { ctx.cleanup(); }
});
