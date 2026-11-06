import test from "node:test";
import assert from "node:assert/strict";

import { REVIEW_DAY_OFFSETS, generateReviewDates } from "../src/review-schedule.js";

// FASE 8 mutation-test finding (2026-09-15): mutating an INTERIOR offset
// (e.g. index 7: 150 -> 145) survives this whole client suite — the test
// below only ever characterized dates[0], dates[1], dates.at(-1), and the
// array length, none of which depend on any interior value. The only
// sensor in the entire project that caught it was server/test/
// evidence-settings.test.js's deepStrictEqual over the full array — a
// single point of failure, on the server side, for a client-importable
// canonical constant. This test closes that gap directly on the client.
test("REVIEW_DAY_OFFSETS matches the design.md-specified contract exactly, every element (T15/heritage.md H-01)", () => {
  assert.deepEqual(
    REVIEW_DAY_OFFSETS,
    [1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390],
  );
});

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

test("generateReviewDates rejeita dia de calendário inexistente (30 de fevereiro) em vez de rolar para março (T15 fix)", () => {
  // new Date("2026-02-30") silently overflows to 2026-03-02 in JS — this
  // must be explicitly caught, not accepted as a valid study date.
  assert.throws(() => generateReviewDates("2026-02-30"), /inválida/i);
});

test("generateReviewDates aceita 29 de fevereiro em ano bissexto e rejeita em ano comum", () => {
  assert.doesNotThrow(() => generateReviewDates("2028-02-29")); // 2028 is a leap year
  assert.throws(() => generateReviewDates("2026-02-29"), /inválida/i); // 2026 is not
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