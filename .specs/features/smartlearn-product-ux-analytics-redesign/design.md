# design.md — SmartLearn Product/UX/Analytics Redesign

**Feature:** smartlearn-product-ux-analytics-redesign
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL — nenhuma implementação antes

---

## 1. Arquitetura geral

### 1.1 Camadas

```
┌──────────────────────────────────────────────────┐
│  UI (app.js + HTML/CSS)                          │
│  Telas: Hoje, Plano, Estatísticas,               │
│         Acompanhamento, Disciplinas              │
└────────────────┬─────────────────────────────────┘
                 │ chama
┌────────────────▼─────────────────────────────────┐
│  stats.js (v2)                                   │
│  analytics.js (novo)                             │
│  scheduler.js (inalterado)                       │
└────────────────┬─────────────────────────────────┘
                 │ chama
┌────────────────▼─────────────────────────────────┐
│  db.js — único ponto SQL                         │
│  DB.learningUnits, DB.exercises,                 │
│  DB.reviewTasks, DB.learningEvidence (novo),     │
│  DB.subjects                                     │
└────────────────┬─────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────┐
│  SQLite (Tauri) / BrowserStore (test double)     │
└──────────────────────────────────────────────────┘
```

### 1.2 Módulos novos e modificados

| Módulo | Tipo | Mudança |
|--------|------|---------|
| `src/db.js` | Modificar | Adicionar `DB.learningEvidence.*`, migration `schemaVersion 3`, `subject.color` |
| `src/analytics.js` | Novo | `Analytics.bySubject()`, `Analytics.byUnit()`, `Analytics.trend()` |
| `src/stats.js` | Refatorar | Ler de `learning_evidence` em vez de `review_tasks` para questões; manter carga (pendentes/vencidas) em `review_tasks` |
| `src/performance-thresholds.js` | Novo | Constantes STRONG/ADEQUATE/ATTENTION/CRITICAL; função `getState(accuracy, questions)` |
| `src/app.js` | Refatorar grande | Nova navegação, novas telas, novo ReviewRow, nova UX de evidência |
| CSS | Refatorar | Tokens de cor novos, padrões de componente, densidade |

---

## 2. Schema de banco (schemaVersion 3)

### 2.1 Tabelas preservadas (sem mudança de colunas)

```sql
-- subjects: ADICIONAR color
ALTER TABLE subjects ADD COLUMN color TEXT DEFAULT 'DISC-BLUE';

-- learning_units: inalterada
-- exercises: inalterada
-- review_tasks: inalterada (continua como agenda)
```

### 2.2 Nova tabela: `learning_evidence`

```sql
CREATE TABLE IF NOT EXISTS learning_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES learning_units(id),
  evidence_date TEXT NOT NULL,
  context TEXT NOT NULL CHECK(context IN ('INITIAL_PRACTICE','REVIEW_INTERNAL','EXTERNAL_EXERCISES')),
  questions_count INTEGER,
  correct_count INTEGER,
  score_percent REAL,
  adjusted_score_percent REAL,
  review_task_id INTEGER REFERENCES review_tasks(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

### 2.3 Migration de dados existentes

```sql
-- Popula learning_evidence a partir de review_tasks com questões registradas
INSERT INTO learning_evidence (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at)
SELECT
  rt.unit_id,
  COALESCE(rt.completed_at, rt.due_date),
  'REVIEW_INTERNAL',
  rt.questions_count,
  rt.correct_count,
  rt.score_percent,
  rt.id,
  COALESCE(rt.completed_at, rt.due_date || 'T00:00:00Z')
FROM review_tasks rt
WHERE rt.questions_done = 1
  AND rt.questions_count IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM learning_evidence le WHERE le.review_task_id = rt.id
  );
