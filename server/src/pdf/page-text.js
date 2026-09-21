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
