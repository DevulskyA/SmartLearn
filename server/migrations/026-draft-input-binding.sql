-- SPRINT-04 (draft <-> extraction binding): a draft records exactly which source text produced it.
--   input_sha256                   SHA-256 of the (pageIndex, text) segments that were sent to the provider.
--                                  Accepting compares it with the proposal's current segments: a mismatch means the
--                                  source was re-extracted with different text after generation (SOURCE_CHANGED).
--   source_extraction_generation   sources.extraction_generation at generation time (diagnostic only; the hash decides,
--                                  so re-extracting IDENTICAL text never invalidates a draft).
-- Both NULL for drafts created before this migration: unknown, never treated as changed. Additive only.
ALTER TABLE generated_drafts ADD COLUMN source_extraction_generation INTEGER;
ALTER TABLE generated_drafts ADD COLUMN input_sha256 TEXT;
