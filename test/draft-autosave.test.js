import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaver } from '../src/draft-autosave.js';
import { createRecoveryStore } from '../src/draft-recovery.js';

// A clock the test drives by hand, so "2.5 seconds without typing" is exact and instant.
function fakeClock() {
  let time = 0;
  let next = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { at: time + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    async advance(ms) {
      const target = time + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        time = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        await Promise.resolve();
        await new Promise((r) => setImmediate(r)); // let the save callback and its continuation run
      }
      time = target;
    },
    pending: () => timers.size,
  };
}

function harness(results = []) {
  const clock = fakeClock();
  const calls = [];
  const states = [];
  const gates = [];
  const autosaver = createAutosaver({
    delayMs: 2500,
    backoffMs: [2500, 5000, 10000, 30000],
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    onState: (key, state, info) => states.push(`${key}:${state}`) && info,
    save: (key, ctx) => {
      calls.push({ key, at: clock.now(), ctx });
      const result = results.shift() ?? { ok: true };
      if (result.hold) return new Promise((resolve) => gates.push(() => resolve(result.then ?? { ok: true })));
      return Promise.resolve(result);
    },
  });
  return { clock, calls, states, gates, autosaver };
}
const settle = () => new Promise((r) => setImmediate(r));

test('a save starts only after 2.5 s WITHOUT typing: every keystroke restarts the wait', async () => {
  const { clock, calls, autosaver } = harness();
  autosaver.touch('summary');
  await clock.advance(2000);
  autosaver.touch('summary');
  await clock.advance(2000);
  autosaver.touch('summary');
  await clock.advance(2499);
  assert.equal(calls.length, 0);
  await clock.advance(1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].at, 6500, 'the last keystroke was at 4000, so the save is at 4000 + 2500');
  assert.equal(autosaver.stateOf('summary'), 'saved');
});

test('never two requests in flight for one entity: typing during a request schedules the NEXT save after it, with the full wait', async () => {
  const { clock, calls, gates, autosaver } = harness([{ hold: true }]);
  autosaver.touch('summary');
  await clock.advance(2500);
  assert.equal(calls.length, 1);
  assert.equal(autosaver.stateOf('summary'), 'saving');
  autosaver.touch('summary'); // typed while the first request is still on its way
  await clock.advance(10000);
  assert.equal(calls.length, 1, 'no second request while the first is in flight, however long it takes');
  gates[0]();
  await settle();
  assert.equal(autosaver.stateOf('summary'), 'pending', 'what was typed during the request is still unsaved');
  await clock.advance(2499);
  assert.equal(calls.length, 1);
  await clock.advance(1);
  assert.equal(calls.length, 2);
});

test('a deliberate save joins the request in flight instead of starting another, and entities do not wait for each other', async () => {
  const { clock, calls, gates, autosaver } = harness([{ hold: true }]);
  autosaver.touch('summary');
  autosaver.touch('q:q1');
  await clock.advance(2500);
  assert.deepEqual(calls.map((c) => c.key).sort(), ['q:q1', 'summary']);
  const first = autosaver.saveNow('summary');
  const second = autosaver.saveNow('summary');
  assert.equal(calls.filter((c) => c.key === 'summary').length, 1);
  gates[0]();
  await Promise.all([first, second]);
});

test('a lost connection is retried with a growing wait, a cap, and at once when the browser is online again', async () => {
  const offline = { ok: false, kind: 'offline', message: 'sem rede' };
  const { clock, calls, states, autosaver } = harness([offline, offline, offline, offline, offline, { ok: true }]);
  autosaver.touch('summary');
  await clock.advance(2500);            // 1st try at 2500
  await clock.advance(2500);            // retry after 2500
  await clock.advance(5000);            // then 5000
  await clock.advance(10000);           // then 10000
  await clock.advance(30000);           // then capped at 30000
  assert.deepEqual(calls.map((c) => c.at), [2500, 5000, 10000, 20000, 50000]);
  assert.equal(autosaver.stateOf('summary'), 'offline');
  autosaver.retryOffline(); // "online" event
  await settle();
  assert.equal(calls.length, 6);
  assert.equal(autosaver.stateOf('summary'), 'saved');
  assert.ok(states.includes('summary:offline'));
});

test('a conflict or a refusal is not retried blindly; typing again does not resume a conflicted entity, a deliberate save does', async () => {
  const { clock, calls, autosaver } = harness([{ ok: false, kind: 'conflict', message: 'alterado em outro lugar' }, { ok: false, kind: 'error', message: 'recusado' }, { ok: true }]);
  autosaver.touch('summary');
  await clock.advance(2500);
  assert.equal(autosaver.stateOf('summary'), 'conflict');
  await clock.advance(120000);
  assert.equal(calls.length, 1, 'no automatic retry after a conflict');
  autosaver.touch('summary');
  await clock.advance(10000);
  assert.equal(calls.length, 1, 'typing alone does not overwrite what another window saved');
  await autosaver.saveNow('summary'); // the deliberate save is answered by a refusal
  assert.equal(autosaver.stateOf('summary'), 'error');
  await clock.advance(120000);
  assert.equal(calls.length, 2, 'a refusal is not retried until the text changes');
  await autosaver.saveNow('summary');
  assert.equal(autosaver.stateOf('summary'), 'saved');
});

