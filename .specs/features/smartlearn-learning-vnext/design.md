# design.md — SmartLearn Learning vNext

**Feature:** smartlearn-learning-vnext
**Data:** 2026-09-02
**Revisão:** v2 (corrigido após auditoria de scheduler boundary + análise FSRS)

---

## Data Evolution Map

### CURRENT → MINIMUM NEXT → POSSIBLE LATER

```
subjects        PRESERVED                      PRESERVED
sources         PRESERVED                      PRESERVED
settings        PRESERVED                      + scheduler preferences
study_records   + summary_body TEXT NULL       (imutável para vNext)
review_tasks    + algorithm TEXT DEFAULT 'legacy' + interval_days, ease_factor (FSRS — LATER)
exercises       ABSENT → nova tabela           + per-exercise FSRS state (LATER)
```

### Regra de migração obrigatória

- Todos os campos novos são nullable ou têm DEFAULT.
- Nenhuma coluna existente é removida ou renomeada.
- O padrão `ensureColumns()` existente em db.js já resolve migrations additive sem downtime.
- **BrowserStore (createBrowserStore em db.js):** cada WP que adiciona coluna ou tabela ao schema SQLite DEVE atualizar o createBrowserStore correspondente. Divergência causa falha silenciosa no dev/browser mode. Estimativa: +20-30% de esforço por WP que toca schema.

---

## Schema vNext (MINIMUM NEXT)

### ALTER study_records

```sql
ALTER TABLE study_records ADD COLUMN summary_body TEXT;
-- NULL = sem resumo ainda (backward-compatible)
-- Sem limite de tamanho (diferente de content que tem 240 chars na UI)
```

### NOVA TABELA exercises

```sql
CREATE TABLE IF NOT EXISTS exercises (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  study_record_id INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE,
  question_text   TEXT NOT NULL,
  answer_text     TEXT NOT NULL,
  hint_text       TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exercises_study_record_id
  ON exercises(study_record_id);
```

**Nota sobre `position`:** presente para suportar reordenação futura. UI de reordenação é LATER.
Para a UI inicial, ordenar por `position ASC, id ASC` produz ordem determinística.

### ALTER review_tasks

```sql
ALTER TABLE review_tasks ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'legacy';
-- 'legacy' = comportamento atual de 16 revisões fixas
-- Futuro: 'fsrs-4' ou equivalente — requer interface diferente (ver nota abaixo)
```

---

## Módulo scheduler.js (boundary)

### O que resolve

Elimina a **duplicação ativa de REVIEW_SCHEDULE** entre dois arquivos:
- `src/db.js` linha 6-8: `const REVIEW_SCHEDULE = [1,7,15,30,...]` (privada, usada em settings)
- `src/review-schedule.js` linha 1-3: `export const REVIEW_DAY_OFFSETS = [1,7,15,30,...]`

Drift entre as duas cópias é um bug real (se uma muda, a outra não). `scheduler.js` é a fonte única.

### Interface pública (legacy)

```js
// src/scheduler.js

export const ALGORITHMS = Object.freeze({ LEGACY: 'legacy' })

// Gera as tasks de revisão para um novo estudo.
// Retorna array de { reviewNumber: number, dueDate: string (ISO-8601) }
export function generateInitialTasks(studyDate, algorithm = ALGORITHMS.LEGACY)
// - studyDate: string ISO-8601; lança Error se inválida
// - algorithm desconhecido: lança Error explícito (não produz output silenciosamente errado)
// - 'legacy': retorna 16 tasks com as mesmas datas que generateReviewDates() atual
```

### O que esta boundary NÃO faz (CRÍTICO)

**Esta interface é insuficiente para FSRS como drop-in.**

FSRS requer uma assinatura fundamentalmente diferente:

```
repeat(card: Card, now: Date) → { Again, Hard, Good, Easy } → RecordLogItem
```

onde `Card` contém: `stability: number, difficulty: number, state: State, elapsed_days: number, scheduled_days: number, reps: number, lapses: number`.

A migração para FSRS requer:
1. Campos de estado FSRS por `study_record` (stability, difficulty, etc.) — NÃO adicionados agora
2. Rating por revisão (1=Again, 2=Hard, 3=Good, 4=Easy) em `review_tasks` — NÃO adicionado agora
3. Mudança no fluxo: FSRS gera UM próximo due_date por revisão completada (não 16 upfront)
4. Novo caller em app.js: `afterReviewCompleted(cardState, rating, now) → nextDue`

Legacy data sem ratings não pode ser "repetida" em FSRS — cards fariam cold-start com defaults FSRS.
**Decisão:** cold-start é aceitável (mesmo comportamento do Anki em migrações). Coletar ratings agora
adicionaria UX (botão 1-4) sem benefício validado. Revisar quando FSRS for priorizado.

### Implementação

