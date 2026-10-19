// Resumo Mestre científico: the controlled Markdown kept in summary_body. Pure parsing (no DOM); drawing is covered in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSummaryTokens, locateMath, replaceMath, mathSnippet } from '../shared/summary-markdown.js';
import { listFigureRefs, replaceFigureRefs, figureRef } from '../shared/summary-figure-refs.js';

const ID = '3f2b8c1e-5a7d-4e9b-8c3a-1d2e3f4a5b6c';
const types = (text) => parseSummaryTokens(text).map((t) => t.type);
const inlineChildren = (text) => parseSummaryTokens(text).filter((t) => t.type === 'inline').flatMap((t) => t.children);

test('a legacy plain-text summary is headings and paragraphs only (nothing new is invented in it)', () => {
  const legacy = '# Filtração glomerular\n\nA TFG é de 180 L/dia, ~R$ 5 e US$ 10.\nSegunda linha.\n\n## Barreira\n\nEndotélio e epitélio.';
  const kinds = new Set(types(legacy));
  assert.deepEqual([...kinds].sort(), ['heading_close', 'heading_open', 'inline', 'paragraph_close', 'paragraph_open']);
  assert.deepEqual(parseSummaryTokens(''), []);
  assert.deepEqual(parseSummaryTokens(null), []);
});

test('inline and block math use \\( \\) and \\[ \\]; the dollar sign is never math', () => {
  const text = 'A pressão vale \\(P_{liq}=P_{GC}-\\pi_{GC}\\) e custa $5 e $10.\n\n\\[\nTFG = K_f \\times P_{liq}\n\\]\n\n\\[ E = mc^2 \\]';
  const tokens = parseSummaryTokens(text);
  const blocks = tokens.filter((t) => t.type === 'math_block');
  assert.deepEqual(blocks.map((b) => b.content), ['TFG = K_f \\times P_{liq}', 'E = mc^2']);
  const inline = inlineChildren(text).filter((t) => t.type === 'math_inline');
  assert.deepEqual(inline.map((t) => t.content), ['P_{liq}=P_{GC}-\\pi_{GC}']);
  assert.ok(inlineChildren(text).some((t) => t.type === 'text' && t.content.includes('$5 e $10')));
});

test('math edge cases: LaTeX line break before a parenthesis, unclosed delimiters, empty formulas and text after a block close', () => {
  assert.equal(inlineChildren('linha\\\\(x) fim').filter((t) => t.type === 'math_inline').length, 0, '\\\\( is a LaTeX newline then text, not a formula');
  assert.equal(inlineChildren('abre \\(x sem fim').filter((t) => t.type === 'math_inline').length, 0);
  assert.equal(inlineChildren('vazio \\(  \\) fim').filter((t) => t.type === 'math_inline').length, 0);
  assert.ok(!types('\\[\nnunca fecha').includes('math_block'));
  assert.ok(!types('\\[ x \\] e depois texto').includes('math_block'), 'a line with text after the closing marker is a paragraph');
  assert.equal(inlineChildren('a \\(\\text{a\\)b}\\) z').filter((t) => t.type === 'math_inline').length, 1, 'an escaped bracket does not close the formula early');
});

test('a figure is ONLY a valid [[fig:UUID]] on a line of its own, outside code', () => {
  const ok = parseSummaryTokens(`antes\n\n${figureRef(ID)}\n\ndepois`);
  assert.deepEqual(ok.filter((t) => t.type === 'figure').map((t) => t.meta.id), [ID]);
  assert.equal(types(`texto [[fig:${ID}]] no meio`).includes('figure'), false);
  assert.equal(types('[[fig:abc]]').includes('figure'), false);
  assert.equal(types('[[fig:../../etc/passwd]]').includes('figure'), false);
  assert.equal(types('```\n' + figureRef(ID) + '\n```').includes('figure'), false);
  assert.deepEqual(listFigureRefs(`a\n${figureRef(ID)}\n${figureRef(ID.toUpperCase())}\n\`\`\`\n${figureRef('11111111-1111-4111-8111-111111111111')}\n\`\`\``), [ID]);
});

