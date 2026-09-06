# design.md — SmartLearn UI/Analytics vNext

**Feature:** smartlearn-ui-analytics-vnext
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
│  performance-thresholds.js (novo)                │
│  scheduler.js (inalterado)                       │
└────────────────┬─────────────────────────────────┘
                 │ chama
┌────────────────▼─────────────────────────────────┐
│  db.js — único ponto SQL                         │
│  DB.learningUnits, DB.exercises,                 │
│  DB.reviewTasks, DB.learningEvidence (novo),     │
│  DB.subjects, DB.completeReviewWithEvidence()    │
└────────────────┬─────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────┐
│  SQLite (Tauri) / BrowserStore (test double)     │
└──────────────────────────────────────────────────┘
```

### 1.2 Módulos novos e modificados

| Módulo | Tipo | Mudança |
|--------|------|---------|
| `src/db.js` | Modificar | `DB.learningEvidence.*`, `DB.completeReviewWithEvidence()`, migration v2→v3, `subject.color` |
| `src/analytics.js` | Novo | `Analytics.bySubject()`, `Analytics.byUnit()`, `Analytics.subjectTrend()`, `Analytics.unitTrend()` |
| `src/stats.js` | Refatorar | Ler de `learning_evidence` para questões; manter carga (pendentes/vencidas) em `review_tasks` |
| `src/performance-thresholds.js` | Novo | Constantes STRONG/ADEQUATE/ATTENTION/CRITICAL; `getState()`; nota PERFORMANCE_BAND != MASTERY |
| `src/app.js` | Refatorar grande | Nova navegação, novas telas, novo ReviewRow, nova UX de evidência |
| CSS | Refatorar | Tokens de cor para 5 temas, padrões de componente, densidade |

---

## 2. Schema de banco (schemaVersion 3)

### 2.1 Tabelas modificadas

```sql
-- subjects: ADICIONAR color (VNEXT_DOMAIN_EXTENSION)
ALTER TABLE subjects ADD COLUMN color TEXT DEFAULT 'DISC-BLUE';

-- learning_units: inalterada
-- exercises: inalterada
-- review_tasks: inalterada (continua como agenda)
```

### 2.2 Nova tabela: `learning_evidence` (VNEXT_DOMAIN_EXTENSION)

Enum canônico de context: `INITIAL_PRACTICE`, `REVIEW`, `EXTERNAL`.
Este enum é o único válido — usar em SQL, DB API, spec, testes e exemplos sem exceção.

```sql
CREATE TABLE IF NOT EXISTS learning_evidence (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id        INTEGER NOT NULL REFERENCES learning_units(id),
  evidence_date  TEXT    NOT NULL,  -- ISO 8601 date: YYYY-MM-DD
  context        TEXT    NOT NULL CHECK(context IN ('INITIAL_PRACTICE','REVIEW','EXTERNAL')),
  questions_count INTEGER NOT NULL CHECK(questions_count > 0),
  correct_count   INTEGER NOT NULL CHECK(correct_count >= 0),
  -- score_percent: coluna de cache (correct_count / questions_count * 100).
  -- NÃO é source of truth. A camada JS sempre pode recalcular. Armazenado apenas
  -- para evitar recalcular em cada query. Se conflitar, correct_count/questions_count vence.
  score_percent   REAL,
  review_task_id  INTEGER REFERENCES review_tasks(id),
  -- review_task_id: obrigatório quando context='REVIEW'; NULL quando INITIAL_PRACTICE ou EXTERNAL.
  -- Índice único parcial garante: uma review_task → no máximo uma evidência agregada.
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_le_review_task
  ON learning_evidence(review_task_id)
  WHERE review_task_id IS NOT NULL;
```

**Validações de app em DB.learningEvidence.create() (antes do INSERT):**
- `questions_count > 0` — garantido pelo CHECK, mas validar antes para erro legível
- `correct_count >= 0 AND correct_count <= questions_count` — cross-column, validado no JS
- `context === 'REVIEW' → reviewTaskId IS NOT NULL`
- `context !== 'REVIEW' → reviewTaskId IS NULL`

### 2.3 Migration de dados existentes (v2 → schemaVersion 3)

```sql
-- Migration idempotente: popula learning_evidence a partir de review_tasks com questões
INSERT INTO learning_evidence
  (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at)
SELECT
  rt.unit_id,
  COALESCE(rt.completed_at, rt.due_date),
  'REVIEW',
  rt.questions_count,
  rt.correct_count,
  rt.score_percent,
  rt.id,
  COALESCE(rt.completed_at, rt.due_date || 'T00:00:00Z')
FROM review_tasks rt
WHERE rt.questions_done = 1
  AND rt.questions_count IS NOT NULL
  AND rt.questions_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM learning_evidence le WHERE le.review_task_id = rt.id
  );
