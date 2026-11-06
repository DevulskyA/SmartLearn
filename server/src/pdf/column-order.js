// Reading order of a two-column page. pdf.js reports text in the order the PDF's content stream paints it, which is not always the
// reading order: some producers paint the RIGHT column before the LEFT one. The extracted page text then reads "right column,
// left column", so the tail of the previous topic (left column) lands in the middle of the next topic's first sentence.
//
// The rule is deliberately narrow, so a page that is not clearly in that shape is left exactly as the producer painted it:
//   1. only the BODY band is considered (running header at the top / footer at the bottom keep their place, which the
//      running-furniture removal depends on);
//   2. the body must be two columns of whole lines, the right column painted (at least partly) before the left one, each column with at
//      at least MIN_BLOCK_LINES lines and each painted top to bottom (its pieces never go back up the page);
//   3. no line may span the gutter (a full-width figure caption or title means the layout is not a plain two-column flow).
// When all hold, the left block is moved before the right block. Nothing inside a line is touched.
const MIN_BLOCK_LINES = 6;
const BAND = 0.07; // top/bottom 7% of the page height is running furniture, not body
const FOOTNOTE_BAND = 0.1; // a gutter-spanning line in the bottom 10% of the page is a footnote, not a full-width title
const Y_TOLERANCE = 6; // about half a line: a column that moves up by more than this between two lines is not painted top to bottom
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
  // yMain: the baseline its longest item sits on (a raised exponent or a lowered subscript can come first); only the top-to-bottom proof uses it
  const main = visible.reduce((best, it) => (it.str.length > best.str.length ? it : best), visible[0]);
  return { left, right, y: visible[0].transform[5], yMain: main.transform[5] };
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
    else if (g.y < page.height * FOOTNOTE_BAND) foot.push({ line, column: null }); // a wide line right above the footer is a footnote: furniture
    else body.push({ line, column: 'X' }); // spans the gutter (or sits on it)
  });
  if (body.length === 0 || body.some((b) => b.column === 'X')) return items;

  const placed = body.filter((b) => b.column !== null);
  const leftCount = placed.filter((entry) => entry.column === 'L').length;
  const rightCount = placed.length - leftCount;
  if (leftCount < MIN_BLOCK_LINES || rightCount < MIN_BLOCK_LINES) return items;
  // Already in reading order (every left line before every right line): nothing to do.
  const firstRight = placed.findIndex((entry) => entry.column === 'R');
  if (!placed.slice(firstRight).some((entry) => entry.column === 'L')) return items;

  // Exactly one switch (the whole right column, then the whole left one) is the clear shape and needs no further proof. A producer may
  // also paint a column in pieces (right column start, the whole left column, right column rest): that is a two-column page only if,
  // inside each column, the pieces still run down the page (y never goes back up). A column that does not is some other layout
  // (figures, tables, floating boxes) and is left exactly as painted.
  const switches = placed.reduce((n, entry, i) => (i > 0 && entry.column !== placed[i - 1].column ? n + 1 : n), 0);
  if (switches !== 1 || placed[0].column !== 'R') {
    const lastY = { L: Infinity, R: Infinity };
    let column = null;
    for (const entry of body) {
      if (entry.column !== null) column = entry.column;
      const y = geo[lines.indexOf(entry.line)]?.yMain;
      if (column === null || y === undefined) continue;
      if (y > lastY[column] + Y_TOLERANCE) return items;
      lastY[column] = Math.min(lastY[column], y);
    }
  }

  // One switch: split where the left column starts (exactly as before). Several pieces: blank carrier lines stay with the column of the
  // line before them.
  let leftBlock;
  let rightBlock;
  if (switches === 1 && placed[0].column === 'R') {
    const firstLeft = body.findIndex((entry) => entry.column === 'L');
    rightBlock = body.slice(0, firstLeft);
    leftBlock = body.slice(firstLeft);
  } else {
    leftBlock = [];
    rightBlock = [];
    let current = leftBlock;
    for (const entry of body) {
      if (entry.column === 'L') current = leftBlock;
      else if (entry.column === 'R') current = rightBlock;
      current.push(entry);
    }
  }
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
