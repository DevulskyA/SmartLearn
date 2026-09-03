# SmartLearn — Domain Redesign Specification (v2)

**Feature:** `smartlearn-domain-redesign`
**Status:** PROPOSTO — AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03
**Gatilho:** DESIGN_INVALIDATED_BY_REAL_USAGE — teste Fisiologia/Guyton revelou contradições de domínio

---

## 1. Diagnóstico Estrutural

### 1.1 O que o teste real revelou

| Sintoma | Causa raiz |
|---------|------------|
| Fonte como combobox obrigatório | INV-05B exigia `sources` com `source_id`; realidade: fonte é livre, varia por capítulo |
| Seeds de concurso (Grancursos, Língua Portuguesa) | DEC-013 definia seeds para domínio original (planilha de concurso) |
| Seeds de medicina injetados automaticamente (commit 09ea0d8) | Troca de domínio sem decisão formal; DEC-015 dizia re-aplicar seeds padrão no reset |
| `study_records` com `study_date` sem nome explícito do evento | Campo existe e tem semântica correta, mas nome `study_date` é ambíguo com `created_at` técnico |
| Tabela `sources` ainda criada no schema após remoção de seu uso | Regression de 09ea0d8 — CREATE TABLE preservado sem motivo |
| BrowserStore `init()` faz seed de medicina automaticamente | Lógica de seed acoplada ao init; "primeiro uso = medicina" é decisão de produto não aprovada |
| Exercícios como DEFINITION-only sem separação explícita de ATTEMPT | Schema correto acidentalmente; falta decisão formal para evitar dívida futura |
| 16 review_tasks pré-geradas sem classificação de modelo | LEGACY da planilha; precisa de classificação explícita como LEGACY_TEMPORARY |

### 1.2 O que está CORRETO em 09ea0d8 (preservar)

| Item | Status |
|------|--------|
| `study_records.source_text` substituindo `source_id` | Correto — DRD-01..03 |
| Remoção de UI de gerenciamento de fontes | Correto — DRD-03 |
| Draft preservation ao adicionar disciplina | Correto — DRD-05 |
| 37 testes passando com `sourceText` | Correto — base válida |
| `study_records.study_date` E `created_at` separados | Correto — preservar semântica distinta |

### 1.3 O que está INCORRETO em 09ea0d8 (corrigir)

| Item | Problema |
|------|---------|
| Seeds de medicina em BrowserStore.init() | DEC-015 REINTERPRETADO: estado inicial é VAZIO; medicina não é seed padrão |
| Tabela `sources` ainda criada no schema | Regression — tabela sem uso consome espaço e confunde |
| `study_date` sem renomear para `first_studied_at` | Semântica ambígua com `created_at` técnico |
| design.md v1 propunha `study_date → created_at` | ERRO — `created_at` já existe com semântica diferente |

### 1.4 Decisões históricas — classificação

| Decisão | Status |
|---------|--------|
| DEC-013 — Fonte como entidade reutilizável, seeds Grancursos | SUPERSEDED_FOR_VNEXT |
| INV-05B — "Fonte é entidade reutilizável, not texto repetido" | SUPERSEDED_FOR_VNEXT |
| DEC-015 — Reset re-aplica seeds padrão | REINTERPRETED: estado inicial VAZIO, sem seeds acadêmicos |
| DEC-012 — `subjects` com exclusão destrutiva em cascata | REINTERPRETED: hard delete apenas se sem learning_units; caminho normal é `is_active = 0` |
| DEC-003 — 16 revisões fixas por estudo | LEGACY_TEMPORARY: scheduler.js boundary encapsula; não é modelo definitivo |
| DEC-016 — vNext Resumo Mestre + Exercícios + Scheduler | PRESERVED; exercícios JÁ implementados como DEFINITION-only (correto) |
| INV-05A — Disciplina é entidade reutilizável | PRESERVED — disciplina NÃO vira texto livre |
| DEC-001, DEC-005, DEC-009, DEC-011 | PRESERVED — stack, SQLite, Tauri, contrato db.js |

