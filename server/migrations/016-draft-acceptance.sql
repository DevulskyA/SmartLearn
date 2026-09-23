-- T38: accepting a draft is a one-way, idempotent transition
-- DRAFT -> ACCEPTED. `acceptance_result_json` is the exact result the
-- FIRST acceptance produced -- a repeated call returns this stored value
-- verbatim rather than recomputing or re-inserting anything (mirrors T27's
-- commitImport: binding idempotency to the resource's own state is
-- strictly stronger than an optional client-supplied operation key).
ALTER TABLE generated_drafts ADD COLUMN accepted_at TEXT;
ALTER TABLE generated_drafts ADD COLUMN accepted_unit_id INTEGER;
ALTER TABLE generated_drafts ADD COLUMN acceptance_result_json TEXT;

-- A real, queryable link from one exercise_version to the exact source
-- page(s) it was drafted from -- "persist source-segment links
-- independently from hint text" (T36's own phrasing, extended here to the
-- exercises T38 actually creates). Never touched by hand-editing an
-- exercise's hint field; this is its own relation.
CREATE TABLE IF NOT EXISTS exercise_source_citations (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  exercise_version_id  INTEGER NOT NULL,
  source_id            INTEGER NOT NULL,
  page_index           INTEGER NOT NULL CHECK (page_index > 0),
  created_at           TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, exercise_version_id) REFERENCES exercise_versions (user_id, id),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_source_citations_version ON exercise_source_citations(user_id, exercise_version_id);
