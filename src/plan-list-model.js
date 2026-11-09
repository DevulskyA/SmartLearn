// Deterministic list transformations; never derives data from a visual placeholder.
export const PLAN_PAGE_SIZE = 25;

export function normalizePlanSearch(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function searchPlanUnits(units, query, subjectNameById = new Map()) {
  const terms = normalizePlanSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return units;
  return units.filter((unit) => {
    const subject = subjectNameById.get(unit.subjectId) ?? "";
    const haystack = normalizePlanSearch(`${subject} ${unit.title ?? ""} ${unit.sourceText ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });
}

export function paginatePlanUnits(units, requestedPage = 1, focusUnitId = null, pageSize = PLAN_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new RangeError("Invalid page size");
  const total = units.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const numericPage = Number(requestedPage);
  let page = Number.isFinite(numericPage) ? Math.max(1, Math.min(pageCount, Math.trunc(numericPage))) : 1;
  if (focusUnitId != null) {
    const focusedIndex = units.findIndex((unit) => String(unit.id) === String(focusUnitId));
    if (focusedIndex >= 0) page = Math.floor(focusedIndex / pageSize) + 1;
  }
  const fromIndex = (page - 1) * pageSize;
  return { items: units.slice(fromIndex, fromIndex + pageSize), total, page, pageCount,
    from: total > 0 ? fromIndex + 1 : 0,
    to: Math.min(total, fromIndex + pageSize) };
}
