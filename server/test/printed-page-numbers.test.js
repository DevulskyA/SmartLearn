import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbersInLine, edgesOfText, detectPrintedNumbering, pdfPageOfPrinted, printedOfPdfPage } from '../src/pdf/printed-page-numbers.js';

// Headers as they appear in a real medical textbook: even pages "4 • Physiology", odd pages "1—Cellular Physiology • 5".
test('LINES: the printed number is read from the shapes real books use, and not from body text', () => {
  assert.deepEqual(numbersInLine('245'), [245]);
  assert.deepEqual(numbersInLine('Page 245'), [245]);
  assert.deepEqual(numbersInLine('pág. 245'), [245]);
  assert.deepEqual(numbersInLine('4 • Physiology'), [4]);
  assert.ok(numbersInLine('1—Cellular Physiology • 5').includes(5));
  assert.deepEqual(numbersInLine('The patient was given 150 mg'), []);
  assert.deepEqual(numbersInLine('Chapter 12'), []);
  assert.deepEqual(numbersInLine(''), []);
});

test('EDGES: only the first and last two non-empty lines of a page are kept', () => {
  const edges = edgesOfText('\nA\n\nB\nC\nD\nE\n');
  assert.deepEqual(edges, { first: ['A', 'B'], last: ['D', 'E'] });
});

// A book of 60 PDF pages: cover and front matter, then numbering from page 1 on PDF page 9, with a page missing at PDF 31
// (the offset drops from 8 to 7) -- the case a single global offset gets wrong.
function book() {
  return Array.from({ length: 60 }, (_, i) => {
    const pdf = i + 1;
    if (pdf < 9) return { first: ['Cover and front matter'], last: [] };
    const printed = pdf - (pdf < 31 ? 8 : 7);
    return pdf % 2 === 0 ? { first: [`${printed} • Physiology`], last: ['body text'] } : { first: [`1—Cellular Physiology • ${printed}`], last: ['body text'] };
  });
}

test('NUMBERED BOOK: stretches with their own offsets; both directions map to the right page', () => {
  const numbering = detectPrintedNumbering(book());
  assert.equal(numbering.mode, 'printed');
  assert.deepEqual(numbering.segments.map((s) => s.offset), [8, 7]);
  assert.equal(pdfPageOfPrinted(numbering, 1), 9);
  assert.equal(pdfPageOfPrinted(numbering, 20), 28);   // before the missing page
  assert.equal(pdfPageOfPrinted(numbering, 40), 47);   // after it
  assert.equal(printedOfPdfPage(numbering, 28), 20);
  assert.equal(printedOfPdfPage(numbering, 47), 40);
});

test('NO PAGE NUMBERS: the PDF numbering is used, both ways', () => {
  const plain = Array.from({ length: 60 }, () => ({ first: ['Some running title'], last: ['A sentence of the body.'] }));
  const numbering = detectPrintedNumbering(plain);
  assert.deepEqual(numbering, { mode: 'pdf' });
  assert.equal(pdfPageOfPrinted(numbering, 245), 245);
  assert.equal(printedOfPdfPage(numbering, 245), 245);
});

test('STRAY NUMBERS: a few numbers in headers do not turn an unnumbered document into a numbered one', () => {
  const stray = Array.from({ length: 60 }, (_, i) => ({ first: i % 20 === 0 ? [`${i * 3 + 7}`] : ['Title'], last: [] }));
  assert.equal(detectPrintedNumbering(stray).mode, 'pdf');
});

test('EXCERPT: a chapter PDF that starts at printed page 245 maps 245 to PDF page 1', () => {
  const chapter = Array.from({ length: 22 }, (_, i) => ({ first: [`${245 + i}`], last: [] }));
  const numbering = detectPrintedNumbering(chapter);
  assert.equal(numbering.mode, 'printed');
  assert.equal(pdfPageOfPrinted(numbering, 245), 1);
  assert.equal(pdfPageOfPrinted(numbering, 266), 22);
});

test('front matter has no printed number: a PDF page before the book page 1 is null, never zero or negative', () => {
  const numbering = { mode: 'printed', segments: [{ offset: 8, firstPdf: 9, lastPdf: 53, pages: 45 }] };
  assert.equal(printedOfPdfPage(numbering, 1), null);
  assert.equal(printedOfPdfPage(numbering, 8), null);
  assert.equal(printedOfPdfPage(numbering, 9), 1);
  assert.equal(printedOfPdfPage({ mode: 'pdf' }, 1), 1);
});
