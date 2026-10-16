// SPRINT 05i (HEADINGS WITHOUT AN OUTLINE). Many PDFs (whole textbooks, lecture decks) carry no bookmarks, but their
// text still has structure: headings are set larger than the body. This reads that structure from the font height of
// each line, deterministically, and produces the same { level, title, pageIndex } entries a real PDF outline does, so
// units can follow the material's own headings. Conservative by design: too little structure means NO structure
// (page-bound chunking stays as the safety net), never a guess.
const MIN_RATIO = 1.08;          // larger than the body text by at least 8%
const MAX_TITLE_CHARS = 90;
const MIN_LETTERS = 4;           // "Tto" style markers and single glyphs are not headings
const MIN_HEADINGS = 3;
const MAX_LARGE_LINE_SHARE = 0.25; // if a quarter of all lines are "larger", size says nothing (slides, big-print text)
const MAX_LEVELS = 5;
const SENTENCE_END = /[.!?:;]["')\]]*$/u;

const roundHalf = (h) => Math.round(h * 2) / 2;

// A line continues the previous heading line (rather than being a new heading) when the previous one cannot be complete
// (it ends in a connector or a comma), the next one starts in lowercase, or both are written in capitals.
const CONNECTOR_END = /(?:^|\s)(?:de|del|la|las|el|los|y|e|o|en|con|por|para|a|of|the|and|in|on|for|to)$|,$/iu;
const isCaps = (s) => {
  const letters = s.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
};
const continuesHeading = (previous, next) => CONNECTOR_END.test(previous) || /^\p{Ll}/u.test(next) || (isCaps(previous) && isCaps(next));

// Words a book prints as stand-alone one-word lines all over its pages (an icon-font glyph such as "Tto") are markers,
// not part of any title.
const MARKER_MIN_LINES = 5;
function markerWords(lines) {
  const counts = new Map();
  for (const l of lines) {
    const text = l.text.trim();
    if (/^\p{L}{2,4}$/u.test(text)) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= MARKER_MIN_LINES).map(([word]) => word));
}

// A marker glyph set in a symbol font before a title ("j DISPEPSIA FUNCIONAL") is not part of the title
const cleanTitle = (text) => text.trim().replace(/\s+/g, ' ').replace(/^\p{Ll}\s+(?=\p{Lu})/u, '');

/** The body height is the one that carries the most characters. */
function bodyHeight(lines) {
  const weight = new Map();
  for (const l of lines) weight.set(roundHalf(l.height), (weight.get(roundHalf(l.height)) ?? 0) + l.text.length);
  return [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/**
 * @param {{pageIndex:number, lines:{text:string, height:number}[]}[]} pages
 * @returns {{level:number, title:string, pageIndex:number}[]} in document order; [] when there is not enough structure
 */
export function detectHeadings(pages) {
  const all = pages.flatMap((p) => p.lines.filter((l) => l.text.trim().length > 0 && l.height > 0));
  if (all.length === 0) return [];
  const body = bodyHeight(all);
  if (body <= 0) return [];
  const markers = markerWords(all);
  const withoutMarkers = (title) => title.split(' ').filter((word) => !markers.has(word)).join(' ');

  const isLarger = (l) => l.height >= body * MIN_RATIO;
  if (all.filter(isLarger).length / all.length > MAX_LARGE_LINE_SHARE) return [];

  const isHeadingLine = (l) => {
    if (!isLarger(l)) return false;
    const title = withoutMarkers(cleanTitle(l.text));
    return title.length <= MAX_TITLE_CHARS && (title.match(/\p{L}/gu) ?? []).length >= MIN_LETTERS && !SENTENCE_END.test(title);
  };

  // consecutive heading lines of the same size on one page are one heading that wraps
  const raw = [];
  for (const page of pages) {
    let open = null;
    for (const line of page.lines) {
      if (line.text.trim().length === 0) continue;
      if (isHeadingLine(line)) {
        const size = roundHalf(line.height);
        const title = withoutMarkers(cleanTitle(line.text));
        if (open && open.size === size && continuesHeading(open.title, title)) open.title = `${open.title} ${title}`;
        else { open = { size, title, pageIndex: page.pageIndex }; raw.push(open); }
      } else {
        open = null;
      }
    }
  }
  if (raw.length < MIN_HEADINGS) return [];

  const sizes = [...new Set(raw.map((h) => h.size))].sort((a, b) => b - a);
  return raw.map((h) => ({ level: Math.min(MAX_LEVELS, sizes.indexOf(h.size) + 1), title: h.title, pageIndex: h.pageIndex }));
}

const squash = (s) => s.toLowerCase().replace(/\s+/g, '');

/** Keeps only headings whose text is still in the final page text (page furniture and undecoded garbage drop out). */
export function keepPresentHeadings(entries, finalTextOf) {
  return entries.filter((e) => squash(finalTextOf(e.pageIndex) ?? '').includes(squash(e.title)));
}
