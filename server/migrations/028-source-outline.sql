-- SPRINT-05b (semantic unitization): the document's own structure (PDF outline / bookmarks: chapter > section >
-- subsection, each resolved to a page) as a derived, recomputable projection of the original file - replaced wholesale
-- on re-extraction like source_pages. Chunking uses it to propose units that follow the material's structure; page
-- count and size stay only as safety bounds. Only entries with a resolved page are stored. Additive only.
CREATE TABLE IF NOT EXISTS source_outline (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  source_id   INTEGER NOT NULL,
  ordinal     INTEGER NOT NULL CHECK (ordinal >= 0),
  level       INTEGER NOT NULL CHECK (level > 0),
  title       TEXT NOT NULL,
  page_index  INTEGER NOT NULL CHECK (page_index > 0),
  UNIQUE (user_id, source_id, ordinal),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_source_outline_source ON source_outline(user_id, source_id, ordinal);
