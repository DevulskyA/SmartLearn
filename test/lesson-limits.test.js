import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PAGES_PER_LESSON, pageCountOf, findPageConflict, estimateClassMinutes, splitIntoParts } from '../shared/lesson-limits.js';

// LESSON LIMITS: one lesson holds what a class of ~2 h covers; lessons of the same book never repeat pages, except ONE boundary page.

test('the cap is 30 pages and a range counts both ends', () => {
  assert.equal(MAX_PAGES_PER_LESSON, 30);
  assert.equal(pageCountOf(1, 30), 30);
  assert.equal(pageCountOf(5, 5), 1);
});

const existing = [{ pageStart: 1, pageEnd: 30 }];

test('pages 25-40 after 1-30 clash on pages 25 to 30', () => {
  assert.deepEqual(findPageConflict({ pageStart: 25, pageEnd: 40 }, existing), { pageStart: 25, pageEnd: 30, withIndex: 0 });
});

test('the same range twice, and a range inside another, clash', () => {
  assert.deepEqual(findPageConflict({ pageStart: 1, pageEnd: 30 }, existing), { pageStart: 1, pageEnd: 30, withIndex: 0 });
  assert.deepEqual(findPageConflict({ pageStart: 10, pageEnd: 12 }, existing), { pageStart: 10, pageEnd: 12, withIndex: 0 });
  assert.deepEqual(findPageConflict({ pageStart: 30, pageEnd: 30 }, existing), { pageStart: 30, pageEnd: 30, withIndex: 0 });
});

test('two shared pages clash even when only one is the boundary', () => {
  assert.deepEqual(findPageConflict({ pageStart: 29, pageEnd: 40 }, existing), { pageStart: 29, pageEnd: 30, withIndex: 0 });
});

test('ONE boundary page is allowed: the next lesson starts where the previous ended, or the new one ends where an existing one starts', () => {
  assert.equal(findPageConflict({ pageStart: 30, pageEnd: 40 }, existing), null);
  assert.equal(findPageConflict({ pageStart: 1, pageEnd: 10 }, [{ pageStart: 10, pageEnd: 20 }]), null);
});

test('disjoint ranges and an empty book never clash; the clash names which lesson', () => {
  assert.equal(findPageConflict({ pageStart: 31, pageEnd: 60 }, existing), null);
  assert.equal(findPageConflict({ pageStart: 1, pageEnd: 5 }, []), null);
  assert.equal(findPageConflict({ pageStart: 45, pageEnd: 50 }, [{ pageStart: 1, pageEnd: 30 }, { pageStart: 40, pageEnd: 60 }]).withIndex, 1);
});

test('the class-time estimate follows ~130 spoken words/min with ~6 characters per word, and never says 0 minutes', () => {
  assert.equal(estimateClassMinutes(93_600), 120); // 15,600 words = the 2 h class the 30-page cap is derived from
  assert.equal(estimateClassMinutes(7_800), 10);
  assert.equal(estimateClassMinutes(10), 1);
  assert.equal(estimateClassMinutes(0), 0);
});

test('splitIntoParts: a long section becomes the fewest equal parts within the cap, no overlap, exact cover', () => {
  assert.deepEqual(splitIntoParts(1, 30), [{ pageStart: 1, pageEnd: 30 }]);
  assert.deepEqual(splitIntoParts(1, 64), [{ pageStart: 1, pageEnd: 22 }, { pageStart: 23, pageEnd: 44 }, { pageStart: 45, pageEnd: 64 }]);
  for (const [start, end] of [[1, 31], [10, 400], [5, 5], [100, 190]]) {
    const parts = splitIntoParts(start, end);
    assert.equal(parts[0].pageStart, start);
    assert.equal(parts.at(-1).pageEnd, end);
    parts.forEach((p, i) => {
      assert.ok(pageCountOf(p.pageStart, p.pageEnd) <= MAX_PAGES_PER_LESSON);
      if (i) assert.equal(p.pageStart, parts[i - 1].pageEnd + 1);
    });
    assert.equal(parts.length, Math.ceil(pageCountOf(start, end) / MAX_PAGES_PER_LESSON));
  }
  assert.deepEqual(splitIntoParts(9, 3), []);
});
