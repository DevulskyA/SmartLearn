// The number printed on a page of a book (header or footer) is not the page's position in the PDF: front matter, covers and
// plates shift it. This reads those printed numbers from the first and last lines of each page and, when they agree on ONE
// offset across the document, reports it. No agreement (a book with no page numbers, or numbers that do not line up) means
// "use the PDF's own numbering". Pure: it only looks at the lines it is given.

const SEPARATOR = '[•·|–—]';
const PATTERNS = [
  /^(\d{1,4})$/,                                              // "245"
  /^(?:page|p\.?|pág\.?|página)\s*(\d{1,4})$/i,               // "Page 245", "pág. 245"
  new RegExp(`^(\\d{1,4})\\s*${SEPARATOR}\\s*\\S.{0,80}$`),   // "4 • Physiology"
  new RegExp(`^\\S.{0,80}?\\s*${SEPARATOR}\\s*(\\d{1,4})$`),  // "1—Cellular Physiology • 5"
];

/** Every plausible printed page number on one line (a header line may fit more than one pattern). */
export function numbersInLine(line) {
  const text = String(line ?? '').trim();
  const found = new Set();
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (match) found.add(Number(match[1]));
  }
  return [...found];
}

// A page's own number sits in its first or last lines; anything deeper in the text is body text.
export const EDGE_LINES = 2;

/** The first and last non-empty lines of a page's text, the only part the detector looks at. */
export function edgesOfText(text) {
  const lines = String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  return { first: lines.slice(0, EDGE_LINES), last: lines.slice(-EDGE_LINES) };
}

const MIN_ANCHORS = 4;   // pages that must agree for the document to count as "numbered"
const MIN_SHARE = 0.25;  // ...and they must be at least this share of the pages
const MIN_SEGMENT = 3;   // an offset seen on fewer pages than this is a coincidence, not a stretch of the book

/**
 * Real books do not keep one offset: a plate, a missing page or a section inserted by the scan shifts the printed numbers by
 * a page or two. So the answer is a list of stretches, each "from PDF page a to PDF page b the offset is d".
 * @param {{first:string[], last:string[]}[]} edges one entry per PDF page, in order (edges[0] is PDF page 1)
 * @returns {{mode:'pdf'} | {mode:'printed', segments:{offset:number, firstPdf:number, lastPdf:number, pages:number}[]}}
 *          printed: PDF page = printed number + offset of the stretch that page belongs to
 */
export function detectPrintedNumbering(edges) {
  // every offset each page could have, from the numbers on its edge lines
  const candidates = edges.map((edge, index) => new Set([...(edge?.first ?? []), ...(edge?.last ?? [])].flatMap(numbersInLine).map((printed) => index + 1 - printed)));
  // a page's own offset: the one most pages around it agree on (a stray number in a header does not outvote its neighbours)
  const local = candidates.map((_, index) => {
    const counts = new Map();
    for (let j = Math.max(0, index - WINDOW); j <= Math.min(candidates.length - 1, index + WINDOW); j++) {
      for (const offset of candidates[j]) counts.set(offset, (counts.get(offset) ?? 0) + 1);
    }
    let best = null;
    for (const [offset, count] of counts) if (candidates[index].has(offset) && count >= MIN_SEGMENT && (!best || count > best.count)) best = { offset, count };
    return best?.offset ?? null;
  });
  // consecutive pages with the same offset form a stretch; stretches with the same offset on both sides of a gap are one
  const segments = [];
  local.forEach((offset, index) => {
    if (offset === null) return;
    const last = segments[segments.length - 1];
    if (last && last.offset === offset) { last.lastPdf = index + 1; last.pages += 1; } else segments.push({ offset, firstPdf: index + 1, lastPdf: index + 1, pages: 1 });
  });
  const anchors = local.filter((offset) => offset !== null).length;
  if (anchors < Math.max(MIN_ANCHORS, Math.ceil(edges.length * MIN_SHARE))) return { mode: 'pdf' };
  return { mode: 'printed', segments };
}

const WINDOW = 8; // pages looked at on each side when deciding a page's own offset

// The mapping itself lives in shared/ so the screen shows ranges with the same arithmetic the server reads them with.
export { pdfPageOfPrinted, printedOfPdfPage } from '../../../shared/page-numbering.js';
