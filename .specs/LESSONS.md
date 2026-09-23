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

### LESSON-007 — Escopo mínimo destrutivo: DELETE só do que foi pedido, nada mais

- **Origin:** WINDOWS_REAL UAT 2026-09-05 — usuário pediu remover subject id=4 (dado inválido). Foram deletados subject id=3 (Semiologia Médica), unit id=6 (Ausculta Cardíaca) e 16 review_tasks — dados legítimos criados pelo usuário que não foram pedidos para remoção.
- **Princípio:** Toda operação destrutiva deve ter escopo exatamente igual ao solicitado. Antes de executar qualquer DELETE: (1) listar os registros exatos que serão removidos, (2) listar os efeitos de cascade (FK ON DELETE CASCADE), (3) confirmar que o conjunto listado corresponde ao que o usuário pediu. Se houver dúvida, perguntar antes de agir.
- **Apply:** Nunca deletar registro pai quando só o filho foi pedido. Preferir `is_active=0` (soft delete) quando reversibilidade importa. Nunca "limpar" além do escopo autorizado. Em SQL: usar `WHERE id = <exato>`, jamais `WHERE id IN (a, b, c)` quando só `a` foi pedido.

### LESSON-006 — Um domínio, um contrato, vários adapters de persistência

- **Origin:** User architectural review 2026-09-03 — app opened empty in Tauri because SQLite starts fresh; BrowserStore had dev test data creating a false impression of application state
- **Lesson:** SmartLearn has one logical domain and one data contract. SQLite (Tauri/Android) and BrowserStore (Web) are adapters of the same contract, not sources of truth in isolation. The fact that BrowserStore has data does not mean the app has data — it means that browser instance has data. Tests exclusively on BrowserStore are insufficient evidence of SQLite behavior.
- **Apply:** (1) Any persistence feature must be tested against BOTH adapters. (2) DEV bootstrap seeds empty adapters from `src/fixtures/dev-dataset.js` so both start from the same canonical state. (3) When adding a new persistence method, implement and test it in both BrowserStore and SQLite paths. (4) Future architectural principle: UM DOMÍNIO · UM CONTRATO · VÁRIOS ADAPTERS · MESMOS TESTES DE CONTRATO · SINCRONIZAÇÃO QUANDO NECESSÁRIA. See DEBT-006.

### LESSON-008 — `JSON.stringify(obj, arrayReplacer)` whitelists property names at EVERY nesting level against ONE fixed list, not just the top level

- **Origin:** tlc-spec-driven-strict FASE 2 (2026-09-15) — writing `server/test/idempotency.test.js` from scratch (no prior test file existed for `idempotency.js`) surfaced that `canonicalHash`'s `JSON.stringify(payload, Object.keys(payload).sort())` silently serialized any nested object to `{}` whenever the nested object's own keys didn't happen to match a top-level key name of `payload`. Verified: `{nested:{x:1,y:2}}` and `{nested:{x:99,y:-5}}` both stringified to `{"nested":{}}` — two genuinely different payloads, identical hash. Latent, not yet triggered: every real `operationKey` payload in this codebase (attempts/reviews/evidence/learning-units) is flat primitives, so no caller had ever hit it. Fixed same-session (`deepSortedClone` recursive key-sort before stringify) since the fix was zero-blast-radius (no caller's hash value changes) and the alternative — leaving a silent-wrong-answer bug live — was strictly worse than fixing it immediately.
- **Lesson:** An array passed as `JSON.stringify`'s second argument is a single, flat property-name whitelist applied recursively at every level of the structure being serialized — it does NOT mean "these are the top-level keys, serialize everything else normally." Any "stable stringify for hashing" implementation built this way silently drops nested content instead of erroring, which is worse than crashing: it makes two different things hash the same.
- **Apply:** Never reach for `JSON.stringify(x, someKeyArray)` as a canonicalization trick unless `x` is known-flat and staying that way. For anything that might grow a nested shape (any payload hashed for idempotency/caching/dedup), sort keys recursively (walk the structure) before stringifying, and add a test with an actual nested payload before trusting it — a same-shape-different-nested-value pair is the minimum discriminating case (see idempotency.test.js's two REGRESSION-tagged tests).

### LESSON-009 — Two-phase safety copy for destructive operations across an async window

- **Origin:** `claude/server-first-v1` branch (commit 195d7a9, D-002 `BROWSER_STORE_KEY` migration), salvaged 2026-09-16 during branch-hygiene audit before deleting that branch — the branch's own architecture was discarded, this one pattern was not.
- **Lesson:** Before any destructive operation (e.g. `localStorage.removeItem(key)`) that sits in an async window between the write to a new destination and confirming that write succeeded: (1) copy the source to a backup key first; (2) if the operation fails, remove the backup (data is still safe in the original source); (3) if it succeeds, leave the backup and clean it up lazily on the next successful startup that confirms the destination has the data. This shrinks the data-loss window to zero — a backup always exists at the exact moment data is removed from the source.
- **Apply:** Any future migration that removes data from one store only after writing it to another (localStorage→SQLite, old-schema→new-schema, etc.) should use this two-phase pattern instead of a bare remove-after-write. Not currently needed anywhere in canonical code (no live destructive cross-store migration exists as of 2026-09-16) — recorded so the pattern doesn't have to be rediscovered if one is added later.
