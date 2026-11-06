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
Track:    app-decomposition                    Status: DONE
MARCO ATUAL: FECHADO — DECOMP-1..4 concluídos; app.js 6464 -> 5855 linhas
Iniciado: 2026-10-01
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: nenhuma (track fechado)
```

## Tarefas

- [✓] **DECOMP-1 Extrair a apresentação compartilhada de origem para source-details-ui.js** — OWNER: GUI
      SPRINT_GOAL: tirar do app.js `formatPageList`, `createSourceDetails` e `appendSummarySources` (usados por Plano, Estudar agora, correção de prova e revisão de rascunho), sem mudar comportamento.
      BEFORE: 3 funções de apresentação de origem dentro de src/app.js, chamadas em 5 pontos (Plano, Estudar agora, cartão de erro, correção de prova, revisão de rascunho); `appendSummarySources` lê `REMOTE_MODE`/`DB` globais.
      AFTER: módulo `src/source-details-ui.js` sem estado e sem globais (a API de unidades entra por parâmetro: `REMOTE_MODE ? DB.learningUnits : null`); app.js só importa; teste de caracterização `test/source-details-ui.test.js`.
      SCOPE: só essas 3 funções + imports/chamadas; nada de Materiais ainda.
      PROOF: unit (test/source-details-ui.test.js) + lint + e2e das superfícies que mostram origem (content-quality-flow, draft-acceptance, plan-study-now, study-now-flow, exam-mode) + suíte e2e completa.
      DONE_WHEN: equivalência provada, diff inspecionado, commit separado.
- [✓] **DECOMP-2 Extrair Materiais/Drafts (src/app.js ~3024-3634) para um módulo de UI** — OWNER: GUI
      DEPENDENCIES: DECOMP-1. Contrato: 6 constantes `sources*`, render/handlers de propostas e rascunho; dependências de saída injetadas (renderToday, renderSubjects, renderStudies, DB.subjects.getActive).
      EVIDENCE DECOMP-1 (233c4f0): src/source-details-ui.js (formatPageList, createSourceDetails, appendSummarySources com a API injetada) + 6 testes de caracterização; unit 407/407; e2e 181/181; lint 22 avisos (iguais ao baseline). dom-utils.js (c989360): createTextElement compartilhado; 24 e2e das superfícies que o usam verdes.
      EVIDENCE DECOMP-2 (0b9fe71): ~570 linhas de Materiais/Drafts saem do app.js para src/materials-ui.js (586 linhas). `diff` linha a linha do bloco original contra o módulo = só 5 substituições de dependência (configureMaterialsUI: listActiveSubjects, getLocalDateValue, startStudyNow, refreshAfterAccept) + o adaptador appendSummarySources que fica no app.js. app.js 6464 -> 5855 linhas. unit 407/407; e2e 181/181 no HEAD; lint 22 avisos (iguais).
- [✓] **DECOMP-3 Reavaliar o app.js real e escolher o próximo acoplamento** — OWNER: GUI
      DEPENDENCIES: DECOMP-2. Candidatos: Account/Theme, Stats/Tracking, Exam, Study Now/Retest, Review Dashboard; navigation/bootstrap só por último.
      DECISÃO (2026-10-01): PARAR a extração aqui. A fronteira de maior valor/menor risco (Materiais, a mais acoplada a uploads/rascunho/aceite) saiu. Restantes: Stats/Tracking = superfície PROTEGIDA (ADR-0001), Study Now/Exam/Review Dashboard = caminhos recém-corrigidos e de risco alto, retorno marginal agora. Extrair só quando uma feature concreta tocar a área (regra "refatorar quando bloqueia"). Lint: 22 avisos de nomes mortos seguem como TECH_DEBT.
- [✓] **DECOMP-4 Prova completa da decomposição e retorno ao produto** — OWNER: GUI
      DEPENDENCIES: DECOMP-3. lint, unit, server, clippy, build, e2e completo x2, diff final, smoke Windows se houver acesso; depois, próximo slice de produto desbloqueado.
      EVIDENCE (código 0b9fe71, docs 7d90455): lint 0 erros/22 avisos (= baseline); inventory 148 arquivos PASS; unit 407/407; server 623/623; clippy -D warnings limpo; build OK; npm audit root e server = 0 vulnerabilidades; e2e 181/181 no HEAD de código. Diff final: o bloco de Materiais difere do original só por 5 substituições de dependência; nenhum teste alterado/enfraquecido (só test/source-details-ui.test.js novo). NOT_PROVEN: smoke Windows (acesso negado); e2e foi 1 rodada completa no HEAD final (+2 no HEAD anterior 6f2e816, mesmo comportamento).
