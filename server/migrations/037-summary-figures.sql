-- SUMMARY FIGURES (experiment, isolated worktree and disposable databases only). An image the student placed inside a Resumo Mestre:
-- ![alt](smartlearn-figure:ID "caption"). The bytes live in this table, so the database file and its backup already carry them.
-- Owner-only; PNG/JPEG/WebP/GIF only (never SVG: it is a document that can carry script). `sha256` makes a repeated upload of the
-- same image per owner return the same figure. Additive only: one new table and one index.
CREATE TABLE summary_figures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  mime       TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  byte_size  INTEGER NOT NULL CHECK (byte_size > 0),
  sha256     TEXT NOT NULL,
  alt        TEXT NOT NULL CHECK (length(alt) BETWEEN 1 AND 300),
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, sha256)
);

CREATE INDEX idx_summary_figures_owner ON summary_figures(user_id, id);
