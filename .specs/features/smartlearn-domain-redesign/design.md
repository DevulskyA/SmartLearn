# SmartLearn — Domain Redesign: Design

**Feature:** `smartlearn-domain-redesign`
**Status:** AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

---

## 1. Alternativas de Modelo de Dados

### Alternativa A — study_records ampliado (hipótese atual, commit 09ea0d8)

`study_records` é a tabela central. Campos de conhecimento permanente (summary_body, source_text) coexistem com campo de evento (study_date). Exercises referenciam study_records.

```sql
subjects            (id, name)
study_records       (id, subject_id, source_text, study_date, content, summary_body)
exercises           (id, study_record_id, question_text, answer_text, hint_text, position)
review_tasks        (id, study_record_id, scheduled_date, completed_at, result)
```

**Vantagens:**
- Menor número de tabelas — mais simples de entender
- Commit 09ea0d8 já implementa parcialmente
- Queries de revisão diretas: `JOIN study_records`

**Desvantagens:**
- `study_date` misturado com `summary_body` — semântica ambígua
- Sem lugar natural para "sessões de revisão subsequentes" com resultado distinto
- Limita evolução: e se o aluno estudar a mesma fonte em dois momentos diferentes?
- Scheduler state (next_review, ease_factor) seria coluna em study_records — mistura ainda pior
- Testes difíceis: não é possível testar "lógica de revisão" separado de "lógica de cadastro"

---

### Alternativa B — learning_units (tabela separada, dados permanentes)

`study_records` vira `learning_units` com dados permanentes. `study_sessions` registra eventos.

```sql
subjects            (id, name)
learning_units      (id, subject_id, source_text, content, summary_body, created_at)
exercises           (id, unit_id, question_text, answer_text, hint_text, position)
study_sessions      (id, unit_id, session_date, notes)
review_tasks        (id, unit_id, scheduled_date, completed_at, result, ease_factor)
```

**Vantagens:**
- Separação clara: conhecimento permanente vs. evento
- Múltiplas sessões de revisão por unidade — natural para memória longitudinal
- `ease_factor` e scheduling state em `review_tasks` — sem poluir `learning_units`
- Testes isolados por camada

**Desvantagens:**
- Migration de `study_records → learning_units`: renomear tabela + renomear coluna `study_date → created_at`
- `study_sessions` adiciona complexidade para casos simples (registro único)
- Duas tabelas para o que hoje é uma
- UI de cadastro precisa criar `learning_unit` (não `study_record`) + `study_session` opcional

---

### Alternativa C — learning_units + sessões explícitas (máxima separação)

Igual a B, mas `study_sessions` é obrigatória e representa cada "evento de contato com o conteúdo", incluindo a sessão inicial.

```sql
subjects            (id, name)
learning_units      (id, subject_id, source_text, content, summary_body, created_at)
exercises           (id, unit_id, question_text, answer_text, hint_text, position)
study_sessions      (id, unit_id, session_date, session_type, result, notes)
                    -- session_type: 'initial' | 'review_r1' | 'review_r2' | ...
scheduler_state     (id, unit_id, next_review_date, ease_factor, interval_days, reps)
```

**Vantagens:**
- Máxima fidelidade ao modelo conceitual
- Histórico completo: cada revisão com data, tipo, resultado
- Scheduler state completamente separado da unidade de aprendizagem
- Extensível: spaced repetition algorithm state sem acoplamento

**Desvantagens:**
- Mais complexo para cadastro inicial (criar 3 registros: unit + session + scheduler_state)
- Over-engineering para o estado atual do produto
- `session_type` enum ou string — decisão de schema adicional
- Maior risco de divergência BrowserStore vs. SQLite

---

## 2. Comparação Objetiva

