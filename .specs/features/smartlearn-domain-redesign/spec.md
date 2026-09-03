# SmartLearn — Domain Redesign Specification (v3)

**Feature:** `smartlearn-domain-redesign`
**Status:** PROPOSTO — AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03

---

## 1. Diagnóstico Estrutural

### 1.1 O que o teste real revelou

| Sintoma | Causa raiz |
|---------|------------|
| Fonte como combobox obrigatório | INV-05B exigia `sources` com `source_id`; fonte é livre, varia por capítulo |
| Seeds de concurso / medicina injetados automaticamente | DEC-013 seeds concurso; 09ea0d8 substituiu por medicina sem aprovação — ambos errados |
| Tabela `sources` ainda criada no schema após remoção de uso | Regression de 09ea0d8 |
| BrowserStore `init()` semeia medicina automaticamente | Lógica de seed acoplada ao init; estado inicial deve ser VAZIO |
| `exercises` sem provenance de origem | Questão de fonte ≠ questão gerada por IA ≠ questão manual — distinção ausente |
| 16 review_tasks pré-geradas sem classificação formal | LEGACY da planilha; sem boundary explícita |

### 1.2 O que está CORRETO em 09ea0d8 (preservar)

- `study_records.source_text` substituindo `source_id` — correto
- Remoção de UI de gerenciamento de fontes — correto
- Draft preservation ao adicionar disciplina — correto
- 37 testes passando — base válida
- `study_date` e `created_at` existem separados — semântica correta, preservar AMBOS

### 1.3 O que está INCORRETO em 09ea0d8 (corrigir)

- Seeds de medicina em BrowserStore.init() — remover
- Tabela `sources` ainda no schema — remover
- `content` como nome do campo de aula/tema — renomear para `title`
- Ausência de provenance em exercises — adicionar `provenance`

### 1.4 Decisões históricas — classificação

| Decisão | Status |
|---------|--------|
| DEC-013 — Fonte como entidade + seeds concurso | SUPERSEDED_FOR_VNEXT |
| INV-05B — "Fonte é entidade reutilizável" | SUPERSEDED_FOR_VNEXT |
| DEC-015 — Reset re-aplica seeds padrão | REINTERPRETED: estado VAZIO, sem seeds acadêmicos |
| DEC-012 — Exclusão destrutiva em cascata de subjects | REINTERPRETED: hard delete só se sem learning_units; caminho normal é is_active = 0 |
| DEC-003 — 16 revisões fixas por estudo | LEGACY_TEMPORARY: scheduler.js boundary; não é modelo definitivo |
| DEC-016 — vNext Resumo Mestre + Exercícios | PRESERVED; exercícios DEFINITION-only já implementados |
| INV-05A — Disciplina é entidade reutilizável | PRESERVED |
| DEC-001, DEC-005, DEC-009, DEC-011 | PRESERVED — stack, SQLite, Tauri, contrato db.js |

---

## 2. Modelo Conceitual Final

```
DISCIPLINA (subjects)
    entidade reutilizável, estável
    is_active para soft-delete (campo existente — não renomear)
    hard delete apenas se sem learning_units vinculadas
    ↓ tem muitas
UNIDADE DE APRENDIZAGEM (learning_units)
    ├── title            — nome humano da aula/unidade
    ├── source_text      — texto livre descritivo da origem
    ├── summary_body     — Resumo Mestre permanente
    ├── study_date       — data da aula/estudo (campo semântico, editável)
    ├── created_at       — timestamp técnico de INSERT (imutável)
    └── updated_at       — timestamp técnico de UPDATE (automático)
    ↓ tem muitos
EXERCÍCIOS — DEFINIÇÃO + PROVENANCE (exercises)
    ├── question_text, answer_text, hint_text, position
    └── provenance: MANUAL | SOURCE | AI_GENERATED
        (não rastrear attempt/score por exercício — LATER)
    ↓ revisado em
REVISÕES (review_tasks) — LEGACY_TEMPORARY
    16 tarefas pré-geradas por unidade
    evidência agregada por revisão: questions_count, correct_count, score_percent
    scheduler.js é boundary substituível
    FSRS ou scheduler adaptativo = LATER (pode exigir evolução de schema)
```

### 2.1 Separação de datas — regra formal

| Campo | Semântica | Quem define | Editável? |
|-------|-----------|-------------|-----------|
| `study_date` | Quando o aluno estudou o conteúdo | Aluno no cadastro (default=hoje) | Sim — retroativo |
| `created_at` | Timestamp técnico de INSERT | Sistema | Nunca |
| `updated_at` | Timestamp técnico de UPDATE | Sistema automático | Nunca |

Esses três campos têm semântica distinta. NUNCA mesclar ou renomear um como outro. `study_sessions` e eventual `first_studied_at` permanecem LATER.

### 2.2 Fronteira DEFINITION + PROVENANCE × ATTEMPT

