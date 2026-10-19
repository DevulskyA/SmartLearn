import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInsertion } from '../src/summary-insert.js';
import { mathSnippet, parseSummaryTokens } from '../shared/summary-markdown.js';

test('an inline formula goes at the cursor and never over the selected text', () => {
  const r = applyInsertion('A massa é E agora', 10, 11, 'inline', mathSnippet('E=mc^2', false));
  assert.equal(r.value, 'A massa é E\\(E=mc^2\\) agora');
  assert.equal(r.selectFrom, r.value.indexOf(' agora'));
});

test('a block formula and a table start on their own paragraph, after the line of the cursor, and parse as such', () => {
  let r = applyInsertion('texto $5 e mais', 3, 3, 'block', mathSnippet('x^2', true));
  assert.equal(r.value, 'texto $5 e mais\n\n\\[\nx^2\n\\]\n');
  assert.equal(parseSummaryTokens(r.value).filter((t) => t.type === 'math_block').length, 1);
  r = applyInsertion('', 0, 0, 'table');
  assert.ok(parseSummaryTokens(r.value).some((t) => t.type === 'table_open'));
  assert.equal(r.value.slice(r.selectFrom, r.selectTo), 'Coluna 1');
});

test('a block inserted with the cursor inside a formula goes after that line, never inside the formula', () => {
  const r = applyInsertion('Relação: \\(x^2\\) fim\noutra', 13, 13, 'table');
  assert.ok(r.value.startsWith('Relação: \\(x^2\\) fim\n\n| Coluna 1'), r.value);
  assert.ok(r.value.endsWith('\noutra'));
});
