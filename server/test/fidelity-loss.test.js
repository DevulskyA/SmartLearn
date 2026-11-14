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

// Real-source calibration (2026-11-14, Costanzo physiology, English source with a Portuguese summary): the first version reported 18 "losses",
// almost all false. Two causes, both guarded here.
test('a summary in another language than the source is not judged (the words cannot match, so every term would look lost)', () => {
  const source = 'The multilayered basement membrane does not permit filtration of plasma proteins and therefore constitutes the most significant barrier of the glomerular capillary. The only pressure that changes is the oncotic pressure of the blood.';
  const summary = '## Filtração\n\nA membrana basal impede a filtração de proteínas plasmáticas e constitui a barreira mais significativa do capilar glomerular. A única pressão que muda é a pressão oncótica do sangue.';
  const result = measureFidelityLoss(source, summary);
  assert.equal(result.skipped, 'LANGUAGE_MISMATCH');
  assert.equal(result.checked, 0);
  assert.deepEqual(result.lost, []);
});

test('figure captions and chart labels are not judged: their numbers are not statements the summary should repeat', () => {
  const source = 'A pressão hidrostática capilar glomerular mantém a filtração ao longo do capilar. A Figura 6.10A mostra o perfil das pressões de Starling no início do capilar glomerular. Capilar glomerular · Filtração líquida · Arteríola aferente · Arteríola eferente · Pressão líquida = +16 mm Hg · +45 · –19 · –10.';
  const summary = '## Pressões\n\nA pressão hidrostática capilar glomerular mantém a filtração ao longo do capilar. O perfil das pressões de Starling no início do capilar glomerular é descrito no texto.';
  const { lost } = measureFidelityLoss(source, summary);
  assert.deepEqual(lost.filter((l) => l.kind === 'NUMBER'), []);
});
