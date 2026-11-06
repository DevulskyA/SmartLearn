// GENERATION POLICY (R-12). Pure decisions about WHEN content may be generated ahead of need. Nothing here calls a
// provider, reads a database or spends anything: it only answers "which units, if any, may be prepared next".
//
// Principle: generation is JIT. Prefetch is an optional courtesy subordinate to the unit the student is on: a small window
// of the units that follow it, only with comfortable budget, never while other work is in flight, never a queue.

/** Hard ceiling on the window, whatever a caller or a configuration asks for: prefetch can never become "generate the book". */
export const MAX_PREFETCH_DEPTH = 3;

/**
 * depth          how many of the units right after the current one are in the window. 0 = pure JIT (the default until the
 *                human decides the policy, HG-12).
 * comfortFactor  the remaining budget must be at least this many times the estimate of a unit to prefetch it.
 */
export const DEFAULT_PREFETCH_POLICY = Object.freeze({ depth: 0, comfortFactor: 3 });

/**
 * @param orderedIds     unit ids in reading order
 * @param currentId      the unit the student is on
 * @param states         Map id -> 'NOT_GENERATED' | 'DRAFT' | 'ACCEPTED' | 'STALE' | 'GENERATING'
 * @param remainingUnits budget left in the cost unit (null = unlimited)
 * @param estimateOf     id -> estimated cost of generating that unit
 * @param inFlight       generation jobs already running (prefetch yields to them)
 * @returns ids to prepare, in order; [] when nothing should be spent
 */
export function planPrefetch({ orderedIds, currentId, states, remainingUnits = null, estimateOf, policy = DEFAULT_PREFETCH_POLICY, inFlight = 0 }) {
  const depth = Math.min(Math.max(Math.floor(Number(policy?.depth) || 0), 0), MAX_PREFETCH_DEPTH);
  if (depth === 0 || inFlight > 0 || !Array.isArray(orderedIds)) return [];
  const at = orderedIds.indexOf(currentId);
  if (at < 0) return [];
  const comfortFactor = Number.isFinite(policy?.comfortFactor) ? policy.comfortFactor : DEFAULT_PREFETCH_POLICY.comfortFactor;
  const window = orderedIds.slice(at + 1, at + 1 + depth);
  const plan = [];
  let remaining = remainingUnits;
  for (const id of window) {
    if (states.get(id) !== 'NOT_GENERATED') continue; // already generated/accepted/stale: the window does not slide past it
    const cost = estimateOf(id);
    if (remaining !== null && !(remaining >= cost * comfortFactor)) break; // not comfortable: stop, never partially spend
    plan.push(id);
    if (remaining !== null) remaining -= cost;
  }
  return plan;
}
