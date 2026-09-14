# EXECUTION.md — SmartLearn (retomada rápida)

> Cockpit mínimo pra sessão perdida. Histórico completo: `.specs/STATE.md`.

PROJECT=SmartLearn
WORK_BRANCH=claude/smartlearn-v1-complete
MAIN_MODE=READ_ONLY_FOR_AGENT
CURRENT_HEAD=edeeb6b
WORKTREE_CLEAN=YES (.impeccable/ untracked, local hook cache, not product code)
REMOTE_MATCH=UNKNOWN (not pushed this session)
PR=6
CURRENT_TASK=SEQUENCE_H_RESPONSIVE_A11Y_STATES_PASS (see SEQUENCE_H_PROGRESS below — first pass across all 8 real screens at 375px done; MASTER_BUILD_PLAN_ROLLOUT resumes after)
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

SEQUENCE_D_PLANO_ACOMPANHAR=DONE (2026-09-14, commit 5460f46) — Plano's
  compact row was truncating title/source mid-word on one nowrap line at
  this app's real content width ("Farmacocinética...", "Goodman &...");
  fixed with CSS `order` only (identity+status on line 1, title/meta each
  full-width on their own line). Acompanhar inspected live, already legible/
  functional (title/meta wrap naturally, 3 distinct actions per row) — no
  defect found, left untouched. Also fixed two undefined CSS custom
  properties (--color-text-muted, --color-text-secondary; real token is
  --color-muted) that were silently breaking muted-text hierarchy in Plano's
  detail panel, Disciplinas, and the shared .trend-badge/.sparkline.
  e2e/smartlearn-plan-flow.spec.js 12/12 green.

SEQUENCE_F_DISCIPLINAS=PARTIAL (2026-09-14, commit 5460f46) — added the
  master-plan-specified subject-color left-edge stripe to each discipline
  card (was plain, no color identity at all, on the one screen explicitly
  called out for "identidade cromática forte"). Rest of the screen (create
  form, edit/archive/delete flow) not yet re-audited.

SEQUENCE_E_ESTATISTICAS_INCIDENT (2026-09-14): mid-session, an attempt to
  redesign Estatísticas' top metric summary + swap Por conteúdo's whole
  markup in one large edit caused a real regression (half-wired DOM, stale
  Vite dev-server cache compounding the confusion) — user caught it, work
  was reverted to commit 4357c36 (`git revert` of the two offending commits,
  verified index.html byte-identical to baseline again), and a corrective
  method was set: LOCKED (already-approved) composition must be reproduced
  faithfully from C:\Projetos\SmartLearn-Stats-Prototype, never
  reinterpreted; OPEN areas get full design autonomy; every slice must be
  small, fully wired (HTML+CSS+JS together, never markup-only), rendered,
  and tested before the next one. Recurring trap hit twice: Vite's dev
  server can keep serving a stale cached bundle after a file change (or a
  git revert) — symptom is a page that LOOKS broken/unstyled even though
  the source is correct; fix is killing the server, `rm -rf node_modules/
  .vite`, and restarting, not editing more code. Do this proactively before
  trusting a "broken" render.

