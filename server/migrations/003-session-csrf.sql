-- T10: per-session CSRF synchronizer token (design.md §3). Stored alongside
-- the session so it survives server restarts and is scoped to exactly one
-- session — logging out or having a session revoked invalidates its token too.
ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
