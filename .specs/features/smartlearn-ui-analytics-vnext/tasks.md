# tasks.md â€” SmartLearn Product/UX/Analytics Redesign

**Feature:** smartlearn-ui-analytics-vnext
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL â€” nenhuma implementaÃ§Ã£o antes deste gate

---

## Bloqueio

```
HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL

Parar aqui. Estas tasks sÃ³ podem ser executadas apÃ³s aprovaÃ§Ã£o explÃ­cita
de spec.md + design.md + CURRENT_UI_AUDIT.md pelo usuÃ¡rio/produto.
```

---

## Fases

```
Fase A â€” FundaÃ§Ã£o de domÃ­nio (DB + Analytics)
Fase B â€” Tela Hoje e RevisÃ£o
Fase C â€” Plano e EvidÃªncia
Fase D â€” EstatÃ­sticas
Fase E â€” Acompanhamento e Disciplinas
Fase F â€” Visual polish + UATs finais
```

---

## Fase A â€” FundaÃ§Ã£o de domÃ­nio

### WP-A0 â€” Auditoria do produto atual (CURRENT_UI_AUDIT.md)

**DependÃªncias:** nenhuma
**Estimativa:** ~1h (manual + observaÃ§Ã£o de telas)
**Status:** CONCLUÃDA â€” ver `CURRENT_UI_AUDIT.md`

**Tarefas:**
1. Abrir todas as telas atuais do SmartLearn no browser/Tauri
2. Capturar screenshots reais de cada tab
3. Comparar lado a lado com os mÃ³dulos de referÃªncia do brief
4. Listar problemas de hierarquia, densidade, navegaÃ§Ã£o, cor, formulÃ¡rio e analytics
5. Mapear o que jÃ¡ existe no domÃ­nio e o que falta
6. Entregar `CURRENT_UI_AUDIT.md`

**Gate:** `CURRENT_UI_AUDIT.md` presente com matriz de gaps completa
**Commit:** incluÃ­do no commit de specs

---

### WP-A1 â€” `learning_evidence` schema + migration + DB API

**DependÃªncias:** nenhuma (base)
**Estimativa:** ~3h

**Tarefas:**
1. `db.js`: adicionar `DB.learningEvidence` com `create`, `getAll`, `getByUnit`, `getBySubject`, `getByDateRange`
2. `db.js`: `ensureColumns()` â€” criar tabela `learning_evidence` se nÃ£o existir
3. `db.js`: migration idempotente `review_tasks â†’ learning_evidence` (NOT EXISTS, context='REVIEW')
4. `db.js`: adicionar `subjects.color TEXT DEFAULT 'DISC-BLUE'` via ensureColumns
5. `db.js`: `SCHEMA_VERSION = 3`; atualizar `exportAll` / `assertImportData`
6. `db.js`: `mapLearningEvidence(row)` â†’ camelCase

**Gate:** `node --test test/learning-evidence.test.js` passa
**Commit:** `feat(db): WP-A1 learning_evidence schema, migration, DB API, schemaVersion 3`

---

### WP-A2 â€” `performance-thresholds.js`

**DependÃªncias:** nenhuma
**Estimativa:** ~30min

**Tarefas:**
1. Criar `src/performance-thresholds.js` com `THRESHOLDS`, `getState(accuracy, totalQuestions)`, `TREND_DELTA_MIN`
2. Exportar `SUBJECT_COLORS` (paleta de 7 cores como objeto nomeado)

**Gate:** `node --test test/performance-thresholds.test.js` passa
**Commit:** `feat(thresholds): WP-A2 constantes de desempenho e paleta de disciplinas`

---

### WP-A3 â€” `analytics.js`

**DependÃªncias:** WP-A1, WP-A2
**Estimativa:** ~2h

**Tarefas:**
1. Criar `src/analytics.js` com `Analytics.bySubject`, `Analytics.byUnit`, `Analytics.trend`, `Analytics.state`
2. Algoritmo de tendÃªncia: delta de janelas de 30 dias, floor de 10 questÃµes
3. `scoresSequence` por unidade em ordem cronolÃ³gica

**Gate:** `node --test test/analytics.test.js` passa (mÃ­nimo 12 testes)
**Commit:** `feat(analytics): WP-A3 Analytics.bySubject, byUnit, trend, state`

---

