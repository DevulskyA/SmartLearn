-- 046 reuse of reviewed AI content between accounts, by the exact text it was written from.
-- A summary (and its questions) is looked up by the SHA-256 of the source segments that were sent to the model (generated_drafts.input_sha256)
-- plus the language it was written in. Equal digest = the same text, so the same passage of the same edition; a different passage or a
-- different edition has a different digest and never matches. A student can only receive content for text THEY uploaded themselves.
-- Nothing is shared without an explicit opt-in (reuse_consent, default OFF). Only AI content a student ACCEPTED without editing it is contributed;
-- their own edits, notes, figures and identity never enter the table (contributor_user_id exists only to honour a withdrawal and is never read by
-- another account). A reused summary still arrives as a DRAFT the receiving student reviews and accepts (AI_OUTPUT = DRAFT).
CREATE TABLE reuse_consent (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  granted    INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE shared_content (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  content_digest      TEXT NOT NULL,
  generation_locale   TEXT NOT NULL,
  source_language     TEXT,
  bib_title           TEXT,
  bib_edition         TEXT,
  bib_year            INTEGER,
  bib_isbn            TEXT,
  summary_json        TEXT NOT NULL,
  questions_json      TEXT NOT NULL DEFAULT '[]',
  provider            TEXT NOT NULL,
  model_version       TEXT NOT NULL,
  prompt_version      TEXT NOT NULL,
  contributor_user_id INTEGER NOT NULL REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
  reuse_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_shared_content_key ON shared_content (content_digest, generation_locale);
CREATE INDEX idx_shared_content_contributor ON shared_content (contributor_user_id);
