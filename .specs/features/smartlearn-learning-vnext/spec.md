# SmartLearn Learning vNext — Specification

**Feature:** `smartlearn-learning-vnext`
**Status:** AGUARDANDO HUMAN_GATE: VNEXT_PLAN_APPROVAL
**Data:** 2026-09-02
**Revisão:** v2 (reescrito em formato TLC após auditoria de 2026-09-02)

---

## Problem Statement

SmartLearn registra o que o aluno estudou e quando revisar, mas não armazena O QUE revisar.
Cada sessão de revisão começa do zero — sem contexto, sem exercícios, sem progressão.
Estudantes de medicina com 3+ anos de currículo acumulam >1.000 revisões pendentes por dia
com o schedule fixo atual, tornando o sistema insustentável a longo prazo.

---

## Goals

- [ ] Cada revisão apresenta o Resumo Mestre do conteúdo — escrito uma vez, reutilizado sempre
- [ ] Exercícios de fixação por unidade de estudo aparecem em cada revisão sem administração manual
- [ ] O ciclo completo (ler → exercitar → registrar → concluir) ocorre em uma única sessão
- [ ] O scheduler é encapsulado em módulo isolado para viabilizar FSRS no futuro
- [ ] Nenhum dado existente é perdido em qualquer migração

---

## Out of Scope

Explicitamente excluído para prevenir scope creep.

| Feature | Razão |
| ------- | ----- |
| FSRS real (algoritmo adaptativo) | Sem dados de uso suficientes para validar thresholds; boundary criada em WP-02 |
| Diagnóstico de erro além de percentual | D7 — LATER |
| Relearning direcionado | D8 — LATER |
| Resgate de memória com mnemônicos | D9 — LATER |
| Desmame da ajuda | D10 — LATER |
| Integração com House (outro produto) | D11 — produtos permanecem separados |
| Shared learner model / knowledge graph | Sem evidência de benefício observável |
| daily_summaries como tabela persistente | View efêmera é suficiente |
| master_summaries como tabela separada | study_records.summary_body é suficiente agora |
| Mastery score sofisticado | Sem threshold validado |
| Backend / nuvem / sync | Fase 3+ |
| Rating por revisão (Again/Hard/Good/Easy) | Cold-start aceitável na migração FSRS (ver Suposições) |

---

## Assumptions & Open Questions

Toda ambiguidade foi resolvida ou registrada — nada deixado silenciosamente sem decisão.

| Suposição / decisão | Escolha adotada | Justificativa | Confirmado? |
| ------------------- | --------------- | ------------- | ----------- |
| FSRS: cold-start vs. coletar ratings agora | Cold-start aceitável | Anki faz o mesmo; custo de coletar ratings > benefício incerto | n — confirmar no HUMAN_GATE |
| D3 "exercícios obrigatórios" | Recomendação pedagógica, não restrição do sistema | AC-14 e INV-06 exigem flexibilidade; sistema não bloqueia revisão sem exercícios | y |
| summary_body: limite de caracteres | Sem limite (diferente de content com 240) | Resumo Mestre é documento; content é rótulo curto | y |
| exercises.position: reordenação | Campo presente (DEFAULT 0), UI de reordenação LATER | Reordenar é útil mas não urgente; campo evita migration futura | n — confirmar no HUMAN_GATE |
| BrowserStore: atualização por WP | Cada WP que adiciona schema atualiza createBrowserStore() | Dev mode usa browserStore; divergência causaria falha silenciosa em testes | y |
| Scale at year 3+ (1000+ reviews/day) | Risco documentado; FSRS é a solução, não é esta execução | FSRS boundary criada em WP-02; implementação FSRS LATER | y |
| Resumo Diário: efêmero vs. persistente | Efêmero (view sobre dados existentes) | Dados já existem em study_records; tabela adiciona complexidade sem benefício | y |
| Legacy study records sem summary_body | Sistema opera com null; sem backfill automático | INV-24, backward-compatibility | y |
| Interface do scheduler para FSRS | generateInitialTasks(date) é insuficiente para FSRS | FSRS requer repeat(card_state, rating, now); WP-02 cria encapsulamento mas NÃO interface FSRS | y |

**Open questions:** todas resolvidas ou registradas acima.

---

## User Stories

### P1: Resumo Mestre — Persistência ⭐ MVP

**User Story**: As a medical student, I want to write a Master Summary when I register a study session so that it persists and auto-appears in every future review of that topic.

