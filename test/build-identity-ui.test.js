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

test('the app identity line names channel, version and build id; a stale server commit is reported as a mismatch', async () => {
  const { appIdentityLine, identityMismatch } = await import('../src/build-identity-ui.js');
  const id = { version: '0.1.0', channel: 'DEV', commit: 'a1b2c3d', id: 'a1b2c3d+local' };
  assert.equal(appIdentityLine(id), 'SmartLearn DEV · v0.1.0 · a1b2c3d+local');
  assert.equal(appIdentityLine(null), '');
  assert.equal(identityMismatch(id, { head: 'a1b2c3d' }), false, '+local does not count as a different commit');
  assert.equal(identityMismatch(id, { head: 'ffffeee' }), true);
  assert.equal(identityMismatch(id, null), false);
});
