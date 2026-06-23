const fs = require("fs");
const path = "src/db.js";
let text = fs.readFileSync(path, "utf8");

function replaceSection(startMarker, endMarker, replacement) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    throw new Error("Start marker not found: " + startMarker);
  }
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    throw new Error("End marker not found: " + endMarker);
  }
  text = text.slice(0, start) + replacement + text.slice(end);
}

replaceSection(
  "const schemaStatements = [",
  "function nowIso() {",
  `const schemaStatements = [
  "CREATE TABLE IF NOT EXISTS subjects (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL UNIQUE COLLATE NOCASE,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    is_active INTEGER NOT NULL DEFAULT 1,\n    sort_order INTEGER NOT NULL DEFAULT 0\n  )",
  "CREATE TABLE IF NOT EXISTS sources (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL UNIQUE COLLATE NOCASE,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    is_active INTEGER NOT NULL DEFAULT 1,\n    sort_order INTEGER NOT NULL DEFAULT 0\n  )",
  "CREATE TABLE IF NOT EXISTS study_records (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    subject_id INTEGER NOT NULL REFERENCES subjects(id),\n    source_id INTEGER NOT NULL REFERENCES sources(id),\n    study_date TEXT NOT NULL,\n    content TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n  )",
  "CREATE INDEX IF NOT EXISTS idx_review_tasks_due_date\n    ON review_tasks(due_date)",
  "CREATE INDEX IF NOT EXISTS idx_review_tasks_study_record_id\n    ON review_tasks(study_record_id)",
  "CREATE TABLE IF NOT EXISTS settings (\n    key TEXT PRIMARY KEY,\n    app_version TEXT,\n    review_schedule TEXT,\n    last_backup_at TEXT\n  )",
  "INSERT OR IGNORE INTO settings (key, app_version, review_schedule)\n    VALUES ('main', '1.0.0', $1)",
];

`
);

replaceSection(
  "function mapSubject(row) {",
  "function assertImportData(data) {",
  `function mapSubject(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order ?? 0,
  };
}

function mapSource(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order ?? 0,
  };
}

function mapStudyRecord(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    sourceId: row.source_id,
    studyDate: row.study_date,
    content: row.content,
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

function normalizeEntityName(name, label) {
  const normalized = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Informe " + label + ".");
  return normalized;
}

async function assertActiveSubject(subjectId) {
  const [subject] = await requireDatabase().select(
    "SELECT id FROM subjects WHERE id = $1 AND is_active = 1",
    [subjectId],
  );
  if (!subject) {
    throw new Error("Selecione uma disciplina ativa.");
  }
}

async function assertActiveSource(sourceId) {
  const [source] = await requireDatabase().select(
    "SELECT id FROM sources WHERE id = $1 AND is_active = 1",
    [sourceId],
  );
  if (!source) {
    throw new Error("Selecione uma fonte ativa.");
  }
}

async function getNextSortOrder(tableName) {
  const query = "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM " + tableName;
  const [{ next_order: nextOrder = 0 } = {}] = await requireDatabase().select(query);
  return nextOrder;
}

async function ensureNamedRows(tableName, names, label) {
  const timestamp = nowIso();
  let nextSortOrder = await getNextSortOrder(tableName);

  for (const name of names) {
    const normalized = normalizeEntityName(name, label);
    const query = "SELECT id FROM " + tableName + " WHERE name = $1 COLLATE NOCASE";
    const [existing] = await requireDatabase().select(query, [normalized]);
    if (existing) continue;

    await requireDatabase().execute(
      "INSERT INTO " + tableName + " (name, created_at, updated_at, is_active, sort_order) VALUES ($1, $2, $3, 1, $4)",
      [normalized, timestamp, timestamp, nextSortOrder],
    );
    nextSortOrder += 1;
  }
}

async function getSourceIdByName(name) {
  const normalized = normalizeEntityName(name, "o nome da fonte");
  const [row] = await requireDatabase().select(
    "SELECT id FROM sources WHERE name = $1 COLLATE NOCASE",
    [normalized],
  );
  return row?.id ?? null;
}

function assertImportData(data) {
`
);

