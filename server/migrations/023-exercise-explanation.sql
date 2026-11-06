-- CONTENT-QUALITY CQ-3: the WHY of an exercise, separate from its answer. `answer` is the concise
-- gabarito the student compares against; `explanation` teaches (why it is right, which confusion to
-- avoid). Nullable and additive: manual exercises, and every version created before this, simply have
-- none - the product shows nothing rather than inventing one. Versions stay immutable (AC-18): an
-- edit appends a new version row that carries the explanation forward unless the caller changes it.
ALTER TABLE exercise_versions ADD COLUMN explanation TEXT;
