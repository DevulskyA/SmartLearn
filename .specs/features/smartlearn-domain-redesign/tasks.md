# SmartLearn — Domain Redesign: Tasks

**Feature:** `smartlearn-domain-redesign`
**Status:** AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

**Pré-requisito:** HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL (usuário aprova spec.md + design.md + tasks.md)

---

## Visão geral

Adotar Alternativa B-MVP (design.md §3): `learning_units` como tabela central, `active` em subjects, seeds VAZIOS, `schemaVersion` em backup, BrowserStore como puro test double.

Commit 09ea0d8 é ponto de partida — não reverter.

---

## WP-DRD-01 — Renomear study_records → learning_units

**Dificuldade:** 2/5
**Dependência:** HUMAN_GATE: HYPOTHESIS_DECISION (antes de executar)
**Arquivos afetados:** `src/db.js`, `test/*.test.js`

### Tasks

**T01.1 — Schema SQLite: nova tabela learning_units**
- Criar `learning_units` com colunas: `id, subject_id, source_text TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, summary_body TEXT, created_at TEXT NOT NULL`
- `mapLearningUnit()` retorna `{id, subjectId, sourceText, content, summaryBody, createdAt}`
- Migration em `ensureColumns()`: se `study_records` existir com dados, copiar para `learning_units` e mapear `study_date → created_at`
- Atualizar FK em `exercises` e `review_tasks`: coluna `unit_id` (era `study_record_id`)
- Atualizar `assertImportData`: `['subjects', 'learningUnits', 'exercises', 'reviewTasks']`

**T01.2 — BrowserStore: renomear emptyState**
- `emptyState()` retorna `{subjects: [], learningUnits: [], reviewTasks: [], exercises: []}`
- Método `DB.learningUnits.*` em BrowserStore (igual a DB.studyRecords mas com naming correto)

**T01.3 — app.js: atualizar referências**
- Substituir `DB.studyRecords.*` por `DB.learningUnits.*` em todo app.js
- Substituir `studyRecord` por `learningUnit` em variáveis locais e render functions
- `createReviewRow()` recebe `learningUnit` não `studyRecord`

**T01.4 — Testes: atualizar helpers**
- `makeStudyRecord()` vira `makeLearningUnit()`
- Todos os `DB.studyRecords.*` nos testes viram `DB.learningUnits.*`
- Verificar 37 testes passam

**Gate T01:** `node --test test/` — 37 testes passam, zero falhas

**Commit:** `refactor(db): rename study_records to learning_units, study_date to created_at`

---

## WP-DRD-02 — Seeds VAZIOS, subjects com active

**Dificuldade:** 1/5
**Dependência:** WP-DRD-01
**Arquivos afetados:** `src/db.js`

### Tasks

**T02.1 — Remover seeds de medicina de db.js**
- `DB.init()` NÃO insere disciplinas
- `DB.reset()` executa DELETE em ordem: review_tasks, exercises, learning_units, subjects
- `DB.reset()` NÃO insere seeds após limpeza
- BrowserStore `emptyState()` retorna `{subjects: [], ...}` sem seeds

**T02.2 — Coluna active em subjects**
- Schema: `subjects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`
- `ensureColumns()` adiciona `active` se não existe (DEFAULT 1 para todos existentes)
- `DB.subjects.getActive()` filtra `WHERE active = 1`
- `DB.subjects.deactivate(id)` seta `active = 0`
- `DB.subjects.deleteCascade(id)`:
  - Se subject tem learning_units: lançar erro com mensagem clara ("Disciplina tem estudos vinculados. Use desativar.")
  - Se sem learning_units: hard delete
- UI: botão "Desativar" e botão "Excluir" (condicional — só aparece se sem estudos)

**T02.3 — UI: estado vazio amigável**
- `<p>Nenhuma disciplina cadastrada ainda. Adicione a primeira.</p>` quando subjects = []
- Estudos empty state igualmente amigável

**Gate T02:** `node --test test/` — todos passam; teste manual: reset → sem seeds; nova instalação → sem seeds

**Commit:** `feat(db): empty initial state, subjects.active, safe deleteCascade`

---

## WP-DRD-03 — schemaVersion em backup

**Dificuldade:** 1/5
**Dependência:** WP-DRD-01 (nomes corretos no backup)
**Arquivos afetados:** `src/db.js`

### Tasks

**T03.1 — exportAll inclui schemaVersion**
```js
const SCHEMA_VERSION = 2;
// exportAll() retorna:
{ schemaVersion: SCHEMA_VERSION, subjects: [...], learningUnits: [...], exercises: [...], reviewTasks: [...] }
```

**T03.2 — importAll valida schemaVersion**
```js
if (backup.schemaVersion !== SCHEMA_VERSION) {
  throw new Error(`Backup incompatível: versão ${backup.schemaVersion ?? 'desconhecida'}, esperada ${SCHEMA_VERSION}`);
}
```

