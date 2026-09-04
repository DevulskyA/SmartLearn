# Technical Debt Ledger — SmartLearn

Only known, material, intentionally deferred imperfections. Not a wish list.

---

## Open

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
- **Problem**: DEC-016 explicitly defers FSRS (WP-07) as "LATER". With 16 fixed review tasks per unit and a Medicina student registering ~5 units/day, steady state (after day 390 of consistent registration) generates ~80 review tasks/day (16 cohorts × 5 units each). The fixed schedule is not sustainable at scale — daily volume grows linearly with registration rate until the schedule horizon is reached. The fixed schedule (legacy algorithm) is not sustainable for longitudinal use.
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

### DEBT-008 — SPEC_PRECISION_GAP: tracking state table in spec vs AC mismatch (AC-ACOMP-03)

- **Status**: open
- **Problem**: The spec table in `smartlearn-ui-analytics-vnext/spec.md` defines 4 tracking states (`NOVO`, `EM_DIA`, `EM_ESTUDO`, `ATRASADO`). AC-ACOMP-03 refers to "5 tracking states" and mentions `EM_REVISAO`, which is implemented in code (`app.js` `getTrackingState`) as the state for units with a pending review task within 7 days, but is not defined in the spec table. Additionally, the code's `EM_DIA` and `EM_ESTUDO` semantics differ from what the spec implies — `EM_DIA` requires no pending review ≤7 days, `EM_ESTUDO` applies to units with registration in last 30 days. The spec does not document these thresholds.
- **Origin**: SPEC_PRECISION_GAP identified during pre-PR hardening pass, 2026-09-04
- **Risk**: Any contributor reading the spec builds a different mental model than the code enforces. Future changes to tracking state logic will lack a spec contract to validate against.
- **Impact**: Spec accuracy; does not block runtime behavior (code is source of truth).
- **Affected components**: `.specs/features/smartlearn-ui-analytics-vnext/spec.md`, `src/app.js` (`getTrackingState`), `src/scheduler.js`
- **Dependencies**: HUMAN_GATE: Requires product decision on whether `EM_REVISAO` is a distinct state, and what the threshold semantics for `EM_DIA`/`EM_ESTUDO` should officially be.
- **Resolution criterion**: Spec table updated with all 5 states and their explicit threshold conditions (30-day window, 7-day window). AC-ACOMP-03 references the 5-state table unambiguously.
- **Priority**: P2 (bloqueia precisão do spec; não bloqueia runtime)
- **Owner**: unassigned
- **Evidence**: Pre-PR hardening audit 2026-09-04; `src/app.js` `getTrackingState` function

---

## Resolved

### DEBT-001 — SQLite/Tauri real persistence not validated for analytics-vnext
- **Resolved**: 2026-09-03
- **Resolution**: Full SQLite smoke completed: CHECK constraints, UNIQUE constraint, FK enforcement (`.foreign_keys(true)` in Rust `SqliteConnectOptions`), ON DELETE CASCADE, `completeReviewWithEvidence` SQL atomicity, Rust transaction tests (2/2 pass), 88 node:tests pass.

### DEBT-005 — TLC_INSTALLATION_MISMATCH: plugin-sql version vs Tauri 2 feature flags
- **Resolved**: 2026-09-03 (together with DEBT-001)
- **Resolution**: `SqliteConnectOptions.foreign_keys(true)` in `lib.rs:28` — FK enforcement is compiler-level, not PRAGMA-dependent. Rust tests confirm atomicity and rollback. `plugin-sql` 2.4.0 + sqlite feature verified via `cargo test`.
