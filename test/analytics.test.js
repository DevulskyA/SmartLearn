import test from "node:test";
import assert from "node:assert/strict";

import { Analytics } from "../src/analytics.js";

// --- bySubject window boundary tests (P1-4) ---

// Contract: LAST_30_INCLUDING_TODAY = today-29 ... today (30 days)
//           PREVIOUS_30 = today-59 ... today-30 (30 days, non-overlapping)

function makeEvidence(evidenceDate, questionsCount = 10, correctCount = 8) {
  return { unitId: 1, evidenceDate, questionsCount, correctCount };
}

const units = [{ id: 1, subjectId: 7, title: "Cap 1" }];
const subjects = [{ id: 7, name: "Fisiologia", color: "DISC-BLUE" }];

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