```

Migration idempotente (cláusula NOT EXISTS). Executada em `DB.init()` via `ensureColumns()`.

### 2.4 Backup schemaVersion 3

`exportAll()` retorna:
```json
{
  "schemaVersion": 3,
  "subjects": [...],
  "learningUnits": [...],
  "exercises": [...],
  "reviewTasks": [...],
  "learningEvidence": [...],
  "settings": {...}
}
```

`importAll()` rejeita fail-closed se `schemaVersion !== 3`.

**Nota:** backups `schemaVersion: 2` requerem migração assistida ou rejeição explícita com mensagem orientando re-exportação do app anterior.

---

## 3. analytics.js

### 3.1 Interface pública

```js
// Todas as funções recebem arrays já carregados (não fazem IO)
export const Analytics = {
  // Retorna array de {subject, accuracy, totalQuestions, totalCorrect,
  //                   recentAccuracy, trend, state, unitCount}
  bySubject(learningEvidence, learningUnits, subjects, today, windowDays = 30),

  // Retorna array de {unit, subject, accuracy, totalQuestions, totalCorrect,
  //                   scoresSequence, latestScore, recentAccuracy, trend, state,
  //                   lastEvidenceDate, nextReviewDate}
  byUnit(learningEvidence, learningUnits, subjects, reviewTasks, today, windowDays = 30),

  // Trend determinístico por janela de tempo
  // Retorna {direction: 'IMPROVING'|'DECLINING'|'STABLE'|'INSUFFICIENT', delta}
  trend(evidenceInWindow, evidenceBeforeWindow, minQuestions = 10),

  // Estado semântico
  // Retorna 'STRONG'|'ADEQUATE'|'ATTENTION'|'CRITICAL'|'NO_EVIDENCE'
  state(accuracy, totalQuestions),
};
```

### 3.2 Algoritmo de tendência

```js
function trend(recentEvidence, previousEvidence, minQuestions = 10) {
  const recentQ = sum(recentEvidence, 'questions_count');
  const prevQ   = sum(previousEvidence, 'questions_count');
  if (recentQ < minQuestions || prevQ < minQuestions) {
    return { direction: 'INSUFFICIENT', delta: null };
  }
  const recentAcc  = sum(recentEvidence, 'correct_count') / recentQ;
  const prevAcc    = sum(previousEvidence, 'correct_count') / prevQ;
  const delta = recentAcc - prevAcc;
  const direction =
    delta > 0.03  ? 'IMPROVING' :
    delta < -0.03 ? 'DECLINING'  :
                    'STABLE';
  return { direction, delta };
}
```

### 3.3 performance-thresholds.js

```js
export const THRESHOLDS = Object.freeze({
  STRONG:    0.80,
  ADEQUATE:  0.65,
  ATTENTION: 0.50,
});

export function getState(accuracy, totalQuestions) {
  if (!totalQuestions || totalQuestions === 0) return 'NO_EVIDENCE';
  if (accuracy >= THRESHOLDS.STRONG)    return 'STRONG';
  if (accuracy >= THRESHOLDS.ADEQUATE)  return 'ADEQUATE';
  if (accuracy >= THRESHOLDS.ATTENTION) return 'ATTENTION';
  return 'CRITICAL';
}
```

---

## 4. Arquitetura de UI

### 4.1 Estrutura de navegação

```html
<!-- Header -->
<header>
  <a href="#" id="logo">SmartLearn</a>
  <button id="settings-btn" aria-label="Configurações">⚙</button>
</header>

<!-- Nav principal -->
<nav id="main-nav">
  <button data-tab="today">Hoje</button>
  <button data-tab="plan">Plano</button>
  <button data-tab="stats">Estatísticas</button>
  <button data-tab="tracking">Acompanhamento</button>
  <button data-tab="subjects">Disciplinas</button>
</nav>

<!-- Subnav (stats) -->
<nav id="stats-subnav" hidden>
  <button data-subtab="by-subject">Disciplinas</button>
  <button data-subtab="by-unit">Conteúdos</button>
  <button data-subtab="evolution">Evolução</button>
</nav>

<!-- Conteúdo principal -->
<main id="content">
  <section id="today" hidden>...</section>
  <section id="plan" hidden>...</section>
  <section id="stats" hidden>...</section>
  <section id="tracking" hidden>...</section>
  <section id="subjects" hidden>...</section>
