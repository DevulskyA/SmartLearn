import test from "node:test";
import assert from "node:assert/strict";
import { reviewTier, pickPrimaryReview } from "../src/today-priority.js";

const ctx = (map) => (task) => map[task.id] ?? { exerciseIds: [], judgedIds: new Set(), priorWrongIds: new Set() };
const c = (exerciseIds, judged = [], wrong = []) => ({ exerciseIds, judgedIds: new Set(judged), priorWrongIds: new Set(wrong) });

test("tiers: reinforce < unanswered exercises < all answered < nothing to practice", () => {
  assert.equal(reviewTier(c([1, 2], [], [2])), 0);
  assert.equal(reviewTier(c([1, 2])), 1);
  assert.equal(reviewTier(c([1, 2], [1, 2])), 2);
  assert.equal(reviewTier(c([])), 3);
  // a wrong-last-time item that is already answered in THIS review no longer counts as "to reinforce"
  assert.equal(reviewTier(c([1, 2], [2], [2])), 1);
});

test("the oldest overdue review WITHOUT exercises is skipped when another overdue one has something to retrieve", () => {
  const overdue = [{ id: 1 }, { id: 2 }, { id: 3 }];   // oldest first
  const pick = pickPrimaryReview(overdue, [], ctx({ 1: c([]), 2: c([10, 11]), 3: c([12]) }));
  assert.equal(pick.task.id, 2, "id 1 has nothing to practice; 2 is the oldest with exercises");
});

test("items to reinforce beat plain exercises, even when the plain one is older", () => {
  const overdue = [{ id: 1 }, { id: 2 }];
  const pick = pickPrimaryReview(overdue, [], ctx({ 1: c([10]), 2: c([20, 21], [], [21]) }));
  assert.equal(pick.task.id, 2);
  assert.equal(pick.reinforce, 1);
});

test("inside the same tier the server order (oldest first) is kept; a fully answered block still beats an empty one", () => {
  assert.equal(pickPrimaryReview([{ id: 1 }, { id: 2 }], [], ctx({ 1: c([1]), 2: c([2]) })).task.id, 1);
  assert.equal(pickPrimaryReview([{ id: 1 }, { id: 2 }], [], ctx({ 1: c([]), 2: c([5], [5]) })).task.id, 2);
});

test("the protocol is preserved: overdue always comes before today, whatever today's tier; nothing -> null; all empty -> oldest", () => {
  const pick = pickPrimaryReview([{ id: 1 }], [{ id: 9 }], ctx({ 1: c([]), 9: c([1], [], [1]) }));
  assert.equal(pick.task.id, 1);
  assert.equal(pick.group, "overdue");
  assert.equal(pickPrimaryReview([], [{ id: 9 }], ctx({ 9: c([1]) })).group, "today");
  assert.equal(pickPrimaryReview([], [], ctx({})), null);
  assert.equal(pickPrimaryReview([{ id: 1 }, { id: 2 }], [], ctx({})).task.id, 1);
});
