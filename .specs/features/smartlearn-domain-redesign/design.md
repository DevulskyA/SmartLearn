# SmartLearn — Domain Redesign: Design (v2)

**Feature:** `smartlearn-domain-redesign`
**Status:** PROPOSTO — AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

---

## 1. Schema Mínimo NOW (B-MVP)

```sql
-- Existente, preservado
subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active   INTEGER NOT NULL DEFAULT 1,   -- PRESERVADO: não renomear para 'active'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)

-- RENOMEADA de study_records; source_text JÁ existe (commit 09ea0d8)
learning_units (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id       INTEGER NOT NULL REFERENCES subjects(id),
  title            TEXT NOT NULL,                       -- era: content
  source_text      TEXT NOT NULL DEFAULT '',            -- JÁ EXISTE em 09ea0d8
  summary_body     TEXT,                               -- JÁ EXISTE (vNext WP-03)
  first_studied_at TEXT NOT NULL,                      -- era: study_date (semântica preservada)
  created_at       TEXT NOT NULL,                      -- timestamp técnico distinto
  updated_at       TEXT NOT NULL
)

-- FK atualizada de study_record_id para unit_id
exercises (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id       INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text   TEXT NOT NULL,
  hint_text     TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
  -- SEM: score, attempt_count, last_attempted_at
  -- ATTEMPT/EVIDENCE = LATER (tabela exercise_attempts separada)
)

-- FK atualizada de study_record_id para unit_id
review_tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id         INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  review_number   INTEGER NOT NULL,
  due_date        TEXT NOT NULL,
  completed_at    TEXT,
  review_done     INTEGER NOT NULL DEFAULT 0,
  questions_done  INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER,
  correct_count   INTEGER,
  score_percent   REAL,
  comment         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
  -- LEGACY_TEMPORARY: 16 tarefas pré-geradas por scheduler.js
)

settings (
  key             TEXT PRIMARY KEY,
  app_version     TEXT,
  review_schedule TEXT,
  last_backup_at  TEXT
)

-- REMOVIDA: sources (não existe mais; regression de 09ea0d8)
-- REMOVIDA: índices em study_record_id → recriados em unit_id
```

### 1.1 Por que `title` em vez de `content`

O campo `content` (string curta, 240 chars) sempre foi o tema/assunto da aula. `title` é o nome semântico correto para o que está vinculado a um Resumo Mestre. Se a renomagem criar migration desnecessária (e o campo já funciona), manter `content` é aceitável. **Decisão:** preservar `content` se o custo de migration superar o benefício semântico — reportar na implementação.

### 1.2 Distinção de datas — regra formal

| Campo | Quem define | Quando define | Quem pode editar |
|-------|-------------|---------------|-----------------|
| `first_studied_at` | Aluno | No momento do cadastro; default = hoje | Aluno (pode ser retroativo) |
| `created_at` | Sistema | Timestamp de INSERT | Nunca (imutável) |
| `updated_at` | Sistema | Timestamp de UPDATE | Nunca (automático) |

Exemplo: aluno estudou em 10/03, cadastrou em 12/03.
- `first_studied_at` = 2026-03-10 (editado pelo aluno)
- `created_at` = 2026-03-12T14:30:00Z (sistema)

---

## 2. Comparação de Alternativas (atualizada)

### Alternativa A — study_records ampliado (commit 09ea0d8 base)

Schema: `study_records` central, `source_text` já existe, `study_date` preservado.

**Problema crítico identificado:** `study_date` não distingue semanticamente de `created_at` no nome — ambíguo para quem lê o código. Além disso, `sources` table permanece no schema sem uso (regression).

**Não adotado:** semântica incompleta; regression não corrigida.

### Alternativa B-MVP (RECOMENDADA)

Rename `study_records → learning_units`, `study_date → first_studied_at`. Remover `sources`. Sem `study_sessions`. `is_active` preservado.

**Adotado:** separa semântica de evento (quando o aluno estudou) de timestamp técnico (quando criou o registro), sem overhead de tabela adicional.

### Alternativa C — learning_units + study_sessions

`study_sessions` como tabela obrigatória para cada evento de contato com o conteúdo.

**Adiado para LATER:** over-engineering para o estado atual. A separação formal de `first_studied_at` × `created_at` resolve o problema imediato sem nova tabela.

---

## 3. Modelo de Revisão — LEGACY_TEMPORARY

### 3.1 Status formal

