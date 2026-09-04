# impact.md — smartlearn-pre-pr-closure-hardening

**Classificação:** Complex / high-risk
**Data:** 2026-09-04

---

## Target

Múltiplas correções de integridade em `src/db.js` e `src-tauri/src/lib.rs`:
1. SQLite duplicate rollback sensor (Rust test only — código já corrigido em d68589f)
2. `subjects.deleteCascade` → `deleteIfEmpty` (domínio + callers)
3. `evidenceDate` UTC→local em ambos os adapters
4. `getCompletedToday` source: `completed_at` UTC → `evidence_date` local
5. `schemaStatements` settings bind: positional hack → explícito

---

## Callers / entry points

| Função alterada | Callers |
|---|---|
| `DB.subjects.deleteCascade` | `src/app.js:2408` — único caller |
| `evidenceDate` em `completeReviewWithEvidence` | BrowserStore: `db.js:836`; SQLite: `db.js:1644` |
| `reviewTasks.getCompletedToday` | `src/app.js:601` → `renderToday` |
| `schemaStatements` loop | `DB.init()` → `db.js:981-986` |

---

## Dependencies

- `src/db.js` — único ponto autorizado de SQL (DEC-011)
- `src-tauri/src/lib.rs` — `execute_sqlite_transaction_at_path` (Rust tests)
- `src/app.js` — caller de `deleteCascade` e `renderToday`
- `src/scheduler.js` — exporta `REVIEW_SCHEDULE` (SCHEDULE_OFFSETS)

---

## Requirement traceability

| AC | Arquivo(s) |
|---|---|
| AC-PERSIST-01 | db.js (já resolvido d68589f) |
| AC-PERSIST-02 | lib.rs (T2), db.js (T3,T4) |
| AC-DELETE-01 | db.js:512 BrowserStore + db.js:1103 SQLite + app.js:2408 |
| AC-DATE-01 | db.js:836, db.js:1644, db.js:649-652, db.js:1372-1379 |
| AC-BOOT-01 | db.js:981-986 |
| AC-TRACK-01 | app.js:1087-1097 (read-only audit → SPEC_PRECISION_GAP se ambíguo) |

---

## Existing protection

| Proteção | Cobre |
|---|---|
| 89 node:tests | BrowserStore adapter completo |
| 5 Rust tests | transaction rollback, bootstrap lifecycle, schema idempotent |
| Smoke manual 2026-09-03 | WebView→SQLite→UI (NOT covering todos os casos novos) |

---

## Contract / data blast radius

- `DB.subjects.deleteCascade` → renomear para `deleteIfEmpty`; callers atualizados; semântica muda de "deleta tudo" para "rejeita se tem histórico"
- `evidence_date` muda de UTC-prefix para local-date; registros existentes não afetados (migração não necessária, apenas novos registros)
- `settings.review_schedule` corrigido apenas para fresh install; instâncias existentes já têm o valor correto (INSERT OR IGNORE não re-insere)
- `getCompletedToday` muda de `completed_at LIKE` para JOIN/filter em `evidence_date`; semântica muda de "UTC date of completion" para "local date of evidence"

---

## Regression surface

| Risco | Sensor |
|---|---|
| `deleteIfEmpty` rejeita subject vazia → regression em flow de delete | novo node:test A (empty → PASS) |
| `deleteIfEmpty` falha silenciosa em subject com histórico → integridade | novo node:test B (com unit → REJECT) |
| `evidenceDate` local muda registros novos, quebra queries existentes | novo node:test de date boundary |
| `getCompletedToday` com evidência → filtra por evidence_date → PASS | novo node:test |
| schemaStatements fix → `review_schedule` = canônico em fresh install | novo Rust test (T5) |

---

## Sensor plan

Antes de editar cada target, o sensor correspondente deve existir ou ser criado no mesmo commit:

| T | Sensor antes de editar |
|---|---|
| T2 | Rust test duplicaterollback (cria o sensor, não edita código existente) |
| T3 | node:test deleteIfEmpty contract (A, B, C, D) |
| T4 | node:test date boundary (evidenceDate local, getCompletedToday) |
| T5 | Rust test fresh-bootstrap schedule |

---

## Rollback / recovery

Todos os commits são atômicos. Revert de qualquer commit restaura o estado anterior sem orphan data (nenhuma migração de schema irreversível).

---

## Residual unknowns

| Desconhecido | Disposição |
|---|---|
| AC-ACOMP-03: spec table tem 4 estados, AC lista 5 | SPEC_PRECISION_GAP → registrar, HUMAN_GATE se ambíguo |
| DEC-013-V2: code implementado, não aprovado | HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL |
| Tauri UAT automático para delete guard e date | Parcialmente automatizável — Rust test cobre persistence; UI cliques são manuais |
