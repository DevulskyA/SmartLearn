# Migration runbook — legacy local export -> server account (T25-T28)

Scope: migrating a legacy local export (v1/v2/v3 JSON, produced by `src/db.js`'s
`exportAll()` on an older client-authoritative install) into a real, owned
account on the central server. Built across T25 (normalize), T26 (preview),
T27 (commit), T28 (this UI + rehearsal).

## Pipeline

1. **Normalize** (`shared/import-normalization.js`, T25) — pure, read-only.
   Rejects the whole source (never a partial success) on any unsupported
   version, duplicate id, invalid date, dangling reference, invalid count,
   unrecognized exercise provenance, or a scored review task with no
   matching evidence row.
2. **Preview** (`POST /v1/imports/preview`, T26) — computes a real SHA-256
   checksum of the exact bytes received, reports counts/warnings/conflicts/
   proposed mapping scoped to the caller's own account, and persists nothing
   into any learning table. Expires after 30 minutes.
3. **Commit** (`POST /v1/imports/:id/commit`, T27) — applies the previewed
   rows in one bounded transaction. Refuses outright if any name conflict is
   unresolved. Idempotent by previewId: re-committing the same id is a safe
   no-op, never a duplicate.
4. **UI** (`src/migration-ui.js` + the "Importar de um backup antigo" card
   on Configurações, T28) — the only product surface that drives 1-3 for a
   real user. REMOTE_MODE-only; there is no local-only equivalent.

## HUMAN_GATE: REAL_USER_MIGRATION_APPROVAL

**This pipeline is built and rehearsed, not yet approved for a real user's
own legacy data.**

T28's own e2e coverage (`e2e/migration.spec.js`) proves the full flow works
end-to-end — but every one of those runs is a **fixture rehearsal**: a
synthetic test account (`mig-<timestamp>-<random>@example.com`), created and
discarded for that one test, migrating the fixed `server/test/import-fixtures/
v3-schema.json` fixture. Per design.md/T28's own scoping instruction — "Leave
real-user migration as a named authorization gate; never count a fixture
rehearsal as the real-user cutover" — **no fixture rehearsal, however
thorough, stands in for that authorization.**

Before running this flow against an actual user's actual exported data:

- [ ] The specific user's export file has been identified and its
      `schemaVersion` confirmed supported (1, 2, or 3).
- [ ] A separate, current physical backup of the server database exists
      (`server/scripts/backup.mjs`), taken immediately before the run.
- [ ] The user has been shown the preview report (counts/warnings/conflicts)
      for their own actual file before confirming — this is a human
      decision, not something to script or bypass.
- [ ] Whoever runs it records: date, account, source file
      description/checksum, and the resulting commit's `previewId`/
      `checksum`/`counts` (the downloadable report from the UI's "Baixar
      relatório" button is sufficient for this).
- [ ] This checklist is filled in and committed (or otherwise recorded)
      *before* the real run, not reconstructed after.

**Live approval status: NOT GRANTED.** No real-user migration has been
authorized or performed as of T28's completion. This section is the
explicit, named gate design.md/T28 require to exist — filling it in later,
for an actual approved run, is expected; deleting or silently bypassing it
is not.

## Recovery / rollback

- The source file itself is never written to by any step in this pipeline —
  it is only read (as bytes, then parsed JSON) into memory. `e2e/
  migration.spec.js`'s first test asserts the fixture file is byte-identical
  on disk after a full successful run.
- A preview has no effect on any learning table (T26) — cancelling one, or
  letting one expire, leaves the account exactly as it was.
- A commit is one transaction (T27): any failure inside it — an unresolved
  reference, a reconciliation mismatch — rolls back everything, leaving zero
  partial rows. Proven per entity boundary in `server/test/
  import-commit.test.js`.
- A name conflict blocks the whole commit rather than partially applying or
  silently overwriting (`e2e/migration.spec.js`'s third test). Resolving a
  conflict (renaming the source data, or the existing account data) and
  re-uploading is the only supported path — there is no remap-in-place UI
  yet.
- If a commit is believed to have gone wrong after the fact, the pre-run
  physical backup (see checklist above) is the recovery path — this
  pipeline does not attempt to auto-detect or auto-undo a bad commit after
  it lands.
