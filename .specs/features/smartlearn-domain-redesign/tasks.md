# SmartLearn — Domain Redesign: Tasks (v2)

**Feature:** `smartlearn-domain-redesign`
**Status:** PROPOSTO — AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

**Pré-requisito absoluto:** HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL antes de qualquer WP.

---

## Resumo dos WPs

| WP | Objetivo | Dificuldade | Depende de |
|----|---------|-------------|-----------|
| WP-DRD-01 | Schema rename + semantic fix | 3/5 | Aprovação |
| WP-DRD-02 | Remover sources, seeds vazios | 2/5 | WP-DRD-01 |
| WP-DRD-03 | schemaVersion em backup | 2/5 | WP-DRD-01 |
| WP-DRD-04 | BrowserStore — paridade de contrato | 2/5 | WP-DRD-01..02 |
| WP-DRD-05 | UX cadastro — fluxo correto + empty state | 2/5 | WP-DRD-01..02 |
| WP-DRD-06 | Discriminação LEGACY_TEMPORARY em scheduler | 1/5 | WP-DRD-01 |
| WP-DRD-07 | Fronteira DEFINITION × ATTEMPT (auditoria) | 1/5 | WP-DRD-01 |
| WP-DRD-08 | UAT final — fluxo Fisiologia/Guyton | 1/5 | WP-DRD-01..07 |

---

## WP-DRD-01 — Schema rename + semantic fix

**Objetivo:** Renomear entidades para refletir domínio correto; corrigir semântica de `study_date → first_studied_at`.

**Dificuldade:** 3/5 (muitos pontos de renomear, migration incluída)

**ACs cobertos:** DRD-06, DRD-11

### Tasks

**T01.1 — SQLiteStore: criar schema `learning_units`**
- `learning_units` CREATE TABLE com colunas: `id, subject_id, title TEXT NOT NULL, source_text, summary_body, first_studied_at TEXT NOT NULL, created_at, updated_at`
- FK `unit_id` em `exercises` e `review_tasks` (DROP + CREATE ou `ensureColumns`)
- Índices: `idx_review_tasks_unit_id`, `idx_exercises_unit_id`
- Remover esquema de `study_records` (ou manter como alias temporário se dados reais existirem — SCHEMA_MIGRATION_APPROVAL)
- `mapLearningUnit(row)` retorna `{id, subjectId, title, sourceText, summaryBody, firstStudiedAt, createdAt, updatedAt}`
- `mapReviewTask(row)` usa `unitId` (era `studyRecordId`)
- `mapExercise(row)` usa `unitId` (era `studyRecordId`)

**T01.2 — SQLiteStore: métodos `DB.learningUnits.*`**
- `create({subjectId, title, sourceText, summaryBody, firstStudiedAt})` → `LearningUnit`
- `getAll()` → `LearningUnit[]`
- `getByDate(date)` → `LearningUnit[]` (filtra `first_studied_at`)
- `update(id, {summaryBody?, title?, sourceText?})` → `LearningUnit`
- Remover `DB.studyRecords.*` do SQLiteStore (ou mantê-lo como alias deprecated durante migration)

**T01.3 — BrowserStore: renomear coleção**
- `emptyState()` retorna `{subjects: [], learningUnits: [], reviewTasks: [], exercises: []}`
- `nextIds`: `{subjects: 1, learningUnits: 1, reviewTasks: 1, exercises: 1}`
- Métodos `store.learningUnits.*` com mesma interface que SQLiteStore
- `store.exercises` e `store.reviewTasks` usam `unitId` internamente

**T01.4 — `assertImportData` atualizado**
- Verificar `['subjects', 'learningUnits', 'reviewTasks']` (não `studyRecords`)
- Backward compat: se `data.studyRecords` existe e `data.learningUnits` não, usar `studyRecords` com mapeamento

**T01.5 — `buildImportStatements` atualizado**
- INSERT em `learning_units` com `first_studied_at` (mapeado de `studyDate ?? study_date ?? firstStudiedAt`)
- INSERT em `exercises` com `unit_id`
- INSERT em `review_tasks` com `unit_id`

