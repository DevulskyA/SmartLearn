-- RETURN-TO-SOURCE RECORD (experiment, authorized only for the isolated worktree and disposable databases; the V1 human database is NOT migrated by this
-- file until the student integrates it). A FACT about the interface, nothing more: "the student opened the original document at this page". It is not
-- reading, not understanding, not a correct answer and never evidence; the learning ledger (learning_events) is untouched and immutable.
-- Append-only. `operation_key` makes a repeated delivery of the same opening a no-op (idempotent), per owner.
-- Additive only: one new table, one index and two triggers; nothing existing is touched.
CREATE TABLE source_openings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  source_id     INTEGER NOT NULL,
  page_index    INTEGER CHECK (page_index IS NULL OR page_index >= 1),
  context       TEXT NOT NULL CHECK (context IN ('STUDY', 'REVIEW', 'EDITOR', 'PLAN', 'OTHER')),
  opened_at     TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  UNIQUE (user_id, operation_key),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id)
);

CREATE INDEX idx_source_openings_source ON source_openings(user_id, source_id, id);

CREATE TRIGGER source_openings_no_update BEFORE UPDATE ON source_openings
BEGIN SELECT RAISE(ABORT, 'source_openings is append-only'); END;
CREATE TRIGGER source_openings_no_delete BEFORE DELETE ON source_openings
BEGIN SELECT RAISE(ABORT, 'source_openings is append-only'); END;
