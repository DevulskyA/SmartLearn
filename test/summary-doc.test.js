import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToDoc, docToMarkdown, serializeBlock, serializeVerified, normalizeInline } from '../shared/summary-doc.js';

import { CORPUS, ID } from './summary-corpus.js';
const open = (source) => markdownToDoc(source);
const back = (source) => { const { doc, lead, tail } = open(source); return docToMarkdown(doc, { lead, tail }); };
const text = (t, ...marks) => ({ type: 'text', text: t, marks: marks.map((type) => ({ type })) });
const para = (...content) => ({ type: 'paragraph', content });
const writeNew = (...blocks) => serializeVerified({ type: 'doc', content: blocks });


test('a summary that was only opened is written back byte for byte (every shape, CRLF, odd gaps, unknown syntax)', () => {
  for (const [name, source] of Object.entries(CORPUS)) assert.equal(back(source), source, name);
});

test('tables, quotes, code and rules are real blocks; only what has no visual form is carried as a preserved atom with its exact text', () => {
  const kinds = (source) => open(source).doc.content.map((b) => b.type);
  assert.deepEqual(kinds(CORPUS.table), ['table', 'paragraph']);
  assert.deepEqual(kinds(CORPUS.quote), ['blockquote', 'paragraph']);
  assert.deepEqual(kinds(CORPUS.code), ['codeBlock', 'rawBlock', 'horizontalRule', 'paragraph']);
  const [table] = open(CORPUS.table).doc.content;
  assert.deepEqual(table.content.map((row) => row.content.map((c) => [c.type, c.content[0].content[0].text])), [[['tableHeader', 'A'], ['tableHeader', 'B']], [['tableCell', '1'], ['tableCell', '2']]]);
  const [code, indented] = open(CORPUS.code).doc.content;
  assert.deepEqual([code.attrs.language, code.content[0].text], ['js', 'const x = `a`;']);
  assert.equal(indented.attrs.text, '    bloco recuado');
  // links, images and html are switched off in the controlled Markdown: they are plain text, and plain text is what is edited
  assert.equal(open(CORPUS.unknown).doc.content[0].type, 'paragraph');
});

test('a table keeps its alignment, escapes pipes inside cells and pads short rows; a changed cell rewrites only its table', () => {
  const source = 'Antes\n\n| Droga | Dose |\n| :--- | ---: |\n| a \\| b | 5 |\n\nDepois\n';
  assert.equal(back(source), source);
  const { doc, lead, tail } = open(source);
  const table = doc.content[1];
  assert.deepEqual(table.content[0].content.map((c) => c.attrs.align), ['left', 'right']);
  table.content[1].content[1].content[0].content = [text('10')];
  assert.equal(docToMarkdown(doc, { lead, tail }), source.replace('| 5 |', '| 10 |'));
  table.content.push({ type: 'tableRow', content: [{ type: 'tableCell', attrs: { align: null }, content: [para(text('novo'))] }] });
  assert.ok(docToMarkdown(doc, { lead, tail }).includes('| novo |  |\n'));
});

test('a quote and a fenced block written new are valid Markdown that reads back as the same blocks; a long fence survives backticks', () => {
  const out = writeNew({ type: 'blockquote', content: [para(text('um')), para(text('dois', 'bold'))] }, { type: 'codeBlock', attrs: { language: 'js' }, content: [text('x = ```y```')] }, { type: 'horizontalRule' });
  assert.equal(out.error, undefined);
  assert.equal(out.text, '> um\n>\n> **dois**\n\n````js\nx = ```y```\n````\n\n---');
});


test('a formula inside bold or italic is not flattened into an unformatted atom: the block stays text with its formatting', () => {
  const source = 'Valor **importante \\(x^2\\)** e *\\(y\\)* no texto.';
  const [block] = open(source).doc.content;
  assert.equal(block.type, 'rawBlock');
  assert.equal(block.attrs.text, source);
  assert.equal(back(source), source);
});

test('a list whose items hold anything but paragraphs and lists is carried raw as a whole', () => {
  const source = '- item\n\n  ```\n  code\n  ```\n- outro';
  const [block] = open(source).doc.content;
  assert.equal(block.type, 'rawBlock');
  assert.equal(back(source), source);
});

