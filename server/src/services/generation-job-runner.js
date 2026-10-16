// GENERATION JOB RUNNER (R-04 AC-04.1, AC-04.4, R-12, INV-13). Runs the generation jobs of generation-jobs.js OUTSIDE the request
// that asked for them: the HTTP request only records the job and returns it; the work proceeds here, and the student can leave and
// come back, watch the phase, or cancel.
//
// One job, one run, one owner:
//   - the claim is a compare-and-set QUEUED -> CALLING_PROVIDER (transitionJob), so two runners can never both execute a job;
//   - inside one process an in-memory table (jobId -> run) makes a second start() of the same job a no-op.
// A job ends in exactly one of SUCCEEDED, FAILED or CANCELLED, and ONLY SUCCEEDED leaves a draft: createDraft refuses to store
// anything once the job was stopped (cancel, hard time limit, shutdown), so a stopped job never leaves a partial draft behind.
//
// Stopping is one AbortSignal per job. The provider receives it (`input.signal`); the Codex provider terminates its whole process
// TREE on abort and settles only after the process has really exited (ai/codex-provider.js killProcessTree). If a provider ignores
// the signal, the job is still finalised after `cancelGraceMs` and the late result is discarded (the signal is already aborted, so
// nothing can be stored); its credit reservation is then settled by `reconcileOrphans`, never refunded (R-12).
//
// Liveness (AC-04.2): ANY sign of life moves `lastActivityAt` (provider output, a new phase, or CPU/handle activity of the provider's
// process tree, sampled every `sampleMs`). Only total silence for `silenceMs` makes the job STALLED, a warning that never fails it
// and that returns to CALLING_PROVIDER the moment a signal comes back. The hard limit stays the only time-based failure.
//
// Credit (R-12) is the existing createDraft logic: RELEASED when the run was stopped before a provider call could leave, SETTLED at
// the estimate of the calls made when it was stopped during or after one.
import { config } from '../config.js';
import { createDraft, selectProvider, DraftError } from './generated-drafts.js';
import { ProviderRequestError } from '../ai/anthropic-provider.js';
import { sampleProcessTree } from './process-liveness.js';
import {
  JobError, SERVER_RESTARTED, TERMINAL_STATES, getJob, transitionJob, touchJob, markCancelRequested, assertJobScopeIntact, listQueuedJobs,
} from './generation-jobs.js';

export const DEFAULT_HARD_LIMIT_MS = 30 * 60 * 1000;
export const DEFAULT_CANCEL_GRACE_MS = 10_000;
// "Generous" silence: a model can think for many minutes without printing; this only decides when to WARN, never to fail.
export const DEFAULT_SILENCE_MS = 10 * 60 * 1000;
export const DEFAULT_SAMPLE_MS = 30_000;
const ACTIVITY_WRITE_MS = 5_000; // chatty output does not become a database write per chunk
const MIN_CPU_ACTIVITY_MS = 50;

/** Sums the samples of every process the provider started; processes that are gone give no signal. */
async function sampleAll(pids) {
  const samples = (await Promise.all([...pids].map((pid) => sampleProcessTree(pid)))).filter(Boolean);
  return samples.length === 0 ? null : { cpuMs: samples.reduce((s, x) => s + x.cpuMs, 0), handles: samples.reduce((s, x) => s + x.handles, 0) };
}

const MESSAGES = {
  TIMEOUT: 'A geração passou do tempo limite e foi interrompida. Nada foi salvo; tente de novo.',
  SERVER_RESTARTED: 'O servidor foi encerrado durante a geração. Nada foi salvo; gere de novo.',
  INTERNAL_ERROR: 'A geração falhou por um erro interno. Nada foi salvo.',
};

