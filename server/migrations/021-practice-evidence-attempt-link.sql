-- T31 (010-attempt-review-link.sql) linked an attempt to the review_task it
-- happened during, so REVIEW-context learning_evidence can already be
-- reconciled with its item-level learning_events via review_task_id on both
-- tables. INITIAL_PRACTICE evidence has no review_task at all -- it is
-- created once, after the fact, from the aggregate questionsCount/
-- correctCount a finished practice session reports -- so it never had an
-- equivalent link. This is that link's practice-only counterpart.
--
-- Same tradeoff T31 already recorded: plain nullable column, no FK (SQLite's
-- ALTER TABLE ADD COLUMN cannot add a table-level composite (user_id,
-- evidence_id) FK). Ownership and same-unit are enforced at the service
-- layer (evidence.create) at the moment attempts are linked, not by the
-- database.
ALTER TABLE exercise_attempts ADD COLUMN evidence_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_exercise_attempts_evidence ON exercise_attempts(user_id, evidence_id);
