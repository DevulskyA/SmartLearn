import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBankExercises, fetchBankPractice } from '../src/bank-practice-ui.js';

// BANK PRACTICE (client): turns the server's list into the exercises the study screen runs, and degrades to "nothing offered".

const items = [
  { exerciseId: 12, unitId: 2 },
  { exerciseId: 31, unitId: 3 },
  { exerciseId: 13, unitId: 2 },
];
const lessons = { 2: [{ id: 13, q: 'b' }, { id: 12, q: 'a' }], 3: [{ id: 31, q: 'c' }] };

test('resolveBankExercises keeps the server order, loads each lesson once and returns the full exercise objects', async () => {
  const calls = [];
  const out = await resolveBankExercises(items, async (unitId) => { calls.push(unitId); return lessons[unitId]; });
  assert.deepEqual(out.map((e) => e.id), [12, 31, 13]);
  assert.deepEqual(calls.sort(), [2, 3]);
});

test('resolveBankExercises skips an item that is gone and a lesson that fails to load', async () => {
  const out = await resolveBankExercises([...items, { exerciseId: 99, unitId: 2 }], async (unitId) => {
    if (unitId === 3) throw new Error('offline');
    return lessons[unitId];
  });
  assert.deepEqual(out.map((e) => e.id), [12, 13]);
});

test('fetchBankPractice returns the answer only when it holds at least one item; any failure means nothing is offered', async () => {
  const seen = [];
  const ok = await fetchBankPractice(async (url) => { seen.push(url); return { items: [{ exerciseId: 1, unitId: 2 }] }; }, 7);
  assert.equal(ok.items.length, 1);
  assert.equal(seen[0], '/v1/bank-practice?unitId=7');
  assert.equal(await fetchBankPractice(async () => ({ items: [] }), 7), null);
  assert.equal(await fetchBankPractice(async () => ({}), 7), null);
  assert.equal(await fetchBankPractice(async () => { throw new Error('401'); }, 7), null);
});
