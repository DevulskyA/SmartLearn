import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureFidelityLoss } from '../src/ai/fidelity-loss.js';

// P1-9 (deterministic, no AI): words that flip the meaning and went missing from the sentence that restates the idea.

const SOURCE = 'A filtração glomerular não depende da pressão oncótica do filtrado. O ritmo de filtração aumenta apenas quando a arteríola aferente se dilata. A taxa normal é de 125 mL/min nos adultos.';

test('reports a dropped negation, a dropped qualifier and a dropped number', () => {
  const summary = '## Filtração\n\nA filtração glomerular depende da pressão oncótica do filtrado. O ritmo de filtração aumenta quando a arteríola aferente se dilata. A taxa normal é de mL/min nos adultos.';
  const { checked, lost } = measureFidelityLoss(SOURCE, summary);
  assert.equal(checked, 3);
  assert.deepEqual(lost.map((l) => [l.kind, l.term]).sort(), [['NEGATION', 'nao'], ['NUMBER', '125'], ['QUALIFIER', 'apenas']].sort());
});

test('a faithful summary that rewords the idea loses nothing', () => {
  const summary = 'A filtração glomerular não depende da pressão oncótica do filtrado. O ritmo de filtração aumenta apenas quando a arteríola aferente se dilata. Nos adultos a taxa normal é de 125 mL/min.';
  const { checked, lost } = measureFidelityLoss(SOURCE, summary);
  assert.equal(checked, 3);
  assert.deepEqual(lost, []);
});

test('a source sentence the summary does not restate is not judged', () => {
  const { checked, lost } = measureFidelityLoss(SOURCE, '## Rins\n\nOs rins produzem urina a partir do sangue.');
  assert.equal(checked, 0);
  assert.deepEqual(lost, []);
});
