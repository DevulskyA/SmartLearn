-- A1 (audit): exercise_source_citations previously stored only
-- (source_id, page_index) -- a POINTER into source_pages, not a durable
-- record of what was actually shown. source_pages is deliberately
-- mutable (source-extraction.js DELETEs and re-INSERTs it wholesale on
-- re-extraction, e.g. after a parser upgrade or a bad first extraction).
-- Before this migration, re-extracting a source after material had
-- already been accepted from it could silently and retroactively change
-- what an existing, already-studied citation "points to" -- exactly the
-- kind of history-corrupting drift the whole pipeline exists to prevent
-- (mirrors T17's own exercise_versions immutability: a citation is
-- accepted-into-history and must never be reinterpreted by a later,
-- unrelated write to a different table).
--
-- page_text_snapshot/parser_version_snapshot freeze the EXACT text and
-- parser identity that were real at the moment of acceptance, directly on
-- the citation row itself -- reconstructing a historical citation never
-- again depends on source_pages surviving unchanged.
ALTER TABLE exercise_source_citations ADD COLUMN page_text_snapshot TEXT;
ALTER TABLE exercise_source_citations ADD COLUMN parser_version_snapshot TEXT;
