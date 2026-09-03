# SmartLearn — Domain Redesign Specification

**Feature:** `smartlearn-domain-redesign`
**Status:** AGUARDANDO HUMAN_GATE: DOMAIN_REDESIGN_APPROVAL
**Data:** 2026-09-03
**Gatilho:** DESIGN_INVALIDATED_BY_REAL_USAGE — teste real com fluxo Fisiologia/Guyton revelou contradições de modelo de produto e domínio

---

## 1. Diagnóstico Estrutural

### 1.1 O que o teste real revelou

O teste prático de cadastro ("Disciplina: Fisiologia, Aula: Organização funcional, Fonte: Guyton & Hall, cap. 1") expôs uma contradição entre o modelo técnico implementado e o comportamento esperado pelo produto:

| Síntoma | Causa raiz |
|---------|------------|
| Fonte como combobox obrigatório | INV-05B exigia entidade `sources` com `source_id`; realidade: fonte varia por capítulo, não por livro inteiro |
| Seeds de concurso (Grancursos, Língua Portuguesa) | DEC-013 definia seeds para o domínio original (planilha de concurso) |
| Excluir disciplina destrói histórico | DEC-012 permitia exclusão destrutiva em cascata — correto para MVP com poucos dados; inadequado para memória longitudinal de 6 anos |
| study_records mistura evento e conhecimento | Não havia decisão explícita sobre o que `study_records` representa semanticamente |
| Duas implementações de banco (BrowserStore + SQLite) | BrowserStore criado como conveniência dev; cresceu em complexidade paralela ao SQLite |

### 1.2 Decisões históricas — classificação

| Decisão | Descrição original | Status |
|---------|-------------------|--------|
| DEC-003 | 16 revisões fixas por estudo | SUPERSEDED_FOR_VNEXT — scheduler boundary criada em WP-02 |
| DEC-012 | Disciplina com exclusão destrutiva em cascata | REINTERPRETED — archive/deactivate é o caminho normal; hard delete somente se vazia ou por ação explícita excepcional |
| DEC-013 | Fonte como entidade reutilizável (`sources`, `source_id`, seed Grancursos) | SUPERSEDED_FOR_VNEXT — fonte é texto livre pertencente ao estudo; `source_text`; sem entidade `sources` |
| INV-05B | "Fonte é entidade reutilizável, não texto repetido" | SUPERSEDED_FOR_VNEXT — substituída por: "Fonte é texto livre que descreve a origem do conteúdo estudado" |
| DEC-015 | Reset re-aplica seeds padrão | REINTERPRETED — estado inicial é VAZIO; nenhum conteúdo acadêmico é injetado automaticamente |
| DEC-016 | vNext com Resumo Mestre + Exercícios + Scheduler | PRESERVED — estende, não substitui esta análise |
| DEC-001, DEC-005, DEC-006, DEC-008/9/10/11 | Stack, SQLite, backup, Git, db.js | PRESERVED — invariantes de infraestrutura |
| INV-05A | Disciplina é entidade reutilizável | PRESERVED — disciplina NÃO vira texto livre |
| PROJECT.md — Usuário | "estudante de concursos, vestibulares, certificações" | HISTORICAL_ONLY — usuário atual é estudante de Medicina; PROJECT.md deve ser atualizado |
| ROADMAP — Fase 2: Sincronização | Após MVP estável | PRESERVED — não afetado |

### 1.3 Problemas que permanecem abertos após commit 09ea0d8

O commit `09ea0d8` (hipótese de implementação) resolveu corretamente:
- ✅ Fonte como texto livre (`source_text`) — AC-01..AC-03
- ✅ Seeds de medicina na lista de disciplinas
- ✅ Draft preservation ao adicionar disciplina (AC-05)
- ✅ 37 testes passando