test('formulas and figures are atoms that keep their exact content, valid or not', () => {
  const { doc } = open(CORPUS.formulas);
  const first = doc.content[0];
  assert.deepEqual(first.content.filter((n) => n.type === 'mathInline').map((n) => n.attrs.tex), ['\\frac{a}{b}', 'x^2']);
  assert.deepEqual(doc.content.filter((b) => b.type === 'mathBlock').map((b) => b.attrs.tex), ['E = mc^2', '\\int_0^1 x\\,dx']);
  const broken = open(CORPUS.invalidFormula).doc.content;
  assert.equal(broken[0].content.find((n) => n.type === 'mathInline').attrs.tex, '\\frac{a');
  assert.equal(broken[1].attrs.tex, '\\unknowncmd{x}');
  const figs = open(CORPUS.figures).doc.content.filter((b) => b.type === 'figure');
  assert.deepEqual(figs.map((f) => f.attrs.id), [ID, ID]); // ids are lower-cased by the parser, like everywhere else
});

test('editing one block rewrites only that block: every other block, separator and the text around keep their original bytes', () => {
  const source = '\n\n## Título\n\n\nPrimeiro parágrafo.\nSegunda linha.\n\n- a\n- b\n\n| t | u |\n|---|---|\n| 1 | 2 |\n\nFim.\n';
  const { doc, lead, tail } = open(source);
  doc.content[1].content = [text('Primeiro parágrafo ')].concat([text('editado', 'bold')]);
  const out = docToMarkdown(doc, { lead, tail });
  assert.equal(out, source.replace('Primeiro parágrafo.\nSegunda linha.', 'Primeiro parágrafo **editado**'));
});

test('an edit that does not change the canonical block (same content re-entered) keeps the original bytes', () => {
  const source = 'Taxa  com   espaços   e\r\nquebra.';
  const { doc, lead, tail } = open(source);
  doc.content[0].content = doc.content[0].content.map((n) => ({ ...n }));
  assert.equal(docToMarkdown(doc, { lead, tail }), source);
});

test('a block turned into another kind, or a new block next to a tight gap, never merges with its neighbour', () => {
  const { doc, lead, tail } = open('# Título\ntexto colado');
  doc.content[0] = { type: 'paragraph', content: [text('Título agora parágrafo')], attrs: doc.content[0].attrs };
  const out = docToMarkdown(doc, { lead, tail });
  assert.equal(out, 'Título agora parágrafo\n\ntexto colado');
  assert.ok(serializeVerified({ type: 'doc', content: doc.content }, { lead, tail }).text);
});

test('literal characters typed in the editor come back as the same literal characters', () => {
  const cases = [
    '*não é itálico*', '**nem negrito**', '# não é título', '## nem este', '> nem citação', '- nem lista', '+ nem este', '1. nem lista numerada', '2) nem este',
    'snake_case_name e _enfase_', '5 * 3 * 2', '`crase` solta', '~~não riscado~~', 'um ~ solto', 'a & b e &amp; e &#35;', 'C# e F#', 'termina com #',
    '\\(não é fórmula\\)', '\\[nem bloco\\]', 'barra \\ solta', '[[fig:' + ID + ']]', '$5 e $6', '| a | b |', '===', '---', '[link](http://x.test)', '<b>html</b>',
  ];
  for (const literal of cases) {
    const result = writeNew(para(text(literal)));
    assert.ok(result.text !== undefined && !result.error, `${literal} -> ${JSON.stringify(result)}`);
    const reread = open(result.text).doc.content;
    assert.equal(reread.length, 1, literal);
    assert.equal(reread[0].type, 'paragraph', literal);
    const joined = normalizeInline(reread[0].content).map((n) => n.text).join('');
    assert.equal(joined, literal, `${literal} came back as ${joined} via ${JSON.stringify(result.text)}`);
  }
});

