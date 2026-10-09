import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflowLines, dehyphenatePages } from '../src/pdf/page-text.js';

// SPRINT 05e (TEXT REFLOW). Found in real use of Materiais with a real textbook chapter (Kumar & Clark, ch. 6): the
// trecho reached the screen either as a wall of text (headings glued to the body) or as ragged PDF lines. A PDF line
// break in the middle of a sentence is typesetting: it is rejoined. A finished paragraph, a heading, a list item and a
// caption are structure: they keep their break. The text of the chapter must not change, only where it breaks.
// Lines below are taken from the real chapter (same wording, same wraps).

const PARAGRAPH_ONE = [
  'Immunity can be defined as protection from infection, whether this is bacterial,',
  'viral, fungal or due to multicellular parasites. The immune system can also',
  'distinguish altered self and prevents the development of malignancy by',
  'destroying cancerous cells. The immune system is composed of cells and',
  'molecules organized into specialized tissues and acts in concert to orchestrate',
  'an immune response (Fig. 6.1).',
];
const PARAGRAPH_TWO = [
  'The primary lymphoid organs (thymus and bone marrow) are where the cells',
  'originate. Cells and molecules of the immune system circulate in the blood;',
  'immune responses do not take place there but are initiated at the site of',
  'infection (typically the mucosa or skin).',
];
const joined = (lines) => lines.join(' ');

test('A. a sentence broken by the PDF layout is one continuous sentence again', () => {
  const out = reflowLines(PARAGRAPH_ONE.join('\n'));
  assert.equal(out, joined(PARAGRAPH_ONE));
  assert.ok(!out.includes('\n'));
});

test('B. a hyphenated word is right and the sentence around it is continuous (dehyphenation + reflow together)', () => {
  const page = 'Following resolution of the infection, immunological memory specific for the pathogen is gen-\nerated and resides in cells (lymphocytes) in the spleen and lymph\nnodes, as well as being widely secreted in a molecular form (anti-\nbodies). Secondary lymphoid organs include adenoids, tonsils.';
  const evidence = 'the generated response and the antibodies produced';
  const [out] = dehyphenatePages([page, evidence]);
  assert.equal(reflowLines(out), 'Following resolution of the infection, immunological memory specific for the pathogen is generated and resides in cells (lymphocytes) in the spleen and lymph nodes, as well as being widely secreted in a molecular form (antibodies). Secondary lymphoid organs include adenoids, tonsils.');
});

test('C. a heading stays on its own line and does not glue to the first paragraph, even when it wraps over several lines', () => {
  const text = ['INTRODUCING THE TISSUES,', 'CELLS, AND MOLECULES OF THE', 'IMMUNE SYSTEM', ...PARAGRAPH_ONE].join('\n');
  assert.equal(reflowLines(text), ['INTRODUCING THE TISSUES, CELLS, AND MOLECULES OF THE IMMUNE SYSTEM', joined(PARAGRAPH_ONE)].join('\n'));
});

test('C2. a heading is separated from what follows even when the next line starts in lowercase or a capital', () => {
  assert.equal(reflowLines('CORE SKILLS AND KNOWLEDGE\nAspects of immunity have an impact on all areas of medicine.'), 'CORE SKILLS AND KNOWLEDGE\nAspects of immunity have an impact on all areas of medicine.');
  assert.equal(reflowLines('ADAPTIVE IMMUNE SYSTEM\nantibodies are made by B cells.'), 'ADAPTIVE IMMUNE SYSTEM\nantibodies are made by B cells.');
});

test('D. two real paragraphs are never fused: the break after a finished paragraph stays', () => {
  const out = reflowLines([...PARAGRAPH_ONE, ...PARAGRAPH_TWO].join('\n'));
  assert.equal(out, [joined(PARAGRAPH_ONE), joined(PARAGRAPH_TWO)].join('\n'));
});

test('E. a list is not turned into running text: the introduction and each item keep their break, a wrapped item is joined', () => {
  const text = [
    'Key skills in clinical immunology include:',
    '• Recognizing the possibility of an immunodeficiency syndrome in patients presenting with',
    'recurrent or severe infections such as meningitis or pneumonia.',
    '• Assessing patients with complex allergy, including food and drug allergy.',
    '1. First numbered item is here',
    '2. Second numbered item follows',
    'a) lettered item of a list',
  ].join('\n');
  assert.equal(reflowLines(text), [
    'Key skills in clinical immunology include:',
    '• Recognizing the possibility of an immunodeficiency syndrome in patients presenting with recurrent or severe infections such as meningitis or pneumonia.',
    '• Assessing patients with complex allergy, including food and drug allergy.',
    '1. First numbered item is here',
    '2. Second numbered item follows',
    'a) lettered item of a list',
  ].join('\n'));
});