Mas NÃO resolveu (e pode ter cristalizado incorretamente):
- ❌ Seeds de medicina ainda são seeds injetados automaticamente — deveria ser VAZIO
- ❌ Exclusão de disciplina ainda é destrutiva em cascata — sem revisão
- ❌ `study_records` ainda mistura evento (study_date) e conhecimento permanente (summary_body, exercises) sem decisão explícita sobre semântica
- ❌ BrowserStore ainda é segunda implementação completa de banco — não um adapter/test double
- ❌ Backup sem `schemaVersion` — importação cega à versão do schema
- ❌ 16 review_tasks pré-geradas — legado da planilha, não revisado para memória longitudinal

---

## 2. Modelo Conceitual

### 2.1 Entidades conceituais (sem compromisso de tabelas ainda)

```
DISCIPLINA
    entidade reutilizável, estável, selecionada no cadastro
    ↓
UNIDADE DE APRENDIZAGEM
    "Organização funcional do corpo humano e homeostase"
    ├── título/tema (o que foi estudado)
    ├── fonte — texto livre descritivo
    ├── quando foi estudado pela primeira vez
    ├── Resumo Mestre — permanente, editável, pertence à unidade
    ├── Exercícios — pertencem à unidade
    └── ESTADO DE SCHEDULING
             — quando revisar, quantas vezes, histórico de acertos
             ↓
       EVENTOS DE REVISÃO
       revisou em D+1, revisou em D+7, acertou X de Y, comentou...
```

### 2.2 Separação crítica

| Conceito | Pertence a | Exemplo |
|---------|------------|---------|
| Resumo Mestre | Unidade permanente | "LEC é o ambiente interno..." |
| Fonte | Unidade permanente | "Guyton & Hall, cap. 1" |
| Exercícios | Unidade permanente | "O que é homeostase? → ..." |
| Data de estudo | Evento inicial | "03/09/2026" |
| Resultado da revisão | Evento de revisão | "R1: acertou 8 de 10" |
| Scheduling state | Algoritmo | próxima revisão em D+7 |

### 2.3 O que NÃO muda

- Disciplina: entidade reutilizável com select — INV-05A preservada
- Disciplina não vira texto livre
- SQLite nativo + db.js único ponto SQL — DEC-011 preservada
- Revisões geradas automaticamente — INV-04 preservada
- Sem login, sem backend, sem servidor — DEC-005, INV-16..18 preservadas

---

## 3. UX Alvo

### 3.1 Fluxo de cadastro (task real: "acabei minha primeira aula de Fisiologia")

```
1. Disciplina    → select (entidade reutilizável)
                  + quick add "+ Nova disciplina" sem resetar draft
2. Fonte         → input texto livre
                  Ex.: "Guyton & Hall, Tratado de Fisiologia Médica, 11ª ed., cap. 1"
3. Data da aula  → date input, default = hoje
4. Aula/tema     → input texto curto
                  Ex.: "Organização funcional do corpo humano e homeostase"
5. Resumo Mestre → textarea longo (sem limite artificial de caracteres)
6. Salvar        → gera revisões automaticamente
```

**Princípio de design:** cada campo deve existir porque o ALUNO precisa dele, não porque o BANCO precisa.

### 3.2 Perguntas de validação por campo

| Campo | Por que o aluno precisa? | Resposta |
|-------|--------------------------|---------|
| Disciplina | Para organizar e filtrar conteúdo | Sim — reutilizável, reduz retrabalho |
| Fonte | Para saber onde consultar na revisão | Sim — texto livre evita fricção |
| Data | Para saber quando estudou | Sim — automático (hoje), editável |
| Tema | Para identificar o conteúdo na lista de revisões | Sim — curto, descritivo |
| Resumo Mestre | Para ter o que revisar sem reabrir o livro | Sim — permanente, pertence à unidade |
| Gerenciar fontes | — | **Não** — o banco queria, o aluno não precisa |
| Cadastro prévio de fonte | — | **Não** — fricção pura |

### 3.3 Fluxo de revisão

