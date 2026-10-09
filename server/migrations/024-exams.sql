-- EXAM-1: Modo Prova. An exam groups the exercises of one unit, captures the exact exercise VERSION shown
-- (so a later edit never changes a submitted exam, AC-18), stores the student's typed answer per item, and
-- only after SUBMITTED does the API expose the gabarito/explanation/hint/sources. IN_PROGRESS exams never
-- return them (server-side, not just hidden in the UI). Correction (student self-judgement per item) and the
-- evidence written on CORRECTED come with EXAM-2/EXAM-3; the columns for them exist now and stay NULL.
CREATE TABLE IF NOT EXISTS exams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  unit_id       INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('IN_PROGRESS','SUBMITTED','CORRECTED')),
  started_at    TEXT NOT NULL,
  submitted_at  TEXT,
  corrected_at  TEXT,
  evidence_id   INTEGER,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_exams_unit ON exams(user_id, unit_id, status);

CREATE TABLE IF NOT EXISTS exam_items (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id),
  exam_id               INTEGER NOT NULL,
  exercise_id           INTEGER NOT NULL,
  exercise_version_id   INTEGER NOT NULL,
  position              INTEGER NOT NULL CHECK (position >= 0),
  student_answer        TEXT,
  outcome               TEXT CHECK (outcome IN ('CORRECT','INCORRECT')),
  UNIQUE (user_id, id),
  UNIQUE (exam_id, position),
  FOREIGN KEY (user_id, exam_id) REFERENCES exams (user_id, id),
  FOREIGN KEY (user_id, exercise_id) REFERENCES exercises (user_id, id),
  FOREIGN KEY (user_id, exercise_version_id) REFERENCES exercise_versions (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_exam_items_exam ON exam_items(user_id, exam_id);
