# VALID-4 — TLC checkpoint (PDF → IA → DRAFT → edição)

VALID-4 = NOT_PROVEN. This file is the working checkpoint of the correction cycle opened after the first real Desktop run
(Costanzo, Codex, 2026-10-03). Defect register: memory `project_valid4_defect_register`. Rule given by the human during the
cycle: **no more Codex work and no text sent to Codex while fixing the interface.** No generation was run in this cycle.

## Findings → status

| Finding | Root cause (proved) | Fix | Proof |
|---|---|---|---|
| Whole book listed / editorial pages offered | outline units were page-bounded; no classification | `unit-kind.js` (kind + `effectiveKind` for legacy rows), editorial units refused before any provider (`NOT_GENERATABLE`), listed apart | `unit-kind.test`, `source-scope.test` (incl. legacy row) |
| Neighbour text in the unit (PAH sample problem in Glomerular Filtration) | page 267 holds the tail of *Renal Blood Flow* printed AFTER the next heading (content-stream order); unit = whole pages | units are SPANS owned by outline headings (`section-spans.js`); real Costanzo: Glomerular Filtration 267–273 = 23.317 chars, no PAH sample; Measurement of GFR = 6.014 chars from offset 3478 | `section-spans.test`, real-data check, mutation (offsets ignored → 7 fail) |
| Payload not provable | only a sha256 was stored | `assertPayloadWithinScope` re-reads stored pages and compares BEFORE the provider call; `sourceScope` stored with the draft | `source-scope.test` (4 mutations killed) |
| Topic selection | no way to choose a subsection | `GET /sources/:id/topics`, `POST /sources/:id/scopes` (section or page/offset range) | `source-scope.test`, `lesson-editor.spec` |
| Lesson = one vertical flow | draft was one JSON blob replaced whole | stable question ids, per-entity versions, granular `PATCH summary` / `PATCH|DELETE question`, rejected questions never become exercises | `lesson-granular-edit.test` (9) |
| UI: audit/controls/other units mixed with content | one container, `textContent` glued | lesson editor (Resumo/Questões/Fonte/Revisão), list replaced by the editor, findings carry `entityId` | `lesson-editor.spec` (9), `lesson-view-model.test` |
| 67 false audit alerts | word-overlap compared PT draft against EN source | `language-detect.js`; lexical checks step aside across languages, numbers/units/citations/duplicates/leaks stay | `draft-audit-cross-language.test`; real draft 67 → 0 actionable |
| Stale Desktop (07/09 release opened by shortcut) | shortcuts pointed at release/installed exe | `scripts/launch-desktop-dev.ps1`, `scripts/install-dev-shortcut.ps1`, build identity line (`/health/build`) | `desktop-entrypoint.test`, `health.test` |

## NOT done (explicitly)

- Codex job observability (job id / phase / last activity / stall + hard timeout / cancel): designed and partly prototyped, then
  **reverted on the human's instruction** (no Codex changes). Probe result worth keeping: `codex exec --json` emits only
  `thread.started`, `turn.started`, `item.completed`, `turn.completed`; a long reasoning step is silent, so "last activity" from
  output alone would flag a healthy call as stalled — a stall policy needs a generous silence limit and a CPU/liveness signal.
  The screen shows elapsed time only, labelled as such (the server reports no progress).
- Regenerate ONE question (needs a single-question contract with the model).
- Structured Resumo Mestre from the model (prompt unchanged; the editor supports `##` headings and a reading view).
- Deterministic cross-language *qualifier* / unsupported-fact sensors (only values, units, citations, duplicates, leaks); semantic
  support across languages depends on the model audit and the human.
- Bounded question volume (35 questions for ~6 pages): prompt says "as many as the source supports"; no cap added (prompt untouched).
- Orphan `codex` child after the Desktop closes (the Rust wrapper kills `node`, not its child).

## Next action

Human test on the canonical Desktop (`SmartLearn DEV`): open the existing Costanzo draft in the new lesson editor, topic-search
"Measurement of Glomerular Filtration Rate", inspect the approved scope — without generating.

## Handoff state (end of session)

- Full e2e suite was running in the background, output in `C:\tmp\e2e-full.txt` (Git Bash `/tmp/e2e-full.txt`); partial: 1 failure so far
  (`exam-mode.spec.js:413` UX-1, Plano — likely the known PRE_EXISTING_FLAKE; confirm against the VALID-3 baseline). If the file has no
  final "N passed / N failed" line, the run was interrupted: rerun `npx playwright test`.
