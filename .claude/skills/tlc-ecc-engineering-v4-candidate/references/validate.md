# Verification Capabilities

Verification determines whether the intended outcome is true and sufficiently evidenced for the actual risk.

Define a proof target before implementation when feasible, then start with the cheapest material discriminator. Activate formal mechanics, mutation, separate verification, or real-use checks only when their triggers are present.

## Focused verification

For ordinary slices:

1. identify the most plausible material failure;
2. run the narrowest test/observation capable of detecting it;
3. inspect the relevant regression surface;
4. confirm touched guardrails remain valid;
5. exercise representative runtime/user behavior when `REAL_USE` is triggered.

A green suite is not product success when the outcome includes perceptual, interaction, integration, or real-world quality that tests do not economically capture.

When a deterministic gate fails, feed the exact observed failure back to the executor. After a material correction, rerun invalidated proof rather than trusting the patch narrative.

## Real-use verification

When `REAL_USE` is active, inspect the behavior from the perspective that contains the missing information:

- browser/UI interaction for visual or workflow behavior;
- API/client behavior for integration contracts;
- logs/metrics/traces for runtime/operational claims;
- representative data for performance or migration behavior;
- dogfood or representative users when product/taste information is required.

Record what was actually observed. Do not convert source inspection into a claim about rendered or runtime behavior.

## Formal mechanical verification

Use this section only when formal spec/traceability/evidence capabilities are active:

1. run structural checks for artifacts that actually exist;
2. confirm required acceptance coverage in `traceability.json`;
3. run closure gates through `run-gate` where governed receipts are required;
4. run discrimination checks only when `MUTATION` is triggered;
5. execute `verify-evidence` and resolve stale/missing/failed receipts.

`EVIDENCE_VERIFIED` is not yet a semantic verdict.

## Independent semantic verification

Use only when `INDEPENDENT_VERIFICATION` is triggered.

Give a separate context the outcome or formal spec, relevant guardrails, diff/changed files, proof sources/results, and only the design/security/operations artifacts that matter. Withhold the implementer's rationale when it would anchor the reviewer unnecessarily. The verifier must determine whether the evidence actually proves the intended behavior and failure modes rather than trusting status labels.

If a truly separate context is unavailable, label the result `fresh-eyes fallback`, never independent verification.

## Mutation / discrimination

Use only when `MUTATION` is triggered because ordinary tests may not meaningfully discriminate a material failure.

Use an isolated temporary worktree or copy. A useful mutation changes target behavior, remains executable enough to exercise the detector, and causes the relevant proof to fail for the intended reason.

Do not require mutation counts by ritual. Derive the number and type of faults from the concrete failure modes that matter.

Compilation failure alone does not demonstrate behavioral discrimination unless compilation is itself the contract.

## Formal validation report

Write `.specs/features/<feature>/validation.md` only when persistent formal verification materially helps auditability, handoff, or risk control.

A final PASS always means the same thing regardless of artifacts: the outcome is true, evidence is sufficient, relevant guardrails hold, and no unresolved material blocker remains.
