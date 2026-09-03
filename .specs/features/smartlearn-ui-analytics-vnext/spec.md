# spec.md â€” SmartLearn Product/UX/Analytics Redesign

**Feature:** smartlearn-ui-analytics-vnext
**ClassificaÃ§Ã£o:** Complex / high-risk
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL â€” parar antes de qualquer implementaÃ§Ã£o

---

## WP-01 â€” Estado real e reconciliaÃ§Ã£o

### Baseline tÃ©cnico preservado

Branch: `claude/com-tlc-replanning-77f844`

| Commit | ConteÃºdo | Status |
|--------|---------|--------|
| `5a43fd4` | db.js: `learning_units`, `title`, `provenance`, `schemaVersion 2`; stats.js; scheduler.js; 44 testes | LOCAL_BROWSER_BASELINE=PASS |
| `9ee5793` | app.js: `studyRecordsâ†’learningUnits`, `contentâ†’title`, `provenance:'MANUAL'` | LOCAL_BROWSER_BASELINE=PASS |
| `998b3b2` | validation.md: UAT Fisiologia/Guyton | PASS (BrowserStore) |
| `77911b3` | STATE.md: gates, TLC_INSTALLATION_MISMATCH | Doc |

**REAL_TAURI_SQLITE_CLOSURE = PENDING** â€” migrations SQL nÃ£o validadas em SQLite nativo.

### Modelo de domÃ­nio atual (aprovado, preservado)

```
subjects
  â””â”€â”€ id, name, created_at, updated_at, is_active, sort_order

learning_units
  â””â”€â”€ id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at

exercises
  â””â”€â”€ id, unit_id, question_text, answer_text, hint_text, position, provenance
      provenance âˆˆ {MANUAL, SOURCE, AI_GENERATED}

review_tasks
  â””â”€â”€ id, unit_id, review_number, due_date, review_done, questions_done,
      questions_count, correct_count, score_percent, completed_at, comment
```

**Invariantes preservadas:**
- `source_text` Ã© texto livre, nÃ£o entidade
- `summary_body` Ã© Resumo Mestre permanente da unidade
- `hint_text` Ã© pista pedagÃ³gica exclusivamente
- `provenance` obrigatÃ³rio e fail-closed
- zero seeds acadÃªmicos
- `scheduler.js` como boundary substituÃ­vel (LEGACY_TEMPORARY)
- BrowserStore apenas como adapter/test double
- `schemaVersion: 2` no backup JSON

### Telas atuais

| Tab | ConteÃºdo atual | Problema |
|-----|---------------|---------|
| Hoje | ReviewRow linear por data | Sem cor de disciplina; sem densidade; sem prioridade visual clara |
| Cadastro | FormulÃ¡rio + gerenciamento de disciplinas inline | CRUD administrativo misturado ao fluxo principal |
| EstatÃ­sticas | KPIs simples + grÃ¡fico de linha por data | Sem disciplina breakdown, sem volume, sem tendÃªncia por conteÃºdo |
| ConfiguraÃ§Ãµes | Tema + Backup | OK como Ã¡rea secundÃ¡ria |

### stats.js atual

- `Stats.calculate(reviewTasks, learningUnits, subjects, today)` â†’ weighted by questionsCount dentro de completedExercises
- Retorna: `totalQuestions`, `totalCorrect`, `avgScore`, `completedExercises`, `avgBySubject`, `reviewsDone`, `reviewsPending`, `reviewsOverdue`
- **Gap:** agrega por disciplina mas nÃ£o por conteÃºdo; sem tendÃªncia; sem janela temporal; sem evidÃªncia externa

### DecisÃµes histÃ³ricas que continuam vÃ¡lidas

- DEC-001: HTML/CSS/JS puro, Vite + Tauri 2 â€” sim
- DEC-003 (superseded para vNext): scheduler.js como boundary â€” sim
- DEC-009: Tauri 2 Ãºnico alvo â€” sim
- DEC-011: db.js Ãºnico ponto SQL â€” sim
- DEC-012: disciplina como entidade prÃ³pria â€” sim
- DEC-016 (vNext): scheduler boundary, LEGACY_TEMPORARY â€” sim

