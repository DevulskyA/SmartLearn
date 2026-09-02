# SmartLearn Learning vNext — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Status:** AGUARDANDO HUMAN_GATE: VNEXT_PLAN_APPROVAL
**Design:** `.specs/features/smartlearn-learning-vnext/design.md`

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute.
> Guidelines found: `package.json` (scripts only, no coverage thresholds). No AGENTS.md, CONTRIBUTING.md, or test config with quality requirements. **Strong defaults applied.**

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure functions (review-score.js, stats.js, review-schedule.js, scheduler.js) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `test/*.test.js` | `npm test` |
| BrowserStore (createBrowserStore in db.js) | unit (with localStorage polyfill) | Core CRUD for each new field/table added per WP; null-safety paths; backup roundtrip | `test/*.test.js` | `npm test` |
| DB layer — SQLite path (db.js, Tauri runtime) | none | Tauri runtime unavailable in Node.js test env; covered by discrimination sensors + manual verification | — | manual |
| UI (app.js, index.html) | none | No DOM environment available (no jsdom/happy-dom added); covered by manual WP gates | — | manual |
| Schema (ensureColumns, CREATE TABLE) | none | Idempotence verified manually on fresh DB; no test runner can run SQLite without Tauri | — | manual |

**Coverage note on BrowserStore:** `createBrowserStore()` uses `localStorage`. To test in Node.js:
add a per-test in-memory polyfill (`global.localStorage = new Map()-backed shim`) in the test file.
This is feasible without adding new test frameworks.

---

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| unit (node:test, pure functions) | Yes | Stateless calls, no shared state | `test/review-score.test.js` — no setup/teardown |
| unit (BrowserStore with localStorage polyfill) | No | Shared `global.localStorage` unless each test resets it | New tests must reset `global.localStorage` before each test case |

> `npm test` does NOT pass `--parallel` — tests run sequentially by default.
> No parallel-safety issue in practice; still document for future reference.

---

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After any task with unit tests | `npm test` |
| Manual — App | After any UI or schema task | Run `npm run tauri dev` (desktop) or `npm run dev` (browser), verify the affected flow manually |
| Full | After each WP completion | `npm test` + Manual — App + export/import backup roundtrip verification |

---

## Separação temporal

### NOW (esta execução, após HUMAN_GATE)
- WP-01: Cobertura de testes (funções puras)
- WP-02: Scheduler boundary (infraestrutura — elevado antes da UI)
- WP-03: Resumo Mestre como documento
- WP-04: Resumo Diário pré-sono
- WP-05: Exercícios como entidades
- WP-06: Ciclo de revisão integrado

### NEXT (apenas após WP-01..06 validados em uso real)
- WP-07: FSRS real (requer nova interface de scheduler + coleta de ratings + dados de uso)

### LATER (útil, sem evidência suficiente)
- WP-08: Diagnóstico de erro além de percentual
- WP-09: Relearning direcionado
- WP-10: Resgate de memória com mnemônicos

### NOT NOW
- Knowledge graph, ontologia médica, mastery score, motor adaptativo, integração House, backend/nuvem

---

## Execution Plan

```
Phase 1: WP-01 Tests (sequential, foundation)
  T1 → T2 → T3

Phase 2: WP-02 Scheduler Boundary (sequential)
  T4 → T5 → T6
  (T6 depends on T4+T5 for tests)

Phase 3: WP-03 Resumo Mestre (sequential)
  T7 → T8 → T9 → T10 → T11

Phase 4: WP-04 Resumo Diário (sequential)
  T12 → T13
  (unblocked by Phase 3 completion)

Phase 5: WP-05 Exercícios (sequential)
  T14 → T15 → T16 → T17

Phase 6: WP-06 Ciclo Integrado (sequential, highest risk)
  T18 → T19
  (requires Phase 3 + Phase 5 complete)
```

> 6 phases → per TLC sub-agents.md, executor DEVE oferecer one sub-agent per phase e aguardar confirmação antes de dispatchar. Não auto-spawnar.

---

## Task Breakdown

---

