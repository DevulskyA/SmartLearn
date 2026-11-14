import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSourceTitle, displayProposalTitle } from '../server/src/services/source-title.js';

test('removes the site tag and the format word from a downloaded book name', () => {
  assert.equal(cleanSourceTitle('[Medicalstudyzone.com] Costanzo Physiology, 7th edition PDF.pdf'), 'Costanzo Physiology, 7th edition');
  assert.equal(cleanSourceTitle('(www.livros.net) Guyton_&_Hall - Fisiologia Medica (free download).pdf'), 'Guyton & Hall - Fisiologia Medica');
});

test('keeps names that have nothing to clean and never returns an empty title', () => {
  assert.equal(cleanSourceTitle('insuficiencia-cardiaca.pdf'), 'insuficiencia-cardiaca');
  assert.equal(cleanSourceTitle('Moore - Anatomia Clinica.pdf'), 'Moore - Anatomia Clinica');
  assert.equal(cleanSourceTitle('[site.com].pdf'), '[site.com]');
  assert.equal(cleanSourceTitle(undefined), '');
});

test('keeps brackets that are part of the title (no site tag)', () => {
  assert.equal(cleanSourceTitle('Anatomia [2a edição].pdf'), 'Anatomia [2a edição]');
});

test('shows an untouched default title with the cleaned name and leaves an edited title alone', () => {
  const name = '[Medicalstudyzone.com] Costanzo Physiology, 7th edition PDF.pdf';
  assert.equal(displayProposalTitle('[Medicalstudyzone.com] Costanzo Physiology, 7th edition PDF — páginas 1-3', name), 'Costanzo Physiology, 7th edition — páginas 1-3');
  assert.equal(displayProposalTitle('Meu título', name), 'Meu título');
});
