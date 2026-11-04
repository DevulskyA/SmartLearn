-- HG-09: "Adiar vencidas". The student moves overdue reviews to future days. The review stays PENDING and keeps its stage (offset_days): it is never
-- completed, never evidence, never deleted. review_tasks.due_date moves, and the date it had stays here, append-only, so the plan can always be explained.
-- Additive only: one new table, one index and two triggers; nothing existing is touched.
CREATE TABLE review_task_postponements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  task_id       INTEGER NOT NULL,
  from_due_date TEXT NOT NULL,
  to_due_date   TEXT NOT NULL,
  postponed_at  TEXT NOT NULL,
  FOREIGN KEY (user_id, task_id) REFERENCES review_tasks (user_id, id),
  CHECK (to_due_date > from_due_date)
);

CREATE INDEX idx_review_task_postponements_task ON review_task_postponements(user_id, task_id);

CREATE TRIGGER review_task_postponements_no_update BEFORE UPDATE ON review_task_postponements
BEGIN SELECT RAISE(ABORT, 'review_task_postponements is append-only'); END;
CREATE TRIGGER review_task_postponements_no_delete BEFORE DELETE ON review_task_postponements
BEGIN SELECT RAISE(ABORT, 'review_task_postponements is append-only'); END;
