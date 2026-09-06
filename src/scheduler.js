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
