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

test("generateReviewDates produz 16 datas todas em formato ISO-8601 válido", () => {
  const dates = generateReviewDates("2026-09-02");

  assert.equal(dates.length, 16);
  for (const d of dates) {
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `"${d}" deve ser formato AAAA-MM-DD`);
    assert.ok(!Number.isNaN(Date.parse(d)), `"${d}" deve ser data válida`);
  }
});

test("generateReviewDates produz datas em ordem estritamente crescente", () => {
  const dates = generateReviewDates("2026-09-02");

  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i] > dates[i - 1], `dates[${i}]="${dates[i]}" deve ser maior que dates[${i - 1}]="${dates[i - 1]}"`);
  }
});