---

## WP-02 â€” Functional mapping: planilha â†’ SmartLearn (7 mÃ³dulos)

### MÃ³dulo 1 â€” Resumo (hoje: "Hoje")

**Pergunta central:** O que precisa da minha atenÃ§Ã£o agora?

**O que a planilha faz bem:**
- Filtra e ordena por urgÃªncia
- Cada linha = uma unidade de trabalho com contexto mÃ­nimo suficiente
- Vencidas visualmente separadas das de hoje

**O que preservar como princÃ­pio:**
- OrdenaÃ§Ã£o por urgÃªncia (vencidas > hoje > amanhÃ£ preview)
- Cada linha: disciplina + tÃ­tulo + tipo revisÃ£o + status + CTA
- Densidade: uma linha = uma decisÃ£o

**O que rejeitar:**
- CÃ©lulas com fÃ³rmulas; colunas estÃ¡ticas com datas fixas; mistura de metadados e execuÃ§Ã£o

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-RES-01 | RevisÃµes vencidas aparecem antes das de hoje, em seÃ§Ã£o visualmente distinta |
| AC-RES-02 | Cada linha de revisÃ£o mostra: chip de disciplina (com cor), tÃ­tulo da unidade, nÃºmero da revisÃ£o, status, CTA para revisar |
| AC-RES-03 | Concluir revisÃ£o atualiza a tela sem navegaÃ§Ã£o administrativa |
| AC-RES-04 | Status visual nÃ£o depende exclusivamente de cor (Ã­cone ou texto acompanha) |
| AC-RES-05 | Preview de amanhÃ£ Ã© leve â€” sem CTA, sem expansÃ£o |
| AC-RES-06 | Tela de aÃ§Ã£o (Hoje) nÃ£o contÃ©m gerenciamento de disciplinas nem formulÃ¡rios de cadastro |
| AC-RES-07 | Carga do dia (revisÃµes vencidas + hoje + amanhÃ£ + feitas) visÃ­vel sem scroll em viewport padrÃ£o |

---

### MÃ³dulo 2 â€” Plano / RP

**Pergunta central:** O que jÃ¡ estudei e quando volta?

**O que a planilha faz bem:**
- InventÃ¡rio completo por unidade
- Data de estudo + prÃ³xima revisÃ£o + estado legÃ­vel

**O que preservar como princÃ­pio:**
- VisÃ£o longitudinal do inventÃ¡rio de unidades
- Dados mÃ­nimos por linha, expansÃ£o sob demanda

**O que rejeitar:**
- Exibir 16 colunas de datas de revisÃ£o â€” o scheduler Ã© interno
- EdiÃ§Ã£o inline de cÃ©lulas como interface principal

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-RP-01 | Cada unidade mostra: disciplina (chip), tÃ­tulo, study_date, fonte, status Resumo Mestre (presente/ausente), n exercÃ­cios, prÃ³xima revisÃ£o, Ãºltima atividade |
| AC-RP-02 | VisÃ£o padrÃ£o compacta â€” uma linha por unidade |
| AC-RP-03 | ExpansÃ£o por demanda revela: summary_body, exercÃ­cios, histÃ³rico de revisÃµes |
| AC-RP-04 | 16 tarefas internas do scheduler NÃƒO aparecem como 16 linhas na UI |
| AC-RP-05 | Filtros: por disciplina, por estado (sem revisÃ£o, pendente, em dia) |
| AC-RP-06 | OrdenaÃ§Ã£o padrÃ£o por study_date desc; alternativas: disciplina, prÃ³xima revisÃ£o |

---

### MÃ³dulo 3 â€” Detalhe / ExecuÃ§Ã£o / EvidÃªncia

**Pergunta central:** O que executei e qual foi o resultado?

**O que a planilha faz bem:**
- Por execuÃ§Ã£o: volume + resultado â†’ percentual derivado
- VÃ­nculo com unidade/disciplina

