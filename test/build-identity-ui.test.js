import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module touches `document` only when it is loaded in a browser; the pure formatter is what is under test.
globalThis.document = { querySelector: () => null };
const { buildIdentityText } = await import('../src/build-identity-ui.js');

test('the identity line names mode, commit and provider, and says nothing for an unstamped (release) build', () => {
  assert.equal(buildIdentityText({ mode: 'DEV', head: 'a1b2c3d', provider: 'CODEX' }), 'DEV · a1b2c3d · CODEX');
  assert.equal(buildIdentityText({ mode: 'DEV', head: 'a1b2c3d', provider: null }), 'DEV · a1b2c3d');
  assert.equal(buildIdentityText({ mode: null, head: null, provider: 'CODEX' }), '');
  assert.equal(buildIdentityText(null), '');
});
