// Reading order of a two-column page. pdf.js reports text in the order the PDF's content stream paints it, which is not always the
// reading order: some producers paint the RIGHT column before the LEFT one. The extracted page text then reads "right column,
// left column", so the tail of the previous topic (left column) lands in the middle of the next topic's first sentence.
//
// The rule is deliberately narrow, so a page that is not clearly in that shape is left exactly as the producer painted it:
//   1. only the BODY band is considered (running header at the top / footer at the bottom keep their place, which the
//      running-furniture removal depends on);
//   2. the body must be two blocks of whole lines in the stream: all right-column lines, then all left-column lines
//      (exactly one switch, right -> left), each block with at least MIN_BLOCK_LINES lines;
//   3. no line may span the gutter (a full-width figure caption or title means the layout is not a plain two-column flow).
// When all hold, the left block is moved before the right block. Nothing inside a line is touched.
const MIN_BLOCK_LINES = 6;
const BAND = 0.07; // top/bottom 7% of the page height is running furniture, not body
const GUTTER_MARGIN = 0.03; // a line must start/end at least 3% of the page width away from the middle to be placed in a column

function splitLines(items) {
  const lines = [];
  let current = [];
  for (const item of items) {
    current.push(item);
    if (item.hasEOL) { lines.push(current); current = []; }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function geometry(line) {
  const visible = line.filter((it) => it.str.trim().length > 0 && Array.isArray(it.transform));
  if (visible.length === 0) return null;
  const left = Math.min(...visible.map((it) => it.transform[4]));
  const right = Math.max(...visible.map((it) => it.transform[4] + (Number.isFinite(it.width) ? it.width : 0)));
  return { left, right, y: visible[0].transform[5] };
}

/**
 * @param items pdf.js text items of one page, in stream order
 * @param page {width, height} the page's size in the same units as item.transform
 * @returns the same items, reordered only when the page is the right-column-first two-column shape described above
 */
export function orderItemsByColumns(items, page) {
  if (!Array.isArray(items) || !page || !(page.width > 0) || !(page.height > 0)) return items;
  const lines = splitLines(items);
  const geo = lines.map(geometry);
  const mid = page.width / 2;
  const margin = page.width * GUTTER_MARGIN;
  const bodyTop = page.height * (1 - BAND);
  const bodyBottom = page.height * BAND;

  const head = [];
  const body = [];
  const foot = [];
  let seenBody = false;
  lines.forEach((line, i) => {
    const g = geo[i];
    if (!g) { (seenBody ? body : head).push({ line, column: null }); return; } // blank carrier lines follow their neighbours
    const inBody = g.y < bodyTop && g.y > bodyBottom;
    if (!inBody) { (seenBody ? foot : head).push({ line, column: null }); return; }
    seenBody = true;
    if (g.right <= mid + margin / 2 && g.left < mid - margin) body.push({ line, column: 'L' });
    else if (g.left >= mid - margin / 2 && g.right > mid + margin) body.push({ line, column: 'R' });
    else body.push({ line, column: 'X' }); // spans the gutter (or sits on it)
  });
  if (body.length === 0 || body.some((b) => b.column === 'X')) return items;

  const placed = body.filter((b) => b.column !== null);
  const switches = placed.reduce((n, b, i) => (i > 0 && b.column !== placed[i - 1].column ? n + 1 : n), 0);
  const leftCount = placed.filter((b) => b.column === 'L').length;
  const rightCount = placed.length - leftCount;
  if (switches !== 1 || placed[0].column !== 'R' || leftCount < MIN_BLOCK_LINES || rightCount < MIN_BLOCK_LINES) return items;

  const firstLeft = body.findIndex((b) => b.column === 'L');
  const rightBlock = body.slice(0, firstLeft);
  const leftBlock = body.slice(firstLeft);
  // A block boundary is a line boundary. The line that ended the page in the stream may carry no end-of-line marker (a watermark,
  // a last fragment); moved in front of the other column it would glue to that column's first line and a heading there
  // ("GLOMERULAR FILTRATION") would stop being on a line of its own, so it could no longer be found as a section start.
  const closed = (entries) => entries.map((entry, i) => {
    if (i < entries.length - 1 || entry.line.length === 0) return entry.line;
    const last = entry.line[entry.line.length - 1];
    return last.hasEOL ? entry.line : [...entry.line.slice(0, -1), { ...last, hasEOL: true }];
  });
  return [...head.map((entry) => entry.line), ...closed(leftBlock), ...closed(rightBlock), ...foot.map((entry) => entry.line)].flat();
}