O modelo atual de 16 revisões pré-geradas é classificado como **LEGACY_TEMPORARY**:
- Originou-se da planilha de concurso (DEC-003)
- Scheduler encapsulado em `scheduler.js` (DEC-016 vNext)
- PRESERVE por enquanto: boundary existe, algoritmo é substituível sem schema change
- NÃO é modelo definitivo; escala para ~1.190 revisões/dia no ano 3 de medicina (risco identificado em DEC-016)

### 3.2 Boundary formal

**Regra:** nenhum código fora de `scheduler.js` deve codificar o número 16 ou assumir que `review_tasks` terá exatamente 16 registros por unidade.

**Verificação:** `grep -r "16" src/` — ocorrência legítima APENAS em `scheduler.js`. Qualquer outra ocorrência é violação de boundary.

### 3.3 Caminho para NEXT

```
LEGACY_TEMPORARY (now)
    ↓ LATER — quando produto precisar
FSRS / scheduler adaptativo
    learning_units → scheduler_state (ease_factor, interval, reps)
    scheduler.js swaps algorithm without schema change in review_tasks
```

---

## 4. Exercícios — Fronteira DEFINITION × ATTEMPT

### 4.1 Estado atual (correto acidentalmente)

Schema `exercises` JÁ é definition-only:
- `question_text`, `answer_text`, `hint_text`, `position`
- SEM: score, tentativa, data de acerto, histórico

Score atual existe em `review_tasks.correct_count` como **agregado por sessão de revisão**, não por exercício individual.

### 4.2 Fronteira formal (NOW)

**Regra:** `exercises` NÃO recebe campos de tentativa, score por exercício, ou histórico de acertos individuais.

**Se precisar rastrear:** criar tabela `exercise_attempts (id, exercise_id, review_task_id, answered_correctly, attempted_at)` — LATER.

**Violação de fronteira** = qualquer ALTER TABLE exercises ADD score* ou ADD attempt*.

### 4.3 Como o score agrega TODAY

```
review_task.correct_count  = total de exercícios acertados na sessão
review_task.questions_count = total de exercícios apresentados na sessão
review_task.score_percent  = correct_count / questions_count
```

Granularidade por exercício = LATER.

---

## 5. schemaVersion — Comportamento Formal

```js
const SCHEMA_VERSION = 2;

// exportAll() sempre inclui:
{
  schemaVersion: SCHEMA_VERSION,
  subjects: [...],
  learningUnits: [...],       // era studyRecords
  exercises: [...],
  reviewTasks: [...]
}

// importAll() — lógica de versão:
if (!backup.schemaVersion) {
  // Backup legado (v1, schemaVersion ausente)
  // Tentar compatibilidade: se backup.studyRecords existe, mapear → learningUnits
  // Se mapeamento possível: import com aviso "Backup legado importado com conversão automática"
  // Se não possível (forma incompatível): lançar Error("Backup antigo incompatível...")
} else if (backup.schemaVersion === SCHEMA_VERSION) {
  // Normal import
} else if (backup.schemaVersion > SCHEMA_VERSION) {
  // Backup de versão futura — FAIL CLOSED
  throw new Error("Backup criado em versão mais recente do app. Atualize o aplicativo antes de importar.");
} else {
  // schemaVersion < SCHEMA_VERSION e não-ausente (v0?)
  // Tentar conversão ou fail closed com mensagem
  throw new Error("Backup incompatível: versão " + backup.schemaVersion + ", esperada " + SCHEMA_VERSION);
}
```

**Princípio:** fail closed sempre que importação não for segura. Mensagem de erro clara para cada caso.

---

## 6. BrowserStore — Contrato de Paridade

### 6.1 Regras

1. BrowserStore implementa exatamente os mesmos métodos que SQLiteStore
2. Nenhum método em BrowserStore sem equivalente no SQLite (e vice-versa)
3. Shape de retorno idêntico: mesmo field names, tipos, nullable
4. BrowserStore NÃO injeta seeds em `init()` — `emptyState()` retorna arrays vazios
5. BrowserStore NÃO tem lógica de negócio ausente no SQLite

### 6.2 Checagem de paridade (WP-DRD-04)

