# Design

Design only when the change crosses architecture, data, state, trust, integration, compatibility, or rollback boundaries.

## Durable artifact (only when DESIGN needs persistence)

Create `.specs/features/<feature>/design.md`:

```markdown
# <Feature> Design

## Context and Existing Patterns
<Files, contracts, decisions, and behavior reused.>

## Invariants
- ...

## Components and Boundaries
| Component | Responsibility | Inputs | Outputs | Failure behavior |
| --- | --- | --- | --- | --- |

## State and Concurrency
<Persistence, ownership, transactions, idempotency, ordering, retries, consistency.>

## Compatibility and Operations
<Version matrix, rollout, observation, rollback or roll-forward, irreversibility.>

## Security
<Assets, actors, trust boundaries, controls, negative tests, residual risk.>

## Observability
<Signals, thresholds, diagnostic context, ownership.>

## Test Strategy
<Which test layer proves each important behavior and failure mode.>

## Decisions
| ID | Decision | Evidence | Trade-off | Scope |
| --- | --- | --- | --- | --- |
```

## Rules

- Begin from repository evidence and existing conventions.
- Make failure behavior explicit at every external or stateful boundary.
- Define ownership and atomicity for mutable state; define idempotency and retry safety for repeatable operations.
- Separate compatibility during transition from the final steady state.
- Define what is observable before relying on a rollback, alert, or operational threshold.
- A rollback that cannot restore transformed or deleted data must be labeled roll-forward or recovery, not rollback.
- Introduce reusable abstraction only when current concrete uses justify it.
- Record cross-feature decisions in governed project state; keep feature-local choices here.
