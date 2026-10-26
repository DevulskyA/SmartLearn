import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/api-client.js';
import ptBR from '../src/i18n/locales/pt-BR.js';
import { DRAFT_ERROR_MESSAGE_CODES, draftMessageText } from '../server/src/draft-error-messages.js';

// Slice 2 of the server-text migration, client side: an API error whose sentence the server sends as a stable code + params
// (error.msg) is shown from the catalog; without a code, or with one the catalog does not know, the server's own text is shown.
// Server side of the contract: server/test/draft-error-messages.test.js.

test('a code the catalog knows shows the catalog text with its parameters, not the server text', () => {
  const err = new ApiError('INVALID_STATE', 'texto do servidor', { msg: { code: 'DRAFT_STATE_NOT_EDITABLE', params: { status: 'ACCEPTED' } } });
  assert.equal(err.message, 'Rascunho no estado ACCEPTED não pode ser editado.');
  assert.equal(err.code, 'INVALID_STATE');
});

test('no code (an old server) or an unknown code (a newer server) falls back to the server text, never to the bare code', () => {
  assert.equal(new ApiError('NOT_FOUND', 'Rascunho não encontrado.').message, 'Rascunho não encontrado.');
  assert.equal(new ApiError('NOT_FOUND', 'Algo novo.', { msg: { code: 'SOMETHING_NEW', params: {} } }).message, 'Algo novo.');
  assert.equal(new ApiError('NOT_FOUND', 'Algo novo.', { msg: { params: {} } }).message, 'Algo novo.');
  assert.equal(new ApiError('UNKNOWN_ERROR', undefined).message, 'UNKNOWN_ERROR');
});

test('the catalog and the server table agree: every code has a catalog text, filling exactly the parameters the server sends, saying what the reserve says', () => {
  const problems = [];
  for (const code of DRAFT_ERROR_MESSAGE_CODES) {
    const text = ptBR[`api.draft.${code}`];
    if (typeof text !== 'string') { problems.push(`${code}: missing from the catalog`); continue; }
    const asked = new Set();
    const params = new Proxy({}, { get: (_, name) => { asked.add(name); return 1; } });
    const reserve = draftMessageText(code, params);
    const declared = new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    if ([...declared].sort().join() !== [...asked].sort().join()) problems.push(`${code}: catalog fills {${[...declared]}} but the server sends {${[...asked]}}`);
    if (reserve !== text.replace(/\{\w+\}/g, '1')) problems.push(`${code}: the catalog text and the reserve text differ`);
  }
  assert.deepEqual(problems, []);
});
