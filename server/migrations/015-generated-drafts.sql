-- T37: a generated draft is ALWAYS status='DRAFT' -- nothing here ever
-- creates a real learning_unit/exercise; acceptance into normal study is
-- T38's separate, explicit step. draft_json holds the validated (not raw)
-- draft: quarantined citations already removed, per draft-schema.js.
-- No CHECK enum on `provider`/`status` yet, same app-layer-enforcement
-- tradeoff already recorded for `sources.status`/`exercise_attempts.
-- review_task_id` -- this table is one commit old, adding values later is
-- expected as more providers/statuses (e.g. ACCEPTED, once T38 exists) show up.
CREATE TABLE IF NOT EXISTS generated_drafts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  proposal_id    INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model_version  TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'DRAFT',
  draft_json     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, proposal_id) REFERENCES content_proposals (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_generated_drafts_proposal ON generated_drafts(user_id, proposal_id);