- Last commit before this note: `54eea47`. The commit after it adds "Documentos já enviados" (reopen a processed PDF without
  re-sending it): `GET /v1/sources` now carries `extractionStatus` and `pageCount`; UI in `materials-ui.js`. Its e2e
  (`lesson-editor.spec.js`, last test) has NOT been run yet. Server tests for it pass.
- MATERIALS_FULL_E2E_REGRESSION = NOT_YET_PROVEN; VISUAL_UI_VALIDATION = NOT_PROVEN (computer control was disabled).
- Desktop DEV opens via `Desktop\SmartLearn DEV.lnk`. To see the new screen without Codex: login with the test account
  (`%TEMP%\claude\valid4-test-account.txt`), Materiais → "Documentos já enviados" → Abrir → "Abrir rascunho".
- CODEX calls this phase: 0 (one trivial diagnostic probe before the instruction, no PDF text).

## Closure of the UI-architecture phase (resumed session)

- server 766/766, frontend 432/432, full e2e 198 passed + 2 opt-in skipped (1 axe failure was a Playwright trace-artifact ENOENT after a killed orphan run; `accessibility.spec.js` 5/5 on rerun); after the last fix the materials/lesson subset reran 32/32.
- New proof: 4-question sequence re-read from the DB (Q3 edit, summary edit, Q2 reject, accept), content/audit/UI separation, UI reload persistence.
- Defects found and fixed: launcher crashed on a clean tree (null `.Trim()`); whole-list revise silently reset REJECTED questions when the count changed.
- Codex calls this phase: 0. Visual validation: AWAITING_HUMAN (Desktop DEV open). VALID-4 stays NOT_PROVEN.

## Data continuity (P0, resolved)

- Cause: two datastores by design. `dev:remote` used `C:\Users\Ariel\SmartLearn-DevData\smartlearn-dev.db`; the Desktop (Tauri, local authority) used `%APPDATA%\com.devulsky.smartlearn\smartlearn-server\smartlearn.db`. The DEV launcher created in the UI phase pinned neither, so the Desktop opened the app-data database. No data was deleted (no sqlite_sequence gaps).
- Fix: launcher pins `SmartLearn-DevData\smartlearn-dev.db` + `sources`, refuses a missing or busy datastore; Tauri honours `SMARTLEARN_DB_PATH`/`SMARTLEARN_SOURCES_DIR` (`with_data_overrides`, Rust test). `scripts/dev-import-sources.mjs` imported the Costanzo subgraph (1 source, 496 pages, 898 outline, 165 proposals, 1 draft) into the DEV database under `dev@smartlearn.local` with remapped ids; idempotent; originals and backups under `C:\Projetos\SmartLearn-db-backups\` untouched.
- Rule: HUMAN DEV DATA != TEST DATA (`test/test-db-isolation.test.js` forbids tests from naming the human datastore).

## DEV session, app identity, artifact hygiene

- Session: `SMARTLEARN_DEV_PERSISTENT_SESSION=true` (set only by `scripts/launch-desktop-dev.ps1`; the server refuses it in production) gives a persistent cookie (Max-Age ~10y) and a ~10y server-side session; `Sair` revokes the row and clears the cookie. Proven on the real Desktop (WebView2 over CDP): login -> close -> reopen -> reopen -> Sair -> close -> reopen (login form) -> login -> close -> reopen (logged in).
- Identity: version = root `package.json` (Tauri references it; `server/package.json` and `Cargo.toml` guarded equal by test); commit and channel embedded by Vite at build (`scripts/build-identity.mjs`, `dist/build-info.json`); shown under the navigation and in Configuracoes > Sobre; launcher refuses a stale bundle and records the running executable in `SmartLearn-DevData/last-launch.json`.
- Canonical entry: `npm run dev:desktop` (= `scripts/launch-desktop-dev.ps1`), executable `src-tauri/target/debug/smartlearn.exe` of the canonical worktree, database `SmartLearn-DevData/smartlearn-dev.db`.
- Hygiene: `npm run dev:sanitize` (dry run) / `-- --apply`: explicit allowlist under `src-tauri/target` of the git worktrees; keeps the canonical debug build, installers (`release/bundle`), human data, backups, source.
