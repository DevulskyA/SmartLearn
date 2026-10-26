// A shortcut to a lesson ("Estudar conteúdo", "Abrir Resumo") must never open nothing and never open another lesson: it only goes where
// the lesson is still there. Pure on purpose, so the cases (no id, an id that is gone, a number written as text) are tested on their own.

/** The lesson of `units` that `unitId` points at, or null when it is not there. */
export function findLesson(units, unitId) {
  if (unitId === null || unitId === undefined || unitId === "") return null;
  const id = Number(unitId);
  if (!Number.isInteger(id)) return null;
  return (units ?? []).find((unit) => unit.id === id) ?? null;
}
