# Technical Debt Ledger — SmartLearn

Only known, material, intentionally deferred imperfections. Not a wish list.

---

## Open

### DEBT-001 — SQLite/Tauri real persistence not validated for analytics-vnext

- **Status**: open
- **Problem**: All analytics-vnext acceptance criteria were verified against BrowserStore (localStorage-backed test double). SQLite transaction atomicity, schema migrations (`ensureColumns`, `ON DELETE CASCADE`), and `PRAGMA foreign_keys = ON` were NOT tested in a real Tauri + SQLite runtime.
- **Origin**: analytics-vnext closure audit 2026-09-03; LESSON-001
- **Risk**: Silent data loss or partial state on mobile/desktop if SQLite behavior differs from BrowserStore — particularly for `completeReviewWithEvidence` atomicity and `runMigrationFromReviewTasks`.
- **Impact**: All NF-01 claims for analytics-vnext are browser-only. PR merge to production without this smoke is high-risk.
- **Affected components**: `src/db.js` (BrowserStore + SQLite paths), Tauri plugin-sql 2.4.0, `completeReviewWithEvidence`, `runMigrationFromReviewTasks`, `ensureColumns`
- **Dependencies**: Tauri dev environment with `npm run tauri dev`; a device or emulator for Android smoke
- **Resolution criterion**: Run `npm run tauri dev`, execute `completeReviewWithEvidence` end-to-end in the app, verify learning_evidence row in the SQLite file, run migration twice and confirm idempotency. Document with screenshot or log.
- **Priority**: P1
- **Owner**: unassigned
- **Evidence**: `.specs/features/smartlearn-ui-analytics-vnext/validation.md` — BROWSER_PASS verdict, gap documented

---

### DEBT-002 — app.js: state derivation and UI utilities not extracted

- **Status**: open
- **Problem**: `app.js` is 3219 lines and contains state derivation logic (`getTrackingState`, `getPlanUnitState`) mixed with DOM render functions and UI utilities (`buildSparkline`, `createTrendBadge`, `createStateBadge`, `buildColorPicker`). State derivation belongs in `scheduler.js` or a domain module; UI utilities belong in a `ui-utils.js`.
- **Origin**: analytics-vnext code quality review (Task 14) 2026-09-03
- **Risk**: Low immediate risk. Growing file will increase merge conflict surface and reduce testability of state derivation.
- **Impact**: Harder to unit-test `getTrackingState` / `getPlanUnitState` without DOM; growing file size.
- **Affected components**: `src/app.js`, potentially new `src/ui-utils.js` or `src/domain.js`
- **Dependencies**: None blocking
- **Resolution criterion**: `getTrackingState` and `getPlanUnitState` moved to a non-DOM module and covered by node:test; `buildSparkline` and badge builders moved to `ui-utils.js`.
- **Priority**: P3 (não bloqueia closure; somente relevante se uma alteração exigir sensor que dependa de extração)
- **Owner**: unassigned
- **Evidence**: analytics-vnext WP-F3 code quality review; `.specs/features/smartlearn-ui-analytics-vnext/validation.md` §Code quality assessment

---

### DEBT-003 — Fixed schedule generates ~1190 review tasks/day by year 3

- **Status**: open
- **Problem**: DEC-016 explicitly defers FSRS (WP-07) as "LATER". With 16 fixed review tasks per unit and a Medicina student registering ~5 units/day, year 3 generates ~1190 review tasks/day. The fixed schedule (legacy algorithm) is not sustainable for longitudinal use.
- **Origin**: DEC-016 note "Risco de escala", 2026-09-02
- **Risk**: Student abandons the app when daily review volume becomes unmanageable. No spaced-repetition optimization means inefficient study time.
- **Impact**: Core learning loop becomes unusable at scale. FSRS is "necessary, not optional" per DEC-016.
- **Affected components**: `src/scheduler.js` (generateInitialTasks, REVIEW_DAY_OFFSETS), `src/db.js` (review_tasks table), all review UI
- **Dependencies**: FSRS requires `repeat(card_state, rating, now) → next_due` interface; cold-start migration needed for existing tasks
- **Resolution criterion**: `scheduler.js` exports FSRS-based algorithm alongside legacy; user can opt-in per unit or globally; existing tasks migrate gracefully on first FSRS review.
- **Priority**: P2 (não bloqueia esta feature; bloqueará ciclo longitudinal de Medicina)
- **Owner**: unassigned
- **Evidence**: `.specs/project/STATE.md` DEC-016 — "Risco de escala" section

---

### DEBT-004 — DEC-013-V2 (fonte = texto livre) still PROPOSED

- **Status**: open
- **Problem**: `PROP-DEC-013-V2` was proposed in STATE (fonte como texto livre, empty initial state) and partially implemented in commit `09ea0d8`, but remains formally PROPOSED pending `HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL`.
- **Origin**: `.specs/project/STATE.md` PROP-DEC-013-V2, 2026-09-03
- **Risk**: Partial implementation + unapproved decision creates inconsistency in specs and code.
- **Impact**: Specs may claim `sources` entity exists while code removed it. Any new feature touching registration must know which decision is active.
- **Affected components**: `src/db.js` (sources table removal), `src/app.js` (registration form), `.specs/project/STATE.md`
- **Dependencies**: HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL must fire first
- **Resolution criterion**: User approves DEC-013-V2; STATE updated; PROP prefix removed; INV-05B marked SUPERSEDED.
- **Priority**: P2
- **Owner**: unassigned
- **Evidence**: `.specs/project/STATE.md` PROP-DEC-013-V2; commit `09ea0d8`

