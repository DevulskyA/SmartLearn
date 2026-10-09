-- T35: extraction outcome columns on `sources` (no CHECK enum, same
-- app-layer-enforcement tradeoff already recorded for `sources.status` in
-- 012 -- values are added here across time as extraction outcomes are
-- discovered) plus the per-page extracted text table.
ALTER TABLE sources ADD COLUMN extraction_status TEXT;
ALTER TABLE sources ADD COLUMN parser_version TEXT;
ALTER TABLE sources ADD COLUMN page_count INTEGER;
ALTER TABLE sources ADD COLUMN extracted_at TEXT;

-- One row per page of extracted text, with exact page provenance
-- (page_index is 1-based, matching pdf.js's own page numbering). Deleted
-- and re-inserted wholesale on re-extraction (source-extraction.js) --
-- this is a derived, recomputable projection from the immutable original
-- file, never the historical record itself (heritage.md H-06 pattern).
CREATE TABLE IF NOT EXISTS source_pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  source_id   INTEGER NOT NULL,
  page_index  INTEGER NOT NULL CHECK (page_index > 0),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, source_id, page_index),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_source_pages_source ON source_pages(user_id, source_id);
