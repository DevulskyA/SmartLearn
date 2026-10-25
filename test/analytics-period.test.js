import test from "node:test";
import assert from "node:assert/strict";

import {
  evidenceInPeriod,
  periodSubjectRows,
  periodSummary,
  performanceDistribution,
  largestRemainderPercents,
  evolutionSeries,
} from "../src/analytics.js";

// Synthetic fixture: today = 2026-10-25. Anatomia has OLD evidence (200 days ago, 0 of 40 correct)
// and RECENT evidence; Fisiologia only old; Bioquímica none; Neuro has recent + previous window.
const today = "2026-10-25";
const subjects = [
  { id: 1, name: "Anatomia", color: "DISC-BLUE", isActive: true },
  { id: 2, name: "Fisiologia", color: "DISC-GREEN", isActive: true },
  { id: 3, name: "Bioquímica", color: "DISC-RED", isActive: true },
  { id: 4, name: "Neuro", color: "DISC-TEAL", isActive: true },
  { id: 5, name: "Arquivada", color: "DISC-PINK", isActive: false },
];
const units = [
  { id: 11, subjectId: 1, title: "A1" },
  { id: 21, subjectId: 2, title: "F1" },
  { id: 31, subjectId: 3, title: "B1" },
  { id: 41, subjectId: 4, title: "N1" },
  { id: 51, subjectId: 5, title: "X1" },
];
let nextId = 1;
const ev = (unitId, evidenceDate, questionsCount, correctCount) => ({ id: nextId++, unitId, evidenceDate, questionsCount, correctCount });
const evidence = [
  ev(11, "2026-04-08", 40, 0), // old, Anatomia
  ev(11, "2026-10-20", 20, 15), // recent, Anatomia
  ev(21, "2026-03-01", 30, 3), // old only, Fisiologia
  ev(41, "2026-09-05", 20, 10), // previous 30-day window (today-50)
  ev(41, "2026-10-15", 20, 16), // recent window
  ev(51, "2026-10-01", 10, 10), // archived subject WITH evidence
  ev(11, "2026-10-21", 5, 9), // invalid: correct > questions
  ev(11, "2026-10-22", 0, 0), // invalid: no question
];

test("(a) 90 days never counts older questions; any period counts them", () => {
  const rows90 = periodSubjectRows(evidence, units, subjects, { periodValue: "last-90", today });
  const anatomia = rows90.find((r) => r.subjectId === 1);
  assert.equal(anatomia.totalQuestions, 20, "the 40 old questions are out");
  assert.equal(anatomia.totalCorrect, 15);
  assert.equal(anatomia.weightedAccuracy, 75);
  const all = periodSubjectRows(evidence, units, subjects, { periodValue: "", today });
  assert.equal(all.find((r) => r.subjectId === 1).totalQuestions, 60);
});

test("period window is N days ending today, inclusive, and ignores future dates", () => {
  const rows = [ev(11, "2026-07-28", 1, 1), ev(11, "2026-07-27", 1, 1), ev(11, "2026-10-26", 1, 1), ev(11, "2026-10-25", 1, 1)];
  const dates = evidenceInPeriod(rows, "last-90", today).map((e) => e.evidenceDate).sort();
  assert.deepEqual(dates, ["2026-07-28", "2026-10-25"], "today-89 is in, today-90 is out, tomorrow is out");
});

test("(b) header reconciles with the table: pooled average, never a mean of percentages", () => {
  const rows = periodSubjectRows(evidence, units, subjects, { periodValue: "last-90", today });
  const summary = periodSummary(rows);
  // valid in period: Anatomia 15/20, Neuro 26/40, Arquivada 10/10  => 51/70
  assert.equal(summary.totalQuestions, 70);
  assert.equal(summary.totalCorrect, 51);
  assert.equal(summary.average, (100 * 51) / 70);
  const meanOfPercents = (75 + 65 + 100) / 3;
  assert.notEqual(summary.average, meanOfPercents);
  assert.equal(summary.totalQuestions, rows.reduce((s, r) => s + r.totalQuestions, 0));
  assert.equal(summary.totalCorrect, rows.reduce((s, r) => s + r.totalCorrect, 0));
});

test("invalid rows (correct > questions, zero questions) never count", () => {
  const rows = periodSubjectRows(evidence, units, subjects, { periodValue: "last-30", today });
  assert.equal(rows.find((r) => r.subjectId === 1).totalQuestions, 20);
});

