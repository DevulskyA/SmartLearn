# validation.md — smartlearn-ui-analytics-vnext

**Verifier:** Claude Sonnet 4.6 (author ≠ verifier — independent pass)
**Date:** 2026-09-03
**Branch:** claude/com-tlc-replanning-77f844
**Verdict:** PASS

---

## Diff range (commits verified)

```
217f52d  WP-B3 registro de exercicios externos
f936cff  WP-C1 tela Plano com inventario compacto
8b69653  WP-C2 fluxo Nova Aula inline sem perda de draft
78bf91d  WP-D1 estatisticas por disciplina
71b584f  WP-D2+D3 estatisticas por conteudo e evolucao temporal
26935dc  WP-E1+E2 telas Acompanhamento e Disciplinas
cd0c327  WP-F1 consolidar seletores de tema e tokens
```

---

## Spec-anchored outcome check (per AC)

### Módulo 1 — Hoje (AC-RES)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-RES-01 | Vencidas aparecem em seção distinta antes das de hoje | PASS — seção `#overdue-section` separada de `#today-section` |
| AC-RES-02 | Chip disciplina + título + n revisão + status + CTA | PASS — `renderToday()` constrói cada linha com chip colorido, `R{n}`, CTA Revisar |
| AC-RES-03 | Concluir revisão atualiza tela sem navegação | PASS — `completeReviewWithEvidence()` + `renderToday()` sem reload |
| AC-RES-04 | Status visual não depende só de cor | PASS — badge texto + ícone/classe semântica |
| AC-RES-05 | Preview amanhã leve, sem CTA | PASS — seção `#tomorrow-section` sem botões de ação |
| AC-RES-06 | Tela Hoje não contém CRUD de disciplinas | PASS — cadastro separado para tela Registro |
| AC-RES-07 | Resumo de carga acima do fold | PASS — `.today-load-summary` renderizado antes das listas |

### Módulo 2 — Plano (AC-RP)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-RP-01 | Por unidade: chip, título, study_date, fonte, resumo, n exercícios, próxima revisão | PASS — renderPlan() compacto |
| AC-RP-02 | Visão padrão compacta | PASS — `.plan-row-compact` por unidade |
| AC-RP-03 | Expansão por demanda | PASS — `.plan-row-detail` lazy via click |
| AC-RP-04 | 16 tarefas internas não aparecem como 16 linhas | PASS — 1 linha por unidade, tasks são internas |
| AC-RP-05 | Filtros disciplina e estado | PASS — `#plan-filter-subject`, `#plan-filter-state` |
| AC-RP-06 | Ordenação padrão study_date desc | PASS — `sort((a,b) => b.studyDate.localeCompare(a.studyDate))` |

### Módulo 3 — Evidência (AC-DET)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-DET-01 | Exercícios internos: app calcula automaticamente | PASS — `completeReviewWithEvidence` atomic |
| AC-DET-02 | Execução externa: n questões + n acertos → EXTERNAL | PASS — WP-B3, form de registro externo |
| AC-DET-03 | Cada evidência: data, context, questões, acertos, score | PASS — `learning_evidence` schema |
| AC-DET-04 | Evidência REVIEW vinculada a review_task | PASS — `reviewTaskId` obrigatório para REVIEW |
| AC-DET-05 | Detalhes acessíveis por expansão no Plano | PASS — `.plan-evidence-list` no detalhe expandido |

### Módulo 4 — Estatísticas por disciplina (AC-EST1)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-EST1-01 | weighted_accuracy + total questões + total acertos + n com evidência | PASS — `renderStatsBySubject()` via `Analytics.bySubject()` |
| AC-EST1-02 | Desempenho recente 30d | PASS — `recentAccuracy` calculado por `Analytics.bySubject()` |
| AC-EST1-03 | Tendência ↑/↓/→ determinística | PASS — `subjectTrend()` delta-de-janelas testado (15 testes) |
| AC-EST1-04 | Estado semântico via thresholds configuráveis | PASS — `THRESHOLDS` em `performance-thresholds.js`, não magic numbers |
| AC-EST1-05 | Sem evidência ≠ 0% — exibido como neutro | PASS — `is-no-evidence` classe + "Sem evidência" text; UAT confirmou 2 cards neutros |
| AC-EST1-06 | Ordenação padrão pior→melhor; alternativas | PASS — select `#stats-subject-sort` com opções |
| AC-EST1-07 | Nunca só percentual — sempre % + n questões | PASS — `.subject-kpi` mostra "X,Y% · N q" |

