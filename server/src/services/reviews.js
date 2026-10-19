import { checkIdempotency, recordIdempotency } from './idempotency.js';
import { get as getSettings } from './settings.js';
import { deriveObligations, RECOVERY } from '../../../shared/review-obligation.js';

export class ReviewError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

/** Local-calendar-day string (YYYY-MM-DD) for `date` in the given IANA
 * timezone, using Intl rather than manual UTC-offset math so DST
 * transitions are handled correctly by the platform's tz database. */
// One formatter per timezone: building an Intl.DateTimeFormat costs ~50 µs and agenda() calls this once per completed task (183 ms at 3,200 tasks).
const dayFormatters = new Map();
export function localDateString(date, timezone) {
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timezone, formatter);
  }
  return formatter.format(date); // en-CA formats as YYYY-MM-DD
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getUserTimezone(db, userId) {
  return getSettings(db, userId).timezone;
}

function taskDto(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitTitle: row.title,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    offsetDays: row.offset_days,
  };
}

const TASK_SELECT = `
  SELECT rt.*, lu.title, lu.subject_id, s.name as subject_name
  FROM review_tasks rt
  JOIN learning_units lu ON lu.user_id = rt.user_id AND lu.id = rt.unit_id
  JOIN subjects s ON s.user_id = rt.user_id AND s.id = lu.subject_id
  WHERE rt.user_id = ?
`;

// A review the student did NOT perform but that a performed one retired (experimental D-13 option) is no longer asked for. Without a row in
// review_task_supersessions (every V1 flow) this filter removes nothing.
const NOT_SUPERSEDED = ' AND NOT EXISTS (SELECT 1 FROM review_task_supersessions sup WHERE sup.user_id = rt.user_id AND sup.task_id = rt.id)';
// A unit whose reviews the student paused is not asked for (experimental). With no pause event (every V1 flow) this removes nothing.
const NOT_PAUSED = " AND COALESCE((SELECT p.action FROM review_unit_pauses p WHERE p.user_id = rt.user_id AND p.unit_id = rt.unit_id ORDER BY p.id DESC LIMIT 1), 'RESUME') != 'PAUSE'";

/**
 * Agenda buckets with explicit local-day semantics (design.md §4).
 * completedToday includes REVIEW-ONLY completions (no questions), not just
 * question-based evidence — heritage.md H-03: Hoje is a decision surface,
 * not a database browser, so "did I do something today" must reflect any
 * completion, not only ones with recorded question counts.
 */
export function agenda(db, userId, { date, timezoneOverride } = {}) {
  const timezone = timezoneOverride ?? getUserTimezone(db, userId);
  const today = date ?? localDateString(new Date(), timezone);
  const tomorrow = addDays(today, 1);

  const overdue = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NULL${NOT_SUPERSEDED}${NOT_PAUSED} AND rt.due_date < ? ORDER BY rt.due_date`).all(userId, today).map(taskDto);
  const dueToday = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NULL${NOT_SUPERSEDED}${NOT_PAUSED} AND rt.due_date = ? ORDER BY rt.due_date`).all(userId, today).map(taskDto);
  const dueTomorrow = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NULL${NOT_SUPERSEDED}${NOT_PAUSED} AND rt.due_date = ? ORDER BY rt.due_date`).all(userId, tomorrow).map(taskDto);

  // completedToday: any task whose completed_at falls on `today` in the
  // user's timezone — computed in JS (not SQL date()) so the same
  // Intl-based local-day logic governs both "due" and "completed" buckets.
  const completedCandidates = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NOT NULL`).all(userId);
  const completedToday = completedCandidates
    .filter(row => localDateString(new Date(row.completed_at), timezone) === today)
    .map(taskDto);

  return { date: today, timezone, overdue, today: dueToday, tomorrow: dueTomorrow, completedToday };
}

/**
 * EXPERIMENTAL (HG-09 / D-12 option 3), read-only: the one review each unit requires today, with its older overdue stages counted under it.
 * Nothing is written and no due date moves. `recovery` (D-13) is only echoed: it describes what completing the required review WOULD do and is
 * not applied here; the anchor of the next interval (D-14) is not modelled. Not used by any screen.
 */