| Critério | A (atual) | B (units) | C (separação máxima) |
|---------|-----------|-----------|----------------------|
| Semântica clara | Ruim — mistura evento/conhecimento | Boa — separação limpa | Excelente — máxima separação |
| Complexidade de schema | Baixa — 3 tabelas | Média — 4 tabelas | Alta — 5 tabelas |
| Migration de A | — (zero) | Baixa — rename tabela/coluna | Alta — refatorar toda lógica |
| Suporte a múltiplas revisões | Fraco | Bom | Excelente |
| Scheduler state | Acoplado (coluna em study_records) | Melhor (coluna em review_tasks) | Excelente (tabela própria) |
| Risco de regressão | Baixo (base existente) | Médio (migration) | Alto (redesign completo) |
| Alinhamento com produto atual | Suficiente | Bom | Bom mas prematuro |
| Esforço de implementação | Baixo (completar 09ea0d8) | Médio | Alto |
| Testabilidade | Média | Boa | Excelente |

---

## 3. Recomendação

**Adotar Alternativa B com refatoração incremental**, mantendo compatibilidade com 09ea0d8 como ponto de partida.

**Justificativa:**
- Alternativa A tem defeito semântico real (mistura evento/conhecimento) que vai crescer com o produto
- Alternativa C é a direção correta a longo prazo, mas requer esforço 3x maior agora
- Alternativa B resolve o problema central (separação semântica) com risco controlado
- A migration A→B é mecânica: `RENAME TABLE study_records TO learning_units`, `RENAME COLUMN study_date TO created_at`, atualizar `unit_id` refs
- `study_sessions` pode ser introduzida como tabela opcional inicialmente — começar com `created_at` em `learning_units` é suficiente para o MVP

**Variante recomendada de B (B-MVP):**

Adiar `study_sessions` para quando o produto precisar de histórico explícito de revisão.

```sql
subjects            (id, name, active INTEGER DEFAULT 1)
learning_units      (id, subject_id, source_text, content, summary_body, created_at)
exercises           (id, unit_id, question_text, answer_text, hint_text, position)
review_tasks        (id, unit_id, scheduled_date, completed_at, result)
```

Diferenças de B-MVP vs. A atual:
1. Rename `study_records` → `learning_units`
2. Rename `study_date` → `created_at`
3. Rename `study_record_id` → `unit_id` (exercises, review_tasks)
4. Adicionar `active` em `subjects` para soft-delete (preserva histórico)
5. Remover seeds de medicina — estado inicial VAZIO
6. Adicionar `schemaVersion` no backup JSON

---

## 4. Arquitetura Mínima Recomendada

### 4.1 Camadas

```
index.html          — UI, event listeners, render functions
src/app.js          — orquestração: render, handlers, state local
src/db.js           — único ponto de acesso ao banco
  ├── DB (facade)   — interface pública
  ├── SQLiteStore   — implementação SQLite (Tauri runtime)
  └── BrowserStore  — implementação in-memory (test double)
test/*.test.js      — testes Node.js via BrowserStore
```

### 4.2 Contrato de domínio (DB facade)

Cada método retorna o mesmo shape em BrowserStore e SQLite:

```js
DB.subjects.getActive()       → [{id, name, active}]
DB.subjects.create(name)      → {id, name, active}
DB.subjects.deactivate(id)    → {id, name, active: 0}
DB.subjects.deleteCascade(id) → void (hard delete apenas se sem units)

DB.learningUnits.create({subjectId, sourceText, content, summaryBody}) → {id, subjectId, sourceText, content, summaryBody, createdAt}
DB.learningUnits.getAll()     → [{...}]
DB.learningUnits.update(id, {summaryBody}) → {id, ...updated}

DB.exercises.create(unitId, {questionText, answerText, hintText, position}) → {id, unitId, ...}
DB.exercises.getAll(unitId)   → [{...}]
DB.exercises.update(id, {...}) → {id, ...updated}
DB.exercises.delete(id)       → void

DB.reviewTasks.generate(unitId, createdAt) → [{id, unitId, scheduledDate}]  -- 16 tasks
DB.reviewTasks.getByDate(date)             → [{id, unitId, scheduledDate, unit: {...}}]
DB.reviewTasks.complete(id, result)        → {id, completedAt, result}

DB.exportAll()   → {schemaVersion, subjects, learningUnits, exercises, reviewTasks}
DB.importAll({}) → void  -- validates schemaVersion
DB.reset()       → void  -- VAZIO, sem seeds
DB.init()        → void
```

### 4.3 BrowserStore como test double

