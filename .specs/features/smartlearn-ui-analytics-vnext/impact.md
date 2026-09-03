# smartlearn-ui-analytics-vnext — Change Impact Analysis

> **Note:** This analysis was produced retrospectively during governance adoption (2026-09-03),
> after implementation. It serves as a reference for future work in this area and documents
> the blast radius that should have been mapped before structural edits began.

---

## Target

- **Problem:** SmartLearn lacked tracking of learning evidence, per-discipline and per-unit analytics, and a full review cycle with internal exercises.
- **Changing:** `src/db.js` (new tables, migrations, new BrowserStore methods), `src/analytics.js` (new module), `src/app.js` (new render functions, 4 new screens), `src/scheduler.js` (refactor + encapsulation), `src/theme.js` (theme consolidation), CSS tokens.
- **Must remain unchanged:** Existing review flow (Tela Hoje, ReviewRow, `completeReview`), subject CRUD, backup/import contract (schemaVersion 2 import must still work), existing 44 node:test suite.

---

## Callers / entry points

| Caller | How it uses target | Evidence |
| --- | --- | --- |
| `src/app.js` | Calls `DB.*` for all data; calls `Analytics.*` for stats; calls `applyThemePreference` | imports at top of app.js |
| `index.html` | Calls `applyThemePreference(getStoredThemePreference())` at boot | index.html:9-11 |
| `test/*.test.js` | Calls `DB.*` directly against BrowserStore | 8 test files |
| Tauri runtime | Calls `db.js` via `@tauri-apps/plugin-sql` execute() | src/db.js plugin import |

---

## Dependencies

| Dependency | Contract/state used | Evidence |
| --- | --- | --- |
| `@tauri-apps/plugin-sql` | `Database.load`, `db.execute`, `db.select` | db.js imports |
| BrowserStore (localStorage) | `smartlearn:browser-db` key, emptyState shape | db.js BrowserStore class |
| `src/scheduler.js` | `generateInitialTasks`, `generateReviewDates`, `REVIEW_DAY_OFFSETS` | app.js, db.js imports |
| `src/performance-thresholds.js` | `THRESHOLDS`, `getState`, `TREND_DELTA_MIN` | analytics.js imports |
| `src/analytics.js` | `Analytics.bySubject`, `Analytics.byUnit`, `subjectTrend`, `unitTrend` | app.js imports |
| `src/theme.js` | `THEME_OPTIONS`, `applyThemePreference`, `getStoredThemePreference` | app.js, index.html imports |
| CSS variables | `--disc-color-*`, `--color-primary`, `--color-on-primary`, `[data-theme-mode]` | styles.css |
| `SUBJECT_COLOR_KEYS` / `colorVarForKey` | 12 color keys, CSS var mapping | app.js |

---

## Requirement traceability

| Requirement / AC | Dependency on target | Risk if changed |
| --- | --- | --- |
| AC-RES-01..07 (Hoje) | `DB.reviewTasks.getAll`, `completeReviewWithEvidence`, `renderToday` | Breaking `completeReviewWithEvidence` breaks core review flow |
| AC-RP-01..06 (Plano) | `DB.learningUnits.getAll`, `DB.reviewTasks.getAll`, `renderPlan` | Plan screen broken |
| AC-DET-01..05 (Evidência) | `DB.learningEvidence.*`, `completeReviewWithEvidence`, `DB.exercises.*` | Evidence tracking broken |
| AC-EST1-01..07 (Stats-disciplina) | `Analytics.bySubject`, `subjectTrend`, `THRESHOLDS` | Stats broken |
| AC-EST2-01..05 (Stats-conteúdo) | `Analytics.byUnit`, `unitTrend`, `buildSparkline` | Unit stats broken |
| AC-ACOMP-01..05 (Acompanhamento) | `getTrackingState`, `renderTracking`, tracking card DOM | Tracking broken |
| AC-DISC-01..05 (Disciplinas) | `DB.subjects.*`, `buildColorPicker`, `renderDisciplinas` | Subject management broken |
| NF-01 (SQLite) | `db.js` BrowserStore + Tauri path | DEBT-001 — unverified |
| NF-02..03 (schemaVersion, migrations) | `exportAll`, `importAll`, `runMigrationFromReviewTasks` | Backup/restore broken |

