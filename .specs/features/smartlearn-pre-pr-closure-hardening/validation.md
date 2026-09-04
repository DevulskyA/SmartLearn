# Validation — SmartLearn Pre-PR Closure Hardening

**Feature**: smartlearn-pre-pr-closure-hardening  
**Validated**: 2026-09-04  
**Branch**: claude/fix-complete-review-sqlite-593426

---

## Automated Evidence

| AC | Test file | Assertion | Status |
|----|-----------|-----------|--------|
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "completeReviewWithEvidence: segunda chamada lança erro (duplicata bloqueada)" | `INSERT` (not `INSERT OR IGNORE`) raises unique constraint error on second call | PASS (97/97) |
| AC-PERSIST-02 | `src-tauri/src/lib.rs::complete_review_duplicate_rolls_back` | Rust SQLite: score/evidence state unchanged after duplicate attempt | PASS (8/8 cargo) |
| AC-DELETE-01 | `test/subjects.test.js` — "B: rejeita exclusão quando há learning_unit associada" | `deleteIfEmpty` throws when units exist | PASS (97/97) |
| AC-DELETE-01 | `test/exercises.test.js` — "deleteIfEmpty: subject com exercises não pode ser excluída" | Exercises survive rejection | PASS (97/97) |
| AC-DATE-01 | `test/learning-evidence.test.js` — "evidenceDate usa dia local, não prefixo UTC" | `evidenceDate` equals `localDateIso(now)`, not UTC prefix | PASS (97/97) |
| AC-DATE-01 | `test/learning-evidence.test.js` — "getCompletedToday: encontra revisão mesmo quando completedAt UTC está no dia seguinte" | Cross-midnight boundary case — local date persists correctly | PASS (97/97) |
| AC-DATE-01 | `test/learning-evidence.test.js` — kill test M2 com data injetada na virada de dia UTC-3 | `new Date('2026-09-04T01:30:00Z')` → `evidenceDate = '2026-09-03'` (UTC-3), not '2026-09-04' | PASS (97/97) |
| AC-BOOT-01 | `src-tauri/src/lib.rs::fresh_install_review_schedule_is_canonical` | `review_schedule` is non-NULL and matches REVIEW_DAY_OFFSETS after fresh init | PASS (8/8 cargo) |
| AC-BOOT-01 | `src-tauri/src/lib.rs::fresh_install_unbound_param_yields_null_schedule` | Regression sensor: unbound $1 yields NULL (documents pre-T5 bug) | PASS (8/8 cargo) |
| AC-TRACK-01 | `.specs/features/smartlearn-ui-analytics-vnext/spec.md` — 5-state table corrected | Spec matches `getTrackingState` in app.js; DEBT-008 resolved | PASS |
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "P0-3: context REVIEW sem reviewTaskId lança erro" | `learningEvidence.create` throws when `context='REVIEW'` and `reviewTaskId` is null | PASS (103/103) |
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "P0-3: context INITIAL_PRACTICE com reviewTaskId lança erro" | Throws when non-REVIEW context receives reviewTaskId | PASS (103/103) |
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "P0-3: context EXTERNAL com reviewTaskId lança erro" | Throws when non-REVIEW context receives reviewTaskId | PASS (103/103) |
| AC-PERSIST-02 | `test/learning-evidence.test.js` — "P0-2: clearAll apaga learning_evidence antes de review_tasks" | FK integrity: evidence deleted before review_tasks; clearAll completes without FK violation | PASS (103/103) |
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "P0-4: backup v1 (studyRecords, sem schemaVersion) é aceito e migrado" | `importAll` migrates main-era v1 backup with studyRecords → learningUnits; no rejection | PASS (103/103) |
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "P0-4: backup schemaVersion 1 com learningUnits é aceito" | `importAll` accepts schemaVersion=1 backups (MIN_VERSION lowered from 2→1) | PASS (103/103) |

**Test counts**: 103/103 node:test, 8/8 cargo test (2026-09-04)

---

## Structural Gates

