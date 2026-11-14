# Bounded Workers

Use bounded workers directly for isolated read-heavy work or independent verification. When several workers form a topology, activate `ORCHESTRATION` and read [orchestration.md](orchestration.md).

## Roles

- **Orchestrator/Integrator**: owns the contract, dependency order, shared state, integration, and final evidence decision.
- **Worker**: receives one bounded input/output contract and returns a distilled result plus evidence.
- **Verifier/Falsifier**: independently re-derives coverage or attacks a claim; it does not silently fix what it judges.

## Delegate when

- workstreams are materially independent;
- read-heavy discovery would pollute the control context;
- specialist knowledge changes a bounded decision;
- fresh context materially strengthens adversarial verification;
- competing hypotheses need genuinely independent evidence-seeking.

Serialize when tasks share mutable files, assumptions, schemas, or ordering. A single integrator owns shared artifacts. Mutating workers use separate worktrees or non-overlapping ownership and return commits/patches bound to the base snapshot.

## Worker contract

Provide the objective, exact scope, necessary artifacts, constraints, required evidence, allowed side effects, and stopping condition. Workers return findings, changed paths or patch identity, commands actually run, results, assumptions, and unresolved risk. They do not spawn additional workers unless the selected topology explicitly authorizes recursion.

Never claim independent verification when the reviewer shares implementation context or rationale in a way that defeats independence.
