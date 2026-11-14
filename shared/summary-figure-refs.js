// A figure inside a Resumo Mestre is a block of its own: a line holding only `[[fig:UUID]]`, at the LEFT MARGIN of the document (no indentation,
// not inside a list, a quote, a formula or a code block). The UUID is the stable id of a PRIVATE visual asset (never a path, URL or Base64);
// caption, alternative text and provenance live in the asset's record, not in the text.
// An occurrence may carry its display width: `[[fig:UUID|w=420]]` (CSS pixels, FIGURE_WIDTH_MIN..FIGURE_WIDTH_MAX). The legacy `[[fig:UUID]]` is the same figure at
// its natural size. A marker with any other option, or a width outside the limits, is NOT a figure line: it stays literal text and is never rewritten.
//
// Dependency-free so the server (validation on save/accept, backup, audit) and the client share the exact same rule. The renderer uses a
// markdown-it rule (shared/summary-markdown.js) and the server cannot import markdown-it, so this file is a small re-implementation of the
// block grammar that matters here (fenced code, formulas, list nesting); test/summary-figure-scan.test.js keeps the two EQUAL, line by line,
// over thousands of generated documents. Change one, change the other.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const FIGURE_REF_LINE = new RegExp(`^\\[\\[fig:(${UUID})(?:\\|w=(\\d{1,4}))?\\]\\]$`, 'i');
export const FIGURE_WIDTH_MIN = 40;
export const FIGURE_WIDTH_MAX = 1600;
export const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');

/** True for an integer width inside the safe limits. */
export const isFigureWidth = (width) => Number.isInteger(width) && width >= FIGURE_WIDTH_MIN && width <= FIGURE_WIDTH_MAX;

/** The marker of one figure occurrence; `width` (optional, validated) is the display width in CSS pixels. */
export const figureRef = (id, width = null) => (isFigureWidth(width) ? `[[fig:${id}|w=${width}]]` : `[[fig:${id}]]`);

/** { id, width } (width null when absent) for a line that is exactly one figure marker, or null (not a marker, or a width outside the limits). */
export function parseFigureLine(line) {
  const m = FIGURE_REF_LINE.exec(line);
  if (!m) return null;
  if (m[2] === undefined) return { id: m[1].toLowerCase(), width: null };
  const width = Number(m[2]);
  return isFigureWidth(width) && String(width) === m[2] ? { id: m[1].toLowerCase(), width } : null;
}

