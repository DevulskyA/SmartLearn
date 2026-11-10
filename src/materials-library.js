// Pure view model of the "Documentos já enviados" list: search, order and pages. No DOM, no network, no state.
// The count is always computed over the FULL list the server returned, before paging, so "3 de 39" is true.

export const LIBRARY_PAGE_SIZE = 12;
/** Below this many documents the search and order controls would only add noise; they appear from here on. */
export const LIBRARY_TOOLS_FROM = 7;

export const LIBRARY_SORTS = Object.freeze(["original", "name-asc", "name-desc", "pages-desc"]);

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const fold = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();

/**
 * @param {Array<{ id: number, originalName: string, pageCount?: number|null }>} sources  server order is the "original" order
 * @param {{ query?: string, sort?: string, page?: number, pageSize?: number }} view
 * @returns {{ items: Array, total: number, matched: number, page: number, pageCount: number, from: number, to: number }}
 */
export function libraryView(sources, { query = "", sort = "original", page = 1, pageSize = LIBRARY_PAGE_SIZE } = {}) {
  const needle = fold(query);
  const matches = sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => needle === "" || fold(source.originalName).includes(needle));

  const byName = (a, b) => collator.compare(a.source.originalName, b.source.originalName) || a.index - b.index;
  // Documents with no page count go last for "more pages", then keep the server order.
  const pagesOf = ({ source }) => (Number.isFinite(source.pageCount) ? source.pageCount : -1);
  const order = {
    "name-asc": byName,
    "name-desc": (a, b) => collator.compare(b.source.originalName, a.source.originalName) || a.index - b.index,
    "pages-desc": (a, b) => pagesOf(b) - pagesOf(a) || a.index - b.index,
  }[sort];
  if (order) matches.sort(order);

  const matched = matches.length;
  const pageCount = Math.max(1, Math.ceil(matched / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const items = matches.slice(start, start + pageSize).map(({ source }) => source);
  return { items, total: sources.length, matched, page: current, pageCount, from: matched === 0 ? 0 : start + 1, to: start + items.length };
}