| Gate | Command | Result |
|------|---------|--------|
| node:test | `node --test test/*.test.js` | PASS — 103/103 (2026-09-04) |
| cargo test | `cargo test` (src-tauri/) | PASS — 8/8 (2026-09-04) |
| build | `npm run build` | PASS — 21 modules, 255ms, exit 0 (2026-09-04) |
| validate_spec.py | searched project root, src-tauri/, .specs/, .claude/skills/tcl-governance-pack/, .agents/ | **UNVERIFIED — script not found**. Searched: `Glob validate*.py` across full project and tcl-governance-pack skill directory. No `validate_spec.py` exists. Governance framework (tcl-governance-pack) uses prose checklists, not Python scripts. |
| validate_tasks.py | same search | **UNVERIFIED — script not found** |
| validate_completion.py | same search | **UNVERIFIED — script not found** |

---

## Manual Structural Validation (TLC_INSTALLATION_MISMATCH = TRUE)

_Canonical Python validators absent from runtime. Manual equivalent performed per TCL protocol. Result remains UNVERIFIED — manual inspection is not fail-closed._

### SPEC check

| Check | Result | Evidence |
|-------|--------|----------|
| Todos os requisitos possuem IDs | PASS | AC-PERSIST-01/02, AC-DELETE-01, AC-DATE-01, AC-BOOT-01, AC-TRACK-01, AC-UAT-01, AC-GOV-01 — todos com IDs únicos |
| ACs são observáveis (condição WHEN/THEN verificável) | PASS | Cada AC define estado preciso verificável: score_percent=80, evidence_count=1, erro thrown, evidenceDate=localDateIso(now), review_schedule=JSON canônico |
| ACs contraditórios | PASS — nenhum | AC-PERSIST-01 (duplicate fail-closed) e AC-DELETE-01 (guard) são independentes; AC-DATE-01 e AC-BOOT-01 em domínios disjuntos |
| Non-goals coerentes com corpo do spec | PASS | Out of scope: DEC-013-V2, FSRS, IndexedDB, onboarding — todos referenciados em DEBT (004, 003, 006, 007) como dívida aberta; nenhum auto-aprovado |
| Decisões coerentes | PASS | Nenhuma decisão PROPOSED tratada como ACCEPTED no spec |
| Stale status encontrado e corrigido | FIXED | AC-PERSIST-01 dizia "SQLite BLOCKER: Rust sensor ainda não existe" — stale após T2 (`82caf1f`). Corrigido nesta sessão. |

### TASKS check

| Check | Result | Evidence |
|-------|--------|----------|
| Toda task referencia AC/requisito | PASS | T1→AC-PERSIST-01; T2→AC-PERSIST-01,02; T3→AC-DELETE-01; T4→AC-DATE-01; T5→AC-BOOT-01; T6→AC-PERSIST-02; T7→AC-TRACK-01; T8→AC-UAT-01; T9→AC-GOV-01 |
| Dependências apontam para tasks anteriores | PASS | Execution plan: T2→T3→T4→T5 (sensor-before-implementation); T6 após T3/T4/T5; T7/T8/T9 após T6 |
| Cada mudança possui sensor/gate | PASS | T1: node:test duplicate; T2: Rust test; T3: node:test deleteIfEmpty; T4: node:test date boundary; T5: Rust test bootstrap; T6: audit com tabela; T7: spec correction; T8: checklist; T9: reconciliation |
| Cada task é atomicamente executável | PASS — com desvio registrado | T1,T4,T5 atômicas. T2+T3 agrupadas (desvio governance registrado). T7+T8+T9 agrupadas (desvio registrado). Desvios documentados e não repetidos. |
| Tasks marcadas DONE sem evidência | PASS — nenhuma | T1-T7, T9: commit SHA explícito como evidência. T8: marcada "CHECKLIST CRIADO — PENDING HUMAN_GATE", não DONE. |

### VALIDATION check