**O que preservar como princÃ­pio:**
- EvidÃªncia = volume + resultado, nunca apenas percentual
- Quando exercÃ­cios internos: app calcula, usuÃ¡rio nÃ£o digita contagens
- Quando externos: registro agregado simples (n questÃµes, n acertos)

**O que rejeitar:**
- DigitaÃ§Ã£o manual de questÃµes/acertos quando o app jÃ¡ executou os exercÃ­cios
- EvidÃªncia presa semanticamente a "revisÃ£o"

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-DET-01 | ExecuÃ§Ã£o com exercÃ­cios internos: app calcula questions_count e correct_count automaticamente |
| AC-DET-02 | ExecuÃ§Ã£o externa: usuÃ¡rio registra n questÃµes + n acertos; score derivado |
| AC-DET-03 | Cada evidÃªncia tem: data, disciplina, learning unit, contexto (INITIAL_STUDY / REVIEW / EXTERNAL), questÃµes, acertos, score_percent |
| AC-DET-04 | EvidÃªncia de revisÃ£o vinculada a review_task quando existir |
| AC-DET-05 | Detalhes da execuÃ§Ã£o acessÃ­veis a partir do Plano/RP por expansÃ£o |

---

### MÃ³dulo 4 â€” EstatÃ­stica 1 / Desempenho por disciplina

**Pergunta central:** Como estou em cada matÃ©ria?

**O que a planilha faz bem:**
- Percentual por disciplina
- Volume que sustenta o percentual (honestidade estatÃ­stica)

**O que preservar como princÃ­pio:**
- `weighted_accuracy = SUM(correct) / SUM(questions)` â€” nÃ£o mÃ©dia de sessÃµes
- Percentual sempre acompanhado de volume
- Estado semÃ¢ntico: crÃ­tico / atenÃ§Ã£o / adequado / forte

**O que rejeitar:**
- MÃ©dia simples de sessÃµes como mÃ©trica primÃ¡ria
- Percentual sem volume

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-EST1-01 | Por disciplina: weighted_accuracy, total de questÃµes, total de acertos, n conteÃºdos com evidÃªncia |
| AC-EST1-02 | Desempenho recente (janela de 30 dias, configurÃ¡vel) exibido junto ao geral |
| AC-EST1-03 | TendÃªncia: â†‘/â†“/â†’ calculada deterministicamente (definir mÃ©todo em design.md) |
| AC-EST1-04 | Estado semÃ¢ntico derivado de weighted_accuracy: crÃ­tico (<50%) / atenÃ§Ã£o (50-65%) / adequado (65-80%) / forte (>80%) â€” thresholds configurÃ¡veis, nÃ£o magic numbers |
| AC-EST1-05 | Sem evidÃªncia â‰  0% â€” exibido como neutro/insuficiente, nunca vermelho |
| AC-EST1-06 | OrdenaÃ§Ã£o padrÃ£o: pior â†’ melhor; alternativa: melhor â†’ pior, volume, tendÃªncia |
| AC-EST1-07 | Linha de disciplina nunca mostra sÃ³ percentual â€” sempre `% + n questÃµes` |

---

### MÃ³dulo 5 â€” EstatÃ­stica 2 / EvoluÃ§Ã£o por conteÃºdo

**Pergunta central:** Qual conteÃºdo estÃ¡ evoluindo, estagnado ou piorando?

**O que a planilha faz bem:**
- HistÃ³rico cronolÃ³gico de resultados por linha
- EvidÃªncia acumulada por conteÃºdo

**O que preservar como princÃ­pio:**
- SequÃªncia temporal de scores por unidade
- TendÃªncia Ã³bvia: MELHORANDO / CAINDO / ESTAGNADO
- Tabela bem desenhada pode ser superior a grÃ¡fico sofisticado

