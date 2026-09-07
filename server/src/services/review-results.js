import { normalizeLearningEvent, LearningEventError } from '../domain/learning-event.js';

export class ReviewResultError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

function findOwnedReviewTask(db, userId, reviewTaskId) {
  return db.prepare('SELECT * FROM review_tasks WHERE user_id = ? AND id = ?').get(userId, reviewTaskId);
}

/**
 * Reduces every learning_events row for one attempt down to its CURRENT
 * effective fact: a CORRECTION always has a higher sequence than the event
 * it revises (the schema's kind/corrects_event_id CHECK guarantees a
 * correction never precedes its original), so the max-sequence row per
 * attempt is always the live, up-to-date observation — the original stays
 * on disk untouched, exactly as design.md requires ("retain original
 * facts").
 */
function effectiveEventsByAttempt(rows) {
  const latestByAttempt = new Map();
  for (const row of rows) {
    const current = latestByAttempt.get(row.attempt_id);
    if (!current || row.sequence > current.sequence) latestByAttempt.set(row.attempt_id, row);
  }
  return [...latestByAttempt.values()];
}

/**
 * Reconciles this review task's aggregate learning_evidence (the manual
 * q/c the "Salvar" flow writes, itself derived from the very same
 * Acertei/Errei clicks item-level attempts now also record) with its
 * item-level learning_events, so a dashboard reading both never adds them
 * together as if they were two independent observations of two different
 * practice sessions.
 *
 * Item-derived counts are preferred as the reconciled total whenever any
 * item event exists for this review task: they carry real per-exercise
 * assistance/outcome detail the aggregate q/c number does not. The
 * aggregate is the fallback for review-only completions or completions
 * predating T30, and is always returned alongside for cross-reference —
 * never summed with the item total.
 *
 * INITIAL_PRACTICE/EXTERNAL learning_evidence (manual/external q/c) has no
 * review_task_id at all and is structurally invisible here — it can never
 * be pulled into a review's reconciliation ("manual external q/c remains
 * aggregate-only").
 */
export function reconcile(db, userId, reviewTaskId) {
  const task = findOwnedReviewTask(db, userId, reviewTaskId);
  if (!task) throw new ReviewResultError('NOT_FOUND', 'Revisão não encontrada.');

  const aggregateRows = db.prepare(`
    SELECT * FROM learning_evidence WHERE user_id = ? AND review_task_id = ? ORDER BY id
  `).all(userId, reviewTaskId);
  // Correction-by-reopen-and-recomplete can leave more than one REVIEW
  // evidence row for the same task over time; the latest is the current
  // fact, but earlier ones are never deleted (heritage.md H-06).
  const latestAggregate = aggregateRows.length > 0 ? aggregateRows[aggregateRows.length - 1] : null;

  const eventRows = db.prepare(`
    SELECT le.* FROM learning_events le
    JOIN exercise_attempts ea ON ea.user_id = le.user_id AND ea.id = le.attempt_id
    WHERE le.user_id = ? AND ea.review_task_id = ?
    ORDER BY le.attempt_id, le.sequence
  `).all(userId, reviewTaskId);
  const effectiveEvents = effectiveEventsByAttempt(eventRows);

  const itemTotalCount = effectiveEvents.length;
  const itemCorrectCount = effectiveEvents.filter(e => e.outcome === 'CORRECT').length;
  const itemEvents = effectiveEvents.map(e => ({
    eventId: e.id,
    attemptId: e.attempt_id,
    outcome: e.outcome,
    assistanceUsed: e.assistance_used,
    exerciseVersionId: e.exercise_version_id,
  }));

  const aggregate = latestAggregate ? {
    evidenceId: latestAggregate.id,
    questionsCount: latestAggregate.questions_count,
    correctCount: latestAggregate.correct_count,
  } : null;

  let source, reconciledTotalCount, reconciledCorrectCount;
  if (itemTotalCount > 0) {
    source = aggregate ? 'ITEMS_OVER_AGGREGATE' : 'ITEMS_ONLY';
    reconciledTotalCount = itemTotalCount;
    reconciledCorrectCount = itemCorrectCount;
  } else if (aggregate && aggregate.questionsCount != null) {
    source = 'AGGREGATE_ONLY';
    reconciledTotalCount = aggregate.questionsCount;
    reconciledCorrectCount = aggregate.correctCount;
  } else {
    // Review-only completion (or not completed yet) with no item practice:
    // an honest zero-evidence state, never a fabricated score (MX07).
    source = 'NONE';
    reconciledTotalCount = null;
    reconciledCorrectCount = null;
  }

  return {
    reviewTaskId,
    source,
    aggregate,
    itemEvents,
    reconciledTotalCount,
    reconciledCorrectCount,
  };
}

/**
 * Appends an explicit, audited correction to one item-level event —
 * never mutates the original row. The new row is a real learning_events
 * INSERT (kind='CORRECTION', corrects_event_id=eventId, next sequence for
 * the same attempt), validated through the same normalizeLearningEvent
 * boundary T29/T30 already use, so it can never silently defer to a
 * false-certainty default either.
 */
export function correctItemEvent(db, userId, eventId, { outcome, assistanceUsed }, now = () => new Date()) {
  const original = db.prepare('SELECT * FROM learning_events WHERE user_id = ? AND id = ?').get(userId, eventId);
  if (!original) throw new ReviewResultError('NOT_FOUND', 'Evento não encontrado.');

  const nowIso = now().toISOString();
  const nextSequence = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM learning_events WHERE user_id = ? AND attempt_id = ?'
  ).get(userId, original.attempt_id).next;

  let normalized;
  try {
    normalized = normalizeLearningEvent({
      unitId: original.unit_id,
      competencyId: original.competency_id,
      attemptId: original.attempt_id,
      exerciseVersionId: original.exercise_version_id,
      correctsEventId: eventId,
      kind: 'CORRECTION',
      sequence: nextSequence,
      outcome: outcome ?? original.outcome,
      assistanceAvailable: original.assistance_available,
      assistanceUsed: assistanceUsed ?? original.assistance_used,
      assessmentMethod: original.assessment_method,
      provenance: original.provenance,
      occurredAt: nowIso,
    }, { now: nowIso });
  } catch (err) {
    if (err instanceof LearningEventError) throw new ReviewResultError(err.code, err.message, err.field);
    throw err;
  }

  const result = db.prepare(`
    INSERT INTO learning_events (
      user_id, unit_id, competency_id, attempt_id, exercise_version_id, corrects_event_id,
      kind, sequence, outcome, assistance_available, assistance_used, assessment_method,
      provenance, schema_version, occurred_at, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, normalized.unitId, normalized.competencyId, normalized.attemptId, normalized.exerciseVersionId, normalized.correctsEventId,
    normalized.kind, normalized.sequence, normalized.outcome, normalized.assistanceAvailable, normalized.assistanceUsed,
    normalized.assessmentMethod, normalized.provenance, normalized.schemaVersion, normalized.occurredAt, normalized.recordedAt
  );

  return { eventId: result.lastInsertRowid, correctsEventId: eventId, outcome: normalized.outcome, assistanceUsed: normalized.assistanceUsed };
}
