# SmartLearn — Claude Code

`EXECUTION_MODEL=OUTCOME_DRIVEN_LEAN`

## Authority and outcome

Before executing SmartLearn work, read in full:

* `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md`
* `.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md`

Follow `.specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md` (`#outcome-driven-lean-execution` and rule 10b). Task requirements strengthen, never weaken, these contracts. For product direction use `.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` §0.1; for actual implementation state trust Git and tests. Conductor chooses which outcome; TLC chooses the smallest correct implementation.

One observable outcome → smallest complete change → proportional proof → next outcome. Reuse existing code, patterns, libraries or platform features when semantics truly match; fix root causes, remove unnecessary complexity, and avoid speculative features, abstractions, dependencies, refactors or ceremony. "Smallest" means fully correct, readable and maintainable, not fewest lines. Never trade away data integrity, isolation, authentication, migrations, provenance, security, accessibility, medical fidelity, compatibility or the tests the risk requires. Do not create separate formal tasks for mechanics, tests, documentation or findings that belong to the active outcome.

Act → verify → report. Execute authorized work before narrating it; show the real result and evidence. "Accepted", "understood" and "will do later" are not deliveries. Prove blockers, then advance independent authorized work. Answer informational questions without side effects; a `/loop` with no material change stays silent. Do not contest legitimate requests. Ask humans only at existing authority gates; a recommendation is not authorization.

Owner-reserved gates: no push, merge, deploy or rebase without authorization; no migration without explicit authorization; `scripts/work-branches.json` and `scripts/launch-desktop-dev.ps1` are owner-reserved; ADR-0001 protects Estatísticas (human decision required).

## Truth, navigation and progress

* Git = real code, branch and worktree. `.specs/STATE.md` = tracked context/checkpoint. Active feature `tasks.md` = outcome status; its `PROGRAM.md` = ordering; `spec.md` = requirements/gates; `validation.md` = evidence. `.specs/ARTIFACTS.md` lists durable artifacts outside Git. Never promote chat or scratchpads to authority.
* Read `CODEMAP.md` before searching for modules, layers or tests (verified by a test). For execution commands see `.specs/EXECUTION.md`. For the i18n / Clean Code front see `.specs/features/i18n-clean-code/{BRIEF,PLAN}.md` and `.specs/LOOP_BACKLOG.md`: small reversible slices.
* `plan.md`, the ACTIVE TRACK block of `conductor/tracks.md`, the HTML panel and the cockpit are generated projections: never edit them by hand; refresh with `npm run plan:sync` or `node scripts/agent-tasklist.mjs` (optional `--watch`). Human decision (2026-09-19): the visual tasklist (`scripts/tasklist.mjs` and its generated panel) is canonical as a capability: simple `[✓] [>] [ ] [!]` states plus "EXECUTANDO AGORA", not a dashboard; only its internal source may change.

## Resume and persistence

1. Run `git worktree list`, `git status`, `git log --oneline -5`. On `main`, do not develop: switch to the authorized worktree identified by Git, `.specs/STATE.md` and `scripts/work-branches.json`. Respect `scripts/work-target-guard.mjs` and never bypass it; it applies to local runs only, not to CI or the packaged executable. Then `npm run context:resume` (derived cockpit, never authority).
2. Report in one line: `marco · progresso · outcome ativo · próximo · bloqueio`. Read only the active ID in `tasks.md`, its section in `validation.md`, the `spec.md` requirements it cites and the code needed; expand only for a concrete dependency or conflict. Run `npm run context:check`.
3. Persist durable decisions in their owner (`spec.md`, ADR, `tasks.md`), never only in a handoff. Before overwriting a state file: read it, carry forward what remains valid, archive the old one in `.specs/archive/`; then read the write back (prefer the Write tool for multiline: shell mangles backticks, slashes and CRLF/LF). Before `/clear`, compaction or handoff: exactly one `[>]` task with `Próximo passo:`, evidence of completed tasks in `validation.md`, `context:check` passing, tracked state committed. `.specs/HANDOFF.md` is optional, gitignored and derived.
4. Stage and commit explicit files only: never `git add .` or `git add .specs`; never `.impeccable/` or `.specs/benchmarks/`. A failed path returns to the last verified checkpoint instead of summarizing the failed attempt into context.

## Agents and verification

Follow the global agent policy (`~/.claude/AGENTS.md`, item 0): choose the cheapest capable agent per subproblem and escalate only for real difficulty. Project specifics: run quick tests directly in the main agent; subagents return conclusion + file/command/result, never full logs; use only configurations that are available.

Test the smallest discriminating risk first. E2E: `node scripts/e2e.mjs --changed`, `--failed` to retry. Selection is adaptive (governance §7/§9): per task, the specs that exercise what changed (`--changed` selects by impact; `--files a,b` isolates a change; `--dry-run --explain` shows why); on integration, related regressions; the full suite is an exceptional integration gate for a critical milestone (accumulated structural or cross-cutting risk, V1 final validation), started in the background by `node scripts/e2e-global.mjs` on a Git snapshot, at most once per SHA. A commit, batch close, compaction or a generic hook never triggers it by itself, and a hook cannot turn "no recent global E2E" into "run everything". Record partial validation with its real scope. Read only its failure/summary line, consulting `test-results/e2e-problems.txt` when needed (`E2E_VERBOSE=1` only to diagnose). Heavy runs and their processes follow `docs/engineering/process-lifecycle.md` (supervised job, resource gate; never end processes by image name). Desktop flows, in order: API/CLI/headless → affected integration/E2E → one brief visual check only when appearance is an acceptance criterion. Do not keep desktop or browser windows open for functional validation, nor repeat a visual inspection after adequate proof.

Handing an app instance to the owner for testing (preview, Homologação, any isolated copy): it is a deliverable, so prove it before saying "open". (1) Data and login are the owner's: copy of their data (`design-real`) so they sign in with their own account; a synthetic instance (`design-audit`) is for my own measurements and is never handed over. (2) Right after a preview starts, Vite spends ~20-40 s optimizing dependencies and the stylesheet requests stay pending: the page loads unstyled (proven 2026-11-12); poll `/src/styles.css` until it answers 200, then load the page. Before announcing, load the page and check: stylesheets applied (`document.styleSheets` not empty, body font/background computed), no console errors, the account state is what I tell them, and Estatísticas shows data (otherwise seed realistic history into the disposable copy first). (3) Never log out, switch theme or change the session of a pane I will leave open for them; do measurements on a separate tab. (4) State the evidence in the message; if a check was not possible, say which.

## Filosofia permanente do SmartLearn

`.specs/governance/SMARTLEARN_FILOSOFIA_PARA_IA.md` é referência permanente, versionada no Git. **Não carregar automaticamente** no início, em tarefas ou após compactação. Se uma decisão de produto, pedagogia ou UX depender da filosofia, leia apenas a seção relevante; leitura integral só mediante pedido explícito ou revisão global justificada. Preserve o arquivo e respeite as decisões humanas vigentes.

Launchers: legacy `launch-desktop-dev.ps1` requires the branch name `claude/smartlearn-v1-complete`; "SmartLearn Homologação" uses `scripts/launch-homologacao.ps1`. Launcher compatibility is not authorization to bypass worktree guards.
