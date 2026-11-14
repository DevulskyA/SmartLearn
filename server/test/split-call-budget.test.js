import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCostUnits, ESTIMATION } from '../src/services/generation-budget.js';
import { codexCallPlan, planQuestionGroups, SPLIT_MIN_SOURCE_CHARS } from '../src/ai/codex-provider.js';

// The budget ledger must count what a split generation really sends: one summary call over the whole text PLUS one call per question group
// (each over its own pages), not "one call".

const page = (pageIndex, chars) => ({ pageIndex, text: 'x'.repeat(chars) });
const BIG = [page(1, SPLIT_MIN_SOURCE_CHARS), page(2, SPLIT_MIN_SOURCE_CHARS), page(3, SPLIT_MIN_SOURCE_CHARS)];
const SMALL = [page(1, 100), page(2, 100)];

test('codexCallPlan: a small source is one call over the text', () => {
  assert.deepEqual(codexCallPlan(SMALL, {}), { calls: 1, inputPasses: 1 });
});

test('codexCallPlan: split generation = summary call + one call per group; the text is sent twice in total (whole, then in parts)', () => {
  const groups = planQuestionGroups(BIG);
  assert.ok(groups && groups.length >= 2);
  assert.deepEqual(codexCallPlan(BIG, {}), { calls: 1 + groups.length, inputPasses: 2 });
});

test('codexCallPlan: summary first is ONE call; questions later is one call per group and the text is sent once', () => {
  assert.deepEqual(codexCallPlan(BIG, { deferQuestions: true }), { calls: 1, inputPasses: 1 });
  const groups = planQuestionGroups(BIG);
  assert.deepEqual(codexCallPlan(BIG, { questionsOnly: true }), { calls: groups.length, inputPasses: 1 });
  assert.deepEqual(codexCallPlan(SMALL, { questionsOnly: true }), { calls: 1, inputPasses: 1 });
});

test('estimateCostUnits: inputPasses defaults to calls (unchanged) and prices input and output separately when given', () => {
  const chars = 9000;
  const input = Math.ceil(chars / ESTIMATION.charsPerUnit);
  assert.equal(estimateCostUnits({ payloadChars: chars, calls: 3 }), 3 * (input + ESTIMATION.outputUnitsPerCall));
  assert.equal(estimateCostUnits({ payloadChars: chars, calls: 4, inputPasses: 2 }), 2 * input + 4 * ESTIMATION.outputUnitsPerCall);
});
