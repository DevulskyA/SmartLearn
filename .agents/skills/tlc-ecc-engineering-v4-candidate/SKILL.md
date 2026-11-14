---
name: tlc-ecc-engineering-v4-candidate
description: Outcome-driven software engineering kernel with proof-first execution, dynamic task-specific orchestration, executable learning, and rigor triggered only by concrete risk. Use when ChatGPT or a coding agent must implement, fix, integrate, continue, verify, or hand off software work; when a task benefits from bounded multi-agent orchestration, real-use validation, or prototype-first learning; or when a reusable engineering Skill, harness, workflow, or process must be evaluated or improved empirically. Optimizes observable product value per unit of time/context without weakening correctness, continuity, safety, or human decision authority.
---

# TLC + ECC Engineering V4 — Adaptive Outcome Kernel

Deliver the intended observable outcome at the lowest practical cost that preserves required correctness, confidence, continuity, and safety.

**Process is a hypothesis, not an asset.** Keep a step only while it materially improves delivery, proof, continuity, learning, or containment of a concrete risk.

## Route before acting

Determine three independent values:

- **Host** — runtime executing this request now; controls tools, filesystem, permissions, commands, workers, and available orchestration primitives.
- **Mode** — `execute`, `produce`, or `analyze`.
- **Destination** — runtime/person consuming an artifact; controls only artifact format and runtime-specific instructions.

Explicit current instructions win. Otherwise apply these defaults:

- Work executed in this ChatGPT/Codex conversation uses the actual OpenAI host, including SmartLearn work.
- A prompt, goal, task, Skill, handoff, or instruction package to be sent to SmartLearn agents targets Claude Code.
- Mentioning SmartLearn or Claude does not change the host.
- Analysis without a runtime-specific consumer remains neutral.

Read [runtime-routing.md](references/runtime-routing.md) only when routing is not trivial, then load exactly one host adapter:

- Claude Code: [claude-code.md](references/hosts/claude-code.md)
- ChatGPT/Codex: [openai.md](references/hosts/openai.md)

For a Claude-bound artifact produced elsewhere, also read [claude-agents.md](references/destinations/claude-agents.md).

## Outcome Kernel

Use this kernel for every engineering task. Do not expand it into a ritual.

### 1. OUTCOME

State internally the one observable condition that must become true.

Prefer product/runtime behavior over process artifacts. If the outcome is already explicit, do not create a planning document merely to restate it.

### 2. GUARDRAILS

Load only invariants materially relevant to the current change: product decisions, data truths, architecture boundaries, safety controls, compatibility promises, or explicit human decisions that the slice could affect.

Do not load the project's entire history merely because it exists.

### 3. SLICE

Choose the smallest cohesive change that advances the outcome end-to-end or removes its immediate blocker.

Prefer:

- vertical behavior over horizontal scaffolding;
- reuse over parallel architecture;
- reversible change over speculative generalization;
- the current bottleneck over future-proofing;
- one useful flow over several incomplete layers.

### 4. PROOF TARGET

Before editing, identify the cheapest observation capable of falsifying the intended result or exposing its most plausible material failure.

The proof target may be a focused automated test, compiler/type check, runtime assertion, browser interaction, API response, log/metric, security negative case, migration invariant, or another direct observation.

For bugs, reproduce or characterize the failing baseline before the fix when feasible. For perceptual or interaction quality, define the observation or rubric before implementation rather than declaring success from code inspection alone.

Do not force test-first mechanics when they add no information; require **proof-before-confidence**.

### 5. EXECUTE

Inspect only the implementation, contracts, decisions, and tests needed to act correctly. Implement directly using existing patterns unless a triggered capability below requires more structure.

Plan just in time: enough to prevent foreseeable rework, no earlier or larger than necessary. If a plan must survive handoff, coordinate multiple executors, or constrain an expensive-to-reverse change, activate the relevant capability and persist it.

Do not start architecture, cleanup, documentation, framework work, security review, or multi-agent orchestration merely because it is available.

### 6. PROVE

Run the proof target, then expand evidence only when the touched risk or failed observation requires it.

Never weaken, skip, delete, invert, or rewrite meaningful coverage merely to obtain green. When an implementation change invalidates prior evidence, rerun the affected proof.

A passing tool is evidence only for the claim it actually discriminates.

### 7. STOP / NEXT

Stop when all are true:

1. the intended outcome is observably true;
2. evidence is sufficient for the actual risk touched by the change;
3. relevant guardrails remain valid;
4. no known material blocker remains.

If not, execute the next necessary slice. Do not invent work to stay busy.

## Triggered capabilities

