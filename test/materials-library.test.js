import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryView, LIBRARY_PAGE_SIZE } from "../src/materials-library.js";

const docs = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, originalName: `Documento ${String(i + 1)}.pdf`, pageCount: 10 + i }));

test("0, 1, 12, 13, 39 and 200 documents: the total is the real total and the last item is reachable", () => {
  for (const n of [0, 1, 12, 13, 39, 200]) {
    const all = docs(n);
    const first = libraryView(all, {});
    assert.equal(first.total, n);
    assert.equal(first.matched, n);
    assert.equal(first.pageCount, Math.max(1, Math.ceil(n / LIBRARY_PAGE_SIZE)));
    const last = libraryView(all, { page: first.pageCount });
    assert.equal(last.to, n);
    if (n > 0) assert.equal(last.items.at(-1).id, n);
    const seen = [];
    for (let p = 1; p <= first.pageCount; p += 1) seen.push(...libraryView(all, { page: p }).items.map((s) => s.id));
    assert.deepEqual(seen, all.map((s) => s.id), `every document appears exactly once with ${n} documents`);
  }
});

test("page is clamped: a page past the end (after removing the last item of the last page) shows the last valid page", () => {
  const view = libraryView(docs(13), { page: 9 });
  assert.equal(view.page, 2);
  assert.equal(view.items.length, 1);
  assert.equal(libraryView(docs(13), { page: -3 }).page, 1);
  assert.equal(libraryView(docs(13), { page: Number.NaN }).page, 1);
});

test("search ignores accents and case and counts matches before paging", () => {
  const all = [
    { id: 1, originalName: "Fisiologia Médica.pdf", pageCount: 100 },
    { id: 2, originalName: "fisiologia renal.pdf", pageCount: 50 },
    { id: 3, originalName: "Anatomia.pdf", pageCount: 80 },
  ];
  const view = libraryView(all, { query: "MEDICA" });
  assert.deepEqual(view.items.map((s) => s.id), [1]);
  assert.equal(view.matched, 1);
  assert.equal(view.total, 3);
  assert.equal(libraryView(all, { query: "zzz" }).matched, 0);
  assert.equal(libraryView(all, { query: "zzz" }).from, 0);
  assert.equal(libraryView(all, { query: "   " }).matched, 3, "blank search is no search");
});

test("order: A-Z is natural and accent-insensitive, ties keep the server order, 'more pages' puts unknown counts last", () => {
  const all = [
    { id: 1, originalName: "Aula 10.pdf", pageCount: 5 },
    { id: 2, originalName: "aula 2.pdf", pageCount: null },
    { id: 3, originalName: "Écg.pdf", pageCount: 40 },
    { id: 4, originalName: "Aula 2.pdf", pageCount: 40 },
  ];
  assert.deepEqual(libraryView(all, { sort: "name-asc" }).items.map((s) => s.id), [2, 4, 1, 3]);
  assert.deepEqual(libraryView(all, { sort: "name-desc" }).items.map((s) => s.id), [3, 1, 2, 4]);
  assert.deepEqual(libraryView(all, { sort: "pages-desc" }).items.map((s) => s.id), [3, 4, 1, 2]);
  assert.deepEqual(libraryView(all, { sort: "original" }).items.map((s) => s.id), [1, 2, 3, 4]);
  assert.deepEqual(libraryView(all, { sort: "bogus" }).items.map((s) => s.id), [1, 2, 3, 4], "unknown order falls back to the server order");
});

test("the input array is never mutated", () => {
  const all = docs(5);
  const snapshot = JSON.stringify(all);
  libraryView(all, { sort: "name-desc", query: "doc" });
  assert.equal(JSON.stringify(all), snapshot);
});
