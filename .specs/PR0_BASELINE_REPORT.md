---
name: pr0-baseline-report
description: PR-0 Baseline Closure — T1-T7 audit result for PR #3
metadata:
  type: project
  created: 2026-09-05
---

# PR-0 Baseline Closure Report

**HEAD:** `1fa27ac4acc3cee0fc40408609a72b6549d3d0a2`
**Branch:** `claude/fix-complete-review-sqlite-593426`
**Date:** 2026-09-05

---

## Output

```
HEAD:           1fa27ac4acc3cee0fc40408609a72b6549d3d0a2
FIXES:          0  (no P0/P1 defects found)
P0_P1:          0 open
JS:             223/223 PASS  (npm test, node v24.19.0, fresh run)
RUST:           13/13 PASS   (cargo test, src-tauri/, fresh run)
BUILD:          PASS dev profile — Finished in 279ms (fresh run)
J1:             PASS — empty sandbox; Semiologia Médica + Ausculta Cardíaca unit created; subjectId=1 linked; 16 review tasks; persisted after reload
J2:             PASS — "  SEMIOLOGIA MÉDICA  " triggered unique constraint; 1 subject preserved; double-click produced 1 unit (AC-013)
J3:             PASS — QuotaExceededError injected; unitCount=2 unchanged (zero partial state); draft preserved; retry saved 3rd unit
J4:             PASS — filter "Semiologia Médica" reset to "" after saving "Fisiologia" unit; O₂/Na⁺/K⁺ summary persisted
J5:             PASS — schemaVersion=99 rejected ("O backup é inválido"); state unchanged; valid v3 roundtrip imported successfully
J6:             PASS — corrupt bytes "CORRUPT_GARBAGE{not valid json!!!@#$%^&*}" identical after reload; recovery banner shown
DISCRIMINATION: N/A — FIXES=0; no production code changed; no new sensors needed
VERIFIER:       PASS — no material gap; 1 new P2 added (see Fresh Verifier + Deferred D4)
DEFERRED:       4 P2 items documented below (D1–D4) + 3 HUMAN_GATE items (D5–D7)
READY_FOR_BASELINE_REVIEW: YES — pending HUMAN_GATE: UAT Tauri (Windows) + UAT Android
```

---

## T1-T7 Contract Audit

### T1 — Criação atômica: PROVEN

| Contrato | Evidência | Status |
|---------|----------|--------|
| createWithReviews: disciplina + aula + revisões em uma chamada | learning-units.test.js:295 | ✓ |
| Falha de storage → zero estado parcial (AC-012) | learning-units.test.js:325 | ✓ |
| Nome equivalente reutiliza subject existente | learning-units.test.js:311 | ✓ |
| Disciplina arquivada → erro orientado (AC-009) | learning-units.test.js:177 | ✓ |
| SQLite: execute_sqlite_transaction_rolls_back_on_error | lib.rs:execute_sqlite_transaction_rolls_back_on_error | ✓ |

### T2 — Dados e validação: PROVEN

| Contrato | Evidência | Status |
|---------|----------|--------|
| NUL bytes rejeitados (AC-026) | learning-units.test.js:196-236 | ✓ |
| U+0085/U+2028/U+2029 rejeitados (AC-028) | learning-units.test.js:239-291 | ✓ |
| NFC + colapso de espaços (normalizeEntityName) | subjects.test.js:137 | ✓ |
| Unicode médico válido preservado (Na⁺/K⁺, O₂) | naming-validation.test.js:147-154 | ✓ |
| Dedup COLLATE NOCASE | learning-units.test.js:311 | ✓ |
| correctCount > questionsCount rejeitado | learning-evidence.test.js:95 | ✓ |
| Context inválido rejeitado | learning-evidence.test.js:65 | ✓ |
| questionsCount=0 rejeitado | learning-evidence.test.js:80 | ✓ |
| Provenance inválido em exercise rejeitado | exercises.test.js:47 | ✓ |
| questionText vazio rejeitado | exercises.test.js:95 | ✓ |