---

## Existing protection

| Behavior | Sensor/test | Strength / gap |
| --- | --- | --- |
| `subjectTrend` direction | `performance-thresholds.test.js` — 4 tests | Strong |
| `unitTrend` direction | `performance-thresholds.test.js` — 5 tests | Strong |
| `importAll` schemaVersion fail-closed | `learning-evidence.test.js` — 4 tests | Strong |
| `runMigrationFromReviewTasks` idempotent | `learning-evidence.test.js` | Strong |
| `completeReviewWithEvidence` constraints | Browser UAT + constraint sensors | Medium — node:test missing for BrowserStore path |
| `completeReviewWithEvidence` dup guard | Browser UAT | Medium — same caveat |
| `getTrackingState` 5-state derivation | Browser UAT only | Weak — no node:test; depends on DOM-bound app.js |
| SQLite atomicity | None | GAP — see DEBT-001 |
| `ON DELETE CASCADE` | None | GAP — see DEBT-005 |

---

## Contract and data blast radius

- **APIs/events:** No external API. `DB.*` public interface is consumed by app.js and tests.
- **Persistence/schema/migrations:** 
  - New column `subjects.color TEXT`
  - New table `learning_evidence` (ON DELETE CASCADE from review_tasks)
  - `ensureColumns` migration path: additive, idempotent
  - `schemaVersion` bumped 2 → 3
- **Backup/import/export:** `importAll` accepts schemaVersion 2 (upgrades) and 3. Rejects 1, 999+. `exportAll` emits schemaVersion 3 with `learningEvidence` array.
- **Files/config:** No config changes. `src-tauri/tauri.conf.json` permissions unchanged.
- **External behavior:** None.

---

## Regression surface

| Neighbor behavior | Failure mode | Required sensor |
| --- | --- | --- |
| `completeReview` (old path, without evidence) | Broken if `completeReviewWithEvidence` replaces it incorrectly | Existing review_tasks tests |
| Subject delete cascade | `learning_evidence` rows orphaned if CASCADE not active | DEBT-005 sensor needed |
| importAll schemaVersion 2 | Evidence array missing → restore fails | `learning-evidence.test.js` (present) |
| Tracking state badge theming | Wrong `data-theme` attr → badges invisible in dark mode | Verified in closure; CSS uses `[data-theme-mode]` |
| BrowserStore `nextId` counter | Id collision if `readState` skips `refreshNextIds` | Fixed; `readState` now calls `refreshNextIds` |

---

## Sensor plan — status at closure

- [x] `subjectTrend` / `unitTrend` protected by node:test discrimination
- [x] `importAll` schemaVersion fail-closed protected
- [x] `runMigrationFromReviewTasks` idempotent protected
- [x] `completeReviewWithEvidence` constraints verified in browser UAT
- [x] `getTrackingState` 5 states verified in browser UAT
- [ ] SQLite atomicity: **BLOCKED** — requires Tauri runtime (DEBT-001)
- [ ] `ON DELETE CASCADE`: **BLOCKED** — requires Tauri runtime (DEBT-005)
- [ ] `getTrackingState` node:test: **MISSING** — function is in app.js, not extractable without refactor (DEBT-002)

---

## Rollback / recovery

- All changes are additive (new columns via `ensureColumns`, new tables, new methods).
- Reverting to pre-analytics-vnext: drop `learning_evidence` table, remove `subjects.color` column, restore old `db.js` without BrowserStore.
- Backup format: any schemaVersion 3 export is readable by the new code. schemaVersion 2 exports remain importable.
- Git: all WP commits are atomic and individually revertable (`git revert <sha>`).

---

## Residual unknowns

| Unknown | Disposition |
| --- | --- |
| SQLite transaction atomicity for `completeReviewWithEvidence` | DEBT-001 — resolve before merge |
| `PRAGMA foreign_keys = ON` active in plugin-sql | DEBT-005 — resolve with DEBT-001 |
| `getTrackingState` untestable from node:test without DOM | DEBT-002 — extract to non-DOM module; P3 |
| DEC-013-V2 (fonte texto livre) partially implemented | DEBT-004 — awaits DOMAIN_REDESIGN_APPROVAL |
