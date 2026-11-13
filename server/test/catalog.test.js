import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyFile, findIsbns, isValidIsbn13, isValidIsbn10, isbn10To13, findEditionNumber, findPublicationYear, normalizeTitle } from '../src/catalog/identify.js';
import { sameEditionVerdict, reusableAcrossEditions, preferEdition, sourceNotice } from '../src/catalog/reuse-gate.js';
import { openCorpus } from '../src/corpus/corpus-index.js';
import { normalizeItem } from '../src/corpus/item.js';
import { resolveNeed } from '../src/corpus/resolve-need.js';

// CATALOG on SYNTHETIC data (no database, no model, no real book): identification with confidence, duplicate books, edition change with a
// verified content map, summary retrieval and question reuse that are NEVER decided by a coinciding title or page number.

const ISBN10 = '0323793398';

test('ISBN: valid check digits only; ISBN-10 and ISBN-13 of the same book compare equal; garbage is ignored', () => {
  const good13 = '9780306406157';
  assert.equal(isValidIsbn13(good13), true);
  assert.equal(isValidIsbn13('9780306406158'), false);
  assert.equal(isValidIsbn10('0306406152'), true);
  assert.equal(isbn10To13('0306406152'), good13);
  assert.deepEqual(findIsbns('ISBN 978-0-306-40615-7 and also ISBN: 0-306-40615-2, plus 9780306406158 (typo)'), [good13]);
  assert.deepEqual(findIsbns('Telefone 11 99999-9999, pagina 1234567890'), []);
  void ISBN10;
});

test('edition and year come from the copyright page when present; a file name gives only a LOW-confidence guess', () => {
  assert.equal(findEditionNumber('Seventh Edition'), 7);
  assert.equal(findEditionNumber('7th edition'), 7);
  assert.equal(findEditionNumber('7ª edição'), 7);
  assert.equal(findEditionNumber('Sem nada'), null);
  assert.deepEqual(findPublicationYear({ text: 'Copyright © 2012 by Elsevier', fileName: 'x 2020.pdf' }), { year: 2012, method: 'COPYRIGHT_LINE' });
  assert.deepEqual(findPublicationYear({ fileName: 'Costanzo Physiology 2012.pdf' }), { year: 2012, method: 'FILE_NAME' });
  assert.deepEqual(findPublicationYear({ fileName: 'arquivo.pdf' }), { year: null, method: null });

  const page = 'Costanzo Physiology. Fifth Edition. Copyright © 2012. ISBN 978-0-306-40615-7';
  const full = identifyFile({ fileName: 'Costanzo.pdf', firstPagesText: page });
  assert.equal(full.confidence, 'HIGH');
  assert.equal(full.kind, 'BOOK');
  assert.deepEqual(full.isbns, ['9780306406157']);
  assert.equal(full.editionNumber, 5);
  const nameOnly = identifyFile({ fileName: 'Costanzo Physiology 2012.pdf', firstPagesText: '' });
  assert.equal(nameOnly.confidence, 'LOW');
  assert.equal(nameOnly.kind, 'UNKNOWN', 'no positive evidence: it is not called a book');
  assert.equal(identifyFile({ fileName: 'Apostila de renal.pdf', firstPagesText: '' }).kind, 'HANDOUT');
  assert.equal(identifyFile({ fileName: 'Anotações aula 3.pdf', firstPagesText: '' }).kind, 'NOTES');
});

test('duplicate books: same file or same ISBN is the same edition; same title alone proves nothing', () => {
  const a = identifyFile({ fileName: 'Costanzo Physiology.pdf', firstPagesText: 'ISBN 978-0-306-40615-7' });
  const sameIsbnOtherFile = identifyFile({ fileName: 'costanzo [site].pdf', firstPagesText: 'ISBN 0-306-40615-2' });
  const titleOnly = identifyFile({ fileName: 'Costanzo Physiology 2025.pdf', firstPagesText: '' });
  assert.equal(normalizeTitle('Costanzo Physiology 7th edition [Medicalstudyzone.com].pdf'), 'costanzo physiology');
  assert.deepEqual(sameEditionVerdict(a, a, { sameChecksum: true }), { relation: 'SAME_FILE', reuse: true });
  const v = sameEditionVerdict(a, sameIsbnOtherFile);
  assert.equal(v.relation, 'SAME_EDITION');
  assert.equal(v.recheckCitations, true, 'pages can differ between files of the same edition');
  const t = sameEditionVerdict(a, titleOnly);
  assert.equal(t.reuse, false);
  assert.equal(t.relation, 'NO_PROOF');
  assert.equal(t.hint, 'SAME_TITLE_ONLY');
});

test('edition change: only a VERIFIED map carries content, only EQUIVALENT entries, never by coinciding page numbers', () => {
  const map = {
    verified: true,
    entries: [
      { fromTitleKey: 'filtracao glomerular', toTitleKey: 'filtracao glomerular', fromPages: [30, 40], toPages: [55, 66], relation: 'EQUIVALENT' },
      { fromTitleKey: 'hipertensao', toTitleKey: 'hipertensao', fromPages: [90, 99], toPages: [120, 131], relation: 'REVISED' },
      { fromTitleKey: 'tema antigo', toTitleKey: null, fromPages: [100, 105], toPages: [0, 0], relation: 'REMOVED' },
    ],
  };
  assert.deepEqual(reusableAcrossEditions({ titleKey: 'filtracao glomerular', pages: [58, 60] }, map).from, { titleKey: 'filtracao glomerular', pages: [30, 40] });
  assert.equal(reusableAcrossEditions({ titleKey: 'hipertensao', pages: [121, 125] }, map).reason, 'CONTENT_CHANGED_REGENERATE');
  assert.equal(reusableAcrossEditions({ titleKey: 'filtracao glomerular', pages: [30, 40] }, map).reuse, false, 'the OLD page numbers do not match the new edition');
  assert.equal(reusableAcrossEditions({ titleKey: 'filtracao glomerular', pages: [58, 60] }, { ...map, verified: false }).reason, 'MAPPING_NOT_VERIFIED');
});

test('the newest edition wins only when its match was validated; the student is told when the source differs from the upload', () => {
  const picked = preferEdition([
    { id: 'e2012', year: 2012, validated: true },
    { id: 'e2025', year: 2025, validated: false },
    { id: 'e2019', year: 2019, validated: true },
  ]);
  assert.equal(picked.id, 'e2019', 'an unvalidated newer edition does not win by being newer');
  assert.equal(preferEdition([{ id: 'x', year: 2025, validated: false }]), null);
  const uploaded = { isbns: [], year: 2012, editionNumber: 5 };
  assert.deepEqual(sourceNotice(uploaded, { isbns: [], year: 2025, editionNumber: 7 }), { uploadedYear: 2012, usedYear: 2025, usedEdition: 7 });
  assert.equal(sourceNotice({ ...uploaded, isbns: ['9780306406157'] }, { isbns: ['9780306406157'], year: 2012 }), null);
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