test('formatting combinations and edge whitespace come back with the same marks', () => {
  const doc = [
    para(text('um '), text('negrito', 'bold'), text(' e '), text('itálico', 'italic'), text(' e '), text('os dois', 'bold', 'italic'), text(' e '), text('riscado', 'strike'), text('.')),
    para(text('com código '), text('a`b', 'code'), text(' e '), text(' x ', 'code')),
    para(text('espaço ', 'bold'), text('dentro', 'bold'), text(' ', 'italic'), text('fim')),
  ];
  const result = writeNew(...doc);
  assert.ok(!result.error, JSON.stringify(result));
  const reread = open(result.text).doc.content;
  const marks = (b) => normalizeInline(b.content).map((n) => `${n.text ?? n.type}:${(n.marks ?? []).map((m) => m.type).join('+')}`);
  assert.deepEqual(marks(reread[0]), ['um :', 'negrito:bold', ' e :', 'itálico:italic', ' e :', 'os dois:bold+italic', ' e :', 'riscado:strike', '.:']);
  assert.deepEqual(marks(reread[1]), ['com código :', 'a`b:code', ' e :', ' x :code']);
});

test('lists: ordered start, nesting, tight and loose survive an edit; empty items disappear instead of breaking the list', () => {
  const { doc, lead, tail } = open('3. c\n4. d\n   - d1\n   - d2\n5. e');
  const list = doc.content[0];
  assert.equal(list.type, 'orderedList');
  assert.equal(list.attrs.start, 3);
  list.content[2].content[0].content = [text('E editado')];
  list.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }); // the empty item left by pressing Enter
  const result = serializeVerified(doc, { lead, tail });
  assert.equal(result.text, '3. c\n4. d\n   - d1\n   - d2\n5. E editado');
  const loose = open('- a\n\n- b');
  loose.doc.content[0].content[1].content[0].content = [text('b2')];
  assert.equal(serializeVerified(loose.doc, loose).text, '- a\n\n- b2');
});

test('what cannot be written back faithfully is refused with a reason, never saved as something else', () => {
  // a formula whose text would end the delimiter early cannot be represented
  const bad = writeNew(para(text('x '), { type: 'mathInline', attrs: { tex: 'a\\)b' } }));
  assert.ok(bad.error, JSON.stringify(bad));
  // the verified writer trusts nothing it did not read back
  const fine = writeNew(para(text('x '), { type: 'mathInline', attrs: { tex: 'a+b' } }));
  assert.equal(fine.text, 'x \\(a+b\\)');
});

test('a preserved block (no visual form) is written back verbatim, even when it is the only thing a new document holds', () => {
  const source = '    bloco recuado\n    segunda linha';
  const { doc, lead, tail } = open(source);
  assert.equal(doc.content[0].type, 'rawBlock');
  assert.equal(docToMarkdown(doc, { lead, tail }), source);
  assert.equal(writeNew({ type: 'rawBlock', attrs: { text: source } }).text, source);
});

test('a document emptied by the student is the empty text (outside whitespace kept), not a refusal', () => {
  const { doc, lead, tail } = open('um\n\ndois');
  doc.content = [para()];
  assert.deepEqual(serializeVerified(doc, { lead, tail }), { text: '' });
  assert.deepEqual(serializeVerified(open('').doc), { text: '' });
});

test('empty paragraphs and empty headings have no Markdown form and leave no trace', () => {
  assert.equal(serializeBlock(para()), null);
  assert.equal(serializeBlock({ type: 'heading', attrs: { level: 2 }, content: [] }), null);
  const { doc, lead, tail } = open('um\n\ndois');
  doc.content.splice(1, 0, para());
  assert.equal(docToMarkdown(doc, { lead, tail }), 'um\n\ndois');
});

