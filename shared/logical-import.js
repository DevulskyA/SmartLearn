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

export const LOGICAL_EXPORT_VERSION = 1;

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
      { name: 'summary_body', type: 'text', nullable: true },
      { name: 'study_date', type: 'timestamp' },
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

  const sets = {};
  const idsBySet = {};

  for (const { key } of LOGICAL_SETS) {
    const spec = SPECS[key];
    const source = raw[key];
    if (source === undefined) {
      // Tables added after the first logical export are optional in older files;
      // the core learning tables are not.
      const optional = ['exerciseAttempts', 'learningEvents', 'exams', 'examItems', 'examEvidence'].includes(key);
      if (!optional) issue('MISSING_SET', `Conjunto obrigatório ausente: ${key}.`);
      sets[key] = [];
      idsBySet[key] = new Set();
      continue;
    }
    if (!Array.isArray(source)) {
      issue('INVALID_SET', `${key} deve ser uma lista.`);
      sets[key] = [];
      idsBySet[key] = new Set();
      continue;
    }

    const rows = [];
    const ids = new Set();
    const unknownColumns = new Set();
    source.forEach((row, index) => {
      const where = describe(key, index, row);
      if (row === null || typeof row !== 'object' || Array.isArray(row)) {
        issue('INVALID_ROW', `${where}: linha inválida.`);
        return;
      }
      const issuesBefore = issues.length;
      const out = {};
      if (spec.hasId) {
        if (!Number.isInteger(row.id) || row.id < 1) { issue('INVALID_ID', `${where}: id inválido.`); return; }
        if (ids.has(row.id)) { issue('DUPLICATE_ID', `${where}: id duplicado.`); return; }
        ids.add(row.id);
        out.id = row.id;
      }
      for (const col of spec.cols) {
        let value = row[col.name];
        if (value === undefined) {
          if ('default' in col) value = col.default;
          else if (col.nullable) value = null;
        }
        if (value === null) {
          if (!col.nullable) { issue('NULL_NOT_ALLOWED', `${where}: ${col.name} não pode ser nulo.`); continue; }
          out[col.name] = null;
          continue;
        }
        if (value === undefined) { issue('MISSING_FIELD', `${where}: ${col.name} ausente.`); continue; }
        if (col.type === 'int' && !Number.isInteger(value)) { issue('INVALID_TYPE', `${where}: ${col.name} deve ser inteiro.`); continue; }
        if (col.type === 'real' && (typeof value !== 'number' || !Number.isFinite(value))) { issue('INVALID_TYPE', `${where}: ${col.name} deve ser numérico.`); continue; }
        if (col.type === 'text' && typeof value !== 'string') { issue('INVALID_TYPE', `${where}: ${col.name} deve ser texto.`); continue; }
        if (col.type === 'timestamp' && !isTimestamp(value)) { issue('INVALID_DATE', `${where}: ${col.name} não é uma data válida.`); continue; }
        if (col.nonBlank && value.trim() === '') { issue('BLANK_TEXT', `${where}: ${col.name} está vazio.`); continue; }
        if (col.enum && !col.enum.includes(value)) { issue('INVALID_ENUM', `${where}: ${col.name} fora dos valores permitidos (${JSON.stringify(value)}).`); continue; }
        if (col.mustBeNull) { issue('UNSUPPORTED_REFERENCE', `${where}: ${col.name} referencia competências, que não fazem parte do backup.`); continue; }
        out[col.name] = value;
      }
      for (const name of Object.keys(row)) {
        // user_id is the exporting account's own key: never restored (rows get the new owner).
        if (name !== 'id' && name !== 'user_id' && !spec.cols.some((c) => c.name === name)) unknownColumns.add(name);
      }
      // A row with problems is reported and kept out of the cross-row checks below
      // (they assume well-typed values); its id still counts for reference resolution.
      if (issues.length === issuesBefore) rows.push(out);
    });
    if (unknownColumns.size > 0) {
      warnings.push({ code: 'UNKNOWN_FIELDS_IGNORED', set: key, message: `Campos desconhecidos em ${key} foram ignorados: ${[...unknownColumns].sort().join(', ')}.` });
    }
    rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    sets[key] = rows;
    idsBySet[key] = ids;
  }

  // ---- table-level rules that mirror CHECK / UNIQUE constraints ----
  const seenNames = new Map();
  for (const s of sets.subjects) {
    const folded = asciiFold(s.name);
    if (seenNames.has(folded)) issue('DUPLICATE_SUBJECT_NAME', `subjects (id ${s.id}): nome repetido, igual ao da disciplina ${seenNames.get(folded)}.`);
    else seenNames.set(folded, s.id);
  }
  for (const e of sets.learningEvidence) {
    const where = `learningEvidence (id ${e.id})`;
    if (e.questions_count !== null && e.questions_count <= 0) issue('INVALID_COUNT', `${where}: questions_count deve ser maior que zero.`);
    if (e.correct_count !== null) {
      if (e.correct_count < 0 || e.questions_count === null || e.correct_count > e.questions_count) {
        issue('INVALID_COUNT', `${where}: correct_count inconsistente com questions_count.`);
      }
    }
  }
  const sequences = new Set();
  for (const ev of sets.learningEvents) {
    const where = `learningEvents (id ${ev.id})`;
    if (ev.confidence !== null && (ev.confidence < 0 || ev.confidence > 1)) issue('INVALID_CONFIDENCE', `${where}: confidence fora de 0..1.`);
    const isCorrection = ev.kind === 'CORRECTION';
    if (isCorrection !== (ev.corrects_event_id !== null)) issue('INVALID_CORRECTION', `${where}: corrects_event_id só vale para kind CORRECTION.`);
    if (ev.corrects_event_id !== null && ev.corrects_event_id >= ev.id) issue('INVALID_CORRECTION', `${where}: uma correção deve apontar para um evento anterior.`);
    const slot = `${ev.attempt_id}:${ev.sequence}`;
    if (sequences.has(slot)) issue('DUPLICATE_SEQUENCE', `${where}: sequência repetida na mesma tentativa.`);
    sequences.add(slot);
  }
  const positions = new Set();
  for (const item of sets.examItems) {
    const where = `examItems (id ${item.id})`;
    if (item.position < 0) issue('INVALID_POSITION', `${where}: position não pode ser negativa.`);
    const slot = `${item.exam_id}:${item.position}`;
    if (positions.has(slot)) issue('DUPLICATE_POSITION', `${where}: posição repetida na mesma prova.`);
    positions.add(slot);
  }
  const pairs = new Set();
  for (const link of sets.examEvidence) {
    const slot = `${link.exam_id}:${link.evidence_id}`;
    if (pairs.has(slot)) issue('DUPLICATE_LINK', `examEvidence: vínculo repetido (prova ${link.exam_id}, evidência ${link.evidence_id}).`);
    pairs.add(slot);
  }

  // ---- referential integrity: every reference must resolve inside the file ----
  for (const { key } of LOGICAL_SETS) {
    for (const col of SPECS[key].cols) {
      if (!col.ref) continue;
      for (const row of sets[key]) {
        const value = row[col.name];
        if (value === null || value === undefined) continue;
        if (!idsBySet[col.ref].has(value)) {
          const label = row.id !== undefined ? `${key} (id ${row.id})` : `${key} (${col.name} ${value})`;
          issue('DANGLING_REFERENCE', `${label}: ${col.name} ${value} não existe em ${col.ref}.`);
        }
      }
    }
  }

  // ---- settings: only the timezone is user-editable; the schedule is fixed ----
  let settings = { timezone: null, updatedAt: null };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (typeof raw.settings !== 'object' || Array.isArray(raw.settings)) {
      issue('INVALID_SETTINGS', 'settings deve ser um objeto.');
    } else {
      const { timezone, updatedAt } = raw.settings;
      if (typeof timezone !== 'string' || timezone.trim() === '') issue('INVALID_SETTINGS', 'settings.timezone ausente ou inválido.');
      if (updatedAt !== null && updatedAt !== undefined && !isTimestamp(updatedAt)) issue('INVALID_SETTINGS', 'settings.updatedAt inválido.');
      settings = { timezone: typeof timezone === 'string' ? timezone : null, updatedAt: updatedAt ?? null };
    }
  } else {
    issue('INVALID_SETTINGS', 'settings ausente.');
  }

  if (issues.length > 0) throw new ImportNormalizationError(issues);

  warnings.push({
    code: 'MATERIALS_NOT_RESTORED',
    message: 'Materiais não são restaurados: PDFs, fontes, páginas, propostas, rascunhos e as citações de origem ficam de fora deste backup. Seus estudos, revisões, exercícios, tentativas e provas serão restaurados.',
  });

  return {
    exportVersion: raw.exportVersion,
    schemaVersion: raw.schemaVersion,
    settings,
    sets,
    warnings,
  };
}
