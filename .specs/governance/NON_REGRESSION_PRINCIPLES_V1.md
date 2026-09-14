# Non-Regression Principles — Canonical, Inherited

```
NON_REGRESSION_STANDARD_ID=SMARTLEARN_NON_REGRESSION_V1
NON_REGRESSION_STANDARD_VERSION=1.0.0
NON_REGRESSION_STANDARD_STATUS=CANONICAL
ADOPTED=2026-09-14
```

## Status and inheritance

```
PROJECT GOVERNANCE (00_PROJECT_GOVERNANCE_STANDARD.md)
  → QUALITY STANDARD (02_SMARTLEARN_QUALITY_STANDARD_V1.md)
  → NON-REGRESSION PRINCIPLES (this file)
    → PHASE CONTRACT (.specs/features/**)
      → TASK ACCEPTANCE CRITERIA (tasks.md / acceptance.md)
        → IMPLEMENTATION
```

This document applies to every current and future change on this project, not only the task in flight when it was adopted. It outranks any earlier task-specific instruction that conflicts with it. A task-local spec, an ADR, or an acceptance criterion may **add** precision on top of it; none may **silently reduce** it. If a genuine conflict is found between an approved functional contract and this standard, preserve the approved functional contract and flag the incompatibility explicitly (DEBT item or validation.md note) rather than silently changing behavior to satisfy this document.

This document is edited only as a deliberate, explicit governance change — never incidentally while a normal task is in flight, and never merely to make a task pass.

## The principles themselves

*(Verbatim, as given by the coordinator on 2026-09-14. Reproduced in full — not summarized, not weakened.)*

1. A proven-correct implementation is a product asset. The more evidence something works, the higher the bar to change it. NEW != BETTER, RECENT != CANONICAL, GREEN TEST != CORRECT PRODUCT. When a change degrades a previously-good area, the proven-good state wins until the new solution demonstrates superiority with zero loss.

2. Whoever changes something carries the burden of proof. Existing, already-proven behavior is presumed valid. A change must prove it preserved everything it wasn't explicitly authorized to change — don't re-justify old code, require the change to demonstrate it didn't degrade it.

3. Improvement is strictly monotonic: NEW_STATE >= OLD_STATE on every dimension not explicitly authorized to regress. Better accessibility + worse mobile = not an improvement. New sort + illegible table = not an improvement. Better design + lost function = not an improvement. One advantage never silently offsets a regression elsewhere; real trade-offs need an explicit decision.

4. Authorized scope is a boundary, not a suggestion. "Fix the combobox" does not mean "redesign Estatísticas." Everything outside the authorized set stays invariant by default. Smaller blast radius is always better.

5. The smallest sufficient change wins between two equally-correct solutions: less code touched, fewer components altered, fewer contracts changed, smaller blast radius, easier to prove/revert. Added complexity must pay for itself with material benefit — don't rebuild a system to fix a local problem.

6. A shared primitive multiplies responsibility: risk ≈ impact × number of consumers. Before changing one: identify real consumers, their dependent behaviors, relevant breakpoints/states. After: validate a representative of every affected family. Never assume "passed here" means "passed everywhere."

7. Tests must protect the external result, not the implementation. Bad: "`.th-sort-stack` exists." Good: "at 375px, every essential metric stays legible and inside the surface." Bad: "popup has element X." Good: "user can open/navigate/cancel/select correctly by keyboard." When implementation and requirement diverge, fix the implementation, not the requirement.

8. A fixed bug becomes an invariant. Bug → cause → fix → invariant → regression test. That knowledge can't depend on an agent remembering it. The next change in that region must respect the invariant. A bug isn't really closed until it's harder to reintroduce.

9. Validate the blast radius, not just the edited point. Table changed → test all widths, both tabs. Shared component → representative consumers. Tokens → all dependent themes/surfaces. Navigation → flows in and out. Data → consumers/aggregates. Responsive CSS → adjacent breakpoints. The validation set derives from the change's real dependencies.

