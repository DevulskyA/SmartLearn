# Project Governance Standard — TLC Strict vNext

## Objective

Make long-lived AI-assisted software projects safe to modify without requiring any human or model to retain the full project history in working memory.

The governing principle is evidence reconstruction:

- Git stores what happened.
- Specs store intended observable behavior.
- Tests store proven behavior.
- STATE stores only the current project snapshot and active cross-feature decisions.
- ADRs store costly architectural decisions and their reasons.
- DEBT stores known imperfections as trackable objects.
- Impact analysis predicts blast radius before legacy code is changed.
- Verification attempts to disprove completion before declaring PASS.

## Quality Standard (SmartLearn)

For this project, `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` is a canonical, inherited layer above every phase contract and task acceptance criterion — see that file's own "Status and inheritance" section for the exact hierarchy and the rule that task-local requirements may only add to it, never silently weaken it.

## Safe Software Evolution Principles (SmartLearn)

`.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` sits directly below the Quality Standard in the inheritance chain (supersedes the earlier `NON_REGRESSION_PRINCIPLES_V1.md`, kept for history). It is the principles layer this standard's mechanisms exist to serve:

1. Those principles govern the WHY; this document's lifecycle, artifacts, and gates govern the HOW.
2. Procedural compliance with this document does not substitute for conformance with those principles.
3. A completed checklist does not authorize a result the real product contradicts.

Session preflight, every task:

```text
BOOTSTRAP
   ↓
QUALITY STANDARD loaded  (.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md)
   ↓
SAFE EVOLUTION PRINCIPLES loaded  (.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md)
   ↓
STATE reconciled  (.specs/STATE.md against Git)
   ↓
task + acceptance criteria loaded
   ↓
relevant design loaded
   ↓
execution
```

Task closure, every task:

```text
TASK ACCEPTANCE CRITERIA PROVEN
   + PROPORTIONAL REGRESSION GREEN
   + QUALITY STANDARD's materially applicable dimensions satisfied
   = TASK DONE
```

