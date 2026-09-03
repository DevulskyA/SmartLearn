import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { getReviewScoreValues } from "./review-score.js";
import { SCHEDULE_OFFSETS as REVIEW_SCHEDULE } from "./scheduler.js";

const DATABASE_URL = "sqlite:smartlearn.db";

let database;
let initialization;
let browserStore;

const schemaStatements = [
  "CREATE TABLE IF NOT EXISTS subjects (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL UNIQUE COLLATE NOCASE,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    is_active INTEGER NOT NULL DEFAULT 1,\n    sort_order INTEGER NOT NULL DEFAULT 0\n  )",
  "CREATE TABLE IF NOT EXISTS sources (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL UNIQUE COLLATE NOCASE,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    is_active INTEGER NOT NULL DEFAULT 1,\n    sort_order INTEGER NOT NULL DEFAULT 0\n  )",
  "CREATE TABLE IF NOT EXISTS study_records (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    subject_id INTEGER NOT NULL REFERENCES subjects(id),\n    source_text TEXT NOT NULL DEFAULT '',\n    study_date TEXT NOT NULL,\n    content TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n  )",
  "CREATE TABLE IF NOT EXISTS review_tasks (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    study_record_id INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE,\n    review_number INTEGER NOT NULL,\n    due_date TEXT NOT NULL,\n    completed_at TEXT,\n    review_done INTEGER NOT NULL DEFAULT 0,\n    questions_done INTEGER NOT NULL DEFAULT 0,\n    questions_count INTEGER,\n    correct_count INTEGER,\n    score_percent REAL,\n    comment TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n  )",
  "CREATE INDEX IF NOT EXISTS idx_review_tasks_due_date\n    ON review_tasks(due_date)",
  "CREATE INDEX IF NOT EXISTS idx_review_tasks_study_record_id\n    ON review_tasks(study_record_id)",
  "CREATE TABLE IF NOT EXISTS exercises (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    study_record_id INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE,\n    question_text TEXT NOT NULL,\n    answer_text TEXT NOT NULL,\n    hint_text TEXT,\n    position INTEGER NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n  )",
  "CREATE INDEX IF NOT EXISTS idx_exercises_study_record_id\n    ON exercises(study_record_id)",
  "CREATE TABLE IF NOT EXISTS settings (\n    key TEXT PRIMARY KEY,\n    app_version TEXT,\n    review_schedule TEXT,\n    last_backup_at TEXT\n  )",
  "INSERT OR IGNORE INTO settings (key, app_version, review_schedule)\n    VALUES ('main', '2.0.0', $1)",
];
function nowIso() {
  return new Date().toISOString();
}

function requireDatabase() {
  if (!database) {
    throw new Error("O banco ainda não foi inicializado. Execute DB.init() primeiro.");
  }

  return database;
}

function mapSubject(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order ?? 0,
  };
}

function mapUsageCount(row, key) {
  return Number(row?.[key] ?? 0) || 0;
}