### Módulo 5 — Estatísticas por conteúdo (AC-EST2)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-EST2-01 | Por unit: sequência scores, weighted_accuracy, n questões, tendência | PASS — `Analytics.byUnit()` |
| AC-EST2-02 | Tendência derivada de últimos N scores (N≥3) — last-N | PASS — `unitTrend()` testado (5 testes) |
| AC-EST2-03 | Sparkline suficiente | PASS — `buildSparkline()` SVG polyline 60×24 |
| AC-EST2-04 | Filtros disciplina + tendência + período | PASS — `renderStatsByUnit()` + `renderEvolutionSvg()` com selects |
| AC-EST2-05 | Ordenação padrão pior recente → melhor | PASS — sort por `recentScore` asc |

### Módulo 6 — Acompanhamento (AC-ACOMP)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-ACOMP-01 | Por unidade: disciplina, título, study_date, fonte, resumo, n exercícios, q/a/%, revisões done/pending, última atividade, estado | PASS — tracking card meta |
| AC-ACOMP-02 | "Resumo Mestre presente" derivado de summary_body | PASS — "Resumo ✓" ou "Resumo —" em meta |
| AC-ACOMP-03 | Estado derivado deterministicamente: 5 estados | PASS — `getTrackingState()`, UAT confirmou allValid=true |
| AC-ACOMP-04 | Filtros disciplina + estado | PASS — `#tracking-filter-subject`, `#tracking-filter-state` |
| AC-ACOMP-05 | Ação rápida: abertura unidade | PARTIAL — cards mostram info, botão de ação direta não implementado; spec diz "abrir unidade, adicionar Resumo Mestre, ir para revisão pendente" como ação rápida — UI atual é read-only no tracking |

### Módulo 7 — Disciplinas (AC-DISC)

| AC | Requisito | Resultado |
|----|-----------|-----------|
| AC-DISC-01 | Nome, cor, estado, n units, weighted_accuracy | PASS — catalog card com chip, meta |
| AC-DISC-02 | Cor de identidade, não de desempenho | PASS — cor via DISC palette, separada de performance states |
| AC-DISC-03 | Criar inline, sem tela separada | PASS — `#subjects-create-form` inline |
| AC-DISC-04 | Hard delete somente quando sem units; arquivo preserva histórico | PASS — `units.length > 0` guard, arquivar via `isActive=false` |
| AC-DISC-05 | Paleta 12 cores | PASS — 12 `SUBJECT_COLOR_KEYS`, 12 swatches na UAT |

---

## Non-functional requirements

| NF | Requisito | Resultado |
|----|-----------|-----------|
| NF-01 | Tauri 2 + SQLite; BrowserStore só para tests | PASS — BrowserStore apenas em test double |
| NF-02 | schemaVersion: 3 no backup | PASS — exportAll retorna `schemaVersion: 3` (teste confirmado) |
| NF-03 | Migrations idempotentes via ensureColumns | PASS — `runMigrationFromReviewTasks` idempotente (teste dupla execução) |
| NF-04 | node:test sem framework | PASS |
| NF-05 | CSS vars para todos os tokens | PASS — sem magic numbers de cor em tokens primários |
| NF-06 | Thresholds como constantes nomeadas | PASS — `THRESHOLDS` em `performance-thresholds.js` |
| NF-07 | Dois algoritmos explícitos, determinísticos, testáveis | PASS — `subjectTrend` + `unitTrend`, 20 testes cobrindo ambos |
| NF-08 | Todos os 5 temas preservados | PASS — WP-F1 consolidou seletores; `applyThemePreference()` aplica tokens por tema |

---

## Discrimination sensor

| Mutante | Injetado | Killed |
|---------|----------|--------|
| `subjectTrend`: `IMPROVING` → `DECLINING` | `analytics.js:33` | SIM — "subjectTrend retorna IMPROVING quando delta > 0.03" |
| `importAll`: remoção de upper-bound `version > SCHEMA_VERSION` | `db.js:201` | SIM — "importAll schemaVersion desconhecido lança erro fail-closed" |

---

## Gaps e desvios

| Gap | Severidade | Descrição |
|-----|-----------|-----------|
| AC-ACOMP-05 parcial | LOW | Ações rápidas (abrir unidade, ir para revisão pendente) não implementadas no tracking. Cards são read-only. Não bloqueia fluxo principal; usuário pode navegar para Plano. |

---

## Conclusão

**PASS com 1 gap de baixa severidade.** Todos os requisitos funcionais críticos (AC-EST1-05 honestidade estatística, AC-DISC-04 hard delete fail-closed, AC-ACOMP-03 estados determinísticos, NF-02 schemaVersion 3) verificados. Sensor de discriminação confirma cobertura comportamental ativa. Gap AC-ACOMP-05 não bloqueia o HUMAN_GATE.
