# tasks.md — SmartLearn Product/UX/Analytics Redesign

**Feature:** smartlearn-product-ux-analytics-redesign
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: PRODUCT_UX_ANALYTICS_REDESIGN_APPROVAL — nenhuma implementação antes deste gate

---

## Bloqueio

```
HUMAN_GATE: PRODUCT_UX_ANALYTICS_REDESIGN_APPROVAL

Parar aqui. Estas tasks só podem ser executadas após aprovação explícita
de spec.md + design.md pelo usuário/produto.
```

---

## Fases

```
Fase A — Fundação de domínio (DB + Analytics)
Fase B — Tela Hoje e Revisão
Fase C — Plano e Evidência
Fase D — Estatísticas
Fase E — Acompanhamento e Disciplinas
Fase F — Visual polish + UATs finais
```

---

## Fase A — Fundação de domínio

### WP-A1 — `learning_evidence` schema + migration + DB API

**Dependências:** nenhuma (base)
**Estimativa:** ~3h

**Tarefas:**
1. `db.js`: adicionar `DB.learningEvidence` com `create`, `getAll`, `getByUnit`, `getBySubject`, `getByDateRange`
2. `db.js`: `ensureColumns()` — criar tabela `learning_evidence` se não existir
3. `db.js`: migration idempotente `review_tasks → learning_evidence` (NOT EXISTS, context='REVIEW')
4. `db.js`: adicionar `subjects.color TEXT DEFAULT 'DISC-BLUE'` via ensureColumns
5. `db.js`: `SCHEMA_VERSION = 3`; atualizar `exportAll` / `assertImportData`
6. `db.js`: `mapLearningEvidence(row)` → camelCase

**Gate:** `node --test test/learning-evidence.test.js` passa
**Commit:** `feat(db): WP-A1 learning_evidence schema, migration, DB API, schemaVersion 3`

---

### WP-A2 — `performance-thresholds.js`

**Dependências:** nenhuma
**Estimativa:** ~30min

**Tarefas:**
1. Criar `src/performance-thresholds.js` com `THRESHOLDS`, `getState(accuracy, totalQuestions)`, `TREND_DELTA_MIN`
2. Exportar `SUBJECT_COLORS` (paleta de 7 cores como objeto nomeado)

**Gate:** `node --test test/performance-thresholds.test.js` passa
**Commit:** `feat(thresholds): WP-A2 constantes de desempenho e paleta de disciplinas`

---

### WP-A3 — `analytics.js`

**Dependências:** WP-A1, WP-A2
**Estimativa:** ~2h

**Tarefas:**
1. Criar `src/analytics.js` com `Analytics.bySubject`, `Analytics.byUnit`, `Analytics.trend`, `Analytics.state`
2. Algoritmo de tendência: delta de janelas de 30 dias, floor de 10 questões
3. `scoresSequence` por unidade em ordem cronológica

**Gate:** `node --test test/analytics.test.js` passa (mínimo 12 testes)
**Commit:** `feat(analytics): WP-A3 Analytics.bySubject, byUnit, trend, state`

---

### WP-A4 — Testes learning-evidence + migration + roundtrip schemaVersion 3

**Dependências:** WP-A1
**Estimativa:** ~1h

**Tarefas:**
1. `test/learning-evidence.test.js`: CRUD, context validation, migration idempotente
2. `test/learning-evidence.test.js`: exportAll schemaVersion 3; importAll fail-closed para v2
3. `test/learning-evidence.test.js`: roundtrip preserva learning_evidence
4. Atualizar `test/stats.test.js` se necessário após refatoração de stats.js

**Gate:** `node --test test/*.test.js` — todos passam (44+ testes)
**Commit:** `test(learning-evidence): WP-A4 testes learning_evidence e roundtrip schemaVersion 3`

---

## Fase B — Tela Hoje e Revisão

### WP-B1 — ReviewRow com cor de disciplina e densidade

**Dependências:** WP-A1
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: refatorar `createReviewRow` para incluir `subject-chip` com `--subject-color`
2. `app.js`: seções "Vencidas", "Hoje", "Amanhã (preview)", "Feitas hoje" com cabeçalhos distintos
3. CSS: `.review-row`, `.subject-chip`, `.review-badge`, `.trend-badge`, `.performance-badge`
4. CSS: tokens `--subject-color` lido de `subjects.color`
5. AC-RES-01..07 verificados no browser

**Gate:** UAT-B1 — Hoje exibe revisões vencidas antes das de hoje; chip de disciplina visível; sem overflow horizontal
**Commit:** `feat(ui): WP-B1 ReviewRow com cor de disciplina, seções e densidade`

---

### WP-B2 — Fluxo de exercícios internos com evidência automática

