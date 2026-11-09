import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_PAGE_SIZE, normalizePlanSearch, searchPlanUnits, paginatePlanUnits } from "../src/plan-list-model.js";

const rows = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1, subjectId: i % 2 ? 2 : 1,
  title: `Aula ${i + 1} — Função renal`, sourceText: i % 2 ? "Gray" : "Guyton",
}));
const names = new Map([[1, "Fisiologia"], [2, "Anatomia"]]);

test("accent- and case-insensitive lookup across discipline, aula and source", () => {
  assert.equal(normalizePlanSearch("  FISIOLÓGIA  "), "fisiologia");
  assert.equal(searchPlanUnits(rows, "FISIOLOGIA guyton", names).length, 100);
  assert.equal(searchPlanUnits(rows, "Aula 200 Anatomía", names)[0].id, 200);
  assert.equal(searchPlanUnits(rows, "inexistente", names).length, 0);
  assert.equal(searchPlanUnits(rows, "", names).length, 200);
});

test("0, 10, 20, 100 and 200 dynamically registered lessons", () => {
  for (const count of [0, 10, 20, 100, 200]) {
    const p = paginatePlanUnits(rows.slice(0, count));
    assert.equal(p.total, count);
    assert.equal(p.items.length, Math.min(count, PLAN_PAGE_SIZE));
    assert.equal(p.pageCount, Math.max(1, Math.ceil(count / PLAN_PAGE_SIZE)));
  }
});

test("go straight to aula 200 despite pagination", () => {
  const p = paginatePlanUnits(rows, 1, 200);
  assert.equal(p.page, 8);
  assert.equal(p.from, 176);
  assert.equal(p.to, 200);
  assert.equal(p.items.at(-1).id, 200);
});

test("page bounds, absent focus and no input mutation", () => {
  assert.equal(paginatePlanUnits(rows, -4).page, 1);
  assert.equal(paginatePlanUnits(rows, 999).page, 8);
  assert.equal(paginatePlanUnits(rows, 2, 500).page, 2);
  assert.equal(paginatePlanUnits([], 10).page, 1);
  assert.throws(() => paginatePlanUnits(rows, 1, null, 0), RangeError);
  assert.equal(rows.length, 200);
});

test("search + pagination preserves the actual filtered total", () => {
  const match = searchPlanUnits(rows, "anatomia Gray", names);
  const p = paginatePlanUnits(match, 2);
  assert.equal(p.total, 100);
  assert.equal(p.items.length, 25);
  assert.equal(p.from, 26);
  assert.equal(p.to, 50);
});
