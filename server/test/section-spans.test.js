import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateHeading, ownerSpans, planSectionUnits, findTopicSections, textOfSpans } from '../src/services/section-spans.js';

// A miniature of the real Costanzo layout: on page 11 the PDF content stream prints "Glomerular Filtration" FIRST and the
// tail of the previous section ("Measuring Renal Blood Flow", its PAH sample problem) LAST. The outline says who owns what.
const PAGES = [
  { pageIndex: 10, text: 'RENAL BLOOD FLOW\nrbf regulation text\nautoregulation text' },
  { pageIndex: 11, text: 'GLOMERULAR FILTRATION\ngfr intro text\nCharacteristics of the Barrier\nbarrier text\nMeasuring Renal Blood Flow\nrbf SAMPLE PROBLEM with PAH 600 mg%' },
  { pageIndex: 12, text: 'barrier continues\nMeasurement of Glomerular Filtration Rate\ninulin text part one' },
  { pageIndex: 13, text: 'inulin text part two\nFiltration Fraction\nff text\nReabsorption and Secretion\nreabsorption text' },
];
const OUTLINE = [
  { level: 2, title: 'Renal Blood Flow', pageIndex: 10 },
  { level: 3, title: 'Measuring Renal Blood Flow', pageIndex: 11 },
  { level: 2, title: 'Glomerular Filtration', pageIndex: 11 },
  { level: 3, title: 'Characteristics of the Barrier', pageIndex: 11 },
  { level: 3, title: 'Measurement of Glomerular Filtration Rate', pageIndex: 12 },
  { level: 3, title: 'Filtration Fraction', pageIndex: 13 },
  { level: 2, title: 'Reabsorption and Secretion', pageIndex: 13 },
];
const BOUNDS = { maxPages: 50, maxChars: 100_000, minChars: 0 };
const texts = new Map(PAGES.map((p) => [p.pageIndex, p.text]));
const textOf = (unit) => textOfSpans(texts, unit.spans);

test('locateHeading prefers the heading LINE over the same words inside a sentence', () => {
  const text = 'the process of glomerular filtration is slow\nGLOMERULAR FILTRATION\nbody';
  assert.equal(locateHeading(text, 'Glomerular Filtration'), text.indexOf('GLOMERULAR FILTRATION'));
  assert.equal(locateHeading('no such heading here', 'Missing'), -1);
});

test('every character of every page is owned exactly once (spans partition the document)', () => {
  const spans = ownerSpans(PAGES, OUTLINE);
  const total = PAGES.reduce((n, p) => n + p.text.length, 0);
  assert.equal(spans.reduce((n, s) => n + (s.end - s.start), 0), total);
  for (const page of PAGES) {
    const onPage = spans.filter((s) => s.pageIndex === page.pageIndex).sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const s of onPage) { assert.equal(s.start, cursor); cursor = s.end; }
    assert.equal(cursor, page.text.length);
  }
});

test('BOUNDARY: the neighbour tail printed after the next heading stays with its own section (no leak into Glomerular Filtration)', () => {
  const [gfr] = findTopicSections(PAGES, OUTLINE, 'glomerular filtration');
  const gfrText = textOfSpans(texts, gfr.spans);
  assert.ok(gfrText.includes('gfr intro text'));
  assert.ok(gfrText.includes('barrier text'));
  assert.ok(!gfrText.includes('SAMPLE PROBLEM'), 'text exclusive to the previous section leaked in');
  assert.ok(!gfrText.includes('rbf regulation text'));

  const [rbf] = findTopicSections(PAGES, OUTLINE, 'renal blood flow').filter((m) => m.title === 'Renal Blood Flow');
  assert.ok(textOfSpans(texts, rbf.spans).includes('SAMPLE PROBLEM'), 'the previous section lost its own tail');
});

test('SCOPE: a section continues past the page where it started, up to the exact next heading (not page-bounded)', () => {
  const [gfr] = findTopicSections(PAGES, OUTLINE, 'glomerular filtration');
  const gfrText = textOfSpans(texts, gfr.spans);
  assert.ok(gfrText.includes('ff text'), 'the section lost its last subsection on the next page');
  assert.ok(!gfrText.includes('reabsorption text'), 'the next section leaked in');
  assert.equal(gfr.pageStart, 11);
  assert.equal(gfr.pageEnd, 13);
});

test('TOPIC: a subsection query selects only that subsection with its children, from the exact heading offset', () => {
  const [hit] = findTopicSections(PAGES, OUTLINE, 'measurement glomerular filtration rate');
  assert.equal(hit.title, 'Measurement of Glomerular Filtration Rate');
  const t = textOfSpans(texts, hit.spans);
  assert.ok(t.startsWith('Measurement of Glomerular Filtration Rate'));
  assert.ok(t.includes('inulin text part two'));
  assert.ok(!t.includes('barrier continues'));
  assert.ok(!t.includes('ff text'));
});

test('planSectionUnits: units partition the document and no unit carries text owned by a neighbour', () => {
  const units = planSectionUnits(PAGES, OUTLINE, BOUNDS);
  const total = PAGES.reduce((n, p) => n + p.text.length, 0);
  assert.equal(units.reduce((n, u) => n + u.chars, 0), total);
  const gfr = units.find((u) => u.title === 'Glomerular Filtration');
  assert.ok(gfr);
  assert.ok(!textOf(gfr).includes('SAMPLE PROBLEM'));
  const rbf = units.find((u) => u.title === 'Renal Blood Flow');
  assert.ok(textOf(rbf).includes('SAMPLE PROBLEM'));
  assert.ok(!textOf(rbf).includes('gfr intro text'));
});

test('text before the first heading is never dropped: it becomes an untitled unit', () => {
  const pages = [{ pageIndex: 1, text: 'cover page text' }, ...PAGES];
  const units = planSectionUnits(pages, OUTLINE, BOUNDS);
  assert.ok(units.some((u) => u.title === null && textOfSpans(new Map(pages.map((p) => [p.pageIndex, p.text])), u.spans).includes('cover page text')));
});

test('a section too big for the safety bounds is split into numbered parts, losing no text', () => {
  const units = planSectionUnits(PAGES, OUTLINE, { maxPages: 50, maxChars: 60, minChars: 0 });
  const total = PAGES.reduce((n, p) => n + p.text.length, 0);
  assert.equal(units.reduce((n, u) => n + u.chars, 0), total);
  assert.ok(units.every((u) => u.chars <= 60 || u.spans.length === 1));
});