Do **not** classify every task into a process level. Activate a capability only when a concrete trigger exists.

| Capability | Activate when | Reference |
| --- | --- | --- |
| `DESIGN` | an architectural, state, contract, integration, compatibility, or rollback decision is materially expensive to reverse | [design.md](references/design.md) |
| `SECURITY` | the current diff touches auth, authorization, secrets, permissions, untrusted input, isolation, or another trust boundary | [security.md](references/security.md) |
| `FORMAL_SPEC` | behavior is sufficiently ambiguous, broad, regulated, or difficult to judge directly that a durable contract materially lowers error | [specify.md](references/specify.md) |
| `TASK_PLANNING` | sequencing, dependencies, ownership, or resumability cannot be kept reliably in a short current-state note | [tasks.md](references/tasks.md) |
| `TRACEABILITY` | many criteria, multiple executors/sessions, auditability, or long duration make proof-to-requirement links materially hard to preserve | [tasks.md](references/tasks.md) |
| `ORCHESTRATION` | a single execution context is materially weaker than a task-specific topology because independent hypotheses, parallel workstreams, adversarial judgment, or a bounded loop improve outcome or confidence | [orchestration.md](references/orchestration.md) |
| `PROTOTYPE` | the dominant uncertainty is product behavior, UX/taste, feasibility, or user value and a reversible prototype can resolve it cheaper than durable design | [prototype.md](references/prototype.md) |
| `OPERATIONS` | migration, backfill, rollout, deploy, rollback/recovery, queues, caches, indexes, or persistent compatibility are touched | [operations.md](references/operations.md) |
| `MUTATION` | a material failure could survive ordinary tests and discrimination strength is genuinely uncertain | [validate.md](references/validate.md) |
| `INDEPENDENT_VERIFICATION` | a separate perspective would materially change confidence because of impact, ambiguity, or incentives | [validate.md](references/validate.md) |
| `REAL_USE` | real user/runtime behavior, production-like interaction, or perceptual quality contains information automated checks cannot economically capture | [validate.md](references/validate.md) |
| `HANDOFF` | work must survive context loss, session change, executor change, or concurrent ownership | [memory.md](references/memory.md) |
| `CONTEXT_RECOVERY` | context pressure, contradictory summaries, wrong worktree, or uncertain repository identity is observed | [context.md](references/context.md) |
| `BOUNDED_WORKER` | isolated read-heavy work or genuinely independent verification reduces net context or improves confidence | [subagents.md](references/subagents.md) |
| `HARNESS_EVAL` | changing a reusable Skill, harness, agent workflow, engineering policy, or process; or repeated overhead suggests an existing component may no longer earn its cost | [harness-evals.md](references/harness-evals.md) |

Absence of a trigger means **do not activate the capability for completeness**.

A critical subsystem does not make every change critical. Escalate from the boundary touched by the current diff and the failure it can create.

## Dynamic orchestration

Default to one capable executor. Multi-agent structure must earn its cost.

When `ORCHESTRATION` is active, compose the smallest topology that addresses the concrete weakness of a single thread. Examples include investigator -> executor, planner -> adversarial reviewer -> executor, independent hypotheses -> falsifiers -> synthesis, generator -> evaluator loop, or isolated parallel worktrees -> integrator.

Do not equate agent count with rigor. Do not create permanent agent roles for work that can be compiled from task requirements at runtime.

Read [orchestration.md](references/orchestration.md) before constructing the topology.

## Evidence semantics

Never collapse these claims:

1. **Declared/structured** — an artifact or linter states the intended contract.
2. **Execution observed** — a command/runtime interaction actually ran on a known snapshot.
3. **Evidence verified** — required evidence is current, intact, and bound to the right snapshot.
4. **Semantically proven** — the evidence actually demonstrates the intended behavior and relevant failure modes.

A lower level never implies a higher one. Markdown assertions, filenames, exit-code prose, and an agent's own summary are not execution evidence.

Read [evidence-contract.md](references/evidence-contract.md) before formal verification or when using bundled evidence scripts.

## Put knowledge in the cheapest correct layer

When a correction or convention should persist, do not automatically add prose to the main Skill.

Prefer:

- stable repository-wide invariant -> repository instruction file appropriate to the host;
- reusable on-demand procedure -> Skill/reference;
- deterministic rule -> code, test, schema, hook, static check, or CI;
- task-local accepted decision -> spec/plan/decision artifact;
- transient position -> compact handoff;
- observed failure -> regression test/eval first, textual lesson only when executable memory is insufficient.

Read [knowledge-placement.md](references/knowledge-placement.md) when deciding where durable knowledge belongs.