```

Executada em `DB.init()` via `ensureColumns()` — idempotente por NOT EXISTS.

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

### 2.5 Import seguro de backup schemaVersion 2 → 3

`importAll()` com `schemaVersion: 2` **não rejeita** — executa upgrade em transação:

```js
async function importV2toV3(data) {
  // Em transação única:
  // 1. Importar subjects, learningUnits, exercises, reviewTasks
  // 2. Executar migration SQL review_tasks → learning_evidence
  // 3. Finalizar como schemaVersion 3
  await DB.execute('BEGIN TRANSACTION');
  try {
    await importCoreV2Tables(data);
    await runLearningEvidenceMigration();
    await DB.execute('COMMIT');
  } catch (e) {
    await DB.execute('ROLLBACK');
    throw e;
  }
}
```

Versão desconhecida/futura (`schemaVersion > 3` ou ausente): FAIL CLOSED com mensagem clara.

```js
if (!data.schemaVersion || data.schemaVersion > 3) {
  throw new Error('Backup incompatível. Versão não suportada: ' + data.schemaVersion);
}
```

---

## 3. analytics.js

### 3.1 Interface pública

```js
// Todas as funções recebem arrays já carregados (não fazem IO)
export const Analytics = {
  // {subject, accuracy, totalQuestions, totalCorrect, recentAccuracy, trend, state, unitCount}[]
  bySubject(learningEvidence, learningUnits, subjects, today, windowDays = 30),

  // {unit, subject, accuracy, totalQuestions, totalCorrect, scoresSequence,
  //  latestScore, recentAccuracy, trend, state, lastEvidenceDate, nextReviewDate}[]
  byUnit(learningEvidence, learningUnits, subjects, reviewTasks, today, windowDays = 30),

  // Tendência para disciplinas — delta de janelas de 30 dias
  // {direction: 'IMPROVING'|'DECLINING'|'STABLE'|'INSUFFICIENT', delta}
  subjectTrend(recentEvidence, previousEvidence, minQuestions = 10),

  // Tendência para learning units — last-N scores
  // {direction: 'IMPROVING'|'DECLINING'|'STABLE'|'INSUFFICIENT'}
  unitTrend(scoresSequence, minN = 3, threshold = 0.05),

  // Estado semântico
  // 'STRONG'|'ADEQUATE'|'ATTENTION'|'CRITICAL'|'NO_EVIDENCE'
  state(accuracy, totalQuestions),
};
```

### 3.2 Algoritmo de tendência por disciplina (delta de janelas)

```js
function subjectTrend(recentEvidence, previousEvidence, minQuestions = 10) {
  const recentQ = sum(recentEvidence, 'questions_count');
  const prevQ   = sum(previousEvidence, 'questions_count');
  if (recentQ < minQuestions || prevQ < minQuestions) {
    return { direction: 'INSUFFICIENT', delta: null };
  }
  const recentAcc = sum(recentEvidence, 'correct_count') / recentQ;
  const prevAcc   = sum(previousEvidence, 'correct_count') / prevQ;
  const delta = recentAcc - prevAcc;
  const direction =
    delta > 0.03  ? 'IMPROVING' :
    delta < -0.03 ? 'DECLINING'  :
                    'STABLE';
  return { direction, delta };
}
```

Uso: `bySubject()` divide `learningEvidence` em janelas [today-30d, today) e [today-60d, today-30d) e chama `subjectTrend`.

### 3.3 Algoritmo de tendência por conteúdo (last-N scores)

```js
function unitTrend(scoresSequence, minN = 3, threshold = 0.05) {
  if (scoresSequence.length < minN) {
    return { direction: 'INSUFFICIENT' };
  }
  const window = scoresSequence.slice(-minN);  // últimos N scores
  const delta = window[window.length - 1] - window[0];  // último - primeiro
  const direction =
    delta > threshold  ? 'IMPROVING' :
    delta < -threshold ? 'DECLINING'  :
                         'STABLE';
  return { direction };
}
```

Uso: `byUnit()` passa `scoresSequence` (score_percent em ordem cronológica) para `unitTrend`.

### 3.4 performance-thresholds.js

```js
// PERFORMANCE_BAND != MASTERY
// Os estados abaixo são heurísticas visuais de desempenho em questões.
// Não representam domínio clínico, retenção causal ou competência médica.
// Os thresholds são defaults configuráveis de apresentação, não verdade científica.
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

