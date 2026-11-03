import test from "node:test";
import assert from "node:assert/strict";
import { reviewConclusion } from "../src/review-completion.js";

test("every question answered: the stage concludes with evidence", () => {
  assert.deepEqual(reviewConclusion({ total: 3, answered: 3 }), { kind: "EVIDENCE" });
});

test("some or none answered: the stage stays pending and says how many are left", () => {
  assert.deepEqual(reviewConclusion({ total: 3, answered: 1 }), { kind: "PRACTICE_PENDING", remaining: 2 });
  assert.deepEqual(reviewConclusion({ total: 3, answered: 0 }), { kind: "PRACTICE_PENDING", remaining: 3 });
});

test("no questions: reading concludes it", () => {
  assert.deepEqual(reviewConclusion({ total: 0, answered: 0 }), { kind: "READ" });
  assert.deepEqual(reviewConclusion(), { kind: "READ" });
});
