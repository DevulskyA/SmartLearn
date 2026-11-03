import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripRunningHeaders, decodeShiftedGlyphs } from '../src/pdf/page-text.js';

// SPRINT 05e (cont.). Shapes taken from the real chapter (Kumar & Clark, ch. 6), found when the first version of the
// header remover was checked against it and changed 0 of 28 pages.

const BODY = (n) => `corpo real da pagina ${n} que continua a frase anterior`;

test('the real header pattern is removed: "6 80 Immunity" on even pages, "6Innate immune system 81" on odd pages, page number in the middle or at the end', () => {
  const heads = [
    '6Innate immune system 81', '6 82 Immunity', '6Innate immune system 83', '6 84 Immunity', '6Adaptive immune system 85',
    '6 86 Immunity', '6Adaptive immune system 87', '6 88 Immunity', '6Adaptive immune system 89', '6 90 Immunity',
  ];
  const pages = heads.map((h, i) => `${h}\n${BODY(i)}`);
  assert.deepEqual(stripRunningHeaders(pages), heads.map((_, i) => BODY(i)));
});

test('a header whose words appear only once (a new section name) goes too, because its number continues a long run of page numbers', () => {
  const heads = [
    '6Innate immune system 81', '6 82 Immunity', '6Cell migration 83', '6 84 Immunity', '6HLA molecules and antigen presentation 85',
    '6 86 Immunity', '6The immune system in concert 87', '6 88 Immunity', '6Disorders of immunodeficiency 89', '6 90 Immunity',
  ];
  const pages = heads.map((h, i) => `${h}\n${BODY(i)}`);
  assert.deepEqual(stripRunningHeaders(pages), heads.map((_, i) => BODY(i)));
});

test('numbered headings, one per page, are content: a short run without repeated words is not a page number', () => {
  const pages = ['1 Introducao\ntexto', '2 Metodos\ntexto', '3 Resultados\ntexto', '4 Discussao\ntexto', '5 Conclusao\ntexto'];
  assert.deepEqual(stripRunningHeaders(pages), pages);
});

// Glyph-index encoded labels (figures and tables): the PDF font maps letters to code points shifted by a constant,
// so pdf.js returns "$FWLYDWLRQ" for "Activation" (and code 3 for a space). The document's own vocabulary decides.
const SPACE = String.fromCharCode(3);
const PROSE = [
  'Activation of inflammation genes follows the signal from the cell.',
  'The inflammation genes are switched on after activation of the receptor.',
  'Phagocytosis of bacteria and the barrier function of the skin protect the host.',
  'Physical barriers include skin and mucosa, and bacteria are removed by phagocytosis.',
  'The capsule of the organism resists phagocytosis.',
];
const CONFIRMING = ['$FWLYDWLRQ RI LQIODPPDWLRQ JHQHV', `3K\\VLFDO${SPACE}EDUULHUV`, '3KDJRF\\WRVLV RI EDFWHULD'];

test('labels whose glyph codes are shifted by a constant decode to the real words once the document has confirmed the shift', () => {
  const out = decodeShiftedGlyphs([[...PROSE, ...CONFIRMING, '&DSVXOH'].join('\n')])[0].split('\n');
  assert.deepEqual(out.slice(PROSE.length), ['Activation of inflammation genes', 'Physical barriers', 'Phagocytosis of bacteria', 'Capsule']);
  assert.deepEqual(out.slice(0, PROSE.length), PROSE, 'ordinary lines are untouched');
});

test('a lone line that merely happens to decode is NOT decoded: the shift must be confirmed by several lines first', () => {
  const text = [...PROSE, CONFIRMING[0], '&DSVXOH'].join('\n');
  assert.deepEqual(decodeShiftedGlyphs([text]), [text]);
});

test('ordinary lines, abbreviations and numbers are never touched, with or without a confirmed shift', () => {
  const plain = [...PROSE, 'IL-6 and TNF signal through JAK/STAT', '150 kDa', 'CD4 CD8 MHC', 'Xzqvw plmk rtyu'].join('\n');
  assert.deepEqual(decodeShiftedGlyphs([plain]), [plain]);
  const withShift = [...PROSE, ...CONFIRMING, 'IL-6 and TNF signal through JAK/STAT', '150 kDa', 'CD4 CD8 MHC'].join('\n');
  const out = decodeShiftedGlyphs([withShift])[0].split('\n');
  assert.deepEqual(out.slice(-3), ['IL-6 and TNF signal through JAK/STAT', '150 kDa', 'CD4 CD8 MHC']);
});

test('shifted words the document does not know are not "decoded" into something invented', () => {
  const garbage = [...CONFIRMING, '$FWLYDWLRQ RI LQIODPPDWLRQ JHQHV'].join('\n');
  assert.deepEqual(decodeShiftedGlyphs([garbage]), [garbage], 'no prose vocabulary in the document => nothing is confirmed');
});
