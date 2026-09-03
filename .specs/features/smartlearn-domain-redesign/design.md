# SmartLearn — Domain Redesign: Design (v3)

**Feature:** `smartlearn-domain-redesign`
**Status:** PROPOSTO — AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

---

## 1. Schema NOW (B-MVP final)

```sql
-- Existente, preservado sem renomear colunas
subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active   INTEGER NOT NULL DEFAULT 1,   -- preservado; não renomear para 'active'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)

-- RENOMEADA de study_records; shape final
learning_units (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id   INTEGER NOT NULL REFERENCES subjects(id),
  title        TEXT NOT NULL,               -- era: content; semântica: nome da aula/unidade
  source_text  TEXT NOT NULL DEFAULT '',    -- texto livre; JÁ EXISTE em 09ea0d8
  summary_body TEXT,                        -- Resumo Mestre; JÁ EXISTE (vNext WP-03)
  study_date   TEXT NOT NULL,              -- quando o aluno estudou; preservado como está
  created_at   TEXT NOT NULL,              -- timestamp técnico distinto; imutável
  updated_at   TEXT NOT NULL               -- automático em UPDATE
)

-- FK atualizada; campo provenance adicionado
exercises (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id       INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text   TEXT NOT NULL,
  hint_text     TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  provenance    TEXT NOT NULL DEFAULT 'MANUAL',  -- 'MANUAL' | 'SOURCE' | 'AI_GENERATED'
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
  -- SEM: score, attempt_count, last_attempted_at
  -- ATTEMPT/EVIDENCE granular = LATER (exercise_attempts)
)

-- FK atualizada; evidência agregada preservada
review_tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id         INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  review_number   INTEGER NOT NULL,
  due_date        TEXT NOT NULL,
  completed_at    TEXT,
  review_done     INTEGER NOT NULL DEFAULT 0,
  questions_done  INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER,          -- total exercícios apresentados na sessão
  correct_count   INTEGER,          -- total acertados na sessão
  score_percent   REAL,             -- correct_count / questions_count
  comment         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
  -- LEGACY_TEMPORARY: 16 tarefas pré-geradas por scheduler.js
  -- evidência: agregada por revisão (NOW); por exercício individual = LATER
)

settings (
  key             TEXT PRIMARY KEY,
  app_version     TEXT,
  review_schedule TEXT,
  last_backup_at  TEXT
)

-- REMOVIDA: sources (regression de 09ea0d8)
```

### 1.1 Decisão title × content

**Adotar `title`.**

`content` sempre representou o assunto/nome da aula, não o "conteúdo completo" do estudo. O Resumo Mestre (`summary_body`) é o conteúdo. `title` é semanticamente correto: nome curto e humano da unidade de aprendizagem.

Migration: `RENAME COLUMN content TO title` (SQLite 3.25.0+, disponível na versão usada pelo Tauri). Migration em `ensureColumns()`, idempotente.

### 1.2 study_date — por que preservar o nome

`study_date` descreve precisamente "a data em que esse conteúdo foi estudado". Renomear para `first_studied_at` só seria necessário se existir uma segunda data de estudo por unidade — o que exigiria `study_sessions`. Como `study_sessions` é LATER, o rename é schema churn sem benefício NOW.

Quando `study_sessions` for introduzido: a data em `learning_units` vira `first_studied_at` por refactor. Esse será o momento correto.

### 1.3 Exercise provenance — por que mínima

Questão extraída de livro ≠ questão gerada por IA ≠ questão elaborada manualmente.
Sem `provenance`, essa distinção se perde no banco.

`provenance TEXT NOT NULL DEFAULT 'MANUAL'` com valores enumerados `'MANUAL' | 'SOURCE' | 'AI_GENERATED'` é o mínimo que previne a confusão sem criar sistema de citações completo.

**Não adicionado:** página, número de questão, citação formal — esses detalhes entram em `hint_text` ou em sistema de citações futuro.

---

## 2. Evidência de revisão — NOW × LATER

### 2.1 NOW — agregada por sessão de revisão

`review_tasks` já contém evidência de revisão em nível de sessão:

| Campo | Semântica |
|-------|-----------|
| `questions_count` | Total de exercícios apresentados nesta revisão |
| `correct_count` | Total de exercícios acertados |
| `score_percent` | correct_count / questions_count × 100 |
| `questions_done` | Flag: exercícios foram realizados nesta revisão |

Granularidade: por sessão de revisão, não por exercício individual.

### 2.2 LATER — por exercício individual

Quando o produto precisar de rastreabilidade granular:

```sql
-- LATER — não criar agora
exercise_attempts (
  id                 INTEGER PRIMARY KEY,
  exercise_id        INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  review_task_id     INTEGER REFERENCES review_tasks(id),
  answered_correctly INTEGER,        -- 1 = acerto, 0 = erro
  assistance_used    TEXT,           -- cues, hints usados
  confidence_level   INTEGER,        -- declarado pelo aluno (1-5)
  error_classification TEXT,         -- tipo de erro (concept, recall, application)
  attempted_at       TEXT NOT NULL
)
```

Fronteira formal: `exercises` NÃO recebe campos de tentativa. `exercise_attempts` = LATER.

---

## 3. Modelo de Revisão — LEGACY_TEMPORARY

### 3.1 Status formal

16 review_tasks pré-geradas = **LEGACY_TEMPORARY**:
- Originou de DEC-003 (planilha de concurso)
- Encapsulado em `scheduler.js` (DEC-016 vNext)
- Boundary: nenhum código fora de `scheduler.js` hardcoda "16"

