-- CONTENT-QUALITY CQ-2: the Resumo Mestre of an ACCEPTED, AI-generated unit records which source
-- pages it was drafted from. Mirrors exercise_source_citations (016 + 018): the page text is FROZEN
-- on the citation row at acceptance, so re-extracting a source later can never change what an
-- already-studied summary "points to". Additive: manual units and units accepted before this
-- migration simply have no rows (the UI shows no origin rather than inventing one).
CREATE TABLE IF NOT EXISTS unit_summary_citations (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER NOT NULL REFERENCES users(id),
  unit_id                  INTEGER NOT NULL,
  source_id                INTEGER NOT NULL,
  page_index               INTEGER NOT NULL CHECK (page_index > 0),
  page_text_snapshot       TEXT,
  parser_version_snapshot  TEXT,
  created_at               TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, unit_id) REFERENCES learning_units (user_id, id),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_unit_summary_citations_unit ON unit_summary_citations(user_id, unit_id);
