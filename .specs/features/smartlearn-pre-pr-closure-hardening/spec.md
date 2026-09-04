# spec.md — smartlearn-pre-pr-closure-hardening

**Feature:** smartlearn-pre-pr-closure-hardening
**Classificação:** Complex / high-risk — persistence + data integrity + destructive operations + ambiguous state semantics
**Data:** 2026-09-04
**Origem:** Audit pré-PR que identificou 10 blockers materiais antes do merge de analytics-vnext.

---

## Contexto

Analytics-vnext foi concluída com smoke manual PASS mas com blockers de integridade de dados intencionalmente diferidos. Esta feature resolve todos os blockers materiais antes de criar o PR.

---

## Acceptance Criteria

### AC-PERSIST-01 — Duplicate review é fail-closed

Primeira conclusão de uma review com 8/10:
- `review_task.score_percent` = 80
- `learning_evidence.score_percent` = 80
- `evidence_count` = 1

Segunda tentativa da MESMA review com 5/10:
- lança erro
- transaction rollback (nenhuma mutação parcial)
- `review_task.score_percent` continua 80
- `learning_evidence.score_percent` continua 80
- `evidence_count` continua 1

Comportamento equivalente em BrowserStore e SQLite.

**Status:** PASS (BrowserStore via node:test — `d68589f`). SQLite BLOCKER: Rust transaction sensor ainda não existe.

---

### AC-PERSIST-02 — Adapter contract

Comportamentos críticos de persistência têm evidência para BrowserStore E SQLite:

| Comportamento | BrowserStore | SQLite |
|---|---|---|
| Review completion | node:test | SQLite Rust test |
| Duplicate protection / rollback | node:test (d68589f) | Rust test (T2) |
| Subject delete guard | node:test | Rust test (T3) |
| Evidence integrity | node:test | evidência smoke |

---

### AC-DELETE-01 — Histórico não pode ser hard-deleted

Uma subject com qualquer `learning_unit` associada:
- não pode ser hard-deleted por nenhuma tela
- não pode ser hard-deleted via DB API direta
- preserva subject, units, exercises, review_tasks, learning_evidence intactos

Uma subject realmente vazia (zero learning_units) pode ser excluída.

Proteção no persistence layer (db.js), não só na UI.
Callers existentes (`app.js`) atualizados; message de confirm atualizada para não anunciar "apagará todos os estudos".

---

### AC-DATE-01 — Dia semântico é local

Timestamp técnico: UTC ISO é aceitável para `completed_at` / `created_at`.

Dia acadêmico/semântico (`evidence_date`):
- deve representar o dia LOCAL do estudante
- não pode avançar para o próximo dia UTC quando o estudante conclui uma revisão entre 21:00 e 23:59 no fuso local

Filtro `getCompletedToday(today)`:
- usa `evidence_date` como fonte semântica (após fix)
- não pode retornar zero para uma revisão concluída no mesmo dia local que o parâmetro `today`

Regra segue o timezone local do dispositivo — sem hardcode de timezone específico.

---

### AC-BOOT-01 — Schedule bootstrap é determinístico

Fresh SQLite:
- `settings.review_schedule` = `JSON.stringify(REVIEW_SCHEDULE)` — o schedule canônico importado de `scheduler.js`
- binding do parâmetro `$1` é explícito, não posicional-dependente do comprimento do array

---

### AC-TRACK-01 — Tracking state é spec-anchored

Os 5 estados (`SEM_EVIDENCIA`, `EM_ESTUDO`, `EM_REVISAO`, `ATRASADO`, `EM_DIA`) têm:
- regras mutuamente interpretáveis
- critérios determinísticos por input
- testes por input observável

Se contradição real for detectada entre estados do código e spec, registrar `SPEC_PRECISION_GAP: AC-ACOMP-03` e continuar tasks independentes.

---

### AC-UAT-01 — Tauri real

Fluxo completo WebView→app.js→DB→invoke→Rust→SQLite→UI→restart provado para uma conclusão de revisão real.

---

### AC-GOV-01 — Sem falso PASS

Nenhum: PASS com gap conhecido; dívida aberta marcada resolvida; decisão PROPOSED tratada como ACCEPTED; documentação contradizendo comportamento real.

---

## Out of scope

- DEC-013-V2 auto-aprovação (HUMAN_GATE)
- FSRS migration (DEBT-003)
- IndexedDB upgrade (DEBT-006 roadmap)
- Onboarding CTA (DEBT-007)
