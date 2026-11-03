import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureDraft, numbersIn, contentWords, summarizeMeasures } from '../scripts/prompt-lab/metrics.mjs';

const SOURCE = 'A taxa de filtração glomerular normal é 120 mL/min. A pressão hidrostática capilar vale 45 mm Hg e a pressão oncótica 29 mm Hg. A inulina é livremente filtrada.';

const q = (over) => ({ question: 'Qual é a pressão hidrostática capilar glomerular?', answer: 'Vale 45 mm Hg.', explanation: 'Favorece a filtração porque empurra o líquido para fora do capilar.', hint: 'Pense na força que empurra o líquido.', questionType: 'RECALL', sourceSpans: [{ pageIndex: 1 }], ...over });

test('numbersIn normalises decimal commas, signs and ignores single digits', () => {
  assert.deepEqual(numbersIn('hematócrito 0,45 e −35 mm Hg, 3 camadas, 1091 mL/min'), ['0.45', '35', '1091']);
});

test('a number that is not in the source is flagged (the cheapest sensor for an invented critical value)', () => {
  const m = measureDraft({ summary: 'A TFG é 120 mL/min.', questions: [q({ answer: 'Vale 55 mm Hg.' }), q()] }, { sourceText: SOURCE, pages: [1] });
  assert.deepEqual(m.unsupportedNumbers, [{ question: 1, numbers: ['55'] }]);
  assert.deepEqual(m.summaryUnsupportedNumbers, []);
});

test('a hint that repeats the answer is flagged; an explanation that only echoes question+answer is flagged; a missing explanation is flagged', () => {
  const m = measureDraft({
    summary: 'x',
    questions: [
      q({ answer: 'A inulina é livremente filtrada', hint: 'inulina livremente filtrada' }),
      q({ answer: 'Vale 45 mm Hg.', explanation: 'Qual pressão hidrostática capilar glomerular vale 45 mm Hg' }),
      q({ explanation: null }),
      q({ hint: 'Pense na força que empurra o líquido.' }),
    ],
  }, { sourceText: SOURCE, pages: [1] });
  assert.deepEqual(m.hintsLeaking, [1]);
  assert.deepEqual(m.explanationsEchoing, [2]);
  assert.deepEqual(m.missingExplanations, [3]);
});

test('out-of-scope terms are counted in questions and in the summary (scope contamination)', () => {
  const m = measureDraft({ summary: 'Resumo sobre PAH e filtração.', questions: [q({ question: 'Como o PAH é depurado?' }), q()] }, { sourceText: SOURCE, pages: [1], outOfScopeTerms: ['PAH'] });
  assert.deepEqual(m.outOfScopeInSummary, ['PAH']);
  assert.deepEqual(m.outOfScopeQuestions.map((o) => o.question), [1]);
});

test('near-duplicate questions, page coverage and volume per 1000 source characters', () => {
  const m = measureDraft({ summary: 's', questions: [q(), q({ question: 'Qual é a pressão hidrostática capilar glomerular vale?' }), q({ question: 'Para que serve a inulina?', sourceSpans: [{ pageIndex: 2 }] })] }, { sourceText: SOURCE, pages: [1, 2, 3] });
  assert.equal(m.nearDuplicateQuestions.length, 1);
  assert.deepEqual(m.pagesWithoutQuestions, [3]);
  assert.equal(m.questionCount, 3);
  assert.ok(m.questionsPer1kSourceChars > 10);
  assert.equal(summarizeMeasures(m).nearDuplicates, 1);
});

test('contentWords drops accents, case and short/stop words', () => {
  assert.deepEqual(contentWords('A Pressão HIDROSTÁTICA, como é?'), ['pressao', 'hidrostatica']);
});