### WP-A4 â€” Testes learning-evidence + migration + roundtrip schemaVersion 3

**DependÃªncias:** WP-A1
**Estimativa:** ~1h

**Tarefas:**
1. `test/learning-evidence.test.js`: CRUD, context validation, migration idempotente
2. `test/learning-evidence.test.js`: exportAll schemaVersion 3; importAll fail-closed para v2
3. `test/learning-evidence.test.js`: roundtrip preserva learning_evidence
4. Atualizar `test/stats.test.js` se necessÃ¡rio apÃ³s refatoraÃ§Ã£o de stats.js

**Gate:** `node --test test/*.test.js` â€” todos passam (44+ testes)
**Commit:** `test(learning-evidence): WP-A4 testes learning_evidence e roundtrip schemaVersion 3`

---

## Fase B â€” Tela Hoje e RevisÃ£o

### WP-B1 â€” ReviewRow com cor de disciplina e densidade

**DependÃªncias:** WP-A1
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: refatorar `createReviewRow` para incluir `subject-chip` com `--subject-color`
2. `app.js`: seÃ§Ãµes "Vencidas", "Hoje", "AmanhÃ£ (preview)", "Feitas hoje" com cabeÃ§alhos distintos
3. CSS: `.review-row`, `.subject-chip`, `.review-badge`, `.trend-badge`, `.performance-badge`
4. CSS: tokens `--subject-color` lido de `subjects.color`
5. AC-RES-01..07 verificados no browser

**Gate:** UAT-B1 â€” Hoje exibe revisÃµes vencidas antes das de hoje; chip de disciplina visÃ­vel; sem overflow horizontal
**Commit:** `feat(ui): WP-B1 ReviewRow com cor de disciplina, seÃ§Ãµes e densidade`

---

### WP-B2 â€” Fluxo de exercÃ­cios internos com evidÃªncia automÃ¡tica

**DependÃªncias:** WP-A1, WP-B1
**Estimativa:** ~3h

**Tarefas:**
1. `app.js`: fluxo Acertei/Errei por exercÃ­cio (nÃ£o agregate manual)
2. `app.js`: ao concluir revisÃ£o, chamar `DB.learningEvidence.create` com context='REVIEW'
3. `app.js`: `review_tasks.questions_count` / `correct_count` continuam preenchidos (backward compat)
4. `app.js`: badge "ConcluÃ­da X%" derivado de `learning_evidence` (nÃ£o de `review_tasks` direto)
5. AC-DET-01, AC-DET-03, AC-DET-04 verificados

**Gate:** UAT-B2 â€” revisar com exercÃ­cios internos; score calculado automaticamente; evidÃªncia em DB
**Commit:** `feat(review): WP-B2 exercÃ­cios internos com evidÃªncia automÃ¡tica`

---

### WP-B3 â€” Registro de exercÃ­cios externos

**DependÃªncias:** WP-A1, WP-B1
**Estimativa:** ~1h

**Tarefas:**
1. `app.js`: opÃ§Ã£o "Registrar exercÃ­cios externos" na linha de revisÃ£o ou na unidade
2. Input numÃ©rico: n questÃµes + n acertos
3. `DB.learningEvidence.create` context='EXTERNAL'
4. AC-DET-02 verificado

**Gate:** UAT-B3 â€” registrar 40 questÃµes / 30 acertos; evidÃªncia = 75%; statistics atualiza
**Commit:** `feat(external): WP-B3 registro de exercÃ­cios externos`

---

## Fase C â€” Plano e EvidÃªncia

### WP-C1 â€” Tela Plano (inventÃ¡rio de learning_units)