**Why P1**: Sem conteúdo persistente, o ciclo de revisão não tem o que apresentar. É o alicerce de toda a feature.

**Acceptance Criteria**:

1. WHEN the student submits a new study registration, the system SHALL save `summary_body` (nullable) alongside the study record — null if not provided.
2. WHEN the student opens the edit panel for an existing study record, the system SHALL display the current `summary_body` in an editable field with no character limit enforced by the system (unlike `content` which is 240 chars).
3. WHEN the student saves changes to `summary_body`, the system SHALL persist the update to the existing study record without creating a new review cycle.
4. WHEN a study record has `summary_body = null`, the system SHALL load the Today screen, the study list, and any review task for that record without error or exception.
5. WHEN a study record has `summary_body = ''` (empty string), the system SHALL treat it identically to null (no display, fallback to `content`).
6. WHEN a JSON backup is exported, the system SHALL include `summary_body` for each study record.
7. WHEN a JSON backup is imported that lacks `summary_body` on a record, the system SHALL treat that field as `null` and import successfully without error.

**Independent Test**: Register a study → add summary → close and reopen app → verify summary persists. Import legacy backup (no summary_body) → verify loads with no error.

---

### P1: Resumo Mestre — Exibição na Revisão ⭐ MVP

**User Story**: As a medical student, I want to read my Master Summary at the start of each review session so that my memory is primed before I answer exercises.

**Why P1**: D2 é explícito: a revisão apresenta o Resumo Mestre completo. Sem isso, o vNext não difere do estado atual.

**Acceptance Criteria**:

1. WHEN the student opens a review task, the system SHALL display `summary_body` at the top of the review panel, fully visible without truncation or pagination.
2. WHEN the student opens a review task for a record with `summary_body = null` or empty, the system SHALL display `content` as fallback — never a blank panel.
3. WHEN the student is in a review panel, the system SHALL NOT present `summary_body` as a checklist, numbered list, or set of sub-tasks visible to the student.
4. WHEN the student activates inline edit for `summary_body` inside a review panel, the system SHALL show an editable textarea without navigating away from the review screen.
5. WHEN the student saves an inline edit of `summary_body` from within the review panel, the system SHALL persist the change and return to the review view — the review task itself is unaffected.

**Independent Test**: Review a record with summary_body set — verify full text appears at top. Edit summary inline — verify change persists after reload. Review a legacy record (null summary_body) — verify content label appears instead.

---

### P2: Exercícios — Entidades Persistentes

**User Story**: As a student, I want to create Q&A exercises for each study unit so that they appear during every review of that unit as structured practice.

**Why P2**: Requer P1 (summary display) para ter contexto. Sem ciclo integrado (P2 seguinte), exercícios ficam visíveis mas não integrados ao fluxo.

**Acceptance Criteria**:

1. WHEN the student creates an exercise, the system SHALL accept `question_text` (required), `answer_text` (required), and `hint_text` (optional).
2. WHEN `question_text` is empty or blank, the system SHALL reject the exercise with an inline validation message — the exercise is not saved.
3. WHEN an exercise is saved, the system SHALL associate it with the study record (not with any specific review task).
4. WHEN the student edits an exercise's fields, the system SHALL update that exercise without affecting the associated study record or any review task.
5. WHEN the student deletes an exercise, the system SHALL remove only that exercise — the study record, its `summary_body`, and all associated review tasks remain intact.
6. WHEN a study record is deleted, the system SHALL delete all its associated exercises via CASCADE (no orphan exercises).
7. WHEN a JSON backup is exported, the system SHALL include the complete `exercises` array.
8. WHEN a JSON backup without an `exercises` field is imported, the system SHALL treat `exercises` as `[]` and import without error.
9. WHEN a study record has no exercises, the system SHALL display no exercise section in the review — not an error or empty placeholder.

**Independent Test**: Create 2 exercises for a study unit. Delete one. Verify the other persists and the study record is unchanged. Export + reimport — verify exercises restore correctly. Verify that deleting the study record removes both exercises (no orphans).

---

### P2: Ciclo de Revisão Integrado

**User Story**: As a student, WHEN I do a review session, I want to read the summary, answer exercises, and record my result in a single flow so that the review is complete and self-contained.

**Why P2**: Integra P1 (summary display) com exercícios. É o ciclo completo que entrega valor ao aluno.

**Acceptance Criteria**:

