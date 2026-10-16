import { checkIdempotency, recordIdempotency } from './idempotency.js';
import { normalizeLearningEvent, LearningEventError, ASSISTANCE_LEVELS } from '../domain/learning-event.js';

export class AttemptError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

function assistanceRank(level) {
  return ASSISTANCE_LEVELS.indexOf(level);
}

/** The ceiling of assistance a given exercise version can ever offer —
 * a static fact about the item's content, not an observation about any
 * one attempt. Revealing an answer that doesn't exist is impossible, so
 * a version with no answer text can never be assisted past HINT. */
function maxAssistanceAvailable(versionRow) {
  if (versionRow.answer) return 'SOLUTION';
  if (versionRow.hint) return 'HINT';
  return 'NONE';
}

function findOwnedAttempt(db, userId, id) {
  return db.prepare('SELECT * FROM exercise_attempts WHERE user_id = ? AND id = ?').get(userId, id);
}

function findOwnedExerciseWithVersion(db, userId, exerciseId) {
  const exercise = db.prepare('SELECT * FROM exercises WHERE user_id = ? AND id = ?').get(userId, exerciseId);
  if (!exercise) return null;
  const version = db.prepare(`
    SELECT * FROM exercise_versions WHERE user_id = ? AND exercise_id = ? ORDER BY id DESC LIMIT 1
  `).get(userId, exerciseId);
  return { exercise, version };
}

function attemptDto(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    competencyId: row.competency_id,
    reviewTaskId: row.review_task_id,
    exerciseVersionId: row.exercise_version_id,
    status: row.status,
    maxAssistance: row.max_assistance,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
  };
}

/**
 * Starts a server-owned attempt against an exercise's CURRENT version at
 * this exact moment — the version id is captured once, here, and never
 * re-resolved, so a later edit to the exercise (which appends a new
 * version, T17) can never retroactively change what an in-flight or past
 * attempt was scored against (AC-18).
 */
export function start(db, userId, { exerciseId, competencyId = null, reviewTaskId = null }, now = () => new Date()) {
  const found = findOwnedExerciseWithVersion(db, userId, exerciseId);
  if (!found || !found.version) throw new AttemptError('NOT_FOUND', 'Exercício não encontrado.');
  if (found.exercise.archived_at) throw new AttemptError('VALIDATION_FAILED', 'Exercício arquivado não pode iniciar nova tentativa.');

  if (competencyId !== null) {
    const owned = db.prepare('SELECT id FROM competencies WHERE user_id = ? AND id = ? AND unit_id = ?').get(userId, competencyId, found.exercise.unit_id);
    if (!owned) throw new AttemptError('NOT_FOUND', 'Competência não encontrada nesta aula.');
  }
  if (reviewTaskId !== null) {
    // Same-unit invariant enforced here at the service layer (010's
    // migration note): a reviewTaskId belonging to a DIFFERENT unit than
    // this exercise would make T31's reconciliation nonsensical (an
    // attempt "during" a review of unrelated content).
    const owned = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND id = ? AND unit_id = ?').get(userId, reviewTaskId, found.exercise.unit_id);
    if (!owned) throw new AttemptError('NOT_FOUND', 'Revisão não encontrada nesta aula.');
  }

  const nowIso = now().toISOString();
  const result = db.prepare(`
    INSERT INTO exercise_attempts (user_id, unit_id, competency_id, exercise_version_id, review_task_id, status, max_assistance, started_at)
    VALUES (?, ?, ?, ?, ?, 'STARTED', 'NONE', ?)
  `).run(userId, found.exercise.unit_id, competencyId, found.version.id, reviewTaskId, nowIso);

  return {
    ...attemptDto(findOwnedAttempt(db, userId, result.lastInsertRowid)),
    question: found.version.question,
    hint: found.version.hint,
    maxAssistanceAvailable: maxAssistanceAvailable(found.version),
  };
}

function requireOpenAttempt(db, userId, attemptId) {
  const attempt = findOwnedAttempt(db, userId, attemptId);
  if (!attempt) throw new AttemptError('NOT_FOUND', 'Tentativa não encontrada.');
  if (attempt.status !== 'STARTED') throw new AttemptError('ALREADY_SUBMITTED', 'Esta tentativa já foi finalizada.');
  return attempt;
}

