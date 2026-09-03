# spec.md — SmartLearn Product/UX/Analytics Redesign

**Feature:** smartlearn-product-ux-analytics-redesign
**Classificação:** Complex / high-risk
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL — parar antes de qualquer implementação

---

## WP-01 — Estado real e reconciliação

### Baseline técnico preservado

Branch: `claude/com-tlc-replanning-77f844`

| Commit | Conteúdo | Status |
|--------|---------|--------|
| `5a43fd4` | db.js: `learning_units`, `title`, `provenance`, `schemaVersion 2`; stats.js; scheduler.js; 44 testes | LOCAL_BROWSER_BASELINE=PASS |
| `9ee5793` | app.js: `studyRecords→learningUnits`, `content→title`, `provenance:'MANUAL'` | LOCAL_BROWSER_BASELINE=PASS |
| `998b3b2` | validation.md: UAT Fisiologia/Guyton | PASS (BrowserStore) |
| `77911b3` | STATE.md: gates, TLC_INSTALLATION_MISMATCH | Doc |

**REAL_TAURI_SQLITE_CLOSURE = PENDING** — migrations SQL não validadas em SQLite nativo.

### Modelo de domínio atual (aprovado, preservado)

```
subjects
  └── id, name, created_at, updated_at, is_active, sort_order

learning_units
  └── id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at

exercises
  └── id, unit_id, question_text, answer_text, hint_text, position, provenance
      provenance ∈ {MANUAL, SOURCE, AI_GENERATED}

review_tasks
  └── id, unit_id, review_number, due_date, review_done, questions_done,
      questions_count, correct_count, score_percent, completed_at, comment
```

**Invariantes preservadas:**
- `source_text` é texto livre, não entidade
- `summary_body` é Resumo Mestre permanente da unidade
- `hint_text` é pista pedagógica exclusivamente
- `provenance` obrigatório e fail-closed
- zero seeds acadêmicos
- `scheduler.js` como boundary substituível (LEGACY_TEMPORARY)
- BrowserStore apenas como adapter/test double
- `schemaVersion: 2` no backup JSON

### Telas atuais

| Tab | Conteúdo atual | Problema |
|-----|---------------|---------|
| Hoje | ReviewRow linear por data | Sem cor de disciplina; sem densidade; sem prioridade visual clara |
| Cadastro | Formulário + gerenciamento de disciplinas inline | CRUD administrativo misturado ao fluxo principal |
| Estatísticas | KPIs simples + gráfico de linha por data | Sem disciplina breakdown, sem volume, sem tendência por conteúdo |
| Configurações | Tema + Backup | OK como área secundária |

### stats.js atual

- `Stats.calculate(reviewTasks, learningUnits, subjects, today)` → weighted by questionsCount dentro de completedExercises
- Retorna: `totalQuestions`, `totalCorrect`, `avgScore`, `completedExercises`, `avgBySubject`, `reviewsDone`, `reviewsPending`, `reviewsOverdue`
- **Gap:** agrega por disciplina mas não por conteúdo; sem tendência; sem janela temporal; sem evidência externa

### Decisões históricas que continuam válidas

- DEC-001: HTML/CSS/JS puro, Vite + Tauri 2 — sim
- DEC-003 (superseded para vNext): scheduler.js como boundary — sim
- DEC-009: Tauri 2 único alvo — sim
- DEC-011: db.js único ponto SQL — sim
- DEC-012: disciplina como entidade própria — sim
- DEC-016 (vNext): scheduler boundary, LEGACY_TEMPORARY — sim

---

## WP-02 — Functional mapping: planilha → SmartLearn (7 módulos)

### Módulo 1 — Resumo (hoje: "Hoje")

**Pergunta central:** O que precisa da minha atenção agora?

**O que a planilha faz bem:**
- Filtra e ordena por urgência
- Cada linha = uma unidade de trabalho com contexto mínimo suficiente
- Vencidas visualmente separadas das de hoje

**O que preservar como princípio:**
- Ordenação por urgência (vencidas > hoje > amanhã preview)
- Cada linha: disciplina + título + tipo revisão + status + CTA
- Densidade: uma linha = uma decisão

