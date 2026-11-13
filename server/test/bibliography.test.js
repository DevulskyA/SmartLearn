import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identifyBibliography, bibliographyOf, findIsbns, isValidIsbn13, isValidIsbn10, isbn10To13, findEditionNumber, findPublicationYear,
  usablePdfTitle, usablePdfAuthors, titleFromFileName, languageFromTag, guessLanguage,
} from '../src/bibliography/identify.js';
import { openCorpus } from '../src/corpus/corpus-index.js';
import { normalizeItem } from '../src/corpus/item.js';
import { resolveNeed } from '../src/corpus/resolve-need.js';

// BIBLIOGRAPHY on SYNTHETIC data (no database, no model, no real book): what a PDF says about itself, each value with its origin,
// and nothing invented when it says nothing.

test('ISBN: valid check digits only; ISBN-10 and ISBN-13 of the same book compare equal; garbage is ignored', () => {
  const good13 = '9780306406157';
  assert.equal(isValidIsbn13(good13), true);
  assert.equal(isValidIsbn13('9780306406158'), false);
  assert.equal(isValidIsbn10('0306406152'), true);
  assert.equal(isbn10To13('0306406152'), good13);
  assert.deepEqual(findIsbns('ISBN 978-0-306-40615-7 and also ISBN: 0-306-40615-2, plus 9780306406158 (typo)'), [good13]);
  assert.deepEqual(findIsbns('Telefone 11 99999-9999, pagina 1234567890'), []);
});

test('edition and year: the copyright page wins; the file name only fills what the text does not say', () => {
  assert.equal(findEditionNumber('Seventh Edition'), 7);
  assert.equal(findEditionNumber('7th edition'), 7);
  assert.equal(findEditionNumber('7ª edição'), 7);
  assert.equal(findEditionNumber('Sem nada'), null);
  assert.deepEqual(findPublicationYear({ text: 'Copyright © 2012 by Elsevier', fileName: 'x 2020.pdf' }), { year: 2012, method: 'COPYRIGHT_LINE' });
  assert.deepEqual(findPublicationYear({ fileName: 'Costanzo Physiology 2012.pdf' }), { year: 2012, method: 'FILE_NAME' });
  assert.deepEqual(findPublicationYear({ fileName: 'arquivo.pdf' }), { year: null, method: null });
});

test('PDF metadata: word-processor defaults and placeholder authors are not a title or an author', () => {
  assert.equal(usablePdfTitle('Microsoft Word - cap3.docx'), '');
  assert.equal(usablePdfTitle('Untitled'), '');
  assert.equal(usablePdfTitle('capitulo.indd'), '');
  assert.equal(usablePdfTitle('Fisiologia Renal'), 'Fisiologia Renal');
  assert.equal(usablePdfTitle('x'), '');
  assert.equal(usablePdfAuthors('admin'), '');
  assert.equal(usablePdfAuthors('Richard Costanzo'), 'Richard Costanzo');
  assert.equal(titleFromFileName('Costanzo_Physiology-7th ed [site.com].pdf'), 'Costanzo Physiology - 7th ed');
});

test('language: the PDF tag wins; otherwise function words decide only when one language clearly leads on enough text', () => {
  assert.equal(languageFromTag('pt-BR'), 'pt');
  assert.equal(languageFromTag('EN'), 'en');
  assert.equal(languageFromTag('???'), '');
  const pt = 'O rim é o órgão que regula o volume de água e os sais do corpo, com uma função que depende da filtração e da reabsorção dos solutos '.repeat(12);
  const en = 'The kidney is the organ that regulates the volume of water and the salts of the body, with a function that depends on the filtration and the reabsorption of solutes '.repeat(12);
  assert.equal(guessLanguage(pt), 'pt');
  assert.equal(guessLanguage(en), 'en');
  assert.equal(guessLanguage('curto demais para decidir'), '', 'too little text: unknown, not a guess');
  assert.equal(guessLanguage('xx yy zz '.repeat(200)), '', 'no language words: unknown');
});