### T3 — Evidência: PROVEN

| Contrato | Evidência | Status |
|---------|----------|--------|
| completeReviewWithEvidence: review_task + learning_evidence atômicos (BrowserStore) | learning-evidence.test.js:140 | ✓ |
| completeReviewWithEvidence: rollback SQLite em duplicate (Rust) | lib.rs:complete_review_duplicate_rolls_back | ✓ |
| Segunda chamada para mesma task rejeitada | learning-evidence.test.js:185 | ✓ |
| evidenceDate usa dia local (kill test M2) | learning-evidence.test.js:537 | ✓ |
| getCompletedToday usa evidence_date, não completedAt | learning-evidence.test.js:555 | ✓ |
| REVIEW sem reviewTaskId rejeitado | learning-evidence.test.js:606 | ✓ |
| INITIAL_PRACTICE/EXTERNAL com reviewTaskId rejeitado | learning-evidence.test.js:614-628 | ✓ |

### T4 — Backup/Import: PROVEN

| Contrato | Evidência | Status |
|---------|----------|--------|
| schemaVersion 3 roundtrip | learning-units.test.js:104, learning-evidence.test.js:437 | ✓ |
| schemaVersion incorreto → fail-closed | learning-units.test.js:120-131 | ✓ |
| Referential integrity: subject_id, unit_id, reviewTaskId | learning-evidence.test.js:335-396 | ✓ |
| Date validation calendária (AC-018) | learning-evidence.test.js:466-493 | ✓ |
| questionsCount=NaN, correctCount=Infinity rejeitados (AC-019) | learning-evidence.test.js:496-515 | ✓ |
| v1 legacy (studyRecords) migrado para v3 | learning-evidence.test.js:635 | ✓ |
| v2→v3 migration cria learning_evidence de review_tasks | learning-evidence.test.js:280 | ✓ |
| Import inválido não altera dados existentes | learning-evidence.test.js:414 | ✓ |
| P0-3 KILL: correctCount incorretamente referenciado detectado | learning-evidence.test.js:402 | ✓ |
| buildClearStatements inclui DELETE FROM learning_evidence | db.js:364 | ✓ |

### T5 — Adapters: PARTIALLY PROVEN (HUMAN_GATE)

| Contrato | Evidência | Status |
|---------|----------|--------|
| BrowserStore: todos os contratos T1-T4 | JS tests (223 PASS) | ✓ |
| SQLite mecanismo: rollback, WAL, atomicidade | Rust tests (13 PASS) | ✓ |
| Cross-adapter semantic equivalence | NOT TESTED | HUMAN_GATE — requer UAT Tauri |
| Validation compartilhada (normalizeEntityName, rejectNulBytes) | Código compartilhado, BrowserStore provado | ✓ (suficiente para baseline) |

### T6 — Tracking/Scheduler: PROVEN

| Contrato | Evidência | Status |
|---------|----------|--------|
| Estados canônicos (SEM_EVIDENCIA, ATRASADO, EM_REVISAO, EM_ESTUDO, EM_DIA) | tracking-state.test.js:A-I2 | ✓ |
| Discrimination sensors (buggy <=7-day rule) | tracking-state.test.js:DISCRIMINATION | ✓ |
| ALGORITHMS.LEGACY, SCHEDULE_OFFSETS fonte única | scheduler.test.js | ✓ |
| generateReviewDates: 16 revisões em ISO-8601 crescente | review-schedule.test.js | ✓ |

### T7 — Test integrity: CLEAN (4 P2 deferred)

