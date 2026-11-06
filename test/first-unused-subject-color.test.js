import test from 'node:test';
import assert from 'node:assert/strict';
import { firstUnusedSubjectColor, SUBJECT_COLOR_KEYS, DEFAULT_SUBJECT_COLOR } from '../src/performance-thresholds.js';

test('a new discipline starts with the first colour no discipline uses', () => {
  assert.equal(firstUnusedSubjectColor([]), SUBJECT_COLOR_KEYS[0]);
  assert.equal(firstUnusedSubjectColor([SUBJECT_COLOR_KEYS[0]]), SUBJECT_COLOR_KEYS[1]);
  assert.equal(firstUnusedSubjectColor([SUBJECT_COLOR_KEYS[0], SUBJECT_COLOR_KEYS[2]]), SUBJECT_COLOR_KEYS[1]);
});

test('with every colour taken the default colour is used', () => {
  assert.equal(firstUnusedSubjectColor(SUBJECT_COLOR_KEYS), DEFAULT_SUBJECT_COLOR);
});

test('without existing disciplines the first listed colour is the default, which keeps the old behaviour for the first discipline', () => {
  assert.equal(firstUnusedSubjectColor(), SUBJECT_COLOR_KEYS[0]);
});
