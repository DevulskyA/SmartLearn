# spec.md — SmartLearn UI/Analytics vNext

**Feature:** smartlearn-ui-analytics-vnext
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

**CURRENT_DOMAIN_V3_SPEC_DEVIATION = NONE**

`subjects.color` e `learning_evidence` são extensões planejadas para este redesign, classificadas como VNEXT_DOMAIN_EXTENSION. Nenhuma implementação atual diverge do domínio v3 aprovado.

### Telas atuais

| Tab | Conteúdo atual | Problema |
|-----|---------------|---------|
| Hoje | ReviewRow linear por data | Sem cor de disciplina; sem densidade; sem prioridade visual clara |
| Cadastro | Formulário + gerenciamento de disciplinas inline | CRUD administrativo misturado ao fluxo principal |
| Estatísticas | KPIs simples + gráfico de linha por data | Sem disciplina breakdown, sem volume, sem tendência por conteúdo |
| Configurações | Tema + Backup | OK como área secundária |

**Temas existentes (todos preservados obrigatoriamente):** Automático, Papel, Sépia, Noite, Alto contraste.
O redesign visual adapta novos tokens a todos os 5 temas — não reduz para apenas light/dark.

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
| AC-RES-07 | O resumo de carga do dia (contagem de vencidas + hoje + amanhã + feitas) fica visível acima do fold em viewport padrão — as listas individuais podem rolar normalmente |

---

### Módulo 2 — Plano / RP

**Pergunta central:** O que já estudei e quando volta?

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

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-DET-01 | Execução com exercícios internos: app calcula questions_count e correct_count automaticamente |
| AC-DET-02 | Execução externa: usuário registra n questões + n acertos; score derivado deterministicamente |
| AC-DET-03 | Cada evidência tem: data, disciplina, learning unit, contexto (INITIAL_PRACTICE / REVIEW / EXTERNAL), questões, acertos, score derivado |
| AC-DET-04 | Evidência de revisão vinculada a review_task quando existir |
| AC-DET-05 | Detalhes da execução acessíveis a partir do Plano/RP por expansão |

---

### Módulo 4 — Estatística 1 / Desempenho por disciplina

**Pergunta central:** Como estou em cada matéria?

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-EST1-01 | Por disciplina: weighted_accuracy, total de questões, total de acertos, n conteúdos com evidência |
| AC-EST1-02 | Desempenho recente (janela de 30 dias, configurável) exibido junto ao geral |
| AC-EST1-03 | Tendência: ↑/↓/→ calculada deterministicamente — algoritmo delta-de-janelas (ver WP-03) |
| AC-EST1-04 | Estado semântico derivado de weighted_accuracy: crítico (<50%) / atenção (50-65%) / adequado (65-80%) / forte (≥80%) — thresholds configuráveis, não magic numbers |
| AC-EST1-05 | Sem evidência ≠ 0% — exibido como neutro/insuficiente, nunca vermelho |
| AC-EST1-06 | Ordenação padrão: pior → melhor; alternativa: melhor → pior, volume, tendência |
| AC-EST1-07 | Linha de disciplina nunca mostra só percentual — sempre `% + n questões` |

---

### Módulo 5 — Estatística 2 / Evolução por conteúdo

**Pergunta central:** Qual conteúdo está evoluindo, estagnado ou piorando?

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-EST2-01 | Por learning unit: disciplina, título, sequência temporal de scores, score atual, weighted_accuracy acumulada, n questões total, tendência, última evidência, próxima revisão |
| AC-EST2-02 | Tendência de unidade derivada dos últimos N scores (N ≥ 3) — algoritmo last-N (ver WP-03) |
| AC-EST2-03 | Visualização: microbarra ou sparkline simples suficiente; gráfico sofisticado não obrigatório |
| AC-EST2-04 | Filtros: por disciplina, por tendência (melhorando/caindo/estagnado), por período |
| AC-EST2-05 | Ordenação padrão: pior score recente → melhor; alternativas: tendência, volume, disciplina, última atividade |

---

### Módulo 6 — Acompanhamento

**Pergunta central:** Qual é o estado de cada unidade no meu processo de aprendizagem?

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-ACOMP-01 | Por unidade: disciplina, título, study_date, fonte, Resumo Mestre (auto: presente se summary_body != null), n exercícios, questões/acertos/%, revisões feitas / pendentes, última atividade, estado atual |
| AC-ACOMP-02 | "Resumo Mestre presente" derivado automaticamente de summary_body — sem checkbox manual |
| AC-ACOMP-03 | Estado atual derivado deterministicamente: SEM_EVIDENCIA / EM_ESTUDO / EM_REVISAO / ATRASADO / EM_DIA |
| AC-ACOMP-04 | Filtros: disciplina, estado, período |
| AC-ACOMP-05 | Ação rápida: abrir unidade, adicionar Resumo Mestre, ir para revisão pendente |