</main>
```

### 4.2 ReviewRow (Hoje) — anatomia HTML

```html
<div class="review-row" data-unit-id="..." data-task-id="..." data-state="pending|done|overdue">
  <div class="review-row__lead">
    <span class="subject-chip" style="--subject-color: #3B82F6">Fisiologia</span>
    <span class="review-badge">R1 • Vence hoje</span>
  </div>
  <div class="review-row__title">Débito cardíaco e regulação</div>
  <div class="review-row__meta">Guyton & Hall, cap. 1 • 02 set.</div>
  <div class="review-row__actions">
    <button class="btn-review">Revisar</button>
    <!-- ou badge "Concluída 78%" quando done -->
  </div>
  <!-- Expansão (hidden por default) -->
  <div class="review-row__detail" hidden>
    <div class="summary-block">...</div>
    <div class="exercises-block">...</div>
    <div class="evidence-block">...</div>
  </div>
</div>
```

### 4.3 Linha de unidade (Plano/Acompanhamento) — anatomia

```html
<div class="unit-row" data-unit-id="...">
  <span class="subject-chip">Fisiologia</span>
  <span class="unit-title">Débito cardíaco e regulação</span>
  <span class="unit-date">02/09</span>
  <span class="unit-summary-status" title="Resumo Mestre presente">✓</span>
  <span class="unit-exercise-count">3 ex.</span>
  <span class="unit-next-review">Próx.: 04/09</span>
  <span class="performance-badge" data-state="adequate">67% • 45q</span>
  <button class="unit-expand-btn" aria-expanded="false">↕</button>
</div>
```

### 4.4 Card KPI de disciplina (Estatísticas → Disciplinas)

```html
<div class="subject-kpi" data-state="attention">
  <div class="subject-kpi__header">
    <span class="subject-chip">Fisiologia</span>
    <span class="trend-badge" data-direction="declining">↓ CAINDO</span>
  </div>
  <div class="subject-kpi__score">58%</div>
  <div class="subject-kpi__volume">242 questões</div>
  <div class="subject-kpi__recent">Recente (30d): 52% • ↓ 6pp</div>
  <div class="subject-kpi__units">12 conteúdos avaliados</div>
</div>
```

### 4.5 Linha de conteúdo (Estatísticas → Conteúdos)

```html
<div class="unit-stat-row" data-state="declining">
  <span class="subject-chip">Fisiologia</span>
  <span class="unit-title">Potencial de Ação</span>
  <span class="sparkline" data-scores="[54,61,58,49,42]">▁▃▂▁▁</span>
  <span class="performance-badge" data-state="critical">42% • 38q</span>
  <span class="trend-badge" data-direction="declining">↓</span>
  <span class="last-evidence">12/ago</span>
</div>
```

---

## 5. Fluxo de dados por tela

### 5.1 Hoje

```js
async function renderToday() {
  const today = getLocalDateValue();
  const [reviewTasks, learningUnits, subjects, evidence] = await Promise.all([
    DB.reviewTasks.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
    DB.learningEvidence.getAll(),
  ]);
  const overdue  = reviewTasks.filter(t => !t.reviewDone && t.dueDate < today);
  const dueToday = reviewTasks.filter(t => !t.reviewDone && t.dueDate === today);
  const doneTodaytasks = reviewTasks.filter(t => t.reviewDone && completedToday(t, today));
  const tomorrow = reviewTasks.filter(t => !t.reviewDone && t.dueDate === tomorrow(today));
  // Render sections
}
```

### 5.2 Estatísticas

```js
async function renderStats() {
  const [evidence, learningUnits, subjects, reviewTasks] = await Promise.all([...]);
  const bySubject = Analytics.bySubject(evidence, learningUnits, subjects, today);
  const byUnit    = Analytics.byUnit(evidence, learningUnits, subjects, reviewTasks, today);
  // Render based on active subtab
}
```

### 5.3 Evidência ao concluir revisão

```js
async function completeReview(taskId, questionsCount, correctCount) {
  const scorePercent = questionsCount > 0 ? (correctCount / questionsCount) * 100 : null;
  await DB.reviewTasks.update(taskId, {
    reviewDone: true,
    questionsDone: questionsCount > 0,
    questionsCount,
    correctCount,
    scorePercent,
    completedAt: new Date().toISOString(),
  });
  // Insert learning_evidence
  const task = await DB.reviewTasks.get(taskId);
  await DB.learningEvidence.create({
    unitId: task.unitId,
    evidenceDate: getLocalDateValue(),
    context: 'REVIEW',
    questionsCount,
    correctCount,
    scorePercent,
    reviewTaskId: taskId,
  });
  await renderToday();
  await renderStats();
}
```

---

## 6. Compatibilidade e migração

### 6.1 Estratégia de migration em banco real

1. `DB.init()` chama `ensureColumns()` — sempre idempotente
2. `ensureColumns()` cria `learning_evidence` se não existir
3. `ensureColumns()` adiciona `subjects.color` se não existir (DEFAULT 'DISC-BLUE')
4. `ensureColumns()` roda migration de dados `review_tasks → learning_evidence` com NOT EXISTS guard
5. `SCHEMA_VERSION` sobe para 3

### 6.2 Backup schemaVersion 2

`importAll()` com `schemaVersion: 2`: rejeita com mensagem:
```
"Este backup foi exportado com schemaVersion 2 (versão anterior).
 Abra o backup no app versão 2, exporte novamente e importe aqui."
