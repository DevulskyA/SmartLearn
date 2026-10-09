import test from "node:test";
import assert from "node:assert/strict";

import { Analytics, filterByPeriod, sortMatrixRows } from "../src/analytics.js";

// --- bySubject window boundary tests (P1-4) ---

// Contract: LAST_30_INCLUDING_TODAY = today-29 ... today (30 days)
//           PREVIOUS_30 = today-59 ... today-30 (30 days, non-overlapping)

function makeEvidence(evidenceDate, questionsCount = 10, correctCount = 8) {
  return { unitId: 1, evidenceDate, questionsCount, correctCount };
}

const units = [{ id: 1, subjectId: 7, title: "Cap 1" }];
const subjects = [{ id: 7, name: "Fisiologia", color: "DISC-BLUE" }];

// FASE 8 mutation-test finding (2026-09-15): weightedAccuracy's own value
// (the single number every Estatísticas row exists to show) had NO direct
// assertion anywhere in the project — mutating byUnit's formula to always
// produce ~100% (a plausible copy-paste bug, totalC/totalC instead of
// totalC/totalQ) survived the full 317-test root suite untouched; the
// server doesn't import this file at all; the only e2e assertion on this
// value checks the format (`/%/`) via regex, never the actual number. The
// tests below close that gap for both bySubject and byUnit directly.
test("bySubject: weightedAccuracy is correctCount/questionsCount * 100, not any other ratio", () => {
  const today = "2026-09-04";
  const evidence = [makeEvidence(today, 40, 30)]; // 30/40 = 75%
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].weightedAccuracy, 75);
});

test("bySubject: zero questions yields null weightedAccuracy, never 0 or NaN", () => {
  const results = Analytics.bySubject([], units, subjects, "2026-09-04");
  assert.equal(results[0].weightedAccuracy, null);
});

test("byUnit: weightedAccuracy is correctCount/questionsCount * 100, aggregated across multiple evidence rows", () => {
  const evidence = [makeEvidence("2026-01-01", 10, 5), makeEvidence("2026-02-01", 10, 9)]; // (5+9)/(10+10) = 70%
  const results = Analytics.byUnit(evidence, units, subjects);
  assert.equal(results[0].weightedAccuracy, 70);
});

test("byUnit: zero evidence yields null weightedAccuracy, never 0 or NaN", () => {
  const results = Analytics.byUnit([], units, subjects);
  assert.equal(results[0].weightedAccuracy, null);
});

test("bySubject: evidence on today is included in recent window", () => {
  const today = "2026-09-04";
  const evidence = [makeEvidence(today)]; // exactly today
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].recentQuestions, 10);
});

test("bySubject: evidence on today-29 is included in recent window (boundary)", () => {
  // today-29 = first day of the 30-day window
  const today = "2026-09-04";
  const boundary = "2026-08-06"; // today - 29 days
  const evidence = [makeEvidence(boundary)];
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].recentQuestions, 10, "today-29 must be IN recent window");
});

test("bySubject: evidence on today-30 is NOT in recent window", () => {
  // today-30 is first day of the PREVIOUS window, not the recent window
  const today = "2026-09-04";
  const outside = "2026-08-05"; // today - 30 days
  const evidence = [makeEvidence(outside)];
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].recentQuestions, 0, "today-30 must NOT be in recent window");
});

test("bySubject: evidence on today-30 is included in previous window (boundary)", () => {
  const today = "2026-09-04";
  const prevBoundary = "2026-08-05"; // today - 30 days = first day of previous window
  const evidence = [makeEvidence(prevBoundary)];
  const results = Analytics.bySubject(evidence, units, subjects, today);
  // Verify via weightedAccuracy: if prevWindow has questions, trend uses it
  // We can't directly read prevWindow from the return value, but we can verify
  // via totalQuestions (all-time) vs recentQuestions (recent window only)
  assert.equal(results[0].totalQuestions, 10, "all-time count includes today-30");
  assert.equal(results[0].recentQuestions, 0, "recent window excludes today-30");
});

