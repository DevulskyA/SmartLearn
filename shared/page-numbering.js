// Page numbers of a book versus page positions in its PDF. `numbering` is what the server detects (server/src/pdf/printed-page-numbers.js):
//   { mode: 'pdf' }                                              no printed numbers found: the PDF's own numbering is used
//   { mode: 'printed', segments: [{ offset, firstPdf, lastPdf }] }  printed number + offset = PDF page, per stretch of the book
// Pure, shared by the server (to read the range a student types) and the screen (to show ranges in the numbers the student knows).

// How far (in PDF pages) a PDF page is from a stretch; 0 when inside it.
const gap = (pdfPage, s) => (pdfPage < s.firstPdf ? s.firstPdf - pdfPage : pdfPage > s.lastPdf ? pdfPage - s.lastPdf : 0);

/** The PDF page for a number the student read in the book (the stretch whose offset puts it closest to its own pages). */
export function pdfPageOfPrinted(numbering, printed) {
  if (numbering?.mode !== 'printed') return printed;
  let best = null;
  for (const s of numbering.segments) {
    const pdfPage = printed + s.offset;
    const distance = gap(pdfPage, s);
    if (!best || distance < best.distance) best = { pdfPage, distance };
  }
  return best ? best.pdfPage : printed;
}

/**
 * The number printed in the book for a PDF page (the stretch it is in, or the nearest one). `null` for the front matter: a page before
 * the book's page 1 (cover, contents) has no printed number, and a negative one would be wrong.
 */
export function printedOfPdfPage(numbering, pdfPage) {
  if (numbering?.mode !== 'printed') return pdfPage;
  let best = null;
  for (const s of numbering.segments) {
    const distance = gap(pdfPage, s);
    if (!best || distance < best.distance) best = { offset: s.offset, distance };
  }
  const printed = best ? pdfPage - best.offset : pdfPage;
  return printed >= 1 ? printed : null;
}
