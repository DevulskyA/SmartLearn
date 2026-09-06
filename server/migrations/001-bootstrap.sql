-- Bootstrap migration: infrastructure only, no domain schema.
-- schema_migrations is owned by the migrations runner, not this file.
CREATE TABLE IF NOT EXISTS server_meta (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);
