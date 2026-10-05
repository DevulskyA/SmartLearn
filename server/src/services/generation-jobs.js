// GENERATION JOBS (R-04 AC-04.1, R-12, R-13, INV-13). The durable record of one attempt to generate a draft from one approved
// proposal, and the state machine that tells the student (and the server after a restart) what that attempt is doing.
//
// This module only RECORDS and VALIDATES: it never calls a provider and never touches the credit ledger. Running a job (the
// reservation, the provider call, cancelling) is the runner's work (generation-job-runner.js) and goes through `transitionJob`.
//
//   QUEUED ──> CALLING_PROVIDER ──> SUCCEEDED
//      │            │  ▲  └──────> FAILED
//      │            ▼  │  └──────> CANCELLED
//      │         STALLED (a warning: silence, not a failure) ──> SUCCEEDED | FAILED | CANCELLED
//      └──────> FAILED | CANCELLED
//
// SUCCEEDED, FAILED and CANCELLED are final. At most one job per proposal is ACTIVE (QUEUED, CALLING_PROVIDER, STALLED): the
// database enforces it with a partial unique index, so a second request gets the existing job instead of a second run.
// The contract fixed at creation (owner, proposal, scope digest, languages, provider, estimate) is immutable in the database:
// a job never runs on a wider scope than the one that was validated and priced (INV-13).
import { detectSourceLanguage } from '../ai/language-contract.js';
import { estimateCostUnits } from './generation-budget.js';
import { prepareGeneration, segmentsDigest, DraftError } from './generated-drafts.js';
import { ensureGenerationLocale } from './settings.js';

export class JobError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