**T01.6 — `buildClearStatements` atualizado**
- DELETE em ordem: exercises, review_tasks, learning_units, subjects

**T01.7 — Testes: renomear helpers e referências**
- `makeStudyRecord()` → `makeLearningUnit()`
- `DB.studyRecords.*` → `DB.learningUnits.*` em todos os testes
- Verificar `firstStudiedAt` retornado nos objetos
- Garantir `createdAt` é timestamp técnico distinto de `firstStudiedAt` nos testes

**Gate T01:** `node --test test/` — todos os testes passam (meta: ≥ 37)

**Commit:** `refactor(db): rename study_records→learning_units, study_date→first_studied_at, unit_id FK`

**Rollback:** se migration com dados reais falhar, branch isolada + SCHEMA_MIGRATION_APPROVAL

---

## WP-DRD-02 — Remover sources, seeds vazios, deactivate seguro

**Objetivo:** Eliminar regression da tabela `sources`; garantir estado inicial VAZIO; safe deactivate de subjects.

**Dificuldade:** 2/5

**ACs cobertos:** DRD-06, DRD-07, DRD-08, DRD-14

### Tasks

**T02.1 — Remover `sources` do schema**
- Remover CREATE TABLE de `sources` em `schemaStatements`
- Garantir `DROP TABLE IF EXISTS sources` em `DB.init()` (cleanup de bancos existentes)
- Remover `ensureNamedRows` chamadas para sources (se existirem)

**T02.2 — BrowserStore: remover seeds de medicina**
- Remover constante `initialSubjects` de BrowserStore
- `store.init()` NÃO chama `seedNamedRows`
- `store.subjects.seedInitial()` removido ou vira no-op (NÃO injeta medicina)
- `emptyState().seeded` pode ser removido (sem seed)

**T02.3 — SQLiteStore: verificar seeds**
- Confirmar que `DB.init()` no SQLite também não injeta seeds de subjects
- `ensureNamedRows` só é chamado explicitamente, nunca em init automático

**T02.4 — `subjects.deactivate(id)`**
- SQLiteStore: `UPDATE subjects SET is_active = 0, updated_at = $1 WHERE id = $2`
- BrowserStore: `subject.isActive = false`
- Retorna subject atualizado

**T02.5 — `subjects.deleteCascade(id)` seguro**
- Verificar se subject tem learning_units: `SELECT COUNT(*) FROM learning_units WHERE subject_id = $1`
- Se count > 0: throw `new Error("Disciplina possui estudos vinculados. Use desativar para preservar o histórico.")`
- Se count = 0: DELETE (cascade para review_tasks e exercises via FK)
- BrowserStore: mesma lógica com filtro em `state.learningUnits`

**T02.6 — Testes**
- `DB.init()` → `DB.subjects.getActive()` retorna `[]` (sem seeds)
- `DB.subjects.deactivate(id)` → `isActive` falso
- `DB.subjects.deleteCascade(id)` com learning_units → erro esperado
- `DB.subjects.deleteCascade(id)` sem learning_units → sucesso

**T02.7 — `reset()` sem seeds**
- DELETE em ordem: exercises, review_tasks, learning_units, subjects
- NÃO inserir nada após DELETE
- `DB.subjects.getActive()` após reset retorna `[]`

**Gate T02:** `node --test test/` — todos passam; `DB.init()` + `getActive()` = `[]`

**Commit:** `feat(db): remove sources table, empty initial state, safe deactivate/delete for subjects`

---

## WP-DRD-03 — schemaVersion em backup

**Objetivo:** Backup com versão; importação fail-closed em versão incompatível.

**Dificuldade:** 2/5

**ACs cobertos:** DRD-09

### Tasks

**T03.1 — Constante e exportAll**
```js
const SCHEMA_VERSION = 2;
// exportAll() inclui:
{ schemaVersion: SCHEMA_VERSION, subjects: [...], learningUnits: [...], exercises: [...], reviewTasks: [...] }
```

