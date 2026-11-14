-- QUESTIONS FOR A LESSON THAT ALREADY EXISTS (summary-first journey: the student accepted the Resumo Mestre without questions and asks
-- for them later). Additive only; nothing existing is rewritten.
--   generated_drafts.target_unit_id   a draft that only ADDS exercises to this existing lesson (never creates a lesson or a review
--                                     calendar). It is reviewed like any AI output; accepting it appends the kept questions.
--                                     At most one OPEN such draft per lesson (partial unique index).
--   generation_jobs.kind              DRAFT (the original job: summary [+ questions] for a proposal) | QUESTIONS (writes the questions
--                                     of the draft named in target_draft_id, into that same draft).
--   generation_jobs.target_draft_id   the draft a QUESTIONS job writes into. Part of the immutable contract: a job never switches draft.
-- A QUESTIONS job finishes like any other job: SUCCEEDED carries the draft id (the target draft), FAILED carries its error code.
ALTER TABLE generated_drafts ADD COLUMN target_unit_id INTEGER;
CREATE UNIQUE INDEX idx_generated_drafts_one_open_lesson_questions ON generated_drafts (user_id, target_unit_id)
  WHERE target_unit_id IS NOT NULL AND status = 'DRAFT';

ALTER TABLE generation_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'DRAFT' CHECK (kind IN ('DRAFT', 'QUESTIONS'));
ALTER TABLE generation_jobs ADD COLUMN target_draft_id INTEGER;

DROP TRIGGER generation_jobs_contract_immutable;
CREATE TRIGGER generation_jobs_contract_immutable
BEFORE UPDATE OF user_id, proposal_id, provider, source_language, generation_locale, scope_digest, regenerate, estimated_units, kind, target_draft_id ON generation_jobs
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.proposal_id IS NOT OLD.proposal_id OR NEW.provider IS NOT OLD.provider
  OR NEW.source_language IS NOT OLD.source_language OR NEW.generation_locale IS NOT OLD.generation_locale
  OR NEW.scope_digest IS NOT OLD.scope_digest OR NEW.regenerate IS NOT OLD.regenerate OR NEW.estimated_units IS NOT OLD.estimated_units
  OR NEW.kind IS NOT OLD.kind OR NEW.target_draft_id IS NOT OLD.target_draft_id
BEGIN
  SELECT RAISE(ABORT, 'generation job contract is immutable: a changed scope needs a new job');
END;