### Phase 1 — WP-01: Cobertura de testes

**Contexto:** BUG-005 (autosave rollback) já está CORRIGIDO no código atual. WP-01 adiciona apenas testes de cobertura para funções puras. Testes DOM para autosave rollback são inviáveis sem jsdom — verificação é manual (discrimination sensor).

---

### T1: Testes edge-case de review-score.js

**What**: Adicionar testes de edge case para `getReviewScoreValues` e `getReviewScoreValidationMessage`
**Where**: `test/review-score.test.js` (modify)
**Depends on**: None
**Reuses**: Padrão existente de `node:test` + `assert/strict`
**Requirement**: LVN-09 (validação de score no ciclo integrado)

**Done when**:
- [ ] Testar: `getReviewScoreValues(null, null)` → nulls sem crash
- [ ] Testar: `getReviewScoreValues("0", "0")` → questionsCount=0, scorePercent=null
- [ ] Testar: `getReviewScoreValues("", "")` → nulls (empty string = null)
- [ ] Testar: `getReviewScoreValues("5", "0")` → scorePercent=0, isOverflow=false
- [ ] Gate: `npm test` → 0 fail, ≥ 10 total

**Tests**: unit
**Gate**: quick (`npm test`)
**Commit**: `test(review-score): edge cases para inputs nulos e zero`

---

### T2: Testes edge-case de stats.js

**What**: Adicionar testes de edge case para `Stats.calculate`
**Where**: `test/stats.test.js` (modify)
**Depends on**: None
**Reuses**: Padrão existente de `node:test`
**Requirement**: LVN-08 (ciclo completo)

**Done when**:
- [ ] Testar: subjects vazio → Stats.calculate retorna estrutura válida sem divisão por zero
- [ ] Testar: todas as revisões com `review_done = true` → nenhuma contada como pendente hoje
- [ ] Gate: `npm test` → 0 fail

**Tests**: unit
**Gate**: quick (`npm test`)
**Commit**: `test(stats): edge cases para subjects vazios e revisões concluídas`

---

### T3: Testes de verificação de intervalos em review-schedule.js

**What**: Adicionar verificação precisa dos 16 intervalos (primeiro e último offset, não só contagem)
**Where**: `test/review-schedule.test.js` (modify)
**Depends on**: None
**Reuses**: Padrão existente
**Requirement**: LVN-12 (scheduler parity)

**Done when**:
- [ ] Testar: primeira data gerada = studyDate + 1 dia
- [ ] Testar: última data gerada = studyDate + 390 dias
- [ ] Testar: todas as 16 datas são strings ISO-8601 válidas
- [ ] Gate: `npm test` → 0 fail, ≥ 10 testes total

**Tests**: unit
**Gate**: quick (`npm test`)
**Commit**: `test(review-schedule): verificação precisa dos 16 intervalos`

---

### Phase 2 — WP-02: Scheduler Boundary

**Objetivo:** Eliminar a duplicação de REVIEW_SCHEDULE entre db.js (linha 6-8) e review-schedule.js (linha 1-3). Criar src/scheduler.js como fonte única. Adicionar campo `algorithm` em review_tasks.

---

### T4: Criar src/scheduler.js

**What**: Criar módulo `src/scheduler.js` com `generateInitialTasks(studyDate, algorithm)` e `ALGORITHMS` constante
**Where**: `src/scheduler.js` (novo arquivo)
**Depends on**: T1, T2, T3 (WP-01 completo)
**Reuses**: Lógica existente de `review-schedule.js`
**Requirement**: LVN-12, LVN-14

**Done when**:
- [ ] `ALGORITHMS.LEGACY = 'legacy'` exportado e frozen
- [ ] `generateInitialTasks(studyDate, 'legacy')` retorna `[{ reviewNumber, dueDate }]` com 16 itens
- [ ] Data inválida → lança Error com mensagem descritiva
- [ ] Algoritmo desconhecido → lança Error explícito (não produz output silencioso)
- [ ] Implementação interna importa de `./review-schedule.js`

