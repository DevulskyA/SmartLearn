// SPRINT 05b (SEMANTIC UNITIZATION): a page is a coordinate of provenance, not the definition of a unit of study.
// When the PDF carries its own structure (outline / bookmarks: chapter > section > subsection, each with a page),
// units follow that structure. Page count and character size stay only as SAFETY bounds: a section that cannot be
// drafted in one piece is split, and pages the outline does not reach are still chunked, so no page is dropped.
// Pure functions: no database, no PDF.

/** Greedy sequential chunking by safety bounds only (the pre-outline behaviour, unchanged). */
export function greedyChunks(pages, { maxPages, maxChars }) {
  const chunks = [];
  let current = [];
  let chars = 0;
  const close = () => {
    if (current.length === 0) return;
    chunks.push({ pageStart: current[0].pageIndex, pageEnd: current[current.length - 1].pageIndex });
    current = [];
    chars = 0;
  };
  for (const page of pages) {
    if (current.length > 0 && (current.length >= maxPages || chars + page.chars > maxChars)) close();
    current.push(page);
    chars += page.chars;
  }
  close();
  return chunks;
}

/**
 * @param {{pageIndex:number, chars:number}[]} pages pages with usable text, ascending
 * @param {{level:number, title:string, pageIndex:number}[]} outline entries in document order (level 1 = top)
 * @param {{maxPages:number, maxChars:number}} bounds safety bounds
 * @returns {{pageStart:number, pageEnd:number, title:string|null}[]} units ordered by page; title null = no structural title
 */
