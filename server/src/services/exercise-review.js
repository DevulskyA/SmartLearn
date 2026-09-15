// Read-only join between one learning_evidence row and the item-level
// attempts behind it, for a "what did I actually answer" review screen.
//
// The two contexts that CAN have item-level data use different link
// columns, set at different times by different code (review_task_id: T31,
// 010-attempt-review-link.sql, set when an attempt starts during a
// scheduled review; evidence_id: T31's practice counterpart,
// 021-practice-evidence-attempt-link.sql, set once the practice session's
// aggregate evidence row exists) — this function is the single place that
// knows which one applies, so callers never have to. EXTERNAL evidence, old
// rows from before either link existed, and attempts whose best-effort
// item-level write failed all fall through to the same empty result: never
// guessed, never reconstructed from unit/date proximity.
//
// Only the effective (highest-id) learning_event per attempt is returned —
// submit() currently ever inserts exactly one ATTEMPT event per attempt
// (sequence=1); CORRECTION events are schema-legal (009-learning-events.sql)
// but no code path writes one yet, so MAX(id) is an accurate proxy for
// "latest", not a simplification that already needs
// evidence-profile.js's fuller effectiveEvents() reconciliation.
export class ExerciseReviewError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function findOwnedEvidence(db, userId, evidenceId) {
  return db.prepare('SELECT * FROM learning_evidence WHERE user_id = ? AND id = ?').get(userId, evidenceId);
}

function attemptRowsForLinkColumn(db, userId, column, value) {
  return db.prepare(`
    SELECT
      a.id AS attempt_id,
      a.status,
      a.max_assistance,
      a.started_at,
      a.submitted_at,
      v.question,
      v.answer,
      v.hint,
      le.outcome,
      le.assistance_used,
      le.occurred_at
    FROM exercise_attempts a
    JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
    LEFT JOIN learning_events le ON le.user_id = a.user_id AND le.id = (
      SELECT MAX(le2.id) FROM learning_events le2 WHERE le2.user_id = a.user_id AND le2.attempt_id = a.id
    )
    WHERE a.user_id = ? AND a.${column} = ?
    ORDER BY a.started_at, a.id
  `).all(userId, value);
}

function toAttemptDetailDto(row) {
  return {
    attemptId: row.attempt_id,
    status: row.status,
    question: row.question,
    answer: row.answer,
    hint: row.hint,
    // Self-report model (assessmentMethod on every submit() call): the app
    // never captures free-text/selected student input, only a self-judged
    // outcome — there is no "resposta dada pelo aluno" field to return
    // because the product never asks the student to type or pick one.
    outcome: row.outcome ?? null,
    assistanceUsed: row.assistance_used ?? row.max_assistance,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    occurredAt: row.occurred_at ?? null,
  };
}

/**
 * Returns { evidenceId, source, attempts }. `source` is 'REVIEW',
 * 'PRACTICE', or 'NONE' (EXTERNAL, or a REVIEW/INITIAL_PRACTICE row with no
 * linked attempts — old data, or a best-effort item-level write that never
 * landed). `attempts` is always `[]` for 'NONE', never a guess.
 */
export function getAttemptDetails(db, userId, evidenceId) {
  const evidence = findOwnedEvidence(db, userId, evidenceId);
  if (!evidence) throw new ExerciseReviewError('NOT_FOUND', 'Evidência não encontrada.');

  let rows = [];
  let source = 'NONE';
  if (evidence.review_task_id != null) {
    rows = attemptRowsForLinkColumn(db, userId, 'review_task_id', evidence.review_task_id);
    if (rows.length > 0) source = 'REVIEW';
  } else {
    rows = attemptRowsForLinkColumn(db, userId, 'evidence_id', evidence.id);
    if (rows.length > 0) source = 'PRACTICE';
  }

  return {
    evidenceId: evidence.id,
    source,
    attempts: rows.map(toAttemptDetailDto),
  };
}