function bumpAssistance(db, userId, attemptId, level, now) {
  const attempt = requireOpenAttempt(db, userId, attemptId);
  // Monotonic: assistance only ever escalates within one attempt (AC-16 —
  // "cannot be silently promoted to unique independent success" requires
  // the reverse direction be structurally impossible, not just unlikely).
  if (assistanceRank(level) > assistanceRank(attempt.max_assistance)) {
    db.prepare('UPDATE exercise_attempts SET max_assistance = ? WHERE user_id = ? AND id = ?').run(level, userId, attemptId);
  }
  return findOwnedAttempt(db, userId, attemptId);
}

/** Attributable hint request — the attempt's max_assistance can never be
 * read back below HINT for the rest of this attempt's life. */
export function useHint(db, userId, attemptId, now = () => new Date()) {
  const attempt = requireOpenAttempt(db, userId, attemptId);
  const version = db.prepare('SELECT * FROM exercise_versions WHERE user_id = ? AND id = ?').get(userId, attempt.exercise_version_id);
  if (!version.hint) throw new AttemptError('VALIDATION_FAILED', 'Este exercício não tem dica cadastrada.');
  bumpAssistance(db, userId, attemptId, 'HINT', now);
  return { attemptId, hint: version.hint };
}

/** Attributable solution reveal — the strongest assistance level. Once
 * called, this attempt can never again be scored as independent, by
 * construction: submit() reads max_assistance off this same row and never
 * accepts a client-supplied assistance value (AC-16/AC-17). */
export function revealSolution(db, userId, attemptId, now = () => new Date()) {
  const attempt = requireOpenAttempt(db, userId, attemptId);
  const version = db.prepare('SELECT * FROM exercise_versions WHERE user_id = ? AND id = ?').get(userId, attempt.exercise_version_id);
  if (!version.answer) throw new AttemptError('VALIDATION_FAILED', 'Este exercício não tem resposta cadastrada.');
  bumpAssistance(db, userId, attemptId, 'SOLUTION', now);
  return { attemptId, answer: version.answer };
}

/**
 * Submits the final outcome and closes the attempt, appending exactly one
 * immutable ATTEMPT learning_event (sequence=1 — one canonical observation
 * per attempt). assistanceUsed is NEVER taken from the request body: it is
 * read from this attempt's own max_assistance, so a caller cannot claim
 * independence after using a hint or revealing the solution. Idempotent
 * under a repeated (userId, operationKey) pair with the same payload;
 * without one, resubmitting an already-SUBMITTED attempt fails closed
 * (ALREADY_SUBMITTED) rather than silently accepted or duplicated —
 * mirrors reviews.complete()'s established contract.
 */