---

## 2. Modelo Conceitual Final

```
DISCIPLINA (subjects)
    entidade reutilizável, estável, is_active para soft-delete
    ↓ tem muitas
UNIDADE DE APRENDIZAGEM (learning_units)
    ├── title            — o que foi estudado ("Organização funcional...")
    ├── source_text      — texto livre ("Guyton & Hall, cap. 1")
    ├── first_studied_at — quando o aluno estudou (campo semântico)
    ├── summary_body     — Resumo Mestre permanente, editável
    ├── created_at       — timestamp técnico de criação no software
    └── updated_at       — timestamp técnico de última edição
    ↓ tem muitos
EXERCÍCIOS — DEFINIÇÃO (exercises)
    ├── question_text, answer_text, hint_text, position
    └── sem campos de tentativa, score, ou histórico de acertos
        (ATTEMPT/EVIDENCE é separação futura — LATER)
    ↓
REVISÕES — MODELO LEGACY_TEMPORARY (review_tasks)
    16 tarefas pré-geradas por unidade
    scheduler.js encapsula como algoritmo 'legacy'
    boundary: nenhum código de produto assume 16 como arquitetura definitiva
    FSRS / scheduler inteligente = LATER
```

### 2.1 Separação crítica de datas

| Campo | Semântica | Exemplo |
|-------|-----------|---------|
| `first_studied_at` | Quando o aluno estudou o conteúdo | 10/03/2026 (dia da aula) |
| `created_at` | Quando o registro foi criado no software | 12/03/2026 (dia do cadastro) |
| `updated_at` | Quando foi editado pela última vez | 13/03/2026 (edição do resumo) |

Esses campos têm semântica distinta. NUNCA mesclar ou renomear um como o outro.

### 2.2 Fronteira DEFINITION × ATTEMPT

| Conceito | Onde fica NOW | LATER |
|---------|--------------|-------|
| Enunciado da questão | `exercises.question_text` | — |
| Resposta esperada | `exercises.answer_text` | — |
| Dica | `exercises.hint_text` | — |
| Tentativa do aluno | NÃO existe no schema | Tabela `exercise_attempts` (LATER) |
| Score da tentativa | NÃO existe no schema | Em `exercise_attempts` (LATER) |
| Acertos por revisão | `review_tasks.correct_count` (agregado, não por exercício) | Detalhar por exercício em LATER |

Schema NOW não mistura DEFINITION com ATTEMPT. Decisão formal garante que essa fronteira não seja violada por acidente em implementações futuras.

### 2.3 O que NÃO muda

- Disciplina: entidade reutilizável com select — INV-05A
- SQLite + db.js único ponto SQL — DEC-011
- Revisões geradas automaticamente — INV-04 (LEGACY_TEMPORARY)
- Sem login, sem backend — DEC-005, INV-16..18
- `is_active` em subjects (coluna existente — não renomear para `active`)

---

## 3. UX Alvo

### 3.1 Fluxo de cadastro

```
1. Disciplina     → select (entidade reutilizável, is_active)
                    + "+ Nova disciplina" sem apagar nenhum campo do draft
2. Aula / tema    → input texto curto
                    ex: "Organização funcional do corpo humano e homeostase"
3. Fonte          → input texto livre (OPCIONAL visualmente, obrigatório?)
                    ex: "Guyton & Hall, Tratado de Fisiologia Médica, 11ª ed., cap. 1"
4. Data da aula   → date input, default = hoje (editável retroativamente)
5. Resumo Mestre  → textarea sem limite artificial de caracteres
6. Salvar         → cria learning_unit + gera review_tasks (LEGACY schedule)
```

**Princípio:** campo existe porque o ALUNO precisa, não porque o schema precisa.

### 3.2 O que NÃO deve existir no fluxo principal

- Gerenciamento de fontes (nenhum CRUD de fontes)
- Seleção de fonte de lista pré-cadastrada
- Qualquer ação auxiliar que apague o draft atual

