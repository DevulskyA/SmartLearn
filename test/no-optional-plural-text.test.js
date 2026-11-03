import { test } from 'node:test';
import assert from 'node:assert/strict';
import ptBR from '../src/i18n/locales/pt-BR.js';

// "1 trecho(s) proposto(s)" reads like a template that was never filled. Singular and plural are separate catalog forms
// (key.one / key.other), chosen by the count.
const OPTIONAL_PLURAL = /\p{L}\((?:s|es|is|ns|ões|ães|ais)\)/u;

test('no visible catalog text uses the "(s)" optional-plural shorthand', () => {
  const found = Object.entries(ptBR).filter(([, text]) => typeof text === 'string' && OPTIONAL_PLURAL.test(text)).map(([key, text]) => `${key}: ${text}`);
  assert.deepEqual(found, []);
});