test('NOTHING executable survives: raw HTML, links and Markdown images stay plain text', () => {
  const evil = '<script>alert(1)</script>\n\n![x](https://evil.example/a.png)\n\n[click](javascript:alert(1))\n\nhttps://evil.example <b>x</b>';
  const tokens = parseSummaryTokens(evil);
  const kinds = new Set(tokens.flatMap((t) => [t.type, ...(t.children ?? []).map((c) => c.type)]));
  for (const forbidden of ['html_block', 'html_inline', 'image', 'link_open', 'link_close']) assert.equal(kinds.has(forbidden), false, forbidden);
  const text = tokens.filter((t) => t.type === 'inline').map((t) => t.content).join('\n');
  assert.ok(text.includes('<script>alert(1)</script>') && text.includes('javascript:alert(1)'));
});

test('tables, lists, emphasis and code blocks are recognised', () => {
  const text = '| Fase | Efeito |\n|---|:---:|\n| A | sobe |\n\n- um\n- dois\n\n1. x\n2. y\n\n**forte** e *ênfase*\n\n```\ncódigo\n```';
  const kinds = new Set(types(text));
  for (const k of ['table_open', 'bullet_list_open', 'ordered_list_open', 'fence']) assert.ok(kinds.has(k), k);
});

test('hostile or huge input never throws and stays fast', () => {
  for (const s of ['\\(', '\\[', '\\[\\]', '\\(\\)', '[[fig:', '\u0000\u202e \\(x\\)', '|---|', '#']) assert.doesNotThrow(() => parseSummaryTokens(s), s);
  const t0 = Date.now();
  parseSummaryTokens('\\(a\\) | b '.repeat(5000) + '\n\n' + '\\[ x \\]\n\n'.repeat(1000));
  assert.ok(Date.now() - t0 < 2000);
});

test('locateMath returns exact ranges; replaceMath changes ONE formula and leaves every other byte alone', () => {
  const source = 'Código `\\(x\\)` e fórmula \\(a+b\\) agora.\n\n- item \\(c^2\\)\n\n\\[\nd = e\n\\]\n\nfim \\(a+b\\)';
  const found = locateMath(source);
  assert.deepEqual(found.map((f) => [f.kind, f.tex]), [['inline', 'a+b'], ['inline', 'c^2'], ['block', 'd = e'], ['inline', 'a+b']]);
  for (const f of found) assert.ok(source.slice(f.start, f.end).startsWith(f.kind === 'block' ? '\\[' : '\\('));
  const edited = replaceMath(source, found[3], '\\frac{1}{2}');
  assert.equal(edited, source.slice(0, found[3].start) + '\\(\\frac{1}{2}\\)' + source.slice(found[3].end));
  assert.ok(edited.startsWith('Código `\\(x\\)` e fórmula \\(a+b\\) agora.'), 'the identical formula before it and the one inside code were not touched');
  const blockEdited = replaceMath(source, found[2], 'd = f');
  assert.ok(blockEdited.includes('\\[\nd = f\n\\]'));
  assert.equal(mathSnippet('x^2', false), '\\(x^2\\)');
  assert.equal(mathSnippet(' x^2 ', true), '\\[\nx^2\n\\]');
});

test('replaceFigureRefs swaps figure lines for plain words and leaves code fences and other text alone', () => {
  const text = `antes\n${figureRef(ID)}\ndepois\n\`\`\`\n${figureRef(ID)}\n\`\`\``;
  const out = replaceFigureRefs(text, (id) => (id === ID ? '[Figura: esquema]' : null));
  assert.equal(out, `antes\n[Figura: esquema]\ndepois\n\`\`\`\n${figureRef(ID)}\n\`\`\``);
});
