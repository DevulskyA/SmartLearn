# tasks.md — SmartLearn UI/Analytics vNext

**Feature:** smartlearn-ui-analytics-vnext
**Data:** 2026-09-03
**Gate:** HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL — nenhuma implementação antes deste gate

---

## Bloqueio

```
HUMAN_GATE: UI_ANALYTICS_DESIGN_APPROVAL

Parar aqui. Estas tasks só podem ser executadas após aprovação explícita
de spec.md + design.md + CURRENT_UI_ANALYTICS_AUDIT.md pelo usuário/produto.
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

### WP-A0 — Auditoria do produto atual

**Dependências:** nenhuma
**Estimativa:** ~1h (manual + observação de telas)
**Status:** CONCLUÍDA — ver `CURRENT_UI_ANALYTICS_AUDIT.md`

**Tarefas:**
1. Abrir todas as telas atuais do SmartLearn no browser/Tauri
2. Capturar screenshots reais de cada tab
3. Comparar lado a lado com os módulos de referência do brief
4. Listar problemas de hierarquia, densidade, navegação, cor, formulário e analytics
5. Mapear o que já existe no domínio e o que falta
6. Auditar se `review_tasks` aguenta evidência longitudinal sem conflito semântico
7. Identificar SPEC_DEVIATION do domínio v3 aprovado
8. Entregar `CURRENT_UI_ANALYTICS_AUDIT.md`

**Gate:** `CURRENT_UI_ANALYTICS_AUDIT.md` presente com matriz de gaps e auditoria arquitetural

---

### WP-PREFLIGHT — Baseline SQLite/Tauri real antes de qualquer migration nova

**Dependências:** WP-A0
**Estimativa:** ~2h (manual)
**Pré-condição:** REAL_TAURI_SQLITE_CLOSURE do domínio v3 ainda é PENDING.
Não empilhar schemaVersion 3 sobre migration v3 nunca validada no banco real.

**Tarefas obrigatórias (tudo com Tauri + SQLite real, não BrowserStore):**
1. `npm test` — confirmar 44/44 passando
2. `npm run build` — confirmar build limpo
3. `npm run tauri dev` — confirmar app abre sem erro
4. Criar disciplina Fisiologia → persistir → recarregar → confirmar presença
5. Cadastrar learning_unit "Lei de Frank-Starling" → salvar → recarregar → confirmar
6. Adicionar exercício com provenance=MANUAL → confirmar
7. Executar revisão → confirmar review_task marcada como done
8. Exportar backup → importar → confirmar equivalência (schemaVersion: 2)

**Gate:** `DOMAIN_V3_REAL_SQLITE_BASELINE = PASS` documentado em validation.md

**Se falhar:** corrigir exclusivamente o baseline antes de avançar. Não implementar learning_evidence com baseline quebrado.

**Commit:** `docs(validation): WP-PREFLIGHT DOMAIN_V3_REAL_SQLITE_BASELINE PASS`

---

### WP-A1 — `learning_evidence` schema + migration + DB API

**Dependências:** WP-PREFLIGHT (DOMAIN_V3_REAL_SQLITE_BASELINE = PASS obrigatório)
**Estimativa:** ~3h

**Tarefas:**
1. `db.js`: criar tabela `learning_evidence` com constraints (ver design.md §2.2)
   - `questions_count NOT NULL CHECK > 0`
   - `correct_count NOT NULL CHECK >= 0`
   - Enum canônico: `INITIAL_PRACTICE`, `REVIEW`, `EXTERNAL`
2. `db.js`: criar índice único parcial `ux_le_review_task` (uma review_task → uma evidência)
3. `db.js`: migration idempotente `review_tasks → learning_evidence` (NOT EXISTS, `context='REVIEW'`)
   - Filtrar apenas `questions_done = 1 AND questions_count IS NOT NULL AND questions_count > 0`
4. `db.js`: `DB.learningEvidence.create()` com validações de app (correct_count <= questions_count; context/reviewTaskId constraints)
5. `db.js`: `DB.learningEvidence.getAll`, `getByUnit`, `getBySubject`, `getByDateRange`
6. `db.js`: `DB.completeReviewWithEvidence()` — boundary transacional atômico (ver design.md §4)
7. `db.js`: adicionar `subjects.color TEXT DEFAULT 'DISC-BLUE'` via ensureColumns
8. `db.js`: `SCHEMA_VERSION = 3`; atualizar `exportAll` / `assertImportData`
9. `db.js`: `importAll()` com schemaVersion 2 → executa upgrade em transação (não rejeita)
10. `db.js`: `importAll()` com schemaVersion desconhecido → FAIL CLOSED
11. `db.js`: `mapLearningEvidence(row)` → camelCase

**Gate:** `node --test test/learning-evidence.test.js` passa
**Commit:** `feat(db): WP-A1 learning_evidence schema, migration, completeReviewWithEvidence, import v2→v3`

---

### WP-A2 — `performance-thresholds.js`

**Dependências:** nenhuma
**Estimativa:** ~30min

**Tarefas:**
1. Criar `src/performance-thresholds.js` com `THRESHOLDS`, `getState(accuracy, totalQuestions)`, `TREND_DELTA_MIN`
2. Incluir comentário explícito: `PERFORMANCE_BAND != MASTERY` — thresholds são heurísticas visuais configuráveis
3. Exportar `SUBJECT_COLORS` (paleta de 12 cores como objeto nomeado — DISC-BLUE...DISC-ROSE)

**Gate:** `node --test test/performance-thresholds.test.js` passa
**Commit:** `feat(thresholds): WP-A2 constantes de desempenho, paleta 12 cores, PERFORMANCE_BAND != MASTERY`

---

### WP-A3 — `analytics.js`

**Dependências:** WP-A1, WP-A2
**Estimativa:** ~2h

**Tarefas:**
1. Criar `src/analytics.js` com `Analytics.bySubject`, `Analytics.byUnit`, `Analytics.subjectTrend`, `Analytics.unitTrend`, `Analytics.state`
2. `subjectTrend`: delta de janelas de 30 dias, floor 10 questões (ver design.md §3.2)
3. `unitTrend`: comparação de endpoints nos últimos N scores, N=3 mínimo (ver design.md §3.3)
4. `scoresSequence` por unidade em ordem cronológica
5. `state()`: thresholds de performance-thresholds.js, nunca inline

**Gate:** `node --test test/analytics.test.js` passa (mínimo 15 testes cobrindo ambos os algoritmos de tendência)
**Commit:** `feat(analytics): WP-A3 Analytics com subjectTrend (delta-janelas) e unitTrend (last-N)`

---

### WP-A4 — Testes learning-evidence + migration + roundtrip schemaVersion 3

**Dependências:** WP-A1
**Estimativa:** ~1.5h

**Tarefas:**
1. `test/learning-evidence.test.js`: CRUD, validações de context, validações de integridade (questions_count > 0, correct_count range)
2. `test/learning-evidence.test.js`: constraint único review_task_id (segunda evidência para mesma task deve falhar)
3. `test/learning-evidence.test.js`: `DB.completeReviewWithEvidence()` — atomicidade (mock de falha → rollback verificável)
4. `test/learning-evidence.test.js`: migration idempotente (rodar duas vezes → sem duplicatas)
5. `test/learning-evidence.test.js`: import schemaVersion 2 → migra para v3 sem perda
6. `test/learning-evidence.test.js`: import schemaVersion desconhecido → erro
7. `test/learning-evidence.test.js`: exportAll schemaVersion 3; roundtrip preserva learning_evidence
8. Atualizar `test/stats.test.js` para ler de `learning_evidence`

**Gate:** `node --test test/*.test.js` — todos passam (44+ testes)
**Commit:** `test(learning-evidence): WP-A4 testes CRUD, atomicidade, migration, roundtrip schemaVersion 3`

---

## Fase B — Tela Hoje e Revisão

### WP-B1 — ReviewRow com cor de disciplina e densidade

**Dependências:** WP-A1
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: refatorar `createReviewRow` para incluir `subject-chip` com `--subject-color` de `subjects.color`
2. `app.js`: resumo de carga acima do fold (contagens de vencidas/hoje/amanhã/feitas)
3. `app.js`: seções "Vencidas", "Hoje", "Amanhã (preview)", "Feitas hoje" com cabeçalhos distintos
4. CSS: `.review-row`, `.subject-chip`, `.review-badge`, `.trend-badge`, `.performance-badge`
5. AC-RES-01..07 verificados no browser

**Gate:** UAT-B1 — Hoje exibe resumo de carga above fold; revisões vencidas antes das de hoje; chip de disciplina visível
**Commit:** `feat(ui): WP-B1 ReviewRow com cor de disciplina, resumo de carga, seções`

---

### WP-B2 — Fluxo de exercícios internos com evidência automática

**Dependências:** WP-A1, WP-B1
**Estimativa:** ~3h

**Tarefas:**
1. `app.js`: fluxo Acertei/Errei por exercício (não aggregate manual)
2. `app.js`: ao concluir revisão, chamar `DB.completeReviewWithEvidence()` (atômico)
3. `app.js`: badge "Concluída X%" derivado de `learning_evidence`
4. AC-DET-01, AC-DET-03, AC-DET-04 verificados

**Gate:** UAT-B2 — revisar com exercícios internos; score calculado automaticamente; evidência em DB; rollback em caso de falha
**Commit:** `feat(review): WP-B2 exercícios internos com evidência atômica via completeReviewWithEvidence`

---

### WP-B3 — Registro de exercícios externos

**Dependências:** WP-A1, WP-B1
**Estimativa:** ~1h

**Tarefas:**
1. `app.js`: opção "Registrar exercícios externos" na linha da unidade
2. Input numérico: n questões + n acertos; validação correct_count <= questions_count
3. `DB.learningEvidence.create` com `context='EXTERNAL'`, `reviewTaskId=null`
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
4. `+ Nova aula` como CTA primário no Plano (tab Cadastro não é mais a entrada principal)
5. Filtros: disciplina, estado
6. AC-RP-01..06 verificados

**Gate:** UAT-C1 — Plano lista unidades compactamente; expansão mostra detalhes; filtro funciona
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
2. Cards KPI: weighted_accuracy, total questões, estado semântico, tendência (subjectTrend), recente (30d)
3. Ordenação padrão: pior → melhor; alternativas: melhor → pior, volume, tendência
4. CSS: `.subject-kpi`, `.trend-badge[data-direction]`, `.performance-badge[data-state]` para 5 temas
5. AC-EST1-01..07 verificados

**Gate:** UAT-D1 — Estatísticas exibe disciplinas com %, n questões, estado; "sem evidência" ≠ vermelho
**Commit:** `feat(stats): WP-D1 estatísticas por disciplina com weighted accuracy e subjectTrend`

---

### WP-D2 — Estatísticas por conteúdo (learning unit)

**Dependências:** WP-A3
**Estimativa:** ~2h

**Tarefas:**
1. `app.js`: `renderStatsByUnit()` usando `Analytics.byUnit`
2. Linhas com sparkline simples (SVG inline, últimos 5 pontos)
3. Tendência (unitTrend), last score, n questões, última evidência
4. Filtros: disciplina, tendência, período
5. AC-EST2-01..05 verificados

**Gate:** UAT-D2 — lista de conteúdos com sparklines e tendência visível sem scroll excessivo
**Commit:** `feat(stats): WP-D2 estatísticas por conteúdo com sparklines e unitTrend`

---

### WP-D3 — Evolução temporal por disciplina

**Dependências:** WP-A3, WP-D1
**Estimativa:** ~1.5h
**Status:** OBRIGATÓRIO — subtab Evolução está na navegação e é requisito explícito do produto

**Tarefas:**
1. Gráfico de linha simples por disciplina ao longo do tempo (canvas nativo ou SVG — sem biblioteca externa)
2. Eixo X: meses; eixo Y: weighted_accuracy
3. Filtros: disciplina, período (3m / 6m / 12m / tudo)
4. weighted_accuracy por mês; sparklines por conteúdo com tendência abaixo do gráfico
5. Fluxo 9 do spec verificado

**Gate:** UAT-D3 — gráfico mostra evolução de Fisiologia entre dois meses com dados distintos; filtros funcionam
**Commit:** `feat(stats): WP-D3 evolução temporal por disciplina (obrigatório)`

---

## Fase E — Acompanhamento e Disciplinas

### WP-E1 — Acompanhamento

**Dependências:** WP-A1, WP-A3, WP-C1
**Estimativa:** ~1.5h

**Tarefas:**
1. `app.js`: `renderTracking()` — tabela-card por unidade
2. Estados derivados: SEM_EVIDENCIA / EM_ESTUDO / EM_REVISAO / ATRASADO / EM_DIA (ver spec AC-ACOMP-03)
3. Campos auto-derivados: status Resumo Mestre, estado, n revisões feitas/pendentes
4. Filtros: disciplina, estado
5. AC-ACOMP-01..05 verificados

**Gate:** UAT-E1 — Acompanhamento mostra estados derivados corretos; "concluído" não aparece
**Commit:** `feat(tracking): WP-E1 tela Acompanhamento com estados SEM_EVIDENCIA..EM_DIA`

---

### WP-E2 — Tela Disciplinas

**Dependências:** WP-A1, WP-A2
**Estimativa:** ~1.5h

**Tarefas:**
1. `app.js`: `renderSubjects()` — catálogo com cor, estado ativo/arquivado, n unidades, performance
2. Criar disciplina inline; editar nome e cor; arquivar (sempre preserva histórico)
3. Hard delete: só permitido quando disciplina não possuir nenhuma learning_unit
4. CSS: seletor de cor com paleta de 12 botões (DISC-BLUE...DISC-ROSE)
5. AC-DISC-01..05 verificados (incluindo AC-DISC-04 com regra de delete correta)

**Gate:** UAT-E2 — criar Fisiologia com cor azul; editar para verde; cor aparece nos chips do Hoje e Plano; tentar excluir com unidades → erro informativo
**Commit:** `feat(subjects): WP-E2 tela Disciplinas com paleta 12 cores e hard delete protegido`

---

## Fase F — Visual polish + UATs finais

### WP-F1 — CSS tokens e refatoração visual

**Dependências:** todas as fases anteriores
**Estimativa:** ~2.5h

**Tarefas:**
1. Consolidar todos os tokens CSS (sem magic numbers de cor)
2. Definir variantes de token para cada um dos 5 temas existentes: Automático, Papel, Sépia, Noite, Alto contraste
3. Verificar contraste em todos os 5 temas (WCAG AA mínimo)
4. Verificar responsividade mobile (<768px) e desktop (>=768px)
5. Verificar que status nunca depende só de cor (AC-RES-04)
6. UAT de regressão visual: cada tela em cada um dos 5 temas — sem token ausente, sem cor quebrada

**Gate:** tela Hoje em mobile (375px) e desktop (1280px) × 5 temas — sem regressão visual
**Commit:** `style: WP-F1 tokens CSS para 5 temas, responsividade, acessibilidade`

---

### WP-F2 — UAT real em Tauri/SQLite

**Dependências:** WP-F1
**Estimativa:** ~2h (manual)

**Cenários obrigatórios (UAT-10 completo do spec):**
1. Instalação sem seeds
2. Criar Fisiologia
3. Cadastrar "Organização funcional do corpo humano e homeostase", fonte Guyton & Hall cap. 1
4. Inserir Resumo Mestre real
5. Inserir exercícios (provenance=MANUAL)
6. Executar revisão interna → `completeReviewWithEvidence` → score calculado
7. Registrar execução externa agregada (40q / 30a)
8. Abrir Estatísticas por Disciplina → Fisiologia com % + n questões
9. Abrir Evolução por Conteúdo → sequência temporal
10. Confirmar identidade cromática consistente de Fisiologia em todas as telas
11. Recarregar → confirmar persistência
12. Exportar backup (schemaVersion: 3) → importar → verificar equivalência
13. TLC_INSTALLATION_MISMATCH: confirmar resolved ou documentar

**Gate:** REAL_TAURI_SQLITE_CLOSURE = PASS
**Commit:** `docs(validation): WP-F2 UAT Tauri SQLite real PASS`

---

### WP-F3 — Verifier (fresh-eyes, sempre obrigatório)

**Dependências:** WP-F2
**Estimativa:** automático

**Tarefas:**
1. Spec-anchored check: cada AC de spec.md tem evidência em testes
2. Discrimination sensor: mutar `getState`, `subjectTrend`, `unitTrend`, `validateContext`
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
WP-A0
  └── WP-PREFLIGHT
        └── WP-A1 ─┬─ WP-A3 ─┬─ WP-D1
                   │          └─ WP-D2
                   │          └─ WP-D3
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
| A — Fundação (inclui PREFLIGHT) | ~8h |
| B — Hoje + Revisão | ~6h |
| C — Plano | ~4h |
| D — Estatísticas (D3 obrigatório) | ~5.5h |
| E — Acompanhamento + Disciplinas | ~3h |
| F — Polish + UATs | ~4.5h + manual |
| **Total** | **~31h + UAT manual** |
