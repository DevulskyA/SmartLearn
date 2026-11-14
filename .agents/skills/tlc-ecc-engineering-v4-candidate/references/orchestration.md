# Dynamic Orchestration

Activate only when one capable execution context is materially weaker than a task-specific topology.

## Compile the smallest useful topology

Before adding workers, state the concrete weakness being addressed: independent discovery, competing hypotheses, adversarial judgment, parallel ownership, context isolation, or a bounded autonomous loop.

Choose the minimum pattern that removes that weakness:

| Pattern | Use when | Core rule |
| --- | --- | --- |
| direct executor | the task is cohesive and locally verifiable | keep one context |
| investigator -> executor | diagnosis/discovery is uncertain but implementation becomes clear afterward | investigator returns distilled evidence, not a patch |
| planner -> adversarial reviewer -> executor | a wrong plan could create broad or expensive rework | reviewer attacks assumptions, dependencies, proof, and rollback before implementation |
| fan-out -> synthesis | independent read-heavy branches can be explored in parallel | branches do not mutate shared state |
| hypotheses -> falsifiers -> synthesis | several causal explanations remain plausible | assign independent evidence-seeking; prefer disconfirmation over advocacy |
| generator -> evaluator loop | quality can be judged independently and repeated refinement is economical | evaluator judges against explicit criteria and does not silently fix |
| parallel worktrees -> integrator | mutable workstreams are genuinely ownership-independent | isolate branches/worktrees and give one integrator authority over shared artifacts |
| loop-to-gate | a deterministic gate can safely drive repeated repair | feed exact failure evidence back; stop on pass, blocker, or repeated same-cause failure |
| tournament | multiple materially different solutions are plausible and the decision is high value | compare on the same criteria; do not multiply near-identical candidates |

## Orchestration contract

For every worker or stage define:

- objective and exact scope;
- authoritative inputs and base snapshot;
- allowed tools and side effects;
- expected output shape;
- decisive evidence;
- stopping condition;
- ownership of mutable files or state.

Workers return distilled findings, patch/commit identity when applicable, commands actually run, observed results, assumptions, and unresolved risk.

## Independence

Preserve independence when it is the reason for delegation. Do not preload a verifier or falsifier with the implementer's rationale if that would anchor judgment. Give the contract, artifact, relevant guardrails, and evidence instead.

## Shared state

Serialize work that shares mutable files, schemas, generated artifacts, or ordering constraints. One integrator owns the final composition and reruns invalidated proof after merge/integration.

## Loops

Use a loop only when each cycle receives new external evidence from a gate, runtime observation, evaluator, or user signal. Do not loop on self-critique alone.

If two cycles fail for the same underlying assumption, stop the loop and re-open the hypothesis or plan instead of spending more compute on the same path.

## Host mapping

Map these patterns onto primitives actually available in the active host: subagents, worktrees, dynamic workflows, CI jobs, or sequential contexts. The topology is portable; command syntax is not.