| Método | BrowserStore | SQLiteStore |
|--------|-------------|------------|
| `subjects.getActive()` | ✓ | ✓ |
| `subjects.create(name)` | ✓ | ✓ |
| `subjects.update(id, fields)` | ✓ | ✓ |
| `subjects.deactivate(id)` | ✓ (via update) | ✓ |
| `subjects.deleteCascade(id)` | ✓ | ✓ |
| `learningUnits.create({...})` | a implementar | a implementar |
| `learningUnits.getAll()` | a implementar | a implementar |
| `learningUnits.update(id, fields)` | a implementar | a implementar |
| `exercises.*` | ✓ (com rename unit_id) | ✓ (com rename unit_id) |
| `reviewTasks.*` | ✓ (com rename unit_id) | ✓ (com rename unit_id) |
| `exportAll()` | ✓ (com schemaVersion + learningUnits) | ✓ |
| `importAll(backup)` | ✓ (com validação schemaVersion) | ✓ |
| `reset()` | ✓ (sem seeds) | ✓ (sem seeds) |

### 6.3 Contrato de tipos (JSDoc nas funções mapXxx)

```js
/** @typedef {{id: number, subjectId: number, title: string, sourceText: string, summaryBody: string|null, firstStudiedAt: string, createdAt: string, updatedAt: string}} LearningUnit */
/** @typedef {{id: number, unitId: number, questionText: string, answerText: string, hintText: string|null, position: number, createdAt: string, updatedAt: string}} Exercise */
```

---

## 7. Commit 09ea0d8 — Análise Técnica (não gate humano)

Após DOMAIN_REDESIGN_APPROVAL, o agente compara 09ea0d8 com o design aprovado:

| Item em 09ea0d8 | Decisão técnica |
|-----------------|-----------------|
| `source_text` em study_records | PRESERVAR — correto |
| UI de fonte como input livre | PRESERVAR — correto |
| Draft preservation | PRESERVAR — correto |
| Seeds de medicina em BrowserStore.init() | CORRIGIR — remover seeds |
| `sources` table em schemaStatements | CORRIGIR — remover CREATE TABLE |
| `study_date` como nome da coluna | CORRIGIR → `first_studied_at` |
| `study_record_id` como FK em exercises/review_tasks | CORRIGIR → `unit_id` |
| Tabela nomeada `study_records` | CORRIGIR → `learning_units` |

Nenhum item da lista acima é decisão de produto — todos são decisões técnicas deriváveis do design.

---

## 8. Migration Strategy

### 8.1 Se o banco local NÃO tem dados reais (hipótese, estado atual)

Caminho simples: DROP + CREATE com novo schema. `DB.init()` detecta tabela ausente e cria do zero.

### 8.2 Se o banco local TEM dados reais

Migration aditiva via `ensureColumns()`:
```sql
-- Adicionar first_studied_at se não existe (DEFAULT = valor de study_date)
ALTER TABLE study_records ADD COLUMN first_studied_at TEXT;
UPDATE study_records SET first_studied_at = study_date WHERE first_studied_at IS NULL;
-- Criar learning_units como alias via VIEW temporariamente?
-- Ou: INSERT INTO learning_units SELECT id, subject_id, content, source_text, summary_body, study_date, created_at, updated_at FROM study_records;
```

SCHEMA_MIGRATION_APPROVAL required antes de migration com dados reais.

### 8.3 Estado VAZIO após reset

```js
async reset() {
  // DELETE em ordem de FK: exercises antes de learning_units antes de subjects
  await execute("DELETE FROM exercises");
  await execute("DELETE FROM review_tasks");
  await execute("DELETE FROM learning_units");
  await execute("DELETE FROM subjects");
  // sem INSERT de seeds
}
```

---

## 9. Decisões Formais (PROPOSED — aguardando DOMAIN_REDESIGN_APPROVAL)

| Decisão | Conteúdo | Status |
|---------|---------|--------|
| PROP-01 | Fonte é texto livre em `learning_units.source_text`; sem tabela `sources` | PROPOSED |
| PROP-02 | `study_date` → `first_studied_at`; `created_at` técnico preservado separado | PROPOSED |
| PROP-03 | Estado inicial VAZIO; nenhum seed acadêmico | PROPOSED |
| PROP-04 | `is_active` em subjects (nome preservado, não renomear) | PROPOSED |
| PROP-05 | `exercises` = DEFINITION-only; fronteira formal DEFINITION × ATTEMPT | PROPOSED |
| PROP-06 | 16 review_tasks = LEGACY_TEMPORARY; boundary em scheduler.js | PROPOSED |
| PROP-07 | `schemaVersion: 2` em backup; fail-closed em versão incompatível | PROPOSED |

**Nenhuma dessas decisões está registrada como aprovada em STATE.md até aprovação do HUMAN_GATE.**
