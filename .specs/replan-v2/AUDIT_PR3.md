---
name: audit-pr3
description: Auditoria PR #3 — input-integrity-hardening-v2 (HEAD 1fa27ac4)
metadata:
  type: project
  phase: FASE_A
  created: 2026-09-05
  supersedes: .specs/features/input-integrity-hardening-v2/validation.md (CURRENT_CANDIDATE=PASS mantido, mas lacunas identificadas abaixo)
---

# AUDIT PR #3 — input-integrity-hardening-v2

**Branch:** `claude/fix-complete-review-sqlite-593426`
**HEAD auditado:** `1fa27ac4acc3cee0fc40408609a72b6549d3d0a2`
**Base:** `74e3ee77a21e012672d3f3caec0dafbbeb831d71` (remote antes de 25 commits novos)
**Evidência:** diff lido diretamente de src/db.js (fix-complete-review-sqlite worktree)

---

## 1. Domínio e Schema

| Item | Classificação | Evidência |
|------|--------------|-----------|
| Schema v3: subjects, learning_units, review_tasks, exercises, learning_evidence, settings | **PRESERVAR** | src/db.js:21 `SCHEMA_VERSION = 3` |
| `source_text` canônico (DEC-013-V2 aplicado) | **PRESERVAR** | mapLearningUnit linha 74 — sem source_id |
| `learning_evidence` como ledger separado de review_tasks | **PRESERVAR** | createLearningEvidence separado de completeReview |
| `_bootstrap` tabela de dev-seed | **PRESERVAR** | isolada de importAll/clearAll |
| Renomeação `study_records → learning_units` via migrationPlan.preMigration | **PRESERVAR** | DB.init() linhas 1186-1205 |
| `sources` tabela — REMOVIDA do schema vNext | **PRESERVAR** | não aparece em schemaStatements de PR #3 |

## 2. Validação de Entrada

| Item | Classificação | Evidência |
|------|--------------|-----------|
| `normalizeEntityName`: NFC + colapso espaços + trim | **PRESERVAR** | db.js:161-168 — inclui NFC, não apenas whitespace |
| `rejectNulBytes`: rejeita `\x00` em title/sourceText/summaryBody | **PRESERVAR** | db.js:170-174 |
| `rejectLineTerminators`: rejeita U+0085/U+2028/U+2029 | **PRESERVAR** | db.js:176-181 |
| `validateUnitData`: aplica rejectNul + rejectLineTerminators | **PRESERVAR** | db.js:183-189 |
| Dedup COLLATE NOCASE na criação de subject | **PRESERVAR** | db.js:1299-1302 |
| Archived-subject guard em createWithReviews | **PRESERVAR** | db.js:1471-1478 |

## 3. Import/Backup/Migration

| Item | Classificação | Evidência |
|------|--------------|-----------|
| `assertImportData` com `validateImportContent` | **PRESERVAR** | Full referential integrity: subject_id, unit_id, dates, NUL, line terminators |
| `migrateV1ImportData`: converte studyRecords+sources para learningUnits | **PRESERVAR** | db.js:225-254 — backward compat |
| V2→V3 migration: insere learning_evidence a partir de review_tasks completadas | **PRESERVAR** | buildImportStatements linha 468-497 |
| `INSERT OR IGNORE INTO learning_evidence` na migration | **PRESERVAR** | db.js:484 — idempotente |
| `buildClearStatements` preserva settings com reset de review_schedule | **PRESERVAR** | db.js:362-375 |

## 4. Persistência: SQLite (Tauri)

| Item | Classificação | Evidência |
|------|--------------|-----------|
| `hasTauriRuntime()` via `__TAURI_INTERNALS__.invoke` | **PRESERVAR** | db.js:512-514 |
| `ensureColumns` com ALTER TABLE para upgradar DBs antigos | **PRESERVAR** | Subjects/LU/RT/Exercises cada um tem ensureColumns |
| `completeReviewWithEvidence` via `execute_sqlite_transaction` (atômico) | **PRESERVAR** | db.js:1909-1943 — 2 statements na mesma TX |
| `createWithReviews` via invoke execute_sqlite_transaction | **PRESERVAR** | db.js:1551 — unit + reviews atômicos |
| PRE-MIGRATION em DB.init() antes de schemaStatements | **PRESERVAR** | Evita criação de learning_units vazio ao lado de study_records |

## 5. Persistência: BrowserStore