**Tests**: unit (incluir no T6)
**Gate**: quick (após T6)
**Commit**: junto com T5 e T6 → ver T6

---

### T5: Atualizar db.js — usar scheduler.js; adicionar coluna algorithm

**What**: (a) Remover `REVIEW_SCHEDULE` de `db.js`; fazer db.js importar de `scheduler.js`. (b) Adicionar `algorithm TEXT NOT NULL DEFAULT 'legacy'` via `ensureColumns()` em `review_tasks`.
**Where**: `src/db.js` (modify)
**Depends on**: T4
**Reuses**: Padrão `ensureColumns()` existente
**Requirement**: LVN-13, LVN-17

**Done when**:
- [ ] `const REVIEW_SCHEDULE = [...]` REMOVIDO de db.js
- [ ] `createWithReviews` chama `scheduler.generateInitialTasks(studyDate)` em vez de usar array local
- [ ] `ensureColumns()` adiciona `algorithm TEXT NOT NULL DEFAULT 'legacy'` a `review_tasks`
- [ ] Nova review_task tem `algorithm = 'legacy'` no INSERT
- [ ] BrowserStore: `createReviewTask` mock inclui `algorithm: 'legacy'`

**Tests**: unit (incluir no T6)
**Gate**: quick (após T6)
**Commit**: junto com T4 e T6 → ver T6

---

### T6: Testes de paridade scheduler.js + gate WP-02

**What**: Testes que verificam paridade entre `scheduler.js` e `generateReviewDates` de `review-schedule.js`; verificar que apenas uma definição do array de 16 intervalos existe no codebase
**Where**: `test/scheduler.test.js` (novo)
**Depends on**: T4, T5
**Reuses**: Padrão `node:test`
**Requirement**: LVN-12, LVN-14, LVN-17

**Done when**:
- [ ] `scheduler.generateInitialTasks(date, 'legacy')` → mesmas datas que `generateReviewDates(date)`
- [ ] Algoritmo desconhecido → Error lançado (não output silencioso)
- [ ] Grep de `REVIEW_SCHEDULE\|REVIEW_DAY_OFFSETS` no source (exceto scheduler/review-schedule.js) retorna 0 resultados
- [ ] Gate: `npm test` → 0 fail

**Tests**: unit
**Gate**: quick (`npm test`)
**Commit**: `refactor(scheduler): boundary substituível com algoritmo legacy`
*(commit único cobre T4, T5, T6)*

---

### Phase 3 — WP-03: Resumo Mestre

**Objetivo:** Cada study_record pode ter um Resumo Mestre (summary_body). Visível no cadastro e na revisão. Editável inline. Incluído no backup.

**Checklist BrowserStore para este WP:** `studyRecords` mock deve aceitar e retornar `summaryBody`.

---

### T7: Adicionar summary_body ao schema e ao DB.studyRecords

**What**: `ensureColumns()` adiciona `summary_body TEXT` a `study_records`. Atualizar `DB.studyRecords.update(id, fields)` para aceitar `summaryBody`. Atualizar mapper `mapStudyRecord`. Atualizar browserStore.
**Where**: `src/db.js` (modify)
**Depends on**: T1, T2, T3 (WP-01 gate)
**Reuses**: Padrão `ensureColumns()` existente; mapper existente
**Requirement**: LVN-01

**Done when**:
- [ ] `ensureColumns()` inclui `{ table: 'study_records', column: 'summary_body', definition: 'TEXT' }`
- [ ] `mapStudyRecord` inclui `summaryBody: row.summary_body ?? null`
- [ ] `DB.studyRecords.update(id, { summaryBody })` persiste e retorna campo correto
- [ ] BrowserStore: `studyRecords` mock tem campo `summaryBody` em create/update/getAll
- [ ] `DB.studyRecords.getAll()` retorna `summaryBody` em cada item

**Tests**: unit (incluir em T11)
**Gate**: quick (após T11)
**Commit**: junto com T8-T11

---

### T8: Atualizar exportAll/importAll para summary_body

