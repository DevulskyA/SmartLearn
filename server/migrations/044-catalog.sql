-- 044 catalog: works and editions (bibliographic metadata only) and the link from a student's file to an edition.
-- ADDITIVE: four new tables, no existing table, row or column is touched.
--
-- Privacy split. catalog_works / catalog_editions / catalog_edition_maps hold ONLY bibliographic facts (title key, edition number, year,
-- ISBN, a chapter correspondence): no file, no page text, no summary and no question of any student, so they can be shared between accounts.
-- source_editions is the PRIVATE side: it belongs to one user_id and points at that user's own file (composite FK, like every private table).
-- Nothing here makes a summary or a question public; sharing content is a separate, explicit decision with its own permission record.
CREATE TABLE catalog_works (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title_key  TEXT NOT NULL CHECK (length(title_key) > 0),
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_catalog_works_title ON catalog_works (title_key);

CREATE TABLE catalog_editions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id        INTEGER NOT NULL REFERENCES catalog_works (id),
  edition_number INTEGER CHECK (edition_number IS NULL OR edition_number > 0),
  year           INTEGER CHECK (year IS NULL OR (year >= 1950 AND year <= 2049)),
  isbn13         TEXT CHECK (isbn13 IS NULL OR length(isbn13) = 13),
  kind           TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (kind IN ('BOOK', 'HANDOUT', 'NOTES', 'TRANSCRIPT', 'UNKNOWN')),
  created_at     TEXT NOT NULL
);
-- an ISBN names exactly one edition: it is the only key that merges two uploads by itself
CREATE UNIQUE INDEX idx_catalog_editions_isbn ON catalog_editions (isbn13) WHERE isbn13 IS NOT NULL;
CREATE INDEX idx_catalog_editions_work ON catalog_editions (work_id, edition_number, year);

CREATE TABLE source_editions (
  user_id    INTEGER NOT NULL REFERENCES users (id),
  source_id  INTEGER NOT NULL,
  edition_id INTEGER NOT NULL REFERENCES catalog_editions (id),
  confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  methods    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source_id),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_source_editions_edition ON source_editions (edition_id);

-- A correspondence between two editions of the same work. `verified` stays 0 until a person or an exact content check confirms it;
-- only verified EQUIVALENT rows let anything be carried from one edition to the other (see server/src/catalog/reuse-gate.js).
CREATE TABLE catalog_edition_maps (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  from_edition_id  INTEGER NOT NULL REFERENCES catalog_editions (id),
  to_edition_id    INTEGER NOT NULL REFERENCES catalog_editions (id),
  from_title_key   TEXT,
  to_title_key     TEXT,
  from_page_start  INTEGER, from_page_end INTEGER,
  to_page_start    INTEGER, to_page_end   INTEGER,
  relation         TEXT NOT NULL CHECK (relation IN ('EQUIVALENT', 'REVISED', 'REMOVED', 'NEW')),
  verified         INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  verified_method  TEXT CHECK (verified_method IS NULL OR verified_method IN ('MANUAL', 'EXACT_TEXT')),
  created_at       TEXT NOT NULL,
  CHECK (from_edition_id <> to_edition_id),
  CHECK (verified = 0 OR verified_method IS NOT NULL)
);
CREATE INDEX idx_catalog_maps_pair ON catalog_edition_maps (from_edition_id, to_edition_id);