| Observação | Arquivo | Linha | Severidade |
|-----------|---------|-------|-----------|
| Nome de teste diz "schemaVersion 2" mas verifica 3 | learning-units.test.js | 104 | P2 — stale description |
| `assert.ok(evidence.length >= 1)` — deveria ser `=== 1` | learning-evidence.test.js | 310 | P2 — weak assertion (não mascara bug: idempotence test usa ===1) |
| `let callCount = 0` nunca assertado | learning-units.test.js | 329 | P2 — dead code em teste |
| M2 kill test é environment-dependent (UTC-3 only); SQLite path não coberto | learning-evidence.test.js | 537 | P2 (NEW-P2 — Fresh Verifier) — ambas implementações corretas; gap é test-integrity only |

Nenhum teste copia implementação, usa skip, ou desvia de produção.

---

## Fresh Verifier

**Argumento 1:** "Tests only run BrowserStore — SQLite path untested at JS level."
**Análise:** VERDADEIRO. Mas: (a) validation layer é compartilhado; (b) SQL generation é compartilhado; (c) Rust tests provam mecanismo de transação; (d) UAT Tauri é HUMAN_GATE. Não é defeito novo.

**Argumento 2:** "T5 cross-adapter equivalence not tested."
**Análise:** VERDADEIRO. Known limitation. HUMAN_GATE. Documentado em AUDIT_PR3.md da sessão de audit.

**Argumento 3:** "Some tests may not exercise production code."
**Análise:** REFUTADO. Todos os testes importam diretamente `../src/db.js` — código de produção real. localStorage mock é infraestrutura necessária, não bypass.

**Argumento 4:** "Full Tauri UAT not run."
**Análise:** VERDADEIRO. HUMAN_GATE. Não é defeito de código.

**Argumento 5:** "`evidence.length >= 1` could mask duplication bug."
**Análise:** PARCIALMENTE VERDADEIRO. Mas idempotence test (`runMigrationFromReviewTasks é idempotente`) usa `=== 1` e detectaria duplicação. Não há gap real. P2.

**Argumento 6:** "M2 kill test `evidenceDate usa dia local` passa em UTC-3 mas não discriminaria em UTC; SQLite adapter `completeReviewWithEvidence` em `src/db.js:1909` não tem parâmetro `_now` injetável — gap de cobertura."
**Análise:** VERDADEIRO. Kill test depende do fuso horário do ambiente. Não cobre SQLite path. Porém: ambas as implementações chamam `localDateIso()` corretamente; nenhum bug real existe. Gap é puramente test-integrity (não consegue falsificar a correção em UTC). Escalado para P2 (D4 — ver Deferred). Não é P0/P1.

**VEREDICTO FRESH VERIFIER: PASS — nenhum gap material. 1 novo P2 adicionado (D4).**

---

## Deferred (P2/P3 — não corrija)

| ID | Arquivo | Linha | Descrição |
|----|---------|-------|-----------|
| D1 | test/learning-units.test.js | 104 | Stale test name: "schemaVersion 2" mas verifica 3. Renomear para "schemaVersion 3" em próxima iteração. |
| D2 | test/learning-evidence.test.js | 310 | Weak assertion `>= 1` na migration v2→v3. Fortalecer para `=== 1` em próxima iteração. |
| D3 | test/learning-units.test.js | 329 | `let callCount = 0` nunca assertado — remover em próxima iteração. |
| D4 | test/learning-evidence.test.js | 537 | **NEW-P2 (Fresh Verifier):** M2 kill test environment-dependent (discrimina apenas em UTC-3); SQLite path `completeReviewWithEvidence` em src/db.js:1909 sem parâmetro `_now` injetável. Ambas implementações corretas (`localDateIso()` usado corretamente). Gap é test-integrity only; fortalecer cobertura em próxima iteração. |
| D5 | T5 cross-adapter | N/A | Sem teste que execute mesmo fluxo em BrowserStore e SQLite comparativamente. Requer Tauri runtime. HUMAN_GATE. |
| D6 | UAT Tauri | N/A | UAT Windows com app desktop real. HUMAN_GATE. |
| D7 | UAT Android | N/A | UAT Android com device/emulator. HUMAN_GATE. |