**Dependências:** WP-A1, WP-B1
**Estimativa:** ~3h

**Tarefas:**
1. `app.js`: fluxo Acertei/Errei por exercício (não agregate manual)
2. `app.js`: ao concluir revisão, chamar `DB.learningEvidence.create` com context='REVIEW'
3. `app.js`: `review_tasks.questions_count` / `correct_count` continuam preenchidos (backward compat)
4. `app.js`: badge "Concluída X%" derivado de `learning_evidence` (não de `review_tasks` direto)
5. AC-DET-01, AC-DET-03, AC-DET-04 verificados

**Gate:** UAT-B2 — revisar com exercícios internos; score calculado automaticamente; evidência em DB
**Commit:** `feat(review): WP-B2 exercícios internos com evidência automática`

---

### WP-B3 — Registro de exercícios externos

**Dependências:** WP-A1, WP-B1
**Estimativa:** ~1h

**Tarefas:**
1. `app.js`: opção "Registrar exercícios externos" na linha de revisão ou na unidade
2. Input numérico: n questões + n acertos
3. `DB.learningEvidence.create` context='EXTERNAL'
4. AC-DET-02 verificado

**Gate:** UAT-B3 — registrar 40 questões / 30 acertos; evidência = 75%; statistics atualiza
**Commit:** `feat(external): WP-B3 registro de exercícios externos`

---

## Fase C — Plano e Evidência

### WP-C1 — Tela Plano (inventário de learning_units)

**Dependências:** WP-A1, WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderPlan()` — lista compacta de learning_units com expansão
2. Cada linha: chip, título, study_date, fonte, status Resumo Mestre (auto), n exercícios, próxima revisão, performance badge
3. Expansão: summary_body, exercícios, histórico de evidências
4. `+ Nova aula` como CTA primário no Plano (substitui tab Cadastro no fluxo principal)
5. Filtros: disciplina, estado
6. AC-RP-01..06 verificados

**Gate:** UAT-C1 — Plano lista unidades compactamente; expansão mostra detalhes; filtro por disciplina funciona
**Commit:** `feat(plan): WP-C1 tela Plano com inventário compacto de learning_units`

---

### WP-C2 — Fluxo "+ Nova aula" inline

**Dependências:** WP-C1
**Estimativa:** ~2h

**Tarefas:**
1. Formulário inline (panel ou modal simples) sem trocar de tab
2. Disciplina: dropdown + "+ Nova disciplina" inline (sem perder draft)
3. Campos: título, fonte, data, summary_body (expansível)
4. Salva → unidade aparece no Plano imediatamente
5. UX-001 (zero perda de draft) verificado

**Gate:** UAT-C2 — criar nova disciplina inline sem perder dados do formulário; unidade salva e visível no Plano
**Commit:** `feat(unit-create): WP-C2 fluxo Nova Aula inline sem perda de draft`

---

## Fase D — Estatísticas

### WP-D1 — Estatísticas por disciplina

**Dependências:** WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderStatsBySubject()` usando `Analytics.bySubject`
2. Cards KPI: weighted_accuracy, total questões, estado semântico, tendência, recente (30d)
3. Ordenação padrão: pior → melhor; alternativas: melhor → pior, volume, tendência
4. CSS: `.subject-kpi`, `.trend-badge[data-direction]`, `.performance-badge[data-state]`
5. AC-EST1-01..07 verificados

**Gate:** UAT-D1 — Estatísticas exibe disciplinas com %, n questões, estado; "sem evidência" ≠ vermelho
**Commit:** `feat(stats): WP-D1 estatísticas por disciplina com weighted accuracy e tendência`

---

### WP-D2 — Estatísticas por conteúdo (learning unit)

