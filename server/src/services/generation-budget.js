// GENERATION BUDGET (R-12, INV-13). The ledger that keeps a student (and the product) from spending model credit by accident.
//
// Cost unit: estimated model tokens, the same for every provider. Before a provider is called the estimate must be
//   <= the per-job maximum  AND  <= the weekly balance left  AND  <= the monthly balance left,
// where "balance left" subtracts what other jobs have RESERVED and what finished jobs actually CONSUMED. The reservation is a
// single immediate SQLite transaction, so two jobs (two awaits in one process, or two connections to the file) can never spend
// the same balance. After the call the reservation is SETTLED at the consumed amount; a failure before any external call
// RELEASES it with nothing debited.
//
// The limit VALUES are not decided here (HG-11): they arrive as `limits`, and a null limit means "no limit on that
// dimension". The estimation constants below are internal safety multipliers, NOT commercial prices, and are to be calibrated
// by the measurement experiment HG-11 proposes.
import { MAX_SUMMARY_LENGTH } from '../ai/draft-schema.js';
import { config } from '../config.js';

export class BudgetError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    Object.assign(this, details);
  }
}

/** Conservative, UNCALIBRATED defaults. chars-per-unit 3 is below the usual ~4 so the estimate leans high. */
export const ESTIMATION = Object.freeze({
  charsPerUnit: 3,
  // A generous ceiling for what one call can write back (summary up to its limit plus a few dozen questions).
  outputUnitsPerCall: Math.ceil((MAX_SUMMARY_LENGTH * 3) / 3),
  // generate + independent audit + one repair: the most a live provider is allowed per draft.
  defaultCalls: 3,
});

const BASES = new Set(['MEASURED', 'ESTIMATED', 'ESTIMATED_ORPHAN']);

/** @returns estimated units for ONE generation attempt over `payloadChars` of approved source text. */
export function estimateCostUnits({ payloadChars, calls = ESTIMATION.defaultCalls }) {
  if (!Number.isFinite(payloadChars) || payloadChars < 0) throw new RangeError('payloadChars must be a non-negative number');
  if (!Number.isInteger(calls) || calls < 1) throw new RangeError('calls must be a positive integer');
  return calls * (Math.ceil(payloadChars / ESTIMATION.charsPerUnit) + ESTIMATION.outputUnitsPerCall);
}

/** UTC ISO week ("2026-W41", Monday start, year of the week's Thursday) and calendar month ("2026-10") of an instant. */
export function periodKeys(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this ISO week decides its year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return {
    weekKey: `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    monthKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

const defaultLimits = () => config.generationLimits ?? { maxPerJob: null, weekly: null, monthly: null };

const SPENT_SQL = `COALESCE(SUM(CASE state WHEN 'RESERVED' THEN estimated_units WHEN 'SETTLED' THEN consumed_units ELSE 0 END), 0)`;

function usageOf(db, userId, column, key) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN state = 'RESERVED' THEN estimated_units ELSE 0 END), 0) AS reserved,
           COALESCE(SUM(CASE WHEN state = 'SETTLED' THEN consumed_units ELSE 0 END), 0) AS consumed,
           ${SPENT_SQL} AS spent
    FROM generation_reservations WHERE user_id = ? AND ${column} = ?
  `).get(userId, key);
  return row;
}

const remainingOf = (limit, spent) => (limit === null || limit === undefined ? null : Math.max(0, limit - spent));

/** Reserved, consumed and what is left in the current week and month for this user. */
export function getUsage(db, userId, { limits = defaultLimits(), now = () => new Date() } = {}) {
  const { weekKey, monthKey } = periodKeys(now());
  const week = usageOf(db, userId, 'week_key', weekKey);
  const month = usageOf(db, userId, 'month_key', monthKey);
  return {
    perJob: { limit: limits.maxPerJob ?? null },
    weekly: { key: weekKey, reserved: week.reserved, consumed: week.consumed, limit: limits.weekly ?? null, remaining: remainingOf(limits.weekly, week.spent) },
    monthly: { key: monthKey, reserved: month.reserved, consumed: month.consumed, limit: limits.monthly ?? null, remaining: remainingOf(limits.monthly, month.spent) },
  };
}

