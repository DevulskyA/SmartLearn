import { REVIEW_DAY_OFFSETS, generateReviewDates } from "./review-schedule.js";

// LEGACY_TEMPORARY: fixed 16-review schedule. Boundary: scheduling logic stays here.
// A future adaptive scheduler (SM-2, FSRS) replaces this file; may require schema evolution.
export const ALGORITHMS = Object.freeze({ LEGACY: "legacy" });

// Canonical single source for the 16-interval schedule.
// db.js imports this to avoid dual-definition drift with review-schedule.js.
export { REVIEW_DAY_OFFSETS as SCHEDULE_OFFSETS };

// Returns [{reviewNumber: number, dueDate: string}] for the given study date.
// Legacy: 16 tasks with fixed intervals. Unknown algorithm throws explicitly.
export function generateInitialTasks(studyDate, algorithm = ALGORITHMS.LEGACY) {
  if (algorithm !== ALGORITHMS.LEGACY) {
    throw new Error(
      `Unknown scheduler algorithm: "${algorithm}". Supported: ${Object.values(ALGORITHMS).join(", ")}`,
    );
  }
  return generateReviewDates(studyDate).map((dueDate, i) => ({
    reviewNumber: i + 1,
    dueDate,
  }));
}

// The earliest still-pending review task for a given unit, by dueDate — the
// answer to "when does this unit next need review?", used by both Plano's
// list and Study Now's own question selection. A unit with no pending tasks
// (all reviewDone, or none scheduled) has no next review: null.
export function getNextReview(unitId, allTasks) {
  const pending = allTasks
    .filter((t) => t.unitId === unitId && !t.reviewDone)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return pending.length > 0 ? pending[0].dueDate : null;
}

// Whole calendar days between two YYYY-MM-DD dates (UTC midnight, matching
// generateReviewDates' own date arithmetic) — positive when toDate is after
// fromDate.
export function getDaysBetween(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
}

// Hoje's own overdue/due-today status label for one review row. groupName is
// the row's pre-computed bucket (doneToday/today/overdue — see renderToday
// in app.js); for an overdue row, the day count is derived from the task's
// own dueDate vs today. "Atrasada 1 dia" also covers the 0-or-negative-days
// case (a task whose dueDate is today or later but sorted into the overdue
// group by a caller bug would still read as "at least 1 day late" rather
// than a confusing "0 dias" or negative count) — deliberate floor, not a bug.
export function getReviewStatusLabel(groupName, task, today) {
  if (groupName === "doneToday") return "Concluída";
  if (groupName === "today") return "Vence hoje";
  const days = getDaysBetween(task.dueDate, today);
  return days <= 1 ? "Atrasada 1 dia" : `Atrasada ${days} dias`;
}