### 3.2 Boundary formal

**Regra:** `SCHEDULE_OFFSETS` em `scheduler.js` é o único lugar que define o número e timing das revisões.

**Verificação em WP-DRD-06:** `grep -rn "16\b" src/*.js` retorna ocorrências APENAS em `scheduler.js`. Qualquer outra ocorrência é violação.

### 3.3 Caminho LATER

`scheduler.js` é **boundary substituível**, não interface FSRS.

Uma integração futura com FSRS ou SM-2 adaptativo **pode** exigir:
- Campos adicionais em `learning_units` (`ease_factor`, `stability`, `retrievability`)
- Ou tabela separada de estado do scheduler
- Ou evolução do shape de `review_tasks`

Esses campos NÃO são desenhados agora. A boundary garante que a substituição seja localizada em `scheduler.js`; não garante zero schema change.

---

## 4. BrowserStore — Contrato de Paridade

### 4.1 Regras formais

1. BrowserStore implementa exatamente os mesmos métodos que SQLiteStore
2. Nenhum método em BrowserStore sem equivalente no SQLite (e vice-versa)
3. Shape de retorno idêntico: field names, tipos, nullable
4. `init()` NÃO chama seedNamedRows — `emptyState()` retorna arrays vazios
5. Nenhuma lógica de domínio em BrowserStore ausente no SQLite

### 4.2 Tabela de paridade (resultado da auditoria em WP-DRD-04)

| Namespace | Métodos esperados |
|-----------|------------------|
| `subjects` | getActive, getAll, create, update, deactivate, deleteCascade |
| `learningUnits` | create, getAll, getByDate, update |
| `exercises` | create, getAll, update, delete |
| `reviewTasks` | generate, getByDate, complete, getAll |
| `DB` | init, reset, exportAll, importAll |

---

## 5. schemaVersion — Comportamento Formal

```js
const SCHEMA_VERSION = 2;

// exportAll() sempre inclui:
{
  schemaVersion: SCHEMA_VERSION,
  subjects: [...],
  learningUnits: [...],
  exercises: [...],
  reviewTasks: [...]
}

// importAll() — decisão de versão:
if (!data.schemaVersion) {
  // Sem schemaVersion: rejeitar
  // Dados legados de concurso são descartáveis; não construir migração complexa
  // Tentar mapeamento simples somente se shape for idêntico (studyRecords → learningUnits, renomear campos):
  //   - se data.studyRecords existe com colunas compatíveis: importar com aviso
  //   - caso contrário: rejeitar com mensagem clara
  throw new Error("Backup sem versão de schema. Formato não suportado.");
} else if (data.schemaVersion === SCHEMA_VERSION) {
  // Import normal
} else if (data.schemaVersion > SCHEMA_VERSION) {
  throw new Error("Backup criado em versão mais recente do app. Atualize o aplicativo.");
} else {
  // schemaVersion presente mas < SCHEMA_VERSION
  throw new Error(`Backup incompatível: versão ${data.schemaVersion}, esperada ${SCHEMA_VERSION}.`);
}
```

**Princípio:** fail closed. Dados legados de concurso foram declarados descartáveis. Não construir migração complexa para preservar conteúdo sem valor. Mapeamento simples aceitável se seguro; caso contrário, rejeitar.

---

## 6. Migration Strategy

### 6.1 Banco de desenvolvimento (estado atual)

Banco pode ser recriado. Sem dados reais a proteger.

`DB.init()` detecta ausência de `learning_units` e cria do zero.
`DROP TABLE IF EXISTS sources` remove a tabela legacy.
`RENAME COLUMN content TO title` em `learning_units` após criação (ou na criação direta com nome correto).

### 6.2 Reset

```js
async reset() {
  await execute("DELETE FROM exercises");
  await execute("DELETE FROM review_tasks");
  await execute("DELETE FROM learning_units");
  await execute("DELETE FROM subjects");
  // NÃO inserir seeds
}
```

### 6.3 SCHEMA_MIGRATION_APPROVAL removido

Banco atual não tem dados reais. Se dados reais aparecerem no futuro, criar gate naquele momento. Não criar gate preventivo para cenário hipotético.

---

## 7. Decisões Formais (PROPOSED — aguardam DOMAIN_REDESIGN_APPROVAL)

| ID | Proposta |
|----|---------|
| PROP-01 | Fonte = texto livre em `learning_units.source_text`; sem tabela `sources` |
| PROP-02 | `study_date` preservado; `created_at` técnico separado; `first_studied_at` = LATER |
| PROP-03 | Estado inicial VAZIO; nenhum seed acadêmico em init ou reset |
| PROP-04 | `is_active` em subjects preservado (não renomear) |
| PROP-05 | `title` em learning_units (era `content`) |
| PROP-06 | `exercises.provenance` TEXT: 'MANUAL' | 'SOURCE' | 'AI_GENERATED'; DEFAULT 'MANUAL' |
| PROP-07 | Evidência NOW = agregada em review_tasks; per-exercise = LATER |
| PROP-08 | 16 review_tasks = LEGACY_TEMPORARY; boundary em scheduler.js; FSRS pode exigir schema change |
| PROP-09 | `schemaVersion: 2` em backup; fail-closed em qualquer versão incompatível |
| PROP-10 | Banco de dev pode ser recriado; sem SCHEMA_MIGRATION_APPROVAL neste ciclo |

**Nenhuma dessas propostas é decisão aprovada até HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL.**
