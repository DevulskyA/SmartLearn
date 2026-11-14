import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffExcerpts, applyExcerpt, pruneExcerpts, sentenceSpans } from '../src/ai/summary-corrections.js';

const BEFORE = '## Filtração\n\nA filtração depende da pressão oncótica. O ritmo de filtração aumenta quando a arteríola se dilata.\n\nA taxa normal é de mL/min.';

test('only the sentences the repair changed become excerpts, and original is an exact substring', () => {
  const after = '## Filtração\n\nA filtração não depende da pressão oncótica. O ritmo de filtração aumenta quando a arteríola se dilata.\n\nA taxa normal é de 125 mL/min.';
  const excerpts = diffExcerpts(BEFORE, after);
  assert.deepEqual(excerpts.map((e) => [e.original, e.proposed]), [
    ['A filtração depende da pressão oncótica.', 'A filtração não depende da pressão oncótica.'],
    ['A taxa normal é de mL/min.', 'A taxa normal é de 125 mL/min.'],
  ]);
  for (const e of excerpts) assert.ok(BEFORE.includes(e.original));
});

test('accepting one excerpt changes only that place; the rest stays byte for byte', () => {
  const after = BEFORE.replace('depende', 'não depende').replace('de mL/min', 'de 125 mL/min');
  const [first, second] = diffExcerpts(BEFORE, after);
  const once = applyExcerpt(BEFORE, first);
  assert.equal(once, BEFORE.replace('depende', 'não depende'));
  assert.ok(once.includes(second.original), 'the other excerpt is untouched and still applicable');
});

test('a deletion is an excerpt with empty proposal; a pure insertion is not offered', () => {
  const removed = BEFORE.replace(' O ritmo de filtração aumenta quando a arteríola se dilata.', '');
  assert.deepEqual(diffExcerpts(BEFORE, removed).map((e) => e.proposed), ['']);
  assert.deepEqual(diffExcerpts(BEFORE, `${BEFORE}\n\nUma frase nova.`), []);
});

test('an excerpt whose original moved or appears twice is refused and pruned, never applied to the wrong place', () => {
  const e = { original: 'A taxa normal é de mL/min.', proposed: 'A taxa normal é de 125 mL/min.' };
  assert.equal(applyExcerpt('outro texto', e), null);
  assert.equal(applyExcerpt(`${BEFORE}\n${e.original}`, e), null);
  assert.deepEqual(pruneExcerpts([e], BEFORE), [e]);
  assert.deepEqual(pruneExcerpts([e], 'texto novo'), []);
  assert.equal(sentenceSpans('Um. Dois.').length, 2);
});
