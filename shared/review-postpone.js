// "Adiar vencidas" (HG-09, decided by the owner): the student who fell behind moves the OVERDUE reviews to future days, a few per day.
// Pure and shared by the server and the local store, so both promise the same plan. It only decides WHICH date each overdue review gets:
// it never completes a review, never creates evidence and never touches a review that is not overdue. Dates are local calendar days (YYYY-MM-DD).

export const POSTPONE_DEFAULT_PER_DAY = 5;
export const POSTPONE_MAX_PER_DAY = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day, count) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

/** A whole number from 1 to POSTPONE_MAX_PER_DAY (also from a numeric string), else null. */
export function normalizePerDay(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= 1 && n <= POSTPONE_MAX_PER_DAY ? n : null;
}

const doneOf = (task) => Boolean(task.completedAt) || task.reviewDone === true;
const stageOf = (task) => task.reviewNumber ?? task.offsetDays ?? 0;

/**
 * @param tasks  review tasks ({ id, unitId, dueDate, completedAt|reviewDone, reviewNumber|offsetDays }); anything not overdue is ignored
 * @param today  the student's local day
 * @param perDay at most this many reviews land on the same new day; the first new day is TOMORROW
 * @returns { moves: [{ id, unitId, from, to }], days: [{ date, count }] }  oldest overdue first, so a unit's stages keep their order
 */
export function planPostpone(tasks, today, perDay = POSTPONE_DEFAULT_PER_DAY) {
  if (!DAY.test(today ?? '')) throw new RangeError('today must be YYYY-MM-DD');
  if (normalizePerDay(perDay) === null) throw new RangeError(`perDay must be an integer from 1 to ${POSTPONE_MAX_PER_DAY}`);
  const overdue = tasks
    .filter((task) => !doneOf(task) && task.dueDate < today)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : stageOf(a) - stageOf(b) || a.id - b.id));
  const moves = overdue.map((task, index) => ({ id: task.id, unitId: task.unitId, from: task.dueDate, to: addDays(today, Math.floor(index / perDay) + 1) }));
  const days = [];
  for (const move of moves) {
    const last = days[days.length - 1];
    if (last && last.date === move.to) last.count += 1;
    else days.push({ date: move.to, count: 1 });
  }
  return { moves, days };
}
