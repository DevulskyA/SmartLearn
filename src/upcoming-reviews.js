// T-F4-08: pure selection of the offline snapshot's UPCOMING reviews (dueDate strictly after today), grouped by date in ascending
// order and capped, so the read-only offline Hoje can show what comes next. Dates are "YYYY-MM-DD" strings (lexicographic order is
// chronological). No DOM, no storage, no clock: `today` is passed in.
export const UPCOMING_CAP = 20;

/**
 * @param {Array<{dueDate: string, unitTitle?: string}>} items snapshot items
 * @param {string} today local date "YYYY-MM-DD"
 * @param {number} cap maximum rows shown across all dates
 * @returns {{groups: Array<{date: string, items: object[]}>, shown: number, remaining: number, total: number}}
 */
export function groupUpcomingReviews(items, today, cap = UPCOMING_CAP) {
  const future = (items ?? [])
    .filter((item) => item.dueDate > today)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const shownItems = future.slice(0, cap);
  const groups = [];
  for (const item of shownItems) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.dueDate) last.items.push(item);
    else groups.push({ date: item.dueDate, items: [item] });
  }
  return { groups, shown: shownItems.length, remaining: future.length - shownItems.length, total: future.length };
}
