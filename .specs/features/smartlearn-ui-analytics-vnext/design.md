# design.md â€” SmartLearn Product/UX/Analytics Redesign

**Feature:** smartlearn-ui-analytics-vnext
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL â€” nenhuma implementaÃ§Ã£o antes

---

## 1. Arquitetura geral

### 1.1 Camadas

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  UI (app.js + HTML/CSS)                          â”‚
â”‚  Telas: Hoje, Plano, EstatÃ­sticas,               â”‚
â”‚         Acompanhamento, Disciplinas              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                 â”‚ chama
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  stats.js (v2)                                   â”‚
â”‚  analytics.js (novo)                             â”‚
â”‚  scheduler.js (inalterado)                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                 â”‚ chama
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  db.js â€” Ãºnico ponto SQL                         â”‚
â”‚  DB.learningUnits, DB.exercises,                 â”‚
â”‚  DB.reviewTasks, DB.learningEvidence (novo),     â”‚
â”‚  DB.subjects                                     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                 â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  SQLite (Tauri) / BrowserStore (test double)     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 1.2 MÃ³dulos novos e modificados

| MÃ³dulo | Tipo | MudanÃ§a |
|--------|------|---------|
| `src/db.js` | Modificar | Adicionar `DB.learningEvidence.*`, migration `schemaVersion 3`, `subject.color` |
| `src/analytics.js` | Novo | `Analytics.bySubject()`, `Analytics.byUnit()`, `Analytics.trend()` |
| `src/stats.js` | Refatorar | Ler de `learning_evidence` em vez de `review_tasks` para questÃµes; manter carga (pendentes/vencidas) em `review_tasks` |
| `src/performance-thresholds.js` | Novo | Constantes STRONG/ADEQUATE/ATTENTION/CRITICAL; funÃ§Ã£o `getState(accuracy, questions)` |
| `src/app.js` | Refatorar grande | Nova navegaÃ§Ã£o, novas telas, novo ReviewRow, nova UX de evidÃªncia |
| CSS | Refatorar | Tokens de cor novos, padrÃµes de componente, densidade |

---

## 2. Schema de banco (schemaVersion 3)

### 2.1 Tabelas preservadas (sem mudanÃ§a de colunas)

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
-- Popula learning_evidence a partir de review_tasks com questÃµes registradas
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

Migration idempotente (clÃ¡usula NOT EXISTS). Executada em `DB.init()` via `ensureColumns()`.

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

**Nota:** backups `schemaVersion: 2` requerem migraÃ§Ã£o assistida ou rejeiÃ§Ã£o explÃ­cita com mensagem orientando re-exportaÃ§Ã£o do app anterior.

---

## 3. analytics.js

### 3.1 Interface pÃºblica

```js
// Todas as funÃ§Ãµes recebem arrays jÃ¡ carregados (nÃ£o fazem IO)
export const Analytics = {
  // Retorna array de {subject, accuracy, totalQuestions, totalCorrect,
  //                   recentAccuracy, trend, state, unitCount}
  bySubject(learningEvidence, learningUnits, subjects, today, windowDays = 30),

  // Retorna array de {unit, subject, accuracy, totalQuestions, totalCorrect,
  //                   scoresSequence, latestScore, recentAccuracy, trend, state,
  //                   lastEvidenceDate, nextReviewDate}
  byUnit(learningEvidence, learningUnits, subjects, reviewTasks, today, windowDays = 30),

  // Trend determinÃ­stico por janela de tempo
  // Retorna {direction: 'IMPROVING'|'DECLINING'|'STABLE'|'INSUFFICIENT', delta}
  trend(evidenceInWindow, evidenceBeforeWindow, minQuestions = 10),

  // Estado semÃ¢ntico
  // Retorna 'STRONG'|'ADEQUATE'|'ATTENTION'|'CRITICAL'|'NO_EVIDENCE'
  state(accuracy, totalQuestions),
};
```

### 3.2 Algoritmo de tendÃªncia

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

### 4.1 Estrutura de navegaÃ§Ã£o