**DependÃªncias:** WP-A1, WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderPlan()` â€” lista compacta de learning_units com expansÃ£o
2. Cada linha: chip, tÃ­tulo, study_date, fonte, status Resumo Mestre (auto), n exercÃ­cios, prÃ³xima revisÃ£o, performance badge
3. ExpansÃ£o: summary_body, exercÃ­cios, histÃ³rico de evidÃªncias
4. `+ Nova aula` como CTA primÃ¡rio no Plano (substitui tab Cadastro no fluxo principal)
5. Filtros: disciplina, estado
6. AC-RP-01..06 verificados

**Gate:** UAT-C1 â€” Plano lista unidades compactamente; expansÃ£o mostra detalhes; filtro por disciplina funciona
**Commit:** `feat(plan): WP-C1 tela Plano com inventÃ¡rio compacto de learning_units`

---

### WP-C2 â€” Fluxo "+ Nova aula" inline

**DependÃªncias:** WP-C1
**Estimativa:** ~2h

**Tarefas:**
1. FormulÃ¡rio inline (panel ou modal simples) sem trocar de tab
2. Disciplina: dropdown + "+ Nova disciplina" inline (sem perder draft)
3. Campos: tÃ­tulo, fonte, data, summary_body (expansÃ­vel)
4. Salva â†’ unidade aparece no Plano imediatamente
5. UX-001 (zero perda de draft) verificado

**Gate:** UAT-C2 â€” criar nova disciplina inline sem perder dados do formulÃ¡rio; unidade salva e visÃ­vel no Plano
**Commit:** `feat(unit-create): WP-C2 fluxo Nova Aula inline sem perda de draft`

---

## Fase D â€” EstatÃ­sticas

### WP-D1 â€” EstatÃ­sticas por disciplina

**DependÃªncias:** WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderStatsBySubject()` usando `Analytics.bySubject`
2. Cards KPI: weighted_accuracy, total questÃµes, estado semÃ¢ntico, tendÃªncia, recente (30d)
3. OrdenaÃ§Ã£o padrÃ£o: pior â†’ melhor; alternativas: melhor â†’ pior, volume, tendÃªncia
4. CSS: `.subject-kpi`, `.trend-badge[data-direction]`, `.performance-badge[data-state]`
5. AC-EST1-01..07 verificados

**Gate:** UAT-D1 â€” EstatÃ­sticas exibe disciplinas com %, n questÃµes, estado; "sem evidÃªncia" â‰  vermelho
**Commit:** `feat(stats): WP-D1 estatÃ­sticas por disciplina com weighted accuracy e tendÃªncia`

---

### WP-D2 â€” EstatÃ­sticas por conteÃºdo (learning unit)

