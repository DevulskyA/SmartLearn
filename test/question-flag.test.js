import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_FLAG_REASONS, QUESTION_FLAG_COMMENT_MAX, normalizeQuestionFlag, currentQuestionFlags } from '../shared/question-flag.js';

// "Questão com problema": the pure rules shared by the server and the local store.

test('the reasons are the short list the student chooses from, and a comment is trimmed (empty = none)', () => {
  assert.deepEqual([...QUESTION_FLAG_REASONS], ['CONFUSING_STATEMENT', 'DOUBTFUL_ANSWER_KEY', 'CONTENT_ERROR', 'OTHER']);
  assert.deepEqual(normalizeQuestionFlag({ reason: 'OTHER' }), { reason: 'OTHER', comment: null });
  assert.deepEqual(normalizeQuestionFlag({ reason: 'OTHER', comment: '   ' }), { reason: 'OTHER', comment: null });
  assert.deepEqual(normalizeQuestionFlag({ reason: 'CONTENT_ERROR', comment: ' o gabarito diz 5 ' }), { reason: 'CONTENT_ERROR', comment: 'o gabarito diz 5' });
  assert.equal(normalizeQuestionFlag({ reason: 'OTHER', comment: 'x'.repeat(QUESTION_FLAG_COMMENT_MAX) }).comment.length, QUESTION_FLAG_COMMENT_MAX);
});

test('an unknown reason, a missing one, a non-text comment or a comment that is too long is refused with the field named', () => {
  for (const reason of [undefined, null, '', 'other', 'WRONG', 3]) assert.throws(() => normalizeQuestionFlag({ reason }), (e) => e instanceof RangeError && e.field === 'reason', String(reason));
  assert.throws(() => normalizeQuestionFlag(), (e) => e.field === 'reason');
  assert.throws(() => normalizeQuestionFlag({ reason: 'OTHER', comment: 12 }), (e) => e.field === 'comment');
  assert.throws(() => normalizeQuestionFlag({ reason: 'OTHER', comment: 'x'.repeat(QUESTION_FLAG_COMMENT_MAX + 1) }), (e) => e.field === 'comment');
  assert.throws(() => normalizeQuestionFlag({ reason: 'OTHER', comment: ' '.repeat(10) + 'x'.repeat(QUESTION_FLAG_COMMENT_MAX + 1) }), (e) => e.field === 'comment', 'the limit counts the trimmed text');
});

const flag = (id, exerciseId, extra = {}) => ({ id, exerciseId, action: 'FLAG', attemptId: 100 + id, reason: 'OTHER', comment: null, createdAt: `2026-11-0${id}T10:00:00.000Z`, ...extra });
const clear = (id, exerciseId) => ({ id, exerciseId, action: 'CLEAR', createdAt: `2026-11-0${id}T10:00:00.000Z` });

test('the current marks are the latest event of each question; a CLEAR removes the mark and a later FLAG brings it back', () => {
  assert.deepEqual(currentQuestionFlags([]), []);
  const events = [flag(1, 7), flag(2, 8, { reason: 'CONTENT_ERROR', comment: 'erro' }), clear(3, 7), flag(4, 9)];
  assert.deepEqual(currentQuestionFlags(events).map((f) => f.exerciseId), [8, 9]);
  assert.deepEqual(currentQuestionFlags([...events, flag(5, 7, { reason: 'DOUBTFUL_ANSWER_KEY' })]).map((f) => [f.exerciseId, f.reason]), [[8, 'CONTENT_ERROR'], [9, 'OTHER'], [7, 'DOUBTFUL_ANSWER_KEY']]);
  assert.deepEqual(currentQuestionFlags(events)[0], { exerciseId: 8, attemptId: 102, reason: 'CONTENT_ERROR', comment: 'erro', flaggedAt: '2026-11-02T10:00:00.000Z' });
});

test('the order the events arrive in does not matter and the input is not changed', () => {
  const events = [flag(1, 7), flag(2, 7, { reason: 'CONTENT_ERROR' }), clear(3, 8), flag(4, 8)];
  const shuffled = [events[3], events[1], events[2], events[0]];
  const snapshot = JSON.stringify(shuffled);
  assert.deepEqual(currentQuestionFlags(shuffled), currentQuestionFlags(events));
  assert.deepEqual(currentQuestionFlags(shuffled).map((f) => [f.exerciseId, f.reason]), [[7, 'CONTENT_ERROR'], [8, 'OTHER']]);
  assert.equal(JSON.stringify(shuffled), snapshot);
});

test('the module knows nothing about outcomes: a mark carries no grade, score or evidence', () => {
  const [mark] = currentQuestionFlags([flag(1, 7, { outcome: 'INCORRECT', scorePercent: 0 })]);
  assert.deepEqual(Object.keys(mark).sort(), ['attemptId', 'comment', 'exerciseId', 'flaggedAt', 'reason']);
});
