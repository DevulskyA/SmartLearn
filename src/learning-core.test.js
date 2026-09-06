import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSISTANCE_LEVELS,
  EVIDENCE_TYPES,
  ERROR_CLASSES,
  classifyEvidenceStrength,
  createLearningEvent,
  evaluateMastery,
  inferErrorHypotheses,
  recommendNextAction,
} from "./learning-core.js";

function event(overrides = {}) {
  return createLearningEvent({
    competencyId: "cv.preload",
    evidenceType: EVIDENCE_TYPES.RETRIEVAL,
    correct: true,
    assistanceLevel: ASSISTANCE_LEVELS.NONE,
    occurredAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  });
}

test("solution reveal never counts as positive mastery evidence", () => {
  const assisted = event({ assistanceLevel: ASSISTANCE_LEVELS.SOLUTION });
  assert.equal(classifyEvidenceStrength(assisted), "none");
  assert.equal(evaluateMastery([assisted]).mastered, false);
  assert.equal(recommendNextAction(assisted).kind, "retest");
});

test("mastery requires independent, delayed, and transfer evidence", () => {
  const events = [
    event({ occurredAt: "2026-09-01T10:00:00.000Z" }),
    event({ occurredAt: "2026-09-03T10:00:00.000Z", delayHours: 48 }),
    event({
      evidenceType: EVIDENCE_TYPES.TRANSFER,
      transferDistance: 2,
      occurredAt: "2026-09-04T10:00:00.000Z",
    }),
  ];

  const result = evaluateMastery(events);
  assert.equal(result.mastered, true);
  assert.deepEqual(result.blockers, []);
});

test("repeated same-session success is insufficient for mastery", () => {
  const events = [
    event({ occurredAt: "2026-09-01T10:00:00.000Z" }),
    event({ occurredAt: "2026-09-01T10:30:00.000Z" }),
    event({ evidenceType: EVIDENCE_TYPES.TRANSFER, occurredAt: "2026-09-01T11:00:00.000Z" }),
  ];
  const result = evaluateMastery(events);
  assert.equal(result.mastered, false);
  assert.equal(result.checks.delayedStability, false);
});

test("a later high-confidence error blocks mastery until repaired", () => {
  const events = [
    event({ occurredAt: "2026-09-01T10:00:00.000Z" }),
    event({ occurredAt: "2026-09-03T10:00:00.000Z", delayHours: 48 }),
    event({ evidenceType: EVIDENCE_TYPES.TRANSFER, occurredAt: "2026-09-04T10:00:00.000Z" }),
    event({ correct: false, confidence: 0.95, occurredAt: "2026-09-05T10:00:00.000Z" }),
  ];
  const result = evaluateMastery(events);
  assert.equal(result.mastered, false);
  assert.equal(result.checks.misconceptionResolved, false);
});

test("high-confidence wrong answer yields misconception and calibration hypotheses", () => {
  const failure = event({ correct: false, confidence: 0.9 });
  const hypotheses = inferErrorHypotheses(failure);
  const types = hypotheses.map((item) => item.type);
  assert.ok(types.includes(ERROR_CLASSES.MISCONCEPTION));
  assert.ok(types.includes(ERROR_CLASSES.CALIBRATION_FAILURE));
});

test("failed transfer after independent success is classified as transfer failure", () => {
  const history = [event({ occurredAt: "2026-09-01T10:00:00.000Z" })];
  const failure = event({
    evidenceType: EVIDENCE_TYPES.TRANSFER,
    correct: false,
    occurredAt: "2026-09-02T10:00:00.000Z",
  });
  const hypotheses = inferErrorHypotheses(failure, history);
  assert.equal(hypotheses[0].type, ERROR_CLASSES.TRANSFER_FAILURE);
});

test("correct low-confidence answer is treated as potentially unstable", () => {
  const uncertainSuccess = event({ confidence: 0.2 });
  const hypotheses = inferErrorHypotheses(uncertainSuccess);
  assert.equal(hypotheses[0].type, ERROR_CLASSES.POSSIBLE_LUCKY_SUCCESS);
});

test("assistance degrades evidence strength rather than pretending equivalence", () => {
  assert.equal(classifyEvidenceStrength(event()), "moderate");
  assert.equal(
    classifyEvidenceStrength(event({ assistanceLevel: ASSISTANCE_LEVELS.CONCEPT_HINT })),
    "moderate",
  );
  assert.equal(
    classifyEvidenceStrength(event({ assistanceLevel: ASSISTANCE_LEVELS.PARTIAL_STEP })),
    "weak",
  );
  assert.equal(
    classifyEvidenceStrength(event({ assistanceLevel: ASSISTANCE_LEVELS.SOLUTION })),
    "none",
  );
});

test("specific procedural signal dominates generic knowledge-gap inference", () => {
  const failure = event({
    correct: false,
    signals: { correctMethod: true, executionError: true },
  });
  const hypotheses = inferErrorHypotheses(failure);
  assert.equal(hypotheses[0].type, ERROR_CLASSES.PROCEDURAL_FAILURE);
  assert.ok(!hypotheses.some((item) => item.type === ERROR_CLASSES.KNOWLEDGE_GAP));
});
