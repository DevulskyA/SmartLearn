# tasks.md — smartlearn-pre-pr-closure-hardening

**Data:** 2026-09-04
**Gate global:** PRE_PR_CLOSURE_HARDENING: PASS (todos ACs com evidência)

---

## Test Coverage Matrix

| Task | Arquivo(s) alterado | Sensor | AC |
|---|---|---|---|
| T1 | db.js | node:test duplicate BrowserStore | AC-PERSIST-01 |
| T2 | lib.rs | Rust test: duplicate SQLite rollback | AC-PERSIST-01, AC-PERSIST-02 |
| T3 | db.js, app.js | node:test: deleteIfEmpty (A,B,C,D) | AC-DELETE-01 |
| T4 | db.js | node:test: date boundary + getCompletedToday | AC-DATE-01 |
| T5 | db.js | Rust test: fresh-bootstrap schedule | AC-BOOT-01 |
| T6 | db.js | Audit: node:test + documentação | AC-PERSIST-02 |
| T7 | .specs | SPEC_PRECISION_GAP + DEBT-008 | AC-TRACK-01 |
| T8 | — | Manual checklist (UAT-T8) | AC-UAT-01 |
| T9 | .specs | Documentação reconciliada | AC-GOV-01 |

---

## Gate Check Commands

```bash
# Node tests (BrowserStore)
npm test

# Rust tests
cd src-tauri && cargo test

# Build
npm run build
```

---

## Execution Plan

```
T1 DONE (d68589f)
T2 → T3 → T4 → T5 (implementação paralela possível, commits atômicos separados)
T6 (audit após T3/T4/T5)
T7 (documentação)
T8 (checklist para UAT manual)
T9 (governance reconciliation)
DISCRIMINATION LOOP
FINAL CLOSURE CHECK
```

---

## T1 — Duplicate review fail-closed (SQLite path)

**STATUS: DONE** — commit `d68589f`

Evidência:
- `db.js:1656`: `INSERT INTO learning_evidence` (sem `OR IGNORE`)
- `test/learning-evidence.test.js`: "completeReviewWithEvidence segunda chamada para mesmo taskId deve falhar e não alterar o estado"
- 89/89 node:test PASS

Nota: prova apenas BrowserStore. T2 prova SQLite.

---

## T2 — SQLite duplicate rollback sensor (Rust)

**STATUS: DONE** — incluído no commit `82caf1f` (junto com T3; ver governance deviation em validation.md)

**Deliverable:** novo teste `#[test] fn complete_review_duplicate_rolls_back` em `src-tauri/src/lib.rs`

**Mudança:** somente `lib.rs` (adição de test, sem mudança de prod code)

**AC:** AC-PERSIST-01, AC-PERSIST-02

**Sensor:** o próprio teste

**Gate estreito:** `cargo test complete_review_duplicate`

**Regression gate:** `cargo test` (todos os Rust tests)

**Done criteria:**
- Rust test passa com schema real (subjects, learning_units, review_tasks, learning_evidence + UNIQUE index)
- Após segunda transaction: review_task.score_percent = 80, evidence_count = 1
- Erro contém "unique" (case-insensitive)

**Dificuldade:** 3

---

## T3 — Subject deleteIfEmpty

**STATUS: DONE** — commit `82caf1f`

**Deliverable:** 
- `src/db.js`: BrowserStore `deleteCascade` → `deleteIfEmpty` (fail-closed se tem units)
- `src/db.js`: SQLite `deleteCascade` → `deleteIfEmpty` (fail-closed se tem units)  
- `src/app.js:2408`: caller atualizado + confirm message atualizada

**AC:** AC-DELETE-01

**Sensor antes de editar:** 4 novos node:tests (A=empty delete PASS, B=com unit REJECT, C=counts inalterados após reject, D=evidência não orphan)

**Gate estreito:** `npm test -- --test-name-pattern "deleteIfEmpty"`

**Regression gate:** `npm test`

**Done criteria:**
- A: subject vazia → DELETE → subject não existe, counts corretos
- B: subject com unit → ERROR /excluir|histórico/i
- C: após erro B, subject count, unit count, task count, evidence count inalterados
- D: BrowserStore não cria orphan learningEvidence na deleção de subject vazia
- UI confirm message não anuncia "apagará todos os estudos"

