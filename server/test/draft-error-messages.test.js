import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftError } from '../src/services/generated-drafts.js';
import { AcceptDraftError } from '../src/services/accept-draft.js';
import { handleError } from '../src/routes/generated-drafts.js';
import { dm, draftMessageText, DRAFT_ERROR_MESSAGE_CODES } from '../src/draft-error-messages.js';

// Slice 2 of the server-text migration: a draft error keeps {code, field, message} and, for the sentences in the table, adds
// msg: { code, params }. `message` is the same Portuguese sentence as before (reserve), so a text-only consumer sees no change.
// Client side: test/api-error-messages.test.js.

const reply = () => ({ statusCode: 0, status(n) { this.statusCode = n; return this; } });

test('a DraftError built with a dm() sentence keeps the old text in message and exposes its code and params in msg', () => {
  const err = new DraftError('INVALID_STATE', dm('DRAFT_STATE_NOT_EDITABLE', { status: 'ACCEPTED' }));
  assert.equal(err.message, 'Rascunho no estado ACCEPTED não pode ser editado.');
  assert.deepEqual(err.msg, { code: 'DRAFT_STATE_NOT_EDITABLE', params: { status: 'ACCEPTED' } });
  const accept = new AcceptDraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'), 'draft');
  assert.equal(accept.message, 'Rascunho não encontrado.');
  assert.equal(accept.field, 'draft');
  assert.deepEqual(accept.msg, { code: 'DRAFT_NOT_FOUND', params: {} });
});

test('a plain-string error is unchanged: no msg, same message', () => {
  const err = new DraftError('PROVIDER_ERROR', 'O provedor falhou de forma inesperada. Nada foi salvo.');
  assert.equal(err.message, 'O provedor falhou de forma inesperada. Nada foi salvo.');
  assert.equal(err.msg, undefined);
});

test('the API body carries code, field, message (reserve) and msg; a plain error has no msg key content', () => {
  const r = reply();
  const body = handleError(new DraftError('NOT_FOUND', dm('QUESTION_NOT_FOUND')), r);
  assert.equal(r.statusCode, 404);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { error: { code: 'NOT_FOUND', message: 'Questão não encontrada.', msg: { code: 'QUESTION_NOT_FOUND', params: {} } } });
  const plain = JSON.parse(JSON.stringify(handleError(new DraftError('CANCELLED', 'A geração foi interrompida.'), reply())));
  assert.deepEqual(plain, { error: { code: 'CANCELLED', message: 'A geração foi interrompida.' } });
});

test('every code in the table builds its reserve text and rejects unknown codes', () => {
  for (const code of DRAFT_ERROR_MESSAGE_CODES) assert.equal(typeof dm(code, { status: 'X' }).text, 'string');
  assert.equal(draftMessageText('SUMMARY_REQUIRED'), 'Informe o texto do resumo.');
  assert.throws(() => dm('NOPE'), /unknown draft error message code/);
});
