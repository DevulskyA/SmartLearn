-- T36: inspectable source-to-unit proposals. A proposal is a real,
-- structured link to an exact page range of one source (`source_id` +
-- `page_start`/`page_end`) -- never a free-text description of "where this
-- came from". No unit/exercise is ever created here; acceptance into the
-- real learning domain is T38's job, which will link to a proposal id
-- rather than duplicating the page range.
CREATE TABLE IF NOT EXISTS content_proposals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  source_id    INTEGER NOT NULL,
  chunk_index  INTEGER NOT NULL,
  page_start   INTEGER NOT NULL CHECK (page_start > 0),
  page_end     INTEGER NOT NULL CHECK (page_end >= page_start),
  title        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, source_id, chunk_index),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_content_proposals_source ON content_proposals(user_id, source_id);