BrowserStore não é um banco alternativo; é um adapter in-memory que implementa o mesmo contrato de domínio que SQLiteStore. Regras:

1. BrowserStore NÃO tem lógica adicional que SQLiteStore não tem
2. Qualquer método em BrowserStore que não existe em SQLiteStore é erro de design
3. Seeds NÃO são responsabilidade de BrowserStore — `DB.init()` não injeta dados
4. Testes usam BrowserStore porque `node:test` não tem Tauri runtime; resultados são válidos porque o contrato é idêntico

### 4.4 Schema versioning

```js
const SCHEMA_VERSION = 2;

// exportAll() inclui:
{ schemaVersion: SCHEMA_VERSION, subjects: [...], learningUnits: [...], ... }

// importAll() valida:
if (backup.schemaVersion !== SCHEMA_VERSION) {
  throw new Error(`Backup incompatível: versão ${backup.schemaVersion}, esperada ${SCHEMA_VERSION}`);
}
```

Quando incrementar: ao adicionar/remover colunas, renomear tabelas, ou mudar shape de dados exportados.

---

## 5. Migration / Reset Strategy

### 5.1 Migração do banco existente (A → B-MVP)

Executada em `DB.init()` via `ensureColumns()` e renomeações idempotentes:

```sql
-- Passo 1: Renomear tabela (se ainda for study_records)
-- SQLite não tem RENAME TABLE antes de 3.26 — criar nova, copiar, drop
-- Mas: na prática, a tabela pode ser criada já com o nome correto
-- se o usuário não tem dados reais ainda (estado de hipótese)

-- Passo 2: Garantir coluna created_at (era study_date)
-- Adicionar created_at, popular de study_date, manter study_date por compatibilidade

-- Passo 3: source_text já existe (commit 09ea0d8)
-- Nenhuma ação adicional
```

**Decisão de simplificação:** se o usuário não tem dados reais em produção (estado de hipótese confirmado), o caminho mais simples é DROP + CREATE com novo schema. Requer HUMAN_GATE: SCHEMA_MIGRATION_APPROVAL.

### 5.2 Reset (estado VAZIO)

```js
async reset() {
  await execute("DELETE FROM review_tasks");
  await execute("DELETE FROM exercises");
  await execute("DELETE FROM learning_units");
  await execute("DELETE FROM subjects");
  // sem INSERT de seeds
}
```

### 5.3 Seeds (apenas para desenvolvimento)

Seeds de medicina NUNCA são inseridos automaticamente em `DB.init()` ou `DB.reset()`. Se necessário para desenvolvimento local, criar script separado: `scripts/seed-dev.js` que o desenvolvedor roda manualmente.

---

## 6. Decisões Adiadas (para HUMAN_GATE ou fase posterior)

| Decisão | Impacto | Quando resolver |
|---------|---------|-----------------|
| `study_sessions` como tabela explícita (Alternativa C) | Alto — schema change | Quando produto precisar de histórico de revisão por sessão |
| Scheduler algorithm (SM-2 ou simples) | Médio — `review_tasks` shape | Antes de WP com scheduler inteligente |
| Soft-delete vs. hard-delete para `learning_units` | Baixo — UX | Quando produto tiver "arquivo de estudos" |
| schemaVersion migration automática vs. manual | Baixo — UX importação | Antes de release com dados reais |

---

## 7. Commit 09ea0d8 — Status e Recomendação

O commit `09ea0d8` é uma hipótese implementada. Resolveu problemas reais (fonte como texto livre, draft preservation, remoção de entidade `sources`). Deve ser:

- **Preservado** como ponto de partida para B-MVP
- **Não revertido** — as mudanças em `app.js` e `index.html` estão corretas para DRD-01..03, DRD-05..06
- **Complementado** com:
  - Renomear `study_records → learning_units` e `study_date → created_at`
  - Remover seeds de medicina
  - Adicionar `active` em `subjects`
  - Adicionar `schemaVersion` em exportAll/importAll
  - Renomear `source_message` UI conforme necessário

**HUMAN_GATE: HYPOTHESIS_DECISION** — usuário confirma antes de executar qualquer renomação de tabela.