**Definição dos estados derivados:**

| Estado | Condição |
|--------|----------|
| SEM_EVIDENCIA | Nenhuma learning_evidence registrada para a unidade |
| EM_ESTUDO | Tem evidência mas nenhuma review_task pendente (ex.: evidência só de INITIAL_PRACTICE) |
| EM_DIA | Tem review_task(s) pendente(s) com due_date >= hoje |
| ATRASADO | Tem review_task(s) com due_date < hoje e review_done = false |
| EM_REVISAO | Tem review_tasks pendentes, todas dentro do prazo (subconjunto de EM_DIA com múltiplas revisões ativas) |

---

### Módulo 7 — Disciplinas

**Pergunta central:** Quais são minhas áreas e qual a identidade visual delas?

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-DISC-01 | Cada disciplina tem: nome, cor estável, estado (ativo/arquivado), n learning units, weighted_accuracy quando houver evidência |
| AC-DISC-02 | Cor de disciplina é da identidade, nunca do desempenho |
| AC-DISC-03 | Criar disciplina: fluxo inline de uma linha (+ Nova disciplina), sem tela separada |
| AC-DISC-04 | Arquivar sempre preserva todo o histórico (evidências, revisões, exercícios). Hard delete permitido SOMENTE quando a disciplina não possuir nenhuma learning_unit — disciplina com histórico não pode apagar conhecimento/evidência. FKs devem impedir destruição acidental. |
| AC-DISC-05 | Cor selecionável de paleta predefinida de 12 cores (definir em design.md) |

---

## WP-03 — Analytics domain

### Unidade de evidência

O modelo atual usa `review_tasks` como único lugar de evidência. Auditoria revelou conflito semântico: `review_tasks` responde **quando revisar**, `learning_evidence` responde **como o aluno foi**. São relacionados mas não a mesma entidade. Ver CURRENT_UI_ANALYTICS_AUDIT.md §Auditoria arquitetural.

**Decisão: Opção B** — tabela separada `learning_evidence`.

Schema mínimo (contrato único):
```sql
CREATE TABLE IF NOT EXISTS learning_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES learning_units(id),
  evidence_date TEXT NOT NULL,
  context TEXT NOT NULL CHECK(context IN ('INITIAL_PRACTICE','REVIEW','EXTERNAL')),
  questions_count INTEGER NOT NULL CHECK(questions_count > 0),
  correct_count INTEGER NOT NULL CHECK(correct_count >= 0),
  -- score_percent: coluna de cache derivada (correct_count / questions_count * 100).
  -- NÃO é source of truth — apenas para queries sem recalcular. Se ausente, derivar na camada JS.
  score_percent REAL,
  review_task_id INTEGER REFERENCES review_tasks(id),  -- obrigatório quando context='REVIEW'; NULL nos demais
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
-- Índice único parcial: uma review_task gera no máximo uma evidência agregada
CREATE UNIQUE INDEX IF NOT EXISTS ux_le_review_task ON learning_evidence(review_task_id)
  WHERE review_task_id IS NOT NULL;
```

**Enum canônico — usar em SQL, DB API, spec, design, tasks, testes e exemplos:**

| Valor | Significado |
|-------|-------------|
| `INITIAL_PRACTICE` | Exercícios executados no estudo inicial, antes de qualquer revisão programada |
| `REVIEW` | Execução durante revisão programada; `review_task_id` obrigatório |
| `EXTERNAL` | Questões externas (simulado, banco); `review_task_id` deve ser NULL |

**Integridade por contexto (validada na camada DB antes do INSERT):**
- `context = 'REVIEW'` → `review_task_id IS NOT NULL`
- `context IN ('INITIAL_PRACTICE', 'EXTERNAL')` → `review_task_id IS NULL`
- `correct_count <= questions_count` — validação de app (SQLite não suporta CHECK cross-column)

**Atomicidade:** UPDATE de review_task + INSERT de learning_evidence executados juntos ou não. Ver DB.completeReviewWithEvidence em design.md.

### Agregações obrigatórias

**Por disciplina:**
```
weighted_accuracy(subject) = SUM(le.correct_count) / SUM(le.questions_count)
  WHERE le.unit_id IN (lu.id WHERE lu.subject_id = subject.id)
  AND le.questions_count > 0
total_questions(subject) = SUM(le.questions_count) WHERE ...
recent_accuracy(subject, window=30d) = weighted_accuracy filtrado por evidence_date >= today - 30
```

