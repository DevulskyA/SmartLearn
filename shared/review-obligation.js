// EXPERIMENTAL (HG-09 / D-12 option 3, authorized only for the isolated worktree; NOT wired into the product, V1 stays on 16 fixed reviews).
// Pure read-model: from the review tasks a unit already has, which ONE is the unit's required review today, and what happens to the
// older overdue ones when it is done. It never writes, never marks anything completed and never invents a result: history is facts.
//
// Two decisions belong to the student and are NOT made here, so they are named parameters:
//   D-13  what counts as "recovered"       -> `recovery`: 'NONE' (the older overdue ones stay, the next becomes required)
//                                                       'SUPERSEDE_OVERDUE' (doing the required one retires the older overdue ones)
//   D-14  the anchor of the next interval  -> not modelled; dates are never changed by this module.
// A task row is { id, unitId, offsetDays, dueDate: 'YYYY-MM-DD', completedAt: string|null } (the review_tasks columns).

export const RECOVERY = Object.freeze({ NONE: 'NONE', SUPERSEDE_OVERDUE: 'SUPERSEDE_OVERDUE' });

const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id);

/**
 * One entry per unit: `required` is the single review the student owes today (the OLDEST pending one that is due), `collapsed` are the
 * other pending ones that are already due (shown under it, not asked one by one), `upcoming` is the next future one when nothing is due.
 */
export function deriveObligations(tasks, today) {
  const units = new Map();
  for (const task of tasks) {
    if (!units.has(task.unitId)) units.set(task.unitId, []);
    units.get(task.unitId).push(task);
  }
  return [...units.entries()].map(([unitId, all]) => {
    const pending = all.filter((t) => t.completedAt === null).sort(byDue);
    const due = pending.filter((t) => t.dueDate <= today);
    const future = pending.filter((t) => t.dueDate > today);
    return {
      unitId,
      required: due[0] ?? null,
      collapsed: due.slice(1),
      upcoming: due.length === 0 ? (future[0] ?? null) : null,
      pendingCount: pending.length,
    };
  }).sort((a, b) => a.unitId - b.unitId);
}

/**
 * What doing the unit's required review means for the rest, as an INSTRUCTION (nothing is written here):
 * { completedId, supersededIds }. `supersededIds` are NOT completed and never count as done; the caller keeps them as "not performed".
 */
export function completeRequired(tasks, unitId, today, { recovery = RECOVERY.NONE } = {}) {
  if (!Object.values(RECOVERY).includes(recovery)) throw new Error(`unknown recovery policy: ${recovery}`);
  const entry = deriveObligations(tasks.filter((t) => t.unitId === unitId), today)[0];
  if (!entry?.required) return { completedId: null, supersededIds: [] };
  const supersededIds = recovery === RECOVERY.SUPERSEDE_OVERDUE ? entry.collapsed.map((t) => t.id) : [];
  return { completedId: entry.required.id, supersededIds };
}