```js
// src/scheduler.js
import { REVIEW_DAY_OFFSETS, generateReviewDates } from './review-schedule.js';

export const ALGORITHMS = Object.freeze({ LEGACY: 'legacy' });

export function generateInitialTasks(studyDate, algorithm = ALGORITHMS.LEGACY) {
  if (algorithm !== ALGORITHMS.LEGACY) {
    throw new Error(`Unknown scheduler algorithm: "${algorithm}". ` +
      `Supported: ${Object.values(ALGORITHMS).join(', ')}`);
  }
  return generateReviewDates(studyDate).map((dueDate, i) => ({
    reviewNumber: i + 1,
    dueDate,
  }));
}
```

`review-schedule.js` permanece como implementação interna. `scheduler.js` é o único export para `app.js` e `db.js`.

---

## Análise de escala — schedule fixo vs. anos de Medicina

**Math:** 10 estudos/dia × 365 dias = 3.650 study_records/ano × 16 reviews = 58.400 review_tasks/ano.

Intervalo médio dos 16 offsets: (1+7+15+30+60+90+120+150+180+210+240+270+300+330+360+390)/16 ≈ 147 dias.

| Ano | study_records | review_tasks total | Reviews devidas/dia (steady state) |
| --- | ------------- | ------------------ | ---------------------------------- |
| 1   | ~3.650        | ~58.400            | ~397/dia |
| 3   | ~10.950       | ~175.000           | ~1.190/dia |
| 6   | ~21.900       | ~350.400           | ~2.380/dia |

**Conclusão:** O schedule fixo é insustentável após o ano 1-2. FSRS com 90% retention alvo
matura cards para intervalos longos (meses/anos), reduzindo carga diária dramaticamente.

**Para este plano:** WP-02 cria a boundary. FSRS real é LATER, mas é urgente — não pode ser adiado
indefinidamente.

**Trigger condition para priorizar FSRS:** Quando o aluno reportar consistentemente >300 revisões/dia
pendentes (indicativo de ano 1+ com uso intenso) ou quando o cronômetro diário de revisões ultrapassar
2 horas, FSRS deixa de ser LATER e deve ser priorizado. Implementar WP-07 sem esses dados resulta
em otimização prematura sem evidência de necessidade.

---

## Camada DB — novos métodos (db.js)

Seguindo o padrão existente (camelCase público, snake_case SQLite, mappers isolados):

```js
// Atualização de study_records
DB.studyRecords.update(id, { summaryBody })   // campo additive
DB.studyRecords.getByDate(dateStr)            // para Resumo Diário

// CRUD de exercícios
DB.exercises = {
  async create(studyRecordId, { questionText, answerText, hintText, position })
  async getAll(studyRecordId)                 // ordenado por position ASC, id ASC
  async update(id, fields)                    // questionText, answerText, hintText, position
  async delete(id)                            // hard delete (usuário removeu explicitamente)
}
```

### Mapper

```js
function mapExercise(row) {
  return {
    id: row.id,
    studyRecordId: row.study_record_id,
    questionText: row.question_text,
    answerText: row.answer_text,
    hintText: row.hint_text,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

### BrowserStore atualização obrigatória por WP

| WP | O que adicionar ao createBrowserStore() |
| -- | --------------------------------------- |
| WP-02 (scheduler) | Nenhuma mudança (scheduler.js é puro JS, sem DB) |
| WP-03 (Resumo Mestre) | studyRecords mock: aceitar e persistir summaryBody |
| WP-04 (Resumo Diário) | studyRecords mock: adicionar getByDate(dateStr) |
| WP-05 (Exercícios) | Adicionar exercises mock com CRUD completo |
| WP-06 (Ciclo) | Nenhuma mudança adicional (usa que já existe) |

---

## Fluxo de revisão integrado (WP-06 UI)

```
ReviewRow (Tela Hoje)
  → [abrir revisão]
      ┌─────────────────────────────────┐
      │ RESUMO MESTRE                   │
      │ (summary_body ?? content)       │
      │ [editar resumo]                 │
      ├─────────────────────────────────┤
      │ EXERCÍCIOS (se houver)          │
      │  Q1: [pergunta] — [ver resposta]│
      │  Q2: ...                        │
      ├─────────────────────────────────┤
      │ Resultado: [N] questões [N] acc  │
      │ [Marcar como feita]             │
      └─────────────────────────────────┘
