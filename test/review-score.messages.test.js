import test from "node:test";
import assert from "node:assert/strict";

import { getReviewScoreValidationMessage, getReviewScoreValues } from "../src/review-score.js";

// Characterization: exact pt-BR text of the overflow message, and empty text when there is no overflow.
test("getReviewScoreValidationMessage: exact overflow message", () => {
  assert.equal(
    getReviewScoreValidationMessage(getReviewScoreValues("10", "15")),
    "Acertos não pode ser maior que Questões.",
  );
});

test("getReviewScoreValidationMessage: empty string when there is no overflow", () => {
  assert.equal(getReviewScoreValidationMessage(getReviewScoreValues("10", "8")), "");
});
