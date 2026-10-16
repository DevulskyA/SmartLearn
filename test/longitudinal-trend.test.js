import test from "node:test";
import assert from "node:assert/strict";

import { Analytics } from "../src/analytics.js";

// ANALYTICS-2 contract ("Meu estudo está funcionando?", tendência longitudinal).
//
// Only OBSERVABLE history counts: learning_evidence rows (date + questions + correct).
// A retest right after feedback writes NO evidence row (server invariant, pinned in
// server/test/attempts.test.js), so it cannot inflate any trend computed from here.
//
// A trend compares an OLDER period with a RECENT one, each POOLED as
// total_correct / total_questions (never a mean of per-row percentages), and says
// INSUFFICIENT — not 0%, not "stable" — when the comparison is not honest.

const units = [{ id: 1, subjectId: 7, title: "Cap 1" }];
const subjects = [{ id: 7, name: "Fisiologia", color: "DISC-BLUE" }];

const ev = (evidenceDate, questionsCount, correctCount, id = 0) => ({ id, unitId: 1, evidenceDate, questionsCount, correctCount });
const unitTrendOf = (rows) => Analytics.byUnit(rows, units, subjects)[0].trend.direction;
const subjectTrendOf = (rows, today) => Analytics.bySubject(rows, units, subjects, today)[0].trend.direction;

// --- unit: the four states -------------------------------------------------------

test("unit MELHORANDO: older period clearly worse than recent, different volumes per row", () => {
  const rows = [ev("2026-06-01", 10, 4), ev("2026-06-15", 10, 5), ev("2026-07-20", 20, 17), ev("2026-08-10", 10, 9)];
  assert.equal(unitTrendOf(rows), "IMPROVING");
});

test("unit PIORANDO: older period clearly better than recent", () => {
  const rows = [ev("2026-06-01", 10, 9), ev("2026-06-15", 10, 8), ev("2026-07-20", 20, 8), ev("2026-08-10", 10, 4)];
  assert.equal(unitTrendOf(rows), "DECLINING");
});

test("unit ESTÁVEL: small pooled difference is not a trend", () => {
  const rows = [ev("2026-06-01", 40, 28), ev("2026-06-15", 40, 28), ev("2026-07-20", 40, 29), ev("2026-08-10", 40, 29)]; // 70% -> 72.5%
  assert.equal(unitTrendOf(rows), "STABLE");
});

test("unit EVIDÊNCIA INSUFICIENTE: no rows, one row, one date, or a period too small to compare", () => {
  assert.equal(unitTrendOf([]), "INSUFFICIENT");
  assert.equal(unitTrendOf([ev("2026-06-01", 40, 30)]), "INSUFFICIENT");
  // many questions but a single day: there is no "before" and "after"
  assert.equal(unitTrendOf([ev("2026-06-01", 20, 10, 1), ev("2026-06-01", 20, 19, 2)]), "INSUFFICIENT");
  assert.equal(unitTrendOf([ev("2026-06-01", 20, 10, 1), ev("2026-06-01", 20, 15, 2), ev("2026-06-01", 20, 19, 3)]), "INSUFFICIENT");
  // two dates but the recent period is 3 questions: not enough to call a direction
  assert.equal(unitTrendOf([ev("2026-06-01", 30, 24), ev("2026-08-01", 3, 0)]), "INSUFFICIENT");
});

// --- unit: honesty rules ---------------------------------------------------------

test("no data is never 0%: no evidence -> null accuracy and INSUFFICIENT", () => {
  const [row] = Analytics.byUnit([], units, subjects);
  assert.equal(row.weightedAccuracy, null);
  assert.equal(row.trend.direction, "INSUFFICIENT");
  const [subj] = Analytics.bySubject([], units, subjects, "2026-09-19");
  assert.equal(subj.weightedAccuracy, null);
  assert.equal(subj.trend.direction, "INSUFFICIENT");
});