replaceSection(
  "function assertImportData(data) {",
  "export const DB = {",
  `function assertImportData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("O backup precisa ser um objeto JSON válido.");
  }

  for (const key of ["subjects", "sources", "studyRecords", "reviewTasks"]) {
    if (!Array.isArray(data[key])) {
      throw new Error(
        "O backup não contém a lista obrigatória \"" + key + "\".",
      );
    }
  }
}

function buildImportStatements(data) {
  const statements = [
    { query: "DELETE FROM review_tasks", values: [] },
    { query: "DELETE FROM study_records", values: [] },
    { query: "DELETE FROM sources", values: [] },
    { query: "DELETE FROM subjects", values: [] },
    { query: "DELETE FROM settings", values: [] },
  ];

  for (const row of data.subjects) {
    statements.push({
      query: "INSERT INTO subjects (id, name, created_at, updated_at, is_active, sort_order)\n        VALUES ($1, $2, $3, $4, $5, $6)",
      values: [
        row.id,
        normalizeEntityName(row.name, "o nome da disciplina"),
        row.createdAt,
        row.updatedAt,
        (row.isActive ?? row.is_active ?? true) ? 1 : 0,
        row.sortOrder ?? row.sort_order ?? 0,
      ],
    });
  }

  for (const row of data.sources) {
    statements.push({
      query: "INSERT INTO sources (id, name, created_at, updated_at, is_active, sort_order)\n        VALUES ($1, $2, $3, $4, $5, $6)",
      values: [
        row.id,
        normalizeEntityName(row.name, "o nome da fonte"),
        row.createdAt,
        row.updatedAt,
        (row.isActive ?? row.is_active ?? true) ? 1 : 0,
        row.sortOrder ?? row.sort_order ?? 0,
      ],
    });
  }

  for (const row of data.studyRecords) {
    statements.push({
      query: "INSERT INTO study_records\n        (id, subject_id, source_id, study_date, content, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7)",
      values: [
        row.id,
        row.subjectId,
        row.sourceId,
        row.studyDate,
        row.content,
        row.createdAt,
        row.updatedAt,
      ],
    });
  }

  for (const row of data.reviewTasks) {
    statements.push({
      query: "INSERT INTO review_tasks\n        (id, study_record_id, review_number, due_date, completed_at,\n         review_done, questions_done, questions_count, correct_count,\n         score_percent, comment, created_at, updated_at)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
      values: [
        row.id, row.studyRecordId, row.reviewNumber, row.dueDate,
        row.completedAt ?? null, row.reviewDone ? 1 : 0, row.questionsDone ? 1 : 0,
        row.questionsCount ?? null, row.correctCount ?? null, row.scorePercent ?? null,
        row.comment ?? null, row.createdAt, row.updatedAt,
      ],
    });
  }

  const settings = (Array.isArray(data.settings) ? data.settings[0] : data.settings) ?? {};
  statements.push({
    query: "INSERT INTO settings (key, app_version, review_schedule, last_backup_at)\n      VALUES ('main', $1, $2, $3)",
    values: [
      settings.appVersion ?? "1.0.0",
      JSON.stringify(settings.reviewSchedule ?? REVIEW_SCHEDULE),
      settings.lastBackupAt ?? null,
    ],
  });

  return statements;
}

export const DB = {
`
);

replaceSection(
  "  async init() {",
  "  subjects: {",
  `  async init() {
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
        await DB.subjects.ensureColumns();
        await DB.sources.ensureColumns();
        await DB.subjects.seedInitial();
        await DB.sources.seedInitial();
        await DB.studyRecords.ensureColumns();

        return DB;
      })().catch((error) => {
        database = undefined;
        initialization = undefined;
        throw error;
      });
    }

    return initialization;
  },

`
);

