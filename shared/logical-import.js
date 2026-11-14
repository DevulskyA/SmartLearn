// IMPORT-1: validates and normalizes SmartLearn's OWN logical export
// (server/src/backup.js createLogicalExport, exportVersion 1) so a student can
// restore it into an empty account. Pure: no DB, no I/O, no clock — the same
// input always yields the same result or the same issue list.
//
// This is deliberately separate from shared/import-normalization.js, which
// understands the LEGACY local-app export (schemaVersion 1-3, camelCase,
// different shapes). A logical export is a set of raw database rows; the rules
// here mirror the database's own constraints (NOT NULL, enums, CHECKs, UNIQUEs,
// composite foreign keys) so a corrupt or hand-edited file is rejected whole,
// at preview time, with a readable reason — the transaction at commit time
// stays as defense in depth, not as the first line of validation.
//
// Out of scope by decision (IMPORT-1, option B): materials (PDFs, sources,
// pages, outline, proposals, drafts, citations) and competencies are not part
// of the export and are not restored; the preview says so explicitly.
import { ImportNormalizationError } from './import-normalization.js';
import { resolveSupportedLocale } from './locales.js';
import { importWarning } from './import-warnings.js';

const LOGICAL_EXPORT_VERSION = 1;

// Export key (camelCase) -> table, in dependency order: a row may only reference
// sets that come BEFORE it (learning_events also references earlier events).
const SET_TABLES = [
  ['subjects', 'subjects'],
  ['learningUnits', 'learning_units'],
  ['reviewTasks', 'review_tasks'],
  ['exercises', 'exercises'],
  ['exerciseVersions', 'exercise_versions'],
  ['learningEvidence', 'learning_evidence'],
  ['exerciseAttempts', 'exercise_attempts'],
  ['exerciseFlagEvents', 'exercise_flag_events'],
  ['learningEvents', 'learning_events'],
  ['exams', 'exams'],
  ['examItems', 'exam_items'],
  ['examEvidence', 'exam_evidence'],
];

const ASSISTANCE = ['NONE', 'HINT', 'PARTIAL_SOLUTION', 'SOLUTION'];
const ASSISTANCE_WITH_UNKNOWN = ['UNKNOWN', ...ASSISTANCE];