**What**: `exportAll()` inclui `summary_body` em cada studyRecord; `importAll()` aceita `row.summaryBody ?? row.summary_body ?? null`
**Where**: `src/db.js` (modify)
**Depends on**: T7
**Reuses**: Estrutura existente de exportAll/importAll
**Requirement**: LVN-02

**Done when**:
- [ ] `exportAll()` → studyRecords com campo `summaryBody`
- [ ] `importAll()` com backup antigo (sem `summaryBody`) → importa com `null`, sem erro
- [ ] `settings.app_version` atualiza para `'2.0.0'` no importAll (marca primeira evolução de schema)

**Tests**: unit (incluir em T11)
**Gate**: quick (após T11)
**Commit**: junto com T7, T9-T11

---

### T9: UI — Campo summary_body no formulário de cadastro

**What**: Adicionar `<textarea id="study-summary">` ao formulário de estudo; app.js lê e salva `summaryBody` ao criar study_record
**Where**: `index.html` (modify), `src/app.js` (modify)
**Depends on**: T7
**Reuses**: Padrão de form handler existente em studyForm submit
**Requirement**: LVN-01 (AC1, AC2)

**Done when**:
- [ ] Textarea presente no formulário com `id="study-summary"`, sem `maxlength`
- [ ] Submit do form inclui `summaryBody: textarea.value.trim() || null`
- [ ] Campo limpo após submit bem-sucedido
- [ ] Campo `summaryBody` passado para `DB.studyRecords.create()` ou `createWithReviews()`

**Tests**: none (UI — manual gate)
**Gate**: manual — App
**Commit**: junto com T7, T8, T10, T11

---

### T10: UI — Exibição e edição inline de summary_body na revisão

**What**: Na ReviewRow (tela Hoje), exibir `summary_body` (ou fallback para `content`) como seção visual acima dos controles existentes; botão "Editar Resumo" → textarea inline → salva via `DB.studyRecords.update`
**Where**: `src/app.js` (modify — `createReviewRow`), `index.html` (modify)
**Depends on**: T7
**Reuses**: `createReviewRow()` existente; padrão de autosave handler
**Requirement**: LVN-03, LVN-04

**Done when**:
- [ ] `createReviewRow()` renderiza seção "Resumo Mestre" com `summary_body ?? content`
- [ ] Seção exibe texto completo sem truncagem
- [ ] Botão "Editar Resumo" → textarea editable, botão Salvar
- [ ] Save chama `DB.studyRecords.update(id, { summaryBody })` e atualiza a exibição
- [ ] `summary_body = null` → exibe `content` sem erro, sem seção vazia
- [ ] Revisão legada (sem summary_body) funciona exatamente como antes (discrimination sensor)

**Tests**: none (UI — manual gate)
**Gate**: manual — App
**Commit**: junto com T7, T8, T9, T11

---

### T11: Testes de summary_body + gate WP-03

**What**: Testes para summary_body: DB roundtrip via browserStore, backup roundtrip, null-safety
**Where**: `test/study-records.test.js` (novo)
**Depends on**: T7, T8, T9, T10
**Requirement**: LVN-01, LVN-02, LVN-03

**Done when**:
- [ ] BrowserStore: `studyRecords.update(id, { summaryBody: 'texto' })` persiste e é retornado
- [ ] BrowserStore: `studyRecords.update(id, { summaryBody: null })` persiste null
- [ ] exportAll → importAll roundtrip com summaryBody preserva valor
- [ ] importAll com backup sem `summaryBody` → item tem `summaryBody = null`
- [ ] Gate: `npm test` → 0 fail

**Tests**: unit
**Gate**: full (`npm test` + manual)
**Commit**: `feat(resumo-mestre): summary_body — schema, UI de cadastro e exibição na revisão`
*(commit único cobre T7, T8, T9, T10, T11)*

---

### Phase 4 — WP-04: Resumo Diário

**Objetivo:** Botão "Resumo do Dia" na Tela Hoje. Painel efêmero com summary_body dos estudos de hoje. Sem novos review_tasks.

---

### T12: Adicionar DB.studyRecords.getByDate() — db.js + browserStore

