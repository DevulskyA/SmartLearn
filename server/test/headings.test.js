import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectHeadings, keepPresentHeadings } from '../src/pdf/headings.js';
import { linesFromItems } from '../src/pdf/page-text.js';

// SPRINT 05i (HEADINGS WITHOUT AN OUTLINE). Real Spanish textbook (Cecil) has no PDF outline, but its text carries
// structure: body 8.9pt, sub-headings 10pt ("Definición", "Manifestaciones clínicas"), section headings 12pt
// ("DISPEPSIA FUNCIONAL (NO ULCEROSA)"). A real page has ~140 lines and a handful of headings; the shapes below keep
// that proportion.

const body = (text) => ({ text, height: 8.9 });
const sub = (text) => ({ text, height: 10 });
const section = (text) => ({ text, height: 12 });
const BODY_A = 'La dispepsia funcional se define como la presencia de síntomas originados en la región gastroduodenal';
const filler = (n) => Array.from({ length: n }, () => body(BODY_A));

const PAGES = [
  { pageIndex: 1, lines: filler(30) },
  { pageIndex: 2, lines: [sub('Seudoobstrucción'), ...filler(14), sub('Diagnóstico diferencial'), ...filler(14)] },
  { pageIndex: 3, lines: [...filler(12), sub('Recomendaciones dietéticas'), ...filler(20)] },
  { pageIndex: 4, lines: [section('j DISPEPSIA FUNCIONAL (NO ULCEROSA)'), sub('Definición'), ...filler(10), sub('Epidemiología'), ...filler(20)] },
  { pageIndex: 5, lines: [...filler(10), sub('Manifestaciones clínicas'), ...filler(10), sub('Diagnóstico'), ...filler(10)] },
];

test('larger-than-body short lines are headings; the biggest size is the top level, the next size the second level', () => {
  const found = detectHeadings(PAGES);
  assert.deepEqual(found.map((h) => [h.level, h.title, h.pageIndex]), [
    [2, 'Seudoobstrucción', 2], [2, 'Diagnóstico diferencial', 2], [2, 'Recomendaciones dietéticas', 3],
    [1, 'DISPEPSIA FUNCIONAL (NO ULCEROSA)', 4], [2, 'Definición', 4], [2, 'Epidemiología', 4],
    [2, 'Manifestaciones clínicas', 5], [2, 'Diagnóstico', 5],
  ]);
});

test('body text is never a heading, however long or short, and a marker glyph before a title is not part of it', () => {
  const found = detectHeadings(PAGES);
  assert.ok(found.every((h) => !h.title.startsWith('La dispepsia')));
  assert.ok(found.some((h) => h.title === 'DISPEPSIA FUNCIONAL (NO ULCEROSA)'), 'the leading "j " dingbat is dropped');
});

test('sentences, tiny labels and long lines in a larger size are not headings', () => {
  const pages = [
    { pageIndex: 1, lines: [...filler(12), sub('Tto'), sub('Esto es una frase completa que termina en punto.'), sub('x'.repeat(120)), sub('Sección clara'), ...filler(20)] },
    { pageIndex: 2, lines: [...filler(12), sub('Otra sección clara'), ...filler(20)] },
    { pageIndex: 3, lines: [...filler(12), sub('Tercera sección clara'), ...filler(20)] },
  ];
  assert.deepEqual(detectHeadings(pages).map((h) => h.title), ['Sección clara', 'Otra sección clara', 'Tercera sección clara']);
});

test('a heading that wraps over two lines of the same size is one heading', () => {
  const pages = [
    { pageIndex: 1, lines: [...filler(12), section('TRASTORNOS FUNCIONALES'), section('GASTROINTESTINALES'), ...filler(20)] },
    { pageIndex: 2, lines: [...filler(12), sub('Una subsección'), ...filler(20)] },
    { pageIndex: 3, lines: [...filler(12), sub('Otra subsección'), ...filler(20)] },
  ];
  assert.deepEqual(detectHeadings(pages).map((h) => [h.level, h.title]), [[1, 'TRASTORNOS FUNCIONALES GASTROINTESTINALES'], [2, 'Una subsección'], [2, 'Otra subsección']]);
});

test('too little structure is no structure: fewer than three headings, or larger-than-body lines that are a big share of the text', () => {
  assert.deepEqual(detectHeadings([{ pageIndex: 1, lines: [...filler(20), sub('Única sección'), ...filler(20)] }, { pageIndex: 2, lines: filler(20) }, { pageIndex: 3, lines: filler(20) }]), []);
  const bigPrint = Array.from({ length: 6 }, (_, i) => ({ pageIndex: i + 1, lines: [...filler(8), sub(`Linea ${'abcdef'[i]}${'abcdef'[i]}`), sub('Otra linea corta'), sub('Y otra linea corta')] }));
  assert.deepEqual(detectHeadings(bigPrint), [], 'when a quarter of the lines are "larger than body" the size says nothing');
});