test('deterministic fuzz: random documents of supported blocks are written, read back and compared with no mismatch', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const words = ['pressão', 'a_b', '*', '#', '1.', 'x', '~', '`', '[', ']', '&', '\\', 'ABC', '-', '>', '5', 'ml/kg', '(', ')', '=', '|'];
  const inline = () => {
    const nodes = [];
    for (let i = 0, n = 1 + rand(5); i < n; i++) {
      const pick = rand(8);
      const marks = pick === 1 ? ['bold'] : pick === 2 ? ['italic'] : pick === 3 ? ['bold', 'italic'] : pick === 4 ? ['strike'] : [];
      if (pick === 5) nodes.push({ type: 'mathInline', attrs: { tex: ['x^2', '\\frac{a}{b}', 'H_2O'][rand(3)] } });
      else if (pick === 6 && nodes.length > 0) nodes.push({ type: i % 2 ? 'softBreak' : 'hardBreak' });
      else nodes.push(text(`${words[rand(words.length)]}${rand(2) ? ' ' : ''}${words[rand(words.length)]}`, ...marks));
    }
    return nodes;
  };
  let written = 0;
  let refused = 0;
  for (let round = 0; round < 400; round++) {
    const blocks = [];
    for (let i = 0, n = 1 + rand(4); i < n; i++) {
      const k = rand(5);
      if (k === 0) blocks.push({ type: 'heading', attrs: { level: 1 + rand(4) }, content: inline() });
      else if (k === 1) blocks.push({ type: 'bulletList', attrs: { loose: false }, content: [1, 2].map(() => ({ type: 'listItem', content: [para(...inline())] })) });
      else if (k === 2) blocks.push({ type: 'mathBlock', attrs: { tex: 'a+b' } });
      else blocks.push(para(...inline()));
    }
    const result = serializeVerified({ type: 'doc', content: blocks });
    if (result.error) { refused += 1; continue; }
    written += 1;
    // whatever was accepted must be stable: reading it and writing it again gives the same bytes
    const again = open(result.text);
    assert.equal(docToMarkdown(again.doc, again), result.text);
  }
  // the verifier may refuse a rare unrepresentable mix, but it must not refuse the ordinary case wholesale
  assert.ok(written > 300, `written ${written}, refused ${refused}`);
});

// ---- figure width in the document model ---------------------------------------------------------------------------------------------------------
test('legacy and sized figure markers are written back byte for byte when the figure was not touched', () => {
  const legacy = `Antes\n\n[[fig:${ID}]]\n\nDepois`;
  const sized = `Antes\n\n[[fig:${ID}|w=420]]\n\nDepois\r\n\r\n[[fig:${ID.toUpperCase()}|w=60]]`;
  for (const source of [legacy, sized]) assert.equal(back(source), source);
  const [, figure] = open(legacy).doc.content;
  assert.deepEqual([figure.type, figure.attrs.id, figure.attrs.width], ['figure', ID, null]);
  const [, , , second] = open(sized).doc.content;
  assert.deepEqual([second.attrs.id, second.attrs.width], [ID, 60], 'the same figure twice keeps a width per occurrence');
});

test('resizing writes the width on that occurrence only; clearing it goes back to the legacy marker; an unsafe width is never written', () => {
  const source = `A\n\n[[fig:${ID}]]\n\nB\n\n[[fig:${ID}|w=300]]\n\nC`;
  const { doc, lead, tail } = open(source);
  doc.content[1].attrs.width = 420;
  assert.equal(docToMarkdown(doc, { lead, tail }), source.replace(`[[fig:${ID}]]`, `[[fig:${ID}|w=420]]`), 'only the edited line changes');
  doc.content[1].attrs.width = null;
  doc.content[3].attrs.width = null;
  assert.equal(docToMarkdown(doc, { lead, tail }), `A\n\n[[fig:${ID}]]\n\nB\n\n[[fig:${ID}]]\n\nC`);
  doc.content[1].attrs.width = 99999;
  assert.equal(serializeBlock(doc.content[1]), `[[fig:${ID}]]`);
});

test('a marker with an invalid width is an ordinary paragraph: shown as text, kept byte for byte, never turned into a figure', () => {
  const source = `A\n\n[[fig:${ID}|w=5]]\n\n[[fig:${ID}|w=420|h=2]]`;
  const blocks = open(source).doc.content;
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'paragraph', 'paragraph']);
  assert.equal(back(source), source);
});

test('text typed in a paragraph that looks like a figure marker (with or without a width) is escaped, so it can never become a figure by accident', () => {
  for (const marker of [`[[fig:${ID}]]`, `[[fig:${ID}|w=420]]`]) {
    const out = writeNew(para(text(marker)));
    assert.equal(out.error, undefined);
    assert.ok(out.text.startsWith('\\[['), out.text);
  }
});
