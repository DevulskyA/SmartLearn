# Validation — SmartLearn Pre-PR Closure Hardening

**Feature**: smartlearn-pre-pr-closure-hardening  
**Validated**: 2026-09-04  
**Branch**: claude/fix-complete-review-sqlite-593426

---

## Automated Evidence

| AC | Test file | Assertion | Status |
|----|-----------|-----------|--------|
| AC-PERSIST-01 | `test/learning-evidence.test.js` — "completeReviewWithEvidence: segunda chamada lança erro (duplicata bloqueada)" | `INSERT` (not `INSERT OR IGNORE`) raises unique constraint error on second call | PASS (96/96) |
| AC-PERSIST-02 | `src-tauri/src/lib.rs::complete_review_duplicate_rolls_back` | Rust SQLite: score/evidence state unchanged after duplicate attempt | PASS (8/8 cargo) |
| AC-DELETE-01 | `test/subjects.test.js` — "B: rejeita exclusão quando há learning_unit associada" | `deleteIfEmpty` throws when units exist | PASS (96/96) |
| AC-DELETE-01 | `test/exercises.test.js` — "deleteIfEmpty: subject com exercises não pode ser excluída" | Exercises survive rejection | PASS (96/96) |
| AC-DATE-01 | `test/learning-evidence.test.js` — "evidenceDate usa dia local, não prefixo UTC" | `evidenceDate` equals `localDateIso(now)`, not UTC prefix | PASS (96/96) |
| AC-DATE-01 | `test/learning-evidence.test.js` — "getCompletedToday: encontra revisão mesmo quando completedAt UTC está no dia seguinte" | Cross-midnight boundary case — local date persists correctly | PASS (96/96) |
| AC-BOOT-01 | `src-tauri/src/lib.rs::fresh_install_review_schedule_is_canonical` | `review_schedule` is non-NULL and matches REVIEW_DAY_OFFSETS after fresh init | PASS (8/8 cargo) |
| AC-BOOT-01 | `src-tauri/src/lib.rs::fresh_install_unbound_param_yields_null_schedule` | Regression sensor: unbound $1 yields NULL (documents pre-T5 bug) | PASS (8/8 cargo) |

**Test counts**: 96/96 node:test, 8/8 cargo test (2026-09-04)

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| T1 | `d68589f` | fix: INSERT OR IGNORE → INSERT in SQLite completeReviewWithEvidence |
| T2 | included in T3 commit | Rust test complete_review_duplicate_rolls_back |
| T3 | `82caf1f` | fix: replace deleteCascade with deleteIfEmpty for subjects |
| T4 | `5c542df` | fix: local date boundary — localDateIso + getCompletedToday anchored to evidence_date |
| T5 | `c78cf86` | fix(boot): correct settings bootstrap parameter binding on fresh install |

---

## UAT Checklist — Tauri Desktop Real-Device Smoke

Perform on a real Tauri Desktop build (`cargo tauri build` or `cargo tauri dev`).

### UAT-1: Fresh Install — Settings Bootstrap (AC-BOOT-01)

1. Delete or move aside the app's SQLite database (platform-specific data dir)
2. Launch app (cold start)
3. Open DevTools Console → run: `window.__db?.settings?.get()` or query via import
4. **Expected**: `review_schedule` field is non-NULL JSON array `[1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]`
5. **Expected**: App loads to main screen without error

### UAT-2: Complete Review — Duplicate Prevention (AC-PERSIST-01/02)

1. Register a subject and learning unit
2. From "Hoje" tab, complete a review — submit with score
3. **Expected**: Review marked done, evidence stored
4. Attempt to complete the same review task again (navigate back if possible, or via DevTools call to `completeReviewWithEvidence` with same taskId)
5. **Expected**: Error is thrown; review task retains original score; no duplicate evidence row

### UAT-3: Date Boundary — Local vs UTC (AC-DATE-01)

1. Set system clock to 23:55 local time
2. Complete a review
3. Advance system clock to 00:05 next day
4. Check "Hoje" tab — review of **yesterday** must NOT appear; "Hoje" tab is empty
5. **Expected**: `getCompletedToday(today)` uses local evidence_date; yesterday's completed review not shown today

### UAT-4: Delete Subject with History (AC-DELETE-01)

1. Register a subject with at least one learning unit
2. Try to delete the subject
3. **Expected**: App shows error message containing "não é possível excluir" or equivalent; subject remains; units intact

### UAT-5: Delete Empty Subject (AC-DELETE-01 inverse)

1. Register a subject with NO learning units
2. Delete the subject
3. **Expected**: Subject deleted without error

### UAT-6: App Restart Persists All State (AC-PERSIST-02, general)

1. Register subject + unit + complete one review
2. Quit and restart Tauri app
3. **Expected**: Subject, unit, completed review evidence all persist; "Hoje" tab still shows correct completion state

---

## Open Gaps

| Gap | Severity | Blocking PR? |
|-----|----------|-------------|
| DEBT-008: SPEC_PRECISION_GAP AC-ACOMP-03 — tracking state spec table has 4 states, code has 5 (`EM_REVISAO` undefined in spec) | P2 | No — spec accuracy only |
| DEC-013-V2 PROPOSED (fonte = texto livre) — HUMAN_GATE pending | P2 | No — existing behavior unchanged |
| UAT-1 through UAT-6 not yet executed on real Tauri build | P1 | HUMAN_GATE: requires manual execution |

---

## Closure Declaration

**Automated gate**: PASS (96 node:test, 8 cargo test, 2026-09-04)  
**Manual UAT gate**: PENDING — requires human execution of UAT-1 through UAT-6 on Tauri desktop build  

`PRE_PR_CLOSURE_HARDENING: AUTOMATED_GATE_PASS | HUMAN_UAT_PENDING`