**What**: Novo método `DB.studyRecords.getByDate(dateStr)` retorna study_records com `study_date = dateStr`, incluindo `summaryBody`
**Where**: `src/db.js` (modify)
**Depends on**: T11 (WP-03 completo)
**Reuses**: Padrão de query existente em `DB.studyRecords`
**Requirement**: LVN-10

**Done when**:
- [ ] `DB.studyRecords.getByDate('2026-09-02')` retorna array com `summaryBody` incluído
- [ ] Retorno vazio para data sem estudos
- [ ] BrowserStore: implementação compatível (filtrar por `studyDate === dateStr`)

**Tests**: unit (incluir em T13)
**Gate**: quick (após T13)
**Commit**: junto com T13

---

### T13: UI — Botão e painel Resumo do Dia + testes + gate WP-04

**What**: Botão "Resumo do Dia" condicional na Tela Hoje; painel modal/expandido com lista de `summary_body ?? content` dos estudos do dia; fechar sem side effects. Testes unitários de getByDate.
**Where**: `src/app.js` (modify), `index.html` (modify), `test/study-records.test.js` (modify)
**Depends on**: T12
**Requirement**: LVN-10, LVN-11

**Done when**:
- [ ] Botão "Resumo do Dia" aparece apenas quando há estudos com `study_date = today`
- [ ] Painel exibe `summary_body ?? content` de cada estudo do dia
- [ ] Painel não exibe exercícios
- [ ] Fechar painel: count de review_tasks não muda (discrimination sensor)
- [ ] Teste: `getByDate` com 2 estudos hoje → retorna 2 itens
- [ ] Teste: `getByDate` com data sem estudos → retorna []
- [ ] Gate: `npm test` → 0 fail + manual gate

**Tests**: unit (getByDate) + none (UI — manual)
**Gate**: full
**Commit**: `feat(resumo-diario): leitura pré-sono sem cadeia longitudinal`
*(commit único cobre T12 + T13)*

---

### Phase 5 — WP-05: Exercícios como entidades

**Objetivo:** Tabela exercises. CRUD via DB.exercises. UI de gerenciamento por study_record. Backup inclui exercises.

**Checklist BrowserStore para este WP:** adicionar `exercises` mock completo em `createBrowserStore()`.

---

### T14: Criar tabela exercises + DB.exercises CRUD em db.js

**What**: `CREATE TABLE IF NOT EXISTS exercises` (via `DB.init`); mapExercise; `DB.exercises.create/getAll/update/delete`
**Where**: `src/db.js` (modify)
**Depends on**: T11 (WP-03 completo)
**Reuses**: Padrão de mapper existente (mapStudyRecord, mapReviewTask)
**Requirement**: LVN-05, LVN-06

**Done when**:
- [ ] Tabela criada com schema do design.md (ON DELETE CASCADE, INDEX)
- [ ] `DB.exercises.create(studyRecordId, { questionText, answerText, hintText, position })` → persiste
- [ ] `DB.exercises.getAll(studyRecordId)` → ordenado por `position ASC, id ASC`
- [ ] `DB.exercises.update(id, fields)` → atualiza campos passados (partial update ok)
- [ ] `DB.exercises.delete(id)` → remove apenas esse exercício; study_record intacto
- [ ] `questionText` vazio → erro lançado no nível DB (invariante antes de SQL)
- [ ] BrowserStore: `exercises` mock com as 4 operações, isolado por `studyRecordId`

**Tests**: unit (incluir em T17)
**Gate**: quick (após T17)
**Commit**: junto com T15-T17

---

### T15: Atualizar exportAll/importAll para exercises

**What**: `exportAll()` inclui array `exercises`; `importAll()` aceita `data.exercises ?? []`
**Where**: `src/db.js` (modify)
**Depends on**: T14
**Requirement**: LVN-07

**Done when**:
- [ ] `exportAll()` retorna `{ ..., exercises: [...] }`
- [ ] `importAll()` com backup sem `exercises` → importa com `[]`, sem erro
- [ ] `importAll()` com exercises → restaura com `study_record_id` correto (remapeia IDs se necessário)