1. WHEN the student opens a review task, the system SHALL present the following sections in order: [1] Master Summary (or fallback), [2] Exercises (if any exist), [3] Score recording fields, [4] "Mark as done" button.
2. WHEN the student completes the review, the system SHALL record `completed_at`, `review_done = true`, `questions_count`, `correct_count`, and `score_percent` on the review task.
3. WHEN `correct_count > questions_count`, the system SHALL reject the completion with an inline validation error — the review task is NOT marked done.
4. WHEN the student has no exercises defined for a study unit, the system SHALL allow review completion using only the score fields — exercises section is absent, not an error.
5. WHEN the student reviews a legacy study record (no `summary_body`, no exercises), the system SHALL behave identically to the pre-vNext behavior — no regressions.
6. WHEN a review task is completed with no score entered (null questions_count), the system SHALL accept completion — score is optional.

**Independent Test**: Complete reviews with: (a) summary + exercises + score; (b) summary only; (c) no summary, no exercises (legacy path). All three must mark the review as done and persist correctly.

---

### P2: Resumo Diário pré-sono

**User Story**: As a student who just finished a day of studying, I want to see a consolidated summary of everything I studied today so that I can do a final reading before sleep.

**Why P2**: Depende de P1 (summary_body). Independente de exercícios. Entrega valor de revisão rápida sem custo de implementação alto.

**Acceptance Criteria**:

1. WHEN the Today screen loads and at least one study record has `study_date = today`, the system SHALL display a "Resumo do Dia" button.
2. WHEN the student taps "Resumo do Dia", the system SHALL display a consolidated view of all `summary_body` values (with `content` as fallback where null) for study records whose `study_date = today`.
3. WHEN the student closes the daily summary view, the system SHALL NOT create review tasks, update existing review tasks, or modify study records.
4. WHEN there are no study records with `study_date = today`, the system SHALL NOT show the "Resumo do Dia" button.
5. WHEN the daily summary is displayed, the system SHALL NOT include exercise lists — summary text only.
6. WHEN all today's study records have `summary_body = null`, the system SHALL display their `content` labels as fallback — the view is still shown.

**Independent Test**: Register 2 studies today with summaries. Open Resumo do Dia — both summaries appear. Close it — count of review_tasks is unchanged. Repeat with no studies today — button is absent.

---

### P3: Scheduler Boundary (infraestrutura)

**User Story**: As a developer maintaining this codebase, I want the schedule generation logic to live in a single isolated module so that the dual-definition bug is eliminated and future algorithm replacement (e.g. FSRS) requires minimal callers to change.

**Why P3**: Sem comportamento visível para o aluno. Elimina drift risk entre db.js e review-schedule.js. Cria a costura arquitetural para FSRS — mas NÃO implementa a interface FSRS (ver Suposições).

**Acceptance Criteria**:

1. WHEN a new study record is created, the system SHALL generate review tasks by calling `scheduler.generateInitialTasks(studyDate)` — not by importing `REVIEW_DAY_OFFSETS` or `generateReviewDates` directly from `review-schedule.js`.
2. WHEN `scheduler.generateInitialTasks(studyDate)` is called with a valid date, the system SHALL produce the same 16 due dates as the current implementation in `review-schedule.js`.
3. WHEN `scheduler.generateInitialTasks` is called with an invalid date, the system SHALL throw an error with a descriptive message (same behavior as current `generateReviewDates`).
4. WHEN a new review task is created, the system SHALL record `algorithm = 'legacy'` on the task row.
5. WHEN existing review tasks without an `algorithm` column are migrated, the system SHALL assign `DEFAULT 'legacy'` via the column default — no explicit UPDATE needed.
6. WHEN an unknown algorithm name is passed to `scheduler.js`, the system SHALL throw an explicit error — not silently produce incorrect output.
7. WHEN `src/db.js` and `src/review-schedule.js` are inspected, exactly ONE authoritative definition of the 16-interval schedule SHALL exist in the codebase.

**Nota arquitetural crítica**: Esta boundary encapsula o algoritmo legacy. Ela NÃO é compatível com FSRS como drop-in. FSRS requer `repeat(card: Card, now: Date) → RecordLogItem` com estado completo do item (stability, difficulty, state, elapsed_days) e um rating escolhido (1-4). A migração para FSRS requer uma interface fundamentalmente diferente e trabalho de produto separado (cold-start ou coleta de ratings).

