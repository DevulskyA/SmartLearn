// T33: preserves the historical mastery/error-hypothesis IDEAS from
// feat/evidence-learning-core-v1 (context.md's audited Branch 2) as a
// small, versioned, DISABLED-BY-DEFAULT offline/shadow policy — never a
// product feature. Nothing in server/src/routes or src/ imports this
// module. It consumes T32's evidence-profile OUTPUT only (never raw
// events, never a DB handle), so it has no capability to write a schedule,
// a learning_evidence row, or any other stored fact even if called.
//
// The old core's 24h / 0.8 / 0.35 thresholds are carried forward as
// EXPLICIT, NAMED, PROVISIONAL parameters — literal historical values from
// the audited branch, not re-derived or validated here (context.md: "not
// automatically a validated numerical scale"; design.md: "not validated
// constants"). Promotion to a real product feature requires an explicit
// educational outcome study and a human-authorized decision — see
// .specs/features/smartlearn-v1-consolidated-v2/pedagogical-validation.md.
// This file's SCIENTIFIC_LEARNING_BENEFIT status is NOT_ESTABLISHED.

export const CHALLENGER_POLICY_VERSION = 1;

// Named after the historical branch's own constants (24h delay window,
// 0.8 confidence-strength cutoff, 0.35 low-confidence floor) purely for
// traceability back to context.md's audit — none are claims of validity.
export const PROVISIONAL_THRESHOLDS = Object.freeze({
  minIndependentCorrectForPattern: 2,
  delayHoursThreshold: 24,
  highConfidenceCutoff: 0.8,
  lowConfidenceFloor: 0.35,
});

// Deliberately NOT "MASTERED" — this challenger never produces a mastery
// verdict, by name or by effect (AC-17). "PROVISIONAL_INDEPENDENT_PATTERN"
// names an observed pattern under an unvalidated policy, not a claim about
// the learner.
export const CHALLENGER_LABELS = Object.freeze([
  'INSUFFICIENT_EVIDENCE',
  'PROVISIONAL_INDEPENDENT_PATTERN',
  'NEEDS_MORE_INDEPENDENT_PRACTICE',
  'CONFLICTING_EVIDENCE',
]);

/**
 * Suggests hypotheses grounded ONLY in fields the real evidence profile
 * actually observes (assistance level, conflicting evidence, missing
 * observations) — the old core's inferErrorHypotheses took caller-supplied
 * procedural/conceptual/motivational signals that this schema never
 * collects; inventing them here would be fabricated evidence, so this
 * rebuilt version does not attempt cognitive error diagnosis at all
 * (design.md: "suggest further investigation instead of diagnosing
 * cognition from one error"). Each hypothesis names its own supporting
 * event IDs, never a bare unqualified claim.
 */
function suggestHypotheses(profile) {
  const hypotheses = [];
  if (profile.assistedCount > 0 && profile.independentCorrectCount === 0) {
    hypotheses.push({
      id: 'NEEDS_MORE_INDEPENDENT_PRACTICE',
      description: 'Toda observação correta até agora envolveu alguma assistência; nenhuma prática independente foi registrada.',
      supportingEventIds: profile.assistedEventIds,
    });
  }
  if (profile.hasConflictingIndependentEvidence) {
    hypotheses.push({
      id: 'CONFLICTING_EVIDENCE',
      description: 'Existe pelo menos um acerto e um erro independentes registrados; o padrão não é consistente.',
      supportingEventIds: [...profile.independentCorrectEventIds, ...profile.independentIncorrectEventIds],
    });
  }
  if (profile.unknownCount > 0) {
    hypotheses.push({
      id: 'MISSING_OBSERVATIONS_LIMIT_CONFIDENCE',
      description: 'Uma ou mais observações têm assistência ou resultado desconhecidos, o que limita qualquer leitura sobre o padrão.',
      supportingEventIds: profile.missingObservationEventIds,
    });
  }
  return hypotheses;
}

/**
 * Evaluates the (disabled-by-default) challenger against an already-built
 * evidence profile (T32's buildEvidenceProfile output). Returns a fully
 * inert result when `enabled` is false — the caller gets a real object
 * back, not an exception, but every field states plainly that nothing was
 * evaluated. When `enabled` is true (shadow/offline test mode only — no
 * product code path sets this), the label is computed but `validated`
 * stays false always, and `humanReadableCaveat` is included specifically
 * so nothing downstream can present this as a certainty.
 */
export function evaluateChallenger(profile, { enabled = false, thresholds = PROVISIONAL_THRESHOLDS, policyVersion = CHALLENGER_POLICY_VERSION } = {}) {
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      policyVersion,
      label: null,
      hypotheses: [],
      validated: false,
      humanReadableCaveat: 'Challenger desabilitado — nenhuma avaliação foi realizada.',
    });
  }

  const hypotheses = suggestHypotheses(profile);

  let label;
  if (profile.hasConflictingIndependentEvidence) {
    label = 'CONFLICTING_EVIDENCE';
  } else if (profile.independentCorrectCount === 0) {
    label = profile.assistedCount > 0 ? 'NEEDS_MORE_INDEPENDENT_PRACTICE' : 'INSUFFICIENT_EVIDENCE';
  } else if (profile.independentCorrectCount < thresholds.minIndependentCorrectForPattern) {
    label = 'INSUFFICIENT_EVIDENCE';
  } else {
    label = 'PROVISIONAL_INDEPENDENT_PATTERN';
  }

  return Object.freeze({
    enabled: true,
    policyVersion,
    label,
    hypotheses,
    // Never a product-facing verdict: SCIENTIFIC_LEARNING_BENEFIT for this
    // challenger is NOT_ESTABLISHED until an explicit outcome study runs.
    validated: false,
    humanReadableCaveat: 'Resultado experimental, não validado pedagogicamente. Não representa domínio (mastery) nem diagnóstico cognitivo.',
  });
}