Apply only the dimensions materially relevant to the change (see the Quality Standard file's own worked examples); no materially relevant dimension may be skipped.

## Outcome-Driven Lean Execution

`EXECUTION_MODEL=OUTCOME_DRIVEN_LEAN` — canonical since 2026-10-05. OUTCOME OVER ACTIVITY · EVIDENCE OVER CEREMONY · RISK-PROPORTIONAL VALIDATION · ONE SOURCE OF TRUTH · MINIMUM SUFFICIENT PROCESS.
`PROCESS_CHANGE_MUST_REDUCE_NET_COMPLEXITY=TRUE`: a new rule, checker, file or mechanism must replace something or remove a demonstrated class of failure; meta-governance that only creates more meta-governance is refused.
This section reduces ceremony, never guarantees (rule 13). Where any other text (this file, `CLAUDE.md`, `conductor/workflow.md`, `tasks.md` header) disagrees, this section wins and the other text is `SUPERSEDED (2026-10-05, Outcome-Driven Lean Execution)`.

### 1. Unit of work: the observable outcome

An OUTCOME is a capability, fix or protection described by what changes in behavior, reliability or operation. Flow: `OUTCOME → ACCEPTANCE CRITERIA → IMPLEMENT → PROVE → CLOSE → NEXT`. Answer only: what gets better, how do we know it is correct, what is the smallest safe path.
These are MEANS, never outcomes: create a test, refactor a function, update docs, run mutation, investigate an adapter, update validation.md, fix a checker, produce a report. They belong to the outcome they protect.

### 2. When a new formal task (T-ID) is allowed

Only if (A) it has an independent observable result, (B) an independent risk/rollback boundary, (C) a real dependency that unblocks the roadmap, (D) its own human decision, or (E) genuinely independent, non-causal work. Otherwise it stays inside the current task. A bug caused by the feature is fixed inside the feature.

### 3. Findings triage (exactly one destination)

BLOCKER of the current outcome → fix inside it · MATERIAL but not blocking → existing DEBT/backlog · FUTURE, cosmetic or speculative → record only when there is a real risk of forgetting. Observing something never creates a task by itself.

### 4. Steps are instruments, not governance units

The active task carries preferably 3–7 meaningful steps (`Subtarefas:`), e.g. characterize current behavior / implement / prove main cases / proportional regression / close evidence. Never log "open file / grep / run command / edit a line". `Próximo passo:` may hold such mechanics temporarily, for `/clear` recovery.

### 5. Progressive roadmap

AGORA = the current outcome, detailed. PRÓXIMO = ONLY the next execution-ready outcome. ROADMAP = everything else, one visible line each. CURRENT detailed, NEXT prepared, REST visible; do not keep several next outcomes detailed by routine.

### 6. Tests are proof, not features

No formal task per test, fixture, mutation, audit, verifier, sensor or coverage item. A test-infrastructure initiative is its own outcome only when an independent material deficiency threatens several features. The product is the target of proof; governance tools get their own tests only when their failure can produce a false state, at most `SOURCE → TESTED CHECKER → DERIVED VIEW` (no checker of the checker).

### 7. Validation by risk

| Risk | Typical scope | Required proof |
|---|---|---|
| LOW | text, isolated layout, small local logic, docs, no shared contract | directly affected test + relevant structural checker; NO automatic full suite |
| MEDIUM | existing behavior, shared module, UI flow, non-critical endpoint, localized domain rule | focused test + regression of the area + relevant integration |
| HIGH | persistence, migration, auth, human data, concurrency, shared contracts, scheduler, backup/restore, security, packaging/release | specific sensors + broad relevant regression + full suite when the blast radius justifies it; mutation/adversarial review when it adds real discriminating power |

Forbidden loop: change → full suite → docs change → full suite → validation commit invalidates its own validation → rerun.

### 8. Mutation, audit and fresh eyes: by need

Mutation is used when the risk is material, a green test may be tautological, or a critical contract/invariant changes; not for CSS, text, docs or trivial changes. Ask "would a mutation here materially change our confidence?"; if not, skip. Fresh-eyes review/audit only for HIGH risk, closing a significant feature, material uncertainty, or when an acceptance criterion demands it. A finding is a blocker (fix inside the outcome) or debt; no audit-of-audit chains. (`SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` §5.14 and §6 stay: independence is for material risk.)

### 9. Freshness by real surface

A recorded test result is STALE only when a later change can affect what that test proved. Never a cycle where recording PASS invalidates that PASS. Enforced by `suitesAffectedBy` in `scripts/test-live-core.mjs`:

| Changed path | Suites that go STALE |
|---|---|
| `*.md`, `docs/`, `.specs/**`, `conductor/**` (spec, validation, plan, status, generated views) | none |
| tooling scripts (`context-*`, `plan-sync`, `agent-tasklist`, `tasklist`, `test-live*`) and `test/*.test.js` | unit |
| `src/`, `public/`, `e2e/` | e2e, unit |
| `server/` | server, e2e, unit (unit tests import server modules) |
| `package.json`, shared contracts, anything else | all |

### 10. Human gates: the user decides direction, not micro-steps

The agent decides alone: reversible implementation, local refactor, test strategy, technical order, internal naming, investigation, a proven fix, removal of safe dead code in scope, any choice among equivalent technical options.
Escalate ONLY: a real product decision · money, paid usage or budget · human data or a destructive action · irreversible or very costly to undo · push/merge/deploy/release/production · a deliberate change of requirement or acceptance criterion · an authority conflict the evidence cannot resolve.
A HUMAN_GATE never paralyzes the project: record it, continue independent work, group decisions for the user.

### 11. WIP and commits

`ACTIVE_OUTCOMES=1` by default (auxiliary work inside it is fine); do not open feature + refactor + audit + cleanup + tooling as five formal streams. Commits stay causally coherent, but "one commit = one causal unit" is not a microtask per commit: a small outcome may be one commit, a larger one a few safe internal commits. Status closes only when the whole outcome is proven; no artificial commits for bureaucracy.

### 12. An outcome closes when

The expected behavior exists · the material acceptance criteria pass · proportional regression is green · material residual risk is recorded · no known defect contradicts the result. Final question: "what can SmartLearn do or protect better now?" A concrete answer with proof closes it.

### 13. Stays strict (not weakened)

NO_DATA_LOSS · per-user isolation · authentication · idempotency · backup/restore · migration · provenance · security · DB integrity · never invent evidence · AI output is DRAFT · push/merge/deploy/release only under authorization · human data protection · never weaken a test to get green · `SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` and the Quality Standard keep their principles in full.

### 14. Legacy and migration

Do not rewrite the roadmap, renumber IDs or delete history; done tasks stay as they are and the remaining ones are not mass-migrated. When an area is touched, classify incrementally: OUTCOME (stays formal) · IMPLEMENTATION_DETAIL (absorbed into its parent; the old ID is kept as `SUPERSEDED_BY` when needed) · HUMAN_GATE (a decision, not a fictional feature) · DEFERRED_IMPERFECTION (DEBT when material). The 480 s e2e time is a PERFORMANCE SLO / feedback budget, not an immutable functional requirement.

### 15. Where it is enforced

`npm run context:resume` prints `EXECUTION_MODEL`, `POLICY`, then `CURRENT_OUTCOME / ACCEPTANCE / CURRENT_STEP / NEXT_OUTCOME / BLOCKERS / HUMAN_DECISIONS`. `npm run context:check` guards real state only (one active task, no lost done task, plan = projection of tasks.md, gate semantics, honest progress) and requires detail only for the active and the ONE next task. Freshness: rule 9. Nothing else polices ceremony.

## Mandatory change lifecycle

Every modification to existing behavior follows this sequence, scaled by risk (see "Outcome-Driven Lean Execution"; the earlier mandatory "atomic task / atomic commit per task / fresh-eyes verification" steps are `SUPERSEDED (2026-10-05, Outcome-Driven Lean Execution)`):

```text
PROBLEM / REQUEST
   ↓
OUTCOME + ACCEPTANCE CRITERIA (observable)
   ↓
CHANGE IMPACT ANALYSIS (proportional: callers • dependencies • requirements • tests • contracts • data)
   ↓
REGRESSION SENSOR identified or created
   ↓
MINIMAL CHANGE → FOCUSED GATE → regression proportional to risk
   ↓
COMMIT(S), causally coherent
   ↓
STATE + DEBT + ADR updates if materially changed
```

A structural change to existing code MUST NOT begin until at least one sensor exists that would detect the intended behavior breaking. The sensor may be unit, integration, E2E, contract, snapshot, schema/invariant, or another executable observable check.

## Before touching existing code

The agent must answer, with repository evidence:

1. What calls this code?
2. What does it call or depend on?
3. Which active requirements depend on it?
4. Which tests currently protect the behavior?
5. Which public/internal contracts, APIs, files, schemas or persisted data does it affect?
6. Which neighboring behaviors can regress?
7. What sensor will fail if the targeted behavior or a critical neighbor breaks?

Unknown answers are not silently treated as safe. Record them as gaps and reduce scope, add a sensor, or escalate if material.

## Impact analysis, proportional to risk

Small/new isolated behavior: an inline note in the task. Medium change to existing behavior: a concise `## Change Impact` section in spec/design/tasks. Large/high-risk change (persistence, migration, auth, destructive actions, permissions, concurrency, shared contracts, public APIs, scheduler/state transitions, broad UI routing, core domain entities): `.specs/features/<feature>/impact.md` before implementation, covering: target and why; callers/entry points; dependencies; requirement traceability; existing protection; contract/data blast radius; regression surface; sensor plan (before implementing); rollback/recovery when relevant; residual unknowns, each with a disposition (investigate, sensor, DEBT or human gate).

## Canonical project memory

```text
.specs/
├── STATE.md                 # current state + active project decisions only
├── LESSONS.md               # grounded lessons only
├── DEBT.md                  # persistent Technical Debt Ledger
├── adr/                     # project-level architectural decisions only
│   └── ADR-0001-*.md
├── archive/                 # superseded state/decisions when needed
└── features/
    └── <feature>/
        ├── spec.md
        ├── impact.md        # required for Large/Complex legacy changes
        ├── design.md        # when architecture/state/data/contracts require it
        ├── tasks.md
        └── validation.md
```

Do not turn STATE into a diary. Do not use DEBT as a wish list. Do not create ADRs for local implementation choices.

## Technical Debt Ledger

Every known material imperfection that is intentionally deferred becomes a stable debt item. Never leave material debt only in chat, comments or prose such as “improve later”.

Required fields:

- ID (`DEBT-###`)
- Status (`open | accepted | resolving | resolved | obsolete`)
- Problem
- Origin
- Risk
- Impact
- Affected components
- Dependencies
- Resolution criterion
- Priority (`P0..P3`)
- Owner or `unassigned`
- Evidence / links

Creating a debt item is NOT permission to ignore a failing acceptance criterion. A required AC remains FAIL unless the product contract is explicitly changed.

## ADR policy

Create an ADR only when a project-level decision is costly/surprising to rediscover or changes cross-feature architecture/contracts. Feature-local decisions remain in `design.md`.

Each ADR records:

- Context/problem
- Decision
- Alternatives considered
- Consequences/trade-offs
- Scope
- Status (`proposed | accepted | superseded | rejected`)
- Date
- Related specs/debt/commits

## Task contract

A formal task exists only under rule 2 of "Outcome-Driven Lean Execution". It states: the observable outcome, requirement/AC IDs, the sensor/test that protects it with its narrow gate, the regression gate its risk level requires, and done criteria (files, impact reference and difficulty when the risk or the agent warrants them). `SUPERSEDED (2026-10-05, Outcome-Driven Lean Execution)`: "one formal task = one atomic local commit"; commits follow rule 11.

## Test strategy

Tests are not merely confirmation after code. For existing behavior, protection must exist before structural change.

Order:

1. Characterize/protect observable behavior when protection is missing.
2. Make the smallest change.
3. Run focused gate.
4. Run regression/integration gates proportional to impact.
5. At feature closure, run the full/build/e2e/UAT the spec requires for its risk level (rule 7), not by routine.
6. When mutation is warranted (rule 8), inject plausible faults in isolated scratch state; a surviving fault is fixed inside the outcome, not opened as a new task.

Never weaken/delete/skip tests to obtain green.

## Completion contract

A feature cannot be PASS when any of these are true:

- an AC is known unmet;
- a material impact path is unexamined;
- a required sensor is missing;
- a migration/persistence path is only tested in a fake adapter when real persistence is in scope;
- a surviving discrimination mutation exists where mutation was warranted (rule 8);
- a SPEC_DEVIATION is unresolved;
- validation evidence is “worked visually” without the required environment;
- STATE claims a result contradicted by Git/worktree/tests;
- a materially applicable dimension of `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` is left unsatisfied.

## State update

After a verified change:

- replace Handoff with current reality;
- append/supersede only material cross-feature decisions;
- create/update DEBT items discovered or resolved;
- create/supersede ADR only when architectural decision changed;
- never duplicate Git history in STATE.

## Human gates

Escalation criteria and what the agent decides alone: rule 10 of "Outcome-Driven Lean Execution" (`SUPERSEDED`: the earlier looser wording). Push, PR, merge, deploy, destructive external operations and production mutations always require explicit approval.

## Project admission gate

A TLC-managed active project is governance-compliant only if:

1. `.specs/STATE.md` exists and is current.
2. `.specs/DEBT.md` exists, even if empty with `none`.
3. ADR policy/location exists.
4. Active Large/Complex feature has spec + impact + design + tasks.
5. Every active formal task identifies protection/gates.
6. Structural legacy changes have a regression sensor before editing.
7. Feature closure produces validation.md with evidence-or-zero.
8. Git commits are causally coherent (rule 11).
9. STATE is reconciled against Git before resuming.
10. Known debt is trackable, not buried in chat.