export function submit(db, userId, attemptId, { outcome = 'UNKNOWN', assessmentMethod, confidence = null, operationKey } = {}, now = () => new Date()) {
  const attempt = findOwnedAttempt(db, userId, attemptId);
  if (!attempt) throw new AttemptError('NOT_FOUND', 'Tentativa não encontrada.');

  const idempotencyPayload = { attemptId, outcome, assessmentMethod, confidence };
  const check = checkIdempotency(db, { userId, operation: 'submit-attempt', operationKey, payload: idempotencyPayload });
  if (check.cached) return check.result;

  if (attempt.status !== 'STARTED') {
    throw new AttemptError('ALREADY_SUBMITTED', 'Esta tentativa já foi finalizada.');
  }
  if (confidence !== null && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
    throw new AttemptError('VALIDATION_FAILED', 'confidence deve ser um número entre 0 e 1, ou omitido.', 'confidence');
  }

  const run = db.transaction(() => {
    const nowIso = now().toISOString();

    let normalized;
    try {
      normalized = normalizeLearningEvent({
        unitId: attempt.unit_id,
        competencyId: attempt.competency_id,
        attemptId: attempt.id,
        exerciseVersionId: attempt.exercise_version_id,
        kind: 'ATTEMPT',
        sequence: 1,
        outcome,
        assistanceAvailable: maxAssistanceAvailable(
          db.prepare('SELECT * FROM exercise_versions WHERE user_id = ? AND id = ?').get(userId, attempt.exercise_version_id)
        ),
        // Read from the attempt's own tracked state, never trusted from the
        // caller — this is the discriminating guarantee behind AC-16.
        assistanceUsed: attempt.max_assistance,
        assessmentMethod,
        occurredAt: nowIso,
        confidence,
      }, { now: nowIso });
    } catch (err) {
      if (err instanceof LearningEventError) throw new AttemptError(err.code, err.message, err.field);
      throw err;
    }

    db.prepare('UPDATE exercise_attempts SET status = ?, submitted_at = ? WHERE user_id = ? AND id = ?').run('SUBMITTED', nowIso, userId, attempt.id);

    const eventResult = db.prepare(`
      INSERT INTO learning_events (
        user_id, unit_id, competency_id, attempt_id, exercise_version_id, kind, sequence,
        outcome, assistance_available, assistance_used, assessment_method, provenance,
        schema_version, occurred_at, recorded_at, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APP', ?, ?, ?, ?)
    `).run(
      userId, normalized.unitId, normalized.competencyId, normalized.attemptId, normalized.exerciseVersionId,
      normalized.kind, normalized.sequence, normalized.outcome, normalized.assistanceAvailable,
      normalized.assistanceUsed, normalized.assessmentMethod, normalized.schemaVersion, normalized.occurredAt, normalized.recordedAt,
      normalized.confidence
    );

    const result = {
      attemptId: attempt.id,
      eventId: eventResult.lastInsertRowid,
      outcome: normalized.outcome,
      assistanceUsed: normalized.assistanceUsed,
      confidence: normalized.confidence,
      submittedAt: nowIso,
    };

    recordIdempotency(db, { userId, operation: 'submit-attempt', operationKey, payloadHash: check.payloadHash, result });
    return result;
  });

  return run();
}

export function getById(db, userId, attemptId) {
  const attempt = findOwnedAttempt(db, userId, attemptId);
  if (!attempt) throw new AttemptError('NOT_FOUND', 'Tentativa não encontrada.');
  return attemptDto(attempt);
}

/**
 * The judgments already given DURING one review: the latest SUBMITTED attempt
 * per exercise that was started with this reviewTaskId, with its effective
 * outcome (highest-sequence learning_event, so a later CORRECTION wins while
 * the original stays on disk). Read-only. Attempts made without a
 * reviewTaskId (Estudar agora, reteste) are structurally excluded -- a redo
 * can never look like part of the original review.
 */
export function listForReviewTask(db, userId, reviewTaskId) {
  const task = db.prepare('SELECT id FROM review_tasks WHERE user_id = ? AND id = ?').get(userId, reviewTaskId);
  if (!task) throw new AttemptError('NOT_FOUND', 'Revisão não encontrada.');
  const rows = db.prepare(`
    SELECT a.id AS attempt_id, v.exercise_id, a.max_assistance, a.submitted_at,
      (SELECT e.outcome FROM learning_events e
        WHERE e.user_id = a.user_id AND e.attempt_id = a.id ORDER BY e.sequence DESC LIMIT 1) AS outcome
    FROM exercise_attempts a
    JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
    WHERE a.user_id = ? AND a.review_task_id = ? AND a.status = 'SUBMITTED'
    ORDER BY a.id
  `).all(userId, reviewTaskId);
  const latestByExercise = new Map();
  for (const row of rows) latestByExercise.set(row.exercise_id, row);
  // A wrong item may have been redone afterwards (Refazer erros): the latest
  // SUBMITTED attempt on that exercise made OUTSIDE this review and after the
  // review's own attempt. Reported alongside, never replacing the original.
  const redoStmt = db.prepare(`
    SELECT a.id AS attempt_id,
      (SELECT e.outcome FROM learning_events e
        WHERE e.user_id = a.user_id AND e.attempt_id = a.id ORDER BY e.sequence DESC LIMIT 1) AS outcome
    FROM exercise_attempts a
    JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
    WHERE a.user_id = ? AND v.exercise_id = ? AND a.review_task_id IS NULL
      AND a.status = 'SUBMITTED' AND a.id > ?
    ORDER BY a.id DESC LIMIT 1
  `);
  return [...latestByExercise.values()].map(r => {
    const redo = r.outcome === 'INCORRECT' ? redoStmt.get(userId, r.exercise_id, r.attempt_id) : null;
    return {
      attemptId: r.attempt_id,
      exerciseId: r.exercise_id,
      outcome: r.outcome ?? 'UNKNOWN',
      maxAssistance: r.max_assistance,
      submittedAt: r.submitted_at,
      retest: redo ? { attemptId: redo.attempt_id, outcome: redo.outcome ?? 'UNKNOWN' } : null,
    };
  });
}