```

**Regras de UI:**
- Resumo Mestre sempre exibido inteiro — nunca fragmentado.
- Exercícios omitidos se ausentes — sem seção vazia.
- "Marcar como feita" disponível sem exercícios (score é opcional).
- Editar Resumo Mestre disponível inline (sem sair da tela).

---

## Resumo Diário — implementação (WP-04)

**Opção adotada: geração no frontend, sem tabela persistente.**

Implementação mínima:
1. `DB.studyRecords.getByDate(today)` retorna registros com `study_date = today`.
2. Se resultado não vazio: exibir botão "Resumo do Dia" na Tela Hoje.
3. Ao clicar: painel mostra `summary_body ?? content` de cada registro do dia.
4. Fechar painel: sem efeitos colaterais.

---

## Backup JSON — evolução

De:
```json
{ "subjects": [], "sources": [], "studyRecords": [], "reviewTasks": [], "settings": {} }
```
Para:
```json
{ "subjects": [], "sources": [], "studyRecords": [], "reviewTasks": [], "exercises": [], "settings": {} }
```

**Compatibilidade retroativa:**
- Import sem `exercises` → `exercises = []` por padrão. Guard: `Array.isArray(data.exercises) ? data.exercises : []` (não `?? []` — falha para valores truthy não-array como `{}`).
- Import sem `summary_body` em studyRecords → `summaryBody = null`.
- `settings.app_version` evolui para `'2.0.0'` no WP-03 (primeira mudança de schema visível).

**Remapeamento de IDs no import (implementação):**
O import executa `DELETE + re-INSERT` via `buildImportStatements`. IDs de exercises no backup referenciam `study_record_id` do backup. Como o DELETE/INSERT de study_records preserva os IDs originais (INSERT usa o id da exportação), o `study_record_id` em exercises também permanece válido. Não é necessário remapeamento dinâmico — mas depende da invariante de que study_record ids são INSERTed com o id original, não gerados novos.

**PRAGMA foreign_keys:** `PRAGMA foreign_keys = ON` é executado em `DB.init()` logo após abrir o banco (db.js linha 845). ON DELETE CASCADE em exercises é efetivo. Sem este PRAGMA, o CASCADE seria ignorado silenciosamente pelo SQLite.

---

## Ordem de WPs (revisada após auditoria)

Motivo da mudança: WP-02 (scheduler) elevado de WP-05 para WP-02 — é infraestrutura pura sem
dependência de UI, e elimina o drift risk antes de qualquer mudança em app.js.

| WP | Objetivo | Dependências | Risco | Aluno vê? |
| -- | -------- | ------------ | ----- | --------- |
| WP-01 | Testes: cobertura adicional de funções puras | nenhuma | Mínimo | Não |
| WP-02 | Scheduler boundary: encapsula legacy, elimina dual definition | WP-01 | Mínimo | Não |
| WP-03 | Resumo Mestre: summary_body + UI de cadastro e edição | WP-01 | Médio | Sim |
| WP-04 | Resumo Diário: botão + painel efêmero | WP-03 | Mínimo | Sim |
| WP-05 | Exercícios: tabela + CRUD + UI | WP-03 | Médio | Sim |
| WP-06 | Ciclo integrado: revisão = resumo + exercícios + resultado | WP-03 + WP-05 | Alto | Sim |

---

## Componentes afetados por WP (revisado)

| WP | Arquivos principais | Schema |
| -- | ------------------- | ------ |
| WP-01 | `test/*.test.js` (novos) | nenhum |
| WP-02 | `src/scheduler.js` (novo), `src/db.js`, `src/review-schedule.js` | `review_tasks + algorithm` |
| WP-03 | `src/db.js`, `src/app.js`, `index.html` | `study_records + summary_body` |
| WP-04 | `src/app.js`, `index.html` | nenhum |
| WP-05 | `src/db.js`, `src/app.js`, `index.html` | nova tabela `exercises` |
| WP-06 | `src/app.js`, `index.html` | nenhum |

---

## Invariantes de design que este plano não viola

- INV-01: Resumo Mestre reduz trabalho vs. planilha (escreve uma vez, reutiliza sempre).
- INV-04: Revisões seguem sendo geradas automaticamente.
- INV-05: Aluno nunca cria revisão manualmente.
- INV-06: Registrar exercícios continua simples (nenhuma tela multi-step).
- INV-24: SQLite isolado em db.js.
- D2: Revisão não fragmenta o Resumo Mestre em micro-tarefas visíveis.
- D12: Nenhum WP aumenta significativamente a carga administrativa do aluno.

---

## Anti-overengineering checklist

| Proposta | Decisão |
| -------- | ------- |
| master_summaries como tabela separada | DEFER — summary_body em study_records é suficiente |
| knowledge graph de tópicos | NOT NOW — sem problema observável |
| FSRS real | LATER — boundary criada; biblioteca a avaliar após dados reais |
| daily_summaries em tabela | NOT NOW — view sobre dados existentes é suficiente |
| Mastery score | NOT NOW — sem threshold validado |
| Rating per review (1-4) agora | NOT NOW — cold-start aceitável; adicionar custo UX sem benefício claro |
| Motor adaptativo genérico | NOT NOW — complexidade sem benefício observável |
| Integração House | NOT NOW — D11 mantém separados |
| UI de reordenação de exercícios | LATER — position coluna existe, UI espera |