test("volumes differ: pooled correct/questions decides, not the mean of row percentages nor the last row", () => {
  // older: 50/100 + 1/1 = 51/101 = 50.5%; recent: 5/10 + 60/100 = 65/110 = 59.1%  -> IMPROVING (+8.6pp)
  // mean of row % says older 75% -> recent 55% (DECLINING); the last three rows alone say 100% -> 60% (DECLINING)
  const rows = [ev("2026-06-01", 100, 50), ev("2026-06-10", 1, 1), ev("2026-07-01", 10, 5), ev("2026-08-01", 100, 60)];
  assert.equal(unitTrendOf(rows), "IMPROVING");
});

test("temporal order matters: the same results reversed give the opposite trend", () => {
  const forward = [ev("2026-06-01", 10, 4), ev("2026-06-15", 10, 5), ev("2026-07-20", 10, 8), ev("2026-08-10", 10, 9)];
  const dates = forward.map((r) => r.evidenceDate);
  const reversed = forward.slice().reverse().map((r, i) => ({ ...r, evidenceDate: dates[i] }));
  assert.equal(unitTrendOf(forward), "IMPROVING");
  assert.equal(unitTrendOf(reversed), "DECLINING");
});

test("one tiny recent observation does not rewrite an established history (1/1 is not +30pp)", () => {
  const rows = [ev("2026-06-01", 10, 7), ev("2026-06-15", 10, 7), ev("2026-07-20", 1, 1)];
  assert.equal(unitTrendOf(rows), "STABLE");
});

test("row order in the input does not matter (evidence is ordered by date, then id)", () => {
  const rows = [ev("2026-08-10", 10, 9, 4), ev("2026-06-01", 10, 4, 1), ev("2026-07-20", 10, 8, 3), ev("2026-06-15", 10, 5, 2)];
  assert.equal(unitTrendOf(rows), "IMPROVING");
});

test("several evidence rows on the same day are one moment: they never straddle the older/recent split", () => {
  // day 1 has two rows, day 2 has two rows: 2 dates -> 1 date older, 1 date recent
  const rows = [ev("2026-06-01", 10, 3, 1), ev("2026-06-01", 10, 3, 2), ev("2026-08-01", 10, 9, 3), ev("2026-08-01", 10, 9, 4)];
  assert.equal(unitTrendOf(rows), "IMPROVING"); // 30% -> 90%
});

// --- subject ---------------------------------------------------------------------

const TODAY = "2026-09-19";

test("subject: recent 30 days vs previous 30 days, pooled, four states", () => {
  const improving = [ev("2026-08-01", 20, 8), ev("2026-09-10", 20, 16)];
  const declining = [ev("2026-08-01", 20, 16), ev("2026-09-10", 20, 8)];
  const stable = [ev("2026-08-01", 40, 28), ev("2026-09-10", 40, 29)];
  const insufficient = [ev("2026-09-10", 40, 30)]; // nothing in the previous window
  assert.equal(subjectTrendOf(improving, TODAY), "IMPROVING");
  assert.equal(subjectTrendOf(declining, TODAY), "DECLINING");
  assert.equal(subjectTrendOf(stable, TODAY), "STABLE");
  assert.equal(subjectTrendOf(insufficient, TODAY), "INSUFFICIENT");
});

test("subject: volumes differ inside a window -> pooled, not mean of percentages", () => {
  // previous: 1/1 + 10/100 = 11/101 = 10.9% (mean of % = 55%); recent: 4/10 + 4/10 = 8/20 = 40%
  // pooled: 10.9% -> 40% IMPROVING; mean of % would read 55% -> 40% DECLINING
  const rows = [ev("2026-08-01", 1, 1, 1), ev("2026-08-05", 100, 10, 2), ev("2026-09-05", 10, 4, 3), ev("2026-09-10", 10, 4, 4)];
  assert.equal(subjectTrendOf(rows, TODAY), "IMPROVING");
});

test("subject: temporal order matters (reversed periods -> opposite direction)", () => {
  const a = [ev("2026-08-01", 20, 8), ev("2026-09-10", 20, 16)];
  const b = [ev("2026-08-01", 20, 16), ev("2026-09-10", 20, 8)];
  assert.notEqual(subjectTrendOf(a, TODAY), subjectTrendOf(b, TODAY));
});
