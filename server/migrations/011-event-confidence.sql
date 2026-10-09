-- T32: learning_events gained no way to record confidence in T29 even
-- though design.md requires it ("Confidence is optional and never forced
-- on every action") and explicitly separate from correctness. Added now,
-- retroactively, because T32's evidence profile is the first consumer that
-- actually needs to keep the two apart -- adding it earlier would have been
-- speculative. Nullable REAL: omitted stays NULL (unknown), never coerced
-- into a fake 0 or 1. The CHECK references only this new column, which
-- SQLite's ALTER TABLE ADD COLUMN does allow.
ALTER TABLE learning_events ADD COLUMN confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
