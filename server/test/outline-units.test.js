import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planUnits } from '../src/services/outline-units.js';

// SPRINT 05b: units follow the document's own structure; page count / size are only safety bounds.

const pages = (n, chars = 100) => Array.from({ length: n }, (_, i) => ({ pageIndex: i + 1, chars }));
const B = { maxPages: 10, maxChars: 45_000 };
const shape = (units) => units.map((u) => [u.pageStart, u.pageEnd, u.title]);

test('without an outline the result is the old page-bound chunking, untouched', () => {
  assert.deepEqual(shape(planUnits(pages(5), [], { maxPages: 2, maxChars: 45_000 })), [[1, 2, null], [3, 4, null], [5, 5, null]]);
  assert.deepEqual(shape(planUnits(pages(3), null, B)), [[1, 3, null]]);
});

test('a chapter that fits the safety bounds is one unit, named by the document itself', () => {
  const outline = [{ level: 1, title: 'Imunidade adaptativa', pageIndex: 1 }, { level: 2, title: 'Anticorpos', pageIndex: 2 }];
  assert.deepEqual(shape(planUnits(pages(6), outline, B)), [[1, 6, 'Imunidade adaptativa']]);
});

test('a chapter too large for one draft descends to its sections, each ending where the next begins', () => {
  const outline = [
    { level: 1, title: 'Cap', pageIndex: 1 },
    { level: 2, title: 'Sec A', pageIndex: 1 }, { level: 2, title: 'Sec B', pageIndex: 3 }, { level: 2, title: 'Sec C', pageIndex: 5 },
  ];
  assert.deepEqual(shape(planUnits(pages(6), outline, { maxPages: 3, maxChars: 45_000 })), [[1, 2, 'Sec A'], [3, 4, 'Sec B'], [5, 6, 'Sec C']]);
});

test('what a section says before its first subsection is not lost', () => {
  const outline = [{ level: 1, title: 'Cap', pageIndex: 1 }, { level: 2, title: 'Sec A', pageIndex: 3 }, { level: 2, title: 'Sec B', pageIndex: 5 }];
  assert.deepEqual(shape(planUnits(pages(6), outline, { maxPages: 3, maxChars: 45_000 })), [[1, 2, 'Cap'], [3, 4, 'Sec A'], [5, 6, 'Sec B']]);
});

test('several headings on one page become one unit with a joined title instead of duplicate units', () => {
  const outline = [{ level: 1, title: 'Anamnese', pageIndex: 2 }, { level: 1, title: 'Exame físico', pageIndex: 2 }, { level: 1, title: 'Investigação', pageIndex: 3 }];
  assert.deepEqual(shape(planUnits(pages(4), outline, B)), [[1, 1, null], [2, 2, 'Anamnese · Exame físico'], [3, 4, 'Investigação']]);
});

test('pages the outline does not reach are still chunked by the safety bounds, never dropped', () => {
  const outline = [{ level: 1, title: 'Cap 1', pageIndex: 4 }];
  const units = planUnits(pages(6), outline, { maxPages: 2, maxChars: 45_000 });
  assert.deepEqual(shape(units), [[1, 2, null], [3, 3, null], [4, 5, 'Cap 1 (1/2)'], [6, 6, 'Cap 1 (2/2)']]);
  const covered = new Set(units.flatMap((u) => Array.from({ length: u.pageEnd - u.pageStart + 1 }, (_, i) => u.pageStart + i)));
  assert.deepEqual([...covered].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test('a leaf section larger than the safety bound is split into named parts', () => {
  const outline = [{ level: 1, title: 'Longa', pageIndex: 1 }];
  assert.deepEqual(shape(planUnits(pages(7), outline, { maxPages: 3, maxChars: 45_000 })), [[1, 3, 'Longa (1/3)'], [4, 6, 'Longa (2/3)'], [7, 7, 'Longa (3/3)']]);
});

test('the character bound also splits, and pages without usable text never start or end a unit', () => {
  const outline = [{ level: 1, title: 'Sec', pageIndex: 1 }];
  const ok = [{ pageIndex: 1, chars: 30_000 }, { pageIndex: 3, chars: 30_000 }]; // page 2 was unreadable and is not in the list
  assert.deepEqual(shape(planUnits(ok, outline, B)), [[1, 1, 'Sec (1/2)'], [3, 3, 'Sec (2/2)']]);
  assert.deepEqual(shape(planUnits([{ pageIndex: 1, chars: 10 }, { pageIndex: 3, chars: 10 }], outline, B)), [[1, 3, 'Sec']]);
});

test('entries without a title or a resolvable page are ignored', () => {
  const outline = [{ level: 1, title: '   ', pageIndex: 1 }, { level: 1, title: 'Sem página', pageIndex: null }];
  assert.deepEqual(shape(planUnits(pages(2), outline, B)), [[1, 2, null]]);
});
