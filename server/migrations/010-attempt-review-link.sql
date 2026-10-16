-- T31: links an exercise_attempt to the review_task it happened during (if
-- any) -- direct practice outside a review (e.g. a future standalone
-- practice screen) leaves this NULL. Needed to reconcile item-level
-- learning_events with the review's aggregate learning_evidence row without
-- double-counting the same practice (design.md "Reconciled item
-- observations with aggregate results").
--
-- Plain nullable column, no FK constraint added: SQLite's ALTER TABLE ADD
-- COLUMN cannot add a table-level composite (user_id, review_task_id) FK
-- (only a column-level constraint), and recreating exercise_attempts to add
-- one is unwarranted extra migration risk over one column on a table with
-- no production data yet -- same app-layer-enforcement tradeoff T17 already
-- recorded for exercises.provenance. attempts.start() enforces ownership
-- AND same-unit at the service layer before ever writing this column.
ALTER TABLE exercise_attempts ADD COLUMN review_task_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_exercise_attempts_review_task ON exercise_attempts(user_id, review_task_id);
