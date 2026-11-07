// Duration baseline of the Desktop study journey (rule: every test has a measured runtime, and any relevant deviation is a problem to
// investigate before trusting the result). Pure functions, so they are tested without opening the app (test/journey-baseline.test.js).

/** Per-step and total durations of a finished run: { total, steps: { "1": ms, ... } }. */
export function measure(steps) {
  const byStep = {};
  let total = 0;
  for (const s of steps) {
    if (typeof s.durationMs !== 'number') continue;
    byStep[String(s.step)] = s.durationMs;
    total += s.durationMs;
  }
  return { total, steps: byStep };
}

/**
 * Compares a run against the recorded baseline. A step deviates when it is more than `tolerance` away from its baseline AND the gap is at
 * least `floorMs` (a 300 ms step doubling to 600 ms is noise). A step missing from the baseline, or from the run, is also reported.
 * Returns { status: 'NO_BASELINE' | 'OK' | 'DEVIATION', deviations: [] }.
 */
export function compare(baseline, run, { tolerance = 0.5, floorMs = 2000 } = {}) {
  if (!baseline || !baseline.steps) return { status: 'NO_BASELINE', deviations: [] };
  const deviations = [];
  const keys = new Set([...Object.keys(baseline.steps), ...Object.keys(run.steps)]);
  for (const key of [...keys].sort((a, b) => Number(a) - Number(b))) {
    const base = baseline.steps[key];
    const now = run.steps[key];
    if (base === undefined) { deviations.push({ step: key, kind: 'not in baseline', now }); continue; }
    if (now === undefined) { deviations.push({ step: key, kind: 'not run', base }); continue; }
    const gap = now - base;
    if (Math.abs(gap) >= floorMs && Math.abs(gap) / base > tolerance) deviations.push({ step: key, kind: gap > 0 ? 'slower' : 'faster', base, now });
  }
  const totalGap = run.total - baseline.total;
  if (Math.abs(totalGap) >= floorMs * 2 && Math.abs(totalGap) / baseline.total > tolerance) deviations.push({ step: 'total', kind: totalGap > 0 ? 'slower' : 'faster', base: baseline.total, now: run.total });
  return { status: deviations.length ? 'DEVIATION' : 'OK', deviations };
}

export function describe(deviations) {
  return deviations.map((d) => `step ${d.step}: ${d.kind}${d.base !== undefined ? ` baseline ${d.base} ms` : ''}${d.now !== undefined ? `, now ${d.now} ms` : ''}`).join('; ');
}
