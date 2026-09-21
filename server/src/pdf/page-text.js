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