| Conceito | Schema NOW | LATER |
|---------|-----------|-------|
| Enunciado/Resposta/Dica | `exercises.*` | — |
| Provenance da questão | `exercises.provenance` | — |
| Evidência agregada da revisão | `review_tasks.correct_count / score_percent` | — |
| Histórico por exercício | NÃO existe | `exercise_attempts` |
| Assist/cues/confidence | NÃO existe | Em `exercise_attempts` |
| Classificação de erro | NÃO existe | LATER |
| Transfer evidence | NÃO existe | LATER |

### 2.3 Evidência de revisão — NOW × LATER

**NOW — evidência agregada por revisão (review_tasks):**
- `questions_count`: total de exercícios apresentados na sessão
- `correct_count`: total acertados
- `score_percent`: correct_count / questions_count
- `questions_done`: flag de conclusão de exercícios na revisão

**LATER — evidência por exercício (exercise_attempts):**
- qual exercício foi acertado/errado em cada revisão
- assistance e cues utilizados
- nível de confiança declarado
- classificação do tipo de erro
- transfer evidence (acerto em contexto diferente)

### 2.4 Revisão — LEGACY_TEMPORARY × futuro

**NOW:**
16 review_tasks pré-geradas por unidade = LEGACY_TEMPORARY.
`scheduler.js` é boundary formal: toda lógica de schedule encapsulada ali.
Boundary garantia: nenhum código fora de `scheduler.js` hardcoda "16" ou assume contagem de revisões.

**LATER:**
`scheduler.js` é substituível por algoritmo inteligente (SM-2, FSRS, ou outro).
Uma integração FSRS **pode** exigir evolução aditiva de dados/schema (ex.: `ease_factor`, `interval_days`, `reps` por unidade).
Não projetar esses campos agora. Não reinventar FSRS agora.

### 2.5 O que NÃO muda

- Disciplina: entidade reutilizável com select — INV-05A
- `is_active` em subjects: nome preservado (sem rename para `active`)
- SQLite + db.js único ponto SQL — DEC-011
- Revisões geradas automaticamente — INV-04 (LEGACY_TEMPORARY)
- Sem login, sem backend — DEC-005, INV-16..18

---

## 3. UX Alvo

### 3.1 Fluxo de cadastro

```
1. Disciplina     → select (entidade reutilizável, is_active)
                    + "+ Nova disciplina" sem apagar nenhum campo do draft
2. Aula / título  → input texto curto (campo title)
                    ex: "Organização funcional do corpo humano e homeostase"
3. Fonte          → input texto livre
                    ex: "Guyton & Hall, Tratado de Fisiologia Médica, 11ª ed., cap. 1"
4. Data da aula   → date input, default = hoje (editável retroativamente)
5. Resumo Mestre  → textarea sem limite artificial de caracteres
6. Salvar         → cria learning_unit + gera review_tasks (LEGACY schedule)
```

**Princípio:** campo existe porque o ALUNO precisa, não porque o schema precisa.

### 3.2 O que NÃO existe no fluxo principal

- Gerenciamento de fontes (nenhum CRUD de fontes)
- Seleção de fonte de lista pré-cadastrada
- Qualquer ação auxiliar que apague o draft atual

### 3.3 Empty state

Primeiro uso (banco vazio): mensagem amigável.
```
"Nenhuma disciplina ainda. Comece adicionando a primeira."
```
Sem seeds pré-injetados. O aluno cadastra "Fisiologia" como primeiro ato.

---

## 4. Acceptance Criteria

### DRD — Domain Redesign

| ID | Critério |
|----|---------|
| DRD-01 | Fonte é campo texto livre; aluno digita sem cadastro prévio |
| DRD-02 | Fonte NÃO é combobox nem select |
| DRD-03 | Sem fluxo "Gerenciar fontes" no caminho de cadastro |
| DRD-04 | Disciplina continua entidade reutilizável em select (INV-05A) |
| DRD-05 | Adicionar nova disciplina não apaga nenhum campo do draft |
| DRD-06 | `learning_units.source_text` é o campo de fonte; tabela `sources` não existe |
| DRD-07 | Estado inicial do banco é VAZIO; nenhuma disciplina ou conteúdo injetado |
| DRD-08 | Desativar disciplina usa `is_active = 0`; hard delete só se sem learning_units |
| DRD-09 | Backup inclui `schemaVersion`; importação rejeita versão incompatível com mensagem clara |
| DRD-10 | BrowserStore e SQLite implementam mesmo contrato; nenhuma divergência de métodos ou shapes |
| DRD-11 | `learning_units.study_date` registra data que o aluno estudou; `created_at` é timestamp técnico; campos distintos |
| DRD-12 | `learning_units.title` é o nome da aula/unidade (era `content`) |
| DRD-13 | `exercises.provenance` = 'MANUAL' | 'SOURCE' | 'AI_GENERATED'; padrão 'MANUAL' |
| DRD-14 | Evidência agregada de revisão em `review_tasks` (correct_count, score_percent) preservada |
| DRD-15 | Sem campos de tentativa por exercício no schema NOW (fronteira DEFINITION×ATTEMPT mantida) |
| DRD-16 | Boundary LEGACY_TEMPORARY: nenhum arquivo fora de scheduler.js hardcoda "16" ou assume count de review_tasks |
| DRD-17 | Reset apaga TODOS os dados sem re-injetar seeds |