**O que rejeitar:**
- GrÃ¡fico decorativo sem aÃ§Ã£o
- TendÃªncia baseada em IA preditiva nesta fase

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-EST2-01 | Por learning unit: disciplina, tÃ­tulo, sequÃªncia temporal de scores, score atual, weighted_accuracy acumulada, n questÃµes total, tendÃªncia, Ãºltima evidÃªncia, prÃ³xima revisÃ£o |
| AC-EST2-02 | TendÃªncia derivada deterministicamente dos Ãºltimos N resultados (N=3 min, configurÃ¡vel) |
| AC-EST2-03 | VisualizaÃ§Ã£o: microbarra ou sparkline simples suficiente; grÃ¡fico sofisticado nÃ£o obrigatÃ³rio |
| AC-EST2-04 | Filtros: por disciplina, por tendÃªncia (melhorando/caindo/estagnado), por perÃ­odo |
| AC-EST2-05 | OrdenaÃ§Ã£o padrÃ£o: pior score recente â†’ melhor; alternativas: tendÃªncia, volume, disciplina, Ãºltima atividade |

---

### MÃ³dulo 6 â€” Acompanhamento

**Pergunta central:** Qual Ã© o estado de cada unidade no meu processo de aprendizagem?

**O que a planilha faz bem:**
- Matriz longitudinal: uma linha por unidade, colunas = dimensÃµes do processo
- VisÃ£o de estado, nÃ£o de execuÃ§Ã£o

**O que preservar como princÃ­pio:**
- Dados derivÃ¡veis pelo sistema nunca exigem input manual
- Estado completo por unidade: Resumo Mestre, exercÃ­cios, evidÃªncia, revisÃµes

**O que rejeitar:**
- Checkboxes manuais para fatos que o app conhece
- Campos duplicados com outras telas

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-ACOMP-01 | Por unidade: disciplina, tÃ­tulo, study_date, fonte, Resumo Mestre (auto: presente se summary_body != null), n exercÃ­cios, questÃµes/acertos/%, revisÃµes feitas / pendentes, Ãºltima atividade, estado atual |
| AC-ACOMP-02 | "Resumo Mestre presente" derivado automaticamente de summary_body â€” sem checkbox manual |
| AC-ACOMP-03 | Estado atual derivado: sem evidÃªncia / em estudo / em revisÃ£o / atrasado / concluÃ­do |
| AC-ACOMP-04 | Filtros: disciplina, estado, perÃ­odo |
| AC-ACOMP-05 | AÃ§Ã£o rÃ¡pida: abrir unidade, adicionar Resumo Mestre, ir para revisÃ£o pendente |

---

### MÃ³dulo 7 â€” Disciplinas

**Pergunta central:** Quais sÃ£o minhas Ã¡reas e qual a identidade visual delas?

**O que a planilha faz bem:**
- CatÃ¡logo simples com identidade por cor

**O que preservar como princÃ­pio:**
- Cor de disciplina = identidade estÃ¡vel, nÃ£o desempenho
- Criar/editar/arquivar sem tela pesada

**O que rejeitar:**
- Gerenciador pesado com formulÃ¡rios longos
- Cor de disciplina reutilizada para sinalizar bom/ruim

**Requisitos SmartLearn:**

| ID | Requisito |
|----|-----------|
| AC-DISC-01 | Cada disciplina tem: nome, cor estÃ¡vel, estado (ativo/arquivado), n learning units, weighted_accuracy quando houver evidÃªncia |
| AC-DISC-02 | Cor de disciplina Ã© da identidade, nunca do desempenho |
| AC-DISC-03 | Criar disciplina: fluxo inline de uma linha (+ Nova disciplina), sem tela separada |
| AC-DISC-04 | Arquivar preserva histÃ³rico; excluir Ã© destrutivo com confirmaÃ§Ã£o |
| AC-DISC-05 | Cor selecionÃ¡vel de paleta predefinida de N cores (definir em design.md) |

---

## WP-03 â€” Analytics domain

### Unidade de evidÃªncia

O modelo atual usa `review_tasks` como Ãºnico lugar de evidÃªncia. A planilha revelou que precisamos de uma camada independente.

### DecisÃ£o de design: OpÃ§Ã£o A vs B

