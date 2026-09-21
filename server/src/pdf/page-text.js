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

/**
 * The visual lines of a page with the largest item height of each (the structure signal headings are read from).
 * Same line rule as pageTextFromItems: a line ends at an item with hasEOL.
 */
export function linesFromItems(items) {
  const lines = [];
  let text = '';
  let height = 0;
  const flush = () => {
    if (text.trim().length > 0) lines.push({ text: text.trim(), height });
    text = '';
    height = 0;
  };
  for (const item of items) {
    text += item.str;
    if (item.str.trim().length > 0) height = Math.max(height, item.height ?? 0);
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}
// A word the typesetter split at the line end: lowercase letters, a hyphen, a line break, lowercase letters.
// Capitals, digits and spaced dashes ("T-\ncell", "PD-\n1", "5 -\n7") are never touched.
// The tail is only LOOKED AT (lookahead), so a chain of breaks (methionyl-, leucyl-, phenylalanine) resolves link by link.
const BREAK = /(?<!\p{L})(\p{Lu}?\p{Ll}{2,})-\n(?=(\p{Ll}+))/gu;
const BROKEN_WORD = /(?<!\p{L})\p{Lu}?\p{Ll}{2,}-\n\p{Ll}+/gu;
const WORD = /\p{L}+(?:-\p{L}+)*/gu;
// Prefixes that keep their hyphen in the source ("non-encapsulated", "self-tolerance", "cross-presentation")
const HYPHENATED_PREFIXES = new Set(['non', 'self', 'cross']);
const COMPOUND_HEAD_MIN_LETTERS = 5;

/**
 * Rejoins words split by line-end hyphenation WITHOUT changing a term: the document itself is the evidence (all
 * pages together). In order: (1) the joined word appears unbroken elsewhere ("antibodies") -> one word; (2) the
 * hyphenated compound appears elsewhere ("non-specific") -> the hyphen is real, only the line break goes; (3) the
 * break sits inside a real compound - a long complete word before the hyphen ("permeability-", "pathogen-"), both
 * halves being words the document uses ("gram-" + "positive"), or a hyphenated prefix -> the hyphen stays;
 * (4) otherwise it is a syllable break ("sys-" + "tem") and the word is rejoined. Joining a real compound would change
 * the medical term, so when in doubt about a complete word the hyphen is kept. Returns new texts, same order.
 */
export function dehyphenatePages(texts) {
  const vocabulary = new Set();
  const standalone = new Set();
  for (const text of texts) {
    // words that are NOT split across a line end are the evidence
    for (const match of text.replace(BROKEN_WORD, ' ').matchAll(WORD)) {
      const word = match[0].toLowerCase();
      vocabulary.add(word);
      for (const part of word.split('-')) if (part.length >= 3) standalone.add(part);
    }
  }
  return texts.map((text) => text.replace(BREAK, (whole, rawHead, tail) => {
    const head = rawHead.toLowerCase();
    if (vocabulary.has(`${head}${tail}`)) return rawHead;
    if (vocabulary.has(`${head}-${tail}`)) return `${rawHead}-`;
    const headIsWord = standalone.has(head);
    // a chemical name broken at its own hyphens (methionyl-, leucyl-) is a compound, not a syllable
    const chemicalRadical = head.endsWith('yl');
    if (HYPHENATED_PREFIXES.has(head) || chemicalRadical || (headIsWord && head.length >= COMPOUND_HEAD_MIN_LETTERS) || (headIsWord && standalone.has(tail))) return `${rawHead}-`;
    return rawHead;
  }));
}

// ---- running headers / footers (page furniture) -------------------------------------------------------------
// A header such as "6 80 Immunity" / "6Innate immune system 81" repeats on every page and carries the page number, so
// it lands inside the study text (often in the middle of a sentence that continues on the next page). What makes
// removing it safe is its signature: a number in the line ADVANCES by one from page to page. Either its words repeat
// on other pages, or the numbers form a long run (a new section name appears only once, but it still continues
// 81, 82, 83...). Content that merely starts with a number ("3 mg por dia", "1 Introducao") has neither signature.
const FURNITURE_MAX_CHARS = 80;
const FURNITURE_MIN_PAGES = 4;
const FURNITURE_MIN_SHARE = 0.6;
const FURNITURE_LONG_RUN = 8;
const PAGE_NUMBER = /(?<![\d.,/%-])\d{1,4}(?![\d.,/%])/g;

function edgeNumbers(line) {
  const text = line.trim();
  if (text.length === 0 || text.length > FURNITURE_MAX_CHARS || /[.!?;:]$/.test(text)) return [];
  return [...text.matchAll(PAGE_NUMBER)].map((m) => Number(m[0]));
}

function remainder(line) {
  return line.trim().replace(PAGE_NUMBER, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Removes running headers/footers (a first or last line whose page number advances page after page). Conservative on
 * purpose: at least 4 pages, 60% of them carrying the signature, and the header must sit above a body.
 * Returns new texts, same order; a page that held only the header becomes ''.
 */
function stripNumberedEdges(texts) {
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

    // page i links to page i+1 when some number in i's line is exactly one less than a number in i+1's line
    const linked = picked.map((cur, i) => Boolean(cur && picked[i + 1] && cur.numbers.some((a) => picked[i + 1].numbers.includes(a + 1))));
    const runLength = picked.map((_, i) => {
      let from = i; while (from > 0 && linked[from - 1]) from -= 1;
      let to = i; while (to < picked.length - 1 && linked[to]) to += 1;
      return to - from + 1;
    });
    const chained = picked.map((cur, i) => {
      if (!cur || !(linked[i] || (i > 0 && linked[i - 1]))) return false;
      const repeated = picked.some((other, j) => j !== i && other && other.words === cur.words);
      return repeated || runLength[i] >= FURNITURE_LONG_RUN;
    });
    // A header is a distinct element ABOVE a body: if most pages consist of that one line alone, it is the content.
    const withBody = chained.filter((yes, i) => yes && picked[i].hasBody).length;
    if (withBody < Math.ceil(texts.length * FURNITURE_MIN_SHARE)) continue;

    chained.forEach((yes, i) => { if (yes) result[i][picked[i].index] = null; });
  }
  return result.map((lines) => lines.filter((l) => l !== null).join('\n').replace(/^\n+|\n+$/g, ''));
}

// A line repeated VERBATIM at the same edge of many pages (a course title, "Seccion XII Gastroenterologia", a copyright
// notice) is furniture even without a page number. At least four pages, at least 40% of them, a header-sized line, and
// the page must have a body under (or above, for a footer) it.
const REPEAT_MIN_SHARE = 0.4;
const REPEAT_MIN_CHARS = 6;
const REPEAT_MAX_CHARS = 100;
const normalizeLine = (line) => line.trim().replace(/\s+/g, ' ').toLowerCase();

function stripRepeatedEdges(texts) {
  if (texts.length < FURNITURE_MIN_PAGES) return texts.slice();
  const result = texts.map((text) => text.split('\n'));
  for (const side of ['first', 'last']) {
    const edge = result.map((lines) => {
      const nonEmpty = lines.map((l, i) => [l, i]).filter(([l]) => l !== null && l.trim().length > 0);
      if (nonEmpty.length < 2) return null;
      const [line, index] = side === 'first' ? nonEmpty[0] : nonEmpty[nonEmpty.length - 1];
      const text = line.trim();
      return text.length >= REPEAT_MIN_CHARS && text.length <= REPEAT_MAX_CHARS ? { index, key: normalizeLine(line) } : null;
    });
    const counts = new Map();
    for (const e of edge) if (e) counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
    const needed = Math.max(FURNITURE_MIN_PAGES, Math.ceil(texts.length * REPEAT_MIN_SHARE));
    edge.forEach((e, i) => { if (e && counts.get(e.key) >= needed) result[i][e.index] = null; });
  }
  return result.map((lines) => lines.filter((l) => l !== null).join('\n').replace(/^\n+|\n+$/g, ''));
}

/**
 * Removes page furniture: numbered running headers/footers and verbatim-repeated edge lines. A header block of several
 * lines (real books alternate odd/even layouts) peels off pass by pass until the page is stable. Conservative by
 * design (see the two rules above). Returns new texts, same order; a page that held only furniture becomes ''.
 */
export function stripRunningHeaders(texts) {
  let current = texts;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = stripRepeatedEdges(stripNumberedEdges(current));
    if (next.every((text, i) => text === current[i])) break;
    current = next;
  }
  return current;
}
// ---- glyph-index encoded labels ------------------------------------------------------------------------------------
// Some fonts (figure and table labels) map letters to code points shifted by a constant: pdf.js returns
// "$FWLYDWLRQ" for "Activation" and 0x03 for a space. A line is decoded only when the DOCUMENT confirms it: the
// decoded words must be words the rest of the document uses. Nothing is ever decoded on a guess.
const SHIFT_RANGE = 64;
const FUNCTION_WORDS = new Set(['of', 'in', 'to', 'by', 'is', 'as', 'at', 'or', 'an', 'on', 'it', 'be', 'we', 'no', 'if', 'so', 'and', 'the', 'for']);
const CONFIRMED_SHARE = 0.6;
const RAW_KNOWN_SHARE = 0.5;

function shiftText(line, k) {
  return [...line].map((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 1 && code <= 126 && code !== 32 && code + k <= 126 ? String.fromCharCode(code + k) : ch;
  }).join('');
}

function buildVocabulary(texts) {
  const counts = new Map();
  // Only words written the way words are (lowercase, or Capitalized): shifted lowercase letters come out as ALL-CAPS
  // runs ("HVLVWDQFH"), and a repeated garbage label must never vouch for itself.
  for (const text of texts) {
    for (const w of text.match(/\p{L}{3,}/gu) ?? []) {
      if (/^\p{Lu}?\p{Ll}+$/u.test(w)) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) ?? 0) + 1);
    }
  }
  return new Set(counts.keys());
}