**O que rejeitar:**
- Células com fórmulas; colunas estáticas com datas fixas; mistura de metadados e execução

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-RES-01 | Revisões vencidas aparecem antes das de hoje, em seção visualmente distinta |
| AC-RES-02 | Cada linha de revisão mostra: chip de disciplina (com cor), título da unidade, número da revisão, status, CTA para revisar |
| AC-RES-03 | Concluir revisão atualiza a tela sem navegação administrativa |
| AC-RES-04 | Status visual não depende exclusivamente de cor (ícone ou texto acompanha) |
| AC-RES-05 | Preview de amanhã é leve — sem CTA, sem expansão |
| AC-RES-06 | Tela de ação (Hoje) não contém gerenciamento de disciplinas nem formulários de cadastro |
| AC-RES-07 | Carga do dia (revisões vencidas + hoje + amanhã + feitas) visível sem scroll em viewport padrão |

---

### Módulo 2 — Plano / RP

**Pergunta central:** O que já estudei e quando volta?

**O que a planilha faz bem:**
- Inventário completo por unidade
- Data de estudo + próxima revisão + estado legível

**O que preservar como princípio:**
- Visão longitudinal do inventário de unidades
- Dados mínimos por linha, expansão sob demanda

**O que rejeitar:**
- Exibir 16 colunas de datas de revisão — o scheduler é interno
- Edição inline de células como interface principal

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-RP-01 | Cada unidade mostra: disciplina (chip), título, study_date, fonte, status Resumo Mestre (presente/ausente), n exercícios, próxima revisão, última atividade |
| AC-RP-02 | Visão padrão compacta — uma linha por unidade |
| AC-RP-03 | Expansão por demanda revela: summary_body, exercícios, histórico de revisões |
| AC-RP-04 | 16 tarefas internas do scheduler NÃO aparecem como 16 linhas na UI |
| AC-RP-05 | Filtros: por disciplina, por estado (sem revisão, pendente, em dia) |
| AC-RP-06 | Ordenação padrão por study_date desc; alternativas: disciplina, próxima revisão |

---

### Módulo 3 — Detalhe / Execução / Evidência

**Pergunta central:** O que executei e qual foi o resultado?

**O que a planilha faz bem:**
- Por execução: volume + resultado → percentual derivado
- Vínculo com unidade/disciplina

**O que preservar como princípio:**
- Evidência = volume + resultado, nunca apenas percentual
- Quando exercícios internos: app calcula, usuário não digita contagens
- Quando externos: registro agregado simples (n questões, n acertos)

**O que rejeitar:**
- Digitação manual de questões/acertos quando o app já executou os exercícios
- Evidência presa semanticamente a "revisão"

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-DET-01 | Execução com exercícios internos: app calcula questions_count e correct_count automaticamente |
| AC-DET-02 | Execução externa: usuário registra n questões + n acertos; score derivado |
| AC-DET-03 | Cada evidência tem: data, disciplina, learning unit, contexto (INITIAL_STUDY / REVIEW / EXTERNAL), questões, acertos, score_percent |
| AC-DET-04 | Evidência de revisão vinculada a review_task quando existir |
| AC-DET-05 | Detalhes da execução acessíveis a partir do Plano/RP por expansão |

---

### Módulo 4 — Estatística 1 / Desempenho por disciplina

**Pergunta central:** Como estou em cada matéria?

**O que a planilha faz bem:**
- Percentual por disciplina
- Volume que sustenta o percentual (honestidade estatística)

**O que preservar como princípio:**
- `weighted_accuracy = SUM(correct) / SUM(questions)` — não média de sessões
- Percentual sempre acompanhado de volume
- Estado semântico: crítico / atenção / adequado / forte

**O que rejeitar:**
- Média simples de sessões como métrica primária
- Percentual sem volume

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-EST1-01 | Por disciplina: weighted_accuracy, total de questões, total de acertos, n conteúdos com evidência |
| AC-EST1-02 | Desempenho recente (janela de 30 dias, configurável) exibido junto ao geral |
| AC-EST1-03 | Tendência: ↑/↓/→ calculada deterministicamente (definir método em design.md) |
| AC-EST1-04 | Estado semântico derivado de weighted_accuracy: crítico (<50%) / atenção (50-65%) / adequado (65-80%) / forte (>80%) — thresholds configuráveis, não magic numbers |
| AC-EST1-05 | Sem evidência ≠ 0% — exibido como neutro/insuficiente, nunca vermelho |
| AC-EST1-06 | Ordenação padrão: pior → melhor; alternativa: melhor → pior, volume, tendência |
| AC-EST1-07 | Linha de disciplina nunca mostra só percentual — sempre `% + n questões` |

---