**DependÃªncias:** WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderStatsByUnit()` usando `Analytics.byUnit`
2. Linhas com sparkline simples (SVG inline, 5 pontos)
3. TendÃªncia, last score, n questÃµes, Ãºltima evidÃªncia
4. Filtros: disciplina, tendÃªncia, perÃ­odo
5. AC-EST2-01..05 verificados

**Gate:** UAT-D2 â€” lista de conteÃºdos com sparklines e tendÃªncia visÃ­vel sem scroll excessivo
**Commit:** `feat(stats): WP-D2 estatÃ­sticas por conteÃºdo com sparklines`

---

### WP-D3 â€” EvoluÃ§Ã£o temporal (opcional nesta fase)

**DependÃªncias:** WP-A3, WP-D1
**Estimativa:** ~1.5h

**Tarefas:**
1. GrÃ¡fico de linha simples por disciplina ao longo do tempo (canvas ou SVG)
2. Filtros: disciplina, perÃ­odo
3. weighted_accuracy por mÃªs

**Gate:** UAT-D3 â€” grÃ¡fico mostra evoluÃ§Ã£o de Fisiologia entre dois meses com dados distintos
**Commit:** `feat(stats): WP-D3 evoluÃ§Ã£o temporal por disciplina`

---

## Fase E â€” Acompanhamento e Disciplinas

### WP-E1 â€” Acompanhamento

**DependÃªncias:** WP-A1, WP-A3, WP-C1
**Estimativa:** ~1.5h

**Tarefas:**
1. `app.js`: `renderTracking()` â€” tabela-card por unidade
2. Campos auto-derivados: status Resumo Mestre, estado, n revisÃµes feitas/pendentes
3. Filtros: disciplina, estado
4. AC-ACOMP-01..05 verificados

**Gate:** UAT-E1 â€” Acompanhamento mostra estado de todas as unidades com dados derivados automaticamente
**Commit:** `feat(tracking): WP-E1 tela Acompanhamento com estado auto-derivado`

---

### WP-E2 â€” Tela Disciplinas

**DependÃªncias:** WP-A1, WP-A2
**Estimativa:** ~1.5h

**Tarefas:**
1. `app.js`: `renderSubjects()` â€” catÃ¡logo com cor, estado ativo/arquivado, n unidades, performance
2. Criar disciplina inline; editar nome e cor; arquivar; excluir (destrutivo + confirmaÃ§Ã£o)
3. CSS: seletor de cor com paleta de 7 botÃµes
4. AC-DISC-01..05 verificados

**Gate:** UAT-E2 â€” criar Fisiologia com cor azul; editar para verde; cor aparece nos chips do Hoje e Plano
**Commit:** `feat(subjects): WP-E2 tela Disciplinas com seletor de cor e identidade visual`

---

## Fase F â€” Visual polish + UATs finais

### WP-F1 â€” CSS tokens e refatoraÃ§Ã£o visual

**DependÃªncias:** todas as fases anteriores
**Estimativa:** ~2h

**Tarefas:**
1. Consolidar todos os tokens CSS no arquivo de estilos (sem magic numbers de cor)
2. Verificar contraste em dark mode e light mode
3. Verificar responsividade mobile (<768px) e desktop
4. Verificar UX-007 (acessibilidade â€” status nunca sÃ³ por cor)
5. Verificar UX-005 (densidade controlada â€” desktop tabela compacta, mobile decompÃµe)

**Gate:** tela Hoje em mobile (375px) e desktop (1280px) funcional; dark mode sem tokens faltando
**Commit:** `style: WP-F1 tokens CSS consolidados, responsividade, acessibilidade`

---

### WP-F2 â€” UAT real em Tauri/SQLite

**DependÃªncias:** WP-F1
**Estimativa:** ~2h (manual)

**CenÃ¡rios obrigatÃ³rios:**
- UAT-07: criar unidade, recarregar, revisar, registrar evidÃªncia, verificar analytics, exportar, importar, verificar equivalÃªncia
- Migration de banco com dados v2 reais (se existir banco do usuÃ¡rio)
- `TLC_INSTALLATION_MISMATCH`: confirmar resolved ou documentar

**Gate:** REAL_TAURI_SQLITE_CLOSURE = PASS
**Commit:** `docs(validation): WP-F2 UAT Tauri SQLite real PASS`

---

### WP-F3 â€” Verifier (fresh-eyes, sempre obrigatÃ³rio)

**DependÃªncias:** WP-F2
**Estimativa:** automÃ¡tico

**Tarefas:**
1. Spec-anchored check: cada AC de spec.md tem evidÃªncia em testes
2. Discrimination sensor: mutar `getState`, `Analytics.trend`, `validateProvenance`
3. Escrever `validation.md` com resultado PASS/FAIL por AC
4. Distillar liÃ§Ãµes em `scripts/lessons.py`

**Gate:** validation.md = PASS, discrimination sensor = PASS
**Commit:** `docs(validation): WP-F3 verifier PASS`

---

### WP-F4 â€” HUMAN_GATE: PUSH_AND_PR_APPROVAL (final)

ApÃ³s WP-F3 PASS:
```
HUMAN_GATE: PUSH_AND_PR_APPROVAL
```
Somente entÃ£o: push da branch + abertura de PR.

---

## Mapa de dependÃªncias

```
WP-A1 â”€â”¬â”€ WP-A3 â”€â”¬â”€ WP-D1
        â”‚          â””â”€ WP-D2
        â”œâ”€ WP-A4
        â”œâ”€ WP-B1 â”€â”¬â”€ WP-B2
        â”‚          â””â”€ WP-B3
        â””â”€ WP-C1 â”€â”¬â”€ WP-C2
                   â””â”€ WP-E1

WP-A2 â”€â”¬â”€ WP-A3
        â””â”€ WP-E2

Fase F: depende de todas as fases anteriores
```

---

## CritÃ©rio de encerramento de cada task

1. CÃ³digo implementado
2. Testes passam (`node --test test/*.test.js`)
3. Gate de UAT manual ou automÃ¡tico verificado
4. Commit atÃ´mico realizado
5. Nenhuma task batcha com outra de fase diferente

---

## Estimativa total

| Fase | Estimativa |
|------|-----------|
| A â€” FundaÃ§Ã£o | ~6.5h |
| B â€” Hoje + RevisÃ£o | ~6h |
| C â€” Plano | ~4h |
| D â€” EstatÃ­sticas | ~5.5h |
| E â€” Acompanhamento + Disciplinas | ~3h |
| F â€” Polish + UATs | ~4h+ manual |
| **Total** | **~29h + UAT manual** |