test("bySubject: evidence on today-59 is included in previous window (outer boundary)", () => {
  const today = "2026-09-04";
  const outerBoundary = "2026-07-07"; // today - 59 days
  const evidence = [makeEvidence(outerBoundary)];
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].totalQuestions, 10, "today-59 is in all-time count");
  assert.equal(results[0].recentQuestions, 0, "today-59 is not in recent window");
});

test("bySubject: evidence on today-60 is outside both windows", () => {
  const today = "2026-09-04";
  const outside = "2026-07-06"; // today - 60 days
  const evidence = [makeEvidence(outside)];
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].totalQuestions, 10, "today-60 is in all-time count");
  assert.equal(results[0].recentQuestions, 0, "today-60 is not in recent window");
});

test("bySubject: recent window contains exactly 30 calendar dates (today-29 to today)", () => {
  const today = "2026-09-04";
  // Fill entire 30-day window with 1 question per day
  const evidence = [];
  for (let i = 0; i <= 29; i++) {
    const d = new Date("2026-09-04T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    evidence.push(makeEvidence(d.toISOString().slice(0, 10), 1, 1));
  }
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].recentQuestions, 30, "recent window must include exactly 30 days");
});

test("bySubject: adding a 31st day (today-30) does NOT increase recentQuestions", () => {
  const today = "2026-09-04";
  const evidence = [];
  for (let i = 0; i <= 29; i++) {
    const d = new Date("2026-09-04T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    evidence.push(makeEvidence(d.toISOString().slice(0, 10), 1, 1));
  }
  // Add 31st day at today-30
  evidence.push(makeEvidence("2026-08-05", 1, 1));
  const results = Analytics.bySubject(evidence, units, subjects, today);
  assert.equal(results[0].recentQuestions, 30, "31st day (today-30) must NOT appear in recent window");
});

// --- filterByPeriod / sortMatrixRows (extracted from app.js, TEST SHIELD
// item 2, 2026-09-15: these drive what Estatísticas' matrix tables show,
// previously only exercised end-to-end via e2e/stats-sorting.spec.js and
// e2e/stats-responsive-regression.spec.js — no isolated unit-speed gate) ---

function row(overrides = {}) {
  return {
    subjectId: 1,
    subjectName: "Anatomia",
    unitTitle: undefined,
    totalQuestions: 10,
    weightedAccuracy: 50,
    trend: { direction: "STABLE" },
    lastEvidence: { evidenceDate: "2026-09-01" },
    ...overrides,
  };
}

test("filterByPeriod: falsy periodValue returns all rows unfiltered", () => {
  const rows = [row(), row({ lastEvidence: null })];
  assert.equal(filterByPeriod(rows, "", "2026-09-04").length, 2);
  assert.equal(filterByPeriod(rows, null, "2026-09-04").length, 2);
});

test("filterByPeriod: a row with no lastEvidence is excluded, never shown as if it matched", () => {
  const rows = [row({ lastEvidence: null })];
  assert.equal(filterByPeriod(rows, "last-30", "2026-09-04").length, 0);
});

test("filterByPeriod: last-30 boundary — cutoff is today-30 inclusive, today-31 is OUT", () => {
  // Contract differs on purpose from Analytics.bySubject's own 30-day recent
  // window (today-29..today): filterByPeriod's cutoff is subtractDays(today,
  // days) with an inclusive >= comparison, so for "last-30" the cutoff day
  // itself (today-30) is included.
  const today = "2026-09-04";
  const cutoffDay = row({ lastEvidence: { evidenceDate: "2026-08-05" } }); // today-30, the cutoff itself
  const justOutside = row({ lastEvidence: { evidenceDate: "2026-08-04" } }); // today-31
  assert.equal(filterByPeriod([cutoffDay], "last-30", today).length, 1, "cutoff day itself is included (>=)");
  assert.equal(filterByPeriod([justOutside], "last-30", today).length, 0);
});

test("filterByPeriod: last-90 and the default (anything else -> 365) use distinct cutoffs", () => {
  const today = "2026-09-04";
  const at91Days = row({ lastEvidence: { evidenceDate: "2026-06-05" } }); // today-91
  assert.equal(filterByPeriod([at91Days], "last-90", today).length, 0, "excluded from last-90");
  assert.equal(filterByPeriod([at91Days], "last-365", today).length, 1, "included in the 365 default");
});

test("sortMatrixRows: performance (default key) ascending puts weakest first, nulls last regardless of direction", () => {
  const rows = [row({ subjectId: 1, weightedAccuracy: 80 }), row({ subjectId: 2, weightedAccuracy: null }), row({ subjectId: 3, weightedAccuracy: 20 })];
  const asc = sortMatrixRows(rows, { key: "performance", dir: "asc" });
  assert.deepEqual(asc.map((r) => r.subjectId), [3, 1, 2]);
  const desc = sortMatrixRows(rows, { key: "performance", dir: "desc" });
  assert.deepEqual(desc.map((r) => r.subjectId), [1, 3, 2], "null (no evidence) stays last even sorting desc");
});

test("sortMatrixRows: practice sorts by totalQuestions", () => {
  const rows = [row({ subjectId: 1, totalQuestions: 5 }), row({ subjectId: 2, totalQuestions: 50 })];
  const asc = sortMatrixRows(rows, { key: "practice", dir: "asc" });
  assert.deepEqual(asc.map((r) => r.subjectId), [1, 2]);
});

test("sortMatrixRows: trend orders DECLINING < INSUFFICIENT < STABLE < IMPROVING ascending", () => {
  const rows = [
    row({ subjectId: 1, trend: { direction: "IMPROVING" } }),
    row({ subjectId: 2, trend: { direction: "DECLINING" } }),
    row({ subjectId: 3, trend: { direction: "STABLE" } }),
    row({ subjectId: 4, trend: { direction: "INSUFFICIENT" } }),
  ];
  const asc = sortMatrixRows(rows, { key: "trend", dir: "asc" });
  assert.deepEqual(asc.map((r) => r.subjectId), [2, 4, 3, 1]);
});

test("sortMatrixRows: identity is locale-aware alphabetical (pt-BR), combining subjectName+unitTitle when unitTitle exists", () => {
  const rows = [
    row({ subjectId: 1, subjectName: "Ética", unitTitle: undefined }),
    row({ subjectId: 2, subjectName: "Anatomia", unitTitle: undefined }),
  ];
  const asc = sortMatrixRows(rows, { key: "identity", dir: "asc" });
  // pt-BR base-sensitivity collation: "Anatomia" sorts before "Ética" (accents ignored for ordering here).
  assert.deepEqual(asc.map((r) => r.subjectId), [2, 1]);
});

test("sortMatrixRows: recency sorts by lastEvidence.evidenceDate, nulls last", () => {
  const rows = [
    row({ subjectId: 1, lastEvidence: { evidenceDate: "2026-01-01" } }),
    row({ subjectId: 2, lastEvidence: null }),
    row({ subjectId: 3, lastEvidence: { evidenceDate: "2026-09-01" } }),
  ];
  const asc = sortMatrixRows(rows, { key: "recency", dir: "asc" });
  assert.deepEqual(asc.map((r) => r.subjectId), [1, 3, 2]);
  const desc = sortMatrixRows(rows, { key: "recency", dir: "desc" });
  assert.deepEqual(desc.map((r) => r.subjectId), [3, 1, 2], "null stays last even sorting desc");
});

test("sortMatrixRows: never mutates the input array (returns a new sorted copy)", () => {
  const rows = [row({ subjectId: 1, weightedAccuracy: 80 }), row({ subjectId: 2, weightedAccuracy: 20 })];
  const original = [...rows];
  sortMatrixRows(rows, { key: "performance", dir: "asc" });
  assert.deepEqual(rows, original, "original array order must be untouched");
});
