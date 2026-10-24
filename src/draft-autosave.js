// Autosave of a lesson draft (the summary, and each question on its own). DOM-free: the screen supplies `save(key, ctx)` and gets told every state change.
//
// What it guarantees (test/draft-autosave.test.js):
//   - a save starts after `delayMs` WITHOUT further typing (each keystroke restarts the wait);
//   - never two requests in flight for the same entity: typing during a request schedules the NEXT save, it never races the current one, so an
//     older answer cannot arrive after a newer request started for the same text;
//   - what was typed while a request was in flight is still "unsaved" afterwards (the `save` callback decides what it sent; this module only
//     remembers that more changes arrived and saves again);
//   - a lost connection is retried with a growing wait (and at once when the browser says it is online again); a version conflict or a refusal is
//     NOT retried blindly: the text stays unsaved and the student sees why.
// It only schedules. What is saved, how the answer is applied and which text counts as "sent" are decided by the screen's `save`.

const DEFAULT_BACKOFF = [2500, 5000, 10000, 30000];

/**
 * save(key, ctx) -> Promise<{ ok: true, nothing?: boolean } | { ok: false, kind: "offline" | "conflict" | "blocked" | "error", message?: string }>
 * onState(key, state, info): state is "pending" | "saving" | "saved" | "offline" | "conflict" | "error" | "idle"
 */
export function createAutosaver({ save, onState = () => {}, delayMs = 2500, backoffMs = DEFAULT_BACKOFF, setTimer = setTimeout, clearTimer = clearTimeout, now = () => Date.now() }) {
  const entities = new Map();
  let disposed = false;

  const entity = (key) => {
    if (!entities.has(key)) entities.set(key, { token: 0, timer: null, flight: null, state: 'idle', failures: 0 });
    return entities.get(key);
  };
  const setState = (key, e, state, info = {}) => { e.state = state; onState(key, state, info); };
  const cancelTimer = (e) => { if (e.timer !== null) { clearTimer(e.timer); e.timer = null; } };
  const schedule = (key, e, ms) => {
    cancelTimer(e);
    e.timer = setTimer(() => { e.timer = null; run(key); }, ms);
  };

  function run(key, ctx = {}) {
    const e = entity(key);
    if (disposed) return Promise.resolve({ ok: true, nothing: true });
    if (e.flight) return e.flight; // one request at a time per entity: a second caller joins the one in flight
    cancelTimer(e);
    const sentToken = e.token;
    setState(key, e, 'saving');
    e.flight = (async () => {
      let result;
      try { result = await save(key, ctx); } catch (err) { result = { ok: false, kind: 'error', message: String(err?.message ?? err) }; }
      e.flight = null;
      if (disposed) return result;
      if (result.ok) {
        e.failures = 0;
        if (e.token !== sentToken) { setState(key, e, 'pending'); schedule(key, e, delayMs); } // more typing arrived while the request ran
        else if (result.nothing) setState(key, e, 'idle');
        else setState(key, e, 'saved', { at: now() });
      } else if (result.kind === 'offline') {
        e.failures += 1;
        const wait = backoffMs[Math.min(e.failures - 1, backoffMs.length - 1)];
        setState(key, e, 'offline', { message: result.message, failures: e.failures, retryInMs: wait, manual: ctx.manual === true });
        schedule(key, e, wait);
      } else if (result.kind === 'conflict') {
        setState(key, e, 'conflict', { message: result.message, manual: ctx.manual === true });
      } else {
        setState(key, e, 'error', { message: result.message, kind: result.kind, manual: ctx.manual === true });
      }
      return result;
    })();
    return e.flight;
  }

  return {
    /** The text of `key` changed: restart the wait. After a conflict nothing is saved by itself any more (only a deliberate save). */
    touch(key) {
      if (disposed) return;
      const e = entity(key);
      e.token += 1;
      if (e.state === 'conflict') return;
      setState(key, e, 'pending');
      if (!e.flight) schedule(key, e, delayMs);
    },
    /** A deliberate save (the button): now, joining a request already in flight. */
    saveNow(key, ctx = { manual: true }) { return run(key, ctx); },
    /** Saves everything that is waiting, now (leaving the screen, the window going to the background). */
    flush() {
      const waiting = [...entities].filter(([, e]) => e.timer !== null || e.flight || e.state === 'offline' || e.state === 'pending');
      return Promise.all(waiting.map(([key]) => run(key, { flush: true })));
    },
    /** The browser is online again: retry what was waiting for the connection, without waiting for the backoff. */
    retryOffline() {
      for (const [key, e] of entities) if (e.state === 'offline') run(key, { retry: true });
    },
    /** Resolves when no request is in flight for `key` (a pending timer is left alone). */
    settle(key) { return entity(key).flight ?? Promise.resolve(); },
    stateOf(key) { return entity(key).state; },
    /** The screen has dealt with this entity itself (saved it by another route): forget its waiting state. */
    clear(key) { const e = entity(key); cancelTimer(e); setState(key, e, 'idle'); },
    dispose() { disposed = true; for (const e of entities.values()) cancelTimer(e); },
  };
}