test('identifyBibliography: every value has an origin; a PDF that says nothing yields only the file name, never an invented author or ISBN', () => {
  const page = 'Costanzo Physiology. Fifth Edition. Copyright © 2012 by Elsevier. ISBN 978-0-306-40615-7';
  const full = identifyBibliography({ fileName: 'Costanzo.pdf', firstPagesText: page, pdfInfo: { title: 'Physiology', author: 'Linda Costanzo', language: 'en-US' } });
  assert.deepEqual(full.fields, { title: 'Physiology', authors: 'Linda Costanzo', edition: '5', year: 2012, language: 'en', isbn: '9780306406157' });
  assert.deepEqual(full.origins, { title: 'PDF_METADATA', authors: 'PDF_METADATA', isbn: 'TEXT', edition: 'TEXT', year: 'TEXT', language: 'PDF_METADATA' });

  const bare = identifyBibliography({ fileName: 'apostila renal 2021.pdf', firstPagesText: '', pdfInfo: {} });
  assert.deepEqual(bare.fields, { title: 'apostila renal 2021', authors: null, edition: null, year: 2021, language: null, isbn: null });
  assert.deepEqual(bare.origins, { title: 'FILE_NAME', year: 'FILE_NAME' });

  const nothing = identifyBibliography({});
  assert.deepEqual(nothing.fields, { title: null, authors: null, edition: null, year: null, language: null, isbn: null });
  assert.deepEqual(nothing.origins, {});
});

test('different editions of one title stay distinguishable by their own values', () => {
  const a = identifyBibliography({ fileName: 'Costanzo.pdf', firstPagesText: 'Fifth Edition Copyright © 2012 ISBN 978-0-306-40615-7' });
  const b = identifyBibliography({ fileName: 'Costanzo.pdf', firstPagesText: 'Seventh Edition Copyright © 2018 ISBN 978-0-323-79339-1' });
  assert.equal(a.fields.title, b.fields.title, 'same title');
  assert.deepEqual([a.fields.isbn, b.fields.isbn], ['9780306406157', '9780323793391']);
  assert.notDeepEqual([a.fields.edition, a.fields.year], [b.fields.edition, b.fields.year]);
});

test('bibliographyOf: a row from before migration 044 (all columns absent) reads as all-null, and unreadable origins mean unknown', () => {
  assert.deepEqual(bibliographyOf({ id: 1 }), { title: null, authors: null, edition: null, year: null, language: null, isbn: null, origins: {} });
  assert.deepEqual(bibliographyOf({ bib_title: 'X', bib_origins: '{not json' }).origins, {});
  assert.deepEqual(bibliographyOf({ bib_origins: '[1,2]' }).origins, {});
  assert.equal(bibliographyOf({ bib_title: 'X', bib_origins: '{"title":"USER"}' }).origins.title, 'USER');
});

test('summary retrieval and question reuse go through the same REUSE / DERIVE / GENERATE decision, bank first', () => {
  const items = [
    { id: 'q1', stem: 'O que determina a taxa de filtracao glomerular?', key: 'Starling e Kf', topic: 'Filtracao glomerular', usage_status: 'LICENSED', origin: 'generated', year: 2019 },
    { id: 's1', stem: 'Resumo: filtracao glomerular, edicao 2019, paginas 55-66', key: 'x', topic: 'Filtracao glomerular', usage_status: 'LICENSED', origin: 'generated', item_type: 'SUMMARY', year: 2019 },
  ];
  const corpus = openCorpus({ items: items.map((raw) => normalizeItem(raw).item) });
  assert.equal(resolveNeed(corpus, { topic: 'Filtracao glomerular', itemType: 'SUMMARY' }).item.id, 's1', 'the summary is retrieved by content, not generated');
  assert.equal(resolveNeed(corpus, { topic: 'Filtracao glomerular' }, { exposed: ['q1', 's1'] }).action, 'GENERATE', 'a real gap is the only thing left to generate');
  assert.equal(resolveNeed(openCorpus({ items: [] }), { topic: 'Filtracao glomerular' }).action, 'GENERATE');
});
