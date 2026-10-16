-- T29: minimal attributable item-level event schema (design.md "Reconstructed
-- learning evidence"). Renumbered from the plan's suggested "004-learning-
-- events.sql" to 009 because 004 was already committed for T13's owned
-- learning-domain schema and 005-008 for later tasks (migrations are
-- append-only once applied — same renumbering precedent T13 itself recorded
-- for the plan's original "003-learning-domain.sql").
--
-- Ownership model unchanged from 004/006: every table carries user_id NOT
-- NULL and every child FK is a COMPOSITE (user_id, parent_id) against a
-- UNIQUE(user_id, id) on the parent, so cross-user/cross-unit linkage is a
-- database-level impossibility, not just an application check.

CREATE TABLE IF NOT EXISTS competencies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  unit_id    INTEGER NOT NULL,
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, unit_id, label COLLATE NOCASE),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id)
);

-- exercise_attempts = one instance of a learner engaging one exercise
-- version. Unlike learning_events, this row is live scratch state while
-- STARTED (max_assistance/status may still change); it is not itself the
-- historical ledger. max_assistance defaults to NONE (not UNKNOWN) because
-- the app creates and fully observes every attempt it starts -- "no
-- assistance used yet" is a real observation here, not missing data. That
-- guarantee does not extend to learning_events, whose provenance can be
-- IMPORT (reconstructed from a source without that observation).
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  unit_id              INTEGER NOT NULL,
  competency_id        INTEGER,
  exercise_version_id  INTEGER NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('STARTED', 'SUBMITTED', 'ABANDONED')) DEFAULT 'STARTED',
  max_assistance       TEXT NOT NULL CHECK (max_assistance IN ('NONE', 'HINT', 'PARTIAL_SOLUTION', 'SOLUTION')) DEFAULT 'NONE',
  started_at           TEXT NOT NULL,
  submitted_at         TEXT,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id),
  FOREIGN KEY (user_id, competency_id) REFERENCES competencies (user_id, id),
  FOREIGN KEY (user_id, exercise_version_id) REFERENCES exercise_versions (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_attempts_unit ON exercise_attempts(user_id, unit_id);

-- learning_events = immutable item-level ledger (heritage.md H-06 pattern
-- extended to attempt granularity): rows are only ever inserted, never
-- updated or deleted. A CORRECTION event links back to the event it revises
-- via corrects_event_id; the original row stays byte-identical (T31).
-- UNIQUE(user_id, attempt_id, sequence) is the attempt/sequence idempotency
-- key design.md calls for: a duplicate submit for the same attempt+sequence
-- is rejected at the database level, not merely de-duplicated in a query
-- (MX11: duplicate events must not count twice).
CREATE TABLE IF NOT EXISTS learning_events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id),
  unit_id               INTEGER NOT NULL,
  competency_id         INTEGER,
  attempt_id            INTEGER NOT NULL,
  exercise_version_id   INTEGER NOT NULL,
  corrects_event_id     INTEGER,
  kind                  TEXT NOT NULL CHECK (kind IN ('ATTEMPT', 'CORRECTION')),
  sequence              INTEGER NOT NULL,
  outcome               TEXT NOT NULL CHECK (outcome IN ('CORRECT', 'INCORRECT', 'UNKNOWN')),
  assistance_available  TEXT NOT NULL CHECK (assistance_available IN ('UNKNOWN', 'NONE', 'HINT', 'PARTIAL_SOLUTION', 'SOLUTION')) DEFAULT 'UNKNOWN',
  assistance_used       TEXT NOT NULL CHECK (assistance_used IN ('UNKNOWN', 'NONE', 'HINT', 'PARTIAL_SOLUTION', 'SOLUTION')) DEFAULT 'UNKNOWN',
  assessment_method     TEXT NOT NULL CHECK (assessment_method IN ('SELF_REPORT', 'AUTOMATIC')),
  provenance            TEXT NOT NULL CHECK (provenance IN ('APP', 'IMPORT')) DEFAULT 'APP',
  schema_version        INTEGER NOT NULL DEFAULT 1,
  occurred_at           TEXT NOT NULL,
  recorded_at           TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, attempt_id, sequence),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id),
  FOREIGN KEY (user_id, competency_id) REFERENCES competencies (user_id, id),
  FOREIGN KEY (user_id, attempt_id) REFERENCES exercise_attempts (user_id, id),
  FOREIGN KEY (user_id, exercise_version_id) REFERENCES exercise_versions (user_id, id),
  FOREIGN KEY (user_id, corrects_event_id) REFERENCES learning_events (user_id, id),
  CHECK ((kind = 'CORRECTION' AND corrects_event_id IS NOT NULL) OR (kind != 'CORRECTION' AND corrects_event_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_learning_events_unit ON learning_events(user_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_attempt ON learning_events(user_id, attempt_id);