**T03.3 — Backward compat para backup v1 (sem schemaVersion)**
- Se `backup.schemaVersion` ausente e `backup.studyRecords` presente: tentar import com mapeamento `studyRecords → learningUnits`
- Opcional: HUMAN_GATE pode decidir se backward compat é necessário

**T03.4 — Testes**
- `exportAll` inclui `schemaVersion: 2`
- `importAll` com `schemaVersion: 99` lança erro com mensagem legível
- `importAll` com backup válido passa

**Gate T03:** `node --test test/` — todos passam

**Commit:** `feat(db): schemaVersion in backup export/import`

---

## WP-DRD-04 — BrowserStore como puro test double

**Dificuldade:** 2/5
**Dependência:** WP-DRD-01, WP-DRD-02
**Arquivos afetados:** `src/db.js`

### Tasks

**T04.1 — Auditoria de contrato**
- Listar todos os métodos em BrowserStore
- Listar todos os métodos em SQLiteStore
- Identificar divergências: métodos em um que não estão no outro

**T04.2 — Eliminar divergências**
- Métodos em BrowserStore sem equivalente SQLite: remover ou adicionar ao SQLite
- Métodos em SQLite sem equivalente BrowserStore: adicionar ao BrowserStore
- Shapes de retorno devem ser idênticos (mesmo campo names, tipos, nullable)

**T04.3 — Documentar contrato via tipos JSDoc**
```js
/**
 * @typedef {Object} LearningUnit
 * @property {number} id
 * @property {number} subjectId
 * @property {string} sourceText
 * @property {string} content
 * @property {string|null} summaryBody
 * @property {string} createdAt
 */
```

**Gate T04:** `node --test test/` — todos passam; auditoria confirma zero divergências

**Commit:** `refactor(db): BrowserStore as pure test double, unified contract`

---

## WP-DRD-05 — UAT final: fluxo Fisiologia/Guyton

**Dificuldade:** 1/5 (execução) / 3/5 (contexto manual)
**Dependência:** WP-DRD-01..04

### Tasks

**T05.1 — Build limpo**
- `vite build` sem erros ou warnings de variáveis não utilizadas

**T05.2 — Teste manual no browser (Vite dev server)**
- Abrir app em estado limpo (sem dados)
- Confirmar estado vazio: sem disciplinas, sem estudos
- Adicionar disciplina "Fisiologia" → aparece no select
- Preencher: Fonte "Guyton & Hall, Tratado de Fisiologia Médica, 11ª ed., cap. 1", Data hoje, Tema "Organização funcional do corpo humano e homeostase", Resumo "O LEC é o ambiente interno..."
- Salvar → aparece na lista de estudos com fonte correta
- Tela "Hoje" → revisão R1 aparece com fonte e resumo

**T05.3 — Teste de preservação de draft**
- Preencher fonte + tema
- Clicar "+ Nova disciplina", digitar "Histologia", salvar
- Verificar: fonte e tema preservados

**T05.4 — Teste de reset**
- Clicar "Resetar banco"
- Confirmar: estado vazio, sem seeds

**T05.5 — Teste de importação com schemaVersion inválido**
- Importar arquivo JSON sem schemaVersion ou com versão errada
- Confirmar: mensagem de erro legível aparece, banco não alterado

**Gate T05:** AC-12 (fluxo completo Fisiologia/Guyton) passa manualmente

**Commit:** `chore: UAT DRD-01..UX-04 verified, fluxo Fisiologia/Guyton confirmed`

---

## Roadmap

```
HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
    ↓
HUMAN_GATE: HYPOTHESIS_DECISION (09ea0d8: preservar como base?)
    ↓
WP-DRD-01 (dif 2) — rename study_records → learning_units
    ↓
WP-DRD-02 (dif 1) — seeds vazios + subjects.active
WP-DRD-03 (dif 1) — schemaVersion (paralelo com WP-DRD-02)
    ↓
WP-DRD-04 (dif 2) — BrowserStore como test double
    ↓
WP-DRD-05 (dif 1) — UAT final
    ↓
PR + review
```

**Esforço total estimado:** ~2-3 sessões de desenvolvimento

---

## HUMAN_GATES

| Gate | Trigger | O que deve ser decidido |
|------|---------|------------------------|
| DOMAIN_REDESIGN_APPROVAL | Antes de WP-DRD-01 | Aprovação de spec.md + design.md + tasks.md |
| HYPOTHESIS_DECISION | Antes de T01.1 | Commit 09ea0d8 é base ou reverter e recomeçar? |
| SCHEMA_MIGRATION_APPROVAL | Antes de T01.1 se dados reais existem | OK para migration destructiva? |