### Módulo 5 — Estatística 2 / Evolução por conteúdo

**Pergunta central:** Qual conteúdo está evoluindo, estagnado ou piorando?

**O que a planilha faz bem:**
- Histórico cronológico de resultados por linha
- Evidência acumulada por conteúdo

**O que preservar como princípio:**
- Sequência temporal de scores por unidade
- Tendência óbvia: MELHORANDO / CAINDO / ESTAGNADO
- Tabela bem desenhada pode ser superior a gráfico sofisticado

**O que rejeitar:**
- Gráfico decorativo sem ação
- Tendência baseada em IA preditiva nesta fase

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-EST2-01 | Por learning unit: disciplina, título, sequência temporal de scores, score atual, weighted_accuracy acumulada, n questões total, tendência, última evidência, próxima revisão |
| AC-EST2-02 | Tendência derivada deterministicamente dos últimos N resultados (N=3 min, configurável) |
| AC-EST2-03 | Visualização: microbarra ou sparkline simples suficiente; gráfico sofisticado não obrigatório |
| AC-EST2-04 | Filtros: por disciplina, por tendência (melhorando/caindo/estagnado), por período |
| AC-EST2-05 | Ordenação padrão: pior score recente → melhor; alternativas: tendência, volume, disciplina, última atividade |

---

### Módulo 6 — Acompanhamento

**Pergunta central:** Qual é o estado de cada unidade no meu processo de aprendizagem?

**O que a planilha faz bem:**
- Matriz longitudinal: uma linha por unidade, colunas = dimensões do processo
- Visão de estado, não de execução

**O que preservar como princípio:**
- Dados deriváveis pelo sistema nunca exigem input manual
- Estado completo por unidade: Resumo Mestre, exercícios, evidência, revisões

**O que rejeitar:**
- Checkboxes manuais para fatos que o app conhece
- Campos duplicados com outras telas

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-ACOMP-01 | Por unidade: disciplina, título, study_date, fonte, Resumo Mestre (auto: presente se summary_body != null), n exercícios, questões/acertos/%, revisões feitas / pendentes, última atividade, estado atual |
| AC-ACOMP-02 | "Resumo Mestre presente" derivado automaticamente de summary_body — sem checkbox manual |
| AC-ACOMP-03 | Estado atual derivado: sem evidência / em estudo / em revisão / atrasado / concluído |
| AC-ACOMP-04 | Filtros: disciplina, estado, período |
| AC-ACOMP-05 | Ação rápida: abrir unidade, adicionar Resumo Mestre, ir para revisão pendente |

---

### Módulo 7 — Disciplinas

**Pergunta central:** Quais são minhas áreas e qual a identidade visual delas?

**O que a planilha faz bem:**
- Catálogo simples com identidade por cor

**O que preservar como princípio:**
- Cor de disciplina = identidade estável, não desempenho
- Criar/editar/arquivar sem tela pesada

**O que rejeitar:**
- Gerenciador pesado com formulários longos
- Cor de disciplina reutilizada para sinalizar bom/ruim

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-DISC-01 | Cada disciplina tem: nome, cor estável, estado (ativo/arquivado), n learning units, weighted_accuracy quando houver evidência |
| AC-DISC-02 | Cor de disciplina é da identidade, nunca do desempenho |
| AC-DISC-03 | Criar disciplina: fluxo inline de uma linha (+ Nova disciplina), sem tela separada |
| AC-DISC-04 | Arquivar preserva histórico; excluir é destrutivo com confirmação |
| AC-DISC-05 | Cor selecionável de paleta predefinida de N cores (definir em design.md) |

---

## WP-03 — Analytics domain

### Unidade de evidência

O modelo atual usa `review_tasks` como único lugar de evidência. A planilha revelou que precisamos de uma camada independente.

### Decisão de design: Opção A vs B

**Opção A — `review_tasks` + campos agregados (status quo)**

Prós:
- nenhuma migration nova
- 44 testes passam sem mudança
- menor custo imediato

Contras:
- exercícios externos/iniciais ficam semanticamente presos a "review"
- analytics independente de revisão (ex.: estudo inicial) não é representável
- campo `context` seria hack sobre `review_tasks`

**Opção B — tabela genérica `learning_evidence`**