```html
<!-- Header -->
<header>
  <a href="#" id="logo">SmartLearn</a>
  <button id="settings-btn" aria-label="ConfiguraÃ§Ãµes">âš™</button>
</header>

<!-- Nav principal -->
<nav id="main-nav">
  <button data-tab="today">Hoje</button>
  <button data-tab="plan">Plano</button>
  <button data-tab="stats">EstatÃ­sticas</button>
  <button data-tab="tracking">Acompanhamento</button>
  <button data-tab="subjects">Disciplinas</button>
</nav>

<!-- Subnav (stats) -->
<nav id="stats-subnav" hidden>
  <button data-subtab="by-subject">Disciplinas</button>
  <button data-subtab="by-unit">ConteÃºdos</button>
  <button data-subtab="evolution">EvoluÃ§Ã£o</button>
</nav>

<!-- ConteÃºdo principal -->
<main id="content">
  <section id="today" hidden>...</section>
  <section id="plan" hidden>...</section>
  <section id="stats" hidden>...</section>
  <section id="tracking" hidden>...</section>
  <section id="subjects" hidden>...</section>
</main>
```

### 4.2 ReviewRow (Hoje) â€” anatomia HTML

```html
<div class="review-row" data-unit-id="..." data-task-id="..." data-state="pending|done|overdue">
  <div class="review-row__lead">
    <span class="subject-chip" style="--subject-color: #3B82F6">Fisiologia</span>
    <span class="review-badge">R1 â€¢ Vence hoje</span>
  </div>
  <div class="review-row__title">DÃ©bito cardÃ­aco e regulaÃ§Ã£o</div>
  <div class="review-row__meta">Guyton & Hall, cap. 1 â€¢ 02 set.</div>
  <div class="review-row__actions">
    <button class="btn-review">Revisar</button>
    <!-- ou badge "ConcluÃ­da 78%" quando done -->
  </div>
  <!-- ExpansÃ£o (hidden por default) -->
  <div class="review-row__detail" hidden>
    <div class="summary-block">...</div>
    <div class="exercises-block">...</div>
    <div class="evidence-block">...</div>
  </div>
</div>
```

### 4.3 Linha de unidade (Plano/Acompanhamento) â€” anatomia

```html
<div class="unit-row" data-unit-id="...">
  <span class="subject-chip">Fisiologia</span>
  <span class="unit-title">DÃ©bito cardÃ­aco e regulaÃ§Ã£o</span>
  <span class="unit-date">02/09</span>
  <span class="unit-summary-status" title="Resumo Mestre presente">âœ“</span>
  <span class="unit-exercise-count">3 ex.</span>
  <span class="unit-next-review">PrÃ³x.: 04/09</span>
  <span class="performance-badge" data-state="adequate">67% â€¢ 45q</span>
  <button class="unit-expand-btn" aria-expanded="false">â†•</button>
</div>
```

### 4.4 Card KPI de disciplina (EstatÃ­sticas â†’ Disciplinas)

```html
<div class="subject-kpi" data-state="attention">
  <div class="subject-kpi__header">
    <span class="subject-chip">Fisiologia</span>
    <span class="trend-badge" data-direction="declining">â†“ CAINDO</span>
  </div>
  <div class="subject-kpi__score">58%</div>
  <div class="subject-kpi__volume">242 questÃµes</div>
  <div class="subject-kpi__recent">Recente (30d): 52% â€¢ â†“ 6pp</div>
  <div class="subject-kpi__units">12 conteÃºdos avaliados</div>
</div>
```

### 4.5 Linha de conteÃºdo (EstatÃ­sticas â†’ ConteÃºdos)

```html
<div class="unit-stat-row" data-state="declining">
  <span class="subject-chip">Fisiologia</span>
  <span class="unit-title">Potencial de AÃ§Ã£o</span>
  <span class="sparkline" data-scores="[54,61,58,49,42]">â–â–ƒâ–‚â–â–</span>
  <span class="performance-badge" data-state="critical">42% â€¢ 38q</span>
  <span class="trend-badge" data-direction="declining">â†“</span>
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

### 5.2 EstatÃ­sticas

```js
async function renderStats() {
  const [evidence, learningUnits, subjects, reviewTasks] = await Promise.all([...]);
  const bySubject = Analytics.bySubject(evidence, learningUnits, subjects, today);
  const byUnit    = Analytics.byUnit(evidence, learningUnits, subjects, reviewTasks, today);
  // Render based on active subtab
}
```

### 5.3 EvidÃªncia ao concluir revisÃ£o

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

## 6. Compatibilidade e migraÃ§Ã£o

### 6.1 EstratÃ©gia de migration em banco real

1. `DB.init()` chama `ensureColumns()` â€” sempre idempotente
2. `ensureColumns()` cria `learning_evidence` se nÃ£o existir
3. `ensureColumns()` adiciona `subjects.color` se nÃ£o existir (DEFAULT 'DISC-BLUE')
4. `ensureColumns()` roda migration de dados `review_tasks â†’ learning_evidence` com NOT EXISTS guard
5. `SCHEMA_VERSION` sobe para 3

### 6.2 Backup schemaVersion 2

`importAll()` com `schemaVersion: 2`: rejeita com mensagem:
```
"Este backup foi exportado com schemaVersion 2 (versÃ£o anterior).
 Abra o backup no app versÃ£o 2, exporte novamente e importe aqui."
