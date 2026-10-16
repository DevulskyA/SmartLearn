// Manual clock for tests of timers (hard limit, grace, liveness sampling): nothing fires until `advance`.
const flush = () => new Promise((r) => setImmediate(r));

/** Manual clock for the hard limit and the cancel grace; `advance` fires due timers in order. */
export function fakeClock(startIso = '2026-10-05T10:00:00.000Z') {
  let t = Date.parse(startIso);
  let seq = 0;
  const timers = new Map();
  return {
    now: () => new Date(t),
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++seq; timers.set(id, { at: t + ms, fn, every: ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    async advance(ms) {
      const target = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        t = Math.max(t, due[1].at);
        if (due[1].every) timers.set(due[0], { ...due[1], at: due[1].at + due[1].every });
        else timers.delete(due[0]);
        due[1].fn();
        await flush();
      }
      t = target;
      await flush();
    },
  };
}

