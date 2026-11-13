-- 044 source bibliography: what a file says about itself (title, authors, edition, year, language, ISBN), stored ON the existing source.
-- ADDITIVE: eight nullable columns on `sources`; no row, constraint or other table is touched, so every existing source keeps working with all of them NULL.
-- bib_origins is a JSON object {field: origin} saying where each value came from: PDF_METADATA, TEXT (read from the first pages, ISBN checked by its
-- check digit), TEXT_HEURISTIC, FILE_NAME, or USER (typed by the student). A field without an origin is unknown; nothing is invented.
-- A value with origin USER is never overwritten by a later extraction. Two different editions stay two different sources (checksum is unchanged
-- and unique per user); their ISBN / edition / year tell them apart. No shared catalog, no cross-user data: the columns belong to the user's own row.
ALTER TABLE sources ADD COLUMN bib_title TEXT;
ALTER TABLE sources ADD COLUMN bib_authors TEXT;
ALTER TABLE sources ADD COLUMN bib_edition TEXT;
ALTER TABLE sources ADD COLUMN bib_year INTEGER;
ALTER TABLE sources ADD COLUMN bib_language TEXT;
ALTER TABLE sources ADD COLUMN bib_isbn TEXT;
ALTER TABLE sources ADD COLUMN bib_origins TEXT;
ALTER TABLE sources ADD COLUMN bib_updated_at TEXT;