### 3.3 Gerenciamento de disciplinas (ação secundária)

- Seção colapsada ou separada — não domina tela de cadastro
- Opções: editar nome, desativar (`is_active = 0`), excluir (só se sem learning_units)

---

## 4. Acceptance Criteria

### DRD — Domain Redesign

| ID | Critério |
|----|---------|
| DRD-01 | Fonte é campo texto livre; aluno digita diretamente sem cadastro prévio |
| DRD-02 | Fonte NÃO aparece como combobox no fluxo de cadastro |
| DRD-03 | Sem fluxo "Gerenciar fontes" no caminho normal de cadastro |
| DRD-04 | Disciplina continua entidade reutilizável em select (INV-05A preservada) |
| DRD-05 | Adicionar nova disciplina não apaga nenhum campo do draft em andamento |
| DRD-06 | `learning_units.source_text` é o campo de fonte; tabela `sources` não existe no schema |
| DRD-07 | Estado inicial do banco é VAZIO; nenhuma disciplina ou conteúdo injetado automaticamente |
| DRD-08 | Desativar disciplina usa `is_active = 0` (hard delete só se sem learning_units vinculadas) |
| DRD-09 | Backup inclui `schemaVersion`; importação valida e falha com mensagem clara em versão incompatível |
| DRD-10 | BrowserStore e SQLite implementam mesmo contrato público; nenhum método em um sem equivalente no outro |
| DRD-11 | `learning_units.first_studied_at` registra data que o aluno estudou; `created_at` é timestamp técnico de criação; campos distintos com semântica distinta |
| DRD-12 | `exercises` contém apenas campos de DEFINIÇÃO (question, answer, hint, position); sem score, sem histórico de tentativas |
| DRD-13 | `review_tasks` classificadas como LEGACY_TEMPORARY: scheduler.js boundary; nenhum código de produto codifica "16 revisões" como constante fora do scheduler |
| DRD-14 | Reset apaga TODOS os dados sem re-injetar seeds |

### UX — User Experience

| ID | Critério |
|----|---------|
| UX-01 | Cadastro completo (Disciplina + Aula + Fonte + Data + Resumo) possível em fluxo único |
| UX-02 | Adicionar disciplina durante cadastro preserva todos os campos já preenchidos |
| UX-03 | Revisão apresenta Fonte, Tema e Resumo Mestre do conteúdo revisado |
| UX-04 | Primeiro uso real (estado vazio → Fisiologia/Homeostase/Guyton) funciona sem fricção |
| UX-05 | Estado vazio mostra mensagem amigável ("Nenhuma disciplina ainda. Comece adicionando uma.") |

---

## 5. Classificação NOW / NEXT / LATER / NOT NOW

| Item | Categoria | Justificativa |
|------|-----------|--------------|
| Renomear `study_records → learning_units` | NOW | Fundação semântica do redesign |
| Renomear `study_date → first_studied_at` | NOW | Semântica correta; `created_at` técnico já existe separado |
| Remover tabela `sources` do schema | NOW | Regression — tabela sem uso |
| Remover seeds de medicina do BrowserStore | NOW | Estado inicial deve ser VAZIO |
| `schemaVersion` em backup | NOW | Falha controlada em importação incompatível |
| Auditoria de contrato BrowserStore × SQLite | NOW | Paridade exigida para testes válidos |
| UX cadastro — fluxo correto | NOW | DRD-01..05, UX-01..05 |
| Classificar LEGACY_TEMPORARY explicitamente | NOW | Fronteira de scheduler |
| UAT final Fisiologia/Guyton | NOW | Gate de validação do redesign |
| ATTEMPT/EVIDENCE history em exercises | LATER | Schema atual não mistura; fronteira formal estabelece limite |
| FSRS / scheduler inteligente | LATER | Boundary existe; algoritmo é independente |
| `study_sessions` como tabela explícita | LATER | B-MVP é suficiente por enquanto |
| Sincronização em nuvem | NOT NOW | Fase 2 (ROADMAP preservado) |
| Seeds de Medicina como opção do usuário | NOT NOW | Usuário cadastra suas próprias disciplinas |