test('slide-style pages: one title per slide over several bullet lines are headings', () => {
  const slides = Array.from({ length: 5 }, (_, i) => ({ pageIndex: i + 1, lines: [section(`Titulo ${'abcde'[i]}${'abcde'[i]}${'abcde'[i]}`), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A), body(BODY_A)] }));
  assert.deepEqual(detectHeadings(slides).map((h) => [h.level, h.title, h.pageIndex]), [[1, 'Titulo aaa', 1], [1, 'Titulo bbb', 2], [1, 'Titulo ccc', 3], [1, 'Titulo ddd', 4], [1, 'Titulo eee', 5]]);
});

test('a heading whose text is no longer in the page (page furniture, undecoded garbage) is dropped', () => {
  const found = detectHeadings(PAGES);
  const finalText = { 2: 'Seudoobstrucción\ncuerpo', 3: 'Recomendaciones dietéticas\ncuerpo', 4: 'DISPEPSIA FUNCIONAL (NO ULCEROSA)\nDefinición\ncuerpo', 5: 'Manifestaciones clínicas\ncuerpo' };
  const kept = keepPresentHeadings(found, (pageIndex) => finalText[pageIndex] ?? '');
  assert.deepEqual(kept.map((h) => h.title), ['Seudoobstrucción', 'Recomendaciones dietéticas', 'DISPEPSIA FUNCIONAL (NO ULCEROSA)', 'Definición', 'Manifestaciones clínicas']);
});

test('linesFromItems groups pdf.js items into visual lines with the largest item height', () => {
  const items = [
    { str: 'Manifestaciones ', hasEOL: false, height: 10 }, { str: 'clínicas', hasEOL: false, height: 10 }, { str: '', hasEOL: true, height: 0 },
    { str: 'texto del cuerpo', hasEOL: false, height: 8.9 }, { str: '', hasEOL: true, height: 0 },
  ];
  assert.deepEqual(linesFromItems(items), [{ text: 'Manifestaciones clínicas', height: 10 }, { text: 'texto del cuerpo', height: 8.9 }]);
});

// Found running the real Cecil chapter through the first version of the detector
test('section and sub-section sizes stay two different levels (no flattening into one level)', () => {
  const big = (text) => ({ text, height: 24 });
  const pages = [
    { pageIndex: 1, lines: [big('140 ENFERMEDADES'), ...filler(10), section('DOLOR TORÁCICO NO CARDÍACO'), ...filler(10), sub('Definición'), ...filler(20)] },
    { pageIndex: 2, lines: [...filler(10), section('REFLUJO GASTROESOFÁGICO'), ...filler(10), sub('Epidemiología'), ...filler(20)] },
    { pageIndex: 3, lines: [...filler(10), sub('Biopatología'), ...filler(30)] },
  ];
  const levels = Object.fromEntries(detectHeadings(pages).map((h) => [h.title, h.level]));
  assert.equal(levels['140 ENFERMEDADES'], 1);
  assert.equal(levels['DOLOR TORÁCICO NO CARDÍACO'], 2);
  assert.equal(levels['REFLUJO GASTROESOFÁGICO'], 2);
  assert.equal(levels['Definición'], 3);
  assert.equal(levels['Epidemiología'], 3);
  assert.equal(levels['Biopatología'], 3);
});

test('two different sub-headings on consecutive lines are two headings; only a line that clearly continues the previous one is merged', () => {
  const pages = [
    { pageIndex: 1, lines: [...filler(12), sub('Diagnóstico'), sub('Examen clínico'), ...filler(20)] },
    { pageIndex: 2, lines: [...filler(12), sub('Manifestaciones clínicas de la'), sub('enfermedad por reflujo'), ...filler(20)] },
    { pageIndex: 3, lines: [...filler(12), sub('Tratamiento'), ...filler(20)] },
  ];
  assert.deepEqual(detectHeadings(pages).map((h) => h.title), ['Diagnóstico', 'Examen clínico', 'Manifestaciones clínicas de la enfermedad por reflujo', 'Tratamiento']);
});

test('a marker glyph that the book prints as a stand-alone word all over the pages ("Tto") is not part of a title', () => {
  // the marker is printed as its own line on many pages and ALSO lands inside heading lines ("Tratamiento Tto")
  const pages = Array.from({ length: 6 }, (_, i) => ({ pageIndex: i + 1, lines: [...filler(8), sub('Tto'), ...filler(4), sub(`Tratamiento ${'abcdef'[i]}${'abcdef'[i]}${'abcdef'[i]} Tto`), sub('Tto'), ...filler(20)] }));
  assert.deepEqual(detectHeadings(pages).map((h) => h.title), ['Tratamiento aaa', 'Tratamiento bbb', 'Tratamiento ccc', 'Tratamiento ddd', 'Tratamiento eee', 'Tratamiento fff']);
});
