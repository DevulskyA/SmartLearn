import { test } from 'node:test';
import assert from 'node:assert/strict';
import ptBR from '../src/i18n/locales/pt-BR.js';
import { t, setLocale, registerCatalog } from '../src/i18n/index.js';
import { IMPORT_WARNING_CODES, importWarning, importWarningReserveText } from '../shared/import-warnings.js';

// Client side of the contract "the server / shared module sends code + params, the client writes the text" for the import preview
// warnings. Server side (what each emitter produces): server/test/import-warnings.test.js.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
const { warningText } = await import('../src/migration-ui.js');
const { NetworkError, apiRequest } = await import('../src/api-client.js');

const SAMPLE = {
  DEFAULTED_COLOR: { id: 7 },
  DEFAULTED_SORT_ORDER: { id: 7 },
  DEFAULTED_TIMESTAMP: { id: 7 },
  UNKNOWN_FIELDS_IGNORED: { set: 'subjects', fields: 'alfa, zeta' },
  MATERIALS_NOT_RESTORED: {},
  MEDIA_NOT_INCLUDED: {},
};

test('the catalog and the shared table agree: every warning code has a catalog text that fills exactly the params the emitter sends and says what the reserve says', () => {
  const problems = [];
  for (const code of IMPORT_WARNING_CODES) {
    const text = ptBR[`migration.warning.${code}`];
    if (typeof text !== 'string') { problems.push(`${code}: missing from the catalog`); continue; }
    const asked = new Set();
    const params = new Proxy({}, { get: (_, name) => { asked.add(name); return 1; } });
    const reserve = importWarningReserveText(code, params);
    const declared = new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    if ([...declared].sort().join() !== [...asked].sort().join()) problems.push(`${code}: catalog fills {${[...declared]}} but the emitter sends {${[...asked]}}`);
    if (reserve !== text.replace(/\{\w+\}/g, '1')) problems.push(`${code}: catalog text and reserve text differ`);
    if (!(code in SAMPLE)) problems.push(`${code}: no render sample in this test`);
  }
  assert.deepEqual(problems, []);
});

test('RENDER: each warning is shown from the catalog with its params, even when its own `message` says something else', () => {
  for (const code of IMPORT_WARNING_CODES) {
    const warning = { ...importWarning(code, SAMPLE[code]), message: 'TEXTO DO SERVIDOR' };
    const shown = warningText(warning);
    assert.equal(shown, t(`migration.warning.${code}`, SAMPLE[code]), code);
    assert.ok(!shown.includes('{') && !shown.includes('undefined') && shown !== 'TEXTO DO SERVIDOR', `${code}: "${shown}"`);
  }
  assert.equal(warningText(importWarning('DEFAULTED_COLOR', { id: 3 })), 'Disciplina 3 sem cor na origem — usando cor padrão.');
  assert.equal(warningText(importWarning('UNKNOWN_FIELDS_IGNORED', { set: 'exams', fields: 'a, b' }, { set: 'exams' })), 'Campos desconhecidos em exams foram ignorados: a, b.');
});

test('RENDER fallback: no params (preview stored by an older server), unknown code (newer server) or a bare string -> the warning\'s own text, never an empty line', () => {
  assert.equal(warningText({ code: 'DEFAULTED_COLOR', message: 'Disciplina 1 sem cor na origem — usando cor padrão.' }), 'Disciplina 1 sem cor na origem — usando cor padrão.');
  assert.equal(warningText({ code: 'SOMETHING_NEW', params: {}, message: 'Algo novo.' }), 'Algo novo.');
  assert.equal(warningText({ code: 'SOMETHING_NEW' }), 'SOMETHING_NEW');
  assert.equal(warningText('texto solto'), 'texto solto');
});

test('RENDER follows the interface language: a translated catalog wins, a key it lacks falls back to pt-BR (pseudo-locale)', () => {
  registerCatalog('en', { 'migration.warning.DEFAULTED_COLOR': '[en] Subject {id} has no color.' });
  try {
    setLocale('en');
    assert.equal(warningText(importWarning('DEFAULTED_COLOR', { id: 4 })), '[en] Subject 4 has no color.');
    assert.equal(warningText(importWarning('DEFAULTED_SORT_ORDER', { id: 4 })), 'Disciplina 4 sem ordem na origem — usando ordem 0.');
  } finally {
    registerCatalog('en', undefined);
    setLocale('pt-BR');
  }
});

test('NetworkError carries a stable code + params; its message is the catalog sentence filled with them (no text glued in code)', async () => {
  const err = await apiRequest('/v1/subjects').then(() => null, (e) => e);
  assert.ok(err instanceof NetworkError);
  assert.equal(err.code, 'NETWORK_ERROR');
  assert.deepEqual(err.params, { path: '/v1/subjects', reason: 'Failed to fetch' });
  assert.equal(err.message, 'Falha de rede ao acessar /v1/subjects: Failed to fetch');
  assert.equal(err.message, t('store.error.network', err.params));
});
