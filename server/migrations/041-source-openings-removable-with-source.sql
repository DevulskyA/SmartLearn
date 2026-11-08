-- Removing a source must also remove the opening records that point at it (DELETE /sources/:id does it in one transaction). Migration 036 made
-- source_openings append-only with an unconditional delete trigger, so removing any source that had been opened failed with a 500 and nothing was removed.
-- The records stay append-only for every other purpose: a delete is refused while the source still exists; once the source row is gone (the removal
-- transaction deletes it first, with foreign-key checks deferred to commit) the dependent records may go. Additive: one trigger replaced, no row touched.
DROP TRIGGER source_openings_no_delete;
CREATE TRIGGER source_openings_no_delete BEFORE DELETE ON source_openings
WHEN EXISTS (SELECT 1 FROM sources WHERE user_id = OLD.user_id AND id = OLD.source_id)
BEGIN SELECT RAISE(ABORT, 'source_openings is append-only while its source exists'); END;
