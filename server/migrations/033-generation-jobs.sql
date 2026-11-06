-- GENERATION JOBS (R-04 AC-04.1, R-12, R-13, INV-13). One row per attempt to generate a draft from one approved proposal, so the
-- student can see what is happening, leave and come back, and the system never leaves a process or a half result behind.
--   state  QUEUED | CALLING_PROVIDER | STALLED (a warning, not a failure) | SUCCEEDED | FAILED | CANCELLED
--   phase  what the job is doing now, for the student (the services own the vocabulary)
-- The contract of a job is fixed when it is created and NEVER widened afterwards: the owner, the approved proposal, the digest of
-- the exact source text it was approved on (scope_digest), the languages, the provider and the cost estimate are immutable (a
-- trigger refuses any edit). Running on other or more text needs a NEW job, validated and priced again.
-- At most ONE active job per proposal (partial unique index): a second request finds the existing job instead of a second run.
-- proposal_id carries no foreign key on purpose: re-cutting a source deletes its proposals and a finished job is history.
-- reservation_id points at the credit ledger (032) once the job runs; consumed_units is the final consumption.
-- Additive only: a new table, indexes and trigger; nothing existing is touched.
CREATE TABLE generation_jobs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  proposal_id         INTEGER NOT NULL,
  state               TEXT NOT NULL CHECK (state IN ('QUEUED', 'CALLING_PROVIDER', 'STALLED', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  phase               TEXT NOT NULL,
  provider            TEXT NOT NULL,
  source_language     TEXT,
  generation_locale   TEXT NOT NULL,
  scope_digest        TEXT NOT NULL,
  regenerate          INTEGER NOT NULL DEFAULT 0 CHECK (regenerate IN (0, 1)),
  estimated_units     INTEGER NOT NULL CHECK (estimated_units >= 0),
  reservation_id      INTEGER REFERENCES generation_reservations(id),
  consumed_units      INTEGER CHECK (consumed_units IS NULL OR consumed_units >= 0),
  created_at          TEXT NOT NULL,
  started_at          TEXT,
  last_activity_at    TEXT NOT NULL,
  finished_at         TEXT,
  error_code          TEXT,
  error_message       TEXT,
  draft_id            INTEGER REFERENCES generated_drafts(id),
  cancel_requested_at TEXT,
  UNIQUE (user_id, id)
);
CREATE UNIQUE INDEX idx_generation_jobs_one_active ON generation_jobs (user_id, proposal_id)
  WHERE state IN ('QUEUED', 'CALLING_PROVIDER', 'STALLED');
CREATE INDEX idx_generation_jobs_user ON generation_jobs (user_id, id);
CREATE INDEX idx_generation_jobs_state ON generation_jobs (state);

CREATE TRIGGER generation_jobs_contract_immutable
BEFORE UPDATE OF user_id, proposal_id, provider, source_language, generation_locale, scope_digest, regenerate, estimated_units ON generation_jobs
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.proposal_id IS NOT OLD.proposal_id OR NEW.provider IS NOT OLD.provider
  OR NEW.source_language IS NOT OLD.source_language OR NEW.generation_locale IS NOT OLD.generation_locale
  OR NEW.scope_digest IS NOT OLD.scope_digest OR NEW.regenerate IS NOT OLD.regenerate OR NEW.estimated_units IS NOT OLD.estimated_units
BEGIN
  SELECT RAISE(ABORT, 'generation job contract is immutable: a changed scope needs a new job');
END;
