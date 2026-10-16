// Reads the PDF's own outline (bookmarks) as a flat, document-ordered list of { level, title, pageIndex }.
// Best effort by design: an outline that is missing, malformed or points nowhere yields fewer entries (or none) and
// never fails an extraction - units then fall back to the safety-bound chunking.
const MAX_ENTRIES = 5000;
const MAX_TITLE_LENGTH = 200;

export async function readOutline(doc) {
  let tree;
  try {
    tree = await doc.getOutline();
  } catch {
    return [];
  }
  if (!Array.isArray(tree)) return [];

  const pageOf = async (dest) => {
    try {
      const resolved = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(resolved) || resolved[0] == null) return null;
      const index = typeof resolved[0] === 'object' ? await doc.getPageIndex(resolved[0]) : resolved[0];
      return Number.isInteger(index) ? index + 1 : null;
    } catch {
      return null;
    }
  };

  const entries = [];
  const walk = async (items, level) => {
    for (const item of items) {
      if (entries.length >= MAX_ENTRIES) return;
      const title = String(item.title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
      const pageIndex = await pageOf(item.dest);
      if (title && pageIndex && pageIndex <= doc.numPages) entries.push({ level, title, pageIndex });
      if (Array.isArray(item.items) && item.items.length > 0) await walk(item.items, level + 1);
    }
  };
  await walk(tree, 1);
  return entries;
}
