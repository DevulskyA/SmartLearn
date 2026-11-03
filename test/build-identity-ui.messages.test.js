import { test } from 'node:test';
import assert from 'node:assert/strict';

// Characterization of the user-visible pt-BR text in build-identity-ui.js: the diagnostic text, the about table, the
// identity line and the copy messages. The module runs show() when it loads in a window, so the DOM is faked before import.
const elements = {
  '#build-identity': { hidden: true, textContent: '', title: '' },
  '#about-identity': { rows: [], replaceChildren(...nodes) { this.rows = nodes; } },
  '#copy-diagnostics': { onclick: null },
  '#copy-diagnostics-message': { textContent: '' },
};
globalThis.window = { __SMARTLEARN_API_BASE__: '' };
globalThis.document = {
  querySelector: (sel) => elements[sel] ?? null,
  createElement: (tag) => ({ tag, textContent: '' }),
};
globalThis.__APP_IDENTITY__ = { version: '0.1.0', channel: 'DEV', id: 'a1b2c3d', commit: 'a1b2c3d' };
let serverBody = { mode: 'DEV', head: 'ffffeee', provider: 'CODEX', content: null, diagnostics: { schemaVersion: 30, dbPath: 'C:/data/app.db', counts: { subjects: 9 } } };
globalThis.fetch = async () => ({ ok: true, json: async () => serverBody });
let clipboardText = null;
let clipboardFails = false;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { if (clipboardFails) throw new Error('denied'); clipboardText = t; } } }, configurable: true, writable: true });

const mod = await import('../src/build-identity-ui.js');
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const text = (node) => node.textContent;

test('the diagnostic text for a full identity and server, exactly as before', () => {
  const identity = { version: '0.1.0', channel: 'DEV', id: 'a1b2c3d', inputsHash: 'abcdef0123456789ffff' };
  const server = { mode: 'DEV', head: 'a1b2c3d+local', provider: 'CODEX', diagnostics: { schemaVersion: 30, dbPath: 'C:/data/dev/app-data.db', counts: { subjects: 9, learning_units: 12 } } };
  assert.equal(mod.diagnosticText(identity, server), [
    'Versão: SmartLearn 0.1.0',
    'Canal: DEV',
    'Build: a1b2c3d (conteúdo abcdef012345)',
    'Servidor local: DEV · a1b2c3d+local · CODEX',
    'Esquema: 30',
    'Banco: C:/data/dev/app-data.db',
    'Contagens: subjects=9 learning_units=12',
  ].join('\n'));
});

test('the diagnostic text with nothing known says indisponível and sem identificação, and an empty count list is empty', () => {
  assert.equal(mod.diagnosticText(null, null), 'Versão: indisponível\nCanal: indisponível\nBuild: indisponível');
  const partial = mod.diagnosticText({ version: '0.1.0', channel: 'DEV', id: null }, { mode: null, head: null, provider: null, diagnostics: { dbPath: 'x' } });
  assert.equal(partial, [
    'Versão: SmartLearn 0.1.0',
    'Canal: DEV',
    'Build: indisponível',
    'Servidor local: sem identificação',
    'Esquema: indisponível',
    'Banco: x',
    'Contagens: ',
  ].join('\n'));
});

test('on load the page shows the identity line and the about table, and a stale server is reported as a mismatch', async () => {
  await settle();
  assert.equal(text(elements['#build-identity']), 'SmartLearn DEV · v0.1.0 · a1b2c3d · servidor ffffeee');
  assert.equal(elements['#build-identity'].title, 'Identidade desta execução: versão, canal e commit da build. Detalhes em Configurações > Sobre.');
  assert.equal(elements['#build-identity'].hidden, false);
  const rows = elements['#about-identity'].rows.map(text);
  assert.deepEqual(rows, [
    'Versão', 'SmartLearn 0.1.0',
    'Canal', 'DEV',
    'Build/commit', 'a1b2c3d',
    'Servidor local', 'DEV · ffffeee · CODEX',
    'Atenção', 'o aplicativo e o servidor local vêm de commits diferentes: reabra pelo SmartLearn DEV.',
  ]);
});

test('the copy button reports success or failure in pt-BR', async () => {
  await elements['#copy-diagnostics'].onclick();
  assert.equal(text(elements['#copy-diagnostics-message']), 'Diagnóstico copiado.');
  assert.match(clipboardText, /^Versão: SmartLearn 0\.1\.0\n/);
  clipboardFails = true;
  await elements['#copy-diagnostics'].onclick();
  assert.equal(text(elements['#copy-diagnostics-message']), 'Não foi possível copiar automaticamente.');
});
