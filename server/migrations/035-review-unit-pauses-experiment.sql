-- HG-09 EXPERIMENT (authorized only for the isolated worktree and disposable databases; the V1 human database is NOT migrated by this file until the
-- student integrates it). Pausing a unit's reviews is a FACT the student states, kept as an append-only event log; it never completes, retires or
-- re-dates anything and never counts as learning. The unit's CURRENT state is its latest event (no row = not paused).
-- Additive only: one new table, one index and two triggers; nothing existing is touched.
CREATE TABLE review_unit_pauses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  unit_id INTEGER NOT NULL,
  action  TEXT NOT NULL CHECK (action IN ('PAUSE', 'RESUME')),
  at      TEXT NOT NULL,
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id)
);

CREATE INDEX idx_review_unit_pauses_unit ON review_unit_pauses(user_id, unit_id, id);

CREATE TRIGGER review_unit_pauses_no_update BEFORE UPDATE ON review_unit_pauses
BEGIN SELECT RAISE(ABORT, 'review_unit_pauses is append-only'); END;
CREATE TRIGGER review_unit_pauses_no_delete BEFORE DELETE ON review_unit_pauses
BEGIN SELECT RAISE(ABORT, 'review_unit_pauses is append-only'); END;
