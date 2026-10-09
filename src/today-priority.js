// "What do I do now?" on Hoje. Pure and DOM-free so the rule is testable.
//
// The scheduled protocol is preserved: overdue reviews come before today's, and
// inside a tier the server's own order (oldest first) is kept. What changes is
// that the primary action no longer lands on a review with NOTHING to retrieve
// while another one has exercises waiting (product intent: "seleção de próxima
// ação" is the system's job, and recall practice is what produces learning).
//
// Tiers (lower = first):
//   0  has items the student got wrong last time and has not answered yet here ("para reforçar")
//   1  has exercises not yet answered in this review
//   2  every exercise already answered (only "Revisão feita" / redo is left)
//   3  no exercises to practice at all
export function reviewTier({ exerciseIds = [], judgedIds = new Set(), priorWrongIds = new Set() }) {
  if (exerciseIds.length === 0) return 3;
  const unjudged = exerciseIds.filter((id) => !judgedIds.has(id));
  if (unjudged.length === 0) return 2;
  return unjudged.some((id) => priorWrongIds.has(id)) ? 0 : 1;
}

export function reinforceCount({ exerciseIds = [], judgedIds = new Set(), priorWrongIds = new Set() }) {
  return exerciseIds.filter((id) => !judgedIds.has(id) && priorWrongIds.has(id)).length;
}

/**
 * @param {Array} overdue        reviews, oldest first
 * @param {Array} today          reviews due today
 * @param {(task) => {exerciseIds:number[], judgedIds:Set<number>, priorWrongIds:Set<number>}} contextOf
 * @returns {{task, group:'overdue'|'today', tier:number, reinforce:number} | null}
 */
export function pickPrimaryReview(overdue, today, contextOf) {
  const group = overdue.length > 0 ? 'overdue' : 'today';
  const candidates = group === 'overdue' ? overdue : today;
  if (candidates.length === 0) return null;
  let best = null;
  candidates.forEach((task, index) => {
    const context = contextOf(task);
    const tier = reviewTier(context);
    if (!best || tier < best.tier) best = { task, group, tier, reinforce: reinforceCount(context), index };
  });
  return { task: best.task, group, tier: best.tier, reinforce: best.reinforce };
}
