-- T26: owned, time-limited import preview. A preview is a read-only plan —
-- it changes zero learning rows. Binds the exact source bytes (checksum),
-- the owning user, and the detected legacy schema version, so a stale or
-- tampered reference can never be silently reused by a later commit step.
CREATE TABLE IF NOT EXISTS import_previews (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  source_checksum   TEXT NOT NULL,
  source_version    INTEGER NOT NULL,
  normalized_json   TEXT NOT NULL,
  report_json       TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  UNIQUE (user_id, source_checksum)
);