**Tests**: unit (incluir em T17)
**Gate**: quick (após T17)
**Commit**: junto com T14, T16, T17

---

### T16: UI — Gerenciamento de exercícios por Resumo Mestre

**What**: Seção "Exercícios" no painel de study_record (lista, formulário de criação, botões editar/remover)
**Where**: `src/app.js` (modify), `index.html` (modify)
**Depends on**: T14
**Requirement**: LVN-05, LVN-07 (AC9 — sem exercícios não quebra revisão)

**Done when**:
- [ ] Seção "Exercícios" visível ao abrir/editar um study_record existente
- [ ] Formulário: `question_text` (required), `answer_text` (required), `hint_text` (optional)
- [ ] `question_text` vazio → mensagem de validação inline, sem submissão
- [ ] Salvar exercício → aparece na lista imediatamente
- [ ] Editar exercício → campos carregam os valores existentes, save persiste
- [ ] Remover exercício → lista atualiza; study_record e review_tasks intactos (discrimination sensor)

**Tests**: none (UI — manual gate)
**Gate**: manual — App
**Commit**: junto com T14, T15, T17

---

### T17: Testes de DB.exercises + gate WP-05

**What**: Testes via browserStore para CRUD, CASCADE, backup roundtrip
**Where**: `test/exercises.test.js` (novo)
**Depends on**: T14, T15, T16
**Requirement**: LVN-05, LVN-06, LVN-07

**Done when**:
- [ ] `DB.exercises.create()` persiste e `getAll()` retorna o item
- [ ] `DB.exercises.getAll(studyRecordId)` retorna apenas exercises do estudo especificado
- [ ] `DB.exercises.delete(id)` remove apenas o exercise; getAll do mesmo studyRecord tem n-1 items
- [ ] DELETE CASCADE: deletar study_record → exercises do mesmo studyRecord não retornam em getAll
- [ ] exportAll → importAll roundtrip preserva exercises com campos corretos
- [ ] importAll sem `exercises` → 0 exercises importados, sem erro
- [ ] Gate: `npm test` → 0 fail + manual gate

**Tests**: unit
**Gate**: full
**Commit**: `feat(exercises): tabela e CRUD de exercícios por Resumo Mestre`
*(commit único cobre T14, T15, T16, T17)*

---

### Phase 6 — WP-06: Ciclo de Revisão Integrado

**Objetivo:** A ReviewRow (Tela Hoje) apresenta: [1] Resumo Mestre → [2] Exercícios → [3] Score → [4] Marcar como feita. Revisões legadas (sem resumo, sem exercícios) continuam funcionando.

**RISCO MAIS ALTO do plano.** Reescreve o handler principal da Tela Hoje. Discrimination sensor obrigatório antes do commit.

---

### T18: Atualizar createReviewRow() para o fluxo integrado

**What**: Reescrever `createReviewRow()` em app.js para renderizar seções ordenadas: summary → exercises → score → mark-done. Exercícios carregados via `DB.exercises.getAll()`. Score validation e mark-done handlers preservados.
**Where**: `src/app.js` (modify — função `createReviewRow` + handlers de autosave)
**Depends on**: T11 (WP-03) + T17 (WP-05) completos
**Reuses**: `createReviewRow()` existente; handlers de autosave existentes (BUG-005 já corrigido)
**Requirement**: LVN-08, LVN-09

**Done when**:
- [ ] Review panel renderiza na ordem: [Resumo Mestre | Exercícios (se houver) | Score | Marcar feita]
- [ ] `DB.exercises.getAll(studyRecordId)` chamado ao abrir a revisão
- [ ] Exercícios renderizados como lista Q→[revelar resposta] (não como subtarefas de revisão)
- [ ] Seção de exercícios ausente se `getAll()` retornar array vazio
- [ ] Discrimination sensor: revisão legada (summary_body=null, exercises=[]) funciona como antes de WP-06
- [ ] Discrimination sensor: correctCount > questionsCount → erro, revisão NÃO marcada como feita
- [ ] `npm test` → 0 fail (testes existentes e novos)