```
Tela Hoje → revisão R3 de "Homeostase"
├── Disciplina: Fisiologia
├── Fonte: Guyton & Hall, cap. 1
├── Resumo Mestre: [texto completo]
├── Exercícios: [Q1 → revelar R1] [Q2 → revelar R2]
└── Registrar: feito, questões/acertos, comentário
```

### 3.4 Gerenciamento de entidades (ação secundária)

Gerenciar disciplinas (editar nome, desativar, excluir) **não domina a tela de cadastro**.
É seção colapsada ou separada, acessível mas não no caminho principal.

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
| DRD-06 | `study_records.source_text` substitui `source_id`; tabela `sources` não existe |
| DRD-07 | Estado inicial do banco é VAZIO; nenhuma disciplina, fonte ou conteúdo é injetado automaticamente |
| DRD-08 | Excluir disciplina com estudos vinculados exige confirmação explícita; caminho preferido é desativar |
| DRD-09 | Backup JSON inclui campo `schemaVersion`; importação valida versão e falha com mensagem clara se incompatível |
| DRD-10 | BrowserStore e SQLite implementam o mesmo contrato de domínio; testes que passam em BrowserStore são válidos no SQLite |
| DRD-11 | Resumo Mestre sem limite de caracteres (diferente de `content` com 240) |
| DRD-12 | Exercícios vinculados a unidade de aprendizagem, com cascade delete preservado |

### UX — User Experience

| ID | Critério |
|----|---------|
| UX-01 | Cadastro completo (Disciplina + Fonte + Data + Tema + Resumo) é possível em fluxo único sem ações auxiliares obrigatórias |
| UX-02 | Adicionar disciplina durante cadastro preserva todos os campos já preenchidos |
| UX-03 | Revisão apresenta Fonte e Resumo Mestre do conteúdo revisado |
| UX-04 | Primeiro registro real (Fisiologia/Guyton) funciona sem fricção |

---

## 5. Test Coverage Matrix

| AC | Tipo de teste | Cenário |
|----|--------------|---------|
| DRD-01 | Unit (BrowserStore) | `studyRecords.create` com `sourceText` persiste corretamente |
| DRD-06 | Unit (BrowserStore) | `studyRecords.create` sem `sourceId` não lança erro; `sourceText` vazio salva como `''` |
| DRD-07 | Manual | Reset limpa banco; nenhuma disciplina ou fonte aparece após reinicialização |
| DRD-08 | Manual | Excluir disciplina com estudos: confirmação aparece; desativar não destrói dados |
| DRD-09 | Unit (BrowserStore) | `exportAll` inclui `schemaVersion`; `importAll` rejeita backup sem `schemaVersion` compatível |
| DRD-10 | Comparação de contrato | Cada método DB.* retorna mesma estrutura em BrowserStore e SQLite |
| DRD-11 | Unit | `studyRecords.create` com `summaryBody` de 5000 chars persiste sem truncamento |
| DRD-12 | Unit | Delete cascade em `subjects` remove `exercises` via `study_records` |
| UX-01 | Manual / E2E | Fisiologia/Guyton/Homeostase cadastrado sem sair do fluxo |
| UX-02 | Manual | Preencher fonte → adicionar disciplina → fonte preservada |
| UX-03 | Manual | Revisão mostra fonte e resumo corretos |
| UX-04 | Manual — AC-12 final | Cenário completo Fisiologia/Guyton passa no runtime Tauri |

---

## 6. HUMAN_GATES

| Gate | Condição | Bloqueio |
|------|---------|---------|
| DOMAIN_REDESIGN_APPROVAL | Usuário aprova spec.md + design.md + tasks.md deste redesign | Nenhuma implementação adicional antes da aprovação |
| HYPOTHESIS_DECISION | Usuário decide sobre commit 09ea0d8: preservar como ponto de partida, reverter parcialmente, ou manter como está | Implementação de WPs subsequentes |
| SCHEMA_MIGRATION_APPROVAL | Antes de qualquer ALTER TABLE ou novo schema em produção | Migration irreversível sem aprovação |
