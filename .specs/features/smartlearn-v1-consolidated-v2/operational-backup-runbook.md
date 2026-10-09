# Operational backup and restore rehearsal (T50)

Operator-only (shell access). No HTTP endpoint exists for any of this, on purpose: a backup spans every user's rows.

## What a package is

```
<package>/
  database.db     consistent snapshot (SQLite backup API), live sessions removed, single file
  sources/        every accepted source PDF the snapshot references (immutable, verified against its sha256)
  manifest.json   schema version, database sha256/bytes/table counts, per-source sha256, credentials + retention statements
```

## Commands (from the repo root)

```
node server/scripts/backup.mjs --package <NEW-dir> [--db <file>] [--sources <dir>] [--retain-days N]
node server/scripts/backup.mjs --verify   <package-dir>     # non-destructive; exit 1 lists every problem
node server/scripts/backup.mjs --rehearse <package-dir>     # restore into a temp env, prove it resolves, remove the temp env
node server/scripts/backup.mjs <dest.db> [--db <file>]      # T19 database-only snapshot (unchanged)
```

Defaults come from `SMARTLEARN_DB_PATH` and `SMARTLEARN_SOURCES_DIR` (same variables the server uses).

## Guarantees (each one has a discriminating test in `server/test/operational-backup.test.js`)

- **Fail closed.** A missing or corrupt source file (size/sha256 differ from what the database recorded) aborts the whole backup; no partial directory is left.
- **Never overwrites.** The destination must not exist; a restore target must be empty. A non-empty target is left byte-identical.
- **Original untouched.** The live database is only read (backup API); sources are only read. The rehearsal writes only under the OS temp directory and reports the path and its removal.
- **No automatic deletion.** No code path deletes a backup. `--retain-days` is recorded in the manifest as an operator decision (`policy: OPERATOR_MANAGED`, `automaticDeletion: false`); pruning old backups is a manual act.
- **Damage after creation is detected.** `--verify` reports `MANIFEST_MISSING|MANIFEST_INVALID|DATABASE_MISSING|DATABASE_CORRUPT|DATABASE_CONTENT_MISMATCH|SESSIONS_PRESENT|MANIFEST_DB_MISMATCH|SOURCE_MISSING|SOURCE_CORRUPT|SOURCE_UNLISTED`; restore refuses (`RESTORE_REFUSED`) and builds nothing.
- **Resolves, not just intact.** The rehearsal opens the restored database with this codebase's own migrations (schema compatibility), checks integrity, every exercise has a version, every source file matches its checksum, and every exercise citation resolves to an existing source and an extracted page (`CITATION_SOURCE_MISSING`, `CITATION_PAGE_MISSING`).

## Credentials and sessions (explicit)

- **Included:** password hashes (a restore must let people log in). The package is a secret: keep it off shared drives, restrict it to the operator account (POSIX: files are written `0600`; on Windows set the directory ACL to the operator only — Node cannot enforce this).
- **Excluded:** live sessions and their CSRF secrets. They are removed from the COPY with `secure_delete` + `VACUUM`, so neither current nor previously deleted session material is left in free pages. Restoring an old backup therefore never resurrects a login; everyone signs in again.
- The manifest states both (`credentials.containsPasswordHashes: true`, `credentials.sessionsIncluded: false`).

## Restore for real (disaster recovery)

1. Stop the server. Keep the damaged environment as it is (do not delete it).
2. `node server/scripts/backup.mjs --verify <package>` must print `OK`; run `--rehearse` once first.
3. Restore into a NEW empty directory using the module API (`restoreOperationalBackup(package, target)`), or copy `database.db` -> `<target>/smartlearn.db` and `sources/` -> `<target>/sources/` after `--verify`.
4. Point `SMARTLEARN_DB_PATH` / `SMARTLEARN_SOURCES_DIR` at the new directory and start the server; users sign in again.

## Known limits (honest)

- Files present in the sources directory but not referenced by the database are listed in `manifest.orphanSourceFiles` and are NOT copied.
- The restore rehearsal proves the package against THIS codebase's migrations; a package from a newer schema than the running code reports `MIGRATION_INCOMPATIBLE`.
- Encryption at rest of the package is not implemented (operator responsibility; see credentials above). Off-machine copies and their retention schedule are an operator decision, not automated here.