**T03.2 — importAll com validação**
```js
// Lógica completa:
if (!data.schemaVersion && data.studyRecords) {
  // backup legado v1 — mapear studyRecords → learningUnits com aviso
} else if (!data.schemaVersion) {
  throw new Error("Backup inválido: sem versão de schema.");
} else if (data.schemaVersion > SCHEMA_VERSION) {
  throw new Error("Backup criado em versão mais recente. Atualize o aplicativo.");
} else if (data.schemaVersion < SCHEMA_VERSION) {
  throw new Error("Backup incompatível: versão " + data.schemaVersion + ", esperada " + SCHEMA_VERSION + ".");
}
// versão exata: import normal
```

**T03.3 — Backward compat legado (v1)**
- Se `backup.studyRecords` existe: mapear como `learningUnits` com `firstStudiedAt = studyDate`
- Adicionar `sourceText = ''` se ausente
- Logar aviso visível ao usuário: "Backup legado importado com conversão automática"

**T03.4 — Testes**
- `exportAll()` → `backup.schemaVersion === 2`
- `importAll` com `schemaVersion: 99` → erro "versão mais recente"
- `importAll` com `schemaVersion: 1` → erro "incompatível"
- `importAll` com `studyRecords` sem schemaVersion → import com conversão
- `importAll` válido → todos os dados preservados

**Gate T03:** `node --test test/` — todos passam

**Commit:** `feat(db): schemaVersion 2 in backup, fail-closed validation, v1 legacy compat`

---

## WP-DRD-04 — BrowserStore: paridade de contrato

**Objetivo:** BrowserStore implementa exatamente o mesmo contrato que SQLiteStore; nenhuma divergência.

**Dificuldade:** 2/5

**ACs cobertos:** DRD-10

### Tasks

**T04.1 — Auditoria de métodos**
- Listar todos os métodos públicos em SQLiteStore (DB.* interface)
- Listar todos os métodos em BrowserStore
- Produzir tabela de paridade (ver design.md §6.2)
- Identificar divergências

**T04.2 — Eliminar divergências**
- Métodos em BrowserStore sem equivalente SQLite: remover ou adicionar ao SQLite
- Métodos em SQLite sem equivalente BrowserStore: implementar no BrowserStore
- Shapes de retorno: field names, tipos e nullable idênticos

**T04.3 — JSDoc nos mappers**
- `mapLearningUnit`, `mapExercise`, `mapReviewTask`, `mapSubject`
- Cada mapper documenta o shape de retorno com `@typedef`

**T04.4 — Testes de paridade**
- Para cada método listado em T04.1: confirmar que teste via BrowserStore valida o mesmo shape que SQLiteStore retornaria
- Nenhum teste acessa campos ausentes de SQLiteStore

**Gate T04:** zero divergências na tabela de paridade; `node --test test/` — todos passam

**Commit:** `refactor(db): BrowserStore full contract parity with SQLiteStore`

---

## WP-DRD-05 — UX cadastro: fluxo correto e empty state

**Objetivo:** Verificar e corrigir fluxo de cadastro na UI; garantir empty state amigável.

**Dificuldade:** 2/5

**ACs cobertos:** UX-01..05, DRD-04, DRD-05

### Tasks

**T05.1 — Verificar UI de cadastro pós-rename**
- `app.js`: todas referências a `studyRecords` → `learningUnits`
- `app.js`: `studyDate` → `firstStudiedAt` no objeto enviado para `DB.learningUnits.create`
- `app.js`: `content` → `title` (ou manter `content` se custo de rename supera benefício — decidir em implementação)
- Renderização da lista de estudos usa `unit.firstStudiedAt` (não `studyDate`)

**T05.2 — Empty state amigável**
- `renderSubjects()` com lista vazia: mostrar `<p class="empty-state">Nenhuma disciplina ainda. Comece adicionando uma.</p>`
- `renderStudies()` com lista vazia: mostrar `<p class="empty-state">Nenhum estudo registrado. Adicione seu primeiro.</p>`
- `renderToday()` sem revisões: mensagem amigável preservada