**Tests**: none (UI — manual gate; `npm test` para regressões em testes existentes)
**Gate**: full (`npm test` + manual teste de 3 cenários)

---

### T19: Gate final WP-06 — verificação manual de 3 caminhos

**What**: Execução de teste manual nos 3 cenários obrigatórios antes do commit de WP-06
**Where**: Nenhum arquivo alterado — é um gate de verificação
**Depends on**: T18
**Requirement**: LVN-08, LVN-09 (AC5 — legado sem regressão)

**Done when**:
- [ ] Cenário A: study_record com summary_body + exercises + score → revisão completa, persiste
- [ ] Cenário B: study_record com summary_body, sem exercises → revisão completa sem seção de exercícios
- [ ] Cenário C: study_record legado (sem summary_body, sem exercises) → comportamento idêntico ao pre-WP-06
- [ ] Nenhum erro de console durante os 3 cenários

**Tests**: none (gate manual)
**Gate**: manual — App
**Commit**: `feat(revisao): ciclo integrado Resumo Mestre + exercícios`
*(commit único cobre T18 + T19)*

---

## Discriminação por WP

| WP | Discrimination sensor crítico |
| -- | ----------------------------- |
| WP-01 | Funções puras com input null/zero retornam estrutura correta sem throw |
| WP-02 | Algoritmo desconhecido → Error; apenas uma definição de REVIEW_SCHEDULE no source |
| WP-03 | study_record com summary_body=null carrega Tela Hoje sem erro; revisão legada não quebra |
| WP-04 | Fechar Resumo Diário → count de review_tasks inalterado |
| WP-05 | Deletar exercise → study_record e review_tasks intactos |
| WP-06 | Revisão legada (sem resumo, sem exercícios) funciona exatamente como antes de WP-06 |

---

## Gates de qualidade entre WPs

Antes de iniciar WP-N+1:
1. `npm test` → 0 fail
2. Teste manual do discrimination sensor do WP-N
3. Backup exportado e reimportado sem erro
4. Nenhum teste existente foi alterado para passar

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: review-score edge cases | 1 arquivo de testes, funções puras | ✅ Granular |
| T2: stats edge cases | 1 arquivo de testes, funções puras | ✅ Granular |
| T3: review-schedule interval tests | 1 arquivo de testes, funções puras | ✅ Granular |
| T4: scheduler.js module | 1 arquivo novo, 1 função pública | ✅ Granular |
| T5: db.js — usar scheduler + algorithm column | 1 arquivo, 2 mudanças coesas (import + ensureColumns) | ⚠️ OK — coesas no mesmo arquivo |
| T6: scheduler parity tests | 1 arquivo de testes | ✅ Granular |
| T7: summary_body schema + db.js update | 1 arquivo db.js — ensureColumns + mapper + update | ⚠️ OK — coesas no mesmo arquivo |
| T8: exportAll/importAll update | 1 arquivo db.js — 2 funções coesas | ✅ Granular |
| T9: summary_body UI no cadastro | 1 HTML field + 1 handler change | ✅ Granular |
| T10: summary_body na revisão (display + inline edit) | 1 função createReviewRow + inline edit handler | ⚠️ OK — coesas, mesma tela |
| T11: study-records tests | 1 arquivo de testes | ✅ Granular |
| T12: getByDate() no db.js | 1 arquivo, 1 novo método + browserStore | ✅ Granular |
| T13: UI Resumo Diário + tests | UI (1 botão + 1 painel) + testes de getByDate | ⚠️ OK — coesas, entregáveis da mesma feature |
| T14: exercises table + DB.exercises CRUD | 1 arquivo db.js — schema + 4 métodos + mapper | ⚠️ OK — coesas, mesmo contexto |
| T15: exportAll/importAll exercises | 1 arquivo db.js — 2 funções coesas | ✅ Granular |
| T16: exercises UI | 1 seção de UI por study_record | ✅ Granular |
| T17: exercises tests | 1 arquivo de testes | ✅ Granular |
| T18: createReviewRow() integrado | 1 função app.js + handlers relacionados | ⚠️ OK — cohesivo; split geraria dependências circulares |
| T19: gate manual WP-06 | Verificação sem code change | ✅ Gate |

