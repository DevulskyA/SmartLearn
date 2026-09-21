// Builds one page's text from pdf.js text items. pdf.js reports a line as one or more items followed by an
// EMPTY item with hasEOL=true; joining `str` alone glues the last word of a line to the first word of the next
// ("belongsto", "Box6.8"). A line end is therefore written as a real line break. Nothing else is rewritten:
// words, hyphenation and spacing inside a line stay exactly as the source has them.
export function pageTextFromItems(items) {
  let text = '';
  for (const item of items) {
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n+$/, '');
}

// A word the typesetter split at the line end: lowercase letters, a hyphen, a line break, lowercase letters.
// Capitals, digits and spaced dashes ("T-\ncell", "PD-\n1", "5 -\n7") are never touched.
const BREAK = /(\p{Ll}{2,})-\n(\p{Ll}+)/gu;
const WORD = /\p{L}+(?:-\p{L}+)*/gu;

/**
 * Rejoins words split by line-end hyphenation, using the document itself as evidence (the whole document's pages
 * are passed together): if the joined word appears unbroken anywhere ("antibodies") it is one word; else if the
 * hyphenated compound appears elsewhere ("non-specific") the hyphen is real and is kept (only the line break goes);
 * with no evidence the break is typesetting and the word is rejoined. Returns new texts, same order.
 */
export function dehyphenatePages(texts) {
  const vocabulary = new Set();
  for (const text of texts) {
    // words that are NOT split across a line end are the evidence
    for (const match of text.replace(BREAK, ' ').matchAll(WORD)) vocabulary.add(match[0].toLowerCase());
  }
  return texts.map((text) => text.replace(BREAK, (whole, head, tail) => {
    if (vocabulary.has(`${head}${tail}`)) return `${head}${tail}`;
    if (vocabulary.has(`${head}-${tail}`)) return `${head}-${tail}`;
    return `${head}${tail}`;
  }));
}

// ---- running headers / footers (page furniture) -------------------------------------------------------------
// A header such as "Adaptive immune system 87" / "88 Immunity" repeats on every page and carries the page number,
// so it lands inside the study text (often in the middle of a sentence that continues on the next page). What makes
// removing it safe is its signature: the number ADVANCES by one from page to page, and the words around it repeat.
// Content that merely starts with a number ("3 mg por dia") does not have that signature and is never touched.
const FURNITURE_MAX_CHARS = 80;
const FURNITURE_MIN_PAGES = 4;
const FURNITURE_MIN_SHARE = 0.6;

function edgeNumbers(line) {
  const text = line.trim();
  if (text.length === 0 || text.length > FURNITURE_MAX_CHARS || /[.!?;:]$/.test(text)) return [];
  const numbers = [];
  const lead = text.match(/^(\d{1,4})(?![\d.,/%])/);
  const trail = text.match(/(?<![\d.,/%-])(\d{1,4})$/);
  if (lead) numbers.push(Number(lead[1]));
  if (trail && !(lead && text.length === lead[1].length)) numbers.push(Number(trail[1]));
  return numbers;
}

function remainder(line) {
  return line.trim()
    .replace(/^\d{1,4}(?![\d.,/%])\s*/, '')
    .replace(/\s*(?<![\d.,/%-])\d{1,4}$/, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Removes running headers/footers (a first or last line whose page number advances page after page and whose
 * words repeat). Conservative on purpose: needs at least 4 pages and 60% of them to carry the signature.
 * Returns new texts, same order; a page that held only the header becomes ''.
 */
export function stripRunningHeaders(texts) {
  const result = texts.map((text) => text.split('\n'));
  if (texts.length < FURNITURE_MIN_PAGES) return texts.slice();

  for (const side of ['first', 'last']) {
    const picked = result.map((lines) => {
      const nonEmpty = lines.map((l, i) => [l, i]).filter(([l]) => l !== null && l.trim().length > 0);
      if (nonEmpty.length === 0 || (side === 'last' && nonEmpty.length < 2)) return null;
      const [line, index] = side === 'first' ? nonEmpty[0] : nonEmpty[nonEmpty.length - 1];
      const numbers = edgeNumbers(line);
      return numbers.length > 0 ? { index, numbers, words: remainder(line), hasBody: nonEmpty.length >= 2 } : null;
    });

    const chained = picked.map((cur, i) => {
      if (!cur) return false;
      const neighbours = [picked[i - 1], picked[i + 1]].filter(Boolean);
      const sequential = neighbours.some((n) => cur.numbers.some((a) => n.numbers.some((b) => Math.abs(a - b) === 1)));
      const repeated = picked.some((other, j) => j !== i && other && other.words === cur.words);
      return sequential && repeated;
    });
    // A header is a distinct element ABOVE a body: if most pages consist of that one line alone, it is the content.
    const withBody = chained.filter((yes, i) => yes && picked[i].hasBody).length;
    if (withBody < Math.ceil(texts.length * FURNITURE_MIN_SHARE)) continue;

    chained.forEach((yes, i) => { if (yes) result[i][picked[i].index] = null; });
  }
  return result.map((lines) => lines.filter((l) => l !== null).join('\n').replace(/^\n+|\n+$/g, ''));
}
