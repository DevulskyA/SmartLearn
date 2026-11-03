// Hoje "Vencidas": show one card per UNIT instead of one per stage.
//
// A unit studied long ago has several stages (R1, R2, ...) overdue at once.
// They are legitimate, separate tasks (the 16-review schedule is untouched),
// but 34 identical-looking cards bury the day's real work. This module only
// decides how stages are grouped for display. It never changes, reschedules
// or drops a task: each stage keeps its own row and its own "Revisão feita".

// Above this many overdue stages the unit cards start collapsed.
export const OVERDUE_COLLAPSE_AFTER = 6;

export function shouldCollapseOverdue(totalStages) {
  return totalStages > OVERDUE_COLLAPSE_AFTER;
}

// `tasks` arrive oldest first (the server's order); groups keep the order of
// their oldest stage and stages keep their own order inside the group.
export function groupOverdueByUnit(tasks) {
  const byUnit = new Map();
  for (const task of tasks) {
    if (!byUnit.has(task.unitId)) byUnit.set(task.unitId, { unitId: task.unitId, tasks: [] });
    byUnit.get(task.unitId).tasks.push(task);
  }
  return [...byUnit.values()];
}

// [3,1,2,5] -> [[1,3],[5,5]]: consecutive review numbers collapse into a
// range, a gap (a stage already done) stays visible instead of being papered over.
export function stageRanges(reviewNumbers) {
  const sorted = [...reviewNumbers].sort((a, b) => a - b);
  const ranges = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else ranges.push([n, n]);
  }
  return ranges;
}

// Hoje with a long list (H-01): a long-absent student saw ~7000 px of cards. Each Hoje list shows its first N items and
// folds the rest behind a "Ver mais" button. Nothing is dropped or rescheduled: folded items stay in the DOM (`hidden`).
export const VISIBLE_LIMIT = { overdue: 5, today: 5, doneToday: 3 };

// Folding a single item saves nothing and costs a click, so it only happens from this many hidden items on.
const MIN_FOLDED = 2;

// `keep[i]` marks an item that must stay visible whatever its position (the "Começar agora" target, a card the student
// opened). Returns one boolean per item: true = folded.
export function foldedFlags(keep, limit) {
  const flags = keep.map((kept, i) => i >= limit && !kept);
  return flags.filter(Boolean).length >= MIN_FOLDED ? flags : flags.map(() => false);
}