| Check | Result | Evidence |
|-------|--------|----------|
| Cada AC possui evidência ou GAP documentado | PASS | AC-PERSIST-01/02/DELETE-01/DATE-01/BOOT-01: file:line + assertion. AC-TRACK-01: spec corrected. AC-UAT-01: GAP = PENDING HUMAN_GATE (correto). AC-GOV-01: governance deviation recorded. |
| SPEC_DEVIATION aberto | PASS — nenhum | DEBT-008 (SPEC_PRECISION_GAP AC-ACOMP-03) resolvido em `af000b2`. Nenhum SPEC_DEVIATION aberto. |
| AC conhecido falho aparece como PASS | PASS — nenhum | AC-UAT-01 explicitamente marcado PENDING/HUMAN_GATE, não PASS. |
| Closure gates com evidência real | PASS | 97/97 node:test, 8/8 cargo test, build 21 módulos — todos com exit codes reais documentados. |
| Discrimination sensors com evidência real | PASS | 5 mutantes: inject→run→FAIL recorded→restore→green confirmed. Não foi "code analysis". |

**Resultado manual**: sem gaps bloqueadores. STRUCTURAL_VALIDATION permanece UNVERIFIED por ausência dos scripts canônicos (DEBT-009).

---

## AC-DATE-01 Audit — Shared Primitive Verification

**Question**: Do BrowserStore and SQLite share the same canonical primitive for converting a timestamp instant to a local semantic date?

**Result**: YES — both adapters use `localDateIso(date)` (db.js:39) in the live completion flow.

### Evidence

| Path | Code | Result |
|------|------|--------|
| SQLite `completeReviewWithEvidence` | `db.js:847` `const evidenceDate = localDateIso(now);` | ✓ canonical |
| BrowserStore `completeReviewWithEvidence` | uses `localDateIso(now)` (T4 fix, `5c542df`) | ✓ canonical |
| BrowserStore `_now` injection parameter | added for testability — passes `Date` object to `localDateIso` | ✓ same primitive |

### Secondary findings (non-blocking)

| Location | Pattern | Context | Verdict |
|----------|---------|---------|---------|
| `analytics.js:54` | `today = new Date().toISOString().slice(0, 10)` | Default param for `bySubject()` — **never reached in production**: caller `app.js:1018` always passes `getLocalDateValue()` | Not blocking; stale default |
| `db.js:344` | `.slice(0, 10)` on stored `completedAt` string | `importAll` SQLite path — reconstructs `evidenceDate` from backup task data when explicit `learningEvidence` rows absent | UTC-slice; safe for schemaVersion 3 backups (explicit evidence rows provided, INSERT OR IGNORE skips reconstruction) |
| `db.js:759` | `.slice(0, 10)` on stored `completedAt` string | `importAll` BrowserStore path — same fallback reconstruction | Same as above |
| `review-schedule.js:14` | `toISOString().slice(0, 10)` | Generates **due dates** (scheduling offsets), not `evidenceDate` | Not a semantic date conversion |
| `analytics.js:20` | `toISOString().slice(0, 10)` | Date arithmetic on existing calendar-date strings (calendar ↔ calendar) | Safe |
| `app.js:215` | `toISOString().slice(0, 10)` | `getTomorrowValue(today)` — input is already a calendar date string | Safe |