**Por learning unit:**
```
weighted_accuracy(unit) = SUM(le.correct_count) / SUM(le.questions_count) WHERE le.unit_id = unit.id
scores_sequence(unit) = [le.score_percent ORDER BY le.evidence_date ASC]
latest_score(unit) = scores_sequence[-1]
recent_score(unit, window=30d) = weighted_accuracy últimos 30 dias
```

**Estado semântico (thresholds configuráveis — não hardcodar na UI):**
```
STRONG      = weighted_accuracy >= 0.80
ADEQUATE    = 0.65 <= weighted_accuracy < 0.80
ATTENTION   = 0.50 <= weighted_accuracy < 0.65
CRITICAL    = weighted_accuracy < 0.50
NO_EVIDENCE = sem learning_evidence ou questions_count = 0
```

**PERFORMANCE_BAND != MASTERY:**
Os estados STRONG/ADEQUATE/ATTENTION/CRITICAL são heurísticas visuais de desempenho em questões. Não representam domínio clínico, retenção causal ou competência médica. Os thresholds são defaults configuráveis de apresentação, não verdade científica. Documentar esta distinção em `performance-thresholds.js` e no UI de ajuda.

### Algoritmos de tendência (dois algoritmos explícitos, sem contradição)

**Algoritmo de tendência por disciplina — delta de janelas:**
```
recent_30d   = weighted_accuracy(evidence_date >= today - 30d)
previous_30d = weighted_accuracy(today - 60d <= evidence_date < today - 30d)
trend_subject:
  SE recent_30d ou previous_30d tiver < 10 questões → INSUFFICIENT
  SENÃO delta = recent_30d - previous_30d
    delta > +0.03  → IMPROVING
    delta < -0.03  → DECLINING
    senão          → STABLE
```

**Algoritmo de tendência por conteúdo (learning unit) — last-N scores:**
```
window = últimos N scores da scores_sequence (N = 3 mínimo, configurável)
trend_unit:
  SE len(window) < 3 → INSUFFICIENT
  SENÃO delta = window[-1] - window[0]
    delta > +0.05  → IMPROVING
    delta < -0.05  → DECLINING
    senão          → STABLE
```

Estes são os únicos dois algoritmos de tendência. Nenhuma outra descrição (ex.: regressão linear, média móvel) é válida nesta versão.

### Regras de honestidade estatística

1. Percentual sem volume é incompleto — sempre `% + n questões`
2. Sem evidência ≠ 0% — estado neutro/insuficiente
3. Sem precisão falsa — 0 casas decimais para percentuais de tela
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

`Cadastro` deixa de ser tab permanente. Criar unidade = ação primária contextual `+ Nova aula` disponível no Plano.

`Configurações` = ícone de engrenagem no header, não tab. Temas (Automático/Papel/Sépia/Noite/Alto contraste) permanecem em Configurações.

### Fluxos principais (resumo)

**Fluxo 1 — Primeiro dia:** Hoje vazio → CTA + Nova aula → disciplina inline → título/fonte/data → salva → 16 review_tasks geradas → draft preservado durante + Nova disciplina.

**Fluxo 2 — Criar unidade:** Plano → + Nova aula → formulário inline → salva → unidade no Plano.

**Fluxo 3 — Resumo Mestre:** Plano → expandir unidade → editar summary_body inline → salva.

**Fluxo 4 — Exercícios internos:**  Plano → expandir → exercícios → Acertei/Errei → app calcula aggregate → evidência `context='REVIEW'` com atomicidade DB.

**Fluxo 5 — Revisão do dia seguinte:** Hoje → revisar → Acertei/Errei → app calcula → completeReviewWithEvidence (atômico) → badge "Concluída X%".

**Fluxo 6 — Exercícios externos:** Hoje/Plano → Registrar externos → n questões + n acertos → `context='EXTERNAL'` → Estatísticas atualizam.

**Fluxo 7 — Disciplina fraca:** Estatísticas → Disciplinas → ordenado por pior → clica → filtra Conteúdos por disciplina.

**Fluxo 8 — Conteúdo fraco:** Estatísticas → Conteúdos → conteúdo CRITICAL → Acompanhamento filtrado.

**Fluxo 9 — Evolução 6 meses:** Estatísticas → Evolução → gráfico weighted_accuracy por mês por disciplina.

### UX-001 — Zero perda de draft

- Abrir + Nova disciplina preserva o formulário de nova unidade
- Trocar de aba e voltar não apaga formulário incompleto (state local JS enquanto tab ativa)

### UX-003 — Zero metawork