**Dependências:** WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderStatsByUnit()` usando `Analytics.byUnit`
2. Linhas com sparkline simples (SVG inline, 5 pontos)
3. Tendência, last score, n questões, última evidência
4. Filtros: disciplina, tendência, período
5. AC-EST2-01..05 verificados

**Gate:** UAT-D2 — lista de conteúdos com sparklines e tendência visível sem scroll excessivo
**Commit:** `feat(stats): WP-D2 estatísticas por conteúdo com sparklines`

---

### WP-D3 — Evolução temporal (opcional nesta fase)

**Dependências:** WP-A3, WP-D1
**Estimativa:** ~1.5h

**Tarefas:**
1. Gráfico de linha simples por disciplina ao longo do tempo (canvas ou SVG)
2. Filtros: disciplina, período
3. weighted_accuracy por mês

**Gate:** UAT-D3 — gráfico mostra evolução de Fisiologia entre dois meses com dados distintos
**Commit:** `feat(stats): WP-D3 evolução temporal por disciplina`

---

## Fase E — Acompanhamento e Disciplinas

### WP-E1 — Acompanhamento

**Dependências:** WP-A1, WP-A3, WP-C1
**Estimativa:** ~1.5h

**Tarefas:**
1. `app.js`: `renderTracking()` — tabela-card por unidade
2. Campos auto-derivados: status Resumo Mestre, estado, n revisões feitas/pendentes
3. Filtros: disciplina, estado
4. AC-ACOMP-01..05 verificados

**Gate:** UAT-E1 — Acompanhamento mostra estado de todas as unidades com dados derivados automaticamente
**Commit:** `feat(tracking): WP-E1 tela Acompanhamento com estado auto-derivado`

---

### WP-E2 — Tela Disciplinas

**Dependências:** WP-A1, WP-A2
**Estimativa:** ~1.5h

**Tarefas:**
1. `app.js`: `renderSubjects()` — catálogo com cor, estado ativo/arquivado, n unidades, performance
2. Criar disciplina inline; editar nome e cor; arquivar; excluir (destrutivo + confirmação)
3. CSS: seletor de cor com paleta de 7 botões
4. AC-DISC-01..05 verificados

**Gate:** UAT-E2 — criar Fisiologia com cor azul; editar para verde; cor aparece nos chips do Hoje e Plano
**Commit:** `feat(subjects): WP-E2 tela Disciplinas com seletor de cor e identidade visual`

---

## Fase F — Visual polish + UATs finais

### WP-F1 — CSS tokens e refatoração visual

**Dependências:** todas as fases anteriores
**Estimativa:** ~2h

**Tarefas:**
1. Consolidar todos os tokens CSS no arquivo de estilos (sem magic numbers de cor)
2. Verificar contraste em dark mode e light mode
3. Verificar responsividade mobile (<768px) e desktop
4. Verificar UX-007 (acessibilidade — status nunca só por cor)
5. Verificar UX-005 (densidade controlada — desktop tabela compacta, mobile decompõe)

**Gate:** tela Hoje em mobile (375px) e desktop (1280px) funcional; dark mode sem tokens faltando
**Commit:** `style: WP-F1 tokens CSS consolidados, responsividade, acessibilidade`

---

### WP-F2 — UAT real em Tauri/SQLite

**Dependências:** WP-F1
**Estimativa:** ~2h (manual)

**Cenários obrigatórios:**
- UAT-07: criar unidade, recarregar, revisar, registrar evidência, verificar analytics, exportar, importar, verificar equivalência
- Migration de banco com dados v2 reais (se existir banco do usuário)
- `TLC_INSTALLATION_MISMATCH`: confirmar resolved ou documentar

**Gate:** REAL_TAURI_SQLITE_CLOSURE = PASS
**Commit:** `docs(validation): WP-F2 UAT Tauri SQLite real PASS`

---

### WP-F3 — Verifier (fresh-eyes, sempre obrigatório)

**Dependências:** WP-F2
**Estimativa:** automático

**Tarefas:**
1. Spec-anchored check: cada AC de spec.md tem evidência em testes
2. Discrimination sensor: mutar `getState`, `Analytics.trend`, `validateProvenance`
3. Escrever `validation.md` com resultado PASS/FAIL por AC
4. Distillar lições em `scripts/lessons.py`

**Gate:** validation.md = PASS, discrimination sensor = PASS
**Commit:** `docs(validation): WP-F3 verifier PASS`

---

### WP-F4 — HUMAN_GATE: PUSH_AND_PR_APPROVAL (final)

Após WP-F3 PASS:
```
HUMAN_GATE: PUSH_AND_PR_APPROVAL
```
Somente então: push da branch + abertura de PR.

---

## Mapa de dependências

```
WP-A1 ─┬─ WP-A3 ─┬─ WP-D1
        │          └─ WP-D2
        ├─ WP-A4
        ├─ WP-B1 ─┬─ WP-B2
        │          └─ WP-B3
        └─ WP-C1 ─┬─ WP-C2
                   └─ WP-E1

WP-A2 ─┬─ WP-A3
        └─ WP-E2

Fase F: depende de todas as fases anteriores
```

---

## Critério de encerramento de cada task

1. Código implementado
2. Testes passam (`node --test test/*.test.js`)
3. Gate de UAT manual ou automático verificado
4. Commit atômico realizado
5. Nenhuma task batcha com outra de fase diferente

---

## Estimativa total

| Fase | Estimativa |
|------|-----------|
| A — Fundação | ~6.5h |
| B — Hoje + Revisão | ~6h |
| C — Plano | ~4h |
| D — Estatísticas | ~5.5h |
| E — Acompanhamento + Disciplinas | ~3h |
| F — Polish + UATs | ~4h+ manual |
| **Total** | **~29h + UAT manual** |
