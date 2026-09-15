import test from "node:test";
import assert from "node:assert/strict";

import { ALGORITHMS, SCHEDULE_OFFSETS, generateInitialTasks, getNextReview } from "../src/scheduler.js";
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