---

## Diagram-Definition Cross-Check

| Task | Depends on (task body) | Diagram mostra | Status |
| ---- | ---------------------- | -------------- | ------ |
| T1 | None | Phase 1 início | ✅ Match |
| T2 | None | Phase 1 paralelo a T1 | ✅ Match |
| T3 | None | Phase 1 paralelo a T1,T2 | ✅ Match |
| T4 | T1, T2, T3 (WP-01 gate) | T1→T2→T3→T4 | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T4, T5 | T4→T5→T6 | ✅ Match |
| T7 | T1,T2,T3 (WP-01 gate) | T6→T7 (após Phase 2) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T7 | T7→T9 (paralelo a T8) | ✅ Match |
| T10 | T7 | T7→T10 (paralelo a T8,T9) | ✅ Match |
| T11 | T7, T8, T9, T10 | T8+T9+T10→T11 | ✅ Match |
| T12 | T11 (WP-03 gate) | T11→T12 | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |
| T14 | T11 (WP-03 gate) | T13→T14 (Phase 5) | ✅ Match |
| T15 | T14 | T14→T15 | ✅ Match |
| T16 | T14 | T14→T16 (paralelo a T15) | ✅ Match |
| T17 | T14, T15, T16 | T15+T16→T17 | ✅ Match |
| T18 | T11 + T17 (WP-03 + WP-05 gates) | T17→T18 | ✅ Match |
| T19 | T18 | T18→T19 | ✅ Match |

---

## Test Co-location Validation

| Task | Code layer criado/modificado | Matrix requer | Task declara | Status |
| ---- | ---------------------------- | ------------- | ------------ | ------ |
| T1 | Pure functions (review-score.js) | unit | unit | ✅ OK |
| T2 | Pure functions (stats.js) | unit | unit | ✅ OK |
| T3 | Pure functions (review-schedule.js) | unit | unit | ✅ OK |
| T4 | scheduler.js (pure module) | unit | deferred to T6 (same WP, same commit) | ✅ OK |
| T5 | db.js (BrowserStore path) | unit | deferred to T6 | ✅ OK |
| T6 | test/scheduler.test.js | unit | unit | ✅ OK |
| T7 | db.js (BrowserStore path) | unit | deferred to T11 (same WP) | ✅ OK |
| T8 | db.js (export/import) | unit | deferred to T11 | ✅ OK |
| T9 | index.html + app.js (UI) | none | none | ✅ OK |
| T10 | app.js (UI — createReviewRow) | none | none | ✅ OK |
| T11 | test/study-records.test.js | unit | unit | ✅ OK |
| T12 | db.js (BrowserStore — getByDate) | unit | deferred to T13 | ✅ OK |
| T13 | app.js UI + test/study-records additions | unit (getByDate) + none (UI) | unit + none | ✅ OK |
| T14 | db.js (BrowserStore — exercises CRUD) | unit | deferred to T17 | ✅ OK |
| T15 | db.js (export/import) | unit | deferred to T17 | ✅ OK |
| T16 | app.js UI (exercises section) | none | none | ✅ OK |
| T17 | test/exercises.test.js | unit | unit | ✅ OK |
| T18 | app.js (createReviewRow) | none | none (manual gate) | ✅ OK |
| T19 | nenhum (gate manual) | — | manual | ✅ OK |

---

## Nota sobre LATER

WP-07 (FSRS), WP-08 (diagnóstico), WP-09 (relearning), WP-10 (resgate) NÃO têm tasks aqui porque:
- Nenhum problema observável justifica construção agora
- FSRS requer interface de scheduler fundamentalmente diferente da criada em WP-02
  (ver nota arquitetural em design.md — boundary é seam, não drop-in)
- Requerem dados reais de uso para validar thresholds e design
- Detalhar tasks agora seria fabricar requisitos sem evidência
