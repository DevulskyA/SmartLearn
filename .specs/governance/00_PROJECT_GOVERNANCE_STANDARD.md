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

## Mandatory change lifecycle

Every modification to existing behavior follows this sequence:

```text
PROBLEM / REQUEST
   ↓
SPEC / observable requirement
   ↓
CHANGE IMPACT ANALYSIS
   callers • dependencies • requirements • tests • contracts • data • regression surface
   ↓
REGRESSION SENSOR identified or created
   ↓
ATOMIC TASK
   ↓
MINIMAL CHANGE
   ↓
FOCUSED LOCAL GATE
   ↓
REGRESSION / INTEGRATION GATES proportional to blast radius
   ↓
ATOMIC LOCAL COMMIT
   ↓
INDEPENDENT / FRESH-EYES VERIFICATION
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

## Ceremony proportional to risk

### Small/new isolated behavior
Impact may be an inline section in the task.

### Medium change to existing behavior
A concise `## Change Impact` section is mandatory in spec/design/tasks.

### Large/Complex/high-risk change
Create `.specs/features/<feature>/impact.md` before implementation.

High-risk includes persistence, migration, auth, destructive actions, permissions, concurrency, shared contracts, public APIs, scheduler/state transitions, broad UI routing, or core domain entities.

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

## Impact analysis contract

For Large/Complex changes, `impact.md` must contain:

### Target
What code/contract/data is changing and why.

### Callers / entry points
Who invokes or consumes it.

### Dependencies
Libraries, modules, services, tables, files, state, environment.

### Requirement traceability
Active requirements/ACs relying on the target.

### Existing protection
Tests/sensors currently protecting target and neighbors.

### Contract/data blast radius
APIs, schemas, persistence, migrations, backup formats, events, external behavior.

### Regression surface
Concrete neighboring behaviors that could break.

### Sensor plan
Existing or new sensors required BEFORE implementation.

### Rollback / recovery
How to reverse or recover if the change fails, when relevant.

### Residual unknowns
Unknowns with disposition: investigate, sensor, defer as DEBT, or human gate.

## Atomic task contract

A formal task must include:

- one observable deliverable;
- files/components expected to change;
- requirement/AC IDs;
- impact reference;
- sensor/test that protects it;
- narrow gate;
- regression gate if blast radius requires it;
- done criteria;
- difficulty 1–5 when agents are weak or task is non-trivial.

One formal task = one atomic local commit. Do not batch unrelated WPs merely because tests are green.

## Test strategy

Tests are not merely confirmation after code. For existing behavior, protection must exist before structural change.

Order:

1. Characterize/protect observable behavior when protection is missing.
2. Make the smallest change.
3. Run focused gate.
4. Run regression/integration gates proportional to impact.
5. At feature closure, run full/build/e2e/UAT required by the spec.
6. Verifier injects plausible faults in isolated scratch state. A surviving fault becomes a fix task.

Never weaken/delete/skip tests to obtain green.

## Completion contract

A feature cannot be PASS when any of these are true:

- an AC is known unmet;
- a material impact path is unexamined;
- a required sensor is missing;
- a migration/persistence path is only tested in a fake adapter when real persistence is in scope;
- a surviving discrimination mutation exists;
- a SPEC_DEVIATION is unresolved;
- validation evidence is “worked visually” without the required environment;
- STATE claims a result contradicted by Git/worktree/tests.

## State update

After a verified change:

- replace Handoff with current reality;
- append/supersede only material cross-feature decisions;
- create/update DEBT items discovered or resolved;
- create/supersede ADR only when architectural decision changed;
- never duplicate Git history in STATE.

## Human gates

Human approval is reserved for material product/architecture choices and explicit external actions. Agents must not interrupt for derivable technical decisions.

Push, PR, merge, deploy, destructive external operations and production mutations require explicit approval.

## Project admission gate

A TLC-managed active project is governance-compliant only if:

1. `.specs/STATE.md` exists and is current.
2. `.specs/DEBT.md` exists, even if empty with `none`.
3. ADR policy/location exists.
4. Active Large/Complex feature has spec + impact + design + tasks.
5. Every active formal task identifies protection/gates.
6. Structural legacy changes have a regression sensor before editing.
7. Feature closure produces validation.md with evidence-or-zero.
8. Git commits are atomic per formal task.
9. STATE is reconciled against Git before resuming.
10. Known debt is trackable, not buried in chat.

