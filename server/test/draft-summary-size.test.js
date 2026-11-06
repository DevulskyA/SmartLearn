import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, DraftValidationError, MAX_SUMMARY_LENGTH } from '../src/ai/draft-schema.js';
import { buildDraftPrompt } from '../src/ai/draft-prompt.js';

// SPRINT 3 (Resumo Mestre on a real unit). The hand-written summary of two real pages of the Kumar & Clark chapter
// (complement, neutrophils, eosinophils; ~2,700 characters) was REJECTED whole with "summary excede o tamanho máximo de
// 2000": a unit can hold up to 45,000 characters of source, so a faithful summary that keeps definitions, mechanisms,
// conditions and numbers cannot fit in 2,000 - and a provider that writes one would leave the student with no draft at all.

const SEGMENTS = [{ pageIndex: 4, text: 'x'.repeat(50) }];
const Q = { question: 'What is it?', answer: 'A thing.', explanation: 'Because the source says so.', hint: null, sourceSpans: [{ pageIndex: 4 }] };
const draft = (summary) => ({ summary, summarySourceSpans: [{ pageIndex: 4 }], questions: [Q], modelVersion: 'm', promptVersion: '4' });

test('a faithful summary of a real, dense unit (thousands of characters) is accepted', () => {
  const summary = 'Complement is a cascade of proteins. '.repeat(160); // ~5,900 characters
  assert.ok(summary.length > 5000 && summary.length < MAX_SUMMARY_LENGTH);
  assert.equal(validateDraft(draft(summary), { segments: SEGMENTS }).summary.length, summary.length);
});

test('there is still an upper bound, and going over it is an explicit validation error', () => {
  assert.throws(() => validateDraft(draft('a'.repeat(MAX_SUMMARY_LENGTH + 1)), { segments: SEGMENTS }), (err) => err instanceof DraftValidationError && err.field === 'summary');
});

test('the prompt tells the model how large the summary may be, so the limit is never learned by failing', () => {
  const prompt = buildDraftPrompt([{ pageIndex: 4, text: 'x' }], '4');
  assert.ok(prompt.includes(`${MAX_SUMMARY_LENGTH.toLocaleString('en-US')} characters`), 'the prompt states the exact limit');
  assert.match(prompt, /proportional to the source/i);
});
