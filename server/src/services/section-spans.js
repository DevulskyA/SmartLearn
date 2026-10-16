// SOURCE SCOPE (found on the real Costanzo): a page is a coordinate of provenance, not the boundary of a section.
// "Measuring Renal Blood Flow" ends on page 267 and "Glomerular Filtration" starts on the same page, so a page-bounded unit
// either leaks the neighbour's text (the PAH sample problem ended up in the Glomerular Filtration draft) or drops its own
// (the section continues on page 273 until "Reabsorption and Secretion"). A unit is therefore a list of SPANS —
// {pageIndex, start, end} character ranges of the stored page text — owned by outline entries.
//
// Ownership: on each page the outline headings that start there are located in the page text; the text from a heading up
// to the next heading (in TEXT order) belongs to that heading, and text before the first heading belongs to the last
// outline entry of the earlier pages. Text order can disagree with outline order (columns interleaved by the PDF's content
// stream: the tail of the previous section is printed after the next section's heading); the outline is the authority on
// WHO owns text, the text positions only say WHERE the cut falls. Pure functions: no database, no PDF.

const squash = (s) => String(s).toLowerCase().replace(/\s+/g, '');

/**
 * Offset in `text` where a heading line with this title starts, or -1. A heading occupies its own line(s): an occurrence
 * that begins and ends on line boundaries wins over the same words inside a sentence.
 */
export function locateHeading(text, title) {
  const wanted = squash(title);
  if (wanted.length === 0) return -1;
  const map = [];
  let hay = '';
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) continue;
    map.push(i);
    hay += text[i].toLowerCase();
  }
  const lineStart = (o) => o === 0 || text[o - 1] === '\n';
  const lineEnd = (o) => o >= text.length || /^[ \t]*(\n|$)/.test(text.slice(o, o + 40));
  let fallback = -1;
  for (let at = hay.indexOf(wanted); at >= 0; at = hay.indexOf(wanted, at + 1)) {
    const startOffset = map[at];
    const endOffset = map[at + wanted.length - 1] + 1;
    if (lineStart(startOffset) && lineEnd(endOffset)) return startOffset;
    if (fallback < 0 && lineStart(startOffset)) fallback = startOffset;
  }
  return fallback;
}

/**
 * Every character of every page, assigned to the outline entry that owns it.
 * @param {{pageIndex:number, text:string}[]} pages ascending
 * @param {{title:string, pageIndex:number}[]} entries outline entries in document order (index = ownership id)
 * @returns {{pageIndex:number, start:number, end:number, owner:number|null}[]} in document order, never empty ranges
 */
export function ownerSpans(pages, entries) {
  const spans = [];
  for (const page of pages) {
    const text = page.text ?? '';
    const marks = [];
    entries.forEach((entry, i) => {
      if (entry.pageIndex !== page.pageIndex) return;
      const pos = locateHeading(text, entry.title);
      marks.push({ owner: i, pos: pos < 0 ? 0 : pos });
    });
    // text order; headings at the same offset keep outline order (the later one then owns the text, the earlier is empty)
    marks.sort((a, b) => a.pos - b.pos || a.owner - b.owner);

    let leading = null; // the last outline entry that starts on an earlier page
    for (let i = 0; i < entries.length; i += 1) if (entries[i].pageIndex < page.pageIndex) leading = i;

    const push = (start, end, owner) => { if (end > start) spans.push({ pageIndex: page.pageIndex, start, end, owner }); };
    if (marks.length === 0) { push(0, text.length, leading); continue; }
    push(0, marks[0].pos, leading);
    marks.forEach((mark, k) => push(mark.pos, k + 1 < marks.length ? marks[k + 1].pos : text.length, mark.owner));
  }
  return spans;
}

const sumChars = (spans) => spans.reduce((n, s) => n + (s.end - s.start), 0);
const pagesOf = (spans) => [...new Set(spans.map((s) => s.pageIndex))];

/** Full-page spans (a page-bounded range with no heading information). */
export function spansForPages(pages, pageStart, pageEnd) {
  return pages
    .filter((p) => p.pageIndex >= pageStart && p.pageIndex <= pageEnd && (p.text ?? '').length > 0)
    .map((p) => ({ pageIndex: p.pageIndex, start: 0, end: p.text.length }));
}

/** The text of a span list, in order, exactly as stored (no rewriting). */
export function textOfSpans(pageTextByIndex, spans) {
  return spans.map((s) => (pageTextByIndex.get(s.pageIndex) ?? '').slice(s.start, s.end)).join('\n\n');
}

function greedySpanGroups(spans, { maxPages, maxChars }) {
  const groups = [];
  let current = [];
  const close = () => { if (current.length > 0) groups.push(current); current = []; };
  for (const span of spans) {
    const next = [...current, span];
    if (current.length > 0 && (pagesOf(next).length > maxPages || sumChars(next) > maxChars)) close();
    current.push(span);
  }
  close();
  return groups;
}