### UX — User Experience

| ID | Critério |
|----|---------|
| UX-01 | Cadastro completo (Disciplina + Título + Fonte + Data + Resumo) possível em fluxo único |
| UX-02 | Adicionar disciplina durante cadastro preserva todos os campos já preenchidos |
| UX-03 | Revisão apresenta Fonte, Título e Resumo Mestre do conteúdo revisado |
| UX-04 | Primeiro uso real (vazio → Fisiologia/Homeostase/Guyton) funciona sem fricção |
| UX-05 | Estado vazio mostra mensagem amigável |

---

## 5. Classificação NOW / NEXT / LATER / NOT NOW

| Item | Categoria | Justificativa |
|------|-----------|--------------|
| `study_records → learning_units` rename | NOW | Fundação semântica |
| `content → title` em learning_units | NOW | Semântica correta; decidido |
| Remover tabela `sources` do schema | NOW | Regression |
| Remover seeds de medicina do BrowserStore | NOW | Estado VAZIO |
| `schemaVersion` em backup | NOW | Fail-closed em versão incompatível |
| Paridade BrowserStore × SQLite | NOW | Testes válidos |
| `exercises.provenance` | NOW | Distinção mínima necessária |
| UX cadastro — fluxo correto | NOW | DRD-01..05 |
| Boundary LEGACY_TEMPORARY scheduler | NOW | Sem hardcode fora de scheduler.js |
| UAT final Fisiologia/Guyton | NOW | Gate final do redesign |
| `study_date` renomeado para `first_studied_at` | LATER | Schema churn sem benefício NOW; study_date tem semântica suficiente com `study_sessions` adiado |
| `study_sessions` como tabela explícita | LATER | B-MVP suficiente |
| ATTEMPT/EVIDENCE per-exercise | LATER | Fronteira formal estabelecida |
| FSRS / scheduler adaptativo | LATER | Boundary existe; pode exigir schema evolution |
| Seeds de Medicina como opção do usuário | NOT NOW | Aluno cadastra suas disciplinas |
| Migração sofisticada de dados legados de concurso | NOT NOW | Dados sem valor, banco pode ser recriado |

---

## 6. Test Coverage Matrix

| AC | Tipo | Cenário |
|----|------|---------|
| DRD-01..03 | Unit (BrowserStore) | `learningUnits.create` com `sourceText`; sem entidade source |
| DRD-06 | Unit | Schema não tem tabela `sources`; `mapLearningUnit` tem `sourceText` |
| DRD-07 | Manual | Init → `subjects.getActive()` = []; reset → mesma coisa |
| DRD-08 | Unit | `subjects.deactivate` → isActive false; deleteCascade com units → erro esperado |
| DRD-09 | Unit | `exportAll` inclui `schemaVersion`; `importAll` rejeita versão incompatível |
| DRD-10 | Auditoria | Lista de métodos BrowserStore === lista de métodos SQLiteStore |
| DRD-11 | Unit | `learningUnit.studyDate` ≠ `learningUnit.createdAt`; ambos persistidos corretamente |
| DRD-12 | Unit | `learningUnits.create({title: "..."})` persiste em `title`; sem campo `content` |
| DRD-13 | Unit | `exercises.create({provenance: 'SOURCE'})` persiste; default 'MANUAL' funciona |
| DRD-16 | Code audit | `grep "16\b" src/*.js` — APENAS em scheduler.js |
| DRD-17 | Manual | Reset → zero registros; sem seeds |
| UX-01..04 | Manual | Fluxo Fisiologia/Homeostase/Guyton completo |
| UX-05 | Manual | Empty state visível no primeiro uso |

---

## 7. Structural Gate

**STRUCTURAL_GATE = UNVERIFIED_BY_RUNTIME**

`validate_spec.py` e `validate_tasks.py` não existem no skill TLC bundled.
O único script Python disponível é `scripts/lessons.py`.
Esses validators não puderam ser executados. Checagem estrutural manual realizada como melhor esforço disponível — não equivale ao gate automatizado.

---

## 8. HUMAN_GATES

| Gate | Condição | Bloqueio |
|------|---------|---------|
| DOMAIN_REDESIGN_APPROVAL | Aprovação de spec.md v3 + design.md v3 + tasks.md v3 | Todos os WPs de implementação |

**Removidos:**
- HYPOTHESIS_DECISION: decisão técnica, não de produto
- SCHEMA_MIGRATION_APPROVAL: banco de desenvolvimento pode ser recriado; sem dados reais a proteger