**OpÃ§Ã£o A â€” `review_tasks` + campos agregados (status quo)**

PrÃ³s:
- nenhuma migration nova
- 44 testes passam sem mudanÃ§a
- menor custo imediato

Contras:
- exercÃ­cios externos/iniciais ficam semanticamente presos a "review"
- analytics independente de revisÃ£o (ex.: estudo inicial) nÃ£o Ã© representÃ¡vel
- campo `context` seria hack sobre `review_tasks`

**OpÃ§Ã£o B â€” tabela genÃ©rica `learning_evidence`**

Schema mÃ­nimo:
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

PrÃ³s:
- analytics independente do scheduler
- suporta INITIAL_STUDY, REVIEW, EXTERNAL sem hack
- migraÃ§Ã£o de `review_tasks` existentes Ã© `INSERT INTO learning_evidence SELECT ... WHERE questions_done = true`
- `review_tasks` fica como agenda/plano; `learning_evidence` fica como resultado

Contras:
- migration necessÃ¡ria
- testes de stats.js precisam refatoraÃ§Ã£o
- mais escopo agora

### RecomendaÃ§Ã£o

**OpÃ§Ã£o B com migraÃ§Ã£o gradual.** RazÃ£o: a contradiÃ§Ã£o semÃ¢ntica da OpÃ§Ã£o A gera dÃ­vida que cresce com cada novo tipo de evidÃªncia. O custo da OpÃ§Ã£o B sobe se postergado (mais dados para migrar). A migration Ã© simples; os testes de stats refatorados ficam mais claros.

**EstratÃ©gia de migraÃ§Ã£o:**
1. Criar `learning_evidence` via `ensureColumns` / migration idempotente
2. Popular `learning_evidence` a partir de `review_tasks` onde `questions_done = true`
3. `review_tasks` continua como agenda; analytics lÃª exclusivamente de `learning_evidence`
4. `schemaVersion` evolui para `3` no backup JSON

### AgregaÃ§Ãµes obrigatÃ³rias

**Por disciplina:**
```
weighted_accuracy(subject) = SUM(le.correct_count) / SUM(le.questions_count)
  WHERE le.unit_id IN (lu.id WHERE lu.subject_id = subject.id)
  AND le.questions_count > 0
total_questions(subject) = SUM(le.questions_count) WHERE ...
recent_accuracy(subject, window=30d) = weighted_accuracy filtrado por evidence_date >= today - 30
trend(subject) = recent_accuracy - accuracy_before_window  [determinÃ­stico]
```

**Por learning unit:**
```
weighted_accuracy(unit) = SUM(le.correct_count) / SUM(le.questions_count) WHERE le.unit_id = unit.id
scores_sequence(unit) = [le.score_percent ORDER BY le.evidence_date ASC]
trend(unit) = sinal de regressÃ£o linear simples nos Ãºltimos min(N, len) scores  [determinÃ­stico]
  onde N=3 por padrÃ£o
latest_score(unit) = scores_sequence[-1]
recent_score(unit, window=30d) = weighted_accuracy Ãºltimos 30 dias
```

**Estado semÃ¢ntico (thresholds configurÃ¡veis):**
```
STRONG   = weighted_accuracy >= 0.80
ADEQUATE = 0.65 <= weighted_accuracy < 0.80
ATTENTION = 0.50 <= weighted_accuracy < 0.65
CRITICAL = weighted_accuracy < 0.50
NO_EVIDENCE = questions_count = 0 or null
```

**TendÃªncia determinÃ­stica (mÃ©todo escolhido: delta de janelas):**
```
recent = weighted_accuracy(evidence_date >= today - 30)
previous = weighted_accuracy(today - 60 <= evidence_date < today - 30)
trend = recent - previous
  â†‘ IMPROVING if trend > +0.03
  â†“ DECLINING if trend < -0.03
  â†’ STABLE otherwise
  INSUFFICIENT if recent or previous has < 10 questÃµes
```

### Regras de honestidade estatÃ­stica