- `summary_body` presente → "Resumo ✓" automático no Acompanhamento
- n exercícios derivado de `exercises.getAll(unit_id).length`
- `questions_count` calculado pelo app, nunca digitado manualmente em fluxo interno

---

## WP-05 — Visual system

### Paleta base

```
Tokens CSS (light mode):
  --color-navy-900: #1E3448
  --color-navy-700: #253D55
  --color-navy-400: #A8B7D1
  --color-blue-100: #CEE0FF
  --color-surface:  #F8FAFC
  --color-card:     #FFFFFF
  --color-border:   #E2E8F0
  --color-text:     #1A2332
  --color-muted:    #64748B

Tokens CSS (dark mode — tema Noite):
  --color-surface:  #0F1923
  --color-card:     #1A2838
  --color-border:   #2A3A4A
  --color-text:     #E8EFF8
  --color-muted:    #8FA3B8
```

Todos os tokens devem ser redefinidos para cada um dos 5 temas existentes (Automático, Papel, Sépia, Noite, Alto contraste). Ver WP-F1 para UAT de regressão visual por tema.

### Cores de disciplina (paleta predefinida — 12 cores)

12 cores estáveis para Medicina, atribuídas sequencialmente na criação, editáveis:
```
DISC-BLUE:    #3B82F6  / dark: #60A5FA
DISC-GREEN:   #10B981  / dark: #34D399
DISC-PURPLE:  #8B5CF6  / dark: #A78BFA
DISC-ORANGE:  #F59E0B  / dark: #FCD34D
DISC-RED:     #EF4444  / dark: #F87171
DISC-TEAL:    #14B8A6  / dark: #2DD4BF
DISC-PINK:    #EC4899  / dark: #F472B6
DISC-INDIGO:  #6366F1  / dark: #818CF8
DISC-LIME:    #84CC16  / dark: #A3E635
DISC-AMBER:   #D97706  / dark: #F59E0B
DISC-CYAN:    #06B6D4  / dark: #22D3EE
DISC-ROSE:    #F43F5E  / dark: #FB7185
```

Uso: chip lateral (`border-left: 3px solid var(--subject-color)`), tag/badge, ponto em gráficos.
**Nunca:** fundo de card completo, texto em cor de disciplina sem contraste garantido, cor de disciplina como proxy de desempenho.

Cor de disciplina = identidade estável e separada de cor de desempenho.

### Cores de desempenho (semânticas)

```
STRONG:     #16A34A  / bg: #F0FDF4  (>=80%)
ADEQUATE:   #2563EB  / bg: #EFF6FF  (65-80%)
ATTENTION:  #D97706  / bg: #FFFBEB  (50-65%)
CRITICAL:   #DC2626  / bg: #FEF2F2  (<50%)
NO_EVIDENCE:#94A3B8  / bg: #F1F5F9  (sem dados)
```

Thresholds como constantes JS, não inline na UI.

**PERFORMANCE_BAND != MASTERY:** ver WP-03.

### Tipografia

```
Font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
--text-xs:   11px  (labels de tabela, metadados)
--text-sm:   13px  (texto de linha compacta)
--text-base: 15px  (corpo)
--text-lg:   18px  (títulos de seção)
--text-xl:   22px  (KPIs grandes)
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
┌──────────────────────────────────────┐
│ [chip] Fisiologia         CAINDO     │
│ 58%  •  242 questões  •  ↓ 4 pp     │
└──────────────────────────────────────┘
```

**Sparkline de conteúdo:**
```
Potencial de Ação  42%  [▁▃▅▄▂]  CAINDO  38q  Últ: 12/ago
```

### Densidade

- Desktop (>=768px): tabela-card híbrida, linhas de ~36px, máximo de informação por pixel
- Mobile (<768px): linhas expandem para 2 linhas, CTA em linha separada
- Sem cards gigantes em desktop; sem tabelas truncadas em mobile
- Scroll interno (overflow-x: auto) para tabelas largas — body nunca scrolls horizontal

### Navegação

```
Tab bar fixo no bottom (mobile) / top (desktop)
Tabs: Hoje | Plano | Estatísticas | Acompanhamento | Disciplinas
Ícone de engrenagem no header (Configurações com 5 temas)
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
| NF-07 | Tendência: dois algoritmos explícitos (subject=delta-de-janelas, unit=last-N), determinísticos, testáveis unitariamente |
| NF-08 | Todos os 5 temas existentes preservados; novos tokens visuais adaptados a cada um |
| NF-09 | DOMAIN_V3_REAL_SQLITE_BASELINE = PASS obrigatório antes de qualquer implementação de learning_evidence |

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
