# LESSONS.md — SmartLearn

Grounded lessons from failures and verified behavior gaps. Each entry has an origin event.

---

### LESSON-001 — BrowserStore ≠ SQLite: fake adapter masks real persistence failures

- **Origin:** analytics-vnext closure audit 2026-09-03 — `completeReviewWithEvidence` tested only in BrowserStore; SQLite/Tauri not validated
- **Lesson:** A feature closure is NOT PASS when the persistence path tested is a test double and the real persistence (SQLite via Tauri plugin) is in scope. BrowserStore is valid for unit logic; SQLite atomicity and migrations require Tauri runtime.
- **Apply:** Any feature whose ACs include persistence or migration must smoke-test in `tauri dev` before validation.md declares PASS.

### LESSON-002 — `createBulk` returns ALL records, not the newly created ones

- **Origin:** analytics-vnext WP-B2 UAT — `createBulk` called, then `tasks[0].id` used expecting the new task; it was task #17 (oldest)
- **Lesson:** `DB.reviewTasks.createBulk()` returns `this.getAll()` — all tasks sorted by id. Never use positional index on its return value to retrieve the newly created items. Use `createWithReviews` (atomic) or filter by `unitId` after.
- **Apply:** Any callers of `createBulk`-style methods must document what the return value contains.

### LESSON-003 — validation.md PASS with known gap is invalid

- **Origin:** analytics-vnext WP-F3 validation 2026-09-03 — PASS declared with AC-ACOMP-05 explicitly labeled PARTIAL and SQLite unverified
- **Lesson:** "PASS with 1 gap" is not PASS. A known unmet AC or unverified required environment = CLOSURE_REQUIRED, regardless of the gap's severity label.
- **Apply:** Verifier must apply evidence-or-zero. If any required AC is unmet or any required environment is untested, verdict is not PASS.

### LESSON-004 — CSS selector mismatch: `data-theme` vs `data-theme-mode`

- **Origin:** analytics-vnext WP-F1 — tracking state badges used `[data-theme="dark"]` but app's theme system sets `[data-theme-mode="dark"]`
- **Lesson:** Before writing CSS selectors for dynamic attributes, verify which attribute name the theme system actually writes to the DOM. One wrong attribute key = entire dark-mode block silently ignored.
- **Apply:** Read `theme.js` / `applyThemePreference` before writing any `[data-theme*]` CSS.

### LESSON-005 — `readState` without `refreshNextIds` causes id collisions on reload

- **Origin:** analytics-vnext db.js audit — `readState` deserialized state but skipped `refreshNextIds`; if `state.nextIds[collection]` was stale, new items could get ids already in use
- **Lesson:** Any store that maintains an id counter must recalculate the counter from actual data on every load, not trust the persisted counter value.
- **Apply:** Always call `refreshNextIds(state)` immediately after deserializing persisted state in BrowserStore.

### LESSON-006 — Um domínio, um contrato, vários adapters de persistência

- **Origin:** User architectural review 2026-09-03 — app opened empty in Tauri because SQLite starts fresh; BrowserStore had dev test data creating a false impression of application state
- **Lesson:** SmartLearn has one logical domain and one data contract. SQLite (Tauri/Android) and BrowserStore (Web) are adapters of the same contract, not sources of truth in isolation. The fact that BrowserStore has data does not mean the app has data — it means that browser instance has data. Tests exclusively on BrowserStore are insufficient evidence of SQLite behavior.
- **Apply:** (1) Any persistence feature must be tested against BOTH adapters. (2) DEV bootstrap seeds empty adapters from `src/fixtures/dev-dataset.js` so both start from the same canonical state. (3) When adding a new persistence method, implement and test it in both BrowserStore and SQLite paths. (4) Future architectural principle: UM DOMÍNIO · UM CONTRATO · VÁRIOS ADAPTERS · MESMOS TESTES DE CONTRATO · SINCRONIZAÇÃO QUANDO NECESSÁRIA. See DEBT-006.