replaceSection(
  "  subjects: {",
  "  reviewTasks: {",
  `  subjects: {
    async ensureColumns() {
      const columns = await requireDatabase().select("PRAGMA table_info(subjects)");
      const names = new Set(columns.map((column) => column.name));
      if (!names.has("is_active")) {
        await requireDatabase().execute(
          "ALTER TABLE subjects ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
        );
      }
      if (!names.has("sort_order")) {
        await requireDatabase().execute(
          "ALTER TABLE subjects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        );
      }
    },

    async seedInitial() {
      await ensureNamedRows(
        "subjects",
        [
          "Língua Portuguesa",
          "Conhecimentos sobre o DF",
          "Legislação",
          "Administração",
          "AFO",
          "Arquivologia",
          "Recursos Materiais",
        ],
        "o nome da disciplina",
      );
    },

    async getAll() {
      const rows = await requireDatabase().select(
        "SELECT * FROM subjects ORDER BY sort_order, name COLLATE NOCASE",
      );
      return rows.map(mapSubject);
    },

    async getActive() {
      const rows = await requireDatabase().select(
        "SELECT * FROM subjects WHERE is_active = 1 ORDER BY sort_order, name COLLATE NOCASE",
      );
      return rows.map(mapSubject);
    },

    async create(name) {
      const value = normalizeEntityName(name, "o nome da disciplina");
      const timestamp = nowIso();
      const nextOrder = await getNextSortOrder("subjects");
      const result = await requireDatabase().execute(
        "INSERT INTO subjects (name, created_at, updated_at, is_active, sort_order) VALUES ($1, $2, $3, 1, $4)",
        [value, timestamp, timestamp, nextOrder],
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM subjects WHERE id = $1",
        [result.lastInsertId],
      );
      return mapSubject(row);
    },

    async update(id, fields) {
      const columns = {
        name: ["name", (value) => normalizeEntityName(value, "o nome da disciplina")],
        isActive: ["is_active", (value) => (value ? 1 : 0)],
        sortOrder: ["sort_order", (value) => Number(value) || 0],
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
        `UPDATE subjects SET ${assignments.join(", ")}
         WHERE id = $${entries.length + 2}`,
        values,
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM subjects WHERE id = $1",
        [id],
      );
      return row ? mapSubject(row) : null;
    },

    async deactivate(id) {
      return DB.subjects.update(id, { isActive: false });
    },

    async deleteCascade(id) {
      await invoke("execute_sqlite_transaction", {
        statements: [
          {
            query: `DELETE FROM review_tasks
              WHERE study_record_id IN (
                SELECT id FROM study_records WHERE subject_id = $1
              )`,
            values: [id],
          },
          {
            query: "DELETE FROM study_records WHERE subject_id = $1",
            values: [id],
          },
          {
            query: "DELETE FROM subjects WHERE id = $1",
            values: [id],
          },
        ],
      });
      return true;
    },
  },

  sources: {
    async ensureColumns() {
      const columns = await requireDatabase().select("PRAGMA table_info(sources)");
      const names = new Set(columns.map((column) => column.name));
      if (!names.has("is_active")) {
        await requireDatabase().execute(
          "ALTER TABLE sources ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
        );
      }
      if (!names.has("sort_order")) {
        await requireDatabase().execute(
          "ALTER TABLE sources ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        );
      }
    },

    async seedInitial() {
      await ensureNamedRows(
        "sources",
        ["Grancursos"],
        "o nome da fonte",
      );
    },

    async getAll() {
      const rows = await requireDatabase().select(
        "SELECT * FROM sources ORDER BY sort_order, name COLLATE NOCASE",
      );
      return rows.map(mapSource);
    },

    async getActive() {
      const rows = await requireDatabase().select(
        "SELECT * FROM sources WHERE is_active = 1 ORDER BY sort_order, name COLLATE NOCASE",
      );
      return rows.map(mapSource);
    },

    async create(name) {
      const value = normalizeEntityName(name, "o nome da fonte");
      const timestamp = nowIso();
      const nextOrder = await getNextSortOrder("sources");
      const result = await requireDatabase().execute(
        "INSERT INTO sources (name, created_at, updated_at, is_active, sort_order) VALUES ($1, $2, $3, 1, $4)",
        [value, timestamp, timestamp, nextOrder],
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM sources WHERE id = $1",
        [result.lastInsertId],
      );
      return mapSource(row);
    },

    async update(id, fields) {
      const columns = {
        name: ["name", (value) => normalizeEntityName(value, "o nome da fonte")],
        isActive: ["is_active", (value) => (value ? 1 : 0)],
        sortOrder: ["sort_order", (value) => Number(value) || 0],
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
        `UPDATE sources SET ${assignments.join(", ")}
         WHERE id = $${entries.length + 2}`,
        values,
      );
      const [row] = await requireDatabase().select(
        "SELECT * FROM sources WHERE id = $1",
        [id],
      );
      return row ? mapSource(row) : null;
    },

    async deactivate(id) {
      return DB.sources.update(id, { isActive: false });
    },
  },

  studyRecords: {
    async ensureColumns() {
      const columns = await requireDatabase().select("PRAGMA table_info(study_records)");
      const names = new Set(columns.map((column) => column.name));
      if (!names.has("source_id")) {
        await requireDatabase().execute(
          "ALTER TABLE study_records ADD COLUMN source_id INTEGER",
        );
      }

      const rows = await requireDatabase().select(
        "SELECT id, source FROM study_records WHERE source_id IS NULL",
      );
      if (rows.length === 0) {
        return;
      }

      let fallbackSourceId = await getSourceIdByName("Grancursos");
      if (!fallbackSourceId) {
        fallbackSourceId = (await DB.sources.create("Grancursos")).id;
      }

      for (const row of rows) {
        const legacySource = String(row.source ?? "").replace(/\s+/g, " ").trim();
        let sourceId = fallbackSourceId;
        if (legacySource) {
          sourceId = await getSourceIdByName(legacySource);
          if (!sourceId) {
            sourceId = (await DB.sources.create(legacySource)).id;
          }
        }

        await requireDatabase().execute(
          "UPDATE study_records SET source_id = $1 WHERE id = $2",
          [sourceId, row.id],
        );
      }
    },

    async getAll() {
      const rows = await requireDatabase().select(
        "SELECT * FROM study_records ORDER BY study_date DESC, id DESC",
      );
      return rows.map(mapStudyRecord);
    },

    async create(data) {
      await assertActiveSubject(data.subjectId);
      await assertActiveSource(data.sourceId);
      const timestamp = nowIso();
      const result = await requireDatabase().execute(
        `INSERT INTO study_records
          (subject_id, source_id, study_date, content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          data.subjectId,
          data.sourceId,
          data.studyDate,
          String(data.content ?? "").trim(),
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

      await assertActiveSubject(data.subjectId);
      await assertActiveSource(data.sourceId);
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
              (subject_id, source_id, study_date, content, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            values: [
              data.subjectId,
              data.sourceId,
              data.studyDate,
              String(data.content ?? "").trim(),
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

`
);

replaceSection(
  "  async exportAll() {",
  "  async importAll(data) {",
  `  async exportAll() {
    const [subjects, sources, studyRecords, reviewTasks, settings] = await Promise.all([
      DB.subjects.getAll(),
      DB.sources.getAll(),
      DB.studyRecords.getAll(),
      DB.reviewTasks.getAll(),
      DB.settings.get(),
    ]);
    return { subjects, sources, studyRecords, reviewTasks, settings };
  },

`
);

fs.writeFileSync(path, text, "utf8");
