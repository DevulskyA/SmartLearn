# SmartLearn — Domain Redesign: Tasks (v3)

**Feature:** `smartlearn-domain-redesign`
**Status:** PROPOSTO — AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

**Pré-requisito:** HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL antes de qualquer WP.

---

## Resumo dos WPs

| WP | Objetivo | Dificuldade | Depende de |
|----|---------|-------------|-----------|
| WP-DRD-01 | Schema rename + title + provenance | 3/5 | Aprovação |
| WP-DRD-02 | Remover sources, seeds vazios, deactivate | 2/5 | WP-DRD-01 |
| WP-DRD-03 | schemaVersion backup fail-closed | 2/5 | WP-DRD-01 |
| WP-DRD-04 | BrowserStore paridade de contrato | 2/5 | WP-DRD-01..02 |
| WP-DRD-05 | UX cadastro + empty state | 2/5 | WP-DRD-01..02 |
| WP-DRD-06 | LEGACY_TEMPORARY boundary auditoria | 1/5 | WP-DRD-01 |
| WP-DRD-07 | DEFINITION+PROVENANCE boundary auditoria | 1/5 | WP-DRD-01 |
| WP-DRD-08 | UAT final — Fisiologia/Guyton | 1/5 | WP-DRD-01..07 |

---

## WP-DRD-01 — Schema rename + title + provenance

**Objetivo:** Renomear `study_records → learning_units`, `content → title`; adicionar `exercises.provenance`; atualizar FKs.

**Dificuldade:** 3/5

**ACs:** DRD-06, DRD-11, DRD-12, DRD-13

### Tasks

**T01.1 — SQLiteStore: schema learning_units**
- Criar `learning_units` com colunas: `id, subject_id, title TEXT NOT NULL, source_text TEXT NOT NULL DEFAULT '', summary_body TEXT, study_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL`
- `mapLearningUnit(row)` → `{id, subjectId, title, sourceText, summaryBody, studyDate, createdAt, updatedAt}`
- `DROP TABLE IF EXISTS sources` em `DB.init()` (cleanup de regression)
- `RENAME COLUMN content TO title` se tabela existir com nome antigo (migration via `ensureColumns`)

**T01.2 — SQLiteStore: FK unit_id**
- `exercises`: `unit_id INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE`
- `review_tasks`: `unit_id INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE`
- Recriar índices: `idx_exercises_unit_id`, `idx_review_tasks_unit_id`
- `mapExercise(row)` → `{id, unitId, questionText, answerText, hintText, position, provenance, createdAt, updatedAt}`
- `mapReviewTask(row)` → `unitId` (era `studyRecordId`)

**T01.3 — SQLiteStore: exercises.provenance**
- Schema: `provenance TEXT NOT NULL DEFAULT 'MANUAL'`
- `ensureColumns()` adiciona `provenance` a tabelas existentes com DEFAULT 'MANUAL'
- `DB.exercises.create({..., provenance})` aceita valor; usa 'MANUAL' se ausente
- Validar: apenas 'MANUAL' | 'SOURCE' | 'AI_GENERATED' aceitos (throw em outro valor)

**T01.4 — SQLiteStore: DB.learningUnits.***
- `create({subjectId, title, sourceText, summaryBody, studyDate})` → LearningUnit
- `getAll()` → LearningUnit[]
- `getByDate(date)` → LearningUnit[] filtrado por study_date
- `update(id, {summaryBody?, title?, sourceText?})` → LearningUnit
- Remover ou deprecar `DB.studyRecords.*` (manter como alias temporário durante migration se necessário)

**T01.5 — BrowserStore: renomear coleção e mappers**
- `emptyState()` → `{subjects: [], learningUnits: [], reviewTasks: [], exercises: [], nextIds: {subjects:1, learningUnits:1, reviewTasks:1, exercises:1}}`
- `store.learningUnits.*` com mesma interface que SQLiteStore
- `store.exercises.*` usa `unitId` internamente
- `store.reviewTasks.*` usa `unitId` internamente
- Exercises: incluir `provenance` no shape; DEFAULT 'MANUAL'