```

Não tentar converter automaticamente — fail-closed é o padrão estabelecido.

### 6.3 Testes existentes

- `test/learning-units.test.js`: sem mudança
- `test/exercises.test.js`: sem mudança
- `test/scheduler.test.js`: sem mudança
- `test/review-schedule.test.js`: sem mudança
- `test/review-score.test.js`: sem mudança
- `test/stats.test.js`: refatorar para ler de `learning_evidence`
- `test/analytics.test.js`: novo — cobre `Analytics.bySubject`, `Analytics.byUnit`, `Analytics.trend`, `getState`
- `test/learning-evidence.test.js`: novo — cobre CRUD, migration, roundtrip, schemaVersion 3

---

## 7. Decisões de design registradas

### DESIGN-001 — `learning_evidence` como camada de analytics

Escolha: Opção B (tabela separada). Ver spec.md §WP-03.

### DESIGN-002 — Tendência por janela de delta

Algoritmo: `recent(30d) - previous(30d)` com floor de 10 questões por janela.
Motivo: determinístico, auditável, sem IA preditiva nesta fase.

### DESIGN-003 — `review_tasks` como agenda, `learning_evidence` como resultado

`review_tasks.questions_count/correct_count` continua preenchido para backward compat com testes existentes.
Analytics lê exclusivamente de `learning_evidence`.

### DESIGN-004 — Cor de disciplina na tabela `subjects`

Campo `color TEXT DEFAULT 'DISC-BLUE'` em `subjects`. Paleta predefinida (7 cores) em constante JS.
Alternativa rejeitada: gerar cor por hash do nome — cores podem colidir e não são estáveis a edições de nome.

### DESIGN-005 — `schemaVersion: 3` fail-closed para schemaVersion 2

Backups v2 rejeitados. Usuário orientado a re-exportar do app v2.
Alternativa rejeitada: converter automaticamente — introduz risco de dados duplicados em `learning_evidence`.

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Migration `review_tasks → learning_evidence` duplicar dados em banco com dados reais | Média | Alto | NOT EXISTS guard + transaction + test em BrowserStore com dados legados |
| TLC_INSTALLATION_MISMATCH — validators não executaram | Alta | Médio | Validar em Tauri/SQLite real antes do merge |
| `app.js` monolítico dificultar refatoração de UI | Alta | Médio | Extrair renderização de cada tela em função isolada; sem rewrite total |
| Sparklines em HTML puro sem biblioteca | Baixa | Baixo | Implementar como SVG inline simples (5 pontos bastam para tendência visual) |
| Performance de `Analytics.byUnit` com 500+ unidades | Baixa (MVP) | Médio | Computação em memória após getAll; sem query por unidade; avaliar quando necessário |
