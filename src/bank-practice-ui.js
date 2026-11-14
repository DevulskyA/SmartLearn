// BANK PRACTICE (client): extra questions for a lesson from the student's OWN accepted questions of other lessons.
// The server lists them (GET /v1/bank-practice); here they are turned into the exercise objects the study screen already runs. This is
// practice, not review: the study screen runs it in its own mode, which writes no aggregate evidence and touches no review schedule.

/**
 * The exercises behind the listed items, in the order the server ranked them. `getAll(unitId)` is the store's loader for one lesson's
 * exercises; a lesson that fails to load, or an item no longer there (archived since), is skipped instead of breaking the whole list.
 */
export async function resolveBankExercises(items, getAll) {
  const byUnit = new Map();
  for (const unitId of new Set(items.map((item) => item.unitId))) {
    try { byUnit.set(unitId, await getAll(unitId)); } catch { byUnit.set(unitId, []); }
  }
  const out = [];
  for (const item of items) {
    const exercise = (byUnit.get(item.unitId) ?? []).find((candidate) => candidate.id === item.exerciseId);
    if (exercise) out.push(exercise);
  }
  return out;
}

/** The practice the server offers for one lesson: `{ items }` with at least one item, or null (nothing offered, or it could not be asked). */
export async function fetchBankPractice(apiRequest, unitId) {
  try {
    const result = await apiRequest(`/v1/bank-practice?unitId=${encodeURIComponent(unitId)}`);
    return Array.isArray(result?.items) && result.items.length > 0 ? result : null;
  } catch {
    return null;
  }
}