**T01.6 — assertImportData + buildImportStatements**
- `assertImportData`: verificar `['subjects', 'learningUnits', 'reviewTasks']`
- `buildImportStatements`: INSERT em `learning_units` com `title` (mapeado de `row.title ?? row.content`)
- INSERT em `learning_units` com `study_date` (mapeado de `row.studyDate ?? row.study_date`)
- INSERT em `exercises` com `unit_id` e `provenance` (DEFAULT 'MANUAL' se ausente)
- INSERT em `review_tasks` com `unit_id`

**T01.7 — Testes: atualizar helpers e referências**
- `makeStudyRecord()` → `makeLearningUnit()`
- `DB.studyRecords.*` → `DB.learningUnits.*` em todos os test files
- Verificar `studyDate` → `studyDate` (nome do campo camelCase: `studyDate`, não `firstStudiedAt`)
- Verificar `createdAt` é timestamp diferente de `studyDate` nos testes
- Testar `provenance`: default 'MANUAL'; 'SOURCE' persiste; valor inválido lança erro

**Gate T01:** `node --test test/` — todos os testes passam (meta: ≥ 37)

**Commit:** `refactor(db): study_records→learning_units, content→title, exercises.provenance, unit_id FK`

---

## WP-DRD-02 — Remover sources, seeds vazios, deactivate seguro

**Objetivo:** Limpar sources do schema; estado inicial VAZIO; safe deactivate de subjects.

**Dificuldade:** 2/5

**ACs:** DRD-06, DRD-07, DRD-08, DRD-17

### Tasks

**T02.1 — Remover sources do schemaStatements**
- Remover CREATE TABLE de `sources` em `schemaStatements`
- Adicionar `DROP TABLE IF EXISTS sources` em `DB.init()` para limpar bancos existentes

**T02.2 — BrowserStore: remover seeds de medicina**
- Remover constante `initialSubjects` e `seedNamedRows` do `store.init()`
- `store.init()` = apenas lê/inicializa estado; sem INSERT de dados
- `emptyState().seeded` removido ou irrelevante

**T02.3 — SQLiteStore: verificar que não injeta seeds**
- Confirmar que `DB.init()` não chama `ensureNamedRows` para subjects automaticamente
- `subjects.seedInitial()` vira no-op ou é removido

**T02.4 — subjects.deactivate(id)**
- SQLiteStore: `UPDATE subjects SET is_active = 0, updated_at = $now WHERE id = $id`
- BrowserStore: `subject.isActive = false; subject.updatedAt = now`
- Retorna subject atualizado

**T02.5 — subjects.deleteCascade(id) seguro**
- SQLiteStore: verificar `SELECT COUNT(*) FROM learning_units WHERE subject_id = $id`
- Se count > 0: `throw new Error("Disciplina possui estudos vinculados. Use desativar para preservar o histórico.")`
- Se count = 0: DELETE com cascade (learning_units → exercises + review_tasks via FK)
- BrowserStore: mesma lógica com `state.learningUnits.filter(u => u.subjectId === id).length`

**T02.6 — reset() sem seeds**
- DELETE em ordem: exercises, review_tasks, learning_units, subjects
- NÃO inserir nada após DELETE
- Verificar: `DB.subjects.getActive()` após reset retorna `[]`

**T02.7 — Testes**
- `DB.init()` → `DB.subjects.getActive()` = [] (sem seeds)
- `DB.subjects.deactivate(id)` → subject.isActive falso, permanece em getAll()
- `DB.subjects.deleteCascade(id)` com learning_units → erro com mensagem PT-BR
- `DB.subjects.deleteCascade(id)` sem learning_units → sucesso
- `DB.reset()` → todos os arrays vazios

