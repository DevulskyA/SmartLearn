import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableTitle, acronymsIn } from '../src/services/outline-units.js';

// SPRINT 05f (UNIT TITLES). Found in real use: the book's outline is in capitals ("INNATE IMMUNE SYSTEM",
// "HLA MOLECULES AND ANTIGEN PRESENTATION") and that title becomes the study unit's name everywhere in the app.
// A title in capitals is written like a normal title, except acronyms the DOCUMENT itself writes in capitals.

const BODY = [
  'HLA molecules present peptides to T cells and the MHC region is polymorphic.',
  'The DNA of the pathogen is sensed and IgG antibodies are produced.',
];

test('an all-capitals title becomes an ordinary sentence-case title', () => {
  const acronyms = acronymsIn(BODY);
  assert.equal(readableTitle('INTRODUCING THE TISSUES, CELLS, AND MOLECULES OF THE IMMUNE SYSTEM', acronyms), 'Introducing the tissues, cells, and molecules of the immune system');
  assert.equal(readableTitle('INTRODUCTION', acronyms), 'Introduction');
  assert.equal(readableTitle('6. IMMUNITY', acronyms), '6. Immunity');
  assert.equal(readableTitle('IMMUNE-BASED THERAPIES', acronyms), 'Immune-based therapies');
});

test('acronyms the document itself writes in capitals keep them (HLA, MHC, DNA), and only those', () => {
  const acronyms = acronymsIn(BODY);
  assert.equal(readableTitle('HLA MOLECULES AND ANTIGEN PRESENTATION', acronyms), 'HLA molecules and antigen presentation');
  assert.equal(readableTitle('THE HUMAN MAJOR HISTOCOMPATIBILITY COMPLEX (MHC)', acronyms), 'The human major histocompatibility complex (MHC)');
  assert.equal(readableTitle('DNA SENSING', acronyms), 'DNA sensing');
  assert.equal(readableTitle('AND OF THE', acronyms), 'And of the', 'ordinary words are not acronyms');
});

test('a title that is already written in mixed case is never touched', () => {
  const acronyms = acronymsIn(BODY);
  for (const title of ['Cell migration', 'Immune- based therapies', 'Chimeric antigen receptor T-cell therapy', 'T lymphocyte development and activation']) {
    assert.equal(readableTitle(title, acronyms), title);
  }
});

test('an acronym on its own, or a very short capital title, is left as written', () => {
  const acronyms = acronymsIn(BODY);
  assert.equal(readableTitle('HLA', acronyms), 'HLA');
  assert.equal(readableTitle('II', acronyms), 'II');
});

test('acronym evidence comes from ordinary lines, never from capital headings (a heading cannot vouch for its own words)', () => {
  const found = acronymsIn(['INNATE IMMUNE SYSTEM', 'The MHC region is polymorphic and the innate system responds.']);
  assert.ok(found.has('MHC'));
  assert.ok(!found.has('INNATE') && !found.has('IMMUNE') && !found.has('SYSTEM'));
});

test('a null or empty title stays as it is', () => {
  assert.equal(readableTitle(null, new Set()), null);
  assert.equal(readableTitle('', new Set()), '');
});

test('a capital token that is also an ordinary lowercase word of the document is not an acronym (found on the real chapter: "IN")', () => {
  const acronyms = acronymsIn(['The response occurs in the tissue and is shown IN the figure label.', 'The MHC region is polymorphic.']);
  assert.ok(!acronyms.has('IN'));
  assert.equal(readableTitle('THE IMMUNE SYSTEM IN CONCERT', acronyms), 'The immune system in concert');
  assert.equal(readableTitle('ORGAN REJECTION IN CLINICAL TRANSPLANTATION', acronyms), 'Organ rejection in clinical transplantation');
  assert.ok(acronyms.has('MHC'));
});

test('a merged title is rewritten segment by segment: capitals segments become readable, mixed-case segments are kept', () => {
  const acronyms = acronymsIn(BODY);
  assert.equal(readableTitle('ESOFAGITIS · Esofagitis infecciosa', acronyms), 'Esofagitis · Esofagitis infecciosa');
  assert.equal(readableTitle('HLA MOLECULES · INNATE IMMUNE SYSTEM · …', acronyms), 'HLA molecules · Innate immune system · …');
  assert.equal(readableTitle('Cell migration · Antigen presentation', acronyms), 'Cell migration · Antigen presentation');
});
