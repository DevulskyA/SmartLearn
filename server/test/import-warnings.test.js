import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeLegacyExport } from '../../shared/import-normalization.js';
import { normalizeLogicalExport } from '../../shared/logical-import.js';
import { IMPORT_WARNING_CODES, importWarning, importWarningReserveText } from '../../shared/import-warnings.js';

// Warnings of the import preview are a stable CODE + PARAMS contract (the client renders migration.warning.<CODE> from the catalog);
// `message` stays as the Portuguese reserve for older consumers. One test per warning the code can emit. Client side of the
// contract (catalog agrees with this table, rendering): test/import-warnings.test.js.

const OPTS = { currentSchemaVersion: 29 };
const T = '2026-03-01T10:00:00.000Z';
const legacy = () => JSON.parse(readFileSync(fileURLToPath(new URL('./import-fixtures/v1-legacy.json', import.meta.url)), 'utf8'));
const logical = () => ({
  exportVersion: 1,
  exportedAt: T,
  schemaVersion: 29,
  user: { id: 1, email: 'a@example.com', createdAt: T },
  settings: { timezone: 'America/Sao_Paulo', reviewSchedule: [1, 2], updatedAt: null },
  subjects: [{ id: 1, user_id: 1, name: 'Farmacologia', color: 'DISC-GREEN', is_active: 1, sort_order: 0, created_at: T, updated_at: T }],
  learningUnits: [],
  reviewTasks: [],
  exercises: [],
  exerciseVersions: [],
  learningEvidence: [],
});

test('DEFAULTED_COLOR: code + params {id}, with the reserve sentence', () => {
  const warning = normalizeLegacyExport(legacy()).warnings.find((w) => w.code === 'DEFAULTED_COLOR');
  assert.deepEqual(warning, { code: 'DEFAULTED_COLOR', params: { id: 1 }, message: 'Disciplina 1 sem cor na origem — usando cor padrão.' });
});

test('DEFAULTED_SORT_ORDER: code + params {id}', () => {
  const raw = legacy();
  delete raw.subjects[0].sort_order;
  const warning = normalizeLegacyExport(raw).warnings.find((w) => w.code === 'DEFAULTED_SORT_ORDER');
  assert.deepEqual(warning, { code: 'DEFAULTED_SORT_ORDER', params: { id: 1 }, message: 'Disciplina 1 sem ordem na origem — usando ordem 0.' });
});

test('DEFAULTED_TIMESTAMP: code + params {id} of the unit', () => {
  const raw = legacy();
  delete raw.studyRecords[0].created_at;
  delete raw.studyRecords[0].updated_at;
  const warning = normalizeLegacyExport(raw).warnings.find((w) => w.code === 'DEFAULTED_TIMESTAMP');
  assert.deepEqual(warning, { code: 'DEFAULTED_TIMESTAMP', params: { id: 1 }, message: 'Unidade 1 sem createdAt/updatedAt na origem — usando a data de estudo.' });
});

test('UNKNOWN_FIELDS_IGNORED: code + params {set, fields} (fields sorted, user_id never listed); `set` stays at the top level', () => {
  const raw = logical();
  raw.subjects[0].zeta = 1;
  raw.subjects[0].alfa = 2;
  const warning = normalizeLogicalExport(raw, OPTS).warnings.find((w) => w.code === 'UNKNOWN_FIELDS_IGNORED');
  assert.deepEqual(warning, {
    code: 'UNKNOWN_FIELDS_IGNORED',
    set: 'subjects',
    params: { set: 'subjects', fields: 'alfa, zeta' },
    message: 'Campos desconhecidos em subjects foram ignorados: alfa, zeta.',
  });
});

test('MATERIALS_NOT_RESTORED: always present in a logical restore, code + empty params', () => {
  const warning = normalizeLogicalExport(logical(), OPTS).warnings.find((w) => w.code === 'MATERIALS_NOT_RESTORED');
  assert.deepEqual(warning.params, {});
  assert.deepEqual(Object.keys(warning).sort(), ['code', 'message', 'params']);
  assert.match(warning.message, /^Materiais não são restaurados: PDFs,/);
});

test('MEDIA_NOT_INCLUDED: only when the export announces it, code + empty params', () => {
  assert.ok(!normalizeLogicalExport(logical(), OPTS).warnings.some((w) => w.code === 'MEDIA_NOT_INCLUDED'));
  const raw = logical();
  raw.notices = [{ code: 'MEDIA_NOT_INCLUDED', figures: 2, message: 'x' }];
  const warning = normalizeLogicalExport(raw, OPTS).warnings.find((w) => w.code === 'MEDIA_NOT_INCLUDED');
  assert.deepEqual(warning.params, {});
  assert.match(warning.message, /^Este arquivo foi exportado sem as imagens dos resumos/);
});

test('the six codes are exactly the ones the emitters produce; an unknown code is refused instead of inventing a sentence', () => {
  assert.deepEqual([...IMPORT_WARNING_CODES].sort(), ['DEFAULTED_COLOR', 'DEFAULTED_SORT_ORDER', 'DEFAULTED_TIMESTAMP', 'MATERIALS_NOT_RESTORED', 'MEDIA_NOT_INCLUDED', 'UNKNOWN_FIELDS_IGNORED']);
  assert.throws(() => importWarning('SOMETHING_NEW'), /unknown import warning code/);
  assert.throws(() => importWarningReserveText('SOMETHING_NEW'), /unknown import warning code/);
});

test('params survive JSON (the preview is stored and sent as JSON) unchanged', () => {
  const warnings = normalizeLegacyExport(legacy()).warnings;
  assert.deepEqual(JSON.parse(JSON.stringify(warnings)), warnings);
});