export function obligations(db, userId, { date, timezoneOverride, recovery = RECOVERY.NONE } = {}) {
  if (!Object.values(RECOVERY).includes(recovery)) throw new ReviewError('VALIDATION_FAILED', 'recovery não é reconhecido.', 'recovery');
  const timezone = timezoneOverride ?? getUserTimezone(db, userId);
  const today = date ?? localDateString(new Date(), timezone);
  const tasks = db.prepare(`${TASK_SELECT}${NOT_SUPERSEDED} ORDER BY rt.due_date`).all(userId).map((row) => ({ ...taskDto(row), completedAt: row.completed_at ?? null }));
  const titles = new Map(tasks.map((t) => [t.unitId, t.unitTitle]));
  const subjects = new Map(tasks.map((t) => [t.unitId, t.subjectId]));
  const brief = (t) => (t ? { id: t.id, dueDate: t.dueDate, offsetDays: t.offsetDays } : null);
  const paused = pausedUnitIds(db, userId);
  const units = deriveObligations(tasks, today).map((u) => ({
    unitId: u.unitId,
    unitTitle: titles.get(u.unitId),
    subjectId: subjects.get(u.unitId),
    paused: paused.has(u.unitId),
    // a paused unit owes nothing today, but what WOULD be owed stays visible (the plan lists it as deferred with the reason PAUSED)
    required: paused.has(u.unitId) ? null : brief(u.required),
    pausedRequired: paused.has(u.unitId) ? brief(u.required) : null,
    collapsedCount: u.collapsed.length,
    upcoming: brief(u.upcoming),
    pendingCount: u.pendingCount,
  }));
  return { date: today, timezone, recovery, units };
}

/** Units whose latest pause event is PAUSE. */
function pausedUnitIds(db, userId) {
  const rows = db.prepare(`
    SELECT p.unit_id AS unitId, p.action FROM review_unit_pauses p
    WHERE p.user_id = ? AND p.id = (SELECT MAX(q.id) FROM review_unit_pauses q WHERE q.user_id = p.user_id AND q.unit_id = p.unit_id)
  `).all(userId);
  return new Set(rows.filter((r) => r.action === 'PAUSE').map((r) => r.unitId));
}

function setPause(db, userId, unitId, action) {
  const unit = db.prepare('SELECT id FROM learning_units WHERE user_id = ? AND id = ?').get(userId, unitId);
  if (!unit) throw new ReviewError('NOT_FOUND', 'Unidade não encontrada.');
  const wasPaused = pausedUnitIds(db, userId).has(unitId);
  const changed = (action === 'PAUSE') !== wasPaused;
  if (changed) db.prepare('INSERT INTO review_unit_pauses (user_id, unit_id, action, at) VALUES (?, ?, ?, ?)').run(userId, unitId, action, new Date().toISOString());
  return { unitId, paused: action === 'PAUSE', changed };
}

/**
 * EXPERIMENTAL: the student pauses (or resumes) the reviews of one unit. A fact in an append-only log: it completes nothing, retires nothing, moves no
 * date and is no learning; repeating it changes nothing (idempotent). A paused unit is not asked for (agenda, obligations) but stays visible in the plan.
 */
export const pauseUnit = (db, userId, unitId) => setPause(db, userId, unitId, 'PAUSE');
export const resumeUnit = (db, userId, unitId) => setPause(db, userId, unitId, 'RESUME');

export const ANCHORS = Object.freeze({ PLANNED_DATE: 'PLANNED_DATE', ACTUAL_DATE: 'ACTUAL_DATE' });

/**
 * Named combinations of the two parameters. V1 is today's calendar. DECIDED is the student's experimental decision of 2026-10-19: a performed review
 * satisfies the unit's single obligation (D-13), nothing is retired or forgiven - the later stages, overdue or not, are re-dated from the day it was
 * really done, so progression advances ONE stage per performed review and the planned dates that passed stay in the reschedule log (D-14).
 * SUPERSEDE_OVERDUE is NOT part of DECIDED: it would skip stages, which D-14 forbids.
 */
export const PROFILES = Object.freeze({
  V1: { recovery: RECOVERY.NONE, anchor: ANCHORS.PLANNED_DATE },
  DECIDED: { recovery: RECOVERY.NONE, anchor: ANCHORS.ACTUAL_DATE },
});

