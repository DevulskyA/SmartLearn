export const ASSISTANCE_LEVELS = Object.freeze({
  NONE: 0,
  ORIENTING_QUESTION: 1,
  CONCEPT_HINT: 2,
  LOCATED_HINT: 3,
  PARTIAL_STEP: 4,
  EXAMPLE: 5,
  SOLUTION: 6,
});

export const EVIDENCE_TYPES = Object.freeze({
  EXPOSURE: "exposure",
  RECOGNITION: "recognition",
  RETRIEVAL: "retrieval",
  APPLICATION: "application",
  TRANSFER: "transfer",
  SIMULATION: "simulation",
});

export const ERROR_CLASSES = Object.freeze({
  KNOWLEDGE_GAP: "knowledge_gap",
  RETRIEVAL_FAILURE: "retrieval_failure",
  MISCONCEPTION: "misconception",
  DISCRIMINATION_FAILURE: "discrimination_failure",
  PROCEDURAL_FAILURE: "procedural_failure",
  INTEGRATION_FAILURE: "integration_failure",
  TRANSFER_FAILURE: "transfer_failure",
  CALIBRATION_FAILURE: "calibration_failure",
  FLUENCY_FAILURE: "fluency_failure",
  POSSIBLE_LUCKY_SUCCESS: "possible_lucky_success",
});

const ASSISTANCE_VALUES = new Set(Object.values(ASSISTANCE_LEVELS));
const EVIDENCE_VALUES = new Set(Object.values(EVIDENCE_TYPES));
const STRENGTH_ORDER = Object.freeze({ low: 1, moderate: 2, high: 3 });

function asFiniteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}.`);
  }
  return number;
}

function requireString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function normalizeTimestamp(value) {
  const timestamp = value ?? new Date().toISOString();
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("occurredAt must be a valid timestamp.");
  return date.toISOString();
}

function isIndependent(event) {
  return event.assistanceLevel === ASSISTANCE_LEVELS.NONE;
}

function hasSuccessfulIndependentHistory(history) {
  return history.some(
    (event) => event.correct && isIndependent(event) && event.evidenceType !== EVIDENCE_TYPES.EXPOSURE,
  );
}

function pushHypothesis(list, type, strength, rationale, intervention) {
  list.push({ type, strength, rationale, intervention });
}

export function createLearningEvent(input = {}) {
  const competencyId = requireString(input.competencyId, "competencyId");
  const evidenceType = input.evidenceType;
  if (!EVIDENCE_VALUES.has(evidenceType)) throw new Error("evidenceType is invalid.");

  const assistanceLevel = Number(input.assistanceLevel ?? ASSISTANCE_LEVELS.NONE);
  if (!ASSISTANCE_VALUES.has(assistanceLevel)) throw new Error("assistanceLevel is invalid.");
  if (typeof input.correct !== "boolean") throw new Error("correct must be boolean.");

  const confidence = asFiniteNumber(input.confidence, "confidence", { min: 0, max: 1 });
  const delayHours = asFiniteNumber(input.delayHours, "delayHours", { min: 0 });
  const transferDistance = asFiniteNumber(input.transferDistance ?? 0, "transferDistance", { min: 0, max: 3 });
  const responseTimeMs = asFiniteNumber(input.responseTimeMs, "responseTimeMs", { min: 0 });
  const timeLimitMs = asFiniteNumber(input.timeLimitMs, "timeLimitMs", { min: 0 });

  return Object.freeze({
    id: input.id ?? null,
    competencyId,
    evidenceType,
    correct: input.correct,
    assistanceLevel,
    confidence,
    delayHours,
    transferDistance,
    responseTimeMs,
    timeLimitMs,
    occurredAt: normalizeTimestamp(input.occurredAt),
    signals: Object.freeze({ ...(input.signals ?? {}) }),
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

export function classifyEvidenceStrength(rawEvent) {
  const event = createLearningEvent(rawEvent);
  if (!event.correct) return "none";
  if (event.evidenceType === EVIDENCE_TYPES.EXPOSURE) return "none";
  if (event.assistanceLevel === ASSISTANCE_LEVELS.SOLUTION) return "none";
  if (event.assistanceLevel >= ASSISTANCE_LEVELS.PARTIAL_STEP) return "weak";
  if (event.assistanceLevel > ASSISTANCE_LEVELS.NONE) return "moderate";

  if (
    event.evidenceType === EVIDENCE_TYPES.TRANSFER ||
    event.evidenceType === EVIDENCE_TYPES.SIMULATION
  ) {
    return "strong";
  }

  if (
    (event.evidenceType === EVIDENCE_TYPES.RETRIEVAL || event.evidenceType === EVIDENCE_TYPES.APPLICATION) &&
    (event.delayHours ?? 0) >= 24
  ) {
    return "strong";
  }

  if (event.evidenceType === EVIDENCE_TYPES.RECOGNITION) return "weak";
  return "moderate";
}

export function inferErrorHypotheses(rawEvent, rawHistory = []) {
  const event = createLearningEvent(rawEvent);
  const history = rawHistory.map(createLearningEvent).filter(
    (candidate) => candidate.competencyId === event.competencyId && candidate.occurredAt < event.occurredAt,
  );
  const hypotheses = [];

  if (event.correct) {
    if (event.confidence != null && event.confidence <= 0.35) {
      pushHypothesis(
        hypotheses,
        ERROR_CLASSES.POSSIBLE_LUCKY_SUCCESS,
        "moderate",
        "The answer was correct with low confidence, so independent stability is still uncertain.",
        "Retest with a parallel item after a delay before increasing mastery confidence.",
      );
    }
    return hypotheses;
  }

  const priorIndependentSuccess = hasSuccessfulIndependentHistory(history);

  if (event.confidence != null && event.confidence >= 0.8) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.MISCONCEPTION,
      "high",
      "The learner was incorrect with high confidence, which is compatible with an entrenched wrong model.",
      "Use contrastive explanation or a counterexample, then require a fresh independent attempt.",
    );
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.CALIBRATION_FAILURE,
      "high",
      "Confidence was high despite an incorrect answer.",
      "Retest confidence after correction and track whether calibration improves.",
    );
  }

  if (
    event.evidenceType === EVIDENCE_TYPES.TRANSFER &&
    priorIndependentSuccess
  ) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.TRANSFER_FAILURE,
      "high",
      "The learner previously succeeded independently but failed when the context changed.",
      "Vary surface features while explicitly comparing the shared underlying structure.",
    );
  }

  if (
    priorIndependentSuccess &&
    (event.evidenceType === EVIDENCE_TYPES.RETRIEVAL || event.evidenceType === EVIDENCE_TYPES.APPLICATION) &&
    (event.delayHours ?? 0) >= 24
  ) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.RETRIEVAL_FAILURE,
      "high",
      "Prior independent success was followed by failure after a meaningful delay.",
      "Use guided retrieval if needed, then schedule an independent spaced retest.",
    );
  }

  if (event.signals.confusableAlternatives) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.DISCRIMINATION_FAILURE,
      "high",
      "The task required distinguishing confusable alternatives and the learner selected the wrong one.",
      "Use side-by-side contrasting cases, then interleave the alternatives in later practice.",
    );
  }

  if (event.signals.correctMethod && event.signals.executionError) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.PROCEDURAL_FAILURE,
      "high",
      "The method was selected correctly but execution failed.",
      "Repair the failing step, practice that step briefly, then return to the full task.",
    );
  }

  if (event.signals.integrationRequired && event.signals.componentsKnown) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.INTEGRATION_FAILURE,
      "moderate",
      "Component knowledge appears available but was not integrated into the required conclusion.",
      "Reconstruct the causal or diagnostic relationships, then solve a new integrated case.",
    );
  }

  if (event.signals.timePressure && event.signals.wouldSolveWithoutTimeLimit) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.FLUENCY_FAILURE,
      "high",
      "The learner can solve the task without time pressure but performance collapses under the limit.",
      "Preserve accuracy first, then reduce allowed time gradually across successful repetitions.",
    );
  }

  if (!priorIndependentSuccess && hypotheses.length === 0) {
    pushHypothesis(
      hypotheses,
      ERROR_CLASSES.KNOWLEDGE_GAP,
      "moderate",
      "There is no prior independent success and no more specific failure signal is available.",
      "Teach or reconstruct the missing prerequisite, then require independent retrieval.",
    );
  }

  return hypotheses.sort((a, b) => STRENGTH_ORDER[b.strength] - STRENGTH_ORDER[a.strength]);
}

function hoursBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
}

function findDelayedPair(events, minimumHours) {
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (hoursBetween(events[i].occurredAt, events[j].occurredAt) >= minimumHours) return true;
    }
  }
  return false;
}

export function evaluateMastery(rawEvents, options = {}) {
  const events = rawEvents.map(createLearningEvent).sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt),
  );
  if (events.length === 0) {
    return {
      mastered: false,
      checks: {
        independentRetrieval: false,
        delayedStability: false,
        transfer: false,
        misconceptionResolved: true,
      },
      blockers: ["No evidence has been recorded."],
    };
  }

  const competencyIds = new Set(events.map((event) => event.competencyId));
  if (competencyIds.size !== 1) throw new Error("evaluateMastery accepts events from one competency only.");

  const minimumIndependentSuccesses = options.minimumIndependentSuccesses ?? 2;
  const minimumSpacingHours = options.minimumSpacingHours ?? 24;

  const independentSuccesses = events.filter(
    (event) =>
      event.correct &&
      isIndependent(event) &&
      [EVIDENCE_TYPES.RETRIEVAL, EVIDENCE_TYPES.APPLICATION, EVIDENCE_TYPES.TRANSFER, EVIDENCE_TYPES.SIMULATION].includes(event.evidenceType),
  );

  const transferSuccesses = independentSuccesses.filter(
    (event) =>
      event.evidenceType === EVIDENCE_TYPES.TRANSFER ||
      event.evidenceType === EVIDENCE_TYPES.SIMULATION,
  );

  const independentRetrieval = independentSuccesses.length >= minimumIndependentSuccesses;
  const delayedStability = findDelayedPair(independentSuccesses, minimumSpacingHours) || independentSuccesses.some(
    (event) => (event.delayHours ?? 0) >= minimumSpacingHours,
  );
  const transfer = transferSuccesses.length >= 1;

  const lastStrongIndependentAt = independentSuccesses
    .filter((event) => classifyEvidenceStrength(event) === "strong")
    .at(-1)?.occurredAt ?? null;

  const unresolvedMisconception = events.some(
    (event) =>
      !event.correct &&
      event.confidence != null &&
      event.confidence >= 0.8 &&
      (!lastStrongIndependentAt || event.occurredAt > lastStrongIndependentAt),
  );

  const checks = {
    independentRetrieval,
    delayedStability,
    transfer,
    misconceptionResolved: !unresolvedMisconception,
  };

  const blockers = [];
  if (!checks.independentRetrieval) blockers.push("Insufficient independent retrieval/application evidence.");
  if (!checks.delayedStability) blockers.push("No independent success has been demonstrated after a meaningful delay.");
  if (!checks.transfer) blockers.push("No independent transfer or simulation success has been demonstrated.");
  if (!checks.misconceptionResolved) blockers.push("A high-confidence error remains unresolved by later strong independent evidence.");

  return {
    mastered: Object.values(checks).every(Boolean),
    checks,
    blockers,
    evidence: {
      totalEvents: events.length,
      independentSuccesses: independentSuccesses.length,
      transferSuccesses: transferSuccesses.length,
    },
  };
}

export function recommendNextAction(rawEvent, rawHistory = []) {
  const hypotheses = inferErrorHypotheses(rawEvent, rawHistory);
  if (hypotheses.length > 0) {
    return {
      kind: "repair",
      errorClass: hypotheses[0].type,
      strength: hypotheses[0].strength,
      instruction: hypotheses[0].intervention,
      alternatives: hypotheses.slice(1),
    };
  }

  const event = createLearningEvent(rawEvent);
  if (!event.correct) {
    return {
      kind: "diagnose",
      errorClass: null,
      strength: "low",
      instruction: "Collect a discriminating follow-up item before assigning a failure cause.",
      alternatives: [],
    };
  }

  if (event.assistanceLevel > ASSISTANCE_LEVELS.NONE) {
    return {
      kind: "retest",
      errorClass: null,
      strength: "high",
      instruction: "Require a fresh independent attempt; assisted success is not mastery evidence.",
      alternatives: [],
    };
  }

  if ([EVIDENCE_TYPES.RETRIEVAL, EVIDENCE_TYPES.APPLICATION].includes(event.evidenceType)) {
    return {
      kind: "space",
      errorClass: null,
      strength: "high",
      instruction: "Schedule an independent retest after a meaningful delay, then test transfer.",
      alternatives: [],
    };
  }

  return {
    kind: "advance",
    errorClass: null,
    strength: "moderate",
    instruction: "Advance to a more integrative or transfer-oriented task while preserving independent performance checks.",
    alternatives: [],
  };
}
