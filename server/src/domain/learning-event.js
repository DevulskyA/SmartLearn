// T29: pure normalization boundary for item-level learning events
// (design.md §"Reconstructed learning evidence": "Rebuild pure functions
// with explicit inputs, clock/cutoff and policy version: normalize event").
// No DB access and no implicit wall-clock reads here -- callers (T30) pass
// `now` explicitly so this stays deterministic and testable.

export const ASSISTANCE_LEVELS = Object.freeze(['NONE', 'HINT', 'PARTIAL_SOLUTION', 'SOLUTION']);
export const ASSISTANCE_LEVELS_WITH_UNKNOWN = Object.freeze(['UNKNOWN', ...ASSISTANCE_LEVELS]);
export const OUTCOMES = Object.freeze(['CORRECT', 'INCORRECT', 'UNKNOWN']);
export const ASSESSMENT_METHODS = Object.freeze(['SELF_REPORT', 'AUTOMATIC']);
export const EVENT_KINDS = Object.freeze(['ATTEMPT', 'CORRECTION']);
export const PROVENANCE_VALUES = Object.freeze(['APP', 'IMPORT']);
export const SCHEMA_VERSION = 1;

export class LearningEventError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new LearningEventError('VALIDATION_FAILED', `${field} deve ser um de: ${allowed.join(', ')}.`, field);
  }
}

function requirePositiveInt(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new LearningEventError('VALIDATION_FAILED', `${field} é obrigatório e deve ser um inteiro positivo.`, field);
  }
}

/**
 * Normalizes raw event input into an immutable, insert-ready shape.
 *
 * Missing/omitted assistance or outcome NEVER default to a false-certainty
 * value: absence is UNKNOWN, never NONE/CORRECT/INCORRECT (MX10 -- the
 * discriminating fault this function exists to make impossible). A caller
 * that never mentions assistanceUsed gets UNKNOWN, not a coerced NONE.
 */
export function normalizeLearningEvent(input, { now }) {
  if (typeof now !== 'string' || Number.isNaN(Date.parse(now))) {
    throw new LearningEventError('VALIDATION_FAILED', 'now deve ser uma data ISO válida.', 'now');
  }

  const {
    unitId,
    competencyId = null,
    attemptId,
    exerciseVersionId,
    correctsEventId = null,
    kind = 'ATTEMPT',
    sequence,
    outcome = 'UNKNOWN',
    assistanceAvailable = 'UNKNOWN',
    assistanceUsed = 'UNKNOWN',
    assessmentMethod,
    provenance = 'APP',
    occurredAt,
    confidence = null,
  } = input ?? {};

  requirePositiveInt(unitId, 'unitId');
  requirePositiveInt(attemptId, 'attemptId');
  requirePositiveInt(exerciseVersionId, 'exerciseVersionId');
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new LearningEventError('VALIDATION_FAILED', 'sequence deve ser um inteiro >= 1.', 'sequence');
  }
  if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) {
    throw new LearningEventError('VALIDATION_FAILED', 'occurredAt deve ser uma data ISO válida.', 'occurredAt');
  }
  if (competencyId !== null) requirePositiveInt(competencyId, 'competencyId');

  requireEnum(kind, EVENT_KINDS, 'kind');
  requireEnum(outcome, OUTCOMES, 'outcome');
  requireEnum(assistanceAvailable, ASSISTANCE_LEVELS_WITH_UNKNOWN, 'assistanceAvailable');
  requireEnum(assistanceUsed, ASSISTANCE_LEVELS_WITH_UNKNOWN, 'assistanceUsed');
  requireEnum(assessmentMethod, ASSESSMENT_METHODS, 'assessmentMethod');
  requireEnum(provenance, PROVENANCE_VALUES, 'provenance');

  if (kind === 'CORRECTION') {
    requirePositiveInt(correctsEventId, 'correctsEventId');
  } else if (correctsEventId !== null) {
    throw new LearningEventError('VALIDATION_FAILED', 'correctsEventId só é válido em eventos CORRECTION.', 'correctsEventId');
  }

  // Confidence is a separate, optional self-report signal — it never
  // affects outcome/assistance validation and must never be trusted as a
  // proxy for correctness (design.md: "keep confidence separate from
  // correctness"; T32's evidence profile depends on this staying true).
  if (confidence !== null && (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1)) {
    throw new LearningEventError('VALIDATION_FAILED', 'confidence deve ser um número entre 0 e 1, ou omitido.', 'confidence');
  }

  return Object.freeze({
    unitId,
    competencyId,
    attemptId,
    exerciseVersionId,
    correctsEventId,
    kind,
    sequence,
    outcome,
    assistanceAvailable,
    assistanceUsed,
    assessmentMethod,
    provenance,
    confidence,
    schemaVersion: SCHEMA_VERSION,
    occurredAt,
    recordedAt: now,
  });
}