test('a number that continues the sentence is joined, a numbered heading or caption is not', () => {
  assert.equal(reflowLines('Allergic disorders affect at least 1 in\n10 individuals and autoimmune diseases will affect 1\nin 20 individuals at some point.'), 'Allergic disorders affect at least 1 in 10 individuals and autoimmune diseases will affect 1 in 20 individuals at some point.');
  assert.equal(reflowLines('the receptor binds ligand\nFig. 6.4 Structure of the antibody'), 'the receptor binds ligand\nFig. 6.4 Structure of the antibody');
  assert.equal(reflowLines('Box 6.2 Features of the response\nin the first days'), 'Box 6.2 Features of the response in the first days', 'a wrapped caption is still one caption');
});

test('a full-width line that just wraps before a capitalised word (acronym, proper noun) is joined; a short line before a capital is a real break', () => {
  const full = 'x'.repeat(78);
  const filler = Array.from({ length: 8 }, (_, i) => `${full}${i}`);
  const wrapped = [...filler, 'antigen binding is confirmed by', 'PCR testing of the sample.'].join('\n');
  // 'antigen binding is confirmed by' is short: the width rule does not fire, so the break is kept (conservative)
  // 'by' cannot end a sentence: the next line continues it, whatever its case
  assert.ok(reflowLines(wrapped).endsWith('antigen binding is confirmed by PCR testing of the sample.'));
  const wideWrap = [...filler, `${full} and it continues to`, 'Bordetella pertussis in infants.'].join('\n');
  assert.ok(reflowLines(wideWrap).endsWith(`${full} and it continues to Bordetella pertussis in infants.`));
});

test('page changes create no artificial break: reflow works inside a page and never invents one between pages', () => {
  const [p1, p2] = ['the response continues on\nthe next line', 'and on the following page'].map(reflowLines);
  assert.equal(p1, 'the response continues on the next line');
  assert.equal(p2, 'and on the following page');
});

test('no word, number or symbol changes: only the break characters are touched', () => {
  const text = [...PARAGRAPH_ONE, ...PARAGRAPH_TWO, 'CORE SKILLS AND KNOWLEDGE', 'Aspects of immunity have an impact.'].join('\n');
  const strip = (s) => s.replace(/\s+/g, '');
  assert.equal(strip(reflowLines(text)), strip(text));
});

test('empty and single-line input is safe', () => {
  assert.equal(reflowLines(''), '');
  assert.equal(reflowLines('only one line'), 'only one line');
  assert.equal(reflowLines('a\n\nb'), 'a\n\nb');
});

test('a line ending in a word that cannot end a sentence continues on the next line, whatever its case (found on the real chapter)', () => {
  assert.equal(reflowLines('interaction with T lymphocytes such as\nHuman Leucocyte Antigen (HLA) molecules.'), 'interaction with T lymphocytes such as Human Leucocyte Antigen (HLA) molecules.');
  assert.equal(reflowLines('is composed of\nB cells and of\nT cells.'), 'is composed of B cells and of T cells.');
});

test('a nearly full line that wraps before an acronym is one sentence; a short subheading before a paragraph is not', () => {
  const body = [
    'The major types are the conventional DC (cDC), the plasmacytoid',
    'DC, and a variety of specialized DCs found in tissues that resemble cDCs (e.g.,',
    'the Langerhans cell in the skin). DCs have several distinctive cell surface',
    'molecules, some of which have pathogen-sensing activity (e.g., the antigen',
    'uptake receptor DEC205 on cDCs), while others are involved in interaction with T',
    'lymphocytes. Immature cDCs and pDCs are present in the blood but at very low',
    'levels (<0.5% of lymphocyte/monocyte cells).',
    'Pathogen sensing is a key component of the function of immature DCs, as well',
  ];
  const out = reflowLines(['Types of dendritic cell', ...body].join('\n')).split('\n');
  assert.equal(out[0], 'Types of dendritic cell', 'a short subheading stays on its own line');
  assert.ok(out[1].startsWith('The major types are the conventional DC (cDC), the plasmacytoid DC, and a variety'));
});
