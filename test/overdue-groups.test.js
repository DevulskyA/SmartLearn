import test from "node:test";
import assert from "node:assert/strict";
import { groupOverdueByUnit, stageRanges, shouldCollapseOverdue, OVERDUE_COLLAPSE_AFTER } from "../src/overdue-groups.js";

const task = (id, unitId, reviewNumber, dueDate = "2026-06-22") => ({ id, unitId, reviewNumber, dueDate });

test("stages of the same unit become one group; groups keep the order of their oldest stage", () => {
  const tasks = [task(1, 8, 1), task(2, 8, 2), task(3, 1, 1), task(4, 8, 3), task(5, 1, 2), task(6, 4, 1)];
  const groups = groupOverdueByUnit(tasks);
  assert.deepEqual(groups.map((g) => g.unitId), [8, 1, 4]);
  assert.deepEqual(groups[0].tasks.map((x) => x.id), [1, 2, 4]);
  assert.deepEqual(groups[1].tasks.map((x) => x.id), [3, 5]);
});

test("grouping loses and duplicates nothing: every input task appears exactly once", () => {
  const tasks = Array.from({ length: 34 }, (_, i) => task(i + 1, (i % 10) + 1, Math.floor(i / 10) + 1));
  const groups = groupOverdueByUnit(tasks);
  assert.equal(groups.length, 10);
  assert.deepEqual(groups.flatMap((g) => g.tasks.map((x) => x.id)).sort((a, b) => a - b), tasks.map((x) => x.id));
});

test("the input is not mutated and an empty list gives no groups", () => {
  const tasks = Object.freeze([Object.freeze(task(1, 8, 1))]);
  assert.equal(groupOverdueByUnit(tasks).length, 1);
  assert.deepEqual(groupOverdueByUnit([]), []);
});

test("stage ranges compress consecutive review numbers and keep gaps honest", () => {
  assert.deepEqual(stageRanges([1, 2, 3]), [[1, 3]]);
  assert.deepEqual(stageRanges([1, 3]), [[1, 1], [3, 3]]);
  assert.deepEqual(stageRanges([3, 1, 2, 5]), [[1, 3], [5, 5]]);
  assert.deepEqual(stageRanges([4]), [[4, 4]]);
  assert.deepEqual(stageRanges([]), []);
});

test("collapsed by default only when the overdue list is long enough to bury today's tasks", () => {
  assert.equal(shouldCollapseOverdue(OVERDUE_COLLAPSE_AFTER), false);
  assert.equal(shouldCollapseOverdue(OVERDUE_COLLAPSE_AFTER + 1), true);
  assert.equal(shouldCollapseOverdue(34), true);
  assert.equal(shouldCollapseOverdue(0), false);
});
