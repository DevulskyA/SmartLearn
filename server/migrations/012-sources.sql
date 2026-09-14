-- T34: private uploaded source files (PDFs). Renumbered from the plan's
-- suggested "005-sources.sql" to 012 -- 005-011 are already committed for
-- T15/T17/T26/T27/T29/T31/T32, migrations are append-only once applied,
-- same renumbering precedent T13 recorded for the plan's original
-- "003-learning-domain.sql".
--
-- The actual PDF bytes live on disk under config.sourcesDir, named by a
-- random on-disk filename (`filename`) that has NO relationship to the
-- user-supplied `original_name` -- the latter is display-only metadata,
-- never used to build a filesystem path (this is what makes a path-
-- traversal attempt in the original filename structurally inert: it is
-- stored as an opaque string, never interpolated into a path).
--
-- `status` has no CHECK enum yet, deliberately: T34 only ever writes
-- 'UPLOADED', but T35 (PDF text extraction) will need to add further
-- values (e.g. extraction success/failure/encrypted/image-only) and
-- SQLite cannot widen an existing CHECK without a full table rebuild --
-- same app-layer-enforcement tradeoff already recorded for
-- exercises.provenance (T17) and exercise_attempts.review_task_id (T31).
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  byte_size     INTEGER NOT NULL CHECK (byte_size > 0),
  checksum      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'UPLOADED',
  created_at    TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, checksum)
);

CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
