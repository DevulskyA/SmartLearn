import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAlreadyProcessed, alreadyProcessedMessage } from '../src/source-proposals-ui.js';

// Sending the same PDF again dedupes to the same source, whose trechos may already carry a rascunho or accepted
// content. The server refuses to replace them (HAS_EXISTING_DRAFT / HAS_ACCEPTED_CONTENT); the student must land on
// those trechos, not on a dead-end error.

test('only the two "already processed" server outcomes are treated as that', () => {
  assert.equal(isAlreadyProcessed('HAS_EXISTING_DRAFT'), true);
  assert.equal(isAlreadyProcessed('HAS_ACCEPTED_CONTENT'), true);
  for (const other of ['NOT_EXTRACTED', 'NETWORK_ERROR', 'NOT_FOUND', undefined, null, '']) assert.equal(isAlreadyProcessed(other), false);
});

test('the message says the PDF was already processed and how many trechos are shown, in the singular and the plural', () => {
  assert.match(alreadyProcessedMessage(1, null), /já foi processado/);
  assert.match(alreadyProcessedMessage(1, null), /1 trecho existente/);
  assert.match(alreadyProcessedMessage(4, null), /4 trechos existentes/);
});

test('pages the extraction left out are still reported, so silence is never read as full coverage', () => {
  assert.match(alreadyProcessedMessage(2, { emptyPages: [3] }), /1 página sem texto extraível \(p\. 3\)/);
  assert.doesNotMatch(alreadyProcessedMessage(2, { emptyPages: [], failedPages: [] }), /sem texto extraível/);
});