Schema mínimo:
```sql
CREATE TABLE learning_evidence (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES learning_units(id),
  evidence_date TEXT NOT NULL,         -- ISO 8601 date
  context TEXT NOT NULL,               -- INITIAL_STUDY | REVIEW | EXTERNAL
  questions_count INTEGER,
  correct_count INTEGER,
  score_percent REAL,
  review_task_id INTEGER REFERENCES review_tasks(id),  -- nullable
  created_at TEXT NOT NULL
)
```

Prós:
- analytics independente do scheduler
- suporta INITIAL_STUDY, REVIEW, EXTERNAL sem hack
- migração de `review_tasks` existentes é `INSERT INTO learning_evidence SELECT ... WHERE questions_done = true`
- `review_tasks` fica como agenda/plano; `learning_evidence` fica como resultado

Contras:
- migration necessária
- testes de stats.js precisam refatoração
- mais escopo agora

### Recomendação

**Opção B com migração gradual.** Razão: a contradição semântica da Opção A gera dívida que cresce com cada novo tipo de evidência. O custo da Opção B sobe se postergado (mais dados para migrar). A migration é simples; os testes de stats refatorados ficam mais claros.

**Estratégia de migração:**
1. Criar `learning_evidence` via `ensureColumns` / migration idempotente
2. Popular `learning_evidence` a partir de `review_tasks` onde `questions_done = true`
3. `review_tasks` continua como agenda; analytics lê exclusivamente de `learning_evidence`
4. `schemaVersion` evolui para `3` no backup JSON

### Agregações obrigatórias

**Por disciplina:**
```
weighted_accuracy(subject) = SUM(le.correct_count) / SUM(le.questions_count)
  WHERE le.unit_id IN (lu.id WHERE lu.subject_id = subject.id)
  AND le.questions_count > 0
total_questions(subject) = SUM(le.questions_count) WHERE ...
recent_accuracy(subject, window=30d) = weighted_accuracy filtrado por evidence_date >= today - 30
trend(subject) = recent_accuracy - accuracy_before_window  [determinístico]
```

**Por learning unit:**
```
weighted_accuracy(unit) = SUM(le.correct_count) / SUM(le.questions_count) WHERE le.unit_id = unit.id
scores_sequence(unit) = [le.score_percent ORDER BY le.evidence_date ASC]
trend(unit) = sinal de regressão linear simples nos últimos min(N, len) scores  [determinístico]
  onde N=3 por padrão
latest_score(unit) = scores_sequence[-1]
recent_score(unit, window=30d) = weighted_accuracy últimos 30 dias
```

**Estado semântico (thresholds configuráveis):**
```
STRONG   = weighted_accuracy >= 0.80
ADEQUATE = 0.65 <= weighted_accuracy < 0.80
ATTENTION = 0.50 <= weighted_accuracy < 0.65
CRITICAL = weighted_accuracy < 0.50
NO_EVIDENCE = questions_count = 0 or null
```

**Tendência determinística (método escolhido: delta de janelas):**
```
recent = weighted_accuracy(evidence_date >= today - 30)
previous = weighted_accuracy(today - 60 <= evidence_date < today - 30)
trend = recent - previous
  ↑ IMPROVING if trend > +0.03
  ↓ DECLINING if trend < -0.03
  → STABLE otherwise
  INSUFFICIENT if recent or previous has < 10 questões
```

### Regras de honestidade estatística

1. Percentual sem volume é incompleto — sempre `% + n questões`
2. Sem evidência ≠ 0% — estado neutro/insuficiente
3. Sem precisão falsa — 0 casas decimais para percentuais de tela, 1 casa no máximo para tendência
4. Zero após questões ≠ zero sem questões — estados distintos

---

## WP-04 — Information architecture + UX flows

### Navegação proposta

```
Hoje | Plano | Estatísticas | Acompanhamento | Disciplinas
```

Subnav em Estatísticas:
```
Disciplinas | Conteúdos | Evolução
```

`Cadastro` deixa de ser tab permanente. Criar unidade = ação primária contextual `+ Nova aula` disponível no Plano e no Hoje.

`Configurações` = ícone de engrenagem no header, não tab.

### Fluxo 1 — Primeiro dia de Medicina

```
Abre app
→ Hoje: vazio (sem revisões), CTA "Cadastre sua primeira aula"
→ Clica "+ Nova aula" (inline panel no Hoje ou modal)
→ Escolhe/cria disciplina Fisiologia (inline, sem sair do fluxo)
→ Preenche: título, fonte, data, summary_body (opcional)
→ Salva → 16 review_tasks geradas
→ Hoje confirma: "Ótimo! Primeira revisão em [data]"
→ Pode adicionar exercícios imediatamente ou depois
→ Draft preservado se abrir Disciplinas inline
```

