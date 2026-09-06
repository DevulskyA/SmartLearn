-- T13: owned learning-domain schema. Renumbered from the plan's suggested
-- "003-learning-domain.sql" to 004 because 003 was already committed for
-- T10's session CSRF column (migrations are append-only once applied;
-- committed migrations are never renamed/edited per design.md §1).
--
-- Ownership model (design.md §3): every domain table carries user_id
-- NOT NULL. Child tables use COMPOSITE foreign keys (user_id, parent_id)
-- referencing a UNIQUE(user_id, id) on the parent — this makes cross-user
-- linkage a DATABASE-level impossibility, not just an application check: a
-- row can only reference a parent row that has the SAME user_id, so even a
-- caller who somehow knew another user's numeric id could never construct
-- a valid cross-owner FK reference.

CREATE TABLE IF NOT EXISTS subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'DISC-BLUE',
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS learning_units (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  subject_id   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  source_text  TEXT,
  summary_body TEXT,
  study_date   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, subject_id) REFERENCES subjects (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_learning_units_subject ON learning_units(user_id, subject_id);

-- review_tasks = scheduling projection (heritage.md H-06): recalculable,
-- never the historical record of what actually happened.
CREATE TABLE IF NOT EXISTS review_tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  unit_id      INTEGER NOT NULL,
  offset_days  INTEGER NOT NULL,
  due_date     TEXT NOT NULL,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_unit ON review_tasks(user_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_review_tasks_due ON review_tasks(user_id, due_date);

CREATE TABLE IF NOT EXISTS exercises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  unit_id     INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id)
);

-- Immutable snapshot of the question/answer/hint/provenance actually shown
-- for a given attempt — editing an exercise later must never rewrite what a
-- past attempt's evidence was scored against (AC-18).
CREATE TABLE IF NOT EXISTS exercise_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  exercise_id  INTEGER NOT NULL,
  question     TEXT NOT NULL,
  answer       TEXT,
  hint         TEXT,
  provenance   TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, exercise_id) REFERENCES exercises (user_id, id)
);

-- learning_evidence = historical factual ledger (heritage.md H-06): never
-- destroyed or rewritten by a scheduler/algorithm change. review_task_id is
-- nullable (INITIAL_PRACTICE/EXTERNAL evidence isn't tied to a scheduled
-- review) — SQLite's default MATCH SIMPLE lets a composite FK with a NULL
-- column pass unchecked, so a NULL review_task_id is always valid regardless
-- of user_id.
CREATE TABLE IF NOT EXISTS learning_evidence (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  unit_id          INTEGER NOT NULL,
  review_task_id   INTEGER,
  type             TEXT NOT NULL CHECK (type IN ('REVIEW','INITIAL_PRACTICE','EXTERNAL')),
  questions_count  INTEGER,
  correct_count    INTEGER,
  evidence_date    TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id),
  FOREIGN KEY (user_id, review_task_id) REFERENCES review_tasks (user_id, id),
  CHECK (questions_count IS NULL OR questions_count > 0),
  CHECK (correct_count IS NULL OR (correct_count >= 0 AND (questions_count IS NOT NULL AND correct_count <= questions_count)))
);

CREATE INDEX IF NOT EXISTS idx_learning_evidence_unit ON learning_evidence(user_id, unit_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id),
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  review_schedule TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
