# EXECUTION.md — SmartLearn (retomada rápida)

> Cockpit mínimo pra sessão perdida. Histórico completo: `.specs/STATE.md`.

PROJECT=SmartLearn
WORK_BRANCH=claude/smartlearn-v1-complete
MAIN_MODE=READ_ONLY_FOR_AGENT
CURRENT_HEAD=1c91020
WORKTREE_CLEAN=YES (.impeccable/ untracked, local hook cache, not product code)
REMOTE_MATCH=UNKNOWN (not pushed this session)
PR=6
CURRENT_TASK=MASTER_BUILD_PLAN_ROLLOUT (see MASTER_BUILD_PLAN_PATH — supersedes UX_UI_DESIGN_AUDIT, which is DONE: see STATS_VISUAL_PORT below)
ENV_NORMALIZED=YES
PRODUCT_CONSTITUTION_PATH=.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md
MASTER_BUILD_PLAN_PATH=.specs/governance/SMARTLEARN_MASTER_BUILD_PLAN_V1.md

STATS_SLICE_1=DONE
STATS_SLICE_2=DONE
EVIDENCE_FIX=DONE
TARGETED_TESTS=48/48 PASS

STATS_VISUAL_PORT=DONE (2026-09-14, commit 4357c36) — real #screen-stats now uses
  the approved two-tab workspace-grid (Por disciplina/Por conteúdo), .subject-cell
  chips, shared matrix row grammar; verified live with seeded data (no console
  errors, row-select -> detail panel, row-select -> evolution filter sync, period
  filter no longer throws — was a real `today` ReferenceError, fixed). Deleted the
  duplicate "Nota média por disciplina" panel + its dead-code (createSubjectCompa-
  risonRow, createStateBadge, .subject-kpi*/.unit-stats-row* CSS). Exercícios
  resolvidos + metric-grid KPIs left untouched (different granularity/domain).
  DESIGN.md corrected first (commit a00e3ce): side-stripe ban now scoped to
  review-urgency status, subject-identity stripe explicitly documented/allowed.

SEQUENCE_C_HOJE=DONE (2026-09-14, commit 1c91020) — biggest real defect found
  live (not from reading code alone): every review row rendered fully
  expanded (resumo + all exercises + detail + external form) for every
  overdue/today item, contradicting Hoje's own documented intent (master
  plan §21 "ação, não dashboard"; STATE.md Slice 3 "one primary action, not
  a wall of fully-expanded rows"). Fixed with progressive disclosure: rows
  collapse to identity+status+score+mark-done by default, "Ver conteúdo"
  opens resumo/exercícios/detalhe/externos on demand; "Começar agora" opens
  the target row's body before scroll+highlight (extends the existing
  primary-action code path, doesn't replace it). Also fixed Resumo Mestre
  display duplicating the unit title when no summary exists yet (now a
  distinct muted placeholder, same pattern already used in Plano's unit
  detail). Zero data/scoring/schedule changes. Verified live in the real
  #screen-today (collapse/expand, primary-action auto-open, no console
  errors on a fresh module load) + e2e/practice.spec.js, offline.spec.js,
  server-authority.spec.js all green (10/10 — practice.spec.js specifically
  exercises the now-collapsed review-exercise-item flow).

NEXT_PRODUCT_TASK=MASTER_BUILD_PLAN sequence D (Plano + Acompanhar) — see
  phase list in MASTER_BUILD_PLAN_PATH §50. Phases E-H (Estatísticas per-
  disciplina/conteúdo already visually ported at STATS_VISUAL_PORT but not
  re-audited as its own sequence pass, Disciplinas, Configurações+Conta,
  whole-product pass) not started. Whole-product design rollout is IN
  PROGRESS under an explicit user autonomy override (2026-09-14): local/
  reversible/visual decisions are made without stopping to ask; only
  functional/schema/architecture-level changes are HUMAN_GATE.

DESIGN_DECISION (2026-09-12):
- parar novas features visuais temporariamente;
- resolver agora UX, arquitetura de informação, hierarquia, navegação,
  progressive disclosure e uso semântico de cores;
- NÃO fazer polish final agora;
- Estatísticas está funcional, porém visualmente carregada;
- próxima etapa é auditoria UX/UI especializada antes de qualquer Slice 3;
- preservar matemática/analytics atuais (weightedAccuracy, performanceColor,
  volumeBarWidth, thresholds, trend — nada disso é o problema);
- designer primeiro propõe, não implementa;
- depois comparar proposta com interface atual e implementar somente
  mudanças de alto impacto.

DESIGN_GOAL: "Qual é a menor interface que permite ao aluno entender
imediatamente o que precisa fazer e como está aprendendo?"

EXECUTION_POLICY:
- produto > processo; contexto mínimo; vertical slice;
- não reinventar arquitetura; não tocar main;
- nenhuma ação externa irreversível sem autorização;
- TLC V3=PAUSED_BUGGED;
- desenvolvimento normal=Desenvolvimento Ágil Agentico.

CANONICAL_DECISIONS:
- local-first desktop (app funciona standalone sem servidor)
- Luna Alto (gpt-5.6-luna, reasoning_effort=high) permanece decisão canônica — ver STATE.md AI_PROVIDER_DECISION
- main não é worktree de desenvolvimento

RECOVERY (se perdeu contexto):
1. git worktree list
2. entrar no worktree de WORK_BRANCH acima
3. branch --show-current (deve ser WORK_BRANCH)
4. git rev-parse HEAD
5. git status --short (deve ser limpo, ou só do que você mesmo está fazendo)
6. ler este arquivo até o fim
7. continuar CURRENT_TASK

NUNCA ao perder contexto: inspecionar/editar `main`, replanejar produto,
reabrir decisão humana já fechada, ou perguntar ao usuário "o que você
quer continuar" antes de rodar os passos 1-6 acima.

ARMADILHA CONHECIDA — preview_start({name:"dev"}) pode servir `main`, não este
worktree (mesmo bug do WORKTREE_LAUNCH_ROOT_RESOLUTION do checkpoint
ENV-NORMALIZE-01). Sintoma: a página carrega sem erro mas mostra HTML/JS
antigo (classes/elementos que você acabou de adicionar não existem no DOM).
Confirmar SEMPRE antes de investigar "por que não funcionou": no browser,
`fetch('/index.html', {cache:'no-store'}).then(r=>r.text())` e procurar uma
string que só existe na sua edição. Se sumir: parar o preview
(`preview_stop`), rodar `npm run dev -- --port <outra>` via Bash com
`run_in_background:true` a partir DESTE diretório (confirmar no log que
`predev` imprimiu `SMARTLEARN_ROOT=...smartlearn-v1-complete`), e apontar o
Browser pane pro `http://localhost:<porta>` real via
`preview_start({url:...})` (não `{name:...}`).

DEV LOCAL (modo padrão, sem servidor): `npm run dev`
DEV REMOTO (testar login/Conta/SERVIDOR CENTRAL): `npm run dev:remote`
  (sobe server + vite juntos, já com VITE_REMOTE_MODE=1 e origins corretas)
Todos os scripts oficiais (dev/build/preview/start) rodam
`scripts/require-work-branch.mjs` antes e recusam rodar fora de
WORK_BRANCH — se aparecer SMARTLEARN_WRONG_WORKTREE, pare.

NO_PUSH
NO_MERGE
NO_DEPLOY
