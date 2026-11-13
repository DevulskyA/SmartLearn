-- DRAFT REPLACEMENTS: a summary regenerated over an existing one keeps the previous draft until the student decides which to keep
-- (spec .specs/proposals/RESUMO-ATUAL-E-LIXEIRA-2026-11-12.md). One row = one decision pending for one proposal (the unit of pages):
--   new_draft_id       the draft that was just generated and is now the current one
--   previous_draft_id  the draft it replaced, kept untouched until the decision
--   expires_at         created_at + 30 days: with no decision the previous draft is deleted and the new one simply stays
-- KEEP_NEW deletes the previous draft, RESTORE_PREVIOUS deletes the new one; either way this row goes. An ACCEPTED draft is a lesson
-- in study and is never deleted through this table. At most ONE decision pending per proposal (the primary key).
-- Both draft columns cascade: removing a source or a proposal deletes its drafts, and the decision about them goes with them.
-- proposal_id carries no foreign key on purpose (same as generation_jobs): re-cutting a source deletes its proposals.
-- Additive only: a new table and one index; generated_drafts and every other table are untouched. No row exists until a student regenerates.
CREATE TABLE draft_replacements (
  user_id           INTEGER NOT NULL REFERENCES users(id),
  proposal_id       INTEGER NOT NULL,
  new_draft_id      INTEGER NOT NULL,
  previous_draft_id INTEGER NOT NULL,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, proposal_id),
  FOREIGN KEY (user_id, new_draft_id) REFERENCES generated_drafts (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, previous_draft_id) REFERENCES generated_drafts (user_id, id) ON DELETE CASCADE,
  CHECK (new_draft_id <> previous_draft_id)
);
CREATE INDEX idx_draft_replacements_expiry ON draft_replacements (expires_at);