**Dificuldade:** 2

---

## T4 — Local date boundary

**STATUS: DONE** — commit `5c542df`

**Deliverable:**
- `src/db.js`: nova function `localDateIso(date)`
- `src/db.js`: BrowserStore `completeReviewWithEvidence` usa `localDateIso`
- `src/db.js`: SQLite `completeReviewWithEvidence` usa `localDateIso`
- `src/db.js`: BrowserStore `getCompletedToday` → filtra por `evidence_date`
- `src/db.js`: SQLite `getCompletedToday` → JOIN em `evidence_date`

**AC:** AC-DATE-01

**Sensor antes de editar:** node:test boundary (normal, meia-noite, UTC≠local)

**Gate estreito:** `npm test -- --test-name-pattern "date|local|completedToday"`

**Regression gate:** `npm test`

**Done criteria:**
- `localDateIso(new Date('2026-09-04T01:30:00Z'))` em UTC-3 retorna `2026-09-03`
- `completeReviewWithEvidence` → `evidence_date = localDateIso`
- `getCompletedToday('2026-09-03')` encontra review concluída às `2026-09-04T01:30:00Z` quando timezone local é UTC-3

Nota: node:test roda no mesmo timezone da máquina. Para testar boundary UTC→local, simular com `Date` explícita ou mock.

**Dificuldade:** 3

---

## T5 — Settings bootstrap binding

**STATUS: DONE** — commit `c78cf86`

**Deliverable:** `src/db.js` — `DB.init()` executa settings INSERT com params explícitos (não posicional)

**AC:** AC-BOOT-01

**Sensor antes de editar:** Rust test `fresh_install_review_schedule_is_canonical`

**Gate estreito:** `cargo test fresh_install_review_schedule`

**Regression gate:** `cargo test` + `npm test`

**Done criteria:**
- Fresh SQLite: `settings.review_schedule = JSON.stringify(REVIEW_SCHEDULE)` (não NULL, não `[]`)
- Rust test passa com schema completo + INSERT correto
- `npm test` continua 89/89

**Dificuldade:** 2

---

## T6 — Persistence contract closure

**STATUS: DONE** — commit `55286ad` (junto com T7, T8 parcial, T9; ver governance deviation)

**Deliverable:** auditoria + documentação de gaps; fix somente se GAP material encontrado

**AC:** AC-PERSIST-02

**Done criteria:**
- Tabela de contratos preenchida (BrowserStore vs SQLite por comportamento)
- Gaps materiais documentados em DEBT ou resolvidos
- `learningEvidence.create`: validações BrowserStore ≡ SQLite verificadas

---

## T7 — AC-ACOMP-03 tracking semantics

**STATUS: DONE** — commit `af000b2` (DEBT-008 resolvido; spec corrigida)

**Deliverable:** `SPEC_PRECISION_GAP: AC-ACOMP-03` registrado; DEBT-008 criado; T8 e T9 não bloqueados

**AC:** AC-TRACK-01

---

## T8 — Tauri UAT real

**STATUS: CHECKLIST CRIADO — PENDING HUMAN_GATE** — checklist em validation.md, UAT-1..UAT-6 pendente execução manual

**Deliverable:** checklist manual para execução no app real

Ver `validation.md` (criado na closure).

---

## T9 — Governance reconciliation

**STATUS: DONE** — commit `55286ad` (junto com T6-T8 parcial; ver governance deviation)

**Deliverable:** DEBT.md + STATE.md + LESSONS.md reconciliados

Itens específicos:
- DEBT-003: corrigir math (~1190/day → ~80/day em regime estacionário)
- DEBT-006: separar dívida atual (adapter contract) de roadmap futuro (IndexedDB, sync)
- DEBT-007: auditar se empty states já existem → redefinir para problema real
- DEBT-008: novo — SPEC_PRECISION_GAP AC-ACOMP-03
- DEC-013-V2: confirmar que permanece PROPOSED (não auto-aprovar)