**T05.3 — Verificar draft preservation (já em 09ea0d8)**
- Clicar "+ Nova disciplina" durante cadastro: título, fonte, data, resumo preservados
- Teste manual: preencher todos os campos → adicionar disciplina → verificar preservação

**T05.4 — Fonte como campo simples**
- Input `#study-source-text` é texto livre — verificar no HTML e app.js
- Sem select, sem autocomplete, sem CRUD de fontes na tela de cadastro
- Validação: fonte vazia é permitida (campo opcional ou obrigatório — decidir com spec §3.1)

**T05.5 — Build limpo**
- `npm run build` (ou Vite) sem warnings de variáveis não utilizadas, imports mortos
- Especialmente: nenhuma referência a `sourceId`, `sources`, `renderSources`, `sourceList`

**T05.6 — UI de gerenciamento de subjects**
- Botão "Desativar" chama `DB.subjects.deactivate(id)` (não hard delete)
- Botão "Excluir" só aparece se subject sem learning_units; chama `DB.subjects.deleteCascade(id)`
- Erro de deleteCascade com units → mensagem visível ao usuário, não crash

**Gate T05:** build limpo + manual UX-01..05 verificados no browser (Vite dev server)

**Commit:** `feat(ui): cadastro com learning_units, empty state, fonte texto livre, deactivate UI`

---

## WP-DRD-06 — LEGACY_TEMPORARY boundary em scheduler

**Objetivo:** Formalizar que 16 review_tasks é modelo legacy; boundary em scheduler.js.

**Dificuldade:** 1/5

**ACs cobertos:** DRD-13

### Tasks

**T06.1 — Auditoria de constante "16"**
- `grep -rn "16" src/` — identificar todas as ocorrências
- Ocorrências legítimas: APENAS em `scheduler.js` (SCHEDULE_OFFSETS com 16 entradas)
- Ocorrências em `db.js`, `app.js`, `index.html`: nenhuma (se houver, refatorar para importar de scheduler)

**T06.2 — Comentário de boundary em scheduler.js**
- Adicionar comentário antes de SCHEDULE_OFFSETS:
  `// LEGACY_TEMPORARY: 16 fixed review intervals. See domain-redesign/design.md §3.`
- Não é refatoração de algoritmo — apenas documentação de fronteira

**T06.3 — Verificação**
- `grep -rn "16\b" src/ --include="*.js"` — confirmar apenas em scheduler.js
- `grep -rn "SCHEDULE_OFFSETS\|REVIEW_SCHEDULE" src/` — todas as referências apontam para scheduler.js import

**Gate T06:** auditoria limpa; comentário adicionado

**Commit:** `docs(scheduler): mark 16-task model as LEGACY_TEMPORARY, formalize boundary`

---

## WP-DRD-07 — Fronteira DEFINITION × ATTEMPT (auditoria)

**Objetivo:** Confirmar que exercises não tem campos de tentativa; documentar fronteira formal.

**Dificuldade:** 1/5

**ACs cobertos:** DRD-12

### Tasks

**T07.1 — Auditoria de schema exercises**
- Confirmar colunas de `exercises`: `id, unit_id, question_text, answer_text, hint_text, position, created_at, updated_at`
- SEM: `score`, `attempt_count`, `last_attempted_at`, `correct`, etc.

**T07.2 — Auditoria de mapExercise**
- Confirmar que `mapExercise()` não mapeia campos de tentativa
- `mapExercise` retorna: `{id, unitId, questionText, answerText, hintText, position, createdAt, updatedAt}`

**T07.3 — Comentário de fronteira em db.js**
- Acima da definição da tabela `exercises` no schema:
  `// DEFINITION-only: question/answer/hint. Attempt history = LATER (exercise_attempts table).`

