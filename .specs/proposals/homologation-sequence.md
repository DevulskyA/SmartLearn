# Homologation sequence for the V1 candidate

Status: prepared 2026-11-08 for the owner. Nothing in this file was run against human data.
Candidate branch: `candidate/combinada-2026-11-08`. Product content hash (`scripts/build-identity.mjs` inputsHash): `1fbd3f02adc5`.

Legend: **[AGENT-DONE]** already proven on disposable data. **[OWNER]** only the owner may do it (human data, merge, release, protected decisions).

## A. Proven on disposable data (no action needed)

| Item | Proof | Command |
| --- | --- | --- |
| Backup, authorization gate, migration 034 to 041, integrity, rollback, re-migration | rehearsal passes every check | `node scripts/homologation-rehearsal.mjs` (exit 0, prints `"result": "PASS"`) |
| Native Desktop journey, 23 steps, real Codex provider | 5th paid run 23/23, exe `1fbd3f02adc5`, script `013d8ed` | `scripts/desktop-study-journey.mjs` (paid; do not rerun without authorization) |
| Native Desktop journey, offline provider | 23/23, free | `SL_JOURNEY_PROVIDER=FAKE node scripts/desktop-study-journey.mjs` |
| Server, unit and full E2E suites at `446849a` | server 1239/1239, unit 978/978, E2E 463/0/5 | see `.specs/evidence/` |

## B. Owner sequence on the real datastore

Run each step only after the previous one passes. Stop at the first failure and keep the backup.

1. **[OWNER] Close SmartLearn Desktop** and any process holding `~/SmartLearn-DevData` (the single-writer lock refuses a second writer).
2. **[OWNER] Backup.** `node scripts/dev-snapshot.mjs` writes a verified snapshot (integrity, foreign keys, row counts, sha256). Confirm with `node scripts/dev-snapshot.mjs --list` that the newest line says `VALID`. Also copy the whole `SmartLearn-DevData` folder to a place outside it.
3. **[OWNER] Restore drill.** `node scripts/dev-restore.mjs --snapshot <snapshot dir> --dest <empty dir outside SmartLearn-DevData>`. It must print `RESTORE DRILL: PASS`. This proves the rollback path before any change.
4. **[OWNER] Authorize migrations 035 to 041** for the next start only: set `SMARTLEARN_AUTHORIZE_MIGRATIONS=35,36,37,38,39,40,41` in the shell that starts the app. Without it the build refuses to migrate and leaves the database untouched (proven by the rehearsal gate checks).
5. **[OWNER] Start the candidate build once** with that variable. The app takes its own pre-migration snapshot, migrates and opens.
6. **[OWNER] Validate on the Desktop**: sign in, open Hoje, Plano and Estatisticas, open one lesson (summary and questions), open the original PDF of a cited page, answer one question and mark one review done. Compare counts of units, sources and attempts with the numbers noted before step 4.
7. **Rollback if anything is wrong**: close the app, move the current `smartlearn-dev.db` (and its `-wal`/`-shm` files) aside, copy the restored database from step 3 back as `smartlearn-dev.db`, start the PREVIOUS build. Do not delete the moved files until the owner confirms.
8. **[OWNER] Integrate** the candidate branch (HG-10), release and publish. The agent does not push, merge or release.

## C. Decisions reserved to the owner

- Integrate the combined branch (HG-10).
- Backup and authorization of migrations 035 to 041 on the real datastore (steps 2 to 5).
- Branch guard criterion: DECIDED 2026-11-08 by the owner. `scripts/work-target-guard.mjs` (identity of the checkout plus `scripts/work-branches.json`) replaced the name-only guard in every npm pre-script and dev script. The old DEV launcher and the Oficial/DEV shortcuts are untouched; the separate "SmartLearn Homologacao" shortcut is described in section F.
- V-01 (Estatisticas at 390 px, `.specs/proposals/V-01-stats-390.md`), T-F4-01 and VALID-8.
- Any further paid Codex run.

## D. Known residual risk

- E-039 (one 29.8 s stall at step 6 in 1 of 5 real runs) is not reproduced and has no proven cause. See `.specs/evidence/ui-funcional-2026-11-01/ACHADOS-PARCIAIS.md`.
- Review evidence (E-042, verified, no defect): judgments are restored from the server on reload and the conclusion is one transaction; the only thing lost if the app closes before an unsent judgment is retried is that one answer, which the student gives again. No partial or duplicated evidence.

## E. Isolated check of the corrected executable (no human data, no paid generation)

- Identity of the binary: `node scripts/desktop-identity.mjs <exe> --expected <inputsHash from scripts/build-identity.mjs>` (exit 0 = serves the expected content).
- Backend served and data path: `SL_JOURNEY_EXE=<exe> SL_JOURNEY_PROVIDER=FAKE node scripts/desktop-study-journey.mjs` (step 2 checks the window title, backend build identity, that the backend child runs from the binary's own folder, that no Node console window exists, and that the data lives in a throwaway directory; 23/23 expected).
- The launcher `scripts/launch-desktop-dev.ps1` now also refuses an exe that serves other content. It opens the human DEV datastore, so it is NOT run by the agent. The shortcuts Oficial and DEV are unchanged until the owner authorizes it.
