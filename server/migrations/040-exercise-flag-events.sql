-- "Questao com problema": after answering, the student marks a question as problematic (reason from a short list, optional comment) and can take the mark back.
-- A mark is an ANNOTATION about the question. It is not a grade and not learning evidence: nothing in learning_events, learning_evidence, exercise_attempts,
-- review_tasks or any statistic reads or changes because of it. Append-only: marking and unmarking are both new rows (FLAG / CLEAR), the current state of a
-- question is its latest row. A FLAG always names the answered attempt that justified it (the service checks that attempt is SUBMITTED and is of this exercise).
-- Additive only: one new table, one index and two triggers; nothing existing is touched.
CREATE TABLE exercise_flag_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  exercise_id INTEGER NOT NULL,
  attempt_id  INTEGER,
  action      TEXT NOT NULL CHECK (action IN ('FLAG', 'CLEAR')),
  reason      TEXT CHECK (reason IN ('CONFUSING_STATEMENT', 'DOUBTFUL_ANSWER_KEY', 'CONTENT_ERROR', 'OTHER')),
  comment     TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (user_id, exercise_id) REFERENCES exercises (user_id, id),
  FOREIGN KEY (user_id, attempt_id) REFERENCES exercise_attempts (user_id, id),
  CHECK (
    (action = 'FLAG' AND reason IS NOT NULL AND attempt_id IS NOT NULL)
    OR (action = 'CLEAR' AND reason IS NULL AND comment IS NULL AND attempt_id IS NULL)
  )
);

CREATE INDEX idx_exercise_flag_events_exercise ON exercise_flag_events(user_id, exercise_id, id);

CREATE TRIGGER exercise_flag_events_no_update BEFORE UPDATE ON exercise_flag_events
BEGIN SELECT RAISE(ABORT, 'exercise_flag_events is append-only'); END;
CREATE TRIGGER exercise_flag_events_no_delete BEFORE DELETE ON exercise_flag_events
BEGIN SELECT RAISE(ABORT, 'exercise_flag_events is append-only'); END;