/**
 * EXPERIMENTAL (HG-09 / D-12 option 3), D4b: perform the ONE review a unit requires today, with the two open decisions as NAMED parameters.
 *   recovery  D-13  NONE (default = V1: the older overdue ones stay owed) | SUPERSEDE_OVERDUE (they are retired as NOT performed: no completion,
 *                   no evidence, a row in review_task_supersessions; history rows are never deleted)
 *   anchor    D-14  PLANNED_DATE (default = V1: no date moves) | ACTUAL_DATE (the still-pending LATER stages are re-dated from the day the review was
 *                   really done, keeping each gap of the fixed schedule; the original date stays in review_task_reschedules)
 * The completion itself is the existing complete() (same rules, same evidence rules: without questions it is activity, not evidence).
 * Disposable databases only until the student integrates migration 034.
 */
export function completeObligation(db, userId, unitId, { date, timezoneOverride, profile, recovery: recoveryArg, anchor: anchorArg, questionsCount, correctCount, operationKey } = {}, now = () => new Date()) {
  if (profile !== undefined && !Object.hasOwn(PROFILES, profile)) throw new ReviewError('VALIDATION_FAILED', 'profile não é reconhecido.', 'profile');
  const recovery = recoveryArg ?? PROFILES[profile ?? 'V1'].recovery;
  const anchor = anchorArg ?? PROFILES[profile ?? 'V1'].anchor;
  if (!Object.values(RECOVERY).includes(recovery)) throw new ReviewError('VALIDATION_FAILED', 'recovery não é reconhecido.', 'recovery');
  if (!Object.values(ANCHORS).includes(anchor)) throw new ReviewError('VALIDATION_FAILED', 'anchor não é reconhecido.', 'anchor');
  const run = db.transaction(() => {
    const view = obligations(db, userId, { date, timezoneOverride, recovery });
    const entry = view.units.find((u) => u.unitId === unitId);
    const base = { profile: profile ?? null, recovery, anchor, date: view.date, completedId: null, supersededIds: [], rescheduled: [], ...(entry?.paused ? { reason: 'PAUSED' } : {}) };
    if (!entry?.required) return base;
    const completed = complete(db, userId, entry.required.id, { questionsCount, correctCount, operationKey }, now);
    const nowIso = completed.completedAt;
    const pending = db.prepare(`${TASK_SELECT} AND rt.unit_id = ? AND rt.completed_at IS NULL${NOT_SUPERSEDED} ORDER BY rt.due_date`).all(userId, unitId);
    const supersededIds = [];
    if (recovery === RECOVERY.SUPERSEDE_OVERDUE) {
      const insert = db.prepare('INSERT INTO review_task_supersessions (user_id, task_id, superseded_by_task_id, policy, superseded_at) VALUES (?, ?, ?, ?, ?)');
      for (const t of pending.filter((p) => p.due_date <= view.date)) { insert.run(userId, t.id, entry.required.id, recovery, nowIso); supersededIds.push(t.id); }
    }
    const rescheduled = [];
    if (anchor === ANCHORS.ACTUAL_DATE) {
      const update = db.prepare('UPDATE review_tasks SET due_date = ? WHERE user_id = ? AND id = ?');
      const log = db.prepare('INSERT INTO review_task_reschedules (user_id, task_id, from_due_date, to_due_date, anchor, anchored_on_task_id, rescheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const t of pending.filter((p) => !supersededIds.includes(p.id) && p.offset_days > entry.required.offsetDays)) {
        const to = addDays(view.date, t.offset_days - entry.required.offsetDays);
        if (to === t.due_date) continue;
        update.run(to, userId, t.id);
        log.run(userId, t.id, t.due_date, to, anchor, entry.required.id, nowIso);
        rescheduled.push({ taskId: t.id, from: t.due_date, to });
      }
    }
    return { ...base, completedId: entry.required.id, completedAt: nowIso, reviewOnly: completed.reviewOnly, evidenceId: completed.evidenceId, supersededIds, rescheduled };
  });
  return run();
}

/**
 * Full owned listing, optionally scoped to one unit — unlike agenda()'s
 * date-bucketed view, this returns every review task regardless of due
 * date or completion state. Needed by tracking/analytics-style screens
 * that reason over a unit's whole review history, not just what's due now.
 */
export function list(db, userId, { unitId } = {}) {
  const query = unitId !== undefined
    ? `${TASK_SELECT} AND rt.unit_id = ? ORDER BY rt.due_date`
    : `${TASK_SELECT} ORDER BY rt.due_date`;
  const params = unitId !== undefined ? [userId, unitId] : [userId];
  return db.prepare(query).all(...params).map(taskDto);
}