const FENCE_CLOSE = /^ {0,3}(`+|~+)[ \t]*$/;
const LIST_MARKER = /^( {0,3})([-+*]|\d{1,9}[.)])( +|$)/;
const LIST_PREFIX = /^(?:[-+*]|\d{1,9}[.)]) +/;

function containerPrefixLength(line) {
  let index = 0;
  while (index < line.length) {
    const start = index;
    while (index < line.length && index - start < 3 && line[index] === ' ') index += 1;
    if (line[index] === '>') {
      index += 1;
      if (line[index] === ' ') index += 1;
      continue;
    }
    const list = LIST_PREFIX.exec(line.slice(index));
    if (list) {
      index += list[0].length;
      continue;
    }
    index = start;
    if (line[index] === ' ') index += 1;
    else break;
  }
  return index;
}

/** Width of the leading whitespace, tabs counting to the next multiple of four (as markdown-it does). */
function indentOf(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

/** Index of the last line of the formula block (`\[ ... \]`) that starts at `lines[at]`, or -1 when it is not a formula block. Same rule as summary-markdown.js. */
function mathBlockEnd(lines, at) {
  const line = lines[at];
  const first = line.slice(containerPrefixLength(line)).replace(/^[ \t]+/, '');
  if (!first.startsWith('\\[')) return -1;
  const sameLine = first.indexOf('\\]', 2);
  if (sameLine !== -1) {
    if (first.slice(sameLine + 2).trim() !== '') return -1;
    return first.slice(2, sameLine).trim() === '' ? -1 : at;
  }
  const parts = [first.slice(2)];
  for (let next = at + 1; next < lines.length; next += 1) {
    const close = lines[next].indexOf('\\]');
    if (close !== -1) {
      if (lines[next].slice(close + 2).trim() !== '') return -1;
      parts.push(lines[next].slice(0, close));
      return parts.join('\n').trim() === '' ? -1 : next;
    }
    parts.push(lines[next]);
  }
  return -1;
}

/** [{ line, id, width }] for every figure line of the text, in order (id lower-cased, repeats kept). */
export function scanFigureLines(text) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  const found = [];
  let fence = null; // { char, length } while inside a fenced code block that starts at the document's own level
  const items = []; // content offsets of the list items that are open at this point
  let blankBefore = true;
  let at = 0;
  while (at < lines.length) {
    const line = lines[at];
    if (fence) {
      fence = closeFenceIfMatched(line, fence);
      at += 1;
      continue;
    }
    if (line.trim() === '') { blankBefore = true; at += 1; continue; }
    const mathEnd = mathBlockEnd(lines, at);
    if (mathEnd !== -1) { at = mathEnd + 1; blankBefore = false; continue; }
    fence = processContentLine(line, at, items, blankBefore, found);
    blankBefore = false;
    at += 1;
  }
  return found;
}

function trimOpenListItems(items, indent, shouldClose) {
  while (items.length > 0 && items[items.length - 1] > indent && shouldClose) items.pop();
}

function openingFence(open, items, indent) {
  if (open.char === '`' && open.info.includes('`')) return null;
  // Inside a list item the fence belongs to the item; a left-margin line ends the item and the fence with it.
  if (items.length > 0 && items[items.length - 1] <= indent) return null;
  return open;
}

function parseFenceOpen(line) {
  let index = 0;
  while (index < 3 && line[index] === ' ') index += 1;
  const char = line[index];
  if (char !== '`' && char !== '~') return null;
  const start = index;
  while (line[index] === char) index += 1;
  if (index - start < 3) return null;
  return { char, length: index - start, info: line.slice(index) };
}

function closeFenceIfMatched(line, fence) {
  const close = FENCE_CLOSE.exec(line);
  return close && close[1][0] === fence.char && close[1].length >= fence.length ? null : fence;
}

function processContentLine(line, at, items, blankBefore, found) {
  const indent = indentOf(line);
  const marker = LIST_MARKER.exec(line);
  const interrupts = marker !== null || parseFenceOpen(line) !== null || parseFigureLine(line.trimEnd()) !== null;
  trimOpenListItems(items, indent, blankBefore || interrupts);
  const open = parseFenceOpen(line);
  if (open) return openingFence(open, items, indent);
  if (marker) {
    const spaces = marker[3].length;
    items.push(indent + marker[2].length + (spaces === 0 || spaces > 4 ? 1 : spaces));
  } else if (indent === 0) {
    const ref = parseFigureLine(line.trimEnd());
    if (ref) found.push({ line: at, id: ref.id, width: ref.width });
  }
  return null;
}

/** The figure ids a summary text points at, in order of appearance, without repeats. Lines inside code, formulas, lists and quotes do not count. */
export function listFigureRefs(text) {
  const ids = [];
  for (const { id } of scanFigureLines(text)) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** The text the deterministic audit reads: figure lines dropped, math delimiters turned into spaces (the formula content stays). */
export function stripSummaryMarkup(text) {
  return replaceFigureRefs(text, () => '').replace(/\\[()[\]]/g, ' ');
}

/**
 * The text with every figure line replaced by a plain-words note, for exports that cannot carry the image files.
 * `describe(id)` returns the note (e.g. the figure's caption/alt) or null when the figure is unknown.
 */
export function replaceFigureRefs(text, describe) {
  const source = String(text ?? '');
  const hits = new Map(scanFigureLines(source).map((hit) => [hit.line, hit.id]));
  if (hits.size === 0) return source;
  // the original line breaks are kept as they are: only the content of a figure line changes
  const parts = source.split(/(\r\n|\r|\n)/);
  for (let at = 0; at * 2 < parts.length; at += 1) {
    const id = hits.get(at);
    if (id !== undefined) parts[at * 2] = describe(id);
  }
  return parts.join('');
}
