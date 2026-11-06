-- T15: client-generated operation-key idempotency (design.md §4). A caller
-- retrying an operation whose HTTP response was lost (network ambiguity)
-- reuses the same key and gets the ORIGINAL result back, not a duplicate
-- side effect. Same key with a DIFFERENT payload is a conflict — it means
-- the caller is either reusing a key incorrectly or two different logical
-- operations collided.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  operation      TEXT NOT NULL,
  operation_key  TEXT NOT NULL,
  payload_hash   TEXT NOT NULL,
  result_json    TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (user_id, operation, operation_key)
);