1. Percentual sem volume Ã© incompleto â€” sempre `% + n questÃµes`
2. Sem evidÃªncia â‰  0% â€” estado neutro/insuficiente
3. Sem precisÃ£o falsa â€” 0 casas decimais para percentuais de tela, 1 casa no mÃ¡ximo para tendÃªncia
4. Zero apÃ³s questÃµes â‰  zero sem questÃµes â€” estados distintos

---

## WP-04 â€” Information architecture + UX flows

### NavegaÃ§Ã£o proposta

```
Hoje | Plano | EstatÃ­sticas | Acompanhamento | Disciplinas
```

Subnav em EstatÃ­sticas:
```
Disciplinas | ConteÃºdos | EvoluÃ§Ã£o
```

`Cadastro` deixa de ser tab permanente. Criar unidade = aÃ§Ã£o primÃ¡ria contextual `+ Nova aula` disponÃ­vel no Plano e no Hoje.

`ConfiguraÃ§Ãµes` = Ã­cone de engrenagem no header, nÃ£o tab.

### Fluxo 1 â€” Primeiro dia de Medicina

```
Abre app
â†’ Hoje: vazio (sem revisÃµes), CTA "Cadastre sua primeira aula"
â†’ Clica "+ Nova aula" (inline panel no Hoje ou modal)
â†’ Escolhe/cria disciplina Fisiologia (inline, sem sair do fluxo)
â†’ Preenche: tÃ­tulo, fonte, data, summary_body (opcional)
â†’ Salva â†’ 16 review_tasks geradas
â†’ Hoje confirma: "Ã“timo! Primeira revisÃ£o em [data]"
â†’ Pode adicionar exercÃ­cios imediatamente ou depois
â†’ Draft preservado se abrir Disciplinas inline
```

### Fluxo 2 â€” Criar unidade

```
Plano â†’ "+ Nova aula"
â†’ FormulÃ¡rio mÃ­nimo: disciplina (dropdown + + Nova inline), tÃ­tulo, fonte, data
â†’ summary_body: expansÃ­vel, nÃ£o obrigatÃ³rio
â†’ Salva â†’ unidade aparece no Plano
â†’ ExercÃ­cios: aÃ§Ã£o secundÃ¡ria na linha da unidade
```

### Fluxo 3 â€” Resumo Mestre

```
Plano â†’ linha da unidade â†’ expandir
â†’ summary_body exibido (ou placeholder "Sem Resumo Mestre â€” adicionar")
â†’ Clica "Editar Resumo" â†’ textarea inline
â†’ Salva â†’ summary_body persiste â†’ estado "Resumo presente" deriva automaticamente
```

### Fluxo 4 â€” ExercÃ­cios (internos)

```
Plano â†’ linha da unidade â†’ "ExercÃ­cios (N)"
â†’ Lista de exercÃ­cios expandida
â†’ BotÃ£o "+ Adicionar exercÃ­cio" â†’ Q/R/Dica/Provenance
â†’ ExercÃ­cios de revisÃ£o: botÃµes Acertei/Errei por questÃ£o
â†’ App calcula aggregate ao finalizar
â†’ EvidÃªncia entra em learning_evidence com context=REVIEW
```

### Fluxo 5 â€” RevisÃ£o do dia seguinte

```
Hoje â†’ linha da revisÃ£o
â†’ VÃª: disciplina (chip), tÃ­tulo, "R1 â€¢ Vence hoje"
â†’ Clica "Revisar"
â†’ Para cada exercÃ­cio: "Ver resposta" â†’ Acertei / Errei
â†’ App conta: questions_count, correct_count, score_percent
â†’ Review concluÃ­da: marca review_task.review_done=true, insere learning_evidence
â†’ Linha passa para "Feitas hoje" com badge "ConcluÃ­da X%"
```

### Fluxo 6 â€” ExercÃ­cios externos

```
Hoje/Plano â†’ unidade â†’ "Registrar exercÃ­cios externos"
â†’ n questÃµes + n acertos (input numÃ©rico)
â†’ App calcula score, insere learning_evidence context=EXTERNAL
â†’ EstatÃ­sticas atualizam
```

