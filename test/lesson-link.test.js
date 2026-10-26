import { test } from "node:test";
import assert from "node:assert/strict";
import { findLesson } from "../src/lesson-link.js";

// A shortcut to a lesson goes only where the lesson is: never nowhere, never to another one.

const units = [{ id: 1, title: "A" }, { id: 7, title: "B" }, { id: 12, title: "C" }];

test("findLesson returns exactly the lesson the id points at", () => {
  assert.equal(findLesson(units, 7).title, "B");
  assert.equal(findLesson(units, 12).title, "C");
});

test("an id written as text (a data attribute) still finds the same lesson, and only that one", () => {
  assert.equal(findLesson(units, "7").title, "B");
  assert.equal(findLesson(units, "1").title, "A", "'1' is not '12' or '17'");
});

test("no id, an unknown id, a deleted lesson and garbage all give null: the shortcut must not open anything", () => {
  for (const id of [null, undefined, "", "abc", NaN, 1.5, 0, 99, -1, {}, []]) assert.equal(findLesson(units, id), null, `id ${String(id)}`);
  assert.equal(findLesson(units.filter((u) => u.id !== 7), 7), null, "the lesson was deleted after the link was drawn");
});

test("no list of lessons (data unavailable) gives null instead of throwing", () => {
  assert.equal(findLesson(null, 7), null);
  assert.equal(findLesson(undefined, 7), null);
  assert.equal(findLesson([], 7), null);
});
