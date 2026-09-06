# design.md — smartlearn-pre-pr-closure-hardening

**Data:** 2026-09-04

---

## T2 — SQLite duplicate rollback sensor (Rust)

Novo teste em `lib.rs` usando `execute_sqlite_transaction_at_path` com schema real (subjects, learning_units, review_tasks, learning_evidence + UNIQUE index).

Cenário:
1. Setup schema + dados (subject, unit, task)
2. Transaction 1: UPDATE review_task→8/10 + INSERT evidence→8/10 → PASS
3. Transaction 2: UPDATE review_task→5/10 + INSERT evidence duplicado (same review_task_id) → UNIQUE violation → ROLLBACK
4. Query direta: review_task.score_percent=80, evidence.score_percent=80, count=1

Sensor prova atomicidade SQLite/Rust layer. Não substitui caminho JS/WebView (coberto por UAT-T8).

---

## T3 — deleteIfEmpty

### Contrato novo

```
DB.subjects.deleteIfEmpty(id) → Promise<void>
  - se subject tem learning_units → throw Error('Não é possível excluir...')
  - se subject sem learning_units → DELETE subject
  - BrowserStore: verificar também learningEvidence (para evitar orphan data)
```

### BrowserStore (linha ~512)

Renomear `deleteCascade` → `deleteIfEmpty`. Nova lógica:
1. `const units = state.learningUnits.filter(u => u.subjectId === id)`
2. Se `units.length > 0` → throw
3. Senão → `state.subjects = state.subjects.filter(s => s.id !== id)` + writeState

BrowserStore não tem unidades órfãs (units são criadas com subjectId válido), então o check em units é suficiente.

### SQLite (linha ~1103)

Renomear `deleteCascade` → `deleteIfEmpty`. Nova lógica:
1. `SELECT COUNT(*) FROM learning_units WHERE subject_id = $1`
2. Se count > 0 → throw
3. Senão → `DELETE FROM subjects WHERE id = $1`

SQLite: ON DELETE CASCADE em exercises e review_tasks (via learning_units) não dispara se não há units. A FK em learning_evidence para review_tasks pode ter dados se subject tivesse units — mas garantindo que subjects com units são bloqueados, nunca chegaremos ao DELETE.

### Caller (app.js:2408)

- `DB.subjects.deleteCascade(subjectId)` → `DB.subjects.deleteIfEmpty(subjectId)`
- Confirm message: remover "apagará todos os estudos e revisões" (não é mais verdade)
- Nova mensagem: "Confirma a exclusão de '${name}'? Esta ação não pode ser desfeita." (mostrar apenas se subject for realmente vazia — a UI pode checar ou deixar o erro da API propagar)

Strategy: deixar o erro propagar da API para a UI; mostrar mensagem de erro amigável se deleteIfEmpty lança.

---

## T4 — Local date

### Primitiva nova

```js
function localDateIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

Uma chamada a `new Date()` → mesma instância para `completedAt` e `evidenceDate`.

### completeReviewWithEvidence (ambos adapters)

```js
const now = new Date();
const completedAt = now.toISOString();
const evidenceDate = localDateIso(now);  // local components
```

### getCompletedToday (BrowserStore)

```js
async getCompletedToday(today) {
  const state = readState();
  const taskIds = new Set(
    state.learningEvidence
      .filter(e => e.evidenceDate === today && e.context === 'REVIEW' && e.reviewTaskId != null)
      .map(e => e.reviewTaskId)
  );
  return state.reviewTasks
    .filter(t => taskIds.has(t.id))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
```

### getCompletedToday (SQLite)

```sql
SELECT rt.* FROM review_tasks rt
INNER JOIN learning_evidence le ON le.review_task_id = rt.id
WHERE le.evidence_date = $1 AND le.context = 'REVIEW'
ORDER BY rt.completed_at DESC
```

---

## T5 — Settings bootstrap binding

### Problema

```js
for (const [index, statement] of schemaStatements.entries()) {
  const params = index === schemaStatements.length - 1  // ← index 11 = CREATE TABLE _bootstrap
    ? [JSON.stringify(REVIEW_SCHEDULE)]
    : [];
  await database.execute(statement, params);
}
```

Statement em index 8 é `INSERT OR IGNORE INTO settings ... VALUES ($1)` — recebe `[]` (sem params), então `$1` fica NULL → `review_schedule = NULL` em fresh install.

### Fix

```js
const ddlStatements = schemaStatements.filter(s => !s.trimStart().toUpperCase().startsWith('INSERT'));
for (const statement of ddlStatements) {
  await database.execute(statement, []);
}
// Execute INSERT statements explicitly with their params
await database.execute(
  "INSERT OR IGNORE INTO settings (key, app_version, review_schedule) VALUES ('main', '2.0.0', $1)",
  [JSON.stringify(REVIEW_SCHEDULE)],
);
```

Alternativa mais cirúrgica: manter `schemaStatements` como está mas executar com params associados por referência, não por posição. A opção acima é mais legível e remove o coupling frágil.

---

## T7 — Tracking state audit

### Código atual (app.js:1087-1097)

```js
function getTrackingState(unitId, allTasks, today) {
  const tasks = allTasks.filter(t => t.unitId === unitId);
  if (tasks.length === 0) return "SEM_EVIDENCIA";   // ← âncora errada: tasks, não evidence
  const overdue = tasks.filter(t => !t.reviewDone && t.dueDate < today);
  if (overdue.length > 0) return "ATRASADO";
  const pending = tasks.filter(t => !t.reviewDone).sort(...);
  if (pending.length > 0) {
    const days = getDaysBetween(today, pending[0].dueDate);
    return days <= 7 ? "EM_REVISAO" : "EM_ESTUDO";
  }
  return "EM_DIA";
}
```

### Spec (spec.md AC-ACOMP-03)

```
SEM_EVIDENCIA: Nenhuma learning_evidence
EM_ESTUDO:     Tem evidência mas nenhuma review_task pendente
EM_DIA:        Tem review_task(s) pendente(s) com due_date >= hoje
ATRASADO:      Tem review_task(s) com due_date < hoje e review_done = false
EM_REVISAO:    [não definida explicitamente na tabela — mencionada nos 5 estados]
```

### Gap identificado

Spec table tem 4 estados com 4 definições. AC-ACOMP-03 menciona 5 estados. `EM_REVISAO` não aparece na tabela de condições. Código tem `EM_REVISAO` (pending ≤ 7 dias) e `EM_ESTUDO` (pending > 7 dias) — semântica diferente da spec.

Decisão: `SPEC_PRECISION_GAP: AC-ACOMP-03` — aguarda clarificação humana.

Registrar em DEBT como `DEBT-008`.