**Gate T02:** `node --test test/` — todos passam; init sem seeds verificado

**Commit:** `feat(db): remove sources table, empty state, safe deactivate/delete for subjects`

---

## WP-DRD-03 — schemaVersion em backup

**Objetivo:** Backup versionado; importação fail-closed em formato incompatível.

**Dificuldade:** 2/5

**ACs:** DRD-09

### Tasks

**T03.1 — Constante e exportAll**
```js
const SCHEMA_VERSION = 2;
// exportAll() retorna:
{ schemaVersion: SCHEMA_VERSION, subjects, learningUnits, exercises, reviewTasks }
```

**T03.2 — importAll com validação de versão**
- Sem schemaVersion: `throw new Error("Backup sem versão. Formato não suportado.")`
- schemaVersion > SCHEMA_VERSION: `throw new Error("Backup criado em versão mais recente. Atualize o aplicativo.")`
- schemaVersion < SCHEMA_VERSION: `throw new Error("Backup incompatível: versão X, esperada Y.")`
- schemaVersion === SCHEMA_VERSION: import normal

**T03.3 — assertImportData atualizado**
- Verificar `learningUnits` (não `studyRecords`)
- Sem backward compat complexo para dados de concurso (descartáveis)

**T03.4 — Testes**
- `exportAll()` inclui `schemaVersion === 2`
- `exportAll()` inclui `learningUnits` (não `studyRecords`)
- `importAll` com `schemaVersion: 99` → erro "versão mais recente"
- `importAll` sem `schemaVersion` → erro "sem versão"
- `importAll` com `schemaVersion: 2` e dados válidos → todos os dados restaurados

**Gate T03:** `node --test test/` — todos passam

**Commit:** `feat(db): schemaVersion 2, fail-closed backup validation`

---

## WP-DRD-04 — BrowserStore paridade de contrato

**Objetivo:** BrowserStore implementa exatamente o mesmo contrato que SQLiteStore.

**Dificuldade:** 2/5

**ACs:** DRD-10

### Tasks

**T04.1 — Auditoria de métodos**
- Listar métodos em SQLiteStore (DB.* facade)
- Listar métodos em BrowserStore
- Produzir tabela de paridade (ver design.md §4.2)

**T04.2 — Eliminar divergências**
- Método em um sem equivalente no outro: implementar ou remover
- Shape de retorno: field names, tipos, nullable idênticos

**T04.3 — JSDoc nos mappers**
```js
/** @typedef {{id: number, subjectId: number, title: string, sourceText: string, summaryBody: string|null, studyDate: string, createdAt: string, updatedAt: string}} LearningUnit */
/** @typedef {{id: number, unitId: number, questionText: string, answerText: string, hintText: string|null, position: number, provenance: string, createdAt: string, updatedAt: string}} Exercise */
```

**T04.4 — Testes de paridade**
- Para cada método: shape de retorno verificado em teste via BrowserStore
- Nenhum campo inexistente no SQLiteStore acessado nos testes

**Gate T04:** zero divergências; `node --test test/` passam todos

**Commit:** `refactor(db): BrowserStore full contract parity with SQLiteStore`

---

## WP-DRD-05 — UX cadastro: fluxo correto e empty state

**Objetivo:** Verificar e corrigir fluxo de cadastro pós-rename; empty state amigável.

**Dificuldade:** 2/5

**ACs:** UX-01..05, DRD-04, DRD-05

### Tasks

**T05.1 — app.js: atualizar referências**
- `DB.studyRecords.*` → `DB.learningUnits.*`
- Objeto de cadastro: `{title, sourceText, summaryBody, studyDate, subjectId}` (não `content`, não `sourceId`)
- Render functions usam `unit.title`, `unit.studyDate`, `unit.sourceText`
- `createReviewRow()` recebe `learningUnit`

