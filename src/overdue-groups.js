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
