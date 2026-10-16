import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skippedPagesNote, unreadableSourceMessage } from '../src/source-proposals-ui.js';

// SCANNED-1: the student must learn which pages of the PDF did NOT become material, and what to do about it.

test('a PDF with every page readable says nothing extra', () => {
  assert.equal(skippedPagesNote({ emptyPages: [], failedPages: [] }), '');
  assert.equal(skippedPagesNote({}), '');
  assert.equal(skippedPagesNote(null), '');
});

test('pages without extractable text are listed by number, singular and plural', () => {
  assert.match(skippedPagesNote({ emptyPages: [2] }), /1 página sem texto extraível \(p\. 2\)/);
  assert.match(skippedPagesNote({ emptyPages: [2, 5] }), /2 páginas sem texto extraível \(p\. 2, 5\)/);
  assert.match(skippedPagesNote({ emptyPages: [2] }), /ficou de fora dos trechos/);
  assert.match(skippedPagesNote({ emptyPages: [2, 5] }), /ficaram de fora dos trechos/);
});

test('the note says what the summary does NOT cover, so silence is never read as full coverage', () => {
  assert.match(skippedPagesNote({ emptyPages: [3] }), /não cobre/i);
});

test('pages that could not be read are reported separately from empty ones', () => {
  const note = skippedPagesNote({ emptyPages: [2], failedPages: [7, 9] });
  assert.match(note, /1 página sem texto extraível \(p\. 2\)/);
  assert.match(note, /2 páginas não puderam ser lidas \(p\. 7, 9\)/);
});

test('a long list is shortened but the total is exact', () => {
  const pages = Array.from({ length: 30 }, (_, i) => i + 1);
  const note = skippedPagesNote({ emptyPages: pages });
  assert.match(note, /30 páginas sem texto extraível/);
  assert.match(note, /p\. 1, 2, 3, 4, 5, 6, 7, 8 e mais 22/);
  assert.doesNotMatch(note, /\b30\b.*\b29\b/);
});

test('an image-only PDF is not a dead end: the message names the two ways forward', () => {
  const message = unreadableSourceMessage('IMAGE_ONLY_OR_UNREADABLE');
  assert.match(message, /apenas imagem/);
  assert.match(message, /texto selecionável/);
  assert.match(message, /criar a aula à mão/);
  assert.match(unreadableSourceMessage('ENCRYPTED'), /criptografado/);
  assert.match(unreadableSourceMessage('TIMEOUT'), /tempo limite/);
  assert.match(unreadableSourceMessage('SOMETHING_ELSE'), /Não foi possível extrair/);
});
