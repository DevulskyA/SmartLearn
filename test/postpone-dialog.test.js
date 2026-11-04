import test from "node:test";
import assert from "node:assert/strict";
import { describePlan } from "../src/postpone-dialog.js";
import { planPostpone } from "../shared/review-postpone.js";

const TODAY = "2026-11-04";
const overdue = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, unitId: i + 1, dueDate: "2026-10-01", completedAt: null, reviewNumber: 1 }));
const fmt = (day) => day.split("-").reverse().join("/");

test("the confirmation says how many reviews move and the first and last new day", () => {
  const text = describePlan(planPostpone(overdue(18), TODAY, 5), 5, fmt);
  assert.match(text, /^18 revisões vencidas serão adiadas, no máximo 5 por dia: de 05\/11\/2026 a 08\/11\/2026\.$/);
});

test("one review, and a pile that fits in one day, are worded without a range", () => {
  assert.equal(describePlan(planPostpone(overdue(1), TODAY, 5), 5, fmt), "1 revisão vencida será adiada para 05/11/2026.");
  assert.equal(describePlan(planPostpone(overdue(4), TODAY, 5), 5, fmt), "4 revisões vencidas serão adiadas para 05/11/2026.");
});

test("a smaller daily maximum reaches a later last day (the preview follows the input)", () => {
  const last = (perDay) => planPostpone(overdue(18), TODAY, perDay).days.at(-1).date;
  assert.equal(last(5), "2026-11-08");
  assert.equal(last(2), "2026-11-13"); // 18 / 2 = 9 days, from 05/11
});

test("nothing overdue says so instead of promising a move", () => {
  assert.equal(describePlan(planPostpone([], TODAY, 5), 5, fmt), "Não há revisões vencidas para adiar.");
});