### Fluxo 2 — Criar unidade

```
Plano → "+ Nova aula"
→ Formulário mínimo: disciplina (dropdown + + Nova inline), título, fonte, data
→ summary_body: expansível, não obrigatório
→ Salva → unidade aparece no Plano
→ Exercícios: ação secundária na linha da unidade
```

### Fluxo 3 — Resumo Mestre

```
Plano → linha da unidade → expandir
→ summary_body exibido (ou placeholder "Sem Resumo Mestre — adicionar")
→ Clica "Editar Resumo" → textarea inline
→ Salva → summary_body persiste → estado "Resumo presente" deriva automaticamente
```

### Fluxo 4 — Exercícios (internos)

```
Plano → linha da unidade → "Exercícios (N)"
→ Lista de exercícios expandida
→ Botão "+ Adicionar exercício" → Q/R/Dica/Provenance
→ Exercícios de revisão: botões Acertei/Errei por questão
→ App calcula aggregate ao finalizar
→ Evidência entra em learning_evidence com context=REVIEW
```

### Fluxo 5 — Revisão do dia seguinte

```
Hoje → linha da revisão
→ Vê: disciplina (chip), título, "R1 • Vence hoje"
→ Clica "Revisar"
→ Para cada exercício: "Ver resposta" → Acertei / Errei
→ App conta: questions_count, correct_count, score_percent
→ Review concluída: marca review_task.review_done=true, insere learning_evidence
→ Linha passa para "Feitas hoje" com badge "Concluída X%"
```

### Fluxo 6 — Exercícios externos

```
Hoje/Plano → unidade → "Registrar exercícios externos"
→ n questões + n acertos (input numérico)
→ App calcula score, insere learning_evidence context=EXTERNAL
→ Estatísticas atualizam
```

### Fluxo 7 — Consultar disciplina fraca

```
Estatísticas → Disciplinas
→ Ordenado por pior weighted_accuracy
→ Fisiologia: 58% • 124 questões • ↓ CAINDO
→ Clica → filtra Conteúdos por Fisiologia
→ Vê quais conteúdos puxam para baixo
```

### Fluxo 8 — Abrir conteúdo fraco

```
Estatísticas → Conteúdos → filtra por Fisiologia
→ "Potencial de Ação": 42% • 38 questões • CAINDO
→ Clica → Acompanhamento filtrado nessa unidade
→ Vê: datas de estudo, exercícios, sequência de scores
→ CTA: "Adicionar ao plano de revisão" (se não tiver revisão pendente)
```

### Fluxo 9 — Enxergar evolução (6 meses)

```
Estatísticas → Evolução
→ Gráfico/tabela: weighted_accuracy por mês por disciplina
→ Sparklines por conteúdo com tendência
→ Fisiologia: Jan 54% → Mar 67% → Set 81%
→ Filtros: período, disciplina, mín questões
```

### UX-001 — Zero perda de draft

- Abrir "+ Nova disciplina" preserva o formulário de nova unidade
- Trocar de aba e voltar não apaga formulário incompleto (state local da tela)
- Solução técnica: estado do formulário em memória JS enquanto tab está ativa; persistência em localStorage somente se requisito explícito

### UX-003 — Zero metawork

- `summary_body` presente → "Resumo ✓" automático no Acompanhamento
- n exercícios derivado de `exercises.getAll(unit_id).length`
- `questions_count` calculado pelo app, nunca digitado manualmente em fluxo interno
- `review_done` marcado automaticamente quando exercícios concluídos (ou botão manual para revisão sem exercícios)

---

## WP-05 — Visual system

### Paleta base

Inspirada na referência da planilha, adaptada para app moderno com modo claro/escuro.

```
Tokens CSS (light mode):
  --color-navy-900: #1E3448  (backgrounds de cabeçalho)
  --color-navy-700: #253D55  (bordas estruturais)
  --color-navy-400: #A8B7D1  (secundário estrutural)
  --color-blue-100: #CEE0FF  (área de trabalho leve)
  --color-surface:  #F8FAFC  (background principal)
  --color-card:     #FFFFFF
  --color-border:   #E2E8F0
  --color-text:     #1A2332
  --color-muted:    #64748B

Tokens CSS (dark mode):
  --color-surface:  #0F1923
  --color-card:     #1A2838
  --color-border:   #2A3A4A
  --color-text:     #E8EFF8
  --color-muted:    #8FA3B8
```