## 4. Boundary transacional: DB.completeReviewWithEvidence()

**DESIGN-006 — Atomicidade de update + evidence insert.**

`update review_task` e `insert learning_evidence` nunca são operações independentes no app.js.
O DB expõe um único método que executa ambos em transação.

```js
// db.js — único método que o app.js chama ao concluir uma revisão com exercícios internos
DB.completeReviewWithEvidence = async function({ taskId, questionsCount, correctCount }) {
  // Validações antes da transação
  if (questionsCount <= 0) throw new Error('questions_count deve ser > 0');
  if (correctCount < 0 || correctCount > questionsCount) {
    throw new Error('correct_count inválido');
  }
  const task = await DB.reviewTasks.get(taskId);
  if (!task) throw new Error('review_task não encontrada: ' + taskId);

  const scorePercent = (correctCount / questionsCount) * 100;
  const evidenceDate = getLocalDateValue();

  // Transação atômica
  await DB.execute('BEGIN TRANSACTION');
  try {
    await DB.execute(`
      UPDATE review_tasks
      SET review_done = 1, questions_done = 1,
          questions_count = ?, correct_count = ?, score_percent = ?,
          completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?
    `, [questionsCount, correctCount, scorePercent, taskId]);

    await DB.execute(`
      INSERT INTO learning_evidence
        (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id)
      VALUES (?, ?, 'REVIEW', ?, ?, ?, ?)
    `, [task.unitId, evidenceDate, questionsCount, correctCount, scorePercent, taskId]);

    await DB.execute('COMMIT');
  } catch (e) {
    await DB.execute('ROLLBACK');
    throw e;
  }
};
```

`app.js` chama apenas `DB.completeReviewWithEvidence()` — nunca faz update + insert separados.

Para `EXTERNAL` e `INITIAL_PRACTICE` (sem review_task_id), usar `DB.learningEvidence.create()` diretamente (sem review_task update).

---

## 5. Arquitetura de UI

### 5.1 Estrutura de navegação

```html
<header>
  <a href="#" id="logo">SmartLearn</a>
  <button id="settings-btn" aria-label="Configurações">⚙</button>
</header>

<nav id="main-nav">
  <button data-tab="today">Hoje</button>
  <button data-tab="plan">Plano</button>
  <button data-tab="stats">Estatísticas</button>
  <button data-tab="tracking">Acompanhamento</button>
  <button data-tab="subjects">Disciplinas</button>
</nav>

<nav id="stats-subnav" hidden>
  <button data-subtab="by-subject">Disciplinas</button>
  <button data-subtab="by-unit">Conteúdos</button>
  <button data-subtab="evolution">Evolução</button>
</nav>

<main id="content">
  <section id="today" hidden>...</section>
  <section id="plan" hidden>...</section>
  <section id="stats" hidden>...</section>
  <section id="tracking" hidden>...</section>
  <section id="subjects" hidden>...</section>
</main>
```

### 5.2 Fluxo de dados — Hoje

```js
async function renderToday() {
  const today = getLocalDateValue();
  const [reviewTasks, learningUnits, subjects, evidence] = await Promise.all([
    DB.reviewTasks.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
    DB.learningEvidence.getAll(),
  ]);
  // Resumo da carga (acima do fold)
  renderLoadSummary({ overdue, dueToday, doneTodayCount, tomorrowCount });
  // Seções (podem rolar)
  renderSection('Vencidas', overdue);
  renderSection('Hoje', dueToday);
  renderSection('Feitas hoje', doneToday);
  renderSection('Amanhã (preview)', tomorrowTasks);
}
```

### 5.3 Fluxo de dados — Estatísticas

```js
async function renderStats() {
  const [evidence, learningUnits, subjects, reviewTasks] = await Promise.all([...]);
  const bySubject = Analytics.bySubject(evidence, learningUnits, subjects, today);
  const byUnit    = Analytics.byUnit(evidence, learningUnits, subjects, reviewTasks, today);
  // Render based on active subtab
}
```

### 5.4 ReviewRow (Hoje) — anatomia HTML

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
  <div class="review-row__detail" hidden>
    <div class="summary-block">...</div>
    <div class="exercises-block">...</div>
    <div class="evidence-block">...</div>
  </div>