test('after a refusal the next change tries again (the student fixed the text)', async () => {
  const { clock, calls, autosaver } = harness([{ ok: false, kind: 'error', message: 'recusado' }, { ok: true }]);
  autosaver.touch('q:q2');
  await clock.advance(2500);
  assert.equal(autosaver.stateOf('q:q2'), 'error');
  autosaver.touch('q:q2');
  await clock.advance(2500);
  assert.equal(calls.length, 2);
  assert.equal(autosaver.stateOf('q:q2'), 'saved');
});

test('flush saves everything waiting at once (leaving the screen); dispose stops all timers', async () => {
  const { clock, calls, autosaver } = harness();
  autosaver.touch('summary');
  autosaver.touch('q:q1');
  await clock.advance(1000);
  await autosaver.flush();
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.ctx.flush === true && c.at === 1000));
  autosaver.touch('summary');
  autosaver.dispose();
  assert.equal(clock.pending(), 0);
  await clock.advance(10000);
  assert.equal(calls.length, 2);
});

test('a save that throws is reported as an error, not lost in the scheduler', async () => {
  const clock = fakeClock();
  const states = [];
  const autosaver = createAutosaver({ setTimer: clock.setTimer, clearTimer: clock.clearTimer, onState: (k, s, i) => states.push([s, i.message]), save: async () => { throw new Error('boom'); } });
  autosaver.touch('summary');
  await clock.advance(2500);
  assert.deepEqual(states.at(-1), ['error', 'boom']);
});

// ---- the local, recoverable copy -------------------------------------------------------------------------------------------------------------------
function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); }, data };
}

test('the recoverable copy is written at once, kept per draft, and erased only when told', () => {
  const storage = memoryStorage();
  const store = createRecoveryStore(storage, 7, { now: () => 1000 });
  store.writeSummary('texto novo', 3);
  store.writeQuestion('q2', { answer: 'resposta' }, 5);
  store.writeQuestion('q2', { answer: 'resposta maior', hint: 'dica' }, 5);
  assert.deepEqual(store.read(), { summary: { text: 'texto novo', baseVersion: 3, at: 1000 }, questions: { q2: { fields: { answer: 'resposta maior', hint: 'dica' }, baseVersion: 5, at: 1000 } } });
  assert.deepEqual(createRecoveryStore(storage, 8).read(), { summary: undefined, questions: {} }, 'another draft has its own copy');
  store.clearQuestion('q2');
  assert.deepEqual(store.read().questions, {});
  store.clearSummary();
  assert.equal(storage.data.size, 0, 'an empty record leaves nothing behind');
});

test('a missing, full, blocked or corrupt storage never throws: the screen is told the copy is unavailable', () => {
  assert.equal(createRecoveryStore(null, 1).available, false);
  assert.deepEqual(createRecoveryStore(null, 1).read(), { summary: undefined, questions: {} });
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const store = createRecoveryStore(full, 1);
  assert.equal(store.writeSummary('x', 1), false);
  assert.equal(store.available, false);
  const corrupt = memoryStorage();
  corrupt.setItem('smartlearn.draft-recovery.v1.1', '{not json');
  assert.deepEqual(createRecoveryStore(corrupt, 1).read(), { summary: undefined, questions: {} });
  corrupt.setItem('smartlearn.draft-recovery.v1.2', JSON.stringify({ v: 99, summary: { text: 'de outro formato' } }));
  assert.deepEqual(createRecoveryStore(corrupt, 2).read(), { summary: undefined, questions: {} });
});

// ---- what the student reads --------------------------------------------------------------------------------------------------------------------------
test('the save indicator says one calm thing per state, in Portuguese, and settles on the time of the save', async () => {
  const { describeSaveState, clockTime } = await import('../src/save-indicator.js');
  const at = new Date(2026, 9, 24, 9, 5, 30).getTime();
  assert.equal(clockTime(at), '09:05');
  const label = (state, extra) => describeSaveState(state, extra)?.label;
  assert.equal(label('pending'), 'Salva sozinho em instantes');
  assert.equal(label('saving'), 'Salvando…');
  assert.equal(label('saved', { at, justSaved: true }), 'Salvo agora');
  assert.equal(label('saved', { at, justSaved: false }), 'Salvo às 09:05');
  assert.equal(label('offline'), 'Sem conexão · cópia neste computador');
  assert.equal(label('conflict'), 'Não salvo · alterado em outro lugar');
  assert.equal(label('error'), 'Não salvo · veja o aviso');
  assert.equal(describeSaveState('idle'), null, 'nothing to say while nothing happens');
  // tone: only the three problem states are warm; waiting and saving stay quiet
  assert.deepEqual(['pending', 'saving', 'saved', 'offline', 'conflict', 'error'].map((s) => describeSaveState(s, { at }).tone), ['quiet', 'busy', 'ok', 'warn', 'bad', 'bad']);
});
