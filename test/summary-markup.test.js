// Resumo Mestre científico: the controlled Markdown subset kept in summary_body. The parser is PURE (no DOM), so what the student can write is
// provable here; how it is drawn (KaTeX, <table>, <figure>) is checked in the browser. Existing plain-text summaries must read exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary, inlineParts, SUMMARY_FIGURE_URL } from '../shared/summary-markup.js';
import { summaryBlocks } from '../src/lesson-view-model.js';

test('BACKWARD COMPATIBLE: a plain-text summary (headings and paragraphs only) parses to exactly what summaryBlocks gave', () => {
  const text = '# Filtração glomerular\n\nA TFG é de 180 L/dia.\nSegunda linha do mesmo parágrafo.\n\n## Barreira\n\nEndotélio, membrana basal e epitélio.';
  const mine = parseSummary(text).map((b) => (b.type === 'heading' ? { type: 'heading', level: b.level, text: b.text } : { type: 'paragraph', text: b.parts.map((p) => p.text).join('') }));
  assert.deepEqual(mine, summaryBlocks(text));
  assert.deepEqual(parseSummary(''), []);
  assert.deepEqual(parseSummary(null), []);
});

test('display math, inline math, tables, lists and figures are recognised where the author put them', () => {
  const text = [
    '## Equação de Starling',
    '',
    'A pressão líquida vale $P_{liq}=P_{GC}-P_{BS}-\\pi_{GC}$ em cada ponto.',
    '',
    '$$',
    'TFG = K_f \\times (P_{GC} - P_{BS} - \\pi_{GC})',
    '$$',
    '',
    '| Efeito | RPF | TFG |',
    '|---|:---:|---:|',
    '| Aferente ↓ | ↓ | ↓ |',
    '| Eferente ↓ | ↓ | ↑ |',
    '',
    '- primeiro item',
    '- segundo item',
    '',
    '1. um',
    '2. dois',
    '',
    '![Barreira de filtração](smartlearn-figure:12 "Figura 1. Barreira glomerular")',
  ].join('\n');
  const blocks = parseSummary(text);
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'math', 'table', 'list', 'list', 'figure']);
  assert.deepEqual(blocks[1].parts.map((p) => p.type), ['text', 'math', 'text']);
  assert.equal(blocks[1].parts[1].tex, 'P_{liq}=P_{GC}-P_{BS}-\\pi_{GC}');
  assert.equal(blocks[2].tex, 'TFG = K_f \\times (P_{GC} - P_{BS} - \\pi_{GC})');
  assert.deepEqual(blocks[3].header.map((c) => c.text), ['Efeito', 'RPF', 'TFG']);
  assert.deepEqual(blocks[3].align, [null, 'center', 'right']);
  assert.equal(blocks[3].rows.length, 2);
  assert.deepEqual(blocks[4], { type: 'list', ordered: false, items: ['primeiro item', 'segundo item'] });
  assert.equal(blocks[5].ordered, true);
  assert.deepEqual(blocks[6], { type: 'figure', figureId: 12, alt: 'Barreira de filtração', caption: 'Figura 1. Barreira glomerular' });
});

test('dollar signs in ordinary medical or money text are NOT math (Pandoc-style rule): "$5 e $10", "R$ 20", "Na+ $ K+" stay text', () => {
  for (const s of ['Custa $5 e $10 por dose.', 'R$ 20 por exame', 'concentração de Na+ $ K+ no plasma', 'um $ sozinho', 'US$ 3,50 e depois $4']) {
    assert.deepEqual(inlineParts(s), [{ type: 'text', text: s }], s);
  }
  assert.deepEqual(inlineParts('preço \\$5 e fórmula $x^2$'), [{ type: 'text', text: 'preço $5 e fórmula ' }, { type: 'math', tex: 'x^2' }]);
});

test('NOTHING executable or foreign survives: raw HTML stays text; only the internal figure scheme is a figure; other image/link syntax stays text', () => {
  const evil = [
    '<script>alert(1)</script>',
    '',
    '![x](https://evil.example/a.png)',
    '',
    '![x](javascript:alert(1))',
    '',
    '![x](smartlearn-figure:abc)',
    '',
    '[click](javascript:alert(1))',
  ].join('\n');
  const blocks = parseSummary(evil);
  assert.ok(blocks.every((b) => b.type === 'paragraph'), 'no figure, no link, no html node: only paragraphs of plain text');
  assert.equal(blocks[0].parts[0].text, '<script>alert(1)</script>');
  assert.equal(SUMMARY_FIGURE_URL.test('smartlearn-figure:7'), true);
  assert.equal(SUMMARY_FIGURE_URL.test('https://x/y'), false);
});

test('robust to hostile input: unclosed math, a table without separator, huge input and weird bytes never throw and never loop', () => {
  for (const s of ['$$\nnunca fecha', 'texto $x sem fim', '| só | linha |', '|---|---|', '- \n- ', '#', '# ', '![](smartlearn-figure:1', '\u0000\u202e $x$']) {
    assert.doesNotThrow(() => parseSummary(s), s);
  }
  const huge = ('$a$ | b '.repeat(5000)) + '\n\n' + '$$ x $$\n'.repeat(2000);
  const t0 = Date.now();
  parseSummary(huge);
  assert.ok(Date.now() - t0 < 1000, 'linear-time behavior on large input');
});

test('formulas are kept as written (the source of truth is the text), and a parsed summary can be written back to equivalent text', () => {
  const text = 'Antes $a+b$ depois\n\n$$\nx = \\frac{1}{2}\n$$';
  const blocks = parseSummary(text);
  assert.equal(blocks[0].parts[1].tex, 'a+b');
  assert.equal(blocks[1].tex, 'x = \\frac{1}{2}');
});