function mapStudyRecord(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    sourceText: row.source_text ?? '',
    studyDate: row.study_date,
    content: row.content,
    summaryBody: row.summary_body ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReviewTask(row) {
  return {
    id: row.id,
    studyRecordId: row.study_record_id,
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

function mapExercise(row) {
  return {
    id: row.id,
    studyRecordId: row.study_record_id,
    questionText: row.question_text,
    answerText: row.answer_text,
    hintText: row.hint_text ?? null,
    position: row.position ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function assertImportData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('O backup precisa ser um objeto JSON válido.');
  }

  for (const key of ['subjects', 'studyRecords', 'reviewTasks']) {
    if (!Array.isArray(data[key])) {
      throw new Error(
        'O backup não contém a lista obrigatória "' + key + '".',
      );
    }
  }
}

function buildClearStatements() {
  return [
    { query: 'DELETE FROM exercises', values: [] },
    { query: 'DELETE FROM review_tasks', values: [] },
    { query: 'DELETE FROM study_records', values: [] },
    { query: 'DELETE FROM subjects', values: [] },
    { query: 'DELETE FROM settings', values: [] },
    {
      query: 'INSERT INTO settings (key, app_version, review_schedule, last_backup_at)\n        VALUES (\'main\', \'2.0.0\', $1, NULL)',
      values: [JSON.stringify(REVIEW_SCHEDULE)],
    },
  ];
}

function buildImportStatements(data) {
  const statements = [
    { query: 'DELETE FROM exercises', values: [] },
    { query: 'DELETE FROM review_tasks', values: [] },
    { query: 'DELETE FROM study_records', values: [] },
    { query: 'DELETE FROM subjects', values: [] },
    { query: 'DELETE FROM settings', values: [] },
  ];

  for (const row of data.subjects) {
    statements.push({
      query: 'INSERT INTO subjects (id, name, created_at, updated_at, is_active, sort_order)\n        VALUES ($1, $2, $3, $4, $5, $6)',
      values: [
        row.id,
        normalizeEntityName(row.name, 'o nome da disciplina'),
        row.createdAt,
        row.updatedAt,
        (row.isActive ?? row.is_active ?? true) ? 1 : 0,
        row.sortOrder ?? row.sort_order ?? 0,
      ],
    });
  }

  for (const row of data.studyRecords) {
    statements.push({
      query: 'INSERT INTO study_records\n        (id, subject_id, source_text, study_date, content, summary_body, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      values: [
        row.id,
        row.subjectId ?? row.subject_id,
        row.sourceText ?? row.source_text ?? '',
        row.studyDate ?? row.study_date,
        row.content,
        row.summaryBody ?? row.summary_body ?? null,
        row.createdAt ?? row.created_at,
        row.updatedAt ?? row.updated_at,
      ],
    });
  }

  for (const row of data.reviewTasks) {
    statements.push({
      query: 'INSERT INTO review_tasks\n        (id, study_record_id, review_number, due_date, completed_at,\n         review_done, questions_done, questions_count, correct_count,\n         score_percent, comment, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
      values: [
        row.id, row.studyRecordId, row.reviewNumber, row.dueDate,
        row.completedAt ?? null, row.reviewDone ? 1 : 0, row.questionsDone ? 1 : 0,
        row.questionsCount ?? null, row.correctCount ?? null, row.scorePercent ?? null,
        row.comment ?? null, row.createdAt, row.updatedAt,
      ],
    });
  }

  for (const row of (Array.isArray(data.exercises) ? data.exercises : [])) {
    statements.push({
      query: 'INSERT INTO exercises\n        (id, study_record_id, question_text, answer_text, hint_text, position, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      values: [
        row.id,
        row.studyRecordId ?? row.study_record_id,
        row.questionText ?? row.question_text ?? "",
        row.answerText ?? row.answer_text ?? "",
        row.hintText ?? row.hint_text ?? null,
        row.position ?? 0,
        row.createdAt ?? row.created_at ?? new Date().toISOString(),
        row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
      ],
    });
  }

  const settings = (Array.isArray(data.settings) ? data.settings[0] : data.settings) ?? {};
  statements.push({
    query: 'INSERT INTO settings (key, app_version, review_schedule, last_backup_at)\n      VALUES (\'main\', $1, $2, $3)',
    values: [
      settings.appVersion ?? '1.0.0',
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
  const initialSubjects = [
    "Anatomia",
    "Fisiologia",
    "Bioqu\u00edmica",
    "Farmacologia",
    "Patologia",
    "Cl\u00ednica M\u00e9dica",
    "Cirurgia",
    "Pediatria",
  ];
  function emptyState() {
    return {
      seeded: false,
      subjects: [],
      studyRecords: [],
      reviewTasks: [],
      exercises: [],
      settings: defaultSettings,
      nextIds: {
        subjects: 1,
        studyRecords: 1,
        reviewTasks: 1,
        exercises: 1,
      },
    };
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return parsed && typeof parsed === "object" ? { ...emptyState(), ...parsed } : emptyState();
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

  function seedNamedRows(state, collection, names, label) {
    if (state[collection].length > 0) return;

    for (const name of names) {
      const exists = state[collection].some(
        (item) => item.name.localeCompare(name, "pt-BR", { sensitivity: "accent" }) === 0,
      );
      if (exists) continue;
      const timestamp = nowIso();
      state[collection].push({
        id: nextId(state, collection),
        name: normalizeEntityName(name, label),
        createdAt: timestamp,
        updatedAt: timestamp,
        isActive: true,
        sortOrder: state[collection].length,
      });
    }
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
    for (const collection of ["subjects", "studyRecords", "reviewTasks", "exercises"]) {
      const ids = (state[collection] ?? []).map((item) => Number(item.id) || 0);
      state.nextIds[collection] = Math.max(0, ...ids) + 1;
    }
  }

  const store = {
    async init() {
      const state = readState();
      if (!state.seeded) {
        seedNamedRows(state, "subjects", initialSubjects, "o nome da disciplina");
        state.seeded = true;
      }
      writeState(state);
    },

    subjects: {
      async ensureColumns() {},
      async seedInitial() {
        const state = readState();
        seedNamedRows(state, "subjects", initialSubjects, "o nome da disciplina");
        writeState(state);
      },
      async getAll() {
        return [...readState().subjects].sort(sortByOrderAndName);
      },
      async getActive() {
        return (await this.getAll()).filter((subject) => subject.isActive);
      },
      async create(name) {
        const state = readState();
        const timestamp = nowIso();
        const subject = {
          id: nextId(state, "subjects"),
          name: normalizeUniqueName(state.subjects, name, "o nome da disciplina"),
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
        subject.updatedAt = nowIso();
        writeState(state);
        return subject;
      },
      async deactivate(id) {
        return this.update(id, { isActive: false });
      },
      async deleteCascade(id) {
        const state = readState();
        const studyIds = new Set(state.studyRecords.filter((record) => record.subjectId === id).map((record) => record.id));
        state.exercises = (state.exercises ?? []).filter((e) => !studyIds.has(e.studyRecordId));
        state.reviewTasks = state.reviewTasks.filter((task) => !studyIds.has(task.studyRecordId));
        state.studyRecords = state.studyRecords.filter((record) => record.subjectId !== id);
        state.subjects = state.subjects.filter((subject) => subject.id !== id);
        writeState(state);
        return true;
      },
    },

    studyRecords: {
      async ensureColumns() {},
      async getAll() {
        return [...readState().studyRecords].sort(
          (a, b) => b.studyDate.localeCompare(a.studyDate) || b.id - a.id,
        );
      },
      async getByDate(dateStr) {
        return readState().studyRecords
          .filter((record) => record.studyDate === dateStr)
          .sort((a, b) => a.id - b.id);
      },
      async update(id, fields) {
        const state = readState();
        const record = state.studyRecords.find((item) => item.id === id);
        if (!record) return null;

        if (Object.hasOwn(fields, "sourceText")) {
          record.sourceText = String(fields.sourceText ?? "").trim();
        }
        if (Object.hasOwn(fields, "studyDate")) {
          record.studyDate = String(fields.studyDate ?? "").trim();
        }
        if (Object.hasOwn(fields, "content")) {
          record.content = String(fields.content ?? "").trim();
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
          id: nextId(state, "studyRecords"),
          subjectId: data.subjectId,
          sourceText: String(data.sourceText ?? "").trim(),
          studyDate: data.studyDate,
          content: String(data.content ?? "").trim(),
          summaryBody: data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.studyRecords.push(record);
        writeState(state);
        return record;
      },
      async createWithReviews(data, tasks) {
        const state = readState();
        assertActive(state.subjects, data.subjectId, "Selecione uma disciplina ativa.");
        const timestamp = nowIso();
        const record = {
          id: nextId(state, "studyRecords"),
          subjectId: data.subjectId,
          sourceText: String(data.sourceText ?? "").trim(),
          studyDate: data.studyDate,
          content: String(data.content ?? "").trim(),
          summaryBody: data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.studyRecords.push(record);
        for (const task of tasks) {
          state.reviewTasks.push({
            id: nextId(state, "reviewTasks"),
            studyRecordId: record.id,
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
        return (await this.getAll())
          .filter((task) => task.completedAt?.startsWith(today) && task.reviewDone)
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
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

    exercises: {
      async create(studyRecordId, { questionText, answerText, hintText, position } = {}) {
        const q = String(questionText ?? "").trim();
        if (!q) throw new Error("Informe o enunciado do exercício.");
        const state = readState();
        const timestamp = nowIso();
        const exercise = {
          id: nextId(state, "exercises"),
          studyRecordId,
          questionText: q,
          answerText: String(answerText ?? "").trim(),
          hintText: hintText != null ? String(hintText).trim() || null : null,
          position: Number(position) || 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.exercises.push(exercise);
        writeState(state);
        return exercise;
      },
      async getAll(studyRecordId) {
        return readState().exercises
          .filter((e) => e.studyRecordId === studyRecordId)
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
        subjects: state.subjects,
        studyRecords: state.studyRecords,
        reviewTasks: state.reviewTasks,
        exercises: state.exercises ?? [],
        settings: state.settings,
      };
    },

    async importAll(data) {
      assertImportData(data);
      const state = emptyState();
      state.subjects = data.subjects.map((row) => mapEntityForImport(row, state, "subjects", "o nome da disciplina"));
      state.studyRecords = data.studyRecords.map((row) => ({
        id: row.id,
        subjectId: row.subjectId ?? row.subject_id,
        sourceText: row.sourceText ?? row.source_text ?? '',
        studyDate: row.studyDate ?? row.study_date,
        content: row.content,
        summaryBody: row.summaryBody ?? row.summary_body ?? null,
        createdAt: row.createdAt ?? row.created_at ?? nowIso(),
        updatedAt: row.updatedAt ?? row.updated_at ?? nowIso(),
      }));
      state.reviewTasks = data.reviewTasks.map((row) => ({
        id: row.id,
        studyRecordId: row.studyRecordId ?? row.study_record_id,
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
      state.exercises = (Array.isArray(data.exercises) ? data.exercises : []).map((row) => ({
        id: row.id,
        studyRecordId: row.studyRecordId ?? row.study_record_id,
        questionText: row.questionText ?? row.question_text ?? "",
        answerText: row.answerText ?? row.answer_text ?? "",
        hintText: row.hintText ?? row.hint_text ?? null,
        position: row.position ?? 0,
        createdAt: row.createdAt ?? row.created_at ?? nowIso(),
        updatedAt: row.updatedAt ?? row.updated_at ?? nowIso(),
      }));
      state.settings = Array.isArray(data.settings)
        ? (data.settings[0] ?? defaultSettings)
        : (data.settings ?? defaultSettings);
      refreshNextIds(state);
      writeState(state);
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

        for (const [index, statement] of schemaStatements.entries()) {
          const params = index === schemaStatements.length - 1
            ? [JSON.stringify(REVIEW_SCHEDULE)]
            : [];
          await database.execute(statement, params);
        }
        await DB.subjects.ensureColumns();
        await DB.subjects.seedInitial();
        await DB.studyRecords.ensureColumns();
        await DB.reviewTasks.ensureColumns();

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
    },

    async seedInitial() {
      const rows = await requireDatabase().select('SELECT id FROM subjects LIMIT 1');
      if (rows.length > 0) return;

      await ensureNamedRows(
        'subjects',
        [
          'Anatomia', 'Fisiologia', 'Bioquímica', 'Farmacologia',
          'Patologia', 'Clínica Médica', 'Cirurgia', 'Pediatria',
        ],
        'o nome da disciplina',
      );
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

    async create(name) {
      const value = normalizeEntityName(name, 'o nome da disciplina');
      const timestamp = nowIso();
      const nextOrder = await getNextSortOrder('subjects');
      const result = await requireDatabase().execute(
        'INSERT INTO subjects (name, created_at, updated_at, is_active, sort_order) VALUES ($1, $2, $3, 1, $4)',
        [value, timestamp, timestamp, nextOrder],
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

    async deleteCascade(id) {
      await invoke('execute_sqlite_transaction', {
        statements: [
          {
            query: `DELETE FROM review_tasks
              WHERE study_record_id IN (
                SELECT id FROM study_records WHERE subject_id = $1
              )`,
            values: [id],
          },
          {
            query: 'DELETE FROM study_records WHERE subject_id = $1',
            values: [id],
          },
          {
            query: 'DELETE FROM subjects WHERE id = $1',
            values: [id],
          },
        ],
      });
      return true;
    },
  },

  studyRecords: {
    async ensureColumns() {
      const columns = await requireDatabase().select('PRAGMA table_info(study_records)');
      const names = new Set(columns.map((column) => column.name));
      if (!names.has('summary_body')) {
        await requireDatabase().execute(
          'ALTER TABLE study_records ADD COLUMN summary_body TEXT',
        );
      }
      if (!names.has('source_text')) {
        await requireDatabase().execute(
          "ALTER TABLE study_records ADD COLUMN source_text TEXT NOT NULL DEFAULT ''",
        );
        if (names.has('source_id')) {
          await requireDatabase().execute(
            `UPDATE study_records
             SET source_text = COALESCE(
               (SELECT name FROM sources WHERE id = study_records.source_id), ''
             )
             WHERE source_text = ''`,
          );
        }
      }
    },

    async getAll() {
      const rows = await requireDatabase().select(
        'SELECT * FROM study_records ORDER BY study_date DESC, id DESC',
      );
      return rows.map(mapStudyRecord);
    },

    async getByDate(dateStr) {
      const rows = await requireDatabase().select(
        'SELECT * FROM study_records WHERE study_date = $1 ORDER BY id ASC',
        [dateStr],
      );
      return rows.map(mapStudyRecord);
    },

    async update(id, fields) {
      const columns = {
        sourceText: ["source_text", (value) => String(value ?? "").trim()],
        studyDate: ["study_date", (value) => value],
        content: ["content", (value) => String(value ?? "").trim()],
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
        `UPDATE study_records SET ${assignments.join(", ")}
         WHERE id = $${entries.length + 2}`,
        values,
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM study_records WHERE id = $1',
        [id],
      );
      return row ? mapStudyRecord(row) : null;
    },

    async create(data) {
      await assertActiveSubject(data.subjectId);
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO study_records
          (subject_id, source_text, study_date, content, summary_body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.subjectId,
          String(data.sourceText ?? '').trim(),
          data.studyDate,
          String(data.content ?? '').trim(),
          data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
          timestamp,
          timestamp,
        ],
      );
      const [row] = await requireDatabase().select(
        'SELECT * FROM study_records WHERE id = $1',
        [result.lastInsertId],
      );
      return mapStudyRecord(row);
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
        return `((SELECT MAX(id) FROM study_records), ${fields.join(', ')})`;
      });

      const results = await invoke('execute_sqlite_transaction', {
        statements: [
          {
            query: `INSERT INTO study_records
              (subject_id, source_text, study_date, content, summary_body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            values: [
              data.subjectId,
              String(data.sourceText ?? '').trim(),
              data.studyDate,
              String(data.content ?? '').trim(),
              data.summaryBody != null ? String(data.summaryBody).trim() || null : null,
              timestamp,
              timestamp,
            ],
          },
          {
            query: `INSERT INTO review_tasks
              (study_record_id, review_number, due_date, completed_at,
               review_done, questions_done, questions_count, correct_count,
               score_percent, comment, created_at, updated_at)
             VALUES ${reviewPlaceholders.join(', ')}`,
            values: reviewValues,
          },
        ],
      });
      const [row] = await requireDatabase().select(
        'SELECT * FROM study_records WHERE id = $1',
        [results[0].lastInsertId],
      );
      return mapStudyRecord(row);
    },

  },

  reviewTasks: {
    async ensureColumns() {
      const columns = await requireDatabase().select("PRAGMA table_info(review_tasks)");
      const names = new Set(columns.map((column) => column.name));
      if (!names.has("algorithm")) {
        await requireDatabase().execute(
          "ALTER TABLE review_tasks ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'legacy'",
        );
      }
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
          task.studyRecordId,
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
          (study_record_id, review_number, due_date, completed_at,
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
        `SELECT * FROM review_tasks
         WHERE completed_at LIKE $1 AND review_done = 1
         ORDER BY completed_at DESC`,
        [`${today}%`],
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
        studyRecordId: ["study_record_id", (value) => value],
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

  exercises: {
    async create(studyRecordId, { questionText, answerText, hintText, position } = {}) {
      const q = String(questionText ?? "").trim();
      if (!q) throw new Error("Informe o enunciado do exercício.");
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO exercises
          (study_record_id, question_text, answer_text, hint_text, position, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [studyRecordId, q, String(answerText ?? "").trim(), hintText != null ? String(hintText).trim() || null : null, Number(position) || 0, timestamp, timestamp],
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM exercises WHERE id = $1",
        [result.lastInsertId],
      );
      return mapExercise(row);
    },

    async getAll(studyRecordId) {
      const rows = await requireDatabase().select(
        "SELECT * FROM exercises WHERE study_record_id = $1 ORDER BY position ASC, id ASC",
        [studyRecordId],
      );
      return rows.map(mapExercise);
    },

    async update(id, fields) {
      const columns = {
        questionText: ["question_text", (value) => { const q = String(value ?? "").trim(); if (!q) throw new Error("Informe o enunciado do exercício."); return q; }],
        answerText: ["answer_text", (value) => String(value ?? "").trim()],
        hintText: ["hint_text", (value) => (value != null ? String(value).trim() || null : null)],
        position: ["position", (value) => Number(value) || 0],
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
    const [subjects, sources, studyRecords, reviewTasks, exercises, settings] = await Promise.all([
      DB.subjects.getAll(),
      DB.sources.getAll(),
      DB.studyRecords.getAll(),
      DB.reviewTasks.getAll(),
      requireDatabase().select("SELECT * FROM exercises ORDER BY study_record_id, position ASC, id ASC").then((rows) => rows.map(mapExercise)).catch(() => []),
      DB.settings.get(),
    ]);
    return { subjects, sources, studyRecords, reviewTasks, exercises, settings };
  },

  async importAll(data) {
    assertImportData(data);
    await invoke("execute_sqlite_transaction", {
      statements: buildImportStatements(data),
    });
    return DB.exportAll();
  },

  async clearAll() {
    await invoke("execute_sqlite_transaction", {
      statements: buildClearStatements(),
    });
    return DB.exportAll();
  },
};

globalThis.DB = DB;