**T05.2 — Empty state amigável**
- `renderSubjects()` com lista vazia → `<p class="empty-state">Nenhuma disciplina ainda. Comece adicionando a primeira.</p>`
- `renderStudies()` com lista vazia → mensagem amigável
- `renderToday()` sem revisões → mensagem preservada

**T05.3 — Verificar draft preservation (09ea0d8)**
- Clicar "+ Nova disciplina" durante cadastro: title, source, date, summary preservados
- Teste manual: preencher campos → adicionar disciplina → verificar preservação

**T05.4 — Fonte como campo simples**
- Input `#study-source-text` é texto livre
- Sem select, sem autocomplete, sem CRUD de fontes
- Nenhuma referência a `renderSources`, `sourceList`, `showSourceFormButton`, `sourceId`

**T05.5 — Build limpo**
- `npm run build` sem warnings de variáveis não utilizadas ou imports mortos
- Verificar: nenhuma referência morta a `sourceId`, `sources`, `renderSources`, `sourceList`

**T05.6 — UI subjects: deactivate + delete seguro**
- Botão "Desativar" → `DB.subjects.deactivate(id)` → subject some de getActive()
- Botão "Excluir" → `DB.subjects.deleteCascade(id)` → erro UI amigável se tem units
- Subject desativado não aparece no select de cadastro

**Gate T05:** build limpo + UX-01..05 verificados manualmente no browser

**Commit:** `feat(ui): learning_units, title field, empty state, deactivate UI, fonte texto livre`

---

## WP-DRD-06 — LEGACY_TEMPORARY boundary auditoria

**Objetivo:** Confirmar boundary de scheduler; documentar formalmente.

**Dificuldade:** 1/5

**ACs:** DRD-16

### Tasks

**T06.1 — Auditoria de constante**
- `grep -rn "16\b" src/*.js` → ocorrências legítimas APENAS em scheduler.js (SCHEDULE_OFFSETS)
- Ocorrências em db.js, app.js, index.html: zero (se houver, refatorar para importar de scheduler.js)

**T06.2 — Comentário de boundary em scheduler.js**
```js
// LEGACY_TEMPORARY: fixed 16-review schedule. Boundary: scheduling logic stays here.
// A future adaptive scheduler (SM-2, FSRS) replaces this file; may require schema evolution.
// See .specs/features/smartlearn-domain-redesign/design.md §3.
```

**T06.3 — Verificar imports**
- `grep -rn "SCHEDULE_OFFSETS\|REVIEW_SCHEDULE" src/` → todas as referências via import de scheduler.js

**Gate T06:** auditoria limpa; comentário presente

**Commit:** `docs(scheduler): LEGACY_TEMPORARY boundary, substitutability note`

---

## WP-DRD-07 — DEFINITION+PROVENANCE boundary auditoria

**Objetivo:** Confirmar que exercises é definition+provenance only; sem campos de tentativa.

**Dificuldade:** 1/5

**ACs:** DRD-13, DRD-15

### Tasks

**T07.1 — Auditoria de schema exercises**
- Colunas: `id, unit_id, question_text, answer_text, hint_text, position, provenance, created_at, updated_at`
- SEM: `score`, `attempt_count`, `last_attempted_at`, `correct`, etc.

**T07.2 — Auditoria de mapExercise**
- `mapExercise()` não mapeia campos de tentativa
- Retorna: `{id, unitId, questionText, answerText, hintText, position, provenance, createdAt, updatedAt}`

**T07.3 — Comentário de boundary em db.js**
```js
// exercises = DEFINITION + PROVENANCE only.
// Attempt history (per-exercise score, confidence, error type) = LATER (exercise_attempts table).
// Aggregate evidence per review session: review_tasks.correct_count / score_percent.
```

**T07.4 — Auditoria de app.js**
- Score por revisão em `review_tasks.correct_count` — confirmar único ponto de score agregado
- Nenhum campo de score por exercício individual em app.js

**Gate T07:** auditoria limpa; boundaries documentadas

