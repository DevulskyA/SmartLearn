-- Identity: owned accounts and session persistence (T08).
-- No public secret DTO is derived from these tables directly — repositories
-- expose only safe projections. email stores the normalized lookup form;
-- email_display preserves the original submitted form for UI/notification use.
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  email              TEXT NOT NULL UNIQUE,
  email_display      TEXT NOT NULL,
  password_hash      TEXT NOT NULL,
  password_salt      TEXT NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'scrypt',
  password_params    TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- token_hash stores SHA-256(opaque random token); the raw token is never
-- persisted. revoked_at NULL means active. expires_at is the absolute
-- lifetime cutoff; last_seen supports a separate inactivity-expiry policy
-- enforced at the application layer.
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  issued_at   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
