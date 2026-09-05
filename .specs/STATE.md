# STATE.md — SmartLearn (compact checkpoint)

> Full history: `.specs/project/STATE.md` + git log. This file = current snapshot only.

**Date:** 2026-09-05
**Governance:** TLC Strict + ECC Engineering (all sessions)

---

## HANDOFF — 2026-09-05 T7-partial + AC-003 FIX (input-integrity-hardening-v2)

PROJECT: SmartLearn
BRANCH: claude/fix-complete-review-sqlite-593426
HEAD: 5041b77 (fix(integrity): AC-014 clear conflicting plan filter after save)
REMOTE_PR: #3 (DRAFT / open / not merged)
WORKTREE_DIRTY:
- .claude/launch.json  M  (port 5173→5174 + --strictPort flag; local change preserved)
- src-tauri/Cargo.toml M  (CRLF line-ending only; no content change)
- .claude/loop.md      ??  (untracked; prior loop config; preserved)
PLAN_PATH: .specs/features/input-integrity-hardening-v2/tasks.md
REAL_DATA_PROTECTED: no reset / seed / import / destructive migration / clean / reinstall
PLATFORMS: WEB + ANDROID + WINDOWS (WebView = runtime, not 4th platform)
JAVA_INVARIANT: JDK/Gradle toolchain only; no product Java/Kotlin without HUMAN_GATE
PUBLICATION: NONE authorized (no push / PR update / Ready / merge / deploy / release)
BACKGROUND_WRITERS: NONE_ACTIVE
GATES: npm test 218/218 PASS | cargo test 13/13 PASS | npm run build CLEAN @ ac8e985 | npm test 218/218 PASS @ 5041b77
STATUS: CHECKPOINT_PARCIAL — T1-T6 + T7-partial (J1-J4+J6 PASS) + T8-partial comprovados; J5 e Verifier formal pendentes
PENDING: J5 (import inválido browser journey); T8-formal (Verifier output não lido); AC-029 Android runtime
OPEN_GAPS: COLLATE NOCASE vs localeCompare PT-BR (documentado), AC-029 Android runtime
CLOSED_THIS_SESSION (vs 190bb93): AC-003 (banner visível), AC-014 (filtro conflitante reset), J1-J4+J6 PASS; lançamento anterior: AC-009, AC-016, AC-017, AC-026, AC-028

COMMITS_SINCE_LAST_CHECKPOINT (190bb93 → b25f0c9):
- 71421b3 fix(integrity): AC-003 + AC-026 — corrupted storage preserved, NUL bytes rejected
- 65d58cc fix(integrity): AC-008/AC-009 SQLite dedup + archived discipline guard
- 29d50d2 fix(integrity): AC-017 SQLite subjects.create dedup
- ed84c76 fix(integrity): AC-016 two-stage render-after-commit + NUL literal source fix
- ac8e985 fix(integrity): normalizeEntityName — line terminator rejection at DB layer (AC-028)
- 283a8d3 docs(spec): extract input-integrity-hardening-v2 planning documents
- 5f64244 fix(integrity): AC-003 sinalizar leitura invalida — banner visivel em init failure
- b25f0c9 chore(dev): add dev-isolated launch config on port 5175 for J7 browser journeys
- 5041b77 fix(integrity): AC-014 clear conflicting plan filter after save

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
