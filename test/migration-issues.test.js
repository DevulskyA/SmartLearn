import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, setLocale } from '../src/i18n/index.js';
import ptBR from '../src/i18n/locales/pt-BR.js';
import ptMigration from '../src/i18n/locales/pt-BR/migration.js';
import enMigration from '../src/i18n/locales/en/migration.js';
import esMigration from '../src/i18n/locales/es/migration.js';

const ISSUE_CODES = [
  'INVALID_INPUT', 'UNSUPPORTED_VERSION', 'MISSING_ID', 'DUPLICATE_ID', 'INVALID_NAME',
  'DANGLING_SUBJECT_REF', 'DANGLING_UNIT_REF', 'INVALID_DATE', 'MISSING_TITLE', 'INVALID_PROVENANCE',
  'INVALID_COUNTS', 'INVALID_CONTEXT', 'MISSING_REVIEW_TASK_LINK', 'UNEXPECTED_REVIEW_TASK_LINK', 'DANGLING_REVIEW_TASK_REF',
  'MULTIPLE_EVIDENCE_FOR_TASK', 'MISSING_EVIDENCE_ROW', 'NOT_A_LOGICAL_EXPORT', 'UNSUPPORTED_EXPORT_VERSION',
  'INVALID_SCHEMA_VERSION', 'SCHEMA_TOO_NEW', 'INVALID_SETTINGS', 'INVALID_ID', 'INVALID_ROW', 'INVALID_SET',
  'MISSING_SET', 'DANGLING_REFERENCE', 'DUPLICATE_LINK', 'DUPLICATE_POSITION', 'DUPLICATE_SEQUENCE',
  'DUPLICATE_SUBJECT_NAME', 'INVALID_CONFIDENCE', 'INVALID_CORRECTION', 'INVALID_COUNT', 'INVALID_FLAG_EVENT',
  'INVALID_POSITION', 'MISSING_FIELD', 'NULL_NOT_ALLOWED', 'INVALID_TYPE', 'BLANK_TEXT', 'INVALID_ENUM', 'UNSUPPORTED_REFERENCE',
];

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let apiError;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
globalThis.fetch = async () => new Response(JSON.stringify({ error: apiError }), {
  status: 400,
  headers: { 'content-type': 'application/json' },
});

const { issueText, previewImport } = await import('../src/migration-ui.js');
const { apiRequest, ApiError } = await import('../src/api-client.js');

after(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  registerCatalog('en', undefined);
  registerCatalog('es', undefined);
  registerCatalog('pt-BR', ptBR);
  setLocale('pt-BR');
});

test('all enumerated import issue codes have translations and unknown fallback in each locale', () => {
  for (const catalog of [ptMigration, enMigration, esMigration]) {
    for (const code of ISSUE_CODES) assert.equal(typeof catalog[`migration.issue.${code}`], 'string', code);
    assert.equal(typeof catalog['migration.issue.unknown'], 'string');
  }
});

test('API details preserve issue codes and render translated text without using the Portuguese reserve', async () => {
  registerCatalog('en', enMigration);
  registerCatalog('es', esMigration);
  registerCatalog('pt-BR', { ...ptBR, ...ptMigration });

  setLocale('en');
  assert.equal(issueText({ code: 'MISSING_ID', message: 'Frase de reserva em português.' }), enMigration['migration.issue.MISSING_ID']);
  assert.equal(issueText({ code: 'FUTURE_CODE', message: 'Frase futura em português.' }), enMigration['migration.issue.unknown']);
  assert.equal(issueText({ message: 'Frase sem código em português.' }), enMigration['migration.issue.unknown']);
  registerCatalog('en', { ...enMigration, 'migration.issue.MISSING_ID': 'Record {id} is missing its original ID.' });
  assert.equal(issueText({ code: 'MISSING_ID', params: { id: 7 } }), 'Record 7 is missing its original ID.');
  registerCatalog('en', enMigration);

  apiError = {
    code: 'INVALID_SOURCE',
    message: 'Import inválido: Disciplina sem id de origem.',
    field: 'rawSource',
    requestId: 'migration-issue-request',
    msg: { code: 'IMPORT_TOO_LARGE', params: {} },
    details: { issues: [{ code: 'MISSING_ID', message: 'Disciplina sem id de origem.' }, { code: 'FUTURE_CODE', message: 'Frase futura em português.' }] },
  };
  const apiErrorResult = await apiRequest('/v1/imports/preview', { method: 'POST', body: {} }).catch((error) => error);
  assert.ok(apiErrorResult instanceof ApiError);
  assert.equal(apiErrorResult.status, 400);
  assert.equal(apiErrorResult.field, 'rawSource');
  assert.equal(apiErrorResult.requestId, 'migration-issue-request');
  assert.equal(apiErrorResult.msgCode, 'IMPORT_TOO_LARGE');
  assert.deepEqual(apiErrorResult.details, apiError.details);

  const result = await previewImport({});
  assert.equal(result.ok, false);
  assert.equal(result.message, `${enMigration['migration.issue.MISSING_ID']} ${enMigration['migration.issue.unknown']}`);
  assert.equal(result.details.issues[0].message, 'Disciplina sem id de origem.');
  assert.equal(result.details.issues[0].code, 'MISSING_ID');

  setLocale('es');
  assert.equal(issueText({ code: 'INVALID_SETTINGS', message: 'Configuración inválida.' }), esMigration['migration.issue.INVALID_SETTINGS']);
  assert.equal(issueText({ code: 'FUTURE_CODE', message: 'Frase futura en portugués.' }), esMigration['migration.issue.unknown']);
});