---

## 6. Test Coverage Matrix

| AC | Tipo | Cenário |
|----|------|---------|
| DRD-01 | Unit (BrowserStore) | `learningUnits.create` com `sourceText` persiste |
| DRD-06 | Unit (BrowserStore) | `learningUnits.create` sem `sourceId`; schema não tem tabela `sources` |
| DRD-07 | Manual | Reset → estado vazio; nova init → sem seeds |
| DRD-08 | Unit (BrowserStore) | `subjects.deactivate` seta `isActive = false`; hard delete com units lança erro |
| DRD-09 | Unit (BrowserStore) | `exportAll` inclui `schemaVersion`; `importAll` rejeita versão incompatível |
| DRD-10 | Comparação manual | Listar métodos BrowserStore × SQLite; nenhuma divergência |
| DRD-11 | Unit (BrowserStore) | Criar unit com `firstStudiedAt = '2026-03-10'`; `createdAt` diferente; ambos persistidos |
| DRD-12 | Code audit | `exercises` schema não tem score/attempt; `mapExercise` não mapeia esses campos |
| DRD-13 | Code audit | grep "16" em scheduler.js é a ÚNICA ocorrência do número; não duplicada em db.js ou app.js |
| DRD-14 | Manual | Reset → zero registros em todas as tabelas; BrowserStore `emptyState()` sem subjects |
| UX-01 | Manual | Fluxo Fisiologia/Homeostase/Guyton cadastrado em sequência direta |
| UX-02 | Manual | Preencher tema + fonte → adicionar disciplina → tema e fonte preservados |
| UX-03 | Manual | ReviewRow mostra fonte e resumo do conteúdo |
| UX-04 | Manual — AC-12 | Cenário completo em Tauri runtime |
| UX-05 | Manual | Primeira tela com banco vazio mostra empty state amigável |

---

## 7. Checagem estrutural (substituindo validators Python inexistentes)

Scripts `validate_spec.py` e `validate_tasks.py` NÃO existem neste projeto. Checagem manual:

### 7.1 spec.md

| Critério | Resultado |
|---------|-----------|
| Todos os ACs têm ID único | PASS — DRD-01..14, UX-01..05 |
| Todos os ACs são verificáveis (não vagos) | PASS — cada AC tem critério observável |
| Nenhum AC de implementação (COMO, não O QUÊ) | PASS — nenhum AC especifica código |
| Diagnóstico cobre todos os problemas reportados | PASS — 8 sintomas identificados |
| NOW/NEXT/LATER/NOT NOW definidos | PASS — seção 5 |
| Decisões PROPOSED, não aprovadas | PASS — status "PROPOSTO — AGUARDANDO HUMAN_GATE" |

### 7.2 tasks.md (analisar após correção)

Checado contra tasks.md v2 quando escrito. Critérios:
- Cada WP tem objetivo observável ✓
- Cada WP tem gate de teste ✓  
- Cada task tem AC correspondente ✓
- Nenhum WP mistura domínios distintos ✓
- Migration/rollback explícito ✓

---

## 8. HUMAN_GATES

| Gate | Condição | Bloqueio |
|------|---------|---------|
| DOMAIN_REDESIGN_APPROVAL | Usuário aprova spec.md v2 + design.md v2 + tasks.md v2 | Nenhuma implementação antes da aprovação |
| SCHEMA_MIGRATION_APPROVAL | Antes de migration destrutiva se dados reais existem no banco | Apenas migration; não bloqueia outros WPs |

**Removido:** HYPOTHESIS_DECISION como gate humano. Após DOMAIN_REDESIGN_APPROVAL, o agente compara tecnicamente commit 09ea0d8 com design aprovado: preserva o conforme, corrige o divergente, descarta o invalidado. Só retorna ao usuário se surgir decisão real de produto (não técnica).