// A token counts as known when it is a vocabulary word or is entirely made of vocabulary/function words ("Activationof")
function isKnownToken(token, vocabulary) {
  if (vocabulary.has(token) || FUNCTION_WORDS.has(token)) return true;
  const reach = new Array(token.length + 1).fill(false);
  reach[0] = true;
  for (let i = 0; i < token.length; i += 1) {
    if (!reach[i]) continue;
    for (let j = i + 2; j <= token.length; j += 1) {
      const piece = token.slice(i, j);
      if (vocabulary.has(piece) || FUNCTION_WORDS.has(piece)) reach[j] = true;
    }
  }
  return reach[token.length];
}

function knownShare(line, vocabulary) {
  const tokens = line.toLowerCase().match(/\p{L}{2,}/gu) ?? [];
  return tokens.length === 0 ? 0 : tokens.filter((t) => isKnownToken(t, vocabulary)).length / tokens.length;
}

const STRONG_LETTERS = 10;
const STRONG_SHARE = 0.8;
const MIN_CONFIRMING_LINES = 3;

function bestShift(line, vocabulary) {
  let best = { k: 0, share: 0 };
  for (let k = 1; k <= SHIFT_RANGE; k += 1) {
    const share = knownShare(shiftText(line, k), vocabulary);
    if (share > best.share) best = { k, share };
  }
  return best;
}