### Fluxo 7 â€” Consultar disciplina fraca

```
EstatÃ­sticas â†’ Disciplinas
â†’ Ordenado por pior weighted_accuracy
â†’ Fisiologia: 58% â€¢ 124 questÃµes â€¢ â†“ CAINDO
â†’ Clica â†’ filtra ConteÃºdos por Fisiologia
â†’ VÃª quais conteÃºdos puxam para baixo
```

### Fluxo 8 â€” Abrir conteÃºdo fraco

```
EstatÃ­sticas â†’ ConteÃºdos â†’ filtra por Fisiologia
â†’ "Potencial de AÃ§Ã£o": 42% â€¢ 38 questÃµes â€¢ CAINDO
â†’ Clica â†’ Acompanhamento filtrado nessa unidade
â†’ VÃª: datas de estudo, exercÃ­cios, sequÃªncia de scores
â†’ CTA: "Adicionar ao plano de revisÃ£o" (se nÃ£o tiver revisÃ£o pendente)
```

### Fluxo 9 â€” Enxergar evoluÃ§Ã£o (6 meses)

```
EstatÃ­sticas â†’ EvoluÃ§Ã£o
â†’ GrÃ¡fico/tabela: weighted_accuracy por mÃªs por disciplina
â†’ Sparklines por conteÃºdo com tendÃªncia
â†’ Fisiologia: Jan 54% â†’ Mar 67% â†’ Set 81%
â†’ Filtros: perÃ­odo, disciplina, mÃ­n questÃµes
```

### UX-001 â€” Zero perda de draft

- Abrir "+ Nova disciplina" preserva o formulÃ¡rio de nova unidade
- Trocar de aba e voltar nÃ£o apaga formulÃ¡rio incompleto (state local da tela)
- SoluÃ§Ã£o tÃ©cnica: estado do formulÃ¡rio em memÃ³ria JS enquanto tab estÃ¡ ativa; persistÃªncia em localStorage somente se requisito explÃ­cito

### UX-003 â€” Zero metawork

- `summary_body` presente â†’ "Resumo âœ“" automÃ¡tico no Acompanhamento
- n exercÃ­cios derivado de `exercises.getAll(unit_id).length`
- `questions_count` calculado pelo app, nunca digitado manualmente em fluxo interno
- `review_done` marcado automaticamente quando exercÃ­cios concluÃ­dos (ou botÃ£o manual para revisÃ£o sem exercÃ­cios)

---

## WP-05 â€” Visual system

### Paleta base

Inspirada na referÃªncia da planilha, adaptada para app moderno com modo claro/escuro.

```
Tokens CSS (light mode):
  --color-navy-900: #1E3448  (backgrounds de cabeÃ§alho)
  --color-navy-700: #253D55  (bordas estruturais)
  --color-navy-400: #A8B7D1  (secundÃ¡rio estrutural)
  --color-blue-100: #CEE0FF  (Ã¡rea de trabalho leve)
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

7 cores estÃ¡veis, atribuÃ­das sequencialmente na criaÃ§Ã£o, editÃ¡veis:
```
DISC-BLUE:   #3B82F6  / dark: #60A5FA
DISC-GREEN:  #10B981  / dark: #34D399
DISC-PURPLE: #8B5CF6  / dark: #A78BFA
DISC-ORANGE: #F59E0B  / dark: #FCD34D
DISC-RED:    #EF4444  / dark: #F87171
DISC-TEAL:   #14B8A6  / dark: #2DD4BF
DISC-PINK:   #EC4899  / dark: #F472B6
```

Uso: chip lateral (`border-left: 3px solid var(--subject-color)`), tag/badge, ponto em grÃ¡ficos.
**Nunca:** fundo de card completo, texto em cor de disciplina sem contraste garantido.

### Cores de desempenho (semÃ¢nticas)

```
STRONG:     #16A34A  / bg: #F0FDF4  (â‰¥80%)
ADEQUATE:   #2563EB  / bg: #EFF6FF  (65â€“80%)
ATTENTION:  #D97706  / bg: #FFFBEB  (50â€“65%)
CRITICAL:   #DC2626  / bg: #FEF2F2  (<50%)
NO_EVIDENCE: #94A3B8 / bg: #F1F5F9  (sem dados)
```

Thresholds como constantes JS, nÃ£o inline na UI.

### Tipografia

```
Font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
Tamanhos:
  --text-xs:  11px  (labels de tabela, metadados)
  --text-sm:  13px  (texto de linha compacta)
  --text-base: 15px (corpo)
  --text-lg:  18px  (tÃ­tulos de seÃ§Ã£o)
  --text-xl:  22px  (KPIs grandes)
