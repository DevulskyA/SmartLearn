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

test('mismatch is decided by build CONTENT when both sides carry it, so a docs-only commit is not reported as a different build', async () => {
  const { identityMismatch } = await import('../src/build-identity-ui.js');
  const app = { id: 'aaaaaaa', inputsHash: 'h1' };
  assert.equal(identityMismatch(app, { head: 'bbbbbbb', content: 'h1' }), false, 'same content, different commit it was opened at');
  assert.equal(identityMismatch(app, { head: 'aaaaaaa', content: 'h2' }), true, 'same commit label but different content');
  assert.equal(identityMismatch({ id: 'aaaaaaa' }, { head: 'bbbbbbb' }), true, 'no content hash on either side: falls back to the commit');
});

test('the diagnostic text has version, channel, build, schema, database file and counts, and nothing else', async () => {
  const { diagnosticText } = await import('../src/build-identity-ui.js');
  const identity = { version: '0.1.0', channel: 'DEV', id: 'a1b2c3d', inputsHash: 'abcdef0123456789ffff' };
  const server = { mode: 'DEV', head: 'a1b2c3d+local', provider: 'CODEX', diagnostics: { schemaVersion: 30, dbPath: 'C:/data/dev/app-data.db', counts: { subjects: 9, learning_units: 12 } } };
  const text = diagnosticText(identity, server);
  for (const part of ['SmartLearn 0.1.0', 'DEV', 'a1b2c3d', 'abcdef012345', 'Esquema: 30', 'app-data.db', 'subjects=9', 'learning_units=12', 'CODEX']) assert.ok(text.includes(part), `missing ${part}`);
  assert.equal(diagnosticText(null, null).includes('indisponível'), true);
  assert.ok(!/email|password|senha/i.test(text));
});