</div>
```

### 5.5 Linha de unidade (Plano/Acompanhamento)

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

### 5.6 Card KPI de disciplina (Estatísticas → Disciplinas)

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

### 5.7 Linha de conteúdo (Estatísticas → Conteúdos)

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

## 6. Compatibilidade e migração

### 6.1 Estratégia de migration em banco real

1. `DB.init()` chama `ensureColumns()` — sempre idempotente
2. `ensureColumns()` cria `learning_evidence` se não existir
3. `ensureColumns()` cria índice único parcial `ux_le_review_task` se não existir
4. `ensureColumns()` adiciona `subjects.color` se não existir (DEFAULT 'DISC-BLUE')
5. `ensureColumns()` roda migration de dados `review_tasks → learning_evidence` com NOT EXISTS guard
6. `SCHEMA_VERSION` sobe para 3

### 6.2 Testes existentes

- `test/learning-units.test.js`: sem mudança
- `test/exercises.test.js`: sem mudança
- `test/scheduler.test.js`: sem mudança
- `test/review-schedule.test.js`: sem mudança
- `test/review-score.test.js`: sem mudança
- `test/stats.test.js`: refatorar para ler de `learning_evidence`
- `test/analytics.test.js`: novo — cobre `Analytics.bySubject`, `Analytics.byUnit`, `subjectTrend`, `unitTrend`, `getState`
- `test/learning-evidence.test.js`: novo — cobre CRUD, validações, atomicidade, migration v2→v3, roundtrip schemaVersion 3

---

## 7. Decisões de design registradas

### DESIGN-001 — `learning_evidence` como camada de analytics (VNEXT_DOMAIN_EXTENSION)

Escolha: Opção B (tabela separada). Auditoria confirmou conflito semântico em review_tasks. Ver spec.md §WP-03 e CURRENT_UI_ANALYTICS_AUDIT.md.

### DESIGN-002 — Dois algoritmos explícitos de tendência

Subject trend: delta de janelas de 30 dias com floor de 10 questões.
Unit trend: comparação de endpoints nos últimos N scores (N=3 mínimo, threshold=0.05).
Motivo: determinísticos, auditáveis, sem IA preditiva. Nenhuma outra descrição de tendência é válida.

### DESIGN-003 — `review_tasks` como agenda, `learning_evidence` como resultado

`review_tasks.questions_count/correct_count` continua preenchido para backward compat com testes existentes.
Analytics lê exclusivamente de `learning_evidence`.

### DESIGN-004 — Paleta de 12 cores para disciplinas

12 cores perceptualmente distintas para suportar Medicina (múltiplas disciplinas).
Alternativa rejeitada: 7 cores insuficientes; hash de nome gera cores instáveis a edições.
Paleta: DISC-BLUE, GREEN, PURPLE, ORANGE, RED, TEAL, PINK, INDIGO, LIME, AMBER, CYAN, ROSE.

### DESIGN-005 — Import seguro de schemaVersion 2 → 3

Import v2 executa upgrade em transação (não rejeita). Versão desconhecida: FAIL CLOSED.
Alternativa rejeitada antes: "abrir no app v2 e reexportar" era instrução impossível (app v2 exportaria sempre v2).

### DESIGN-006 — Atomicidade via DB.completeReviewWithEvidence()

Update de review_task + insert de learning_evidence em transação única no DB.
app.js nunca executa as duas operações separadamente.
Motivo: analytics usa learning_evidence como source of truth; dados inconsistentes causam métricas erradas silenciosamente.

### DESIGN-007 — PERFORMANCE_BAND != MASTERY

Os estados de desempenho são heurísticas visuais configuráveis.
Documentados explicitamente em `performance-thresholds.js`.
Thresholds não são magic numbers — definidos como constantes nomeadas e potencialmente configuráveis por usuário futuro.

### DESIGN-008 — 5 temas existentes preservados

O redesign não reduz para light/dark. Todos os tokens CSS adaptados para:
Automático, Papel, Sépia, Noite, Alto contraste.
WP-F1 inclui regressão visual em todos os temas.

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Migration `review_tasks → learning_evidence` duplicar dados em banco real | Média | Alto | NOT EXISTS guard + índice único parcial + transação |
| TLC_INSTALLATION_MISMATCH — validators não executaram | Alta | Médio | WP-PREFLIGHT obrigatório antes de WP-A1 |
| `app.js` monolítico dificultar refatoração | Alta | Médio | Extrair renderização de cada tela em função isolada |
| Sparklines em HTML puro | Baixa | Baixo | SVG inline simples (5 pontos bastam) |
| Performance de `Analytics.byUnit` com 500+ unidades | Baixa (MVP) | Médio | Computação em memória após getAll; avaliar quando necessário |
| Tema Papel/Sépia com paleta navy inadequada | Média | Médio | Definir variantes de token por tema em WP-F1 |
