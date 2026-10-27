-- VISUAL ASSETS (experiment, isolated worktree and disposable databases only). Private images the student places inside a Resumo Mestre,
-- referenced from the text as [[fig:UUID]]: an image the student provided, or a rectangle cut from a page of an uploaded PDF.
-- The bytes live in a private media directory (never a public root); this table is the record: stable UUID, real MIME and size, hash, the
-- accessible texts, and for a PDF crop the page, the normalized rectangle and the checksum of the PDF it came from.
-- Supersedes the experimental summary_figures table of 037, which nothing reads or writes any more (earlier migrations are never edited).
-- Additive only: one new table and its indexes.
CREATE TABLE visual_assets (
  id              TEXT PRIMARY KEY CHECK (length(id) = 36),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  kind            TEXT NOT NULL CHECK (kind IN ('STUDENT_IMAGE', 'PDF_CROP')),
  filename        TEXT NOT NULL,
  mime            TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  width           INTEGER NOT NULL CHECK (width > 0),
  height          INTEGER NOT NULL CHECK (height > 0),
  byte_size       INTEGER NOT NULL CHECK (byte_size > 0),
  sha256          TEXT NOT NULL,
  caption         TEXT NOT NULL DEFAULT '',
  alt_text        TEXT NOT NULL CHECK (length(alt_text) BETWEEN 1 AND 300),
  description     TEXT,
  source_id       INTEGER,
  page_index      INTEGER CHECK (page_index IS NULL OR page_index >= 1),
  crop_x          REAL,
  crop_y          REAL,
  crop_w          REAL,
  crop_h          REAL,
  crop_rotation   INTEGER CHECK (crop_rotation IS NULL OR crop_rotation IN (0, 90, 180, 270)),
  source_checksum TEXT,
  operation_key   TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (user_id, operation_key),
  UNIQUE (user_id, filename),
  FOREIGN KEY (user_id, source_id) REFERENCES sources (user_id, id),
  CHECK ((kind = 'PDF_CROP') = (source_id IS NOT NULL)),
  CHECK (kind = 'STUDENT_IMAGE' OR (page_index IS NOT NULL AND crop_x IS NOT NULL AND crop_y IS NOT NULL AND crop_w > 0 AND crop_h > 0 AND crop_rotation IS NOT NULL AND source_checksum IS NOT NULL))
);

CREATE INDEX idx_visual_assets_owner ON visual_assets (user_id, created_at);
CREATE INDEX idx_visual_assets_source ON visual_assets (user_id, source_id);