SEQUENCE_E_ESTATISTICAS_PROGRESS (2026-09-14, commits 5c4b909, d565e5f,
  cf6dcb7 — all on top of the restored 4357c36 baseline, each its own
  small verified slice):
  1. Por conteúdo discipline context switcher (trigger = current subject,
     menu = only alternatives), ported from the approved prototype's
     .content-context/.discipline-switch-list, replacing the "Todas as
     disciplinas" filter. Reuses Analytics.bySubject (no new calc).
  2. Header-click sorting (Desempenho/Prática/Tendência columns, arrow
     shows direction) on BOTH Por disciplina and Por conteúdo, replacing
     both "Ordenar por" dropdowns and the "Todas as tendências" filter —
     one shared sortMatrixRows/wireSortableHeaders implementation.
     Deliberate capability drop: the old dropdown's "Disciplina"/"Última
     atividade" sort modes have no column to attach to and aren't in the
     approved prototype's own sort set either — not carried forward.
  3. Period filter relocated from inside Por conteúdo's toolbar to the
     page-level .screen-heading (global position, per explicit
     instruction). Still only functionally filters Por conteúdo (its
     existing behavior, unchanged) — extending it to also scope Por
     disciplina needs Analytics.bySubject's rows to carry lastEvidence
     (they don't yet); flagged as the next increment, not done silently.
  Seeded 9 realistic subjects (Anatomia..Pediatria, two evidence windows
  each for real trend variety) directly via DB.* in the running dev
  session for visual verification — session-local, not a migration/fixture
  file, nothing committed.
  4. Period now also scopes Por disciplina (commit 896a8c2):
     Analytics.bySubject rows gained lastEvidence (additive, same
     computation Analytics.byUnit already used — no change to
     weightedAccuracy/totalQuestions/trend/state), both render functions'
     duplicated cutoff logic extracted into one filterByPeriod() helper.
  5. /impeccable typeset audit + fix (commit b94c627): mechanical scan
     clean, but computed-style inspection of a real row found the
     performance percentage (.subject-compare-value, the one number each
     row exists to show) at 0.8rem/600 — smaller than its own row's subject
     label (0.94rem) and practice text (0.82rem). Bumped to 1.05rem/750
     (DESIGN.md's "focal line" role, an exact fit). createComparisonCell()
     is shared by both tables, one fix covers both.
  Audited and left alone (no real defect found, not touched): "Exercícios
  resolvidos" — looked legacy/card-stacked in a screenshot but is a real
  <table> with an already deliberate, well-built responsive card treatment
  for narrow widths (styles.css ~2321+, ::before labels) — not neglected,
  just easy to misjudge from a screenshot alone.
  Still open on Estatísticas: the top metric-grid (6 identical cards,
  DESIGN.md-banned pattern) — explicitly reverted tonight per direct user
  instruction and left alone; do not re-touch without new explicit
  direction, it's the one area with real friction tonight. The evolution/
  analysis side panels (both tabs) not fully re-audited against the
  prototype's richer version (trend-delta headline, practice-pacing text) —
  what exists today is a plainer but functional SVG chart, real gap not a
  regression. One flagged-not-fixed duplication: the evolution chart's own
  local period selector (3/6/12 months / Tudo) is conceptually different
  from tonight's new global row-cutoff period control (chart time-range vs.
  row inclusion) — merging them needs a product decision, not a reflex fix.
  6. Accessibility check on the new context-switcher (commit 01d9bdf):
     Escape had no handler at all (click-outside-to-close existed, Escape
     didn't) — real gap, fixed, closes + returns focus to the trigger.
     Verified live with real keyboard focus. (Enter-to-open tested
     inconclusive in the Browser-pane's key simulation — native button
     keyboard activation is HTML-spec-guaranteed and nothing in the code
     blocks it; treated as a tooling artifact, not chased further.)

FULL_REGRESSION_CHECK (2026-09-14, end of this stretch): full `npx
  playwright test` — 48/48 green, including e2e/production-build.spec.js
  (real vite build + served single-origin, no dev server) — zero
  regressions across everything touched tonight (Hoje, Plano, Disciplinas,
  Estatísticas) plus everything untouched. test/*.test.js 283/283 (last run
  after the Escape fix).

STATUS_AT_SESSION_END (2026-09-14, long session, real incident + full
  recovery — see SEQUENCE_E_ESTATISTICAS_INCIDENT above for what happened):
  - E (Estatísticas): SEQUENCE_E_ESTATISTICAS_PROGRESS items 1-6 all DONE
    and verified. Still explicitly open: top metric-grid (deliberately left
    alone, real user friction there tonight — do not touch without new
    explicit direction), evolution/analysis side panels not re-audited
    against the prototype's richer version, the evolution chart's own local
    period selector still duplicates (differently) the new global one.
  - F (Disciplinas): stripe applied (commit 5460f46) + create/edit/archive/
    delete forms inspected live earlier this session — no defect found.
    Practically closed; not formally re-verified after tonight's later
    commits (low risk, untouched files).
  - G (Configurações): inspected live earlier this session — already clean,
    coherent, no defect found. Conta is REMOTE_MODE-gated and unreachable
    under plain `npm run dev` (see DEV LOCAL/DEV REMOTO below) — never
    actually inspected this session; deliberately not attempted because
    switching dev server modes carried real risk after two stale-cache
    incidents already this session.
  - H (whole-product pass — responsividade/acessibilidade/estados/
    continuidade across all 8 screens: Hoje, Materiais, Plano, Estatísticas,
    Acompanhar, Disciplinas, Configurações, Conta): NOT STARTED. This is the
    single largest remaining piece of the GOAL below — expect multiple
    hours, plan for it as its own focused stretch.
  Session ended here by explicit safety/pacing judgment (long session, one
  real incident already, no live user oversight at the time), not because
  the GOAL was met. FULL_REGRESSION_CHECK above (48/48 e2e, 283/283 unit)
  proves the stopping point itself is clean — resume from here with
  confidence, the base is solid.

ACTIVE_GOAL (verbatim, set via /goal 2026-09-14 — re-set with /goal if this
  session's own goal-tracking didn't survive the reset; treat as still the
  standing instruction either way until the user says otherwise):
  "Transformar TODO o SmartLearn real em um único produto de aprendizagem
  médica visualmente excepcional, coerente, intuitivo e inequivocamente
  próprio — qualidade top 0,1% como piso — aplicando às superfícies
  existentes a linguagem de design já aprovada, eliminando aparência de
  protótipo, legado, dashboard genérico e atrito desnecessário, preservando
  integralmente a lógica, os dados e as funções corretas; concluir primeiro
  o design/UX completo e consistente do produto para, somente depois,
  evoluir sua lógica funcional e pedagógica."
  Execution rule that came with it: reconcile real state -> pick the
  highest-impact incomplete surface/family -> preserve function+data ->
  apply the approved visual system -> integrate legacy elements by their
  semantics -> render and use the real result -> fix the biggest design/UX
  defect found -> validate only enough to guarantee no regression ->
  checkpoint when material -> move immediately to the next surface. Don't
  stop for local/reversible/inferable decisions; don't ask approval page by
  page; don't turn visual problems into planning/architecture. Stop only at
  a real human gate or when every current surface is coherent, rendered,
  validated, and at the defined standard.
  Real human gate (from tonight's correction, applies going forward):
  LOCKED = already-decided composition (reproduce faithfully from
  C:\Projetos\SmartLearn-Stats-Prototype, never reinterpret, no comboboxes/
  toolbars where a column/switcher already solves it). OPEN = undecided
  areas (full design autonomy). Small, fully-wired (HTML+CSS+JS together,
  never markup-only), rendered-and-tested slices — never a large one-shot
  swap. See SEQUENCE_E_ESTATISTICAS_INCIDENT for exactly what went wrong
  the one time this was violated tonight, and how it was recovered.

NEXT_PRODUCT_TASK=Sequence H continues. First pass (375px mobile, one lap
  across all 8 real screens: Hoje, Plano, Estatísticas, Acompanhar,
  Materiais, Disciplinas, Configurações, Conta) is DONE — see
  SEQUENCE_H_PROGRESS below for the 4 real defects found+fixed+verified.
  NOT yet done: a second, deeper lap (tablet-width a11y specifics, full
  keyboard-only walkthrough beyond the spot-checks already done, loading-
  state races, long-content stress beyond what was seeded). Do NOT touch
  the Estatísticas metric-grid without new explicit user direction. See
  MASTER_BUILD_PLAN_PATH §50 for the full surface list/sequence lettering.

SEQUENCE_H_PROGRESS (2026-09-14, this stretch — commits 92316e7, ff7dec2,
  05fd87f, edeeb6b, all on top of the 637003c checkpoint, each its own
  verified+tested slice):
  1. Bottom nav (all 8 screens, commit 92316e7): CSS grid was hardcoded to
     6 columns (`repeat(6, 1fr)`) but the product has 7 real nav
     destinations (Materiais stays intentionally `hidden`, confirmed by
     e2e/product-value.spec.js's REMOTE_AUTHORITY assertion — not touched).
     The 7th item, Conta, silently wrapped to an invisible second grid row
     positioned exactly below the viewport — completely unreachable on any
     real phone. Fixed the column count to 7 + gave labels room to wrap at
     a natural syllable break (soft hyphen) instead of overflowing past the
     viewport edge. This one bug affected every screen at once.
  2. Estatísticas Por conteúdo matrix table (commit ff7dec2): auto table
     layout let the identity column's content (subject chip + unit title,
     unlike Por disciplina's chip-only identity) dictate the whole table's
     width — 588px inside a 293px container, silent horizontal scroll, no
     affordance, the actual score value invisible by default. Scoped
     table-layout:fixed to the existing mobile breakpoint + overflow:hidden
     + ellipsis everywhere truncatable so it reads as intentional, not a
     hard cut. Took 3 iterations live (table-layout:fixed alone caused
     header overlap; a flex max-width on the identity cell alone didn't
     bound the column under auto layout) before landing on fixed layout +
     overflow:hidden together, which is the actual complete fix.
  3. Acompanhar card header (commit 05fd87f): same failure mode already
     fixed once on Plano (commit 5460f46, not touched again) — title had
     min-width:0+ellipsis inside a wrapping flex row, so it shrank to a
     sliver next to the subject chip/status badge instead of the row
     wrapping. Real titles ("Farmacocinética — Absorção e Distribuição")
     were unreadable. Same fix: reorder via flex `order`, title gets its
     own full-width line. (First attempt used a same-specificity selector
     that lost to the unconditional base rule later in the file — fixed by
     bumping selector specificity, not !important.)
  4. Conta register password hint (commit edeeb6b): reused `.field-message`
     (alert-red by default) for a static "Mínimo de 15 caracteres."
     requirement — the exact anti-pattern already documented in this same
     stylesheet for `.study-now-hint` (SMARTLEARN_PRODUCT_FIRST_V1 Slice
     4/5), just not caught here yet. New neutral `.field-hint` class,
     no JS referenced the old class so safe to swap.
  Spot-checked and found clean, no fix needed: Plano (mobile detail
  expand, aria-expanded correct), Disciplinas (new/edit form, color grid,
  destructive-action styling), Configurações (theme picker, backup,
  destructive "Apagar banco todo"), Conta login error state (role="status"
  aria-live="polite", correctly accessible). Materiais confirmed
  intentionally unreachable under plain `npm run dev` (LOCAL_AUTHORITY
  gate, not a CSS/attribute-only hide — forcing the nav button open did
  not switch the screen), matches e2e/product-value.spec.js; not a defect.
  Full e2e regression run after every slice: 48/48 green throughout.

SEED_DATA_NOTE: tonight's 9 realistic subjects (Anatomia..Pediatria, two
  evidence windows each) were created directly via DB.* in the running dev
  session's own database for visual verification — real rows in whatever
  DB file that dev server instance was using, NOT a fixture/migration, nothing
  committed to git. If the next session's dev database is a different file
  or was reset, this seed data will be gone and Estatísticas will render its
  honest empty/low-data states again (which is correct/expected, not a
  regression) — reseed with the same DB.* approach if rich data is needed
  again for visual work (see this session's transcript for the exact script
  if needed, not reproduced here).

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

SAFETY_BRANCH_LEFTOVER: `safety-before-stats-revert-20260914031957` — a
  local branch pointing at commit e891d5c, created as a pre-revert
  safety net during SEQUENCE_E_ESTATISTICAS_INCIDENT (never needed, the
  revert went cleanly). Harmless to leave; safe to delete once this
  checkpoint is trusted (`git branch -D safety-before-stats-revert-
  20260914031957`) — not done automatically, deleting a safety net isn't
  this session's call to make silently.
