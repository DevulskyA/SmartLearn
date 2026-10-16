import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weakPracticeReason } from '../src/priorities-text.js';

const item = (over) => ({
  reasonCodes: ['LOW_RECENT_ACCURACY'],
  reinforceCount: 0,
  evidence: { questions: 20, correct: 6, accuracyPct: 30, windowDays: 30 },
  ...over,
});

test('low accuracy is explained with the observed rate, the sample size and the window', () => {
  assert.equal(weakPracticeReason(item({})), 'Acerto de 30% em 20 questões nos últimos 30 dias');
});

test('items to reinforce are counted, singular and plural', () => {
  assert.equal(weakPracticeReason(item({ reasonCodes: ['ITEMS_TO_REINFORCE'], reinforceCount: 1 })), '1 exercício para reforçar');
  assert.equal(weakPracticeReason(item({ reasonCodes: ['ITEMS_TO_REINFORCE'], reinforceCount: 3 })), '3 exercícios para reforçar');
});

test('both reasons are joined, accuracy first', () => {
  assert.equal(
    weakPracticeReason(item({ reasonCodes: ['LOW_RECENT_ACCURACY', 'ITEMS_TO_REINFORCE'], reinforceCount: 2 })),
    'Acerto de 30% em 20 questões nos últimos 30 dias · 2 exercícios para reforçar',
  );
});

test('a single recent question reads as singular, and fractional accuracy is rounded for display only', () => {
  assert.equal(
    weakPracticeReason(item({ evidence: { questions: 1, correct: 0, accuracyPct: 0, windowDays: 30 } })),
    'Acerto de 0% em 1 questão nos últimos 30 dias',
  );
  assert.equal(
    weakPracticeReason(item({ evidence: { questions: 30, correct: 7, accuracyPct: 23.3, windowDays: 30 } })),
    'Acerto de 23% em 30 questões nos últimos 30 dias',
  );
});

test('an unknown reason code is ignored instead of leaking the raw code to the student', () => {
  assert.equal(weakPracticeReason(item({ reasonCodes: ['SOMETHING_NEW'] })), '');
});