## Learning loop

Treat a real failure as an opportunity to make recurrence harder, not merely as prose to remember.

Preferred sequence:

**observe failure -> reproduce/characterize -> encode discriminating regression/eval when feasible -> fix -> prove -> record cross-cutting lesson only if needed**.

Do not grow permanent instructions from one anecdote when an executable regression captures the actual failure better. Read [lessons.md](references/lessons.md) when a textual policy may be justified.

## Incidental work rule

Before doing unscheduled work, ask silently whether it:

- advances the current outcome;
- proves the current outcome;
- removes its blocker;
- preserves a relevant guardrail; or
- eliminates a concrete recurring/material cost or risk already demonstrated by evidence.

If none apply, record the issue briefly when useful and defer it.

Do not let a discovery hijack the current slice.

## Human decisions and executor authority

Resolved human/product decisions remain resolved unless contradictory evidence materially invalidates them.

The executor may decide reversible local implementation details, names, organization, and test mechanics. The executor must not silently reopen product scope, priority, architecture canon, explicit model/config choices, irreversible operations, or publication/push/merge/deploy decisions.

Concentrate human attention where judgment is genuinely scarce: product intent, taste, risk tolerance, security/trust boundaries, regulated decisions, irreversible operations, and unresolved architectural trade-offs. Mechanical review belongs to deterministic tools or agents when they can judge it reliably.

If repository evidence materially conflicts with a resolved decision, report:

```text
DECISION_CONFLICT
DECISION=<...>
EVIDENCE=<...>
IMPACT=<...>
MINIMUM_RESOLUTION=<...>
```

Do not silently reinterpret the decision.

## Bugs and brownfield work

Do not escalate merely because a repository is brownfield or stateful.

For a bug:

**reproduce/characterize -> competing causal hypotheses when ambiguity warrants -> smallest fix -> discriminating proof -> relevant regression check**.

If two repair attempts fail for the same assumed cause, stop patching and re-inspect the hypothesis, target, data path, and environment before a third attempt.

## Context economy

Treat context as an engineering budget.

Load only what can change the current decision or proof obligation:

- current outcome;
- current slice;
- relevant guardrails/decisions;
- target implementation/contracts;
- target tests/evidence.

Prefer symbols, focused ranges, diffs, compact state, and distilled worker results over repository-wide reading, raw logs, or historical narrative.

For long work, use a small execution cockpit for **position** and authoritative repository/spec artifacts for **truth**. A handoff is a hypothesis until reconciled with Git, worktree identity, files, and tests.

## Formal artifacts are capabilities, not default phases

Create `.specs/features/<feature>/spec.md`, `tasks.md`, `traceability.json`, receipts, mutations, or a separate validation report only when their corresponding triggers are active and they materially improve correctness, continuity, or auditability.

Do not create `intent.md`, `spec.md`, `plan.md`, or another artifact simply because an external playbook recommends it. Persist the minimum artifact that prevents a concrete loss of intent, coordination, proof, or recoverability.

When formal capabilities are active, use the existing deterministic helpers and references exactly as documented.

## Evolve the harness empirically

When changing this Skill, another reusable engineering Skill, or a project harness, activate `HARNESS_EVAL`.

Compare the current champion against the candidate on representative tasks under matched conditions. Measure outcome quality and material failures first, then completion, human intervention, time, tokens/cost, and context use. Use repeated runs when model variance can change the conclusion.

Ablate process components when practical. Remove or demote a component that adds no material value under current models, tools, and repositories. Do not preserve process because it once helped an older model.

## Bundled deterministic helpers

Use scripts when the selected capability needs deterministic evidence handling:

- `scripts/tlc.py lint-spec ...`
- `scripts/tlc.py lint-tasks ...`
- `scripts/tlc.py run-gate ...`
- `scripts/tlc.py run-mutation ...`
- `scripts/tlc.py verify-evidence ...`
- `scripts/tlc.py validate-completion ...`

These tools prove only what they actually inspect or execute. Never promote structural success into behavioral success.

## Output contract

Lead with the outcome achieved or the blocker that prevents it.

During routine execution, communicate compactly. Expand only when risk, failure, decision conflict, or user request requires it.

A useful checkpoint shape is:

```text
OUTCOME=<what is now observably true>
PROOF=<decisive test/runtime evidence>
NEXT=<next necessary slice | none>
BLOCKER=<none | real gate>
```

For formal/high-impact work, additionally report the highest evidence level genuinely reached, stale evidence, unresolved deviations, surviving discrimination failures, and residual risk.

Never describe planned evidence as if it had passed.