| Item | Classificação | Evidência |
|------|--------------|-----------|
| BrowserStore espelha SQLite: learningUnits/learningEvidence/exercises | **PRESERVAR** | createBrowserStore() completo |
| `readState()` lança em JSON corrompido | **PRESERVAR** | db.js:546-553 — throw vs silêncio |
| `normalizeUniqueName` em BrowserStore.subjects.create | **PRESERVAR** | Dedup consistente com SQLite |
| `archived-subject guard` em BrowserStore.createWithReviews | **PRESERVAR** | db.js:738-743 |
| `completeReviewWithEvidence` em BrowserStore: atômico (write state 1x) | **PRESERVAR** | db.js:1016-1051 |
| Dev seed via `import.meta.env.DEV` guard | **PRESERVAR** | não roda em produção |

## 6. Testes

| Item | Classificação | Evidência | Alerta |
|------|--------------|-----------|--------|
| Test files: learning-units.test.js, subjects.test.js, naming-validation.test.js, learning-evidence.test.js | **PRESERVAR** | 97 testes pass (NOT_RERUN nesta auditoria) | NOT_RERUN |
| Rust cargo: 8 testes (lib.rs integration) | **PRESERVAR** | NOT_RERUN | NOT_RERUN |
| Fluxo de criação de aula com revisões | **PRESERVAR** | test provavelmente cobre — não relido | UNVERIFIED |

## 7. Falso-PASS e Lacunas

| Lacuna | Severidade | Detalhes |
|--------|-----------|----------|
| **Testes não reexecutados** — PASS histórico (sessões anteriores) | MÉDIO | Sem evidência de teste atual; marcado como NOT_RERUN |
| **Sem teste de integração BrowserStore×SQLite** — mesmas operações testadas em cada path? | MÉDIO | Testes provavelmente são unitários por path; fluxo completo BrowserStore→import→SQLite não testado |
| **`readState` throw path**: teste de corrupção de localStorage | BAIXO | Test existe (4 testes de hasBrowserStoreData) mas throw path do readState não explicitamente coberto |
| **UAT Tauri** — nunca executado desde TASK-019 | ALTO | HUMAN_GATE: requer app desktop real |
| **Android runtime** — AC-029 nunca provado | ALTO | HUMAN_GATE: requer device/emulator |
| **completeReviewWithEvidence SQLite**: teste de rollback quando 2nd INSERT falha | MÉDIO | Não visível nos testes lidos; assume-se coberto mas UNVERIFIED |
| **Platform discrimination**: código Tauri-only não detectado em caminho compartilhado? | BAIXO | invoke() está em paths condicionados por hasTauriRuntime |

## 8. UX / Produto

| Item | Classificação | Notas |
|------|--------------|-------|
| Botão Cadastro removido da nav | **PRESERVAR** | Não visível em db.js; assumido de commit anterior b25f0c9 |
| Banner de inicialização com falha (AC-003) | **PRESERVAR** | Implementado em commits anteriores |
| Semantic tracking states (285516e) | **PRESERVAR** | Elimina Pendente, unifica state machine |
| Filtro conflitante limpo após save (AC-014) | **PRESERVAR** | Commit 5041b77 |
| Cor de disciplina (`DISC-BLUE` default) | **PRESERVAR** | db.js:626, 1484 |

## 9. Compatibilidade com Canonical Architecture

| Decisão Canônica | Status em PR #3 |
|-----------------|----------------|
| 1. Web App/PWA única | COMPATÍVEL — BrowserStore funciona em web |
| 2. Servidor CENTRAL | N/A — PR #3 não implementa servidor; sem conflito |
| 3. SQLite+WAL no servidor | N/A — PR #3 é client-only |
| 4. Windows/Android shells finos | COMPATÍVEL — hasTauriRuntime() isola Tauri |
| 5. Offline read Android | N/A |
| 6. Escrita offline ADIADA | COMPATÍVEL — sem fila offline |
| 8. NO_DATA_LOSS | COMPATÍVEL — importAll preserva, backupKey protege |
| 9. Arquitetura de dados primeiro | COMPATÍVEL — esquema correto e completo |

## Sumário Executivo

PR #3 contém o **domínio correto e validação sólida**. Todo o código de src/db.js do PR #3 é candidato a PRESERVAR na arquitetura central. Os principais gaps são:
1. Testes não reexecutados (NOT_RERUN) — requer execução antes de merge
2. UAT Tauri e Android runtime são HUMAN_GATE irresolvíveis por agente
3. O BrowserStore (localStorage) se torna fallback web, não caminho principal, na arquitetura central

**VEREDICTO: CURRENT_CANDIDATE=PASS com HUMAN_GATE abertos (UAT Tauri, Android). Código de domínio é APROVEITÁVEL 100% na arquitetura servidor-central.**
