# Implement

Use this reference when execution needs more detail than the Outcome Kernel.

## Before editing

1. Restate the current outcome and slice internally.
2. Load only relevant guardrails and resolved decisions.
3. Inspect the nearest implementation and test pattern.
4. Identify the proof target: the cheapest observation that can expose the most plausible material failure.
5. For a bug, reproduce or characterize the baseline when feasible.
6. Confirm the slice is authorized and does not require an unresolved human/product decision.

If uncertainty is primarily about product behavior, UX/taste, or feasibility rather than implementation correctness, consider `PROTOTYPE` before durable architecture.

## Slice cycle

1. Implement the smallest cohesive change that advances the outcome.
2. Add or update the cheapest proof capable of exposing a material failure when existing evidence is insufficient.
3. Run the narrowest relevant check first.
4. Feed exact failure evidence back into the next correction; fix causes, not evidence.
5. Expand proof only when the current evidence is insufficient for the touched risk.
6. Re-run invalidated checks after material changes or integration.
7. Stop when the Outcome Kernel's DONE conditions are satisfied.

Never weaken meaningful coverage to obtain green. Use expensive suites at meaningful integration/closure boundaries, not after every mechanical edit.

If a loop repeats the same causal assumption twice without success, stop and re-open the hypothesis, target, or plan instead of applying a third patch by inertia.

If formal evidence capabilities are active, record gates/receipts exactly as required by the formal artifacts. Otherwise do not create receipts merely for ceremony.

## Checkpoints

Follow repository policy. Local atomic commits can be useful checkpoints, but do not impose a commit convention, alter shared history, push, merge, or deploy without authorization.

Persist only enough state to resume safely when `HANDOFF` is triggered.

## Deviations

If a durable formal contract exists, record a material divergence as:

```text
SPEC_DEVIATION: <contract difference>; cause=<grounded reason>; disposition=<resolve or approve>
```

Without a formal spec, report the conflict against the outcome, guardrail, or resolved decision directly rather than manufacturing a spec deviation artifact.
