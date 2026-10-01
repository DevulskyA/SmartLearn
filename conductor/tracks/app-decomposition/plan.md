# TRACK: APP-DECOMPOSITION — Decompor src/app.js em módulos coesos

> Ledger MACRO de marcos (GOV-2 opção A: execução de tarefa = skill `tlc-spec-driven-strict`). Chat/UI = projeções deste arquivo.
> Hierarquia: Constitution = intenção · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Origem: auditoria de `src/app.js` @ 6f2e816 (nenhum BLOCKER_INTEGRATION; Materiais = 1ª fronteira). Autorizado pelo usuário em 2026-10-01
> (execução, não só planejamento). Branch: `claude/smartlearn-v1-complete`. NO_PUSH / NO_MERGE(main) / NO_DEPLOY.
> Regras do track: slices pequenos e reversíveis; mover responsabilidade coesa SEM mudança funcional; preservar DOM, ARIA, foco,
> idempotência, persistência; caracterizar ANTES; sem framework, store global, DI framework, arquitetura paralela ou rewrite;
> NÃO tocar `REMOTE_MODE` / `LOCAL_AUTHORITY` / `LocalDB`; não enfraquecer teste, retries, workers ou timeouts.
> Depois da decomposição estável: voltar ao produto (próximo slice de valor desbloqueado), sem ciclo permanente de refatoração.

```
Track:    app-decomposition                    Status: IN_PROGRESS
MARCO ATUAL: slice 1 — source-details-ui.js
Iniciado: 2026-10-01
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: DECOMP-1
```

## Tarefas

- [>] **DECOMP-1 Extrair a apresentação compartilhada de origem para source-details-ui.js** — OWNER: GUI
      SPRINT_GOAL: tirar do app.js `formatPageList`, `createSourceDetails` e `appendSummarySources` (usados por Plano, Estudar agora, correção de prova e revisão de rascunho), sem mudar comportamento.
      BEFORE: 3 funções de apresentação de origem dentro de src/app.js, chamadas em 5 pontos (Plano, Estudar agora, cartão de erro, correção de prova, revisão de rascunho); `appendSummarySources` lê `REMOTE_MODE`/`DB` globais.
      AFTER: módulo `src/source-details-ui.js` sem estado e sem globais (a API de unidades entra por parâmetro: `REMOTE_MODE ? DB.learningUnits : null`); app.js só importa; teste de caracterização `test/source-details-ui.test.js`.
      SCOPE: só essas 3 funções + imports/chamadas; nada de Materiais ainda.
      PROOF: unit (test/source-details-ui.test.js) + lint + e2e das superfícies que mostram origem (content-quality-flow, draft-acceptance, plan-study-now, study-now-flow, exam-mode) + suíte e2e completa.
      DONE_WHEN: equivalência provada, diff inspecionado, commit separado.
- [ ] **DECOMP-2 Extrair Materiais/Drafts (src/app.js ~3024-3634) para um módulo de UI** — OWNER: GUI
      DEPENDENCIES: DECOMP-1. Contrato: 6 constantes `sources*`, render/handlers de propostas e rascunho; dependências de saída injetadas (renderToday, renderSubjects, renderStudies, DB.subjects.getActive).
- [ ] **DECOMP-3 Reavaliar o app.js real e escolher o próximo acoplamento** — OWNER: GUI
      DEPENDENCIES: DECOMP-2. Candidatos: Account/Theme, Stats/Tracking, Exam, Study Now/Retest, Review Dashboard; navigation/bootstrap só por último.
- [ ] **DECOMP-4 Prova completa da decomposição e retorno ao produto** — OWNER: GUI
      DEPENDENCIES: DECOMP-3. lint, unit, server, clippy, build, e2e completo x2, diff final, smoke Windows se houver acesso; depois, próximo slice de produto desbloqueado.