// col: { name, type: 'int'|'text'|'real', nullable, enum, default, min, ref }
// `ref` = [targetKey, nullable-aware]: the value must be the id of a row in that set.
const SPECS = {
  subjects: {
    hasId: true,
    cols: [
      { name: 'name', type: 'text', nonBlank: true },
      { name: 'color', type: 'text', default: 'DISC-BLUE' },
      { name: 'is_active', type: 'int', enum: [0, 1], default: 1 },
      { name: 'sort_order', type: 'int', default: 0 },
      { name: 'created_at', type: 'timestamp' },
      { name: 'updated_at', type: 'timestamp' },
    ],
  },
  learningUnits: {
    hasId: true,
    cols: [
      { name: 'subject_id', type: 'int', ref: 'subjects' },
      { name: 'title', type: 'text', nonBlank: true },
      { name: 'source_text', type: 'text', nullable: true },
      { name: 'source_kind', type: 'text', nullable: true, enum: ['APOSTILA', 'LIVRO', 'VIDEO', 'OUTRO'] }, // kind of material (migration 049); optional, older backups lack it
      { name: 'summary_body', type: 'text', nullable: true },
      { name: 'study_date', type: 'timestamp' },
      { name: 'lesson_date', type: 'timestamp', nullable: true }, // the day the class was given; optional, older backups simply lack it
      { name: 'created_at', type: 'timestamp' },
      { name: 'updated_at', type: 'timestamp' },
    ],
  },
  reviewTasks: {
    hasId: true,
    cols: [
      { name: 'unit_id', type: 'int', ref: 'learningUnits' },
      { name: 'offset_days', type: 'int' },
      { name: 'due_date', type: 'timestamp' },
      { name: 'completed_at', type: 'timestamp', nullable: true },
      { name: 'created_at', type: 'timestamp' },
    ],
  },
  exercises: {
    hasId: true,
    cols: [
      { name: 'unit_id', type: 'int', ref: 'learningUnits' },
      { name: 'order_index', type: 'int', default: 0 },
      { name: 'created_at', type: 'timestamp' },
      { name: 'updated_at', type: 'timestamp' },
      { name: 'archived_at', type: 'timestamp', nullable: true },
    ],
  },
  exerciseVersions: {
    hasId: true,
    cols: [
      { name: 'exercise_id', type: 'int', ref: 'exercises' },
      { name: 'question', type: 'text', nonBlank: true },
      { name: 'answer', type: 'text', nullable: true },
      { name: 'hint', type: 'text', nullable: true },
      { name: 'provenance', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamp' },
      { name: 'explanation', type: 'text', nullable: true },
      { name: 'question_type', type: 'text', nullable: true, enum: ['RECALL', 'CONCEPT', 'MECHANISM', 'APPLICATION', 'DISCRIMINATION', 'CLINICAL_REASONING', 'TRANSFER'] },
    ],
  },
  learningEvidence: {
    hasId: true,
    cols: [
      { name: 'unit_id', type: 'int', ref: 'learningUnits' },
      { name: 'review_task_id', type: 'int', ref: 'reviewTasks', nullable: true },
      { name: 'type', type: 'text', enum: ['REVIEW', 'INITIAL_PRACTICE', 'EXTERNAL'] },
      { name: 'questions_count', type: 'int', nullable: true },
      { name: 'correct_count', type: 'int', nullable: true },
      { name: 'evidence_date', type: 'timestamp' },
      { name: 'created_at', type: 'timestamp' },
    ],
  },
  exerciseAttempts: {
    hasId: true,
    cols: [
      { name: 'unit_id', type: 'int', ref: 'learningUnits' },
      // Competencies are not exported and never created by the product today:
      // a non-null value would be a dangling reference, so it is rejected whole.
      { name: 'competency_id', type: 'int', nullable: true, mustBeNull: true },
      { name: 'exercise_version_id', type: 'int', ref: 'exerciseVersions' },
      { name: 'status', type: 'text', enum: ['STARTED', 'SUBMITTED', 'ABANDONED'], default: 'STARTED' },
      { name: 'max_assistance', type: 'text', enum: ASSISTANCE, default: 'NONE' },
      { name: 'started_at', type: 'timestamp' },
      { name: 'submitted_at', type: 'timestamp', nullable: true },
      { name: 'review_task_id', type: 'int', ref: 'reviewTasks', nullable: true },
      { name: 'evidence_id', type: 'int', ref: 'learningEvidence', nullable: true },
    ],
  },
  exerciseFlagEvents: {
    hasId: true,
    cols: [
      { name: 'exercise_id', type: 'int', ref: 'exercises' },
      { name: 'attempt_id', type: 'int', ref: 'exerciseAttempts', nullable: true },
      { name: 'action', type: 'text', enum: ['FLAG', 'CLEAR'] },
      { name: 'reason', type: 'text', nullable: true, enum: ['CONFUSING_STATEMENT', 'DOUBTFUL_ANSWER_KEY', 'CONTENT_ERROR', 'OTHER'] },
      { name: 'comment', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamp' },
    ],
  },
  learningEvents: {
    hasId: true,
    cols: [
      { name: 'unit_id', type: 'int', ref: 'learningUnits' },
      { name: 'competency_id', type: 'int', nullable: true, mustBeNull: true },
      { name: 'attempt_id', type: 'int', ref: 'exerciseAttempts' },
      { name: 'exercise_version_id', type: 'int', ref: 'exerciseVersions' },
      { name: 'corrects_event_id', type: 'int', ref: 'learningEvents', nullable: true },
      { name: 'kind', type: 'text', enum: ['ATTEMPT', 'CORRECTION'] },
      { name: 'sequence', type: 'int' },
      { name: 'outcome', type: 'text', enum: ['CORRECT', 'INCORRECT', 'UNKNOWN'] },
      { name: 'assistance_available', type: 'text', enum: ASSISTANCE_WITH_UNKNOWN, default: 'UNKNOWN' },
      { name: 'assistance_used', type: 'text', enum: ASSISTANCE_WITH_UNKNOWN, default: 'UNKNOWN' },
      { name: 'assessment_method', type: 'text', enum: ['SELF_REPORT', 'AUTOMATIC'] },
      { name: 'provenance', type: 'text', enum: ['APP', 'IMPORT'], default: 'APP' },
      { name: 'schema_version', type: 'int', default: 1 },
      { name: 'occurred_at', type: 'timestamp' },
      { name: 'recorded_at', type: 'timestamp' },
      { name: 'confidence', type: 'real', nullable: true },
    ],
  },
  exams: {
    hasId: true,
    cols: [
      { name: 'unit_id', type: 'int', ref: 'learningUnits' },
      { name: 'status', type: 'text', enum: ['IN_PROGRESS', 'SUBMITTED', 'CORRECTED'] },
      { name: 'started_at', type: 'timestamp' },
      { name: 'submitted_at', type: 'timestamp', nullable: true },
      { name: 'corrected_at', type: 'timestamp', nullable: true },
      { name: 'evidence_id', type: 'int', ref: 'learningEvidence', nullable: true },
      { name: 'subject_id', type: 'int', ref: 'subjects', nullable: true },
    ],
  },
  examItems: {
    hasId: true,
    cols: [
      { name: 'exam_id', type: 'int', ref: 'exams' },
      { name: 'exercise_id', type: 'int', ref: 'exercises' },
      { name: 'exercise_version_id', type: 'int', ref: 'exerciseVersions' },
      { name: 'position', type: 'int' },
      { name: 'student_answer', type: 'text', nullable: true },
      { name: 'outcome', type: 'text', nullable: true, enum: ['CORRECT', 'INCORRECT'] },
    ],
  },
  examEvidence: {
    hasId: false,
    cols: [
      { name: 'exam_id', type: 'int', ref: 'exams' },
      { name: 'evidence_id', type: 'int', ref: 'learningEvidence' },
    ],
  },
};

/**
 * What a restore needs to insert each set generically: table, whether the row
 * has its own id, and each column with the set it references (null when none).
 */
export const LOGICAL_SETS = SET_TABLES.map(([key, table]) => ({
  key,
  table,
  hasId: SPECS[key].hasId,
  columns: SPECS[key].cols.map((c) => ({ name: c.name, ref: c.ref ?? null, nullable: Boolean(c.nullable) })),
}));

// SQLite's NOCASE folds ASCII only; mirror it exactly so "same name" means
// what the UNIQUE (user_id, name COLLATE NOCASE) index means.
function asciiFold(value) {
  return value.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function isTimestamp(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

function describe(set, index, row) {
  const id = row && typeof row === 'object' && 'id' in row ? ` (id ${row.id})` : '';
  return `${set}[${index}]${id}`;
}

/** True when the payload claims to be a SmartLearn logical export. */
export function isLogicalExport(raw) {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'exportVersion' in raw;
}

function columnTypeProblem(value, column) {
  if (column.type === 'int' && !Number.isInteger(value)) return ['INVALID_TYPE', `${column.name} deve ser inteiro.`];
  if (column.type === 'real' && (typeof value !== 'number' || !Number.isFinite(value))) return ['INVALID_TYPE', `${column.name} deve ser numérico.`];
  if (column.type === 'text' && typeof value !== 'string') return ['INVALID_TYPE', `${column.name} deve ser texto.`];
  if (column.type === 'timestamp' && !isTimestamp(value)) return ['INVALID_DATE', `${column.name} não é uma data válida.`];
  return null;
}

function columnConstraintProblem(value, column) {
  if (column.nonBlank && value.trim() === '') return ['BLANK_TEXT', `${column.name} está vazio.`];
  if (column.enum && !column.enum.includes(value)) return ['INVALID_ENUM', `${column.name} fora dos valores permitidos (${JSON.stringify(value)}).`];
  if (column.mustBeNull) return ['UNSUPPORTED_REFERENCE', `${column.name} referencia competências, que não fazem parte do backup.`];
  return null;
}

function normalizeColumnValue(row, column, where, issue) {
  let value = row[column.name];
  if (value === undefined) {
    if ('default' in column) value = column.default;
    else if (column.nullable) value = null;
  }
  if (value === null) {
    if (!column.nullable) { issue('NULL_NOT_ALLOWED', `${where}: ${column.name} não pode ser nulo.`); return { keep: false }; }
    return { keep: true, value: null };
  }
  if (value === undefined) { issue('MISSING_FIELD', `${where}: ${column.name} ausente.`); return { keep: false }; }
  const typeProblem = columnTypeProblem(value, column);
  if (typeProblem) { issue(typeProblem[0], `${where}: ${typeProblem[1]}`); return { keep: false }; }
  const constraintProblem = columnConstraintProblem(value, column);
  if (constraintProblem) { issue(constraintProblem[0], `${where}: ${constraintProblem[1]}`); return { keep: false }; }
  return { keep: true, value };
}

function normalizeLogicalRow(row, key, index, spec, ids, unknownColumns, issues) {
  const where = describe(key, index, row);
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    issues.push({ code: 'INVALID_ROW', message: `${where}: linha inválida.` });
    return null;
  }
  const issuesBefore = issues.length;
  const out = {};
  if (spec.hasId) {
    if (!Number.isInteger(row.id) || row.id < 1) { issues.push({ code: 'INVALID_ID', message: `${where}: id inválido.` }); return null; }
    if (ids.has(row.id)) { issues.push({ code: 'DUPLICATE_ID', message: `${where}: id duplicado.` }); return null; }
    ids.add(row.id);
    out.id = row.id;
  }
  for (const column of spec.cols) {
    const normalized = normalizeColumnValue(row, column, where, (code, message) => issues.push({ code, message }));
    if (normalized.keep) out[column.name] = normalized.value;
  }
  for (const name of Object.keys(row)) {
    // user_id is the exporting account's own key: never restored (rows get the new owner).
    if (name !== 'id' && name !== 'user_id' && !spec.cols.some((column) => column.name === name)) unknownColumns.add(name);
  }
  // A row with problems is reported and kept out of the cross-row checks below; its id still counts for references.
  return issues.length === issuesBefore ? out : null;
}

function normalizeLogicalSet(raw, key, issues, warnings) {
  const source = raw[key];
  if (source === undefined) {
    // Tables added after the first logical export are optional in older files; the core learning tables are not.
    const optional = ['exerciseAttempts', 'exerciseFlagEvents', 'learningEvents', 'exams', 'examItems', 'examEvidence'].includes(key);
    if (!optional) issues.push({ code: 'MISSING_SET', message: `Conjunto obrigatório ausente: ${key}.` });
    return { rows: [], ids: new Set() };
  }
  if (!Array.isArray(source)) {
    issues.push({ code: 'INVALID_SET', message: `${key} deve ser uma lista.` });
    return { rows: [], ids: new Set() };
  }
  const spec = SPECS[key];
  const rows = [];
  const ids = new Set();
  const unknownColumns = new Set();
  source.forEach((row, index) => {
    const normalized = normalizeLogicalRow(row, key, index, spec, ids, unknownColumns, issues);
    if (normalized) rows.push(normalized);
  });
  if (unknownColumns.size > 0) {
    warnings.push(importWarning('UNKNOWN_FIELDS_IGNORED', { set: key, fields: [...unknownColumns].sort().join(', ') }, { set: key }));
  }
  rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return { rows, ids };
}

function normalizeLogicalSets(raw, issues, warnings) {
  const sets = {};
  const idsBySet = {};
  for (const { key } of LOGICAL_SETS) {
    const normalized = normalizeLogicalSet(raw, key, issues, warnings);
    sets[key] = normalized.rows;
    idsBySet[key] = normalized.ids;
  }
  return { sets, idsBySet };
}

function validateSubjectNames(sets, issue) {
  const seenNames = new Map();
  for (const subject of sets.subjects) {
    const folded = asciiFold(subject.name);
    if (seenNames.has(folded)) issue('DUPLICATE_SUBJECT_NAME', `subjects (id ${subject.id}): nome repetido, igual ao da disciplina ${seenNames.get(folded)}.`);
    else seenNames.set(folded, subject.id);
  }
}

function validateEvidenceRows(sets, issue) {
  for (const evidence of sets.learningEvidence) {
    const where = `learningEvidence (id ${evidence.id})`;
    if (evidence.questions_count !== null && evidence.questions_count <= 0) issue('INVALID_COUNT', `${where}: questions_count deve ser maior que zero.`);
    if (evidence.correct_count !== null && (evidence.correct_count < 0 || evidence.questions_count === null || evidence.correct_count > evidence.questions_count)) {
      issue('INVALID_COUNT', `${where}: correct_count inconsistente com questions_count.`);
    }
  }
}

function validateLearningEvents(sets, issue) {
  const sequences = new Set();
  for (const event of sets.learningEvents) {
    const where = `learningEvents (id ${event.id})`;
    if (event.confidence !== null && (event.confidence < 0 || event.confidence > 1)) issue('INVALID_CONFIDENCE', `${where}: confidence fora de 0..1.`);
    const isCorrection = event.kind === 'CORRECTION';
    if (isCorrection !== (event.corrects_event_id !== null)) issue('INVALID_CORRECTION', `${where}: corrects_event_id só vale para kind CORRECTION.`);
    if (event.corrects_event_id !== null && event.corrects_event_id >= event.id) issue('INVALID_CORRECTION', `${where}: uma correção deve apontar para um evento anterior.`);
    const slot = `${event.attempt_id}:${event.sequence}`;
    if (sequences.has(slot)) issue('DUPLICATE_SEQUENCE', `${where}: sequência repetida na mesma tentativa.`);
    sequences.add(slot);
  }
}

function validateExerciseFlags(sets, issue) {
  for (const event of sets.exerciseFlagEvents) {
    const where = `exerciseFlagEvents (id ${event.id})`;
    const isFlag = event.action === 'FLAG';
    if (isFlag !== (event.reason !== null && event.attempt_id !== null)) issue('INVALID_FLAG_EVENT', `${where}:FLAG_REASON_ATTEMPT_CONSTRAINT`);
    if (!isFlag && event.comment !== null) issue('INVALID_FLAG_EVENT', `${where}:CLEAR_COMMENT_CONSTRAINT`);
  }
}

function validateExamItems(sets, issue) {
  const positions = new Set();
  for (const item of sets.examItems) {
    const where = `examItems (id ${item.id})`;
    if (item.position < 0) issue('INVALID_POSITION', `${where}: position não pode ser negativa.`);
    const slot = `${item.exam_id}:${item.position}`;
    if (positions.has(slot)) issue('DUPLICATE_POSITION', `${where}: posição repetida na mesma prova.`);
    positions.add(slot);
  }
}

function validateExamEvidence(sets, issue) {
  const pairs = new Set();
  for (const link of sets.examEvidence) {
    const slot = `${link.exam_id}:${link.evidence_id}`;
    if (pairs.has(slot)) issue('DUPLICATE_LINK', `examEvidence: vínculo repetido (prova ${link.exam_id}, evidência ${link.evidence_id}).`);
    pairs.add(slot);
  }
}

function validateLogicalTables(sets, issue) {
  // Table-level rules that mirror CHECK / UNIQUE constraints, in export validation order.
  validateSubjectNames(sets, issue);
  validateEvidenceRows(sets, issue);
  validateLearningEvents(sets, issue);
  validateExerciseFlags(sets, issue);
  validateExamItems(sets, issue);
  validateExamEvidence(sets, issue);
}

function validateReferenceColumn(key, column, sets, idsBySet, issue) {
  for (const row of sets[key]) {
    const value = row[column.name];
    if (value === null || value === undefined) continue;
    if (!idsBySet[column.ref].has(value)) {
      const label = row.id !== undefined ? `${key} (id ${row.id})` : `${key} (${column.name} ${value})`;
      issue('DANGLING_REFERENCE', `${label}: ${column.name} ${value} não existe em ${column.ref}.`);
    }
  }
}

function validateLogicalReferences(sets, idsBySet, issue) {
  // Referential integrity: every reference must resolve inside the file.
  for (const { key } of LOGICAL_SETS) {
    for (const column of SPECS[key].cols) {
      if (column.ref) validateReferenceColumn(key, column, sets, idsBySet, issue);
    }
  }
}

function normalizeSettingsLocales(rawSettings, issue) {
  const locales = {};
  for (const key of ['uiLocale', 'generationLocale']) {
    const value = rawSettings[key];
    if (value === undefined || value === null) { locales[key] = null; continue; }
    locales[key] = resolveSupportedLocale(value);
    if (locales[key] === null) issue('INVALID_SETTINGS', `settings.${key} não é um idioma suportado (${JSON.stringify(value)}).`);
  }
  return locales;
}

function normalizeSettingsObject(rawSettings, issue) {
  const { timezone, updatedAt } = rawSettings;
  if (typeof timezone !== 'string' || timezone.trim() === '') issue('INVALID_SETTINGS', 'settings.timezone ausente ou inválido.');
  if (updatedAt !== null && updatedAt !== undefined && !isTimestamp(updatedAt)) issue('INVALID_SETTINGS', 'settings.updatedAt inválido.');
  // The language the student CHOSE (null = not chosen yet; absent in exports older than migration 031). Never replaced by a near locale.
  const locales = normalizeSettingsLocales(rawSettings, issue);
  return { timezone: typeof timezone === 'string' ? timezone : null, updatedAt: updatedAt ?? null, ...locales };
}

function normalizeLogicalSettings(raw, issue) {
  const defaults = { timezone: null, updatedAt: null, uiLocale: null, generationLocale: null };
  if (raw.settings === undefined || raw.settings === null) {
    issue('INVALID_SETTINGS', 'settings ausente.');
    return defaults;
  }
  if (typeof raw.settings !== 'object' || Array.isArray(raw.settings)) {
    issue('INVALID_SETTINGS', 'settings deve ser um objeto.');
    return defaults;
  }
  return normalizeSettingsObject(raw.settings, issue);
}

/**
 * @param {object} raw parsed JSON of a logical export
 * @param {{ currentSchemaVersion: number }} options newest migration this server knows
 * @returns {{ exportVersion, schemaVersion, settings, sets, warnings }}
 *   `sets[key]` is an array of rows (database column names) sorted by id, with
 *   defaults applied and unknown columns dropped.
 * @throws {ImportNormalizationError} listing EVERY problem found, not the first.
 */
export function normalizeLogicalExport(raw, { currentSchemaVersion }) {
  const issues = [];
  const warnings = [];
  const issue = (code, message) => issues.push({ code, message });

  if (!isLogicalExport(raw)) {
    throw new ImportNormalizationError([{ code: 'NOT_A_LOGICAL_EXPORT', message: 'O arquivo não é uma exportação lógica do SmartLearn.' }]);
  }
  if (raw.exportVersion !== LOGICAL_EXPORT_VERSION) {
    throw new ImportNormalizationError([{
      code: 'UNSUPPORTED_EXPORT_VERSION',
      message: `Versão de exportação não suportada: ${JSON.stringify(raw.exportVersion)} (esperado ${LOGICAL_EXPORT_VERSION}).`,
    }]);
  }
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    issue('INVALID_SCHEMA_VERSION', 'schemaVersion ausente ou inválido.');
  } else if (raw.schemaVersion > currentSchemaVersion) {
    issue('SCHEMA_TOO_NEW', `O arquivo foi exportado por uma versão mais nova do SmartLearn (schema ${raw.schemaVersion}; este servidor entende até ${currentSchemaVersion}).`);
  }
  const { sets, idsBySet } = normalizeLogicalSets(raw, issues, warnings);
  validateLogicalTables(sets, issue);
  validateLogicalReferences(sets, idsBySet, issue);
  const settings = normalizeLogicalSettings(raw, issue);

  if (issues.length > 0) throw new ImportNormalizationError(issues);

  warnings.push(importWarning('MATERIALS_NOT_RESTORED'));
  if (Array.isArray(raw.notices) && raw.notices.some((n) => n?.code === 'MEDIA_NOT_INCLUDED')) {
    warnings.push(importWarning('MEDIA_NOT_INCLUDED'));
  }

  return {
    exportVersion: raw.exportVersion,
    schemaVersion: raw.schemaVersion,
    settings,
    sets,
    warnings,
  };
}