export const JOB_STATES = Object.freeze(['QUEUED', 'CALLING_PROVIDER', 'STALLED', 'SUCCEEDED', 'FAILED', 'CANCELLED']);
export const ACTIVE_STATES = Object.freeze(['QUEUED', 'CALLING_PROVIDER', 'STALLED']);
export const TERMINAL_STATES = Object.freeze(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** The only legal moves. Anything absent is refused with INVALID_TRANSITION. */
export const TRANSITIONS = Object.freeze({
  QUEUED: Object.freeze(['CALLING_PROVIDER', 'FAILED', 'CANCELLED']),
  CALLING_PROVIDER: Object.freeze(['STALLED', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  STALLED: Object.freeze(['CALLING_PROVIDER', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  SUCCEEDED: Object.freeze([]),
  FAILED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

/** What the student is told the job is doing; each state has a sensible default, a caller may be more specific while running. */
export const JOB_PHASES = Object.freeze(['QUEUED', 'PREPARING', 'GENERATING', 'AUDITING', 'REPAIRING', 'SAVING', 'FINISHED']);
const DEFAULT_PHASE = { QUEUED: 'QUEUED', CALLING_PROVIDER: 'GENERATING', SUCCEEDED: 'FINISHED', FAILED: 'FINISHED', CANCELLED: 'FINISHED' };

export const SERVER_RESTARTED = 'SERVER_RESTARTED';

const toDto = (row) => ({
  id: row.id,
  proposalId: row.proposal_id,
  state: row.state,
  phase: row.phase,
  provider: row.provider,
  sourceLanguage: row.source_language,
  generationLocale: row.generation_locale,
  regenerate: row.regenerate === 1,
  estimatedUnits: row.estimated_units,
  reservationId: row.reservation_id,
  consumedUnits: row.consumed_units,
  createdAt: row.created_at,
  startedAt: row.started_at,
  lastActivityAt: row.last_activity_at,
  finishedAt: row.finished_at,
  errorCode: row.error_code,
  errorMessage: row.error_message,
  draftId: row.draft_id,
  cancelRequestedAt: row.cancel_requested_at,
});

const ACTIVE_SQL = ACTIVE_STATES.map((s) => `'${s}'`).join(', ');

function activeRow(db, userId, proposalId) {
  return db.prepare(`SELECT * FROM generation_jobs WHERE user_id = ? AND proposal_id = ? AND state IN (${ACTIVE_SQL}) LIMIT 1`).get(userId, proposalId);
}

/**
 * Records a job for one proposal, or returns the ACTIVE one that already exists (`created: false`). Everything that generation
 * itself refuses before involving a provider is refused here too (unknown/foreign proposal, no usable text, editorial unit,
 * payload outside the approved scope, input too large) and leaves no row. `provider` is {name, live, plannedCalls}: a live
 * provider gets a cost estimate recorded (priced and reserved for real when the job runs); the test double spends nothing.
 */
export function createJob(db, userId, proposalId, { provider, regenerate = false, localeHint = null, maxInputChars = 50_000, now = () => new Date() } = {}) {
  if (!provider || typeof provider.name !== 'string' || provider.name.length === 0) throw new JobError('VALIDATION_FAILED', 'Provedor da geração não informado.', 'provider');
  const existing = activeRow(db, userId, proposalId);
  if (existing) return { job: toDto(existing), created: false };

  let prepared;
  try {
    prepared = prepareGeneration(db, userId, proposalId, { maxInputChars });
  } catch (err) {
    if (err instanceof DraftError) throw new JobError(err.code, err.message, err.field);
    throw err;
  }
  const { segments } = prepared.found;
  const payloadChars = segments.reduce((sum, s) => sum + s.text.length, 0);
  const estimatedUnits = provider.live === true ? estimateCostUnits({ payloadChars, calls: provider.plannedCalls ?? 1 }) : 0;
  const at = now().toISOString();

  const run = db.transaction(() => {
    const raced = activeRow(db, userId, proposalId);
    if (raced) return { job: toDto(raced), created: false };
    const generationLocale = ensureGenerationLocale(db, userId, localeHint);
    const result = db.prepare(`
      INSERT INTO generation_jobs (user_id, proposal_id, state, phase, provider, source_language, generation_locale, scope_digest,
                                   regenerate, estimated_units, created_at, last_activity_at)
      VALUES (?, ?, 'QUEUED', 'QUEUED', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, proposalId, provider.name, detectSourceLanguage(segments), generationLocale, segmentsDigest(segments), regenerate ? 1 : 0, estimatedUnits, at, at);
    return { job: toDto(db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(result.lastInsertRowid)), created: true };
  });
  return run.immediate();
}

export function getJob(db, userId, jobId) {
  const row = db.prepare('SELECT * FROM generation_jobs WHERE user_id = ? AND id = ?').get(userId, jobId);
  if (!row) throw new JobError('NOT_FOUND', 'Geração não encontrada.');
  return toDto(row);
}

/** The student's jobs, newest first; optionally only those of one proposal. Never another user's. */
export function listJobs(db, userId, { proposalId = null, limit = 100 } = {}) {
  const rows = proposalId === null
    ? db.prepare('SELECT * FROM generation_jobs WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit)
    : db.prepare('SELECT * FROM generation_jobs WHERE user_id = ? AND proposal_id = ? ORDER BY id DESC LIMIT ?').all(userId, proposalId, limit);
  return rows.map(toDto);
}

/**
 * Moves a job along the state machine (system-level: the runner of the job, not a user request). Invalid moves throw
 * INVALID_TRANSITION and change nothing. A FAILED job carries its error code; a SUCCEEDED job carries its draft.
 * The move is a compare-and-set on the current state, so two racing transitions cannot both win.
 */
export function transitionJob(db, jobId, to, { phase, errorCode, errorMessage, draftId, consumedUnits, reservationId, now = () => new Date() } = {}) {
  if (!JOB_STATES.includes(to)) throw new JobError('VALIDATION_FAILED', `Estado desconhecido: ${to}.`, 'state');
  if (phase !== undefined && !JOB_PHASES.includes(phase)) throw new JobError('VALIDATION_FAILED', `Fase desconhecida: ${phase}.`, 'phase');
  const run = db.transaction(() => {
    const row = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    if (!row) throw new JobError('NOT_FOUND', 'Geração não encontrada.');
    if (!TRANSITIONS[row.state].includes(to)) throw new JobError('INVALID_TRANSITION', `Uma geração ${row.state} não pode passar a ${to}.`, 'state');
    if (to === 'FAILED' && !errorCode) throw new JobError('VALIDATION_FAILED', 'Uma falha precisa do código do erro.', 'errorCode');
    if (to === 'SUCCEEDED' && !Number.isInteger(draftId)) throw new JobError('VALIDATION_FAILED', 'Uma geração concluída precisa do rascunho gerado.', 'draftId');
    const at = now().toISOString();
    const terminal = TERMINAL_STATES.includes(to);
    const result = db.prepare(`
      UPDATE generation_jobs SET
        state = ?, phase = ?, last_activity_at = ?,
        started_at = CASE WHEN ? = 'CALLING_PROVIDER' AND started_at IS NULL THEN ? ELSE started_at END,
        finished_at = CASE WHEN ? THEN ? ELSE finished_at END,
        error_code = ?, error_message = ?, draft_id = COALESCE(?, draft_id),
        consumed_units = COALESCE(?, consumed_units), reservation_id = COALESCE(?, reservation_id),
        cancel_requested_at = CASE WHEN ? = 'CANCELLED' AND cancel_requested_at IS NULL THEN ? ELSE cancel_requested_at END
      WHERE id = ? AND state = ?
    `).run(
      to, phase ?? (to === 'STALLED' ? row.phase : DEFAULT_PHASE[to]), at,
      to, at,
      terminal ? 1 : 0, at,
      to === 'FAILED' ? errorCode : null, to === 'FAILED' ? (errorMessage ?? null) : null, to === 'SUCCEEDED' ? draftId : null,
      consumedUnits ?? null, reservationId ?? null,
      to, at,
      jobId, row.state,
    );
    if (result.changes !== 1) throw new JobError('INVALID_TRANSITION', 'A geração mudou de estado ao mesmo tempo.', 'state');
    return toDto(db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId));
  });
  return run.immediate();
}

/**
 * Progress of an ACTIVE job without a state change: the phase the student sees and "something happened just now". Recording the
 * credit reservation the run took (`reservationId`) also goes through here. A job that already finished is never touched.
 * @returns {boolean} whether an active job was updated
 */
export function touchJob(db, jobId, { phase, reservationId, now = () => new Date() } = {}) {
  if (phase !== undefined && !JOB_PHASES.includes(phase)) throw new JobError('VALIDATION_FAILED', `Fase desconhecida: ${phase}.`, 'phase');
  return db.prepare(`
    UPDATE generation_jobs SET phase = COALESCE(?, phase), last_activity_at = ?, reservation_id = COALESCE(?, reservation_id)
    WHERE id = ? AND state IN ('CALLING_PROVIDER', 'STALLED')
  `).run(phase ?? null, now().toISOString(), reservationId ?? null, jobId).changes === 1;
}

/** Records that the student asked to stop an ACTIVE job (kept even if the job ends some other way first). */
export function markCancelRequested(db, jobId, { now = () => new Date() } = {}) {
  db.prepare(`UPDATE generation_jobs SET cancel_requested_at = COALESCE(cancel_requested_at, ?) WHERE id = ? AND state IN (${ACTIVE_SQL})`).run(now().toISOString(), jobId);
}

/** Every job still QUEUED, oldest first, across users (system-level: the runner resumes them after a restart). */
export function listQueuedJobs(db) {
  return db.prepare("SELECT * FROM generation_jobs WHERE state = 'QUEUED' ORDER BY id").all().map((row) => ({ ...toDto(row), userId: row.user_id }));
}

/** The user-owned job row of a proposal that is still active (QUEUED, CALLING_PROVIDER or STALLED), or null. */
export function activeJobOfProposals(db, userId, proposalIds) {
  if (proposalIds.length === 0) return null;
  const marks = proposalIds.map(() => '?').join(', ');
  const row = db.prepare(`SELECT * FROM generation_jobs WHERE user_id = ? AND proposal_id IN (${marks}) AND state IN (${ACTIVE_SQL}) LIMIT 1`).get(userId, ...proposalIds);
  return row ? toDto(row) : null;
}

/**
 * INV-13 at run time: the job may only run on the exact text it was created on. If the proposal's text changed since (the
 * source was re-extracted differently), throws SCOPE_CHANGED and the caller must create a NEW job, validated and priced again.
 */
export function assertJobScopeIntact(db, userId, jobId) {
  const row = db.prepare('SELECT * FROM generation_jobs WHERE user_id = ? AND id = ?').get(userId, jobId);
  if (!row) throw new JobError('NOT_FOUND', 'Geração não encontrada.');
  let prepared;
  try {
    prepared = prepareGeneration(db, userId, row.proposal_id, { maxInputChars: Number.MAX_SAFE_INTEGER });
  } catch (err) {
    if (err instanceof DraftError) throw new JobError('SCOPE_CHANGED', 'O trecho aprovado mudou desde que esta geração foi criada. Crie uma nova.');
    throw err;
  }
  if (segmentsDigest(prepared.found.segments) !== row.scope_digest) {
    throw new JobError('SCOPE_CHANGED', 'O texto do trecho aprovado mudou desde que esta geração foi criada. Crie uma nova.');
  }
}

/**
 * On server startup no provider call from a previous process is still running, so a job left CALLING_PROVIDER (or STALLED) is
 * an orphan: it becomes FAILED(SERVER_RESTARTED) and its proposal can be generated again. QUEUED jobs never reached a
 * provider and are left for the runner (`resumeQueued`), which resumes them. Returns how many jobs were recovered.
 * Its credit reservation, if any, stays RESERVED and is settled at its estimate by `reconcileOrphans` (never refunded: R-12).
 */
export function recoverOrphanJobs(db, { now = () => new Date() } = {}) {
  const at = now().toISOString();
  return db.prepare(`
    UPDATE generation_jobs SET state = 'FAILED', phase = 'FINISHED', error_code = ?, error_message = ?, finished_at = ?, last_activity_at = ?
    WHERE state IN ('CALLING_PROVIDER', 'STALLED')
  `).run(SERVER_RESTARTED, 'O servidor foi reiniciado durante a geração. Nada foi salvo; gere de novo.', at, at).changes;
}