**Conclusion**: No hidden second implementation of instant→local-date conversion. Live completion path uses `localDateIso` in both adapters. Secondary findings logged as DEBT candidates; not blocking UAT.

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| T1 | `d68589f` | fix: INSERT OR IGNORE → INSERT in SQLite completeReviewWithEvidence |
| T2 | (included in T3 commit) | Rust test complete_review_duplicate_rolls_back |
| T3 | `82caf1f` | fix: replace deleteCascade with deleteIfEmpty for subjects |
| T4 | `5c542df` | fix: local date boundary — localDateIso + getCompletedToday anchored to evidence_date |
| T5 | `c78cf86` | fix(boot): correct settings bootstrap parameter binding on fresh install |
| T6-T9 | `55286ad` | chore(spec): governance reconciliation for pre-PR hardening pass |
| T7 | `af000b2` | fix(governance): real mutation testing + close AC-TRACK-01 |
| UAT dataset | `9e412b6` | feat(uat): medical dataset + validation.md final status |
| UAT seeder | `70f07f0` | feat(uat): expose window.__seedUatMedical DEV-only console hook |
| PRE-UAT | `8b714b7` | chore(state): update test count (97) and full commit log in STATE.md |
| P0-2/P0-3/P0-4/P0-5/P1-2/P1-5 | `a76c1d3` | fix(db): P0-5 fixes from external adversarial audit (clearAll FK, context contract, v1 backup migration, DEV seed guard, DOM selectors, canonical thresholds) |
| P1-3 | `9da7eba` | chore(validation): update P1-3 — test count 97→103, 6 new discrimination mutants (M6-M10), P0-2/3/4/5/P1-2/5 evidence |
| P1-4 | `8549539` | fix(stats): P1-4 — Stats.calculate uses learning_evidence as single performance source |
| P1-6 | `bb4bf4c` | fix(analytics): P1-6 — bySubject default today uses local date, not UTC slice |
| P1-7 | `f51b70d` | fix(rust-tests): P1-7 — sync setup_review_schema with real db.js schema |

---

## UAT Checklist — Tauri Desktop Real-Device Smoke

Perform on a real Tauri Desktop build (`cargo tauri dev`).

### Expected state after seeding (2026-09-04)

Run in DevTools Console before starting UAT:
```js
await window.__seedUatMedical()
// then reload the page
```

| Item | Expected |
|------|----------|
| Subjects | 4: Fisiologia · Farmacologia · Microbiologia · Bioquímica — UAT vazia |
| Learning units | 5 |
| Review tasks | 80 (16 per unit) |
| **Overdue** (dueDate < 2026-09-04, pending) | **1**: Fisiologia — "Potencial de membrana em repouso" review #1 (due 2026-09-02) |
| **Due today** (dueDate = 2026-09-04, pending) | **4**: Fisiologia U1 review #1 · Farmacologia U3 review #2 · Microbiologia U4 review #3 · Farmacologia U5 review #1 |
| Historical evidence | 3: Farmacologia U3 review #1 (80%) · Microbiologia U4 review #1 (70%) · Microbiologia U4 review #2 (90%) |
| Empty subject | Bioquímica — UAT vazia (0 units) |

### UAT-1: Fresh Install — Settings Bootstrap (AC-BOOT-01)

1. Delete or move aside the app's SQLite database (platform-specific data dir)
2. Launch app (cold start)
3. Open DevTools Console → run: `window.__db?.settings?.get()` or query via import
4. **Expected**: `review_schedule` field is non-NULL JSON array `[1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]`
5. **Expected**: App loads to main screen without error

### UAT-2: Complete U5 Review — Duplicate Prevention (AC-PERSIST-01/02)