const MAX_LISTED_TITLES = 3;
function joinTitles(a, b) {
  if (!a || !b) return a ?? b ?? null;
  if (a.endsWith(' · …')) return a;
  return a.split(' · ').length >= MAX_LISTED_TITLES ? `${a} · …` : `${a} · ${b}`;
}

/**
 * Units that follow the document's own structure, cut at the real heading positions.
 * @returns {{title:string|null, spans:object[], pageStart:number, pageEnd:number, chars:number}[]}
 */
export function planSectionUnits(pages, outline, bounds) {
  const entries = (outline ?? []).filter((e) => Number.isInteger(e.pageIndex) && e.pageIndex > 0 && typeof e.title === 'string' && e.title.trim().length > 0);
  const all = ownerSpans(pages, entries);

  const roots = [];
  const stack = [];
  entries.forEach((entry, i) => {
    const node = { ...entry, i, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  });
  const lastIn = (node) => (node.children.length > 0 ? lastIn(node.children[node.children.length - 1]) : node.i);
  const owned = (from, to) => all.filter((s) => s.owner !== null && s.owner >= from && s.owner <= to);
  const fits = (spans) => pagesOf(spans).length <= bounds.maxPages && sumChars(spans) <= bounds.maxChars;

  const units = [];
  const emit = (title, spans) => {
    if (spans.length === 0) return;
    if (fits(spans)) { units.push({ title, spans }); return; }
    const parts = greedySpanGroups(spans, bounds);
    parts.forEach((part, k) => units.push({ title: parts.length > 1 ? `${title} (${k + 1}/${parts.length})` : title, spans: part }));
  };
  const visit = (node) => {
    const whole = owned(node.i, lastIn(node));
    if (node.children.length === 0 || fits(whole)) { emit(node.title, whole); return; }
    emit(node.title, owned(node.i, node.i)); // what the section says before its first subsection
    node.children.forEach(visit);
  };
  roots.forEach(visit);

  // Text no heading owns (a cover, front matter, pages before the first heading) is never dropped: it is chunked by the safety bounds.
  const unowned = all.filter((s) => s.owner === null);
  let run = [];
  const flushRun = () => { for (const part of greedySpanGroups(run, bounds)) units.push({ title: null, spans: part }); run = []; };
  for (const span of unowned) {
    if (run.length > 0 && span.pageIndex > run[run.length - 1].pageIndex + 1) flushRun();
    run.push(span);
  }
  flushRun();

  const firstKey = (u) => [u.spans[0].pageIndex, u.spans[0].start];
  let ordered = units.sort((x, y) => firstKey(x)[0] - firstKey(y)[0] || firstKey(x)[1] - firstKey(y)[1]);

  if (bounds.minChars > 0) {
    const merged = [];
    for (const unit of ordered) {
      const last = merged[merged.length - 1];
      if (last && sumChars(last.spans) < bounds.minChars) {
        const spans = [...last.spans, ...unit.spans];
        if (fits(spans)) { merged[merged.length - 1] = { title: joinTitles(last.title, unit.title), spans }; continue; }
      }
      merged.push(unit);
    }
    ordered = merged;
  }

  return ordered.map((u) => {
    const pagesTouched = pagesOf(u.spans);
    return { title: u.title, spans: u.spans, pageStart: Math.min(...pagesTouched), pageEnd: Math.max(...pagesTouched), chars: sumChars(u.spans) };
  });
}

/**
 * Candidate sections for a topic: every outline entry whose title contains all the words typed (accent- and case-
 * insensitive), with the exact spans it owns (its own text plus its subsections).
 */
export function findTopicSections(pages, outline, query, { limit = 8 } = {}) {
  const words = squashWords(query);
  if (words.length === 0) return [];
  const entries = (outline ?? []).filter((e) => Number.isInteger(e.pageIndex) && e.pageIndex > 0 && typeof e.title === 'string' && e.title.trim().length > 0);
  const all = ownerSpans(pages, entries);
  const matches = [];
  entries.forEach((entry, i) => {
    const hay = squashWords(entry.title).join(' ');
    if (!words.every((w) => hay.includes(w))) return;
    let last = i;
    for (let j = i + 1; j < entries.length && entries[j].level > entry.level; j += 1) last = j;
    const spans = all.filter((s) => s.owner !== null && s.owner >= i && s.owner <= last);
    if (spans.length === 0) return;
    const exact = hay === words.join(' ');
    matches.push({ ordinal: entry.ordinal ?? i, index: i, level: entry.level, title: entry.title, spans, chars: sumChars(spans), pageStart: Math.min(...pagesOf(spans)), pageEnd: Math.max(...pagesOf(spans)), exact });
  });
  return matches.sort((a, b) => Number(b.exact) - Number(a.exact) || a.level - b.level || a.ordinal - b.ordinal).slice(0, limit);
}

function squashWords(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
}