**Independent Test**: `npm test` passes producing same 16 dates. Source audit confirms single interval definition.

---

## Edge Cases

- WHEN `generateInitialTasks` receives a date string that is not ISO-8601, the system SHALL throw — not silently use epoch or today.
- WHEN a backup import contains `exercises` with `question_text = null`, the system SHALL skip those entries with a warning — not crash.
- WHEN a study record's `summary_body` is updated to null explicitly, the system SHALL persist null (not empty string).
- WHEN the Today screen loads with >500 study records due today, the system SHALL still render without timeout or memory crash (SQLite query, not in-memory sort).
- WHEN exercises are ordered by `position`, ties SHALL be broken deterministically (by `id` ascending).

---

## Requirement Traceability

| Requirement ID | Story | Priority | Status |
| -------------- | ----- | -------- | ------ |
| LVN-01 | P1 Resumo Mestre: AC1–AC5 (persistência, nullability) | P1 | Pending |
| LVN-02 | P1 Resumo Mestre: AC6–AC7 (backup) | P1 | Pending |
| LVN-03 | P1 Revisão: AC1–AC3 (exibição completa, fallback, não-fragmentação) | P1 | Pending |
| LVN-04 | P1 Revisão: AC4–AC5 (edição inline) | P1 | Pending |
| LVN-05 | P2 Exercícios: AC1–AC3 (CRUD, associação ao study_record) | P2 | Pending |
| LVN-06 | P2 Exercícios: AC4–AC6 (edição, deleção isolada, CASCADE) | P2 | Pending |
| LVN-07 | P2 Exercícios: AC7–AC9 (backup, revisão sem exercícios) | P2 | Pending |
| LVN-08 | P2 Ciclo: AC1–AC2 (fluxo completo, persistência) | P2 | Pending |
| LVN-09 | P2 Ciclo: AC3–AC6 (validações, legado sem exercícios) | P2 | Pending |
| LVN-10 | P2 Resumo Diário: AC1–AC2 (botão e conteúdo) | P2 | Pending |
| LVN-11 | P2 Resumo Diário: AC3–AC6 (sem side effects, ausência de botão) | P2 | Pending |
| LVN-12 | P3 Scheduler: AC1–AC3 (encapsulamento, paridade, erro em data inválida) | P3 | Pending |
| LVN-13 | P3 Scheduler: AC4–AC5 (campo algorithm em review_tasks) | P3 | Pending |
| LVN-14 | P3 Scheduler: AC6–AC7 (erro em algoritmo desconhecido, fonte única) | P3 | Pending |

**Coverage:** 14 requirements, 0 mapeados a tasks (pending HUMAN_GATE approval), 0 verificados.

---

## Success Criteria

- [ ] Um aluno pode registrar um estudo, escrever o Resumo Mestre, e vê-lo na próxima revisão sem nenhum passo adicional
- [ ] Uma revisão com Resumo Mestre + exercícios + score pode ser concluída sem sair da tela
- [ ] O Resumo do Dia exibe os estudos de hoje em leitura única sem criar revisões
- [ ] `npm test` passa com ≥ 10 testes após WP-01
- [ ] Backup legado (sem summary_body, sem exercises) importa sem erro após WP-03 e WP-05
- [ ] `REVIEW_SCHEDULE` tem exatamente uma definição no codebase após WP-02
- [ ] Nenhuma coluna existente foi removida ou renomeada em nenhuma migração

---

## Riscos e Mitigações

| Risco | Severidade | Probabilidade | Mitigação |
| ----- | ---------- | ------------- | --------- |
| Scale: 1000+ revisões/dia no ano 3 de Medicina (schedule fixo) | CRÍTICO | CERTA (math) | FSRS LATER; WP-02 cria boundary para plugar FSRS |
| WP-06 regride revisões legadas (maior mudança em app.js) | ALTO | MÉDIA | Discrimination sensor obrigatório; WP-06 é o último WP |
| BrowserStore diverge do SQLite após cada WP | MÉDIO | ALTA sem disciplina | Checklist: todo WP que muda schema DEVE atualizar browserStore |
| Interface scheduler incompatível com FSRS | MÉDIO | CERTA | Documentada (ver nota arquitetural em P3); FSRS requer trabalho separado |
| Backup import quebra com exercícios inesperados | BAIXO | BAIXA | `data.exercises ?? []` default; testes de roundtrip no WP-05 |
