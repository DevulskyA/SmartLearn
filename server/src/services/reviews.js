import { checkIdempotency, recordIdempotency } from './idempotency.js';

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
export function localDateString(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(date); // en-CA formats as YYYY-MM-DD
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getUserTimezone(db, userId) {
  const row = db.prepare('SELECT timezone FROM user_settings WHERE user_id = ?').get(userId);
  return row?.timezone ?? 'America/Sao_Paulo';
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
  };
}

const TASK_SELECT = `
  SELECT rt.*, lu.title, lu.subject_id, s.name as subject_name
  FROM review_tasks rt
  JOIN learning_units lu ON lu.user_id = rt.user_id AND lu.id = rt.unit_id
  JOIN subjects s ON s.user_id = rt.user_id AND s.id = lu.subject_id
  WHERE rt.user_id = ?
`;

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

  const overdue = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NULL AND rt.due_date < ? ORDER BY rt.due_date`).all(userId, today).map(taskDto);
  const dueToday = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NULL AND rt.due_date = ? ORDER BY rt.due_date`).all(userId, today).map(taskDto);
  const dueTomorrow = db.prepare(`${TASK_SELECT} AND rt.completed_at IS NULL AND rt.due_date = ? ORDER BY rt.due_date`).all(userId, tomorrow).map(taskDto);

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
    const today = nowIso.slice(0, 10);

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
  if (!task.completed_at) throw new ReviewError('VALIDATION_FAILED', 'Esta revisão ainda não foi concluída.');

  db.prepare('UPDATE review_tasks SET completed_at = NULL WHERE user_id = ? AND id = ?').run(userId, reviewTaskId);
  return { reviewTaskId, reopened: true };
}