/**
 * The font's shift is a document-wide constant, so it must be CONFIRMED before it is applied: at least three long
 * lines that decode almost entirely into words the document uses. Only then are shorter labels ("Capsule") decoded,
 * and only with that shift. A lone line that merely happens to decode is left exactly as it is.
 */
export function decodeShiftedGlyphs(texts) {
  const vocabulary = buildVocabulary(texts);
  const isCandidate = (line) => line.trim().length >= 4 && knownShare(line, vocabulary) < RAW_KNOWN_SHARE;

  const tally = new Map();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!isCandidate(line)) continue;
      const { k, share } = bestShift(line, vocabulary);
      const letters = (shiftText(line, k).match(/\p{L}/gu) ?? []).length;
      if (share >= STRONG_SHARE && letters >= STRONG_LETTERS) tally.set(k, (tally.get(k) ?? 0) + 1);
    }
  }
  const confirmed = [...tally].filter(([, n]) => n >= MIN_CONFIRMING_LINES).map(([k]) => k);
  if (confirmed.length === 0) return texts.slice();

  return texts.map((text) => text.split('\n').map((line) => {
    if (!isCandidate(line)) return line;
    let best = { k: 0, share: 0 };
    for (const k of confirmed) {
      const share = knownShare(shiftText(line, k), vocabulary);
      if (share > best.share) best = { k, share };
    }
    return best.share >= CONFIRMED_SHARE ? shiftText(line, best.k) : line;
  }).join('\n'));
}
// ---- reflow ---------------------------------------------------------------------------------------------------
// A PDF line break in the middle of a sentence is typesetting, not structure. Structure keeps its break: the end of a
// finished paragraph (sentence-final punctuation), a heading (all capitals) and what follows it, a list item, a
// caption. Only the break characters are ever touched: no word, number or symbol changes.
const SENTENCE_END = /[.!?:]["')\]]*$/u;
const LIST_ITEM = /^(?:[•·▪◦‣⁃*]\s|[-–—]\s|\(?\d{1,3}[.)]\s|\(?\p{Ll}[.)]\s)/u;
const CAPTION = /^(?:Fig(?:ure)?\.?|Box|Table|Tab\.)\s*\d/iu;
const NEXT_CONTINUES = /^(?:\p{Ll}|\d+(?:[.,]\d+)?\s+\p{Ll})/u;
const FULL_WIDTH = 0.7;
// A line that ends in one of these cannot be the end of a sentence: the next line continues it, whatever its case.
const CONTINUES_AFTER = /(?:^|\s)(?:the|a|an|of|and|or|as|to|in|by|for|with|from|that|which|such|is|are|was|were|on|at|be|than|into|between|its|their)$/iu;

function isAllCaps(line) {
  const letters = line.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

// Is the break between two consecutive PDF lines only typesetting? `width` is the page's typical full line length.
function isSoftBreak(above, below, width) {
  const a = above.trimEnd();
  const b = below.trimStart();
  if (a.length === 0 || b.length === 0) return false; // a blank line is a real paragraph gap
  if (SENTENCE_END.test(a)) return false;             // the paragraph (or list introduction) ended here
  if (LIST_ITEM.test(b) || CAPTION.test(b)) return false;
  if (isAllCaps(a)) return isAllCaps(b);              // a heading wraps onto its own next line, and stays apart from the body
  if (NEXT_CONTINUES.test(b)) return true;            // lowercase (or "10 individuals"): the sentence goes on
  if (CONTINUES_AFTER.test(a) && !isAllCaps(b)) return true; // "... such as" / "... the": the sentence cannot end here
  // A capital that starts the next line (acronym, proper noun): only when the line above ran the full width
  return width !== null && a.length >= FULL_WIDTH * width && !isAllCaps(b);
}

export function reflowLines(text) {
  const lines = text.split('\n');
  const lengths = lines.map((l) => l.trim().length).filter((n) => n > 0).sort((x, y) => x - y);
  const width = lengths.length >= 8 ? lengths[Math.floor(0.9 * (lengths.length - 1))] : null;
  const out = [];
  lines.forEach((line, i) => {
    if (i > 0 && isSoftBreak(lines[i - 1], line, width)) out[out.length - 1] = `${out[out.length - 1].trimEnd()} ${line.trimStart()}`;
    else out.push(line);
  });
  return out.join('\n');
}

// ---- figure labels --------------------------------------------------------------------------------------------------
// The text inside a figure (its labels) arrives as many short lines in the middle of the prose, right before the
// caption. They are kept, word for word, but set apart from the prose as ONE line: a blank line before, the labels
// joined by " · ", the caption straight after. Only a run of at least five short lines that ends at a "Fig. N" caption
// qualifies, so headings, tables (a "Table N" title) and contents pages are never touched.
const FIGURE_CAPTION = /^Fig(?:ure)?\.?\s*\d/iu;
const LABEL_MAX_CHARS = 60;
const LABEL_MIN_RUN = 5;

function isLabelLine(line) {
  const text = line.trim();
  return text.length > 0 && text.length <= LABEL_MAX_CHARS && !SENTENCE_END.test(text) && !FIGURE_CAPTION.test(text);
}

export function groupFigureLabels(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    // a figure block is a run of label lines that is directly followed by a caption
    let end = i;
    while (end < lines.length && isLabelLine(lines[end])) end += 1;
    const isBlock = end - i >= LABEL_MIN_RUN && end < lines.length && FIGURE_CAPTION.test(lines[end].trim());
    if (isBlock) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(lines.slice(i, end).map((l) => l.trim()).join(' · '));
      i = end;
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  return out.join('\n');
}
