# CURRENT_UI_ANALYTICS_AUDIT.md — SmartLearn UI Audit

**Data:** 2026-09-03
**Ambiente:** BrowserStore / Vite dev (http://localhost:5173)
**Dados de teste:** Fisiologia / 2 learning units / 1 exercício / 1 revisão concluída

---

## Telas atuais observadas

### Tab 1 — Hoje

**O que mostra:**
- "Feitas hoje (1)": card "Lei de Frank-Starling" com badge "Concluída" e checkbox "Revisão feita" marcado
- "Amanhã: 1 revisão." (texto plano)
- "Tudo em dia!" com ícone de check verde e texto explicativo

**Problemas identificados:**

| # | Problema | Referência |
|---|---------|-----------|
| H-01 | Sem cor de disciplina — não há chip colorido identitficando Fisiologia | UI-AC-01 |
| H-02 | "Feitas hoje (1)" e "Amanhã: 1 revisão." são seções diferentes mas visualmente similares — hierarquia fraca | 4.1 |
| H-03 | Revisão vencida e revisão de hoje não têm separação visual clara | AC-RES-01 |
| H-04 | "Amanhã" é texto plano — sem disciplina, sem título da unidade, sem densidade | AC-RES-05 |
| H-05 | Não há indicador de carga do dia (total vencidas + hoje + amanhã) em uma linha | AC-RES-07 |
| H-06 | Nenhuma informação de volume de questões ou desempenho na lista do Hoje | 4.1 |
| H-07 | Badge "Concluída" sem percentual — não mostra se foi 20% ou 100% | 4.3 |
| H-08 | "Editar Resumo" e detalhes da revisão misturados na linha principal — progressive disclosure insuficiente | UX-008 |

---

### Tab 2 — Cadastro

**O que mostra:**
- Título "Cadastro rápido"
- Dropdown "Disciplina" (já populado: Fisiologia)
- Link "+ Nova disciplina"
- Campo texto "Fonte" (placeholder: Ex.: Guyton & Hall, cap. 1)
- Campo data "Data da aula"
- Campo texto "Conteúdo estudado" (abaixo do scroll)
- Campo textarea "Resumo Mestre (opcional)"
- Botão "Salvar estudo"
- Seção "ESTUDOS SALVOS — Gerenciar estudos"
- Seção "DISCIPLINAS CADASTRADAS — Gerenciar disciplinas"

**Problemas identificados:**

| # | Problema | Referência |
|---|---------|-----------|
| C-01 | "Cadastro" é tab permanente no menu principal — deveria ser ação contextual em Plano | §3.3, §10 Fase B |
| C-02 | "ESTUDOS SALVOS" e "DISCIPLINAS CADASTRADAS" são gerenciamento administrativo misturado ao fluxo de cadastro | 7.2 |
| C-03 | Sem cor de disciplina no dropdown — campo plano, sem identidade visual | 5.1 |
| C-04 | Campo "Fonte" e "Conteúdo estudado" separados mas semanticamente próximos — hierarquia de formulário pode ser mais clara | 4.2 |
| C-05 | Formulário longo em uma coluna — para mobile, razoável; para desktop (quando aplicável), desperdício de largura | 7.4 |
| C-06 | "+ Nova disciplina" abre inline mas sem feedback visual de qual disciplina foi criada e ficou selecionada | UX-001, UX-003 |
| C-07 | Gerenciamento de disciplinas (editar/excluir) misturado à tela de cadastro — distrai do fluxo principal | 7.2 |

---

### Tab 3 — Estatísticas

**O que mostra:**
- Título "SEU DESEMPENHO / Estatísticas"
- 6 cards KPI: Vencidas (0), Não feitas hoje (0), Revisões feitas (1), Média geral (0,0%), Questões (0), Acertos (0)
- Seção "EXERCÍCIOS / Exercícios resolvidos" com mensagem "Registre exercícios concluídos para ver a lista."

**Problemas identificados:**

| # | Problema | Referência |
|---|---------|-----------|
| E-01 | "Média geral 0,0%" — revisão marcada como feita mas sem questões → aparece como 0 sem evidência; estados são confundidos | §6, UI-AC-03 |
| E-02 | Sem breakdown por disciplina — impossível saber onde está fraco | 4.4 |
| E-03 | Sem evolução temporal — impossível ver trajetória | 4.5 |
| E-04 | Cards KPI misturando métricas de agenda (Vencidas, Não feitas hoje) com métricas de desempenho (Média geral) | §5.4 |
| E-05 | Sem volume de questões por disciplina — percentual sem contexto | UI-AC-03 |
| E-06 | "Exercícios resolvidos" é lista linear sem agrupamento por unidade, sem cor de disciplina, sem tendência | 4.5 |
| E-07 | Sem subnav (Disciplinas / Conteúdos / Evolução) — todas as métricas numa única tela | §3.3 |
| E-08 | Cor do KPI "Vencidas" é vermelho mesmo com valor 0 — cor de estado independente do dado | §5.2 |

---

### Tab 4 — Configurações (observada anteriormente)

**O que mostra:**
- Seleção de tema (Automático/Papel/Sépia/Noite/Alto contraste)
- Backup (Exportar / Importar)
- Apagar banco local

**Problemas identificados:**

| # | Problema | Referência |
|---|---------|-----------|
| CF-01 | Configurações como tab permanente no menu — deveria ser ícone de engrenagem no header | §3.3 |
| CF-02 | OK como área secundária — nenhum problema funcional grave | — |

---

## O que está faltando (telas não existentes)

| Tela alvo | Status atual | Impacto |
|-----------|-------------|---------|
| Plano / Conteúdos (RP) | Não existe — funcionalidade de listagem de estudos está dentro de "Cadastro" | Alto — sem visão longitudinal do inventário |
| Detalhe / Execução | Não existe como tela própria — dados de execução só visíveis na lista de "Exercícios resolvidos" | Alto — sem ledger de evidência |
| Estatísticas → por disciplina | Não existe — apenas média geral | Alto |
| Estatísticas → por conteúdo | Não existe | Alto |
| Estatísticas → Evolução | Não existe | Alto |
| Acompanhamento | Não existe | Alto |
| Disciplinas (tela própria) | Não existe — gerenciamento inline em Cadastro | Médio |

---

## Resumo: o maior gap

O SmartLearn atual é um formulário de cadastro com estatísticas secundárias. As telas de **Plano, Detalhe, Acompanhamento** e a estrutura de **Estatísticas por disciplina/conteúdo/evolução** não existem.

A falta de **cor de disciplina** em todas as telas torna impossível a orientação visual imediata.

A falta de **volume de questões** junto ao percentual torna as estatísticas desonestas por omissão.

A confusão entre **agenda (review_tasks)** e **evidência de desempenho** está embutida na tela de Estatísticas atual.

---

## O que está funcionando e deve ser preservado

| Item | Status |
|------|--------|
| Fluxo de salvar unidade com Resumo Mestre | Funcional |
| Criação de exercícios com provenance | Funcional |
| Marcar revisão como feita | Funcional |
| 16 revisões geradas automaticamente | Funcional |
| Backup export/import | Funcional |
| Estado inicial sem seeds | Correto |
| Dark mode / temas | Funcional |
| Modelo de domínio (learning_units, exercises, review_tasks) | Correto e preservado |

---

## Auditoria arquitetural: `review_tasks` consegue representar evidência longitudinal?

**Pergunta formal (handoff §7):** Uma execução de exercícios é a mesma coisa que uma tarefa de revisão?

### Casos que precisam ser representados

| Caso | `review_tasks` consegue? | Observação |
|------|--------------------------|-----------|
| Exercício inicial logo após a aula | ❌ | `review_tasks` exige `due_date` derivada do scheduler; não há tarefa "dia 0" |
| Revisão programada | ✅ | Esse é o caso principal da entidade |
| Exercícios externos (simulado, banco de questões) | ❌ | Não há campo de origem; ficaria misturado com revisões internas |
| Múltiplas sessões no mesmo conteúdo fora do scheduler | ❌ | Cada entrada em `review_tasks` é gerada pelo scheduler, não pela iniciativa do aluno |
| Evolução temporal independente do scheduler | ❌ | O índice temporal de `review_tasks` é `due_date`; `completed_at` pode ser nulo |
| Simulados futuros abrangendo múltiplas unidades | ❌ | Sem campo de contexto/origem para distinguir do ciclo normal |

**Conclusão:** `review_tasks` NÃO consegue representar o contrato de evidência longitudinal sem semântica conflitante.

- `review_task` responde **quando revisar** (agenda, scheduler)
- `performance evidence` responde **como o aluno foi** (ledger, analytics)

São relacionados, mas a mesma entidade causa conflito real: um exercício externo feito fora do schedule não tem `review_task_id`; uma revisão agendada mas não realizada não tem evidência. Misturar os dois gera "Média geral 0%" quando não há questões — já visível na tela Estatísticas atual.

**Decisão de design:** criar tabela separada `learning_evidence` (ledger mínimo) como Opção B. `review_tasks` continua intacta como agenda. `learning_evidence` registra execuções de qualquer origin. Migration idempotente popula `learning_evidence` a partir de `review_tasks` com dados existentes.

---

## Auditoria de SPEC_DEVIATION do domínio v3

**CURRENT_DOMAIN_V3_SPEC_DEVIATION = NONE**

Verificação de divergências entre o domínio v3 aprovado e o que foi implementado:

| Item do domínio v3 | Implementado? | Observação |
|--------------------|--------------|-----------|
| `learning_units` (substituiu `study_records`) | ✅ | Commit 5a43fd4 |
| `exercises.provenance` obrigatório (MANUAL/SOURCE/AI_GENERATED) | ✅ | Commit 9ee5793; `provenance: 'MANUAL'` no create |
| `hint_text` exclusivamente pedagógico (não provenance) | ✅ | Sem SPEC_DEVIATION observada |
| `source_text` como texto livre (sem entidade `sources`) | ✅ | Commit 09ea0d8 |
| `summary_body` pertence à unidade | ✅ | Campo presente em `learning_units` |
| `scheduler.js` como boundary LEGACY_TEMPORARY | ✅ | Encapsulado; FSRS não implementado |
| `schemaVersion: 2` no backup | ✅ | Confirmado no roundtrip BrowserStore |
| Estado inicial sem seeds acadêmicos | ✅ | Banco vazio na primeira inicialização |
| `subjects.color` para identidade cromática | VNEXT_DOMAIN_EXTENSION | Campo não existe no domínio v3 aprovado — adição planejada para schemaVersion 3. NÃO é SPEC_DEVIATION. |
| `learning_evidence` (ledger longitudinal) | VNEXT_DOMAIN_EXTENSION | Tabela não existe no domínio v3 aprovado — criação nova no redesign. NÃO é SPEC_DEVIATION. |
| `review_tasks` como agenda LEGACY_TEMPORARY | ✅ | Não foi alterado; preservado intacto |

**Conclusão:** Nenhum item do domínio v3 aprovado foi removido, alterado ou quebrado. `subjects.color` e `learning_evidence` são VNEXT_DOMAIN_EXTENSION — adições novas que não conflitam com o domínio v3.

---

## Matriz de gaps vs requisitos do brief

| Requisito (SMARTLEARN_BRIEF) | Atendido? | Observação |
|------------------------------|-----------|-----------|
| Cor de disciplina consistente em todas as telas | ❌ | Sem implementação |
| Alta densidade informacional | ❌ | Cards grandes, pouca informação por pixel |
| Breakdown por disciplina nas estatísticas | ❌ | Não existe |
| Evolução temporal por conteúdo | ❌ | Não existe |
| Tela Plano/RP | ❌ | Não existe |
| Tela Acompanhamento | ❌ | Não existe |
| Evidência de desempenho independente de review_task | ❌ | Não existe |
| Percentual + volume de questões | ❌ | Percentual sem volume |
| Estado visual inequívoco (sem evidência ≠ 0%) | ❌ | Confundidos atualmente |
| Draft preservation | ✅ | Preservado no session state |
| Fluxo cadastro rápido | ✅ | Funcional, pode melhorar |
| Revisão interna com Acertei/Errei | ✅ | Funcional |
| Backup roundtrip | ✅ | Funcional (schemaVersion 2) |
| Zero seeds acadêmicos | ✅ | Correto |
| Navegação simples por tabs | ⚠️ | Tabs existem mas a arquitetura está desalinhada com alvos |