/** The AI settings of one run: config.js's, overridden by `aiOptions` (tests, dev). Shared by job creation and the runner. */
export function resolveAiSettings(aiOptions = {}) {
  const { jobRunner: _runner, jobRunnerOptions: _options, ...overrides } = aiOptions;
  return {
    apiUrl: config.aiApiUrl, apiKey: config.aiApiKey, model: config.aiModel, provider: config.aiProvider,
    consentGranted: config.aiConsentGranted, budgetCapUsd: config.aiBudgetCapUsd,
    codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort },
    timeoutMs: config.aiRequestTimeoutMs,
    maxInputChars: config.aiMaxInputChars,
    ...overrides,
  };
}

class Abandoned extends Error {}

/**
 * @param {object} db
 * @param {object} [options]
 * @param {() => object} [options.settings] AI settings per run (default: config + env)
 * @param {number} [options.hardLimitMs] hard time limit of a whole job, counted from when it starts running
 * @param {number} [options.maxConcurrent] jobs running at once; the rest wait QUEUED
 * @param {number} [options.cancelGraceMs] how long a stopped job waits for its provider to end before it is finalised anyway
 * @param {boolean} [options.autoStart] false: start() does nothing (tests of the record-only behaviour)
 * @param {() => Date} [options.now]
 * @param {{silenceMs?: number, sampleMs?: number, probe?: ((pids: Set<number>) => Promise<{cpuMs: number, handles: number}|null>)|null}} [options.liveness]
 *   silence before STALLED; how often the process tree is sampled; the sampler (null = none: only provider output counts)
 * @param {{setTimeout: Function, clearTimeout: Function, setInterval?: Function, clearInterval?: Function}} [options.timers] injectable clock for the hard limit and the grace
 */