---

### DEBT-005 — TLC_INSTALLATION_MISMATCH: plugin-sql version vs Tauri 2 feature flags

- **Status**: open
- **Problem**: `@tauri-apps/plugin-sql` version compatibility with Tauri 2.4.x feature flags (`sqlite`) and `PRAGMA foreign_keys = ON` enforcement has not been verified on the current installation.
- **Origin**: `.specs/project/STATE.md` TLC_INSTALLATION_MISMATCH, 2026-09-03
- **Risk**: Migrations or CASCADE deletes may silently fail without foreign key enforcement.
- **Impact**: Data integrity guarantees for `ON DELETE CASCADE` in `review_tasks` and `learning_evidence` are unverified.
- **Affected components**: `src-tauri/Cargo.toml`, `src/db.js` DB.init(), schema constraints
- **Dependencies**: Requires Tauri dev environment (DEBT-001 resolution environment)
- **Resolution criterion**: `npm run tauri dev`; execute `PRAGMA foreign_keys;` via console; confirm returns 1; run a cascade delete test.
- **Priority**: P1 (resolved together with DEBT-001)
- **Owner**: unassigned
- **Evidence**: `.specs/project/STATE.md` TLC_INSTALLATION_MISMATCH

---

---

### DEBT-006 — Repository contract + IndexedDB + Sync strategy not formalized

- **Status**: open
- **Problem**: SmartLearn has three persistence adapters (BrowserStore/localStorage, SQLite via Tauri, SQLite via Android plugin-sql) with no formal shared contract. Minimal fix implemented 2026-09-03: `import.meta.env?.DEV` guard seeds empty SQLite or BrowserStore with canonical dev fixture. Remaining gaps: (1) no contract tests that run the same suite against both adapters; (2) BrowserStore uses localStorage which is inappropriate for app-scale data — IndexedDB is the correct Web adapter; (3) no sync strategy defined for multi-device (Web + Mobile + Windows); (4) fixture seeding is DEV-only — production needs an explicit onboarding or import path.
- **Origin**: User architectural review 2026-09-03; LESSON-006
- **Risk**: Adapters can silently diverge over time. Tests passing against BrowserStore do not constitute evidence for SQLite behavior. A user studying on mobile and opening on Windows finds empty state.
- **Impact**: Medium immediate (dev seeding works), high long-term (no multi-device continuity).
- **Affected components**: `src/db.js` (both adapter paths), `src/fixtures/dev-dataset.js` (new), future `src/repositories/`
- **Dependencies**: DEBT-001 resolved (SQLite verified); DEBT-002 (extraction) is prerequisite for clean repository interface
- **Resolution criterion**: (1) Persistence contract test suite runs against both BrowserStore and SQLite adapters; (2) BrowserStore upgraded to IndexedDB; (3) Sync strategy ADR written if multi-device is in scope; (4) Production onboarding flow defined.
- **Priority**: P2 (dev seeding P0 implemented; contract tests and IndexedDB are next cycle)
- **Owner**: unassigned
- **Evidence**: User message 2026-09-03 20:53; `.specs/LESSONS.md` LESSON-006

---

### DEBT-007 — Empty state / onboarding ausentes na primeira abertura em produção

- **Status**: open
- **Problem**: Banco vazio em produção é estado válido (usuário ainda não cadastrou nada). Mas a interface que responde a esse estado ainda não existe. Primeiro acesso mostra telas vazias sem orientação. Estado correto: "Nenhuma disciplina cadastrada — [Criar primeira disciplina] [Importar conteúdo]".
- **Origin**: Revisão arquitetural 2026-09-03 — distinção explícita entre "banco vazio correto" e "interface vazia incorreta"
- **Risk**: Usuário interpreta tela vazia como bug ou app quebrado. Taxa de abandono em primeiro acesso.
- **Impact**: UX de primeiro uso; não afeta dados nem persistência.
- **Affected components**: `src/app.js` (renderSubjects, renderPlan, renderToday — estados vazios), `src/styles.css` (empty-state styles)
- **Dependencies**: Nenhuma. Independente do bootstrap/seed.
- **Resolution criterion**: Cada tela principal (Hoje, Plano, Disciplinas) exibe empty state com ação primária quando não há dados. Primeiro uso em produção guia o usuário sem confusão.
- **Priority**: P2
- **Owner**: unassigned
- **Evidence**: User message 2026-09-03 21:25; distinção banco-vazio vs interface-vazia

---

## Resolved

### DEBT-001 — SQLite/Tauri real persistence not validated for analytics-vnext
- **Resolved**: 2026-09-03
- **Resolution**: Full SQLite smoke completed: CHECK constraints, UNIQUE constraint, FK enforcement (`.foreign_keys(true)` in Rust `SqliteConnectOptions`), ON DELETE CASCADE, `completeReviewWithEvidence` SQL atomicity, Rust transaction tests (2/2 pass), 88 node:tests pass.

### DEBT-005 — TLC_INSTALLATION_MISMATCH: plugin-sql version vs Tauri 2 feature flags
- **Resolved**: 2026-09-03 (together with DEBT-001)
- **Resolution**: `SqliteConnectOptions.foreign_keys(true)` in `lib.rs:28` — FK enforcement is compiler-level, not PRAGMA-dependent. Rust tests confirm atomicity and rollback. `plugin-sql` 2.4.0 + sqlite feature verified via `cargo test`.
