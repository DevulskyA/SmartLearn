import test from "node:test";
import assert from "node:assert/strict";

import { getReviewScoreValidationMessage, getReviewScoreValues } from "../src/review-score.js";

test("getReviewScoreValues calcula nota válida até 100%", () => {
  const values = getReviewScoreValues("10", "8");

  assert.equal(values.questionsCount, 10);
  assert.equal(values.correctCount, 8);
  assert.equal(values.scorePercent, 80);
  assert.equal(values.isOverflow, false);
});

test("getReviewScoreValues detecta acertos acima das questões", () => {
  const values = getReviewScoreValues("10", "15");

  assert.equal(values.isOverflow, true);
  assert.equal(values.scorePercent, null);
  assert.match(getReviewScoreValidationMessage(values), /Acertos/i);
});