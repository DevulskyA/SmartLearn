import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { getReviewScoreValues } from "./review-score.js";
import { SCHEDULE_OFFSETS as REVIEW_SCHEDULE } from "./scheduler.js";
// Canonical DDL — single source of truth shared with Rust sensor (src-tauri/src/lib.rs)
import schemaDdl from "./schema-statements.json" with { type: "json" };
// Canonical migration plan — shared with Rust integration test; neither may duplicate these SQL strings.
import migrationPlan from "./migration-main-to-vnext.json" with { type: "json" };

const DATABASE_URL = "sqlite:smartlearn.db";
const SCHEMA_VERSION = 3;

let database;
let initialization;
let browserStore;

// DDL from schema-statements.json + the parameterized INSERT (handled separately in init())
// BOUNDARY: exercises store pedagogy (questions/answers/hints/provenance).
// Evidence of study and review outcomes belong in learning_units and review_tasks.
// hint_text is pedagogical context only — never citation or provenance data.
// VNEXT_DOMAIN_EXTENSION: learning_evidence ledger (longitudinal performance, separate from review_tasks agenda)
// Bootstrap tracking — NOT cleared by importAll or clearAll.
// id=1 singleton; dev_seed_version present = DEV seed already ran.
// Separates "fresh DB" from "user deleted all their subjects".
const schemaStatements = [
  ...schemaDdl,
  "INSERT OR IGNORE INTO settings (key, app_version, review_schedule)\n    VALUES ('main', '2.0.0', $1)",
];

function nowIso() {
  return new Date().toISOString();
}

function localDateIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function requireDatabase() {
  if (!database) {
    throw new Error("O banco ainda não foi inicializado. Execute DB.init() primeiro.");
  }

  return database;
}

function validateProvenance(provenance) {
  if (!provenance || !['MANUAL', 'SOURCE', 'AI_GENERATED'].includes(provenance)) {
    throw new Error(
      'provenance é obrigatório e deve ser MANUAL, SOURCE ou AI_GENERATED. Recebido: ' +
      JSON.stringify(provenance),
    );
  }
}

function mapSubject(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? 'DISC-BLUE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order ?? 0,
  };
}

function mapUsageCount(row, key) {
  return Number(row?.[key] ?? 0) || 0;
}

function mapLearningUnit(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    sourceText: row.source_text ?? '',
    studyDate: row.study_date,
    title: row.title,
    summaryBody: row.summary_body ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReviewTask(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    reviewNumber: row.review_number,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    reviewDone: Boolean(row.review_done),
    questionsDone: Boolean(row.questions_done),
    questionsCount: row.questions_count,
    correctCount: row.correct_count,
    scorePercent: row.score_percent,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettings(row) {
  if (!row) return null;

  return {
    key: row.key,
    appVersion: row.app_version,
    reviewSchedule: JSON.parse(row.review_schedule || '[]'),
    lastBackupAt: row.last_backup_at,
  };
}

// BOUNDARY: exercises store pedagogy (questions/answers/hints/provenance).
// Evidence of study and review outcomes belong in learning_units and review_tasks.
// hint_text is pedagogical context only — never citation or provenance data.
function mapExercise(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    questionText: row.question_text,
    answerText: row.answer_text,
    hintText: row.hint_text ?? null,
    position: row.position ?? 0,
    provenance: row.provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLearningEvidence(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    evidenceDate: row.evidence_date,
    context: row.context,
    questionsCount: row.questions_count,
    correctCount: row.correct_count,
    scorePercent: row.score_percent,
    reviewTaskId: row.review_task_id ?? null,
    createdAt: row.created_at,
  };
}

function validateEvidenceContext(context) {
  if (!['INITIAL_PRACTICE', 'REVIEW', 'EXTERNAL'].includes(context)) {
    throw new Error('context deve ser INITIAL_PRACTICE, REVIEW ou EXTERNAL. Recebido: ' + JSON.stringify(context));
  }
}

function calcScorePercent(questionsCount, correctCount) {
  if (questionsCount == null || correctCount == null) return null;
  const q = Number(questionsCount);
  const c = Number(correctCount);
  if (!Number.isFinite(q) || !Number.isFinite(c) || q <= 0) return null;
  return (c / q) * 100;
}

function normalizeEntityName(name, label) {
  const normalized = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new Error('Informe ' + label + '.');
  return normalized;
}

async function assertActiveSubject(subjectId) {
  const [subject] = await requireDatabase().select(
    'SELECT id FROM subjects WHERE id = $1 AND is_active = 1',
    [subjectId],
  );
  if (!subject) {
    throw new Error('Selecione uma disciplina ativa.');
  }
}

async function getNextSortOrder(tableName) {
  const query = 'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM ' + tableName;
  const [{ next_order: nextOrder = 0 } = {}] = await requireDatabase().select(query);
  return nextOrder;
}

async function ensureNamedRows(tableName, names, label) {
  const timestamp = nowIso();
  let nextSortOrder = await getNextSortOrder(tableName);

  for (const name of names) {
    const normalized = normalizeEntityName(name, label);
    const query = 'SELECT id FROM ' + tableName + ' WHERE name = $1 COLLATE NOCASE';
    const [existing] = await requireDatabase().select(query, [normalized]);
    if (existing) continue;

    await requireDatabase().execute(
      'INSERT INTO ' + tableName + ' (name, created_at, updated_at, is_active, sort_order) VALUES ($1, $2, $3, 1, $4)',
      [normalized, timestamp, timestamp, nextSortOrder],
    );
    nextSortOrder += 1;
  }
}

function migrateV1ImportData(data) {
  if (data.schemaVersion != null || !Array.isArray(data.studyRecords)) {
    return data;
  }
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const sourceMap = new Map(sources.map((s) => [s.id, s.name ?? '']));
  const learningUnits = data.studyRecords.map((sr) => ({
    id: sr.id,
    subjectId: sr.subject_id ?? sr.subjectId,
    sourceText: sourceMap.get(sr.source_id ?? sr.sourceId) ?? sr.source_text ?? sr.sourceText ?? '',
    studyDate: sr.study_date ?? sr.studyDate,
    title: sr.content ?? sr.title ?? '',
    summaryBody: sr.summary_body ?? sr.summaryBody ?? null,
    createdAt: sr.created_at ?? sr.createdAt,
    updatedAt: sr.updated_at ?? sr.updatedAt,
  }));
  const reviewTasks = (Array.isArray(data.reviewTasks) ? data.reviewTasks : []).map((rt) => ({
    ...rt,
    unitId: rt.study_record_id ?? rt.studyRecordId ?? rt.unit_id ?? rt.unitId,
  }));
  return {
    schemaVersion: 1,
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    learningUnits,
    reviewTasks,
    exercises: [],
    learningEvidence: [],
    settings: data.settings ?? [],
  };
}

function isValidIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
}

function validateImportContent(normalized) {
  const subjectIds = new Set();
  for (const s of normalized.subjects) {
    if (s.id == null) throw new Error('Backup inválido: subject sem id.');
    if (!s.name || typeof s.name !== 'string' || !s.name.trim()) throw new Error('Backup inválido: subject sem name.');
    if (subjectIds.has(s.id)) throw new Error('Backup inválido: subject id duplicado: ' + s.id);
    subjectIds.add(s.id);
  }

  const unitIds = new Set();
  for (const u of normalized.learningUnits) {
    if (u.id == null) throw new Error('Backup inválido: learningUnit sem id.');
    if (!subjectIds.has(u.subjectId ?? u.subject_id)) throw new Error('Backup inválido: learningUnit ' + u.id + ' referencia subject inexistente: ' + (u.subjectId ?? u.subject_id));
    if (!isValidIsoDate(u.studyDate ?? u.study_date)) throw new Error('Backup inválido: learningUnit ' + u.id + ' tem studyDate inválida.');
    if (!(u.title ?? u.content ?? '').trim()) throw new Error('Backup inválido: learningUnit ' + u.id + ' sem title.');
    if (unitIds.has(u.id)) throw new Error('Backup inválido: learningUnit id duplicado: ' + u.id);
    unitIds.add(u.id);
  }

  const taskIds = new Set();
  const taskUnitMap = new Map();
  for (const t of normalized.reviewTasks) {
    if (t.id == null) throw new Error('Backup inválido: reviewTask sem id.');
    const unitId = t.unitId ?? t.unit_id;
    if (!unitIds.has(unitId)) throw new Error('Backup inválido: reviewTask ' + t.id + ' referencia unit inexistente: ' + unitId);
    if (!isValidIsoDate(t.dueDate ?? t.due_date)) throw new Error('Backup inválido: reviewTask ' + t.id + ' tem dueDate inválida.');
    if (taskIds.has(t.id)) throw new Error('Backup inválido: reviewTask id duplicado: ' + t.id);
    taskIds.add(t.id);
    taskUnitMap.set(t.id, unitId);
    const q = t.questionsCount ?? t.questions_count;
    const c = t.correctCount ?? t.correct_count;
    if (q != null && Number(q) < 0) throw new Error('Backup inválido: reviewTask ' + t.id + ' tem questionsCount negativo.');
    if (c != null && q == null) throw new Error('Backup inválido: reviewTask ' + t.id + ' tem correctCount sem questionsCount.');
    if (q != null && c != null && Number(c) > Number(q)) throw new Error('Backup inválido: reviewTask ' + t.id + ' tem correctCount > questionsCount.');
  }

  for (const e of (Array.isArray(normalized.exercises) ? normalized.exercises : [])) {
    if (e.id == null) throw new Error('Backup inválido: exercise sem id.');
    const unitId = e.unitId ?? e.unit_id;
    if (!unitIds.has(unitId)) throw new Error('Backup inválido: exercise ' + e.id + ' referencia unit inexistente: ' + unitId);
    if (e.provenance && !['MANUAL', 'SOURCE', 'AI_GENERATED'].includes(e.provenance)) {
      throw new Error('Backup inválido: exercise ' + e.id + ' tem provenance inválida: ' + e.provenance);
    }
  }

  const evidenceTaskIds = new Set();
  for (const ev of (Array.isArray(normalized.learningEvidence) ? normalized.learningEvidence : [])) {
    const unitId = ev.unitId ?? ev.unit_id;
    if (!unitIds.has(unitId)) throw new Error('Backup inválido: learningEvidence referencia unit inexistente: ' + unitId);
    const context = ev.context;
    if (!['INITIAL_PRACTICE', 'REVIEW', 'EXTERNAL'].includes(context)) {
      throw new Error('Backup inválido: learningEvidence tem context inválido: ' + context);
    }
    const q = Number(ev.questionsCount ?? ev.questions_count);
    const c = Number(ev.correctCount ?? ev.correct_count);
    if (!Number.isFinite(q) || q <= 0) throw new Error('Backup inválido: learningEvidence questionsCount deve ser positivo.');
    if (!Number.isFinite(c) || c < 0 || c > q) throw new Error('Backup inválido: learningEvidence correctCount fora do intervalo [0, questionsCount].');
    const reviewTaskId = ev.reviewTaskId ?? ev.review_task_id ?? null;
    if (context === 'REVIEW' && reviewTaskId == null) throw new Error('Backup inválido: learningEvidence REVIEW requer reviewTaskId.');
    if (context !== 'REVIEW' && reviewTaskId != null) throw new Error('Backup inválido: learningEvidence ' + context + ' não pode ter reviewTaskId.');
    if (reviewTaskId != null) {
      if (!taskIds.has(reviewTaskId)) throw new Error('Backup inválido: learningEvidence referencia reviewTask inexistente: ' + reviewTaskId);
      if (taskUnitMap.get(reviewTaskId) !== unitId) throw new Error('Backup inválido: learningEvidence REVIEW tem reviewTask de unidade diferente.');
      if (evidenceTaskIds.has(reviewTaskId)) throw new Error('Backup inválido: reviewTask ' + reviewTaskId + ' tem mais de uma learningEvidence (conflito).');
      evidenceTaskIds.add(reviewTaskId);
    }
    if (!isValidIsoDate(ev.evidenceDate ?? ev.evidence_date)) throw new Error('Backup inválido: learningEvidence tem evidenceDate inválida.');
  }
}

function assertImportData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('O backup precisa ser um objeto JSON válido.');
  }
  const normalized = migrateV1ImportData(data);
  const version = normalized.schemaVersion;
  const MIN_VERSION = 1;
  if (version == null || version < MIN_VERSION || version > SCHEMA_VERSION) {
    throw new Error(
      'Backup incompatível. schemaVersion não suportado: ' + version +
      '. Versão esperada entre ' + MIN_VERSION + ' e ' + SCHEMA_VERSION + '.',
    );
  }
  for (const key of ['subjects', 'learningUnits', 'reviewTasks']) {
    if (!Array.isArray(normalized[key])) {
      throw new Error(
        'O backup não contém a lista obrigatória "' + key + '".',
      );
    }
  }
  validateImportContent(normalized);
  return normalized;
}

