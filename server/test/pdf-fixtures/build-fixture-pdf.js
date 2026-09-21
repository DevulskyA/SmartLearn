// Builds a minimal, real, parseable multi-page PDF entirely in code, with
// byte offsets computed programmatically (never hand-counted) so the xref
// table is always correct. Used only by server/test/pdf-extraction.test.js
// -- no PDF-writing dependency needed for one small fixture.

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

/**
 * @param {string[]} pagesText one string per page; each becomes the page's
 *   entire extractable text content.
 * @param {{emptyPages?: number[]}} [options] 1-based page numbers whose
 *   /Contents is deliberately pointed at a nonexistent indirect object —
 *   real-world equivalent of a scanned/image-only page: pdf.js resolves
 *   this leniently (no exception) and simply extracts no text for that
 *   page, letting a real "mixed OK/EMPTY pages in one document" fixture
 *   be built without a corrupted/unparseable file overall (verified by
 *   direct reproduction against the real pdf.js parser).
 * @returns {Buffer} a well-formed single/multi-page PDF.
 */
export function buildFixturePdf(pagesText, { emptyPages = [] } = {}) {
  const pageCount = pagesText.length;
  const header = '%PDF-1.4\n';

  // Object numbering: 1=Catalog, 2=Pages, 3=Font,
  // 4..(4+pageCount-1)=Page objects, (4+pageCount)..(4+2*pageCount-1)=Content streams.
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const firstPageId = 4;
  const firstContentId = firstPageId + pageCount;

  const pageIds = Array.from({ length: pageCount }, (_, i) => firstPageId + i);
  const contentIds = Array.from({ length: pageCount }, (_, i) => firstContentId + i);

  const catalogObj = pdfObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const pagesObj = pdfObject(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  // WinAnsiEncoding so Latin-1-encoded accented characters (e.g. the
  // Portuguese fixture text below) map to the correct glyphs -- without an
  // explicit /Encoding, Helvetica's built-in StandardEncoding does not
  // agree with Latin-1 above 0x7F.
  const fontObj = pdfObject(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  // Wide MediaBox: pdf.js clips a text run's extracted string at the page
  // boundary, so a narrow page silently truncates getTextContent() output
  // for anything longer than a few characters -- discovered by direct
  // reproduction while writing this fixture. Sized from the longest page's
  // actual character count (generously, 14pt/char at 18pt Helvetica) so an
  // arbitrarily long fixture string is never clipped, not just a "typical" one.
  const longestPageLength = Math.max(...pagesText.map((t) => t.length), 1);
  const pageWidth = Math.max(2000, longestPageLength * 14 + 100);

  const emptyPageSet = new Set(emptyPages);
  const NONEXISTENT_OBJECT_ID = 9999; // never assigned to any real object
  const pageObjs = pageIds.map((id, i) => pdfObject(
    id,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} 200] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${emptyPageSet.has(i + 1) ? NONEXISTENT_OBJECT_ID : contentIds[i]} 0 R >>`
  ));

  const contentObjs = pagesText.map((text, i) => {
    // A "\n" in the page text becomes a real new text line (Td down 22pt), like a real multi-line page.
    const lines = text.split('\n').map((line) => line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
    const stream = `BT /F1 18 Tf 20 100 Td (${lines[0]}) Tj${lines.slice(1).map((line) => ` 0 -22 Td (${line}) Tj`).join('')} ET`;
    return pdfObject(contentIds[i], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  const objectsInOrder = [
    { id: catalogId, body: catalogObj },
    { id: pagesId, body: pagesObj },
    { id: fontId, body: fontObj },
    ...pageIds.map((id, i) => ({ id, body: pageObjs[i] })),
    ...contentIds.map((id, i) => ({ id, body: contentObjs[i] })),
  ].sort((a, b) => a.id - b.id);

  let body = header;
  const offsets = new Map();
  for (const obj of objectsInOrder) {
    offsets.set(obj.id, Buffer.byteLength(body, 'latin1'));
    body += obj.body;
  }

  const xrefOffset = Buffer.byteLength(body, 'latin1');
  const maxId = objectsInOrder[objectsInOrder.length - 1].id;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) {
    const offset = offsets.get(id);
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body + xref + trailer, 'latin1');
}
