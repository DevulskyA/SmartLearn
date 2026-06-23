import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

const DATABASE_URL = "sqlite:smartlearn.db";
const REVIEW_SCHEDULE = [
  1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390,
];

let database;
let initialization;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    study_date TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS review_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_record_id INTEGER NOT NULL REFERENCES study_records(id),
    review_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    completed_at TEXT,
    review_done INTEGER NOT NULL DEFAULT 0,
    questions_done INTEGER NOT NULL DEFAULT 0,
    questions_count INTEGER,
    correct_count INTEGER,
    score_percent REAL,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_tasks_due_date
    ON review_tasks(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_review_tasks_study_record_id
    ON review_tasks(study_record_id)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    app_version TEXT,
    review_schedule TEXT,
    last_backup_at TEXT
  )`,
  `INSERT OR IGNORE INTO settings (key, app_version, review_schedule)
    VALUES ('main', '1.0.0', $1)`,
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
  };
}

function mapStudyRecord(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    studyDate: row.study_date,
    content: row.content,
    source: row.source,
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
    reviewSchedule: JSON.parse(row.review_schedule || "[]"),
    lastBackupAt: row.last_backup_at,
  };
}

function normalizeName(name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) throw new Error("Informe o nome da disciplina.");
  return normalized;
}

function assertImportData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("O backup precisa ser um objeto JSON válido.");
  }

  for (const key of ["subjects", "studyRecords", "reviewTasks"]) {
    if (!Array.isArray(data[key])) {
      throw new Error(`O backup não contém a lista obrigatória \"${key}\".`);
    }
  }
}

async function insertSubjects(rows) {
  const db = requireDatabase();
  for (const row of rows) {
    await db.execute(
      `INSERT INTO subjects (id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [row.id, normalizeName(row.name), row.createdAt, row.updatedAt],
    );
  }
}

async function insertStudyRecords(rows) {
  const db = requireDatabase();
  for (const row of rows) {
    await db.execute(
      `INSERT INTO study_records
        (id, subject_id, study_date, content, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.id,
        row.subjectId,
        row.studyDate,
        row.content,
        row.source ?? null,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }
}

async function insertReviewTasks(rows) {
  const db = requireDatabase();
  for (const row of rows) {
    await db.execute(
      `INSERT INTO review_tasks
        (id, study_record_id, review_number, due_date, completed_at,
         review_done, questions_done, questions_count, correct_count,
         score_percent, comment, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        row.id,
        row.studyRecordId,
        row.reviewNumber,
        row.dueDate,
        row.completedAt ?? null,
        row.reviewDone ? 1 : 0,
        row.questionsDone ? 1 : 0,
        row.questionsCount ?? null,
        row.correctCount ?? null,
        row.scorePercent ?? null,
        row.comment ?? null,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }
}

async function replaceSettings(settings) {
  const row = (Array.isArray(settings) ? settings[0] : settings) ?? {};

  await requireDatabase().execute(
    `INSERT OR REPLACE INTO settings
      (key, app_version, review_schedule, last_backup_at)
     VALUES ('main', $1, $2, $3)`,
    [
      row.appVersion ?? "1.0.0",
      JSON.stringify(row.reviewSchedule ?? REVIEW_SCHEDULE),
      row.lastBackupAt ?? null,
    ],
  );
}

async function clearAll() {
  const db = requireDatabase();
  await db.execute("DELETE FROM review_tasks");
  await db.execute("DELETE FROM study_records");
  await db.execute("DELETE FROM subjects");
  await db.execute("DELETE FROM settings");
}

async function restoreAll(data) {
  await clearAll();
  await insertSubjects(data.subjects);
  await insertStudyRecords(data.studyRecords);
  await insertReviewTasks(data.reviewTasks);
  await replaceSettings(data.settings);
}

export const DB = {
  async init() {
    if (!initialization) {
      initialization = (async () => {
        database = await Database.load(DATABASE_URL);
        await database.execute("PRAGMA foreign_keys = ON");

        for (const [index, statement] of schemaStatements.entries()) {
          const params = index === schemaStatements.length - 1
            ? [JSON.stringify(REVIEW_SCHEDULE)]
            : [];
          await database.execute(statement, params);
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
    async getAll() {
      const rows = await requireDatabase().select(
        "SELECT * FROM subjects ORDER BY name COLLATE NOCASE",
      );
      return rows.map(mapSubject);
    },

    async create(name) {
      const value = normalizeName(name);
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO subjects (name, created_at, updated_at)
         VALUES ($1, $2, $3)`,
        [value, timestamp, timestamp],
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM subjects WHERE id = $1",
        [result.lastInsertId],
      );
      return mapSubject(row);
    },
  },

  studyRecords: {
    async getAll() {
      const rows = await requireDatabase().select(
        "SELECT * FROM study_records ORDER BY study_date DESC, id DESC",
      );
      return rows.map(mapStudyRecord);
    },

    async create(data) {
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO study_records
          (subject_id, study_date, content, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          data.subjectId,
          data.studyDate,
          String(data.content ?? "").trim(),
          String(data.source ?? "").trim() || null,
          timestamp,
          timestamp,
        ],
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM study_records WHERE id = $1",
        [result.lastInsertId],
      );
      return mapStudyRecord(row);
    },

    async createWithReviews(data, tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error("Informe ao menos uma revisão para o estudo.");
      }

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
        return `((SELECT MAX(id) FROM study_records), ${fields.join(", ")})`;
      });

      const results = await invoke("execute_sqlite_transaction", {
        statements: [
          {
            query: `INSERT INTO study_records
              (subject_id, study_date, content, source, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            values: [
              data.subjectId,
              data.studyDate,
              String(data.content ?? "").trim(),
              String(data.source ?? "").trim() || null,
              timestamp,
              timestamp,
            ],
          },
          {
            query: `INSERT INTO review_tasks
              (study_record_id, review_number, due_date, completed_at,
               review_done, questions_done, questions_count, correct_count,
               score_percent, comment, created_at, updated_at)
             VALUES ${reviewPlaceholders.join(", ")}`,
            values: reviewValues,
          },
        ],
      });
      const [row] = await requireDatabase().select(
        "SELECT * FROM study_records WHERE id = $1",
        [results[0].lastInsertId],
      );
      return mapStudyRecord(row);
    },

  },

  reviewTasks: {
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
      const entries = Object.entries(fields).filter(([key]) => columns[key]);
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
    const [subjects, studyRecords, reviewTasks, settings] = await Promise.all([
      DB.subjects.getAll(),
      DB.studyRecords.getAll(),
      DB.reviewTasks.getAll(),
      DB.settings.get(),
    ]);
    return { subjects, studyRecords, reviewTasks, settings };
  },

  async importAll(data) {
    assertImportData(data);
    const currentData = await DB.exportAll();

    try {
      await restoreAll(data);
    } catch (error) {
      try {
        await restoreAll(currentData);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "A importação falhou e o estado anterior não pôde ser restaurado.",
        );
      }
      throw error;
    }

    return DB.exportAll();
  },
};

globalThis.DB = DB;