**T07.4 — Auditoria de app.js**
- Verificar que app.js não passa campos de score por exercício (score agrega em review_tasks)
- `review_tasks.correct_count` é único ponto de score agregado — confirmar

**Gate T07:** auditoria limpa; fronteira documentada no código

**Commit:** `docs(db): formalize DEFINITION-only boundary for exercises, LATER note for attempts`

---

## WP-DRD-08 — UAT final

**Objetivo:** Verificar fluxo completo Fisiologia/Guyton no runtime Tauri + browser.

**Dificuldade:** 1/5 (execução) — requer Tauri dev ativo

**ACs cobertos:** UX-01..05, DRD-07, DRD-14

### Tasks

**T08.1 — Teste browser (Vite dev server)**
- Estado inicial: banco VAZIO (DB.reset() ou first run)
- Adicionar disciplina "Fisiologia"
- Preencher cadastro: Fonte "Guyton & Hall, cap. 1", Data 2026-03-10, Aula "Organização funcional", Resumo "LEC..."
- Salvar → aparecer na lista com fonte correta
- Tela Hoje → revisão R1 com fonte e resumo

**T08.2 — Teste de preservação de draft**
- Preencher fonte + aula
- Clicar "+ Nova disciplina" → digitar "Histologia" → salvar
- Verificar: fonte e aula preservados

**T08.3 — Teste de reset**
- Configurações → Resetar banco → confirmar
- Verificar: `subjects.getActive()` = []; zero revisões hoje; empty state visível

**T08.4 — Teste de schemaVersion inválido**
- Criar arquivo JSON sem schemaVersion ou com `schemaVersion: 99`
- Importar → mensagem de erro clara; banco inalterado

**T08.5 — Backup roundtrip**
- Exportar backup
- Reset banco
- Importar backup
- Verificar: todas as disciplinas, estudos e revisões restaurados; fonte presente

**T08.6 — Tauri runtime (se disponível)**
- `npm run tauri dev`
- Repetir T08.1 no app desktop
- Verificar `first_studied_at` na DB SQLite real (sqlite3 CLI ou app)

**Gate T08:** todos os cenários manuais passam

**Commit:** `chore: UAT DRD-01..DRD-14, UX-01..UX-05 verified`

---

## Roadmap de execução

```
HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
    ↓
WP-DRD-01 (dif 3) — rename + semantic fix
    ↓
WP-DRD-02 (dif 2)   WP-DRD-03 (dif 2)   WP-DRD-06 (dif 1)   WP-DRD-07 (dif 1)
sources/seeds        schemaVersion        scheduler boundary    exercises audit
(paralelo possível após WP-01)
    ↓
WP-DRD-04 (dif 2) — BrowserStore parity
    ↓
WP-DRD-05 (dif 2) — UX cadastro
    ↓
WP-DRD-08 (dif 1) — UAT final
    ↓
PR — branch claude/com-tlc-replanning-77f844 → main
```

**Esforço total estimado:** 2-3 sessões de desenvolvimento

---

## Checagem estrutural de tasks.md

| Critério | Resultado |
|---------|-----------|
| Cada WP tem objetivo observável | PASS |
| Cada WP tem gate de teste | PASS |
| Cada WP tem ACs referenciados | PASS |
| Nenhum WP sem discriminação de dificuldade | PASS |
| Rollback/migration explícito (WP-01) | PASS |
| WPs cobrem todos os problemas do diagnóstico | PASS — 8 problemas × WPs cobertos |
| Nenhum WP é LATER disfarçado de NOW | PASS — ATTEMPT/EVIDENCE, FSRS explicitamente LATER |

---

## HUMAN_GATES

| Gate | Condição | O que bloqueia |
|------|---------|----------------|
| DOMAIN_REDESIGN_APPROVAL | Aprovação de spec.md v2 + design.md v2 + tasks.md v2 | WP-DRD-01..08 |
| SCHEMA_MIGRATION_APPROVAL | Antes de migration destrutiva se banco tem dados reais | Apenas a migration; não bloqueia outros WPs |