test("(c) a discipline without evidence in the period is NO_EVIDENCE with null accuracy, never 0%", () => {
  const rows = periodSubjectRows(evidence, units, subjects, { periodValue: "last-90", today });
  for (const id of [2, 3]) {
    const r = rows.find((x) => x.subjectId === id);
    assert.ok(r, "active subject stays listed");
    assert.equal(r.state, "NO_EVIDENCE");
    assert.equal(r.weightedAccuracy, null);
    assert.equal(r.totalQuestions, 0);
  }
  assert.equal(periodSummary(rows).subjectCount, rows.length);
});

test("archived subject appears only when it has evidence in the period", () => {
  assert.ok(periodSubjectRows(evidence, units, subjects, { periodValue: "last-90", today }).some((r) => r.subjectId === 5));
  assert.ok(!periodSubjectRows(evidence, units, subjects, { periodValue: "last-30", today: "2026-12-30" }).some((r) => r.subjectId === 5));
});

test("(d) trend uses explicit windows (last 30 days vs the 30 before) and a minimum sample, independent of a short period", () => {
  const rows = periodSubjectRows(evidence, units, subjects, { periodValue: "last-30", today });
  const neuro = rows.find((r) => r.subjectId === 4);
  // previous window 50% (10/20) -> recent 80% (16/20): +30 p.p., even though the 30-day period alone holds only the recent row
  assert.equal(neuro.trend.direction, "IMPROVING");
  assert.equal(Math.round(neuro.trend.delta * 100), 30);
  assert.equal(neuro.totalQuestions, 20, "the period still shows only its own questions");
  const anatomia = rows.find((r) => r.subjectId === 1);
  assert.equal(anatomia.trend.direction, "INSUFFICIENT", "no previous-window sample: honest 'insufficient', not stable");
  assert.equal(anatomia.trend.delta, null);
});

test("distribution counts every discipline once and percentages add up to 100 (largest remainder)", () => {
  const rows = periodSubjectRows(evidence, units, subjects, { periodValue: "last-90", today });
  const dist = performanceDistribution(rows);
  assert.equal(dist.reduce((s, d) => s + d.count, 0), rows.length);
  assert.equal(dist.reduce((s, d) => s + d.percent, 0), 100);
  assert.equal(dist.find((d) => d.state === "NO_EVIDENCE").count, 2);
  assert.deepEqual(dist.map((d) => d.state), ["CRITICAL", "ATTENTION", "ADEQUATE", "STRONG", "NO_EVIDENCE"]);
  assert.deepEqual(largestRemainderPercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(largestRemainderPercents([0, 0]), [0, 0]);
});

test("(e) evolution does not interpolate quiet periods: the line breaks and positions follow dates", () => {
  const sparse = [ev(11, "2026-08-01", 10, 5), ev(11, "2026-08-04", 10, 6), ev(11, "2026-10-20", 10, 9)];
  const s = evolutionSeries(sparse, units, { periodValue: "last-90", today });
  assert.equal(s.bucketDays, 7);
  assert.equal(s.points.length, 3, "only buckets with questions are points");
  assert.ok(s.segments.length >= 2, "weeks without data split the line");
  const last = s.points[s.points.length - 1];
  const prev = s.points[s.points.length - 2];
  assert.ok(last.offset - prev.offset > 50, "a 2.5-month silence is ~11 weeks wide, not one step");
  const flat = s.segments.flat();
  assert.equal(flat.length, 3);
  for (const seg of s.segments) {
    for (let i = 1; i < seg.length; i += 1) assert.equal(seg[i].index - seg[i - 1].index, 1, "a segment only joins adjacent buckets");
  }
});

test("evolution buckets pool questions (not a mean of percentages) and honour the subject filter", () => {
  const rows = [ev(11, "2026-10-20", 1, 1), ev(11, "2026-10-21", 99, 49), ev(21, "2026-10-21", 10, 0)];
  const all = evolutionSeries(rows, units, { periodValue: "last-30", today });
  assert.equal(all.points.reduce((s, p) => s + p.questions, 0), 110);
  const only1 = evolutionSeries(rows, units, { periodValue: "last-30", today, subjectIds: new Set([1]) });
  assert.equal(only1.points.reduce((s, p) => s + p.questions, 0), 100);
  assert.equal(only1.points[0].accuracy, 50);
});

test("evolution with no evidence returns an empty series", () => {
  const s = evolutionSeries([], units, { periodValue: "last-90", today });
  assert.deepEqual(s.points, []);
});