Peso: 400 (normal), 500 (mÃ©dio/labels), 600 (tÃ­tulos), 700 (KPI)
```

### PadrÃµes de componente

**Linha compacta (Plano, Acompanhamento):**
```
[chip-disciplina] [tÃ­tulo da unidade]          [badge-status] [prÃ³xima revisÃ£o] [aÃ§Ãµes]
Fonte: 12px muted                                                      â†• expansÃ£o
```

**Linha de revisÃ£o (Hoje):**
```
[chip-disciplina] [R1 â€¢ Vence hoje] [tÃ­tulo]          [% se concluÃ­da] [CTA Revisar]
```

**KPI de disciplina (EstatÃ­sticas):**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ [chip] Fisiologia         CAINDO â”‚
â”‚ 58%  â€¢  242 questÃµes  â€¢  â†“ 4 pp â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Sparkline de conteÃºdo:**
```
Potencial de AÃ§Ã£o  42%  [â–â–ƒâ–…â–„â–‚]  CAINDO  38q  Ãšlt: 12/ago
```

### Densidade

- Desktop (â‰¥768px): tabela-card hÃ­brida, linhas de ~36px, mÃ¡ximo de informaÃ§Ã£o por pixel
- Mobile (<768px): linhas expandem para 2 linhas, CTA em linha separada
- Sem cards gigantes em desktop; sem tabelas truncadas em mobile
- Scroll interno (overflow-x: auto) para tabelas largas â€” body nunca scrolls horizontal

### NavegaÃ§Ã£o

```
Tab bar fixo no bottom (mobile) / top (desktop)
Tabs: Hoje | Plano | EstatÃ­sticas | Acompanhamento | Disciplinas
Ãcone de engrenagem no header (ConfiguraÃ§Ãµes)
Subnav horizontal em EstatÃ­sticas: Disciplinas | ConteÃºdos | EvoluÃ§Ã£o
```

---

## Requisitos nÃ£o-funcionais

| ID | Requisito |
|----|-----------|
| NF-01 | Tauri 2 + SQLite como banco real; BrowserStore somente para tests |
| NF-02 | `schemaVersion: 3` no backup JSON apÃ³s introduÃ§Ã£o de `learning_evidence` |
| NF-03 | Migrations idempotentes via `ensureColumns` |
| NF-04 | Testes: node:test, sem framework externo |
| NF-05 | CSS vars para todos os tokens â€” sem magic numbers de cor |
| NF-06 | Thresholds de desempenho como constantes nomeadas em mÃ³dulo separado |
| NF-07 | TendÃªncia: algoritmo determinÃ­stico, testÃ¡vel unitariamente |

---

## CritÃ©rio de aceite global

A interface estÃ¡ pronta quando um usuÃ¡rio sem treinamento responde visualmente em <10s:
1. qual disciplina estÃ¡ pior
2. qual estÃ¡ melhor
3. quantas questÃµes sustentam cada percentual
4. o que estÃ¡ vencido hoje
5. qual conteÃºdo estÃ¡ caindo
6. qual conteÃºdo melhorou
7. onde clicar para estudar/revisar agora

---

## HUMAN_GATE

```
HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL
```

**Parar aqui. Nenhuma implementaÃ§Ã£o antes da aprovaÃ§Ã£o desta spec.**
