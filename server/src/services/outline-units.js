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
    if (same) same.title = `${same.title} · ${unit.title}`;
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

  return merged.sort((x, y) => x.pageStart - y.pageStart || x.pageEnd - y.pageEnd);
}
