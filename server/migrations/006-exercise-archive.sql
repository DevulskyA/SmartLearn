-- T17: exercises support the same archive-not-delete pattern as subjects
-- (design.md recovery/rollback: "keep old item versions and use archive
-- instead of deleting referenced items") — a NULL archived_at means active.
ALTER TABLE exercises ADD COLUMN archived_at TEXT;
