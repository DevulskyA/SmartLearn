-- C3 (audit): DRAFT_PUBLICATION_BOUNDARY requires that "aceitar deve
-- identificar inequivocamente a revisão visualizada" and that concurrent
-- edit+accept produce an explicit conflict, never a silent accept of a
-- DIFFERENT revision than the one the caller actually reviewed.
-- `revision` starts at 1 and is bumped by reviseDraft() on every edit;
-- acceptDraft() now requires the caller to pass back the exact revision
-- it read, and fails closed (REVISION_CONFLICT) if it no longer matches.
ALTER TABLE generated_drafts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE generated_drafts ADD COLUMN updated_at TEXT;
