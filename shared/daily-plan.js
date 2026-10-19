// EXPERIMENTAL (HG-14 prototype, authorized only for the isolated worktree; NOT wired into the product; no priority policy is approved).
// Pure and deterministic: given the minutes the student says they have today and the items that exist, which ones fit, in what order, and WHY.
// Nothing is hidden: every item comes back either planned or deferred with a stated reason. Missing information is never invented: an item
// without a minute estimate is `UNESTIMATED` (not guessed), an exam date is an optional input and only matters when it is given.
// The weights are NAMED parameters with documented experimental defaults, not a policy.
//
// item = { id, minutes: number|null, dueDate: 'YYYY-MM-DD'|null, required: boolean, examDate?: 'YYYY-MM-DD', paused?: boolean }

export const DEFAULT_WEIGHTS = Object.freeze({
  requiredFirst: 1000,   // an item the schedule says is owed today comes before anything optional
  overduePerDay: 2,      // each day late adds this much...
  overdueCap: 30,        // ...up to this many days (so an old pile cannot bury a recent item forever)
  examWindowDays: 14,    // an exam inside this window adds a boost that grows as it gets closer
  examBoost: 40,
});

const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/** The score and the reasons that built it, so the plan can be explained to the student. */
export function scoreItem(item, today, weights = DEFAULT_WEIGHTS) {
  const reasons = [];
  let score = 0;
  if (item.required) { score += weights.requiredFirst; reasons.push('REQUIRED_TODAY'); }
  if (item.dueDate) {
    const late = Math.min(Math.max(dayNumber(today) - dayNumber(item.dueDate), 0), weights.overdueCap);
    if (late > 0) { score += late * weights.overduePerDay; reasons.push(`OVERDUE_${late}D`); }
  }
  if (item.examDate) {
    const left = dayNumber(item.examDate) - dayNumber(today);
    if (left >= 0 && left <= weights.examWindowDays) {
      score += Math.round(weights.examBoost * (1 - left / (weights.examWindowDays + 1)));
      reasons.push(`EXAM_IN_${left}D`);
    }
  }
  return { score, reasons };
}

export function planDay({ items, availableMinutes, today, weights = DEFAULT_WEIGHTS }) {
  if (!Number.isFinite(availableMinutes) || availableMinutes < 0) throw new Error('availableMinutes must be a non-negative number');
  const ranked = items
    .map((item) => ({ item, ...scoreItem(item, today, weights) }))
    .sort((a, b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)));
  const planned = [];
  const deferred = [];
  let used = 0;
  for (const { item, score, reasons } of ranked) {
    // a unit the student paused is never planned, but never hidden either
    if (item.paused) { deferred.push({ id: item.id, reason: 'PAUSED', score, reasons }); continue; }
    if (item.minutes === null || item.minutes === undefined || !(item.minutes > 0)) { deferred.push({ id: item.id, reason: 'UNESTIMATED', score, reasons }); continue; }
    if (item.minutes > availableMinutes) { deferred.push({ id: item.id, reason: 'LONGER_THAN_THE_DAY', score, reasons }); continue; }
    if (used + item.minutes > availableMinutes) { deferred.push({ id: item.id, reason: 'NO_TIME_LEFT', score, reasons }); continue; }
    used += item.minutes;
    planned.push({ id: item.id, minutes: item.minutes, score, reasons });
  }
  return { planned, deferred, usedMinutes: used, availableMinutes, requiredDeferred: deferred.filter((d) => d.reasons.includes('REQUIRED_TODAY')).map((d) => d.id) };
}