Target unit: **Farmacologia — "Receptores colinérgicos muscarínicos e nicotínicos"** (U5, review #1 due 2026-09-04)

1. From "Hoje" tab, locate U5 and complete its review — submit **2 correct out of 3** (66.67%)
2. **Expected**: Review marked done; evidence stored with `score_percent ≈ 66.67`
3. Confirm in SQLite (DevTools or external tool): `SELECT * FROM learning_evidence WHERE unit_id = 5`
4. Quit and restart the Tauri app
5. **Expected**: Evidence row persists after restart; "Hoje" tab shows U5 as completed
6. Attempt to complete the same review again (navigate back or call via console)
7. **Expected**: Error thrown; review_task retains original score; `evidence_count` for U5 stays 1

### UAT-3: Date Boundary — Local vs UTC (AC-DATE-01)

1. Set system clock to 23:55 local time
2. Complete a review
3. Advance system clock to 00:05 next day
4. Check "Hoje" tab — review of **yesterday** must NOT appear; "Hoje" tab shows tomorrow's tasks
5. **Expected**: `getCompletedToday(today)` uses local `evidence_date`; yesterday's review not shown today

### UAT-4: Delete Subject with Units — Rejected (AC-DELETE-01)

1. Locate **Fisiologia** (has 2 learning units)
2. Attempt to delete Fisiologia
3. **Expected**: App shows error; Fisiologia remains; units intact

### UAT-5: Delete Empty Subject — Accepted (AC-DELETE-01 inverse)

1. Locate **Bioquímica — UAT vazia** (0 units)
2. Delete the subject
3. **Expected**: Subject deleted without error; subject list shows 3 remaining

### UAT-6: Edit U5 — Add summaryBody, Persist After Restart

1. Open **Farmacologia — "Receptores colinérgicos muscarínicos e nicotínicos"** (U5)
2. Add a summaryBody text (any text)
3. Save
4. Quit and restart the Tauri app
5. **Expected**: summaryBody text persists after restart

---

## Discrimination Matrix — Mutant Kill Evidence (REAL EXECUTION)

All mutants injected, tests run, failure recorded, code restored, green confirmed.

| ID | Mutant | Kill test | Result |
|----|--------|-----------|--------|
| M1 | BrowserStore: remove `if (dup) throw` in `learningEvidence.create` | `learning-evidence.test.js` "segunda evidência para mesma reviewTask deve falhar" | FAIL with mutant (1/23 fail), PASS restored |
| M2 | `evidenceDate = now.toISOString().slice(0,10)` instead of `localDateIso(now)` | New M2 kill test: injects `new Date('2026-09-04T01:30:00.000Z')` (UTC-3 env) — `localDateIso` returns "2026-09-03", UTC returns "2026-09-04" | FAIL with mutant (1/23 fail), PASS restored. Note: `_now` injection added to BrowserStore path |
| M3 | `getCompletedToday` filters by `task.reviewDone && completedAt.startsWith(today)` | `learning-evidence.test.js` "encontra revisão mesmo quando completedAt UTC está no dia seguinte" | FAIL with mutant (1/1 target fail), PASS restored |
| M4 | `deleteIfEmpty` removes `if (hasUnits) throw` guard | `subjects.test.js` B+C | FAIL with mutant (2/4 fail), PASS restored |
| M5 | Rust: Settings INSERT `values: vec![]` (unbound $1) | `lib.rs::fresh_install_review_schedule_is_canonical` | FAILED with mutant (cargo test FAILED), PASS restored |
| M6 | Remove P0-3 first check: `if (context === 'REVIEW' && reviewTaskId == null) throw` (BrowserStore) | `learning-evidence.test.js` "P0-3: context REVIEW sem reviewTaskId lança erro" | FAIL with mutant, PASS restored |
| M7 | Remove P0-3 second check: `if (context !== 'REVIEW' && reviewTaskId != null) throw` (BrowserStore) | `learning-evidence.test.js` "P0-3: context INITIAL_PRACTICE com reviewTaskId lança erro" | FAIL with mutant, PASS restored |
| M8 | Remove `DELETE FROM learning_evidence` from `buildClearStatements()` | `learning-evidence.test.js` "P0-2: clearAll apaga learning_evidence antes de review_tasks" | FAIL with mutant (FK violation), PASS restored |
| M9 | `migrateV1ImportData`: return `data` unmodified (skip migration) | `learning-evidence.test.js` "P0-4: backup v1 (studyRecords, sem schemaVersion) é aceito e migrado" | FAIL with mutant (schemaVersion null → rejection), PASS restored |
| M10 | `MIN_VERSION = 2` (revert to pre-fix) | `learning-evidence.test.js` "P0-4: backup schemaVersion 1 com learningUnits é aceito" | FAIL with mutant (schemaVersion 1 rejected), PASS restored |

---

## Open Gaps

| Gap | Severity | Blocking PR? |
|-----|----------|-------------|
| ~~DEBT-008: SPEC_PRECISION_GAP AC-ACOMP-03~~ — RESOLVED: 5-state spec table corrected in analytics-vnext spec.md to match `getTrackingState` in app.js | resolved | No — closed in `af000b2` |
| DEC-013-V2 ACCEPTED — `src_tauri/decisions/DEC-013-V2.md` (`7256ca3`) | resolved | No — accepted |
| UAT-1 through UAT-6 not yet executed on real Tauri build | P1 | HUMAN_GATE: requires manual execution |
| ~~`analytics.js:54` UTC default param~~ — RESOLVED: `getLocalDateValue()` now used (`bb4bf4c`) | resolved | No — fixed |
| ~~`Stats.calculate` uses reviewTasks for performance~~ — RESOLVED: uses learning_evidence (`8549539`) | resolved | No — fixed |
| ~~Rust setup_review_schema missing summary_body/comment~~ — RESOLVED: schema synced with db.js (`f51b70d`) | resolved | No — fixed |
| `db.js:344,759` importAll reconstruction uses `.slice(0,10)` on UTC timestamp string — UTC-unsafe for midnight-boundary historical data in legacy backups (schemaVersion < 3) | P3 | No — schemaVersion 3 backups provide explicit evidence rows |

---

## Governance Deviation Record

| Deviation | Rule violated | Action |
|-----------|---------------|--------|
| T2+T3 in single commit (`82caf1f`) | TCL: one atomic commit per task | History not rewritten (safe). Rule applies to future tasks. |
| T7+T8+T9 in single commit (`55286ad`) | TCL: one atomic commit per task | History not rewritten (safe). Rule applies to future tasks. |

---

## Fresh Verifier — Independent Pass (2026-09-04)

Second session, fresh context. Re-ran all gates without prior session state.

| Gate | Result |
|------|--------|
| `node --test test/*.test.js` | PASS — 104/104 |
| `cargo test` (src-tauri/) | PASS — 8/8 |
| `npm run build` | PASS — 21 modules, exit 0 |

Confirmed: all P0/P1 adversarial audit fixes applied. 7 new tests (P0-2/P0-3/P0-4 discrimination + P1-4 golden fixture). Build artifact clean.

---

## Closure Declaration

**Automated gate**: PASS (104 node:test, 8 cargo test, 2026-09-04)  
**Build gate**: PASS (vite build — 21 modules, exit 0, 2026-09-04)  
**Discrimination gate**: PASS — all 10 mutants killed by real execution (inject → fail → restore → green); M6-M10 added for P0-2/P0-3/P0-4 fixes from adversarial audit  
**Fresh verifier**: PASS — re-run post adversarial-audit fixes 2026-09-04: 104/104 JS, 8/8 Rust, build clean  
**AC-TRACK-01**: PASS — spec corrected, DEBT-008 resolved  
**AC-DATE-01 audit**: PASS — both adapters use `localDateIso`; no hidden UTC-slice in live completion path  
**Structural validation (Python scripts)**: UNVERIFIED — TLC_INSTALLATION_MISMATCH = TRUE. `validate_spec.py`, `validate_tasks.py`, `validate_completion.py` absent from runtime (DEBT-009). Manual structural validation equivalent performed (see §Manual Structural Validation above): SPEC/TASKS/VALIDATION checks all PASS. Status remains UNVERIFIED per TCL fail-closed: manual does not substitute for script. Does NOT block UAT or PR.  
**Manual UAT gate**: PENDING — requires human execution of UAT-1 through UAT-6 on Tauri desktop build  
**DEC-013-V2**: PENDING — HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL  

`AUTOMATED_TESTS: PASS — 104/104 JS, 8/8 Rust`  
`DISCRIMINATION: PASS — 10 mutants killed`  
`BUILD: PASS`  
`FRESH_VERIFIER: PASS`  
`STRUCTURAL_VALIDATION: UNVERIFIED`  
`UAT: PENDING`  
`PRE_PR_TECHNICAL_CLOSURE: PENDING`  

_STRUCTURAL_VALIDATION blocked on: create or locate `validate_spec.py`, `validate_tasks.py`, `validate_completion.py` scripts, then execute against this feature._  
_Status will be promoted to `PRE_PR_TECHNICAL_CLOSURE: PASS` only after UAT-1..UAT-6 executed and DEC-013-V2 approved._
