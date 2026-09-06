import test from "node:test";
import assert from "node:assert/strict";

import { ALGORITHMS, SCHEDULE_OFFSETS, generateInitialTasks } from "../src/scheduler.js";
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
