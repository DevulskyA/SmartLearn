import test from "node:test";
import assert from "node:assert/strict";

import { REVIEW_DAY_OFFSETS, generateReviewDates } from "../src/review-schedule.js";

test("generateReviewDates cria 16 revisões nas datas esperadas", () => {
  const dates = generateReviewDates("2026-06-27");

  assert.equal(dates.length, 16);
  assert.equal(dates[0], "2026-06-28");
  assert.equal(dates[1], "2026-07-04");
  assert.equal(dates.at(-1), "2027-07-22");
  assert.equal(REVIEW_DAY_OFFSETS.length, 16);
});

test("generateReviewDates rejeita data inválida", () => {
  assert.throws(() => generateReviewDates("invalida"), /inválida/i);
});