10. Breakpoints are not isolated cases — responsive design is one continuous system. Fixing 800px while breaking 375px IS the same regression. A responsive change must preserve mobile → transitions → tablet → desktop, especially ranges that already failed before. Never validate only the viewport that motivated the change.

11. Real render is mandatory evidence for UI changes. Passing code + passing tests do not prove visual quality. Minimum evidence = implementation + tests + real render, actually inspected. CI green does not substitute for visual inspection when the possible defect is visual.

12. Preserving function and preserving representation are different problems. Visual representation may change. What may NOT silently disappear: information, action, state, meaning, behavior, accessibility, data. When consolidating/redesigning: representation may change, capability must remain, unless explicitly decided otherwise.

13. A new feature must fit the product; the product must not be deformed to fit the feature. If a new function requires destroying a surface that already works, redesign the feature, not the surface. A secondary sort has no authority to make the table illegible. The surface's architectural importance outranks the convenience of a local feature.

14. Don't mix recovery with evolution. When a surface has regressed: recover first, improve after. Never simultaneously recover + redesign + add a feature — that destroys the baseline and makes it impossible to attribute cause to effect. Sequence: KNOWN_GOOD → RESTORE → PROVE → IMPROVE → PROVE.

15. Lost confidence in the current state? Return to the last proven truth. Use the last known-good state + selective reapplication of later improvements. Don't restore the whole repo when the damage is localized. Don't keep recent code just because it was already written.

16. Commits must preserve causality. Don't mix dozens of independent fixes into one material change when it prevents discovering regressions. A good checkpoint answers "what changed and what result should that produce?" Mixing UI+data+a11y+responsive+CI+feature in one commit tanks traceability and raises regression cost. Group by causal unit, not by agent convenience.

17. Protect the product's truth, not old code. Compatibility with prior code is secondary; preserving correct product behavior is primary. Don't keep a wrong internal API/inadequate markup/poorly-conceived test/bad abstraction just because it already exists — but any replacement must prove equivalence or superiority in external behavior.

18. Absence of evidence is not a pass. Never convert "I didn't find a problem" into "proven correct." Valid states: PASS (sufficient evidence), FAIL (evidence of defect), NOT_PROVEN (required validation wasn't run). Applies especially to: screen reader, native Tauri, real mobile, real data, rare states. NOT_PROVEN must never be reported as PASS.

19. Independent review is proportional to risk — don't spend agents reviewing everything. Create independent review when there's: a shared primitive, an architecture change, large blast radius, an area that has regressed repeatedly, security/data, a migration, or a failure mode that could slip past the executor's own tests. Give the reviewer a narrow scope and a concrete adversarial hypothesis — review exists to challenge the executor's assumptions, not repeat its tests.

20. A repeated regression indicates a system failure, not an isolated new bug. Investigate what protection was missing: requirement, invariant, test, baseline, isolation, ownership, architecture, or validation process. Repeated regression → fix the product AND fix the system that allowed it.

21. The real product is the functional authority. A prototype can be visual authority. A spec can be authority of intent. A test can be authority for one property. None individually substitutes for real, proven behavior. Hierarchy when in conflict, climb toward: real artifact/execution → evidence → canonical decision → specification → state → plan → chat.

22. Closure requires reconciliation. Never declare done just because code was written, a commit exists, the suite passed, or a reviewer said PASS. Before closing: real result ↔ requirements ↔ baseline ↔ tests ↔ render ↔ recorded state must all agree. If any contradicts another, it's not done.

23. Mother principle: change the minimum necessary. Preserve everything else. Prove what changed. Prove that what shouldn't have changed is still correct. A change's quality is measured as much by what it didn't destroy as by what it added.

## Applicability

These principles apply to the Estatísticas restore-then-rebuild work already in progress, and to everything queued after it (the Data Grid column-header rebuild, the Acompanhar tracking-card reconciliation, and any future task on this project).

## Changing this standard

Edited only as a deliberate, explicit governance change, the same way `02_SMARTLEARN_QUALITY_STANDARD_V1.md` is — never incidentally while a normal task is in flight, and never merely to make a task pass.