**Commit:** `docs(db): exercises DEFINITION+PROVENANCE boundary, evidence NOW/LATER comment`

---

## WP-DRD-08 — UAT final

**Objetivo:** Verificar fluxo completo Fisiologia/Guyton após todos os WPs.

**Dificuldade:** 1/5

**ACs:** UX-01..05, DRD-07, DRD-17

### Tasks

**T08.1 — Estado inicial vazio**
- Banco recriado (DB.reset() ou init do zero)
- `subjects.getActive()` = []; zero revisões; empty state visível

**T08.2 — Cadastro completo**
- Adicionar disciplina "Fisiologia"
- Fonte: "Guyton & Hall, Tratado de Fisiologia Médica, 11ª ed., cap. 1"
- Data: 2026-03-10 (retroativo)
- Título: "Organização funcional do corpo humano e homeostase"
- Resumo: "O LEC é o ambiente interno..."
- Salvar → aparece na lista com título e fonte corretos

**T08.3 — Revisão com evidência**
- Tela Hoje → revisão R1 aparece
- ReviewRow mostra: Disciplina, Título, Fonte, Resumo Mestre
- Registrar exercícios → correct_count e score_percent salvos

**T08.4 — Draft preservation**
- Preencher título + fonte → clicar "+ Nova disciplina" → digitar "Histologia" → salvar
- Verificar: título e fonte preservados

**T08.5 — Reset limpo**
- Configurações → Resetar → confirmar
- `subjects.getActive()` = []; zero revisões; empty state visível

**T08.6 — Backup roundtrip**
- Exportar backup → verificar `schemaVersion: 2` no JSON
- Reset banco → importar backup → todos os dados restaurados

**T08.7 — Import inválido**
- JSON sem schemaVersion → mensagem de erro; banco inalterado
- JSON com schemaVersion: 99 → mensagem "versão mais recente"

**Gate T08:** todos os cenários manuais passam

**Commit:** `chore: UAT DRD-01..17, UX-01..05 verified — domain redesign complete`

---

## Roadmap de execução

```
HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
    ↓
WP-DRD-01 (dif 3) — schema rename, title, provenance
    ↓
WP-DRD-02 (dif 2)     WP-DRD-03 (dif 2)     WP-DRD-06 (dif 1)     WP-DRD-07 (dif 1)
sources/seeds/deact    schemaVersion           scheduler boundary     exercises boundary
(paralelo após WP-01)
    ↓
WP-DRD-04 (dif 2) — BrowserStore parity
    ↓
WP-DRD-05 (dif 2) — UX cadastro
    ↓
WP-DRD-08 (dif 1) — UAT final
    ↓
PR → main
```

**Esforço estimado:** 2-3 sessões

---

## Structural Gate

**STRUCTURAL_GATE = UNVERIFIED_BY_RUNTIME**

`validate_spec.py` e `validate_tasks.py` não existem nos scripts bundled do skill TLC.
Apenas `scripts/lessons.py` está presente.
Os validators automáticos não puderam ser executados.
Esta limitação é reportada sem substituição por checagem manual declarada como PASS.

---

## Checagem manual de tasks.md (melhor esforço)

| Critério | Resultado |
|---------|-----------|
| Cada WP tem objetivo observável | PASS |
| Cada WP tem gate de teste | PASS |
| Cada WP referencia ACs de spec.md | PASS |
| Cada WP tem dificuldade declarada | PASS |
| WPs cobrem todos os 8 problemas do diagnóstico | PASS |
| Nenhum WP é LATER disfarçado de NOW | PASS |
| Migration explícita (WP-01 T01.1) | PASS |
| Rollback: banco pode ser recriado | PASS |

---

## HUMAN_GATES

| Gate | Condição |
|------|---------|
| DOMAIN_REDESIGN_APPROVAL | Aprovação de spec.md v3 + design.md v3 + tasks.md v3 |
