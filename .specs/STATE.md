# STATE.md — SmartLearn (compact checkpoint)

> Full history: `.specs/project/STATE.md` + git log. This file = current snapshot only.

**Date:** 2026-09-05
**Governance:** TLC Strict + ECC Engineering (all sessions)

---

## HANDOFF — 2026-09-06 SMARTLEARN_V1_CONSOLIDATED_V2 ACTIVE

FEATURE:       smartlearn-v1-consolidated-v2 (T01-T54, AC-01..AC-28)
AUTHORITY:     .specs/features/smartlearn-v1-consolidated-v2/{spec,design,heritage,tasks,acceptance}.md
BRANCH:        claude/smartlearn-v1-complete
HEAD:          bfbb82b (pre-T01-execution checkpoint) -> advancing per task commits below
PR3:           #3 MERGED into main (931dbd9, 2026-09-06)
PR1:           #5 server-central-foundation-v1 MERGED into main (f645a07, 2026-09-06)
MAIN:          f645a0730f6e37560de813b1610f359a57419f27 (contains both merges)

STATUS: Phase 00 (T01-T06) DONE. HEAD=be7cd75.
- T01 DONE: reconciliation evidence recorded (18e903b -> e5292fa merge -> 62ea681 pack -> bfbb82b heritage).
- T02 DONE: Heritage Coverage Matrix filled with real evidence (7 PROVEN, 2 PARTIAL w/ linked GAP to T25-T28/T29-T33). STATE.md restructured.
- T03 DONE: fixed E2E harness defects (two-click flow tested instead of real single-click; length>0 instead of exact deltas). New AC-03 test proves true single-save atomic path already works: 1 click on #plan-unit-save-btn -> +1 subject, +1 unit, +16 reviews. AC-04 honestly BLOCKED_EXTERNAL (no DI seam to inject mid-write failure without touching product for test-only purpose).
- T04 DONE: fixed real product bug — NAMING_PATTERN rejected em-dash/Greek/superscripts in discipline names (AC-05 violation). Extended allowlist surgically; kept sentence-signal symbols (@#$%^`~|\) rejected. Updated 3 tests that had proven the old (non-compliant) behavior as contract.
- T05 DONE: scripts/check-test-inventory.mjs (npm run test:inventory) proves no orphan test files. .github/workflows/ci.yml created (not pushed).
- T06 DONE: found and fixed missing SIGTERM/SIGINT graceful-shutdown handler in server/src/main.js. server/test/process-smoke.test.js (4 tests): cwd-independence, occupied-port clean exit, restart-same-DB, SIGTERM (win32 limitation documented honestly).

Gates at Phase 00 close: root 231/231, server 21/21 (x3 repeat, no native crash), rust 13/13, build PASS, e2e 12/12, test:inventory PASS.

STATUS UPDATE: Phase 01 (T07-T12) DONE + independently verified. Phase 02 in progress (T13-T15 DONE). HEAD=e71756f.

- T07 DONE: /v1 strict envelope (default-deny actor, AJV strict, JSON-only errors).
- T08 DONE: users/sessions schema, synchronous=FULL.
- T09 DONE: bounded scrypt auth (N=131072, decoy-hash for unknown accounts).
- T10 DONE: sessions+CSRF+cookies, /me /logout /password.
- T11 DONE: minimal account UI (self-contained, not yet gating learning screens — real cutover is T20-T24), operator reset-token CLI.
- T12 DONE: trustProxy config, LRU-fixed rate limiter.
- **Independent Fresh Verifier round 1 (separate subagent) found a REAL exploitable defect**: login's malformed-email path called real scrypt (runDecoyHash) BEFORE any rate-limit check; /auth/register had zero rate limiting; scrypt queue had no size cap. VERIFIER_RESULT=FAIL.
- Fixed: rate-limit checked first in login/register; added register limiter; added MAX_QUEUE_LENGTH=100 backstop; fixed a real test-isolation bug (rate limiters were module singletons, now created per registerAuthRoutes() call).
- **Independent Fresh Verifier round 2 (different subagent) confirmed the fix**: traced code, reran all tests, AND built+ran a real exploit script against the actual spawned server process (571ms->12ms transition at exactly the account limit). VERIFIER_RESULT=PASS. Found one more (lower-severity, requires-auth) gap: /auth/password had no rate limit either — fixed immediately, same pattern.
- T13 DONE: learning-domain schema (subjects/learning_units/review_tasks/exercises/exercise_versions/learning_evidence/user_settings) with COMPOSITE FKs (user_id, parent_id) making cross-user linkage a database-level impossibility, verified by direct SQL injection attempts that throw real FK errors.
- T14 DONE: subjects API (list/create/rename/archive/reactivate/reorder/delete-empty), shared/text-validation.js as new single source for name rules.
- T15 DONE: atomic unit+16-reviews creation in one transaction, shared/review-schedule.js, operation-key idempotency. Found+fixed a real calendar bug (JS Date silently overflows Feb 30 to Mar 2 instead of rejecting it).
- T16 DONE (1a932d2): agenda (Intl-based local-day buckets: overdue/today/tomorrow/completedToday) + complete() (review-only vs question-based, server-derived score, one aggregate REVIEW evidence row, ALREADY_COMPLETED guard) + reopen() (never mutates prior evidence). Found a test-harness limitation (not a product bug): `Date.now` mocking does not reliably affect bare `new Date()` on this Node/V8 — fixed via an injectable `now` parameter on complete().
- T17 DONE (e29c057): exercises service (owned list/create/edit/archive/reorder) with migrations/006-exercise-archive.sql (archived_at, archive-not-delete). edit() always appends a new exercise_versions row, never mutates an existing one — a past attempt reference stays resolvable to exactly what it was scored against even after later edits/archival. provenance enum (MANUAL/SOURCE/AI_GENERATED) enforced at service layer.
- T18 DONE (16cb22a): evidence.js (direct POST accepts only INITIAL_PRACTICE/EXTERNAL, never REVIEW; server-derived score, null not zero for unknown performance; owned unit/date filters) + settings.js (timezone is the only editable field; fixed review schedule has no settings path at all — a preference edit can never imply adaptive-rescheduling consent; reads never fabricate a row). reviews.js's getUserTimezone now delegates to settings.get().
- T19 DONE (4cd5692): createLogicalExport (versioned, user-scoped, excludes credentials/sessions/other users) + createPhysicalBackup/verifyPhysicalBackup (atomic tmp-then-rename, separate-connection integrity_check + exact row-count comparison). GET /v1/export is the only HTTP surface (owned data only); whole-DB physical backup stays an operator CLI (scripts/backup.mjs), never an HTTP route, since it spans other tenants' data. SELF-CAUGHT DEFECT: creating backup.js via Write overwrote a pre-existing PR-1 `backup()` function without reading the file first, breaking test/persistence.test.js — caught by the very next full gate run, repaired per code-preservation-guard (restored original function verbatim alongside new exports). LESSON: before Write-ing a "new" file, check it doesn't already exist (Glob/git log), even under time pressure mid-loop — a confident wrong assumption about greenfield is exactly what silently destroys prior work.

Gates at this point: server 165/165, root 240/240, rust 13/13, build PASS, e2e 17/17, test:inventory PASS (35 files).

PHASE 02 (T13-T19) COMPLETE.

- T20 DONE (2c3d520): inventoried every DB.* caller (delegated to a read-only Explore subagent) before writing anything. Found a real pre-existing bug (app.js:1534 `DB.subjects.delete` never existed, silently swallowed) and two real server gaps (no learning-units list/update, no unscoped review-tasks listing) — added learning-units.list/getById/updateFields (title/source/summary only, studyDate excluded — that's design.md §4's date-correction-reschedule, out of scope) and reviews.list(). Built src/api-client.js (typed ApiError vs NetworkError) and src/remote-store.js (drop-in DB-shaped export over /v1, with DTO adapters where the new model deliberately differs — exercises flatten versioned shape, reviewTasks synthesizes reviewDone from completedAt since there are no per-task question/score columns anymore). importAll/clearAll throw NOT_YET_SUPPORTED (T22's UX decision, not faked here). db.js/BrowserStore is UNTOUCHED — actual UI cutover is T21.

Gates at this point: root 257/257, server 169/169, rust 13/13, build PASS, e2e 17/17 (unchanged), test:inventory PASS (36 files).

NEXT_STEP: T21 (connect the Web to real server-owned reads/writes) — this is where src/app.js's screen controllers actually start importing remote-store.js instead of db.js. High-risk: two-browser-context E2E required (same account observes exact state changes; another user sees none; server restart persists; network loss causes a clear write failure without BrowserStore fallback). No blockers.

PRESERVED_HISTORY: everything below this block (2026-09-05 and earlier) is historical PR-0/PR-1 evidence, superseded as the active plan by smartlearn-v1-consolidated-v2 per design.md §1. Do not treat it as current authority; it remains valid evidence of what the merged foundation already proved (223 client / 17 server / 13 Rust tests, PR-0 J1-J6, PR-1 gates).

SIBLING_WORKTREE_DIRTY (observed, not touched): `fix-complete-review-sqlite-593426` (PR#3 branch) has another session's uncommitted changes (.claude/loop.md, docs/research/, .specs tasks.md status edit) as of 2026-09-06. Not part of this mission; do not merge/reconcile without separate authorization.

NEXT_STEP: finish T02 (PRODUCT.md AS-IS/target doc pass), then T03 (prove one-save E2E path, fix wrong locators from prior session).

---

## HANDOFF — 2026-09-05 PR-0 BASELINE CLOSED (historical, superseded above)

FEATURE:       input-integrity-hardening-v2 (PR #3)
PHASE:         PR-0 Baseline Closure — CONCLUÍDO
BRANCH_A:      claude/fix-complete-review-sqlite-593426 @ c28af47
BRANCH_B:      claude/server-first-v1 @ fcd599e
PR3:           #3 DRAFT / open / not merged (audit code baseline)
PR4:           #4 DRAFT / open (experimental; replan-v2 = histórico de auditoria, NÃO plano canônico)

COMPLETED:
- J1 PASS — empty sandbox; unit created; subjectId linked; 16 review tasks; persisted after reload
- J2 PASS — dedup fired (unique constraint); 1 subject; double-click = 1 unit (AC-013)
- J3 PASS — QuotaExceededError; zero partial state; draft preserved; retry succeeded
- J4 PASS — filter reset after save under different subject; summary persisted
- J5 PASS — schemaVersion=99 rejected; state unchanged; valid v3 roundtrip imported
- J6 PASS — corrupt bytes identical after reload; recovery banner shown
- JS: 223/223 PASS (fresh run)
- Rust: 13/13 PASS (fresh run)
- Build: PASS 279ms (fresh run)
- DISCRIMINATION: N/A — FIXES=0
- Fresh Verifier: PASS — no material gap; 1 new P2 added (D4)
- P0/P1: 0 open
- REPORT: .specs/PR0_BASELINE_REPORT.md @ c28af47

IN_PROGRESS: NONE

NEXT_STEP: AGUARDAR plano PR-1 produzido pelo ChatGPT. Claude Code = EXECUTOR; não escolhe arquitetura, roadmap, ou próximo trabalho.

BLOCKERS:
- HUMAN_GATE: UAT Tauri Windows (app desktop real)
- HUMAN_GATE: UAT Android (device/emulador)
- HUMAN_GATE: decisões de infraestrutura PR-1 (Axum/auth/hosting/porta) — ver abaixo

DEFERRED_P2:
- D1: test/learning-units.test.js:104 — stale test name "schemaVersion 2" verifica 3
- D2: test/learning-evidence.test.js:310 — weak assertion `>= 1` (não mascara bug)
- D3: test/learning-units.test.js:329 — dead variable `callCount` nunca assertado
- D4: test/learning-evidence.test.js:537 — M2 kill test UTC-3 only; SQLite path sem _now injection; ambas implementações corretas; gap = test-integrity only

UNCOMMITTED_PRESERVED (não commitados intencionalmente):
- .claude/loop.md          (untracked — prior loop config)
- .specs/features/smartlearn-server-first-v1/tasks.md  (modified — rascunho spec broker-era; NÃO autoridade)
- src-tauri/Cargo.toml     (modified — CRLF line-ending only; sem mudança de conteúdo)

REAL_DATA_PROTECTED: no reset / seed / import / destructive migration / clean / reinstall
PLATFORMS: WEB + ANDROID + WINDOWS (WebView = runtime, not 4th platform)
JAVA_INVARIANT: JDK/Gradle toolchain only; no product Java/Kotlin without HUMAN_GATE

SERVER_CENTRAL_DECISIONS (supersede broker-era decisions; autoridade = goal aprovado 2026-09-05):
- STORAGE: SQLite + WAL mode no servidor central (processo independente, não subprocess Tauri)
- AUTHORITY: servidor central = única autoridade dos dados; não device do aluno
- WEB_PLATFORM: uma única Web/PWA responsiva; sem fork de UI por plataforma
- SHELLS: Windows e Android = shells finos da mesma aplicação (Tauri WebView aponta para servidor)
- OFFLINE_V1: leitura offline da agenda sincronizada + campo lastSyncedAt; defasagem aceita
- WRITES: criar/alterar/concluir revisão exige conexão; erro imediato se offline
- OFFLINE_WRITE: escrita offline ADIADA — sem buffer, sem queue, sem sync background
- SCHEDULER: simples/fixo agora; adaptativo/FSRS adiado
- MIGRATION: NO_DATA_LOSS — toda migration preserva dados
- INFRA_PENDING: Axum, porta, auth, hosting, deployment = decisões técnicas a validar no plano PR-1 (HUMAN_GATE)
- REPLAN_V2: .specs/replan-v2/ = histórico de auditoria (FASE A-E); NÃO autoridade do planejamento futuro

---

## PRIOR CHECKPOINT — 2026-09-04 (closed audit round; preserved for evidence)

PROJECT: SmartLearn
BRANCH: claude/fix-complete-review-sqlite-593426
HEAD_BEFORE: 753424c (fix(p0-3): validateImportContent — correctCount without questionsCount)
HEAD_AFTER: b80fc35 (fix(audit): P1-A+P2-A+P2-B closed; tracking real module, canonical schema, exercises migration)
REMOTE_PR: #3
REMOTE_HEAD_KNOWN: 585d766d56ea576c362b6c4029adfdb559cf95cc
PR_STATE: DRAFT / open / not merged
WORKTREE: clean (post commit)

PLATFORM_INVARIANT:
- WEB = navegador normal; BrowserStore/localStorage
- ANDROID = app Android real via Tauri; distribuível Google Play; SQLite
- WINDOWS = app Windows via Tauri/WebView; SQLite via plugin-sql
- PLATFORMS = WEB + ANDROID + WINDOWS
- WebView é runtime interno do Windows/Tauri, não uma quarta plataforma

JAVA_INVARIANT:
- JDK/Gradle permitido SOMENTE como toolchain Android
- nenhum código de produto em Java (domínio/UI/scheduler/analytics/persistência/learning engine)
- Java/Kotlin manual exige HUMAN_GATE
- arquivos gerados automaticamente pela toolchain são permitidos sem lógica de produto

CURRENT_OBJECTIVE: Fechar External Audit Round 2 — HUMAN_GATE atingido.

LAST_PROVEN_LOCAL_GATES:
- JS: 139/139 node:test PASS (post P0-3 kill test, 2026-09-04)
- Rust: 11/11 cargo test PASS (canonical JSON schema, 2026-09-04)
- WEB_BUILD: PASS — vite build clean (2026-09-04)
- WEB_REAL: PASS — browser: Plano→Nova aula→save→reload→persists (localStorage, 2026-09-04)
- WINDOWS_BUILD: PASS — cargo build PASS (2026-09-04)
- WINDOWS_INSTALLER: PASS — cargo tauri build → MSI + NSIS produced (2026-09-04)
- WINDOWS_REAL: PASS — NSIS installer from HEAD 74e3ee7 (2026-09-04 23:38); installed to C:\Users\Ariel\AppData\Local\SmartLearn; launched; human created unit "WINDOWS_REAL_UAT"; closed app; reopened; unit persisted — SQLite native persistence confirmed (2026-09-04)
- ANDROID_INIT: PASS — cargo tauri android init success (2026-09-04)
- ANDROID_BUILD: PASS — debug APK (app-universal-debug.apk, 608MB) + release unsigned APK (54MB) produced (2026-09-04)
- ANDROID_REAL: PASS — emulator SmartLearn_API_36; installed debug APK; DB schema verified (all vNext tables present); learning_unit inserted → force-stop → relaunch → data persists in UI (Plano screen shows "ANDROID_REAL_TEST" unit); nav verified (Hoje/Plano/Estatísticas/Acompanhar/Disciplinas — no Cadastro); migration from main schema confirmed (app_version=1.0.0 in settings, study_records→learning_units migration happened)

P1-7: TLC_RUNTIME=UNAVAILABLE (CLAUDE_SKILL_DIR="" confirmed by echo); TLC_STRUCTURAL=UNVERIFIED; DEBT.md updated (647503c)

P0_OPEN: 0

P1_OPEN: 0

P1_CLOSED (all evidence executed):
- P1-1: tracking Option C (47fd617; 16 tests + discrimination) — DONE
- P1-2: Cadastro removed from nav (e944c04); orphan handler removed (8f3c849); WEB_REAL functional proof; ANDROID_REAL confirmed no Cadastro in nav — DONE
- P1-3: Resumo Mestre real edit + Ir para revisão routing (3d358e5) — DONE
- P1-4: analytics 30-day exact windows (eb35fd2; 8 boundary tests) — DONE
- P1-5: threshold authority (eb35fd2) — DONE
- P1-6: CANONICAL_PRODUCTION_MIGRATION=PASS (104e158+8d63cc6); migration-main-to-vnext.json consumed by db.js (all migration SQL including ensureColumns) + Rust tests (load_migration_plan); kill test proven (2/11 Rust tests FAIL when JSON broken, restore→PASS); schema-statements.json also shared — DONE
- P1-7: DEBT.md corrected (647503c); TLC_RUNTIME=UNAVAILABLE documented; $CLAUDE_SKILL_DIR="" verified — DONE
- P1-8: WEB_REAL PASS; WINDOWS_BUILD+INSTALLER PASS; ANDROID_BUILD+ANDROID_REAL PASS; WINDOWS_REAL = HUMAN_GATE only

P0_CLOSED:
- P0-1: pre-migration block (eb35fd2) — DONE
- P0-2: evidence integrity (committed) — DONE
- P0-3: validateImportContent (647503c + P0-3 kill test added 2026-09-04) — DONE
- P0-4: BrowserStore seed guard (committed) — DONE

FRESH_VERIFIER: EXECUTED on HEAD b80fc35 (2026-09-04) — FINAL DELTA AUDIT
FRESH_VERIFIER_VERDICT: CONFIRMED_CLEAN — all 6 gates PASS; CONFIRMED_BUGS=0; no gaps
FRESH_VERIFIER_GATES:
- P1-A (tracking real module): PASS (import from src/tracking-state.js; no local copy; mutation killed)
- P2-A (canonical schema complete): PASS (color/is_active/sort_order subjects; algorithm review_tasks; Rust sensor PASS)
- P2-B (exercises preMigration[2] sensor): PASS (Rust test uses load_migration_plan()[2]; kill test confirmed)
- JS_139: PASS (139/139)
- Rust_13: PASS (13/13)
- WEB_BUILD: PASS

TRACKING_CANONICAL:
ATRASADO > SEM_EVIDENCIA > EM_REVISAO > EM_ESTUDO > EM_DIA
sem regra arbitrária de 7 dias

EXTERNAL_ACTIONS_NOT_AUTHORIZED: merge / deploy

MIGRATION_MAIN_TO_VNEXT: PASS (canonical JSON authority: migration-main-to-vnext.json shared by db.js production + Rust tests; kill test: break JSON → 2 Rust tests FAIL; restore → 11/11 PASS; Android runtime confirmed migration ran)
IMPORT_ROLLBACK: PASS (P0-3: importAll fail-closed test)
DISCRIMINATION: 10 mutants killed (prior session) + P0-3 kill test (correctCount field mutation)
BrowserStore_PARITY: PASS (WEB_REAL confirmed)

KNOWN_GAPS:
1. P1-3 runtime verification: routing code present; full end-to-end requires app execution (partially covered by ANDROID_REAL + WEB_REAL but not exhaustively)

REMOTE_ACTIONS_AUTHORIZED: NONE

STOP_CONDITION: WINDOWS_REAL=PASS confirmed — all gates closed; Ready for Review authorized

COMMITS:
- 585d766 (remote base)
- eb35fd2 fix(db+analytics)
- 4c4d85e test(p0-3)
- 47fd617 fix(p1-1)
- 296e9dc fix(p1-2)
- 3d358e5 fix(p1-3)
- dfce1bd test(p1-6)
- f75ce5f chore(state)
- 647503c fix(p0-3,p1-7,invariants)
- e944c04 fix(p1-2)
- 8f3c849 fix(p1-6,p1-2)
- 753424c fix(p0-3)
- 104e158 fix(p1-6): canonical migration JSON + db.js + Rust load_migration_plan
- 8d63cc6 fix(p1-6): ensureColumns hardcoded SQL replaced with migrationPlan indices
- 4f50d5f fix(audit): P1-A+P2-A+P2-B — tracking real module, canonical schema, exercises migration
- b80fc35 fix(test): rename buggy discrimination fixture (no local getTrackingState* name)
