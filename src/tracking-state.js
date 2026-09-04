// Tracking Option C — canonical state machine.
// ATRASADO > SEM_EVIDENCIA > EM_REVISAO > EM_ESTUDO > EM_DIA. No arbitrary day-count rule.
// Exported so tests import this exact function, not a local copy.
export function getTrackingState(unitId, allTasks, allEvidence, today) {
  const tasks = allTasks.filter((t) => t.unitId === unitId);
  const evidence = allEvidence.filter((e) => e.unitId === unitId);

  // 1. ATRASADO wins over everything, including SEM_EVIDENCIA.
  if (tasks.some((t) => !t.reviewDone && t.dueDate < today)) return "ATRASADO";

  // 2. No evidence at all → student has not yet demonstrated any knowledge.
  if (evidence.length === 0) return "SEM_EVIDENCIA";

  // 3. Task due exactly today: action required now.
  if (tasks.some((t) => !t.reviewDone && t.dueDate === today)) return "EM_REVISAO";

  // Beyond: has evidence, no overdue, no task due today.
  const hasReviewEvidence = evidence.some((e) => e.context === "REVIEW");
  const hasFuturePending = tasks.some((t) => !t.reviewDone && t.dueDate > today);

  // 4. Has evidence but no review evidence yet and has an upcoming task.
  if (!hasReviewEvidence && hasFuturePending) return "EM_ESTUDO";

  // 5. Has evidence, no overdue/today, has review evidence or no pending tasks.
  return "EM_DIA";
}
