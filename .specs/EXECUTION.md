# EXECUTION.md — SmartLearn (retomada rápida)

> Cockpit mínimo pra sessão perdida. Histórico completo: `.specs/STATE.md`.

PROJECT=SmartLearn
WORK_BRANCH=claude/smartlearn-v1-complete
MAIN_MODE=READ_ONLY_FOR_AGENT
CURRENT_HEAD=a63a35a
WORKTREE_CLEAN=YES (.impeccable/ untracked, local hook cache, not product code)
REMOTE_MATCH=YES — pushed this session, origin/claude/smartlearn-v1-complete = a63a35a
PR=6 (https://github.com/DevulskyA/SmartLearn/pull/6, still DRAFT) — an
  external audit rejected the prior state of this PR; this stretch (one
  commit, a63a35a on top of b5cad7a) responds to that audit's punch list.
  NO_MERGE, NO_DEPLOY — user is auditing.

CI_AUDIT_RESPONSE_CHECKPOINT (2026-09-14, commit a63a35a): external audit
  rejected PR #6. Investigated CI fresh rather than assuming the prior
  b18bb67 guard fix was still the cause (it wasn't — verified via
  `gh run view 34852132812 --log-failed`): CI was red on two independently
  flaky, timing-sensitive tests, not the guard. Fixed both (widened the
  Rust bind-wait budget in dropping_local_backend_actually_kills_the_
  child_process; made auth-abuse.test.js's rate-limit timing assertion
  self-calibrating against real scrypt cost measured in the same run
  instead of an absolute CI-load-sensitive ms ceiling) — see the commit
  message for full detail. Also fixed the real product regressions the
  audit flagged:
  - P0-1: discipline row click/keyboard in Estatísticas/Por disciplina
    opens Por conteúdo again (one semantic action, openSubjectContents(),
    src/app.js).
  - P0-2: the 9-discipline rich dataset this file's own SEED_DATA_NOTE
    below documented as lost-on-restart is now a real, versioned,
    rebuildable fixture (src/fixtures/uat-medical-dataset.js, same
    window.__seedUatMedical DEV-only path, never touches production data).
    SEED_DATA_NOTE below is now SUPERSEDED by this — kept for history.
  - P0-3: restored "Disciplina"/"Conteúdo" alphabetical sort and "Última
    atividade" recency sort, dropped without authorization per
    SEQUENCE_E_ESTATISTICAS_PROGRESS item 2 below (same header-click
    mechanism, recency shares the Prática <th> as a second button).
  - P0-4/P1-1: select-ui.js's ARIA pattern comment was wrong ("Select-Only
    Combobox" claimed, "Listbox Button" actually implemented) — comment
    fixed, trigger<->popup aria-controls relationship completed (was
    missing). Verified live across period/discipline/status/form selects,
    a disabled option, a long label, mobile, and specifically
    source-draft-subject-select (Materiais) — the SELECT_UI_ROLLOUT note
    below flagged this one as "not visually verified live"; now it has
    been, with a real spawned-server E2E test (e2e/select-ui.spec.js).
  - P1-2: Estatísticas' matrix tables no longer horizontal-scroll at
    768-900px (SEQUENCE_H_SECOND_LAP_OPEN below flagged this as accepted-
    but-not-really-attempted) — same table-layout:fixed fix as the phone
    breakpoint, extended to this range; a real regression found live while
    verifying it (display:flex on a <th> silently broke table-layout:fixed
    column-width distribution in Chromium, collapsing two header labels to
    single illegible letters) was caught and fixed before commit, not
    shipped.
  New tests: test/uat-medical-dataset.test.js (14), e2e/stats-discipline-
  drilldown.spec.js (4), e2e/stats-sorting.spec.js (5), e2e/select-ui.spec.js
  (7) — all green. Full gate: root 297/297, server 345/345, Rust 29/29,
  e2e 64/64, production build PASS. GitHub Actions CI confirmed GREEN on
  the pushed commit (both `rust` and `test` jobs, E2E included) — run
  https://github.com/DevulskyA/SmartLearn/actions/runs/34860161682.
  RESIDUAL_RISKS: the 9-subject fixture's calendar anchor is "today" at
  generation time (dynamic, not a fixed historical date) — this is
  intentional (states never go stale) but means review-task due-date
  fixtures shift slightly relative to real-world testing done on a
  different day; not a defect. Full native Windows/Tauri UAT was not
  re-run this stretch (no code path touched that LOCAL01A/LOCAL01B's own
  proofs didn't already cover — only Rust lib.rs's test-timing constant
  changed, not the local-backend launch/kill logic itself).

CURRENT_TASK=CI_AUDIT_RESPONSE_CHECKPOINT above is the latest work. Prior
  CURRENT_TASK text (Sequence H / select-ui rollout, kept below for
  history) is superseded by this checkpoint's own itemized fixes.

P0_DATA_INCIDENT (this stretch): user reported the dataset had disappeared.
  Investigated before touching anything — the real Tauri desktop DB
  (C:/Users/Ariel/AppData/Roaming/com.devulsky.smartlearn/smartlearn.db) was
  untouched all session (mtime 2026-09-05, this session never ran the Tauri
  binary until asked to prove it), read-only inspected via better-sqlite3
  (server/node_modules): 4 subjects (Biologia Celular, Farmacologia,
  Semiologia Médica, Neurologia), 4 learning_units, 64 review_tasks, 0
  orphan rows, `PRAGMA integrity_check` = ok. REAL_DATA_LOSS=0 — nothing was
  restored because nothing was actually lost. What the user saw "missing"
  was almost certainly this session's own throwaway dev-mode preview
  (BrowserStore, port 5183, only the 2-subject smoke fixture — see
  SEED_DATA_NOTE below, unrelated storage backend from the real SQLite
  file) and/or the installed C:/Users/Ariel/AppData/Local/SmartLearn/
  smartlearn.exe, which is a stale `tauri dev`-mode build requiring a vite
  dev server on the exact port in its devUrl (5173) — found it erroring
  ERR_CONNECTION_REFUSED because nothing was listening there, then found a
  second real bug while fixing it: `vite --port 5173` alone binds only
  `[::1]` (IPv6 loopback) on this machine, not `127.0.0.1`, which is what
  the Tauri webview actually requests — fixed by adding `--host 127.0.0.1`
  when relaunching. Real product data was never at risk; this exe is a dev
  artifact, not the shippable app (that requires `npm run tauri build`).
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
  Keyboard focus verified real (not a screenshot artifact): Tab-focused
  nav item matched(':focus-visible') with a real computed outline; no
  positive tabindex anywhere in the DOM.

  5. Acompanhar fix re-scope (commit 86e0c36): checking the sidebar layout
     itself at 768px (not just the 375px phone-nav breakpoint) found the
     SAME title-overflow bug item 3 had just fixed, still present — the
     47.99rem scoping assumed anything past the phone-nav breakpoint had
     enough room, which is false for the sidebar's own narrow content
     column. Moved to its own `max-width: 60rem` block; verified broken at
     768px→fixed, and unaffected at 1024px→still single-line as before.
     Estatísticas' matrix-table still overflows in that same 768–900px
     sidebar range, deliberately left as-is: unlike the title case it has
     a visible scrollbar affordance (arrows shown) and the critical
     performance value stays on-screen without scrolling — lower severity,
     flagged below as a second-lap item rather than fixed reflexively.
  Full e2e regression run after every slice: 48/48 green throughout.

SELECT_UI_ROLLOUT (this stretch, commit cc6a8f7): systemic fix — every
  native <select>'s trigger was already themed, but the open menu fell back
  to the browser/OS's own native popup (white bg, platform chrome, no dark-
  theme). One shared primitive, src/select-ui.js, now covers all 12 real
  <select> consumers (Hoje/Plano/Estatísticas/Acompanhar/Materiais/
  Disciplinas filters+forms) plus verified the approved subject context-
  switcher's own separate mechanics untouched. Native select kept as the
  value/change-event source of truth (progressive enhancement, not a
  rewrite) so zero product-logic call sites changed — ~10 one-line
  enhanceSelect()/syncSelect() calls added at the points that populate
  options or set .value programmatically. Full WAI-ARIA "Select-Only
  Combobox" keyboard behavior hand-built (arrows, typeahead, Home/End,
  Escape-cancel, focus-return), menu portalled to <body> and positioned
  from the trigger's real rect so no ancestor can clip it.
  Mid-build correction (user caught it live): first version duplicated the
  current value as a highlighted row inside its own open menu. Fixed to
  match the already-approved context-switcher grammar — TRIGGER = current
  value, MENU = alternatives only, documented as the new canonical rule in
  DESIGN.md "Single select". Also hit and fixed a real regression during
  build: hiding the native <select> with the `hidden` attribute broke two
  e2e specs' Playwright `selectOption()` calls (non-actionable element) —
  fixed by keeping it visually hidden but not `display:none` (opacity:0,
  1px, pointer-events:none) instead of touching the tests.
  Verified live: period selector (mouse+keyboard+Escape+focus-return),
  dynamically-populated subject filters, a true placeholder ("Selecione..."),
  mobile viewport (no clipping/h-scroll), both directions of the
  evolution-chart subject sync (select→trigger and row-click→select).
  Full regression: 48/48 e2e, 283/283 unit — both green after every slice.
  NOT visually verified live: source-draft-subject-select (Materiais'
  source-review flow) — Materiais is LOCAL_AUTHORITY-gated and unreachable
  under plain `npm run dev` in this environment (confirmed intentional,
  not a bug, earlier this session). Same shared primitive, same code path
  as every other select — low risk, but flag before calling this 100%
  browser-proven end to end.

SEQUENCE_H_SECOND_LAP_OPEN (not yet done, lower priority than the above):
  Estatísticas matrix-table (both tabs) still horizontally scrolls in the
  ~768–900px sidebar range (has a real scrollbar affordance, not silent —
  judged acceptable for now, not a hard defect). Loading-state races,
  long-content stress beyond what was seeded, and a systematic tablet-
  width pass on Materiais/Disciplinas/Configurações/Conta (only Hoje/
  Estatísticas/Acompanhar were explicitly checked at 768/1024px this
  stretch) remain open.

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
