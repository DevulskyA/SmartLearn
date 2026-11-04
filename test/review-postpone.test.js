import test from "node:test";
import assert from "node:assert/strict";
import { planPostpone, normalizePerDay, addDays, POSTPONE_DEFAULT_PER_DAY, POSTPONE_MAX_PER_DAY } from "../shared/review-postpone.js";

const TODAY = "2026-11-04";
const task = (id, unitId, dueDate, extra = {}) => ({ id, unitId, dueDate, completedAt: null, reviewNumber: 1, ...extra });

test("only overdue pending reviews move: today, future and completed ones are left alone", () => {
  const tasks = [
    task(1, 1, "2026-11-03"),
    task(2, 1, TODAY),
    task(3, 1, "2026-11-10"),
    task(4, 2, "2026-10-01", { completedAt: "2026-10-01T10:00:00.000Z" }),
    task(5, 2, "2026-10-02", { reviewDone: true, completedAt: undefined }),
  ];
  const { moves } = planPostpone(tasks, TODAY, 5);
  assert.deepEqual(moves.map((m) => m.id), [1]);
});

test("at most perDay per new day, starting TOMORROW, oldest overdue first", () => {
  const tasks = Array.from({ length: 18 }, (_, i) => task(i + 1, i + 1, addDays("2026-10-01", i)));
  const { moves, days } = planPostpone(tasks, TODAY, 5);
  assert.equal(moves.length, 18);
  assert.deepEqual(days, [
    { date: "2026-11-05", count: 5 }, { date: "2026-11-06", count: 5 }, { date: "2026-11-07", count: 5 }, { date: "2026-11-08", count: 3 },
  ]);
  assert.deepEqual(moves.slice(0, 5).map((m) => m.id), [1, 2, 3, 4, 5], "the oldest review gets the earliest new day");
  assert.ok(moves.every((m) => m.to > TODAY && m.to > m.from), "every new date is in the future and later than the old one");
});

test("the stages of one unit keep their order (a later stage never lands before an earlier one)", () => {
  // same due day is impossible inside a unit; different due days with the stage number as tiebreaker for other units
  const tasks = [task(10, 1, "2026-10-20", { reviewNumber: 2 }), task(11, 1, "2026-10-10", { reviewNumber: 1 }), task(12, 2, "2026-10-10", { reviewNumber: 1 })];
  const { moves } = planPostpone(tasks, TODAY, 1);
  const byId = Object.fromEntries(moves.map((m) => [m.id, m.to]));
  assert.ok(byId[11] < byId[10], "stage 1 of unit 1 before its stage 2");
  assert.deepEqual(moves.map((m) => m.id), [11, 12, 10]);
});

test("the server's task shape (offsetDays instead of reviewNumber) is understood too", () => {
  const tasks = [{ id: 2, unitId: 1, dueDate: "2026-10-10", offsetDays: 7, completedAt: null }, { id: 1, unitId: 2, dueDate: "2026-10-10", offsetDays: 1, completedAt: null }];
  assert.deepEqual(planPostpone(tasks, TODAY, 5).moves.map((m) => m.id), [1, 2]);
});

test("nothing overdue gives an empty plan, and planning is a pure function (same input, same output, input untouched)", () => {
  assert.deepEqual(planPostpone([task(1, 1, TODAY)], TODAY), { moves: [], days: [] });
  const tasks = [task(1, 1, "2026-10-01"), task(2, 1, "2026-10-02")];
  const snapshot = JSON.stringify(tasks);
  assert.deepEqual(planPostpone(tasks, TODAY, 1), planPostpone(tasks, TODAY, 1));
  assert.equal(JSON.stringify(tasks), snapshot);
});

test("applying the plan and planning again moves nothing (idempotent by construction)", () => {
  const tasks = Array.from({ length: 7 }, (_, i) => task(i + 1, i + 1, addDays("2026-10-01", i)));
  const first = planPostpone(tasks, TODAY, 3);
  const moved = tasks.map((t) => ({ ...t, dueDate: first.moves.find((m) => m.id === t.id).to }));
  assert.deepEqual(planPostpone(moved, TODAY, 3).moves, []);
});

test("month and year boundaries use real calendar days", () => {
  const tasks = [task(1, 1, "2026-12-01"), task(2, 2, "2026-12-02")];
  const { days } = planPostpone(tasks, "2026-12-31", 1);
  assert.deepEqual(days.map((d) => d.date), ["2027-01-01", "2027-01-02"]);
});

test("perDay and today are validated; the default is sensible", () => {
  assert.equal(POSTPONE_DEFAULT_PER_DAY, 5);
  for (const bad of [0, -1, 1.5, "x", null, POSTPONE_MAX_PER_DAY + 1]) assert.equal(normalizePerDay(bad), null, String(bad));
  assert.equal(normalizePerDay("7"), 7);
  assert.equal(normalizePerDay(POSTPONE_MAX_PER_DAY), POSTPONE_MAX_PER_DAY);
  assert.throws(() => planPostpone([], TODAY, 0), RangeError);
  assert.throws(() => planPostpone([], "04/11/2026", 5), RangeError);
});
