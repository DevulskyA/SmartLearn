import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSummaryTokens } from '../shared/summary-markdown.js';
import { listFigureRefs, replaceFigureRefs, figureRef, scanFigureLines } from '../shared/summary-figure-refs.js';

// A figure reference means ONE thing everywhere: the renderer (markdown-it rule), the server validation, the operational backup and the textual
// export must agree on which lines are figures. The server cannot import markdown-it, so its scanner (shared/summary-figure-refs.js) is a
// dependency-free re-implementation, and THESE tests are what keeps the two equal.
const A = '0b2f6c1e-5d1a-4c7e-9a3b-1f2e3d4c5b6a';
const B = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const ref = (id) => figureRef(id);

const parserIds = (text) => {
  const ids = [];
  for (const token of parseSummaryTokens(text)) if (token.type === 'figure' && !ids.includes(token.meta.id)) ids.push(token.meta.id);
  return ids;
};

test('figure lines inside code are text: indented code, and fences longer than three backticks or tildes that contain shorter fence lines', () => {
  const cases = {
    indentedCode: `texto\n\n    ${ref(A)}\n\nfim`,
    tabIndentedCode: `texto\n\n\t${ref(A)}\n\nfim`,
    fourBacktickFence: `\`\`\`\`\n\`\`\`\n${ref(A)}\n\`\`\`\n\`\`\`\``,
    tildeFence: `~~~~\n${ref(A)}\n~~~`,
    tildeInsideBacktickFence: `\`\`\`\n~~~\n${ref(A)}\n~~~\n\`\`\``,
    unclosedFence: `\`\`\`\n${ref(A)}`,
    fenceWithInfo: `\`\`\`js\n${ref(A)}\n\`\`\``,
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.deepEqual(parserIds(text), [], `parser ${name}`);
    assert.deepEqual(listFigureRefs(text), [], `scanner ${name}`);
    assert.equal(replaceFigureRefs(text, () => '[x]'), text, `replace ${name}`);
  }
});

test('a figure is a line of its own at the left margin of the document: indentation, lists and quotes make it plain text for every consumer', () => {
  const cases = {
    indentedByOne: ` ${ref(A)}`,
    indentedByThree: `   ${ref(A)}`,
    inList: `- ${ref(A)}`,
    inListContinuation: `- item\n\n  ${ref(A)}`,
    inQuote: `> ${ref(A)}`,
    inOrderedList: `1. ${ref(A)}`,
    inMathBlock: `\\[\n${ref(A)}\n\\]`,
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.deepEqual(parserIds(text), [], `parser ${name}`);
    assert.deepEqual(listFigureRefs(text), [], `scanner ${name}`);
  }
});

test('real figures are found by both, wherever they sit at the left margin, with CRLF, trailing spaces and after any kind of block', () => {
  const text = `Parágrafo\n${ref(A)}\n\n- lista\n${ref(B)}   \r\n\r\n> citação\n${ref(C)}\n`;
  assert.deepEqual(parserIds(text), [A, B, C]);
  assert.deepEqual(listFigureRefs(text), [A, B, C]);
  assert.equal(replaceFigureRefs(`a\n${ref(A)}\nb`, (id) => (id === A ? '[figura]' : null)), 'a\n[figura]\nb');
  // an unterminated formula is not a math block, so a figure after it is still a figure
  assert.deepEqual(parserIds(`\\[ aberta\n${ref(A)}`), listFigureRefs(`\\[ aberta\n${ref(A)}`));
});