/**
 * Completes a review task. Omitting `questionsCount` is review-only
 * completion (valid — heritage.md: "É válido concluir uma revisão sem
 * responder questões"; no fake evidence is invented). With questions,
 * requires integer q>0 and 0<=c<=q, and atomically records ONE aggregate
 * REVIEW learning_evidence row alongside marking the task complete — server
 * derives the score, never trusts a client-computed percentage.
 *
 * An already-completed task cannot be completed again through this
 * endpoint (ALREADY_COMPLETED) — use reopen() first, an explicit audited
 * operation, never a silent overwrite of prior historical fact.
 */
export function complete(db, userId, reviewTaskId, { questionsCount, correctCount, operationKey } = {}, now = () => new Date()) {
  const task = db.prepare('SELECT * FROM review_tasks WHERE user_id = ? AND id = ?').get(userId, reviewTaskId);
  if (!task) throw new ReviewError('NOT_FOUND', 'Revisão não encontrada.');

  const hasQuestions = questionsCount !== undefined && questionsCount !== null;
  if (hasQuestions) {
    if (!Number.isInteger(questionsCount) || questionsCount <= 0) {
      throw new ReviewError('VALIDATION_FAILED', 'questionsCount deve ser um inteiro positivo.', 'questionsCount');
    }
    if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > questionsCount) {
      throw new ReviewError('VALIDATION_FAILED', 'correctCount deve ser um inteiro entre 0 e questionsCount.', 'correctCount');
    }
  }

  const idempotencyPayload = { reviewTaskId, questionsCount: questionsCount ?? null, correctCount: correctCount ?? null };
  const check = checkIdempotency(db, { userId, operation: 'complete-review', operationKey, payload: idempotencyPayload });
  if (check.cached) return check.result;

  if (task.completed_at) {
    throw new ReviewError('ALREADY_COMPLETED', 'Esta revisão já foi concluída. Use a correção explícita para reabrir.');
  }

  const run = db.transaction(() => {
    const nowIso = now().toISOString();
    // The evidence day is the student's local day (saved timezone, default America/Sao_Paulo), not the UTC day (TG-01, D-T7).
    const today = localDateString(new Date(nowIso), getUserTimezone(db, userId));

    db.prepare('UPDATE review_tasks SET completed_at = ? WHERE user_id = ? AND id = ?').run(nowIso, userId, reviewTaskId);

    let evidence = null;
    if (hasQuestions) {
      const evidenceResult = db.prepare(`
        INSERT INTO learning_evidence (user_id, unit_id, review_task_id, type, questions_count, correct_count, evidence_date, created_at)
        VALUES (?, ?, ?, 'REVIEW', ?, ?, ?, ?)
      `).run(userId, task.unit_id, task.id, questionsCount, correctCount, today, nowIso);
      evidence = db.prepare('SELECT * FROM learning_evidence WHERE id = ?').get(evidenceResult.lastInsertRowid);
    }

    const result = {
      reviewTaskId: task.id,
      completedAt: nowIso,
      reviewOnly: !hasQuestions,
      score: hasQuestions ? correctCount / questionsCount : null,
      evidenceId: evidence?.id ?? null,
    };

    recordIdempotency(db, { userId, operation: 'complete-review', operationKey, payloadHash: check.payloadHash, result });
    return result;
  });

  return run();
}

/**
 * Explicit audited reopen: clears completed_at so the task can be completed
 * again, but NEVER deletes or mutates the learning_evidence row a prior
 * completion created — heritage.md H-06: history is distinct from schedule,
 * and a scheduler/UI correction must never erase observed historical fact.
 */
export function reopen(db, userId, reviewTaskId) {
  const task = db.prepare('SELECT * FROM review_tasks WHERE user_id = ? AND id = ?').get(userId, reviewTaskId);
  if (!task) throw new ReviewError('NOT_FOUND', 'Revisão não encontrada.');
  // its own code: a client whose first reopen reply was lost must be able to tell "already reopened" from a bad request
  if (!task.completed_at) throw new ReviewError('NOT_COMPLETED', 'Esta revisão ainda não foi concluída.');

  db.prepare('UPDATE review_tasks SET completed_at = NULL WHERE user_id = ? AND id = ?').run(userId, reviewTaskId);
  return { reviewTaskId, reopened: true };
}
