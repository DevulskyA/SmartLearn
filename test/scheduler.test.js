import test from "node:test";
import assert from "node:assert/strict";

import { ALGORITHMS, SCHEDULE_OFFSETS, generateInitialTasks, getNextReview, getDaysBetween, getReviewStatusLabel } from "../src/scheduler.js";
import { REVIEW_DAY_OFFSETS, generateReviewDates } from "../src/review-schedule.js";

test("ALGORITHMS.LEGACY é 'legacy'", () => {
  assert.equal(ALGORITHMS.LEGACY, "legacy");
});

test("SCHEDULE_OFFSETS é idêntico a REVIEW_DAY_OFFSETS (fonte única confirmada)", () => {
  assert.deepEqual(SCHEDULE_OFFSETS, REVIEW_DAY_OFFSETS);
  assert.equal(SCHEDULE_OFFSETS.length, 16);
  assert.equal(SCHEDULE_OFFSETS[0], 1);
  assert.equal(SCHEDULE_OFFSETS.at(-1), 390);
});

test("generateInitialTasks legacy produz as mesmas datas que generateReviewDates", () => {
  const date = "2026-09-02";
  const tasks = generateInitialTasks(date);
  const legacyDates = generateReviewDates(date);

  assert.equal(tasks.length, 16);
  for (let i = 0; i < tasks.length; i++) {
    assert.equal(tasks[i].dueDate, legacyDates[i], `tarefa ${i + 1}: datas devem coincidir`);
    assert.equal(tasks[i].reviewNumber, i + 1, `tarefa ${i + 1}: reviewNumber deve ser ${i + 1}`);
  }
});

test("generateInitialTasks algoritmo desconhecido lança erro explícito", () => {
  assert.throws(
    () => generateInitialTasks("2026-09-02", "fsrs-4"),
    /Unknown.*algorithm/i,
  );
});

test("generateInitialTasks data inválida lança erro (mesmo comportamento que generateReviewDates)", () => {
  assert.throws(() => generateInitialTasks("nao-e-data"), /inválida/i);
});

// getNextReview, extracted from app.js (TEST SHIELD item 2, 2026-09-15):
// drives both Plano's list and Study Now's question selection, previously
// only exercised indirectly via e2e/smartlearn-plan-flow.spec.js.

function task(overrides = {}) {
  return { unitId: 1, dueDate: "2026-06-01", reviewDone: false, ...overrides };
}

test("getNextReview: picks the earliest pending dueDate for that unit, ignoring other units", () => {
  const tasks = [
    task({ dueDate: "2026-06-10" }),
    task({ dueDate: "2026-06-01" }),
    task({ dueDate: "2026-06-05" }),
    task({ unitId: 2, dueDate: "2026-01-01" }), // different unit, must be ignored
  ];
  assert.equal(getNextReview(1, tasks), "2026-06-01");
});

test("getNextReview: a completed task (reviewDone) is never picked, even if it's the earliest date", () => {
  const tasks = [
    task({ dueDate: "2026-06-01", reviewDone: true }),
    task({ dueDate: "2026-06-05", reviewDone: false }),
  ];
  assert.equal(getNextReview(1, tasks), "2026-06-05");
});

test("getNextReview: a unit with no pending tasks (none scheduled, or all done) returns null, not undefined or a stale date", () => {
  assert.equal(getNextReview(1, []), null);
  assert.equal(getNextReview(1, [task({ reviewDone: true })]), null);
  assert.equal(getNextReview(999, [task()]), null); // unit not present at all
});

// getDaysBetween/getReviewStatusLabel, extracted from app.js (TEST SHIELD
// item 2 slice 3, 2026-09-15): Hoje's own overdue-days label, previously
// completely untested anywhere in the project (no unit test, no e2e
// assertion on the exact label text).

test("getDaysBetween: whole calendar days, positive when toDate is after fromDate", () => {
  assert.equal(getDaysBetween("2026-01-01", "2026-01-05"), 4);
  assert.equal(getDaysBetween("2026-01-05", "2026-01-01"), -4);
  assert.equal(getDaysBetween("2026-01-01", "2026-01-01"), 0);
});

test("getReviewStatusLabel: doneToday and today groups return their fixed label, never a day count", () => {
  assert.equal(getReviewStatusLabel("doneToday", task({ dueDate: "2026-01-01" }), "2026-01-05"), "Concluída");
  assert.equal(getReviewStatusLabel("today", task({ dueDate: "2026-01-05" }), "2026-01-05"), "Vence hoje");
});

test("getReviewStatusLabel: overdue group shows the real day count, pluralized, for 2+ days", () => {
  assert.equal(getReviewStatusLabel("overdue", task({ dueDate: "2026-01-01" }), "2026-01-06"), "Atrasada 5 dias");
});

test("getReviewStatusLabel: overdue group floors to 'Atrasada 1 dia' (singular) for exactly 1 day, and never shows 0/negative days", () => {
  assert.equal(getReviewStatusLabel("overdue", task({ dueDate: "2026-01-04" }), "2026-01-05"), "Atrasada 1 dia");
  // dueDate == today, mis-sorted into "overdue" by a hypothetical caller bug: still floors to 1 dia, never "0 dias".
  assert.equal(getReviewStatusLabel("overdue", task({ dueDate: "2026-01-05" }), "2026-01-05"), "Atrasada 1 dia");
});