export function createJobRunner(db, {
  settings = () => resolveAiSettings(),
  hardLimitMs = config.generationJobTimeoutMs ?? DEFAULT_HARD_LIMIT_MS,
  maxConcurrent = config.generationJobConcurrency ?? 2,
  cancelGraceMs = DEFAULT_CANCEL_GRACE_MS,
  autoStart = true,
  now = () => new Date(),
  liveness = {},
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
} = {}) {
  const { silenceMs = DEFAULT_SILENCE_MS, sampleMs = DEFAULT_SAMPLE_MS, probe = sampleAll } = liveness;
  const runs = new Map(); // jobId -> run (queued in memory or running)
  const waiting = []; // runs not yet dispatched, oldest first
  let running = 0;
  let closed = false;

  const stop = (run, reason) => {
    run.reason ??= reason;
    run.controller.abort();
  };

  /** Moves the job to its final state; a job that someone else already finished is left alone. */
  function conclude(run, { draft = null, error = null } = {}) {
    const { job } = run;
    const consumedUnits = run.budget?.consumedUnits;
    try {
      if (draft) transitionJob(db, job.id, 'SUCCEEDED', { draftId: draft.id, consumedUnits, now });
      else if (run.reason === 'CANCELLED') transitionJob(db, job.id, 'CANCELLED', { consumedUnits, now });
      else if (run.reason === 'TIMEOUT') transitionJob(db, job.id, 'FAILED', { errorCode: 'TIMEOUT', errorMessage: MESSAGES.TIMEOUT, consumedUnits, now });
      else if (run.reason === 'SHUTDOWN') transitionJob(db, job.id, 'FAILED', { errorCode: SERVER_RESTARTED, errorMessage: MESSAGES.SERVER_RESTARTED, consumedUnits, now });
      else {
        const known = error instanceof DraftError || error instanceof JobError;
        transitionJob(db, job.id, 'FAILED', {
          errorCode: known ? error.code : 'INTERNAL_ERROR', errorMessage: known ? error.message : MESSAGES.INTERNAL_ERROR, consumedUnits, now,
        });
      }
    } catch (err) {
      if (!(err instanceof JobError) || (err.code !== 'INVALID_TRANSITION' && err.code !== 'NOT_FOUND')) throw err;
    }
  }

  /**
   * A sign of life from the job's provider (output, a process started, a new phase, CPU activity). It stamps `lastActivityAt`
   * (throttled when only output) and brings a STALLED job back to CALLING_PROVIDER.
   */
  function alive(run, { phase } = {}) {
    if (run.finished) return;
    const at = now().getTime();
    run.lastSignalAt = at;
    if (phase !== undefined) run.phase = phase;
    if (run.stalled) {
      try { transitionJob(db, run.job.id, 'CALLING_PROVIDER', { phase: run.phase, now }); run.stalled = false; run.lastWriteAt = at; } catch (err) { if (!(err instanceof JobError)) throw err; }
    } else if (phase !== undefined || at - run.lastWriteAt >= ACTIVITY_WRITE_MS) {
      touchJob(db, run.job.id, { phase, now });
      run.lastWriteAt = at;
    }
  }

  /** One liveness tick: sample the provider's process tree (a change is a sign of life), then decide whether the silence is total. */
  async function tick(run) {
    if (run.ticking || run.finished || run.controller.signal.aborted) return;
    run.ticking = true;
    try {
      if (probe && run.pids.size > 0) {
        const sample = await probe(run.pids);
        if (run.finished || run.controller.signal.aborted) return;
        if (sample) {
          const before = run.lastSample;
          run.lastSample = sample;
          if (before && (sample.cpuMs - before.cpuMs >= MIN_CPU_ACTIVITY_MS || sample.handles !== before.handles)) alive(run);
        }
      }
      if (!run.stalled && now().getTime() - run.lastSignalAt >= silenceMs) {
        try { transitionJob(db, run.job.id, 'STALLED', { now }); run.stalled = true; } catch (err) { if (!(err instanceof JobError)) throw err; }
      }
    } finally { run.ticking = false; }
  }

  /** The provider as the job sees it: every call checks the stop signal first, reports its phase and receives the signal and the liveness callbacks. */
  function wrapProvider(base, run) {
    const { signal } = run.controller;
    const phased = (fn, phase) => (fn
      ? async (input) => {
        if (signal.aborted) throw new ProviderRequestError('CANCELLED', 'A geração foi interrompida; nenhuma outra chamada foi feita.');
        alive(run, { phase });
        return fn({ ...input, signal, onActivity: () => alive(run), onProcess: (pid) => { run.pids.add(pid); alive(run); } });
      }
      : undefined);
    return { ...base, generate: phased(base.generate, 'GENERATING'), audit: phased(base.audit, 'AUDITING'), repair: phased(base.repair, 'REPAIRING') };
  }

  async function generate(run) {
    const { job } = run;
    assertJobScopeIntact(db, job.userId, job.id); // INV-13: never on text other than the one validated and priced
    const options = settings();
    const base = options.providerImpl ?? selectProvider(options);
    const hooks = {
      signal: run.controller.signal,
      onReservation: (reservation) => touchJob(db, job.id, { reservationId: reservation.id, now }),
      onBudgetClosed: (budget) => { run.budget = budget; },
      onPhase: (phase) => alive(run, { phase }),
    };
    return createDraft(db, job.userId, job.proposalId, { ...options, providerImpl: wrapProvider(base, run), regenerate: job.regenerate === true, hooks, now });
  }

  async function execute(run) {
    const { job } = run;
    const { signal } = run.controller;
    let hardTimer = null;
    let graceTimer = null;
    let sampler = null;
    try {
      if (signal.aborted) { if (run.reason !== 'SHUTDOWN') conclude(run); return; } // stopped while waiting for a slot (a shutdown leaves it QUEUED for the next start)
      try {
        transitionJob(db, job.id, 'CALLING_PROVIDER', { phase: 'PREPARING', now });
      } catch (err) {
        if (err instanceof JobError && (err.code === 'INVALID_TRANSITION' || err.code === 'NOT_FOUND')) return; // not ours: another runner or a cancel got there first
        throw err;
      }
      run.started = true;
      run.phase = 'PREPARING';
      run.lastSignalAt = now().getTime();
      run.lastWriteAt = run.lastSignalAt;
      if (timers.setInterval) sampler = timers.setInterval(() => { tick(run).catch(() => {}); }, sampleMs);
      hardTimer = timers.setTimeout(() => stop(run, 'TIMEOUT'), hardLimitMs);
      const abandoned = new Promise((_, reject) => {
        signal.addEventListener('abort', () => { graceTimer = timers.setTimeout(() => reject(new Abandoned()), cancelGraceMs); }, { once: true });
      });
      abandoned.catch(() => {});
      const work = generate(run);
      work.catch(() => {}); // an abandoned run may fail later; nobody is listening and nothing may crash the process
      let draft;
      try {
        draft = await Promise.race([work, abandoned]);
      } catch (err) {
        conclude(run, { error: err });
        return;
      }
      conclude(run, { draft });
    } catch (err) {
      try { conclude(run, { error: err }); } catch { /* the job row itself is unreadable: startup recovery will deal with it */ }
    } finally {
      run.finished = true;
      if (sampler !== null) timers.clearInterval(sampler);
      timers.clearTimeout(hardTimer);
      timers.clearTimeout(graceTimer);
    }
  }

  function pump() {
    while (!closed && running < maxConcurrent && waiting.length > 0) {
      const run = waiting.shift();
      run.dispatched = true;
      running += 1;
      setImmediate(() => {
        execute(run).finally(() => {
          running -= 1;
          runs.delete(run.job.id);
          run.resolve();
          pump();
        });
      });
    }
  }

  return {
    /**
     * Runs a job in the background and returns a promise that settles when it has finished. Idempotent: a job already known to
     * this runner is not started twice. `job` is a job record plus its `userId`.
     */
    start(job) {
      if (!autoStart || closed) return null;
      const existing = runs.get(job.id);
      if (existing) return existing.done;
      const run = { job, controller: new AbortController(), reason: null, budget: null, started: false, dispatched: false, finished: false,
        pids: new Set(), phase: 'QUEUED', stalled: false, lastSignalAt: 0, lastWriteAt: 0, lastSample: null, ticking: false };
      run.done = new Promise((resolve) => { run.resolve = resolve; });
      runs.set(job.id, run);
      waiting.push(run);
      pump();
      return run.done;
    },

    /** Startup: a job that was QUEUED when the previous process ended never reached a provider; it is resumed, not left to block its proposal. */
    resumeQueued() {
      const queued = listQueuedJobs(db);
      for (const job of queued) this.start(job);
      return queued.length;
    },

    /**
     * Stops a job of this user (idempotent). A running job's provider process tree is terminated and the job ends CANCELLED (or,
     * if it finished first, as what it already was). Resolves with the job as it is afterwards.
     * @throws JobError NOT_FOUND for another user's job
     */
    async cancel(userId, jobId) {
      const job = getJob(db, userId, jobId);
      if (TERMINAL_STATES.includes(job.state)) return job;
      markCancelRequested(db, jobId, { now });
      const run = runs.get(jobId);
      if (!run) {
        // Nobody in this process owns it (a QUEUED job nobody resumed, or an active one left by a previous process).
        try { transitionJob(db, jobId, 'CANCELLED', { now }); } catch (err) { if (!(err instanceof JobError)) throw err; }
        return getJob(db, userId, jobId);
      }
      stop(run, 'CANCELLED');
      if (!run.dispatched) {
        waiting.splice(waiting.indexOf(run), 1);
        runs.delete(jobId);
        conclude(run);
        run.resolve();
      } else {
        await run.done;
      }
      return getJob(db, userId, jobId);
    },

    /** The process is ending: stop every provider tree. Running jobs end FAILED(SERVER_RESTARTED); jobs still waiting stay QUEUED for the next start. */
    async shutdown() {
      closed = true;
      const active = [...runs.values()];
      for (const run of active) {
        if (run.dispatched) stop(run, 'SHUTDOWN');
        else { runs.delete(run.job.id); run.resolve(); }
      }
      waiting.length = 0;
      await Promise.all(active.filter((r) => r.dispatched).map((r) => r.done));
    },

    /** Whether this process is running or about to run the job. */
    isTracked: (jobId) => runs.has(jobId),
  };
}
