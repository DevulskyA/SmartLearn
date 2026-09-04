# STATE.md — SmartLearn (compact checkpoint)

> Full history: `.specs/project/STATE.md` + git log. This file = current snapshot only.

**Date:** 2026-09-04
**Governance:** TLC Strict + ECC Engineering (all sessions)

---

PROJECT: SmartLearn
BRANCH: claude/fix-complete-review-sqlite-593426
LOCAL_HEAD: 8f3c849 (post P1-6 canonical source + P1-2 orphan handler)
REMOTE_PR: #3
REMOTE_HEAD_KNOWN: 585d766d56ea576c362b6c4029adfdb559cf95cc
PR_STATE: DRAFT / open / not merged
WORKTREE: clean (pending Android build + STATE commit)

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

CURRENT_OBJECTIVE: Fechar External Audit Round 2 antes de novo push.

LAST_PROVEN_LOCAL_GATES:
- JS: 138/138 node:test PASS (post 8f3c849, 2026-09-04)
- Rust: 11/11 cargo test PASS (canonical JSON schema, 2026-09-04)
- WEB_REAL: PASS — browser: Plano→Nova aula→save→reload→persists (localStorage, 2026-09-04)
- WEB_BUILD: PASS — vite build clean 252ms (2026-09-04)
- WINDOWS_BUILD: PASS — cargo build PASS (2026-09-04)
- WINDOWS_INSTALLER: PASS — cargo tauri build → MSI + NSIS produced (2026-09-04)
- WINDOWS_REAL: HUMAN_GATE — native Tauri window not accessible via browser automation; requires human install→open→SQLite flow→restart smoke test
- ANDROID_INIT: PASS — cargo tauri android init success (2026-09-04)
- ANDROID_BUILD: IN PROGRESS — cargo tauri android build --apk running (2026-09-04)
- ANDROID_REAL: PENDING — requires device/emulator; HUMAN_GATE if build passes
- discrimination: 10 mutants killed (prior session, committed)

P1-7: TLC_RUNTIME=UNAVAILABLE (CLAUDE_SKILL_DIR="" confirmed by echo); TLC_STRUCTURAL=UNVERIFIED; DEBT.md updated (647503c)

P0_OPEN: 0

P1_CLOSED (all evidence executed):
- P1-1: tracking Option C (47fd617; 16 tests + discrimination) — DONE
- P1-2: Cadastro removed from nav (e944c04); orphan handler removed (8f3c849); WEB_REAL functional proof; 138/138 — DONE
- P1-3: Resumo Mestre real edit + Ir para revisão routing (3d358e5) — DONE
- P1-4: analytics 30-day exact windows (eb35fd2; 8 boundary tests) — DONE
- P1-5: threshold authority (eb35fd2) — DONE
- P1-6: canonical JSON source (8f3c849); schema-statements.json consumed by db.js + Rust sensor; kill test proven — DONE
- P1-7: DEBT.md corrected (647503c); TLC_RUNTIME=UNAVAILABLE documented; $CLAUDE_SKILL_DIR="" verified — DONE
- P1-8: WEB_REAL PASS; WINDOWS_BUILD+INSTALLER PASS; ANDROID_BUILD IN PROGRESS; WINDOWS_REAL+ANDROID_REAL = HUMAN_GATE

P0_CLOSED:
- P0-1: pre-migration block (eb35fd2) — DONE
- P0-2: evidence integrity (committed) — DONE
- P0-3: validateImportContent (647503c) — DONE
- P0-4: BrowserStore seed guard (committed) — DONE

TRACKING_CANONICAL:
ATRASADO > SEM_EVIDENCIA > EM_REVISAO > EM_ESTUDO > EM_DIA
sem regra arbitrária de 7 dias

EXTERNAL_ACTIONS_NOT_AUTHORIZED: push / PR update / merge / deploy

NEXT_ACTION: await ANDROID_BUILD result → commit STATE.md → HUMAN_GATE: CORRECTION_ROUND_2_READY_FOR_EXTERNAL_AUDIT

OPEN_HUMAN_GATES:
1. WINDOWS_REAL: install MSI/NSIS → open app → create unit → close → reopen → verify SQLite data
2. ANDROID_REAL: install APK on device/emulator → run critical flow → verify SQLite persistence → restart

STOP_CONDITION: HUMAN_GATE: CORRECTION_ROUND_2_READY_FOR_EXTERNAL_AUDIT

RESUME_RULE:
Após /clear: reconcilie repo + STATE. Continue do NEXT_ACTION acima.
Máxima autonomia local. LOCAL ONLY — NÃO PUSH, NÃO UPDATE PR, NÃO MERGE, NÃO DEPLOY.