test('deterministic fuzz: for random mixes of blocks the scanner and the markdown-it rule find exactly the same figures', () => {
  let seed = 20261024;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const ids = [A, B, C];
  const lines = [
    () => ref(ids[rand(3)]), () => ref(ids[rand(3)]), () => ` ${ref(ids[rand(3)])}`, () => `    ${ref(ids[rand(3)])}`, () => `\t${ref(ids[rand(3)])}`, () => `${ref(ids[rand(3)])}  `,
    () => '', () => '', () => 'texto', () => 'outro texto', () => '- item', () => '1. item', () => '  continuação', () => '> citação', () => `> ${ref(ids[rand(3)])}`, () => `- ${ref(ids[rand(3)])}`,
    () => '```', () => '````', () => '~~~', () => '~~~~', () => '```js', () => '  ```', () => '    ```', () => '> ```', () => '- ```', () => '`````',
    () => '\\[', () => '\\]', () => '\\[ x \\]', () => 'x \\]', () => '| a | b |', () => '|---|---|', () => '# título', () => '---', () => '    codigo recuado',
  ];
  let mismatches = 0;
  let withFigures = 0;
  for (let round = 0; round < 3000; round += 1) {
    const text = Array.from({ length: 1 + rand(9) }, () => lines[rand(lines.length)]()).join(rand(8) === 0 ? '\r\n' : '\n');
    const expected = parserIds(text);
    const found = listFigureRefs(text);
    if (expected.length > 0) withFigures += 1;
    if (JSON.stringify(expected) !== JSON.stringify(found)) {
      mismatches += 1;
      if (mismatches <= 5) assert.deepEqual(found, expected, `text ${JSON.stringify(text)}`);
    }
  }
  assert.equal(mismatches, 0);
  assert.ok(withFigures > 300, `the fuzz must actually produce figures (${withFigures})`);
});

// ---- display width of a figure occurrence: [[fig:UUID|w=420]] ----------------------------------------------------------------------------------------
const tokenFigures = (text) => parseSummaryTokens(text).filter((t) => t.type === 'figure').map((t) => [t.meta.id, t.meta.width]);

test('a figure occurrence may carry a display width: the renderer rule and the scanner agree on which markers are figures and on their width', () => {
  const text = `${figureRef(A, 420)}\n\n${figureRef(A, 60)}\n\n${figureRef(B)}\n\n${figureRef(C, 1600)}\n\n${figureRef(C, 40)}`;
  const expected = [[A, 420], [A, 60], [B, null], [C, 1600], [C, 40]];
  assert.deepEqual(tokenFigures(text), expected);
  assert.deepEqual(scanFigureLines(text).map((hit) => [hit.id, hit.width]), expected);
  assert.deepEqual(listFigureRefs(text), [A, B, C], 'the same figure twice counts once as a reference, whatever the widths');
  assert.equal(figureRef(A, 420), `[[fig:${A}|w=420]]`);
  assert.equal(figureRef(A, 5), `[[fig:${A}]]`, 'an unsafe width is never written');
  assert.equal(figureRef(A, null), `[[fig:${A}]]`);
});

test('a marker with a width outside the grammar or the limits, or another option, is plain text for every consumer (and so is never rewritten)', () => {
  for (const option of ['|w=39', '|w=1601', '|w=0', '|w=042', '|w=4.5', '|w=', '|w=-5', '|h=300', '|x=1', '|w=420|h=3', '|w=99999', '| w=420', '|w=420 ']) {
    const text = `antes\n\n[[fig:${A}${option}]]\n\ndepois`;
    assert.deepEqual(tokenFigures(text), [], `parser ${option}`);
    assert.deepEqual(listFigureRefs(text), [], `scanner ${option}`);
    assert.equal(replaceFigureRefs(text, () => '[x]'), text, `replace ${option}`);
  }
});

test('a width marker follows the same layout rules as a plain one: code, lists, quotes and indentation make it text; CRLF and trailing spaces do not', () => {
  const sized = figureRef(A, 300);
  const cases = { fence: `\`\`\`\n${sized}\n\`\`\``, indented: `    ${sized}`, list: `- ${sized}`, quote: `> ${sized}`, math: `\\[\n${sized}\n\\]` };
  for (const [name, text] of Object.entries(cases)) {
    assert.deepEqual(tokenFigures(text), [], `parser ${name}`);
    assert.deepEqual(listFigureRefs(text), [], `scanner ${name}`);
  }
  const real = `a\r\n${sized}   \r\n\r\nb`;
  assert.deepEqual(tokenFigures(real), [[A, 300]]);
  assert.deepEqual(scanFigureLines(real).map((hit) => [hit.id, hit.width]), [[A, 300]]);
  assert.equal(replaceFigureRefs(real, () => '[figura]'), 'a\r\n[figura]\r\n\r\nb', 'the line breaks around the marker are kept');
});