```

NÃ£o tentar converter automaticamente â€” fail-closed Ã© o padrÃ£o estabelecido.

### 6.3 Testes existentes

- `test/learning-units.test.js`: sem mudanÃ§a
- `test/exercises.test.js`: sem mudanÃ§a
- `test/scheduler.test.js`: sem mudanÃ§a
- `test/review-schedule.test.js`: sem mudanÃ§a
- `test/review-score.test.js`: sem mudanÃ§a
- `test/stats.test.js`: refatorar para ler de `learning_evidence`
- `test/analytics.test.js`: novo â€” cobre `Analytics.bySubject`, `Analytics.byUnit`, `Analytics.trend`, `getState`
- `test/learning-evidence.test.js`: novo â€” cobre CRUD, migration, roundtrip, schemaVersion 3

---

## 7. DecisÃµes de design registradas

### DESIGN-001 â€” `learning_evidence` como camada de analytics

Escolha: OpÃ§Ã£o B (tabela separada). Ver spec.md Â§WP-03.

### DESIGN-002 â€” TendÃªncia por janela de delta

Algoritmo: `recent(30d) - previous(30d)` com floor de 10 questÃµes por janela.
Motivo: determinÃ­stico, auditÃ¡vel, sem IA preditiva nesta fase.

### DESIGN-003 â€” `review_tasks` como agenda, `learning_evidence` como resultado

`review_tasks.questions_count/correct_count` continua preenchido para backward compat com testes existentes.
Analytics lÃª exclusivamente de `learning_evidence`.

### DESIGN-004 â€” Cor de disciplina na tabela `subjects`

Campo `color TEXT DEFAULT 'DISC-BLUE'` em `subjects`. Paleta predefinida (7 cores) em constante JS.
Alternativa rejeitada: gerar cor por hash do nome â€” cores podem colidir e nÃ£o sÃ£o estÃ¡veis a ediÃ§Ãµes de nome.

### DESIGN-005 â€” `schemaVersion: 3` fail-closed para schemaVersion 2

Backups v2 rejeitados. UsuÃ¡rio orientado a re-exportar do app v2.
Alternativa rejeitada: converter automaticamente â€” introduz risco de dados duplicados em `learning_evidence`.

---

## 8. Riscos e mitigaÃ§Ãµes

| Risco | Probabilidade | Impacto | MitigaÃ§Ã£o |
|-------|--------------|---------|-----------|
| Migration `review_tasks â†’ learning_evidence` duplicar dados em banco com dados reais | MÃ©dia | Alto | NOT EXISTS guard + transaction + test em BrowserStore com dados legados |
| TLC_INSTALLATION_MISMATCH â€” validators nÃ£o executaram | Alta | MÃ©dio | Validar em Tauri/SQLite real antes do merge |
| `app.js` monolÃ­tico dificultar refatoraÃ§Ã£o de UI | Alta | MÃ©dio | Extrair renderizaÃ§Ã£o de cada tela em funÃ§Ã£o isolada; sem rewrite total |
| Sparklines em HTML puro sem biblioteca | Baixa | Baixo | Implementar como SVG inline simples (5 pontos bastam para tendÃªncia visual) |
| Performance de `Analytics.byUnit` com 500+ unidades | Baixa (MVP) | MÃ©dio | ComputaÃ§Ã£o em memÃ³ria apÃ³s getAll; sem query por unidade; avaliar quando necessÃ¡rio |
