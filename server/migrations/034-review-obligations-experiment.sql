-- HG-09 EXPERIMENT (D-12 option 3, authorized only for the isolated worktree and disposable databases; the V1 human database is NOT migrated
-- by this file until the student integrates it). Two APPEND-ONLY side tables; review_tasks is not altered and its history stays intact.
--   review_task_supersessions  an overdue review that the student did NOT perform and that a performed review of the same unit retired. It is
--                              never "completed" and never evidence: it only stops being asked for.
--   review_task_reschedules    a pending review whose due date moved because the next interval was anchored on a performed review (D-14 option
--                              ACTUAL_DATE); the original date is kept here, so the plan can always be explained and compared.
-- Both are policies the student must still approve (D-13, D-14): nothing writes to them unless the experimental route is called with a
-- policy parameter. Additive only: new tables, indexes and triggers; nothing existing is touched.
CREATE TABLE review_task_supersessions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id),
  task_id               INTEGER NOT NULL,
  superseded_by_task_id INTEGER NOT NULL,
  policy                TEXT NOT NULL CHECK (policy IN ('SUPERSEDE_OVERDUE')),
  superseded_at         TEXT NOT NULL,
  UNIQUE (user_id, task_id),
  FOREIGN KEY (user_id, task_id) REFERENCES review_tasks (user_id, id),
  FOREIGN KEY (user_id, superseded_by_task_id) REFERENCES review_tasks (user_id, id),
  CHECK (task_id != superseded_by_task_id)
);

CREATE TABLE review_task_reschedules (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  task_id             INTEGER NOT NULL,
  from_due_date       TEXT NOT NULL,
  to_due_date         TEXT NOT NULL,
  anchor              TEXT NOT NULL CHECK (anchor IN ('ACTUAL_DATE')),
  anchored_on_task_id INTEGER NOT NULL,
  rescheduled_at      TEXT NOT NULL,
  FOREIGN KEY (user_id, task_id) REFERENCES review_tasks (user_id, id),
  FOREIGN KEY (user_id, anchored_on_task_id) REFERENCES review_tasks (user_id, id),
  CHECK (from_due_date != to_due_date)
);

CREATE INDEX idx_review_task_reschedules_task ON review_task_reschedules(user_id, task_id);

CREATE TRIGGER review_task_supersessions_no_update BEFORE UPDATE ON review_task_supersessions
BEGIN SELECT RAISE(ABORT, 'review_task_supersessions is append-only'); END;
CREATE TRIGGER review_task_supersessions_no_delete BEFORE DELETE ON review_task_supersessions
BEGIN SELECT RAISE(ABORT, 'review_task_supersessions is append-only'); END;
CREATE TRIGGER review_task_reschedules_no_update BEFORE UPDATE ON review_task_reschedules
BEGIN SELECT RAISE(ABORT, 'review_task_reschedules is append-only'); END;
CREATE TRIGGER review_task_reschedules_no_delete BEFORE DELETE ON review_task_reschedules
BEGIN SELECT RAISE(ABORT, 'review_task_reschedules is append-only'); END;