function buildClearStatements() {
  return [
    { query: 'DELETE FROM learning_evidence', values: [] },
    { query: 'DELETE FROM exercises', values: [] },
    { query: 'DELETE FROM review_tasks', values: [] },
    { query: 'DELETE FROM learning_units', values: [] },
    { query: 'DELETE FROM subjects', values: [] },
    { query: 'DELETE FROM settings', values: [] },
    {
      query: "INSERT INTO settings (key, app_version, review_schedule, last_backup_at)\n        VALUES ('main', '2.0.0', $1, NULL)",
      values: [JSON.stringify(REVIEW_SCHEDULE)],
    },
  ];
}

function buildImportStatements(data) {
  const statements = [
    { query: 'DELETE FROM learning_evidence', values: [] },
    { query: 'DELETE FROM exercises', values: [] },
    { query: 'DELETE FROM review_tasks', values: [] },
    { query: 'DELETE FROM learning_units', values: [] },
    { query: 'DELETE FROM subjects', values: [] },
    { query: 'DELETE FROM settings', values: [] },
  ];

  for (const row of data.subjects) {
    statements.push({
      query: 'INSERT INTO subjects (id, name, created_at, updated_at, is_active, sort_order, color)\n        VALUES ($1, $2, $3, $4, $5, $6, $7)',
      values: [
        row.id,
        normalizeEntityName(row.name, 'o nome da disciplina'),
        row.createdAt,
        row.updatedAt,
        (row.isActive ?? row.is_active ?? true) ? 1 : 0,
        row.sortOrder ?? row.sort_order ?? 0,
        row.color ?? 'DISC-BLUE',
      ],
    });
  }

  for (const row of data.learningUnits) {
    statements.push({
      query: 'INSERT INTO learning_units\n        (id, subject_id, source_text, study_date, title, summary_body, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      values: [
        row.id,
        row.subjectId ?? row.subject_id,
        row.sourceText ?? row.source_text ?? '',
        row.studyDate ?? row.study_date,
        row.title,
        row.summaryBody ?? row.summary_body ?? null,
        row.createdAt ?? row.created_at,
        row.updatedAt ?? row.updated_at,
      ],
    });
  }

  for (const row of data.reviewTasks) {
    statements.push({
      query: 'INSERT INTO review_tasks\n        (id, unit_id, review_number, due_date, completed_at,\n         review_done, questions_done, questions_count, correct_count,\n         score_percent, comment, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
      values: [
        row.id, row.unitId ?? row.unit_id, row.reviewNumber ?? row.review_number,
        row.dueDate ?? row.due_date, row.completedAt ?? null,
        row.reviewDone ? 1 : 0, row.questionsDone ? 1 : 0,
        row.questionsCount ?? null, row.correctCount ?? null, row.scorePercent ?? null,
        row.comment ?? null, row.createdAt, row.updatedAt,
      ],
    });
  }

  for (const row of (Array.isArray(data.exercises) ? data.exercises : [])) {
    statements.push({
      query: 'INSERT INTO exercises\n        (id, unit_id, question_text, answer_text, hint_text, position, provenance, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      values: [
        row.id,
        row.unitId ?? row.unit_id,
        row.questionText ?? row.question_text ?? "",
        row.answerText ?? row.answer_text ?? "",
        row.hintText ?? row.hint_text ?? null,
        row.position ?? 0,
        row.provenance,
        row.createdAt ?? row.created_at ?? new Date().toISOString(),
        row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
      ],
    });
  }

  // Import explicit learning_evidence rows (v3 backups only)
  for (const row of (Array.isArray(data.learningEvidence) ? data.learningEvidence : [])) {
    if (!row.questionsCount || Number(row.questionsCount) <= 0) continue;
    statements.push({
      query: 'INSERT INTO learning_evidence\n        (id, unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      values: [
        row.id,
        row.unitId ?? row.unit_id,
        row.evidenceDate ?? row.evidence_date,
        row.context,
        row.questionsCount ?? row.questions_count,
        row.correctCount ?? row.correct_count,
        row.scorePercent ?? row.score_percent ?? null,
        row.reviewTaskId ?? row.review_task_id ?? null,
        row.createdAt ?? row.created_at ?? new Date().toISOString(),
      ],
    });
  }

  // For v2 backups: migrate completed review_tasks with questions into learning_evidence
  if ((data.schemaVersion ?? 0) < 3) {
    const unitsMap = new Map((data.learningUnits ?? []).map((u) => [u.id, u]));
    for (const task of (data.reviewTasks ?? [])) {
      const q = task.questionsCount ?? task.questions_count;
      const c = task.correctCount ?? task.correct_count;
      if (!task.review_done && !task.reviewDone) continue;
      if (!task.questions_done && !task.questionsDone) continue;
      if (q == null || Number(q) <= 0) continue;
      const taskId = task.id;
      const unitId = task.unitId ?? task.unit_id;
      const unit = unitsMap.get(unitId);
      if (!unit) continue;
      const evidenceDate = (task.completedAt ?? task.completed_at ?? task.dueDate ?? task.due_date ?? '').slice(0, 10);
      if (!evidenceDate) continue;
      const scorePercent = c != null ? (Number(c) / Number(q)) * 100 : null;
      statements.push({
        query: 'INSERT OR IGNORE INTO learning_evidence\n          (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at)\n          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        values: [
          unitId,
          evidenceDate,
          'REVIEW',
          Number(q),
          c != null ? Number(c) : 0,
          scorePercent,
          taskId,
          task.completedAt ?? task.completed_at ?? new Date().toISOString(),
        ],
      });
    }
  }

  const settings = (Array.isArray(data.settings) ? data.settings[0] : data.settings) ?? {};
  statements.push({
    query: "INSERT INTO settings (key, app_version, review_schedule, last_backup_at)\n      VALUES ('main', $1, $2, $3)",
    values: [
      settings.appVersion ?? '2.0.0',
      JSON.stringify(settings.reviewSchedule ?? REVIEW_SCHEDULE),
      settings.lastBackupAt ?? null,
    ],
  });

  return statements;
}

function hasTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__?.invoke);
}

function createBrowserStore() {
  const STORAGE_KEY = "smartlearn:browser-db";
  const defaultSettings = {
    key: "main",
    appVersion: "2.0.0",
    reviewSchedule: REVIEW_SCHEDULE,
    lastBackupAt: null,
  };

  function emptyState() {
    return {
      subjects: [],
      learningUnits: [],
      reviewTasks: [],
      exercises: [],
      learningEvidence: [],
      settings: defaultSettings,
      nextIds: {
        subjects: 1,
        learningUnits: 1,
        reviewTasks: 1,
        exercises: 1,
        learningEvidence: 1,
      },
    };
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const state = parsed && typeof parsed === "object" ? { ...emptyState(), ...parsed } : emptyState();
      refreshNextIds(state);
      return state;
    } catch {
      return emptyState();
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nextId(state, collection) {
    const id = state.nextIds[collection] ?? 1;
    state.nextIds[collection] = id + 1;
    return id;
  }

  function sortByOrderAndName(a, b) {
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "pt-BR");
  }

  function normalizeUniqueName(items, name, label, currentId = null) {
    const value = normalizeEntityName(name, label);
    const duplicate = items.some(
      (item) => item.id !== currentId && item.name.localeCompare(value, "pt-BR", { sensitivity: "accent" }) === 0,
    );
    if (duplicate) throw new Error("unique constraint");
    return value;
  }

  function assertActive(items, id, message) {
    if (!items.some((item) => item.id === id && item.isActive)) {
      throw new Error(message);
    }
  }

  function mapEntityForImport(row, state, collection, label) {
    return {
      id: row.id,
      name: normalizeEntityName(row.name, label),
      createdAt: row.createdAt ?? row.created_at ?? nowIso(),
      updatedAt: row.updatedAt ?? row.updated_at ?? nowIso(),
      isActive: row.isActive ?? row.is_active ?? true,
      sortOrder: row.sortOrder ?? row.sort_order ?? state[collection].length,
    };
  }

  function refreshNextIds(state) {
    for (const collection of ["subjects", "learningUnits", "reviewTasks", "exercises", "learningEvidence"]) {
      const ids = (state[collection] ?? []).map((item) => Number(item.id) || 0);
      state.nextIds[collection] = Math.max(0, ...ids) + 1;
    }
  }

  const store = {
    async init() {
      const state = readState();
      writeState(state);
      // DEV-only seed: uses a separate key so importAll/clearAll never resets it.
      // Production build: import.meta.env.DEV = false → this block never runs.
      // Guard: only seed when BrowserStore has no subjects — never overwrite existing user data.
      if (import.meta.env?.DEV && !localStorage.getItem('smartlearn:dev-seeded')) {
        if (state.subjects.length === 0) {
          const { getDevDataset } = await import('./fixtures/dev-dataset.js');
          await this.importAll(getDevDataset());
        }
        localStorage.setItem('smartlearn:dev-seeded', '1');
      }
    },

    subjects: {
      async ensureColumns() {},
      async getAll() {
        return [...readState().subjects].sort(sortByOrderAndName);
      },
      async getActive() {
        return (await this.getAll()).filter((subject) => subject.isActive);
      },
      async create(name, color = 'DISC-BLUE') {
        const state = readState();
        const timestamp = nowIso();
        const subject = {
          id: nextId(state, "subjects"),
          name: normalizeUniqueName(state.subjects, name, "o nome da disciplina"),
          color: color ?? 'DISC-BLUE',
          createdAt: timestamp,
          updatedAt: timestamp,
          isActive: true,
          sortOrder: state.subjects.length,
        };
        state.subjects.push(subject);
        writeState(state);
        return subject;
      },
      async update(id, fields) {
        const state = readState();
        const subject = state.subjects.find((item) => item.id === id);
        if (!subject) return null;
        if (Object.hasOwn(fields, "name")) {
          subject.name = normalizeUniqueName(state.subjects, fields.name, "o nome da disciplina", id);
        }
        if (Object.hasOwn(fields, "isActive")) subject.isActive = Boolean(fields.isActive);
        if (Object.hasOwn(fields, "sortOrder")) subject.sortOrder = Number(fields.sortOrder) || 0;
        if (Object.hasOwn(fields, "color")) subject.color = String(fields.color ?? 'DISC-BLUE');
        subject.updatedAt = nowIso();
        writeState(state);
        return subject;
      },
      async deactivate(id) {
        return this.update(id, { isActive: false });
      },
      async deleteIfEmpty(id) {
        const state = readState();
        const hasUnits = state.learningUnits.some((u) => u.subjectId === id);
        if (hasUnits) {
          throw new Error('Não é possível excluir uma disciplina com unidades de estudo. Remova primeiro o histórico associado.');
        }
        state.subjects = state.subjects.filter((subject) => subject.id !== id);
        writeState(state);
      },
    },

    learningUnits: {
      async ensureColumns() {},
      async getAll() {
        return [...readState().learningUnits].sort(
          (a, b) => b.studyDate.localeCompare(a.studyDate) || b.id - a.id,
        );
      },
      async getByDate(dateStr) {
        return readState().learningUnits
          .filter((record) => record.studyDate === dateStr)
          .sort((a, b) => a.id - b.id);
      },
      async update(id, fields) {
        const state = readState();
        const record = state.learningUnits.find((item) => item.id === id);
        if (!record) return null;

        if (Object.hasOwn(fields, "sourceText")) {
          record.sourceText = String(fields.sourceText ?? "").trim();
        }
        if (Object.hasOwn(fields, "studyDate")) {
          record.studyDate = String(fields.studyDate ?? "").trim();
        }
        if (Object.hasOwn(fields, "title")) {
          record.title = String(fields.title ?? "").trim();
        }
        if (Object.hasOwn(fields, "summaryBody")) {
          const v = fields.summaryBody;
          record.summaryBody = v != null ? String(v).trim() || null : null;
        }
        record.updatedAt = nowIso();
        writeState(state);
        return record;
      },
      async create(data) {
        const state = readState();
        assertActive(state.subjects, data.subjectId, "Selecione uma disciplina ativa.");
        const timestamp = nowIso();
        const record = {
          id: nextId(state, "learningUnits"),
          subjectId: data.subjectId,
          sourceText: String(data.sourceText ?? "").trim(),
          studyDate: data.studyDate,
          title: String(data.title ?? "").trim(),
          summaryBody: data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.learningUnits.push(record);
        writeState(state);
        return record;
      },
      async createWithReviews(data, tasks) {
        const state = readState();
        assertActive(state.subjects, data.subjectId, "Selecione uma disciplina ativa.");
        const timestamp = nowIso();
        const record = {
          id: nextId(state, "learningUnits"),
          subjectId: data.subjectId,
          sourceText: String(data.sourceText ?? "").trim(),
          studyDate: data.studyDate,
          title: String(data.title ?? "").trim(),
          summaryBody: data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.learningUnits.push(record);
        for (const task of tasks) {
          state.reviewTasks.push({
            id: nextId(state, "reviewTasks"),
            unitId: record.id,
            reviewNumber: task.reviewNumber,
            dueDate: task.dueDate,
            completedAt: task.completedAt ?? null,
            reviewDone: Boolean(task.reviewDone),
            questionsDone: Boolean(task.questionsDone),
            questionsCount: task.questionsCount ?? null,
            correctCount: task.correctCount ?? null,
            scorePercent: task.scorePercent ?? null,
            comment: task.comment ?? null,
            algorithm: task.algorithm ?? "legacy",
            createdAt: task.createdAt ?? timestamp,
            updatedAt: task.updatedAt ?? timestamp,
          });
        }
        writeState(state);
        return record;
      },
    },

    reviewTasks: {
      async getAll() {
        return [...readState().reviewTasks].sort(
          (a, b) => a.dueDate.localeCompare(b.dueDate) || a.reviewNumber - b.reviewNumber,
        );
      },
      async createBulk(tasks) {
        const state = readState();
        const timestamp = nowIso();
        for (const task of tasks) {
          state.reviewTasks.push({
            id: nextId(state, "reviewTasks"),
            ...task,
            completedAt: task.completedAt ?? null,
            reviewDone: Boolean(task.reviewDone),
            questionsDone: Boolean(task.questionsDone),
            questionsCount: task.questionsCount ?? null,
            correctCount: task.correctCount ?? null,
            scorePercent: task.scorePercent ?? null,
            comment: task.comment ?? null,
            createdAt: task.createdAt ?? timestamp,
            updatedAt: task.updatedAt ?? timestamp,
          });
        }
        writeState(state);
        return this.getAll();
      },
      async getForToday(today) {
        return (await this.getAll()).filter((task) => task.dueDate === today && !task.reviewDone);
      },
      async getOverdue(today) {
        return (await this.getAll()).filter((task) => task.dueDate < today && !task.reviewDone);
      },
      async getCompletedToday(today) {
        const state = readState();
        const taskIds = new Set(
          state.learningEvidence
            .filter((e) => e.evidenceDate === today && e.context === 'REVIEW' && e.reviewTaskId != null)
            .map((e) => e.reviewTaskId),
        );
        return state.reviewTasks
          .filter((t) => taskIds.has(t.id))
          .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      },
      async getTomorrow(tomorrow) {
        return (await this.getAll()).filter((task) => task.dueDate === tomorrow && !task.reviewDone);
      },
      async update(id, fields) {
        const state = readState();
        const task = state.reviewTasks.find((item) => item.id === id);
        if (!task) return null;
        for (const [key, value] of Object.entries(fields)) {
          if (key in task) task[key] = value;
        }
        task.updatedAt = nowIso();
        writeState(state);
        return task;
      },
    },

    // BOUNDARY: exercises store pedagogy (questions/answers/hints/provenance).
    // Evidence of study and review outcomes belong in learning_units and review_tasks.
    // hint_text is pedagogical context only — never citation or provenance data.
    exercises: {
      async create(unitId, { questionText, answerText, hintText, position, provenance } = {}) {
        const q = String(questionText ?? "").trim();
        if (!q) throw new Error("Informe o enunciado do exercício.");
        validateProvenance(provenance);
        const state = readState();
        const timestamp = nowIso();
        const exercise = {
          id: nextId(state, "exercises"),
          unitId,
          questionText: q,
          answerText: String(answerText ?? "").trim(),
          hintText: hintText != null ? String(hintText).trim() || null : null,
          position: Number(position) || 0,
          provenance,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.exercises.push(exercise);
        writeState(state);
        return exercise;
      },
      async getAll(unitId) {
        return readState().exercises
          .filter((e) => e.unitId === unitId)
          .sort((a, b) => (a.position - b.position) || (a.id - b.id));
      },
      async update(id, fields) {
        const state = readState();
        const exercise = state.exercises.find((e) => e.id === id);
        if (!exercise) return null;
        if (Object.hasOwn(fields, "questionText")) {
          const q = String(fields.questionText ?? "").trim();
          if (!q) throw new Error("Informe o enunciado do exercício.");
          exercise.questionText = q;
        }
        if (Object.hasOwn(fields, "answerText")) {
          exercise.answerText = String(fields.answerText ?? "").trim();
        }
        if (Object.hasOwn(fields, "hintText")) {
          const h = fields.hintText;
          exercise.hintText = h != null ? String(h).trim() || null : null;
        }
        if (Object.hasOwn(fields, "position")) {
          exercise.position = Number(fields.position) || 0;
        }
        if (Object.hasOwn(fields, "provenance")) {
          validateProvenance(fields.provenance);
          exercise.provenance = fields.provenance;
        }
        exercise.updatedAt = nowIso();
        writeState(state);
        return exercise;
      },
      async delete(id) {
        const state = readState();
        const index = state.exercises.findIndex((e) => e.id === id);
        if (index === -1) return false;
        state.exercises.splice(index, 1);
        writeState(state);
        return true;
      },
    },

    learningEvidence: {
      async ensureColumns() {},
      async runMigrationFromReviewTasks() {
        const state = readState();
        const existing = new Set(
          state.learningEvidence.filter((e) => e.reviewTaskId != null).map((e) => e.reviewTaskId),
        );
        const timestamp = nowIso();
        for (const task of state.reviewTasks) {
          if (!task.reviewDone || !task.questionsDone) continue;
          if (task.questionsCount == null || Number(task.questionsCount) <= 0) continue;
          if (existing.has(task.id)) continue;
          const evidenceDate = (task.completedAt ?? task.dueDate ?? '').slice(0, 10);
          if (!evidenceDate) continue;
          const q = Number(task.questionsCount);
          const c = Number(task.correctCount ?? 0);
          state.learningEvidence.push({
            id: nextId(state, "learningEvidence"),
            unitId: task.unitId,
            evidenceDate,
            context: 'REVIEW',
            questionsCount: q,
            correctCount: c,
            scorePercent: q > 0 ? (c / q) * 100 : null,
            reviewTaskId: task.id,
            createdAt: task.completedAt ?? timestamp,
          });
          existing.add(task.id);
        }
        writeState(state);
      },
      async create({ unitId, evidenceDate, context, questionsCount, correctCount, reviewTaskId = null }) {
        validateEvidenceContext(context);
        const q = Number(questionsCount);
        const c = Number(correctCount);
        if (!Number.isFinite(q) || q <= 0) throw new Error('questionsCount deve ser inteiro positivo.');
        if (!Number.isFinite(c) || c < 0) throw new Error('correctCount deve ser >= 0.');
        if (c > q) throw new Error('correctCount não pode ser maior que questionsCount.');
        if (context === 'REVIEW' && reviewTaskId == null) throw new Error('context REVIEW requer reviewTaskId.');
        if (context !== 'REVIEW' && reviewTaskId != null) throw new Error('context ' + context + ' não pode ter reviewTaskId.');
        const state = readState();
        // unit_id must exist (no FK enforcement in BrowserStore)
        if (!state.learningUnits.some((u) => u.id === unitId)) {
          throw new Error('unit_id não encontrado.');
        }
        if (reviewTaskId != null) {
          const dup = state.learningEvidence.find((e) => e.reviewTaskId === reviewTaskId);
          if (dup) throw new Error('Já existe evidência para esta revisão.');
          // review_task_id must exist and must belong to the same unit_id
          const task = state.reviewTasks.find((t) => t.id === reviewTaskId);
          if (!task) throw new Error('review_task_id não encontrado.');
          if (task.unitId !== unitId) throw new Error('review_task_id deve pertencer à mesma unidade (unit_id).');
        }
        const scorePercent = q > 0 ? (c / q) * 100 : null;
        const evidence = {
          id: nextId(state, "learningEvidence"),
          unitId,
          evidenceDate,
          context,
          questionsCount: q,
          correctCount: c,
          scorePercent,
          reviewTaskId: reviewTaskId ?? null,
          createdAt: nowIso(),
        };
        state.learningEvidence.push(evidence);
        writeState(state);
        return evidence;
      },
      async getAll() {
        return [...readState().learningEvidence].sort(
          (a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id,
        );
      },
      async getByUnit(unitId) {
        return readState().learningEvidence
          .filter((e) => e.unitId === unitId)
          .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id);
      },
      async getBySubject(subjectId) {
        const state = readState();
        const unitIds = new Set(
          state.learningUnits.filter((u) => u.subjectId === subjectId).map((u) => u.id),
        );
        return state.learningEvidence
          .filter((e) => unitIds.has(e.unitId))
          .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id);
      },
      async getByDateRange(fromDate, toDate) {
        return readState().learningEvidence
          .filter((e) => e.evidenceDate >= fromDate && e.evidenceDate <= toDate)
          .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id);
      },
    },

    async completeReviewWithEvidence({ taskId, questionsCount, correctCount }, _now) {
      const q = Number(questionsCount);
      const c = Number(correctCount);
      if (!Number.isFinite(q) || q <= 0) throw new Error('questionsCount deve ser inteiro positivo.');
      if (!Number.isFinite(c) || c < 0) throw new Error('correctCount deve ser >= 0.');
      if (c > q) throw new Error('correctCount não pode ser maior que questionsCount.');
      const state = readState();
      const task = state.reviewTasks.find((t) => t.id === taskId);
      if (!task) throw new Error('Revisão não encontrada: ' + taskId);
      const dup = state.learningEvidence.find((e) => e.reviewTaskId === taskId);
      if (dup) throw new Error('Já existe evidência para esta revisão.');
      const scorePercent = q > 0 ? (c / q) * 100 : null;
      const now = _now ?? new Date();
      const completedAt = now.toISOString();
      const evidenceDate = localDateIso(now);
      task.reviewDone = true;
      task.questionsDone = true;
      task.questionsCount = q;
      task.correctCount = c;
      task.scorePercent = scorePercent;
      task.completedAt = completedAt;
      task.updatedAt = completedAt;
      state.learningEvidence.push({
        id: nextId(state, "learningEvidence"),
        unitId: task.unitId,
        evidenceDate,
        context: 'REVIEW',
        questionsCount: q,
        correctCount: c,
        scorePercent,
        reviewTaskId: taskId,
        createdAt: completedAt,
      });
      writeState(state);
      return { ...task };
    },

    async ensureLearningEvidenceMigration() {
      await this.learningEvidence.runMigrationFromReviewTasks();
    },

    settings: {
      async get() {
        return readState().settings ?? defaultSettings;
      },
      async update(fields) {
        const state = readState();
        state.settings = { ...(state.settings ?? defaultSettings), ...fields };
        writeState(state);
        return state.settings;
      },
    },

    async exportAll() {
      const state = readState();
      return {
        schemaVersion: SCHEMA_VERSION,
        subjects: state.subjects,
        learningUnits: state.learningUnits,
        reviewTasks: state.reviewTasks,
        exercises: state.exercises ?? [],
        learningEvidence: state.learningEvidence ?? [],
        settings: state.settings,
      };
    },

    async importAll(data) {
      const normalized = assertImportData(data);
      const state = emptyState();
      state.subjects = normalized.subjects.map((row) => ({
        ...mapEntityForImport(row, state, "subjects", "o nome da disciplina"),
        color: row.color ?? 'DISC-BLUE',
      }));
      state.learningUnits = normalized.learningUnits.map((row) => ({
        id: row.id,
        subjectId: row.subjectId ?? row.subject_id,
        sourceText: row.sourceText ?? row.source_text ?? '',
        studyDate: row.studyDate ?? row.study_date,
        title: row.title,
        summaryBody: row.summaryBody ?? row.summary_body ?? null,
        createdAt: row.createdAt ?? row.created_at ?? nowIso(),
        updatedAt: row.updatedAt ?? row.updated_at ?? nowIso(),
      }));
      state.reviewTasks = normalized.reviewTasks.map((row) => ({
        id: row.id,
        unitId: row.unitId ?? row.unit_id,
        reviewNumber: row.reviewNumber ?? row.review_number,
        dueDate: row.dueDate ?? row.due_date,
        completedAt: row.completedAt ?? row.completed_at ?? null,
        reviewDone: Boolean(row.reviewDone ?? row.review_done),
        questionsDone: Boolean(row.questionsDone ?? row.questions_done),
        questionsCount: row.questionsCount ?? row.questions_count ?? null,
        correctCount: row.correctCount ?? row.correct_count ?? null,
        scorePercent: row.scorePercent ?? row.score_percent ?? null,
        comment: row.comment ?? null,
        createdAt: row.createdAt ?? row.created_at ?? nowIso(),
        updatedAt: row.updatedAt ?? row.updated_at ?? nowIso(),
      }));
      state.exercises = (Array.isArray(normalized.exercises) ? normalized.exercises : []).map((row) => ({
        id: row.id,
        unitId: row.unitId ?? row.unit_id,
        questionText: row.questionText ?? row.question_text ?? "",
        answerText: row.answerText ?? row.answer_text ?? "",
        hintText: row.hintText ?? row.hint_text ?? null,
        position: row.position ?? 0,
        provenance: row.provenance,
        createdAt: row.createdAt ?? row.created_at ?? nowIso(),
        updatedAt: row.updatedAt ?? row.updated_at ?? nowIso(),
      }));
      // Restore explicit learningEvidence from v3 backups
      state.learningEvidence = (Array.isArray(normalized.learningEvidence) ? normalized.learningEvidence : [])
        .filter((row) => row.questionsCount && Number(row.questionsCount) > 0)
        .map((row) => ({
          id: row.id,
          unitId: row.unitId ?? row.unit_id,
          evidenceDate: row.evidenceDate ?? row.evidence_date,
          context: row.context,
          questionsCount: Number(row.questionsCount ?? row.questions_count),
          correctCount: Number(row.correctCount ?? row.correct_count ?? 0),
          scorePercent: row.scorePercent ?? row.score_percent ?? null,
          reviewTaskId: row.reviewTaskId ?? row.review_task_id ?? null,
          createdAt: row.createdAt ?? row.created_at ?? nowIso(),
        }));
      state.settings = Array.isArray(normalized.settings)
        ? (normalized.settings[0] ?? defaultSettings)
        : (normalized.settings ?? defaultSettings);
      refreshNextIds(state);
      writeState(state);
      // For v1/v2 backups: migrate completed review_tasks to learningEvidence
      if ((normalized.schemaVersion ?? 0) < 3) {
        await this.ensureLearningEvidenceMigration();
      }
      return this.exportAll();
    },

    async clearAll() {
      const state = emptyState();
      writeState(state);
      return this.exportAll();
    },
  };

  return store;
}

export const DB = {
  async init() {
    if (!initialization) {
      initialization = (async () => {
        if (!hasTauriRuntime()) {
          browserStore = createBrowserStore();
          await browserStore.init();
          Object.assign(DB, browserStore);
          return DB;
        }

        database = await Database.load(DATABASE_URL);
        await database.execute('PRAGMA foreign_keys = ON');

        // PRE-MIGRATION: rename old-schema tables BEFORE schemaStatements runs.
        // Without this, CREATE TABLE IF NOT EXISTS learning_units creates an empty table
        // alongside the real study_records data, making the rename check permanently false
        // and leaving all existing user studies invisible after upgrade.
        const preMigTables = await database.select(
          "SELECT name FROM sqlite_master WHERE type='table'",
        );
        const preMigNames = new Set(preMigTables.map((t) => t.name));

        // PRE-MIGRATION: SQL from canonical shared authority (migration-main-to-vnext.json).
        // Same strings consumed by the Rust integration test — neither duplicates them.
        const [sqlRenameStudyRecords, sqlRenameReviewTaskCol, sqlRenameExercisesCol] =
          migrationPlan.preMigration;
        if (!preMigNames.has('learning_units') && preMigNames.has('study_records')) {
          await database.execute(sqlRenameStudyRecords);
          preMigNames.add('learning_units');
        }
        if (preMigNames.has('review_tasks')) {
          const cols = await database.select('PRAGMA table_info(review_tasks)');
          const colNames = new Set(cols.map((c) => c.name));
          if (colNames.has('study_record_id') && !colNames.has('unit_id')) {
            await database.execute(sqlRenameReviewTaskCol);
          }
        }
        if (preMigNames.has('exercises')) {
          const cols = await database.select('PRAGMA table_info(exercises)');
          const colNames = new Set(cols.map((c) => c.name));
          if (colNames.has('study_record_id') && !colNames.has('unit_id')) {
            await database.execute(sqlRenameExercisesCol);
          }
        }

        for (const statement of schemaStatements) {
          if (statement.trimStart().toUpperCase().startsWith('INSERT')) continue;
          await database.execute(statement, []);
        }
        await database.execute(
          "INSERT OR IGNORE INTO settings (key, app_version, review_schedule) VALUES ('main', '2.0.0', $1)",
          [JSON.stringify(REVIEW_SCHEDULE)],
        );
        await DB.subjects.ensureColumns();
        await DB.learningUnits.ensureColumns();
        // Resolve source_id → source_text for rows migrated from main-era DB.
        // The sources table and source_id column exist only in main-era (pre-vNext) databases.
        if (preMigNames.has('sources')) {
          const luCols = await database.select('PRAGMA table_info(learning_units)');
          const luColNames = new Set(luCols.map((c) => c.name));
          if (luColNames.has('source_id')) {
            // SQL from canonical migration authority (migration-main-to-vnext.json)
            await database.execute(migrationPlan.sourceResolution);
          }
        }
        await DB.reviewTasks.ensureColumns();
        await DB.exercises.ensureColumns();
        await DB.learningEvidence.ensureColumns();
        await DB.ensureLearningEvidenceMigration();

        // DEV-only seed: _bootstrap table survives importAll/clearAll/subject deletes.
        // Production build: import.meta.env.DEV = false → never runs; app opens empty (correct).
        if (import.meta.env?.DEV) {
          const rows = await database.select(
            "SELECT dev_seed_version FROM _bootstrap WHERE id = 1",
          );
          if (rows.length === 0 || !rows[0].dev_seed_version) {
            const [{ count }] = await database.select("SELECT COUNT(*) AS count FROM subjects");
            if (Number(count) === 0) {
              const { getDevDataset } = await import('./fixtures/dev-dataset.js');
              await DB.importAll(getDevDataset());
            }
            await database.execute(
              "INSERT OR REPLACE INTO _bootstrap (id, dev_seed_version, seeded_at) VALUES (1, '1', ?)",
              [nowIso()],
            );
          }
        }

        return DB;
      })().catch((error) => {
        database = undefined;
        initialization = undefined;
        throw error;
      });
    }

    return initialization;
  },

  subjects: {
    async ensureColumns() {
      const columns = await requireDatabase().select('PRAGMA table_info(subjects)');
      const names = new Set(columns.map((column) => column.name));
      if (!names.has('is_active')) {
        await requireDatabase().execute(
          'ALTER TABLE subjects ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1',
        );
      }
      if (!names.has('sort_order')) {
        await requireDatabase().execute(
          'ALTER TABLE subjects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
        );
      }
      if (!names.has('color')) {
        await requireDatabase().execute(
          "ALTER TABLE subjects ADD COLUMN color TEXT NOT NULL DEFAULT 'DISC-BLUE'",
        );
      }
    },

    async getAll() {
      const rows = await requireDatabase().select(
        'SELECT * FROM subjects ORDER BY sort_order, name COLLATE NOCASE',
      );
      return rows.map(mapSubject);
    },

    async getActive() {
      const rows = await requireDatabase().select(
        'SELECT * FROM subjects WHERE is_active = 1 ORDER BY sort_order, name COLLATE NOCASE',
      );
      return rows.map(mapSubject);
    },

    async create(name, color = 'DISC-BLUE') {
      const value = normalizeEntityName(name, 'o nome da disciplina');
      const timestamp = nowIso();
      const nextOrder = await getNextSortOrder('subjects');
      const result = await requireDatabase().execute(
        'INSERT INTO subjects (name, created_at, updated_at, is_active, sort_order, color) VALUES ($1, $2, $3, 1, $4, $5)',
        [value, timestamp, timestamp, nextOrder, color],
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM subjects WHERE id = $1',
        [result.lastInsertId],
      );
      return mapSubject(row);
    },

    async update(id, fields) {
      const columns = {
        name: ['name', (value) => normalizeEntityName(value, 'o nome da disciplina')],
        isActive: ['is_active', (value) => (value ? 1 : 0)],
        sortOrder: ['sort_order', (value) => Number(value) || 0],
        color: ['color', (value) => String(value ?? 'DISC-BLUE')],
      };
      const entries = Object.entries(fields).filter(([key]) => columns[key]);
      if (entries.length === 0) throw new Error('Nenhum campo válido para atualizar.');

      const values = entries.map(([key, value]) => columns[key][1](value));
      values.push(nowIso(), id);
      const assignments = entries.map(
        ([key], index) => `${columns[key][0]} = $${index + 1}`,
      );
      assignments.push(`updated_at = $${entries.length + 1}`);

      await requireDatabase().execute(
        'UPDATE subjects SET ' + assignments.join(', ') + '\n         WHERE id = $' + (entries.length + 2),
        values,
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM subjects WHERE id = $1',
        [id],
      );
      return row ? mapSubject(row) : null;
    },

    async deactivate(id) {
      return DB.subjects.update(id, { isActive: false });
    },

    async deleteIfEmpty(id) {
      const [row] = await requireDatabase().select(
        'SELECT COUNT(*) as n FROM learning_units WHERE subject_id = $1',
        [id],
      );
      if (Number(row.n) > 0) {
        throw new Error('Não é possível excluir uma disciplina com unidades de estudo. Remova primeiro o histórico associado.');
      }
      await requireDatabase().execute('DELETE FROM subjects WHERE id = $1', [id]);
    },
  },

  learningUnits: {
    async ensureColumns() {
      const tables = await requireDatabase().select(
        "SELECT name FROM sqlite_master WHERE type='table'",
      );
      const tableNames = new Set(tables.map((t) => t.name));

      if (!tableNames.has('learning_units') && tableNames.has('study_records')) {
        await requireDatabase().execute(migrationPlan.preMigration[0]);
      }

      const columns = await requireDatabase().select('PRAGMA table_info(learning_units)');
      const names = new Set(columns.map((c) => c.name));

      if (names.has('content') && !names.has('title')) {
        await requireDatabase().execute('ALTER TABLE learning_units RENAME COLUMN content TO title');
      }
      if (!names.has('summary_body')) {
        await requireDatabase().execute('ALTER TABLE learning_units ADD COLUMN summary_body TEXT');
      }
      if (!names.has('source_text')) {
        await requireDatabase().execute(
          "ALTER TABLE learning_units ADD COLUMN source_text TEXT NOT NULL DEFAULT ''",
        );
      }
    },

    async getAll() {
      const rows = await requireDatabase().select(
        'SELECT * FROM learning_units ORDER BY study_date DESC, id DESC',
      );
      return rows.map(mapLearningUnit);
    },

    async getByDate(dateStr) {
      const rows = await requireDatabase().select(
        'SELECT * FROM learning_units WHERE study_date = $1 ORDER BY id ASC',
        [dateStr],
      );
      return rows.map(mapLearningUnit);
    },

    async update(id, fields) {
      const columns = {
        sourceText: ["source_text", (value) => String(value ?? "").trim()],
        studyDate: ["study_date", (value) => value],
        title: ["title", (value) => String(value ?? "").trim()],
        summaryBody: ["summary_body", (value) => (value != null ? String(value).trim() || null : null)],
      };
      const entries = Object.entries(fields).filter(([key]) => columns[key]);
      if (entries.length === 0) throw new Error("Nenhum campo válido para atualizar.");

      const values = entries.map(([key, value]) => columns[key][1](value));
      values.push(nowIso(), id);
      const assignments = entries.map(
        ([key], index) => `${columns[key][0]} = $${index + 1}`,
      );
      assignments.push(`updated_at = $${entries.length + 1}`);

      await requireDatabase().execute(
        `UPDATE learning_units SET ${assignments.join(", ")}
         WHERE id = $${entries.length + 2}`,
        values,
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM learning_units WHERE id = $1',
        [id],
      );
      return row ? mapLearningUnit(row) : null;
    },

    async create(data) {
      await assertActiveSubject(data.subjectId);
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO learning_units
          (subject_id, source_text, study_date, title, summary_body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.subjectId,
          String(data.sourceText ?? '').trim(),
          data.studyDate,
          String(data.title ?? '').trim(),
          data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
          timestamp,
          timestamp,
        ],
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM learning_units WHERE id = $1',
        [result.lastInsertId],
      );
      return mapLearningUnit(row);
    },

    async createWithReviews(data, tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('Informe ao menos uma revisão para o estudo.');
      }

      await assertActiveSubject(data.subjectId);
      const timestamp = nowIso();
      const reviewValues = [];
      const reviewPlaceholders = tasks.map((task, taskIndex) => {
        const offset = taskIndex * 11;
        reviewValues.push(
          task.reviewNumber,
          task.dueDate,
          task.completedAt ?? null,
          task.reviewDone ? 1 : 0,
          task.questionsDone ? 1 : 0,
          task.questionsCount ?? null,
          task.correctCount ?? null,
          task.scorePercent ?? null,
          task.comment ?? null,
          task.createdAt ?? timestamp,
          task.updatedAt ?? timestamp,
        );
        const fields = Array.from(
          { length: 11 },
          (_, fieldIndex) => `$${offset + fieldIndex + 1}`,
        );
        return `((SELECT MAX(id) FROM learning_units), ${fields.join(', ')})`;
      });

      const results = await invoke('execute_sqlite_transaction', {
        statements: [
          {
            query: `INSERT INTO learning_units
              (subject_id, source_text, study_date, title, summary_body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            values: [
              data.subjectId,
              String(data.sourceText ?? '').trim(),
              data.studyDate,
              String(data.title ?? '').trim(),
              data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
              timestamp,
              timestamp,
            ],
          },
          {
            query: `INSERT INTO review_tasks
              (unit_id, review_number, due_date, completed_at,
               review_done, questions_done, questions_count, correct_count,
               score_percent, comment, created_at, updated_at)
             VALUES ${reviewPlaceholders.join(', ')}`,
            values: reviewValues,
          },
        ],
      });
      const [row] = await requireDatabase().select(
        'SELECT * FROM learning_units WHERE id = $1',
        [results[0].lastInsertId],
      );
      return mapLearningUnit(row);
    },
  },

  reviewTasks: {
    async ensureColumns() {
      const columns = await requireDatabase().select("PRAGMA table_info(review_tasks)");
      const names = new Set(columns.map((column) => column.name));
      if (names.has('study_record_id') && !names.has('unit_id')) {
        await requireDatabase().execute(migrationPlan.preMigration[1]);
      }
      if (!names.has("algorithm")) {
        await requireDatabase().execute(
          "ALTER TABLE review_tasks ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'legacy'",
        );
      }
      // Index on unit_id created here (after any rename) so it works for main-era DBs.
      await requireDatabase().execute(
        "CREATE INDEX IF NOT EXISTS idx_review_tasks_unit_id ON review_tasks(unit_id)",
      );
    },

    async getAll() {
      const rows = await requireDatabase().select(
        "SELECT * FROM review_tasks ORDER BY due_date, review_number",
      );
      return rows.map(mapReviewTask);
    },

    async createBulk(tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) return [];

      const timestamp = nowIso();
      const values = [];
      const placeholders = tasks.map((task, taskIndex) => {
        const offset = taskIndex * 12;
        values.push(
          task.unitId,
          task.reviewNumber,
          task.dueDate,
          task.completedAt ?? null,
          task.reviewDone ? 1 : 0,
          task.questionsDone ? 1 : 0,
          task.questionsCount ?? null,
          task.correctCount ?? null,
          task.scorePercent ?? null,
          task.comment ?? null,
          task.createdAt ?? timestamp,
          task.updatedAt ?? timestamp,
        );
        return `(${Array.from({ length: 12 }, (_, fieldIndex) => `$${offset + fieldIndex + 1}`).join(", ")})`;
      });

      await requireDatabase().execute(
        `INSERT INTO review_tasks
          (unit_id, review_number, due_date, completed_at,
           review_done, questions_done, questions_count, correct_count,
           score_percent, comment, created_at, updated_at)
         VALUES ${placeholders.join(", ")}`,
        values,
      );

      return DB.reviewTasks.getAll();
    },

    async getForToday(today) {
      const rows = await requireDatabase().select(
        `SELECT * FROM review_tasks
         WHERE due_date = $1 AND review_done = 0
         ORDER BY review_number`,
        [today],
      );
      return rows.map(mapReviewTask);
    },

    async getOverdue(today) {
      const rows = await requireDatabase().select(
        `SELECT * FROM review_tasks
         WHERE due_date < $1 AND review_done = 0
         ORDER BY due_date, review_number`,
        [today],
      );
      return rows.map(mapReviewTask);
    },

    async getCompletedToday(today) {
      const rows = await requireDatabase().select(
        `SELECT rt.* FROM review_tasks rt
         INNER JOIN learning_evidence le ON le.review_task_id = rt.id
         WHERE le.evidence_date = $1 AND le.context = 'REVIEW'
         ORDER BY rt.completed_at DESC`,
        [today],
      );
      return rows.map(mapReviewTask);
    },

    async getTomorrow(tomorrow) {
      const rows = await requireDatabase().select(
        `SELECT * FROM review_tasks
         WHERE due_date = $1 AND review_done = 0
         ORDER BY review_number`,
        [tomorrow],
      );
      return rows.map(mapReviewTask);
    },

    async update(id, fields) {
      const columns = {
        unitId: ["unit_id", (value) => value],
        reviewNumber: ["review_number", (value) => value],
        dueDate: ["due_date", (value) => value],
        completedAt: ["completed_at", (value) => value],
        reviewDone: ["review_done", (value) => (value ? 1 : 0)],
        questionsDone: ["questions_done", (value) => (value ? 1 : 0)],
        questionsCount: ["questions_count", (value) => value],
        correctCount: ["correct_count", (value) => value],
        scorePercent: ["score_percent", (value) => value],
        comment: ["comment", (value) => value],
      };
      const sanitizedFields = { ...fields };
      if (
        Object.hasOwn(sanitizedFields, "questionsCount") ||
        Object.hasOwn(sanitizedFields, "correctCount") ||
        Object.hasOwn(sanitizedFields, "scorePercent")
      ) {
        const [currentRow] = await requireDatabase().select(
          "SELECT questions_count, correct_count FROM review_tasks WHERE id = $1",
          [id],
        );
        if (!currentRow) return null;

        const nextValues = getReviewScoreValues(
          Object.hasOwn(sanitizedFields, "questionsCount") ? sanitizedFields.questionsCount : currentRow.questions_count,
          Object.hasOwn(sanitizedFields, "correctCount") ? sanitizedFields.correctCount : currentRow.correct_count,
        );
        if (nextValues.isOverflow) {
          throw new Error("Acertos não pode ser maior que Questões.");
        }
        sanitizedFields.questionsCount = nextValues.questionsCount;
        sanitizedFields.correctCount = nextValues.correctCount;
        sanitizedFields.scorePercent = nextValues.scorePercent;
      }

      const entries = Object.entries(sanitizedFields).filter(([key]) => columns[key]);
      if (entries.length === 0) throw new Error("Nenhum campo válido para atualizar.");

      const values = entries.map(([key, value]) => columns[key][1](value));
      values.push(nowIso(), id);
      const assignments = entries.map(
        ([key], index) => `${columns[key][0]} = $${index + 1}`,
      );
      assignments.push(`updated_at = $${entries.length + 1}`);

      await requireDatabase().execute(
        `UPDATE review_tasks SET ${assignments.join(", ")}
         WHERE id = $${entries.length + 2}`,
        values,
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM review_tasks WHERE id = $1",
        [id],
      );
      return row ? mapReviewTask(row) : null;
    },
  },

  // BOUNDARY: exercises store pedagogy (questions/answers/hints/provenance).
  // Evidence of study and review outcomes belong in learning_units and review_tasks.
  // hint_text is pedagogical context only — never citation or provenance data.
  exercises: {
    async ensureColumns() {
      const columns = await requireDatabase().select('PRAGMA table_info(exercises)');
      const names = new Set(columns.map((c) => c.name));
      if (names.has('study_record_id') && !names.has('unit_id')) {
        await requireDatabase().execute(migrationPlan.preMigration[2]);
      }
      if (!names.has('provenance')) {
        // Migration default: exercises created before this migration are treated as MANUAL.
        await requireDatabase().execute(
          "ALTER TABLE exercises ADD COLUMN provenance TEXT NOT NULL DEFAULT 'MANUAL'",
        );
      }
    },

    async create(unitId, { questionText, answerText, hintText, position, provenance } = {}) {
      const q = String(questionText ?? "").trim();
      if (!q) throw new Error("Informe o enunciado do exercício.");
      validateProvenance(provenance);
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO exercises
          (unit_id, question_text, answer_text, hint_text, position, provenance, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          unitId,
          q,
          String(answerText ?? "").trim(),
          hintText != null ? String(hintText).trim() || null : null,
          Number(position) || 0,
          provenance,
          timestamp,
          timestamp,
        ],
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM exercises WHERE id = $1",
        [result.lastInsertId],
      );
      return mapExercise(row);
    },

    async getAll(unitId) {
      const rows = await requireDatabase().select(
        "SELECT * FROM exercises WHERE unit_id = $1 ORDER BY position ASC, id ASC",
        [unitId],
      );
      return rows.map(mapExercise);
    },

    async update(id, fields) {
      const columns = {
        questionText: ["question_text", (value) => {
          const q = String(value ?? "").trim();
          if (!q) throw new Error("Informe o enunciado do exercício.");
          return q;
        }],
        answerText: ["answer_text", (value) => String(value ?? "").trim()],
        hintText: ["hint_text", (value) => (value != null ? String(value).trim() || null : null)],
        position: ["position", (value) => Number(value) || 0],
        provenance: ["provenance", (value) => { validateProvenance(value); return value; }],
      };
      const entries = Object.entries(fields).filter(([key]) => columns[key]);
      if (entries.length === 0) throw new Error("Nenhum campo válido para atualizar.");

      const values = entries.map(([key, value]) => columns[key][1](value));
      values.push(nowIso(), id);
      const assignments = entries.map(
        ([key], index) => `${columns[key][0]} = $${index + 1}`,
      );
      assignments.push(`updated_at = $${entries.length + 1}`);

      await requireDatabase().execute(
        `UPDATE exercises SET ${assignments.join(", ")} WHERE id = $${entries.length + 2}`,
        values,
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM exercises WHERE id = $1",
        [id],
      );
      return row ? mapExercise(row) : null;
    },

    async delete(id) {
      await requireDatabase().execute("DELETE FROM exercises WHERE id = $1", [id]);
      return true;
    },
  },

  // VNEXT_DOMAIN_EXTENSION: performance ledger separate from review_tasks agenda
  learningEvidence: {
    async ensureColumns() {
      // Table created via schemaStatements; this is a no-op for compatibility.
    },

    async create({ unitId, evidenceDate, context, questionsCount, correctCount, reviewTaskId = null }) {
      validateEvidenceContext(context);
      const q = Number(questionsCount);
      const c = Number(correctCount);
      if (!Number.isFinite(q) || q <= 0) throw new Error('questionsCount deve ser inteiro positivo.');
      if (!Number.isFinite(c) || c < 0) throw new Error('correctCount deve ser >= 0.');
      if (c > q) throw new Error('correctCount não pode ser maior que questionsCount.');
      if (context === 'REVIEW' && reviewTaskId == null) throw new Error('context REVIEW requer reviewTaskId.');
      if (context !== 'REVIEW' && reviewTaskId != null) throw new Error('context ' + context + ' não pode ter reviewTaskId.');
      // REVIEW review_task must belong to the same unit_id (cross-row constraint; FK cannot express this)
      if (context === 'REVIEW' && reviewTaskId != null) {
        const [task] = await requireDatabase().select(
          'SELECT unit_id FROM review_tasks WHERE id = $1', [reviewTaskId],
        );
        if (!task || task.unit_id !== unitId) {
          throw new Error('review_task_id deve pertencer à mesma unidade (unit_id).');
        }
      }
      const scorePercent = calcScorePercent(q, c);
      const result = await requireDatabase().execute(
        `INSERT INTO learning_evidence
          (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [unitId, evidenceDate, context, q, c, scorePercent, reviewTaskId],
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM learning_evidence WHERE id = $1',
        [result.lastInsertId],
      );
      return mapLearningEvidence(row);
    },

    async getAll() {
      const rows = await requireDatabase().select(
        'SELECT * FROM learning_evidence ORDER BY evidence_date ASC, id ASC',
      );
      return rows.map(mapLearningEvidence);
    },

    async getByUnit(unitId) {
      const rows = await requireDatabase().select(
        'SELECT * FROM learning_evidence WHERE unit_id = $1 ORDER BY evidence_date ASC, id ASC',
        [unitId],
      );
      return rows.map(mapLearningEvidence);
    },

    async getBySubject(subjectId) {
      const rows = await requireDatabase().select(
        `SELECT le.* FROM learning_evidence le
         JOIN learning_units lu ON le.unit_id = lu.id
         WHERE lu.subject_id = $1
         ORDER BY le.evidence_date ASC, le.id ASC`,
        [subjectId],
      );
      return rows.map(mapLearningEvidence);
    },

    async getByDateRange(fromDate, toDate) {
      const rows = await requireDatabase().select(
        'SELECT * FROM learning_evidence WHERE evidence_date >= $1 AND evidence_date <= $2 ORDER BY evidence_date ASC, id ASC',
        [fromDate, toDate],
      );
      return rows.map(mapLearningEvidence);
    },

    async runMigrationFromReviewTasks() {
      await requireDatabase().execute(
        `INSERT OR IGNORE INTO learning_evidence
          (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at)
         SELECT
           rt.unit_id,
           COALESCE(substr(rt.completed_at, 1, 10), rt.due_date),
           'REVIEW',
           rt.questions_count,
           rt.correct_count,
           rt.score_percent,
           rt.id,
           COALESCE(rt.completed_at, rt.updated_at)
         FROM review_tasks rt
         WHERE rt.review_done = 1
           AND rt.questions_done = 1
           AND rt.questions_count IS NOT NULL
           AND rt.questions_count > 0`,
      );
    },
  },

  async completeReviewWithEvidence({ taskId, questionsCount, correctCount }) {
    const q = Number(questionsCount);
    const c = Number(correctCount);
    if (!Number.isFinite(q) || q <= 0) throw new Error('questionsCount deve ser inteiro positivo.');
    if (!Number.isFinite(c) || c < 0) throw new Error('correctCount deve ser >= 0.');
    if (c > q) throw new Error('correctCount não pode ser maior que questionsCount.');

    const [task] = await requireDatabase().select(
      'SELECT * FROM review_tasks WHERE id = $1',
      [taskId],
    );
    if (!task) throw new Error('Revisão não encontrada: ' + taskId);

    const scorePercent = calcScorePercent(q, c);
    const now = new Date();
    const completedAt = now.toISOString();
    const evidenceDate = localDateIso(now);

    await invoke('execute_sqlite_transaction', {
      statements: [
        {
          query: `UPDATE review_tasks
            SET review_done=1, questions_done=1, questions_count=$1, correct_count=$2,
                score_percent=$3, completed_at=$4, updated_at=$4
            WHERE id=$5`,
          values: [q, c, scorePercent, completedAt, taskId],
        },
        {
          query: `INSERT INTO learning_evidence
            (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at)
            VALUES ($1, $2, 'REVIEW', $3, $4, $5, $6, $7)`,
          values: [task.unit_id, evidenceDate, q, c, scorePercent, taskId, completedAt],
        },
      ],
    });

    const [updatedTask] = await requireDatabase().select(
      'SELECT * FROM review_tasks WHERE id = $1',
      [taskId],
    );
    return mapReviewTask(updatedTask);
  },

  settings: {
    async get() {
      const [row] = await requireDatabase().select(
        "SELECT * FROM settings WHERE key = 'main'",
      );
      return mapSettings(row);
    },

    async update(fields) {
      const columns = {
        appVersion: ["app_version", (value) => value],
        reviewSchedule: ["review_schedule", (value) => JSON.stringify(value)],
        lastBackupAt: ["last_backup_at", (value) => value],
      };
      const entries = Object.entries(fields).filter(([key]) => columns[key]);
      if (entries.length === 0) throw new Error("Nenhuma configuração válida para atualizar.");

      const values = entries.map(([key, value]) => columns[key][1](value));
      const assignments = entries.map(
        ([key], index) => `${columns[key][0]} = $${index + 1}`,
      );
      await requireDatabase().execute(
        `UPDATE settings SET ${assignments.join(", ")} WHERE key = 'main'`,
        values,
      );
      return DB.settings.get();
    },
  },

  async exportAll() {
    const [subjects, learningUnits, reviewTasks, exercises, learningEvidence, settings] = await Promise.all([
      DB.subjects.getAll(),
      DB.learningUnits.getAll(),
      DB.reviewTasks.getAll(),
      requireDatabase()
        .select("SELECT * FROM exercises ORDER BY unit_id, position ASC, id ASC")
        .then((rows) => rows.map(mapExercise))
        .catch(() => []),
      requireDatabase()
        .select("SELECT * FROM learning_evidence ORDER BY evidence_date ASC, id ASC")
        .then((rows) => rows.map(mapLearningEvidence))
        .catch(() => []),
      DB.settings.get(),
    ]);
    return { schemaVersion: SCHEMA_VERSION, subjects, learningUnits, reviewTasks, exercises, learningEvidence, settings };
  },

  async importAll(data) {
    const normalized = assertImportData(data);
    await invoke("execute_sqlite_transaction", {
      statements: buildImportStatements(normalized),
    });
    return DB.exportAll();
  },

  async ensureLearningEvidenceMigration() {
    await DB.learningEvidence.runMigrationFromReviewTasks();
  },

  async clearAll() {
    await invoke("execute_sqlite_transaction", {
      statements: buildClearStatements(),
    });
    return DB.exportAll();
  },
};

globalThis.DB = DB;