/**
 * Holds `estimatedUnits` for one generation attempt, or throws BudgetError BUDGET_EXCEEDED naming the dimension (PER_JOB |
 * WEEKLY | MONTHLY) without writing anything. Atomic (BEGIN IMMEDIATE): the check and the insert cannot interleave with another job.
 */
export function reserve(db, userId, { proposalId = null, estimatedUnits, limits = defaultLimits(), now = () => new Date() }) {
  if (!Number.isInteger(estimatedUnits) || estimatedUnits < 0) throw new RangeError('estimatedUnits must be a non-negative integer');
  const run = db.transaction(() => {
    const at = now();
    const { weekKey, monthKey } = periodKeys(at);
    const refuse = (limit, remaining) => new BudgetError('BUDGET_EXCEEDED', `Esta geração (estimada em ${estimatedUnits}) excede o limite ${limit === 'PER_JOB' ? 'por geração' : limit === 'WEEKLY' ? 'semanal' : 'mensal'} disponível. Nenhuma chamada foi feita e nada foi debitado.`, { limit, remaining, requested: estimatedUnits });
    if (limits.maxPerJob !== null && limits.maxPerJob !== undefined && estimatedUnits > limits.maxPerJob) throw refuse('PER_JOB', limits.maxPerJob);
    const weekLeft = remainingOf(limits.weekly, usageOf(db, userId, 'week_key', weekKey).spent);
    if (weekLeft !== null && estimatedUnits > weekLeft) throw refuse('WEEKLY', weekLeft);
    const monthLeft = remainingOf(limits.monthly, usageOf(db, userId, 'month_key', monthKey).spent);
    if (monthLeft !== null && estimatedUnits > monthLeft) throw refuse('MONTHLY', monthLeft);
    const iso = at.toISOString();
    const result = db.prepare(`
      INSERT INTO generation_reservations (user_id, proposal_id, state, estimated_units, week_key, month_key, created_at)
      VALUES (?, ?, 'RESERVED', ?, ?, ?, ?)
    `).run(userId, proposalId, estimatedUnits, weekKey, monthKey, iso);
    return { id: Number(result.lastInsertRowid), state: 'RESERVED', estimatedUnits, weekKey, monthKey };
  });
  return run.immediate();
}

function finish(db, id, { state, consumedUnits, basis, now }) {
  const row = db.prepare('SELECT state FROM generation_reservations WHERE id = ?').get(id);
  if (!row) throw new BudgetError('NOT_FOUND', 'Reserva não encontrada.');
  const result = db.prepare(`
    UPDATE generation_reservations SET state = ?, consumed_units = ?, consumption_basis = ?, settled_at = ?
    WHERE id = ? AND state = 'RESERVED'
  `).run(state, consumedUnits, basis, now().toISOString(), id);
  if (result.changes !== 1) throw new BudgetError('INVALID_STATE', `Reserva no estado ${row.state} não pode mais ser encerrada.`);
}

/** The call happened: record what it cost (never below 0, never refused for being above the reservation — it was spent). */
export function settle(db, id, { consumedUnits, basis, now = () => new Date() }) {
  if (!Number.isInteger(consumedUnits) || consumedUnits < 0) throw new RangeError('consumedUnits must be a non-negative integer');
  if (!BASES.has(basis)) throw new RangeError(`basis must be one of ${[...BASES].join(', ')}`);
  finish(db, id, { state: 'SETTLED', consumedUnits, basis, now });
}

/** The attempt failed BEFORE any external call: nothing was spent, the held balance returns. */
export function release(db, id, { now = () => new Date() } = {}) {
  finish(db, id, { state: 'RELEASED', consumedUnits: 0, basis: null, now });
}

/**
 * A crash can leave a reservation open after the provider may already have been called. Refunding it would let a crash
 * create free credit, so an old unresolved reservation is settled at its ESTIMATE. Returns how many were settled.
 */
export function reconcileOrphans(db, { maxAgeMs, now = () => new Date() }) {
  const cutoff = new Date(now().getTime() - maxAgeMs).toISOString();
  return db.prepare(`
    UPDATE generation_reservations SET state = 'SETTLED', consumed_units = estimated_units, consumption_basis = 'ESTIMATED_ORPHAN', settled_at = ?
    WHERE state = 'RESERVED' AND created_at < ?
  `).run(now().toISOString(), cutoff).changes;
}
