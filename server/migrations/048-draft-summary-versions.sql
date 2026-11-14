-- SUMMARY VERSIONS: every time the text of a draft's summary is replaced, the text that is going away is kept here, so the student can
-- list, compare and restore an earlier version and never loses what they wrote (plan conductor/tracks/p1-materiais-ia-versoes-20261114, P1-4).
--   version   the draft's summaryVersion the kept text had (the current text lives in generated_drafts and is not duplicated here)
--   origin    GENERATED (written by the AI) | HUMAN_EDITED (written or pasted by the student)
-- One row per (draft, version). The draft cascades: discarding a draft discards its history; an accepted lesson keeps its own summary.
-- Additive only: a new table; generated_drafts and every other table are untouched. No row exists until a summary is edited.
CREATE TABLE draft_summary_versions (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  draft_id   INTEGER NOT NULL,
  version    INTEGER NOT NULL CHECK (version >= 1),
  summary    TEXT NOT NULL,
  origin     TEXT NOT NULL CHECK (origin IN ('GENERATED', 'HUMAN_EDITED')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, draft_id, version),
  FOREIGN KEY (user_id, draft_id) REFERENCES generated_drafts (user_id, id) ON DELETE CASCADE
);
