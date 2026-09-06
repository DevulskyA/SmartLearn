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

test("getReviewScoreValues com inputs nulos retorna nulls sem erro", () => {
  const values = getReviewScoreValues(null, null);

  assert.equal(values.questionsCount, null);
  assert.equal(values.correctCount, null);
  assert.equal(values.scorePercent, null);
  assert.equal(values.isOverflow, false);
});

test("getReviewScoreValues com zero questões retorna scorePercent nulo", () => {
  const values = getReviewScoreValues("0", "0");

  assert.equal(values.questionsCount, 0);
  assert.equal(values.correctCount, 0);
  assert.equal(values.scorePercent, null);
  assert.equal(values.isOverflow, false);
});

test("getReviewScoreValues com string vazia trata como null", () => {
  const values = getReviewScoreValues("", "");

  assert.equal(values.questionsCount, null);
  assert.equal(values.correctCount, null);
  assert.equal(values.scorePercent, null);
  assert.equal(values.isOverflow, false);
});

test("getReviewScoreValues com zero acertos retorna scorePercent 0", () => {
  const values = getReviewScoreValues("5", "0");

  assert.equal(values.questionsCount, 5);
  assert.equal(values.correctCount, 0);
  assert.equal(values.scorePercent, 0);
  assert.equal(values.isOverflow, false);
});