const MAX_BATCH_REVIEW_TASKS = 500;

/** Batch form of listForReviewTask for Hoje's render: one round trip instead
 * of one per open review. Ids the caller does not own (or that do not exist)
 * are simply absent from the result -- never an error, never another
 * user's data. */
export function listForReviewTasks(db, userId, reviewTaskIds) {
  if (!Array.isArray(reviewTaskIds) || reviewTaskIds.length > MAX_BATCH_REVIEW_TASKS || !reviewTaskIds.every(Number.isInteger)) {
    throw new AttemptError('VALIDATION_FAILED', `ids deve ser uma lista de até ${MAX_BATCH_REVIEW_TASKS} inteiros.`, 'ids');
  }
  const result = {};
  for (const id of new Set(reviewTaskIds)) {
    try {
      result[id] = listForReviewTask(db, userId, id);
    } catch (err) {
      if (!(err instanceof AttemptError && err.code === 'NOT_FOUND')) throw err;
    }
  }
  return result;
}

/**
 * Exercises of this review's unit whose MOST RECENT submitted attempt --
 * ignoring this review's own judgments -- was INCORRECT: the student erred and
 * has not (yet) shown a correct answer since. A later correct redo clears it.
 * Longitudinal read over the existing ledger; nothing new is stored.
 */
export function priorWrongExercises(db, userId, reviewTaskId) {
  return db.prepare(`
    SELECT ex.id AS exercise_id
    FROM review_tasks rt
    JOIN exercises ex ON ex.user_id = rt.user_id AND ex.unit_id = rt.unit_id AND ex.archived_at IS NULL
    WHERE rt.user_id = ? AND rt.id = ?
      AND (
        SELECT (SELECT e.outcome FROM learning_events e
                 WHERE e.user_id = a.user_id AND e.attempt_id = a.id ORDER BY e.sequence DESC LIMIT 1)
        FROM exercise_attempts a
        JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
        WHERE a.user_id = rt.user_id AND v.exercise_id = ex.id AND a.status = 'SUBMITTED'
          AND (a.review_task_id IS NULL OR a.review_task_id != rt.id)
        ORDER BY a.id DESC LIMIT 1
      ) = 'INCORRECT'
    ORDER BY ex.order_index, ex.id
  `).all(userId, reviewTaskId).map(r => r.exercise_id);
}

/**
 * Unit-level version of priorWrongExercises: every active exercise whose MOST
 * RECENT submitted attempt (any review, redo or first pass) was INCORRECT, grouped
 * by unit. A later correct answer clears it. Read-only over the existing ledger.
 */
export function reinforcementByUnit(db, userId) {
  const rows = db.prepare(`
    SELECT ex.unit_id, ex.id AS exercise_id
    FROM exercises ex
    WHERE ex.user_id = ? AND ex.archived_at IS NULL
      AND (
        SELECT (SELECT e.outcome FROM learning_events e
                 WHERE e.user_id = a.user_id AND e.attempt_id = a.id ORDER BY e.sequence DESC LIMIT 1)
        FROM exercise_attempts a
        JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
        WHERE a.user_id = ex.user_id AND v.exercise_id = ex.id AND a.status = 'SUBMITTED'
        ORDER BY a.id DESC LIMIT 1
      ) = 'INCORRECT'
    ORDER BY ex.unit_id, ex.order_index, ex.id
  `).all(userId);
  const byUnit = {};
  for (const row of rows) (byUnit[row.unit_id] ??= []).push(row.exercise_id);
  return byUnit;
}