### Cores de disciplina (paleta predefinida)

7 cores estáveis, atribuídas sequencialmente na criação, editáveis:
```
DISC-BLUE:   #3B82F6  / dark: #60A5FA
DISC-GREEN:  #10B981  / dark: #34D399
DISC-PURPLE: #8B5CF6  / dark: #A78BFA
DISC-ORANGE: #F59E0B  / dark: #FCD34D
DISC-RED:    #EF4444  / dark: #F87171
DISC-TEAL:   #14B8A6  / dark: #2DD4BF
DISC-PINK:   #EC4899  / dark: #F472B6
```

Uso: chip lateral (`border-left: 3px solid var(--subject-color)`), tag/badge, ponto em gráficos.
**Nunca:** fundo de card completo, texto em cor de disciplina sem contraste garantido.

### Cores de desempenho (semânticas)

```
STRONG:     #16A34A  / bg: #F0FDF4  (≥80%)
ADEQUATE:   #2563EB  / bg: #EFF6FF  (65–80%)
ATTENTION:  #D97706  / bg: #FFFBEB  (50–65%)
CRITICAL:   #DC2626  / bg: #FEF2F2  (<50%)
NO_EVIDENCE: #94A3B8 / bg: #F1F5F9  (sem dados)
```

Thresholds como constantes JS, não inline na UI.

### Tipografia

```
Font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
Tamanhos:
  --text-xs:  11px  (labels de tabela, metadados)
  --text-sm:  13px  (texto de linha compacta)
  --text-base: 15px (corpo)
  --text-lg:  18px  (títulos de seção)
  --text-xl:  22px  (KPIs grandes)
Peso: 400 (normal), 500 (médio/labels), 600 (títulos), 700 (KPI)
```

### Padrões de componente

**Linha compacta (Plano, Acompanhamento):**
```
[chip-disciplina] [título da unidade]          [badge-status] [próxima revisão] [ações]
Fonte: 12px muted                                                      ↕ expansão
```

**Linha de revisão (Hoje):**
```
[chip-disciplina] [R1 • Vence hoje] [título]          [% se concluída] [CTA Revisar]
```

**KPI de disciplina (Estatísticas):**
```
┌──────────────────────────────────┐
│ [chip] Fisiologia         CAINDO │
│ 58%  •  242 questões  •  ↓ 4 pp │
└──────────────────────────────────┘
```

**Sparkline de conteúdo:**
```
Potencial de Ação  42%  [▁▃▅▄▂]  CAINDO  38q  Últ: 12/ago
```

### Densidade

- Desktop (≥768px): tabela-card híbrida, linhas de ~36px, máximo de informação por pixel
- Mobile (<768px): linhas expandem para 2 linhas, CTA em linha separada
- Sem cards gigantes em desktop; sem tabelas truncadas em mobile
- Scroll interno (overflow-x: auto) para tabelas largas — body nunca scrolls horizontal

### Navegação

```
Tab bar fixo no bottom (mobile) / top (desktop)
Tabs: Hoje | Plano | Estatísticas | Acompanhamento | Disciplinas
Ícone de engrenagem no header (Configurações)
Subnav horizontal em Estatísticas: Disciplinas | Conteúdos | Evolução
```

---

## Requisitos não-funcionais

| ID | Requisito |
|----|-----------|
| NF-01 | Tauri 2 + SQLite como banco real; BrowserStore somente para tests |
| NF-02 | `schemaVersion: 3` no backup JSON após introdução de `learning_evidence` |
| NF-03 | Migrations idempotentes via `ensureColumns` |
| NF-04 | Testes: node:test, sem framework externo |
| NF-05 | CSS vars para todos os tokens — sem magic numbers de cor |
| NF-06 | Thresholds de desempenho como constantes nomeadas em módulo separado |
| NF-07 | Tendência: algoritmo determinístico, testável unitariamente |

---

## Critério de aceite global

A interface está pronta quando um usuário sem treinamento responde visualmente em <10s:
1. qual disciplina está pior
2. qual está melhor
3. quantas questões sustentam cada percentual
4. o que está vencido hoje
5. qual conteúdo está caindo
6. qual conteúdo melhorou
7. onde clicar para estudar/revisar agora

---

## HUMAN_GATE

```
HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL
```

**Parar aqui. Nenhuma implementação antes da aprovação desta spec.**