export function planUnits(pages, outline, bounds) {
  const entries = (outline ?? []).filter((e) => Number.isInteger(e.pageIndex) && e.pageIndex > 0 && typeof e.title === 'string' && e.title.trim().length > 0);
  if (entries.length === 0) return greedyChunks(pages, bounds).map((c) => ({ ...c, title: null }));

  const lastPage = pages.length > 0 ? pages[pages.length - 1].pageIndex : 0;
  const roots = [];
  const stack = [];
  entries.forEach((entry, i) => {
    const node = { ...entry, i, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  });

  const lastDescendantIndex = (node) => (node.children.length > 0 ? lastDescendantIndex(node.children[node.children.length - 1]) : node.i);
  // A section ends on the page before the next heading starts (or on its own page when the next heading shares it).
  const endOf = (node) => {
    const next = entries[lastDescendantIndex(node) + 1];
    if (!next) return lastPage;
    return next.pageIndex > node.pageIndex ? next.pageIndex - 1 : node.pageIndex;
  };

  const pagesIn = (a, b) => pages.filter((p) => p.pageIndex >= a && p.pageIndex <= b);
  const fits = (ps) => ps.length <= bounds.maxPages && ps.reduce((sum, p) => sum + p.chars, 0) <= bounds.maxChars;

  const units = [];
  const emit = (title, a, b) => {
    const ps = pagesIn(a, b);
    if (ps.length === 0) return;
    if (fits(ps)) {
      units.push({ pageStart: ps[0].pageIndex, pageEnd: ps[ps.length - 1].pageIndex, title });
      return;
    }
    const parts = greedyChunks(ps, bounds);
    parts.forEach((c, k) => units.push({ ...c, title: `${title} (${k + 1}/${parts.length})` }));
  };
  const visit = (node) => {
    const a = node.pageIndex;
    const b = endOf(node);
    if (node.children.length === 0 || fits(pagesIn(a, b))) { emit(node.title, a, b); return; }
    const firstChild = node.children[0];
    if (firstChild.pageIndex > a) emit(node.title, a, firstChild.pageIndex - 1); // what the section says before its first subsection
    node.children.forEach(visit);
  };
  roots.forEach(visit);

  // Sections that share exactly the same pages (several headings on one page) become one unit with a joined title.
  const merged = [];
  for (const unit of units) {
    const same = merged.find((m) => m.pageStart === unit.pageStart && m.pageEnd === unit.pageEnd);
    if (same) same.title = joinTitles(same.title, unit.title);
    else merged.push({ ...unit });
  }

  // Pages the outline did not reach (front matter, gaps) are never dropped: chunk them by the safety bounds.
  const covered = new Set();
  for (const u of merged) for (const p of pages) if (p.pageIndex >= u.pageStart && p.pageIndex <= u.pageEnd) covered.add(p.pageIndex);
  const uncovered = pages.filter((p) => !covered.has(p.pageIndex));
  let run = [];
  const flushRun = () => {
    for (const c of greedyChunks(run, bounds)) merged.push({ ...c, title: null });
    run = [];
  };
  for (const p of uncovered) {
    if (run.length > 0 && p.pageIndex !== run[run.length - 1].pageIndex + 1) flushRun();
    run.push(p);
  }
  flushRun();

  const ordered = merged.sort((x, y) => x.pageStart - y.pageStart || x.pageEnd - y.pageEnd);
  return bounds.minChars > 0 ? mergeSmallUnits(ordered, pages, bounds) : ordered;
}

// At most three titles are listed; a merge of many tiny units reads "A · B · C · …" instead of a wall of titles.
const MAX_LISTED_TITLES = 3;
function joinTitles(a, b) {
  if (!a || !b) return a ?? b ?? null;
  if (a.endsWith(' · …')) return a;
  return a.split(' · ').length >= MAX_LISTED_TITLES ? `${a} · …` : `${a} · ${b}`;
}

/** Units smaller than minChars are merged with the next one while the safety bounds allow; titles are kept. */
function mergeSmallUnits(units, pages, { maxPages, maxChars, minChars }) {
  const within = (u) => pages.filter((p) => p.pageIndex >= u.pageStart && p.pageIndex <= u.pageEnd);
  const charsOf = (u) => within(u).reduce((sum, p) => sum + p.chars, 0);
  const out = [];
  for (const unit of units) {
    const last = out[out.length - 1];
    if (last && charsOf(last) < minChars) {
      const combined = { pageStart: last.pageStart, pageEnd: Math.max(last.pageEnd, unit.pageEnd), title: joinTitles(last.title, unit.title) };
      if (within(combined).length <= maxPages && charsOf(combined) <= maxChars) { out[out.length - 1] = combined; continue; }
    }
    out.push({ ...unit });
  }
  return out;
}

// ---- unit titles --------------------------------------------------------------------------------------------------
// A book's outline is often in capitals ("INNATE IMMUNE SYSTEM"); that title becomes the study unit's name everywhere.
// A capitals title is rewritten like a normal title, except acronyms the DOCUMENT itself writes in capitals (HLA, IgG).
const ROMAN = /^[IVX]{2,4}$/;

function isAllCapsLine(line) {
  const letters = line.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * Acronym-like tokens (two or more capitals: HLA, MHC, IgG) as the document writes them, keyed by their uppercase form.
 * Only ordinary lines count: a capital heading cannot vouch for its own words.
 */
export function acronymsIn(texts) {
  const found = new Map();
  const upper = new Map();
  const lower = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (isAllCapsLine(line)) continue;
      for (const token of line.match(/[\p{L}\p{N}]{2,8}/gu) ?? []) {
        if (token === token.toLowerCase()) bump(lower, token);
        else if ((token.match(/\p{Lu}/gu) ?? []).length >= 2 && !/^\p{Lu}\p{Ll}+$/u.test(token)) { found.set(token.toUpperCase(), token); bump(upper, token.toUpperCase()); }
      }
    }
  }
  // A token the document mostly writes in lowercase ("in", "and") is a word, not an acronym
  for (const key of [...found.keys()]) if ((upper.get(key) ?? 0) <= 2 * (lower.get(key.toLowerCase()) ?? 0)) found.delete(key);
  return found;
}

/** An all-capitals title in sentence case, keeping the document's own acronyms; any other title is returned untouched. */
export function readableTitle(title, acronyms) {
  if (typeof title !== 'string' || title.length === 0) return title;
  if (title.includes(' · ')) return title.split(' · ').map((part) => readableTitle(part, acronyms)).join(' · '); // a merged title, segment by segment
  const letters = title.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || letters !== letters.toUpperCase() || letters === letters.toLowerCase()) return title;
  let first = true;
  return title.replace(/[\p{L}\p{N}]+/gu, (token) => {
    if (!/\p{L}/u.test(token)) return token;
    const known = acronyms?.get?.(token);
    let word = known ?? (ROMAN.test(token) ? token : token.toLowerCase());
    if (first && !known && !ROMAN.test(token)) word = word.charAt(0).toUpperCase() + word.slice(1);
    first = false;
    return word;
  });
}
