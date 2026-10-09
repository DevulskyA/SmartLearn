# Pedagogical validation status — experimental mastery/error challenger (T33)

## Status

`SCIENTIFIC_LEARNING_BENEFIT: NOT_ESTABLISHED`

`server/src/domain/experimental/mastery-policy.js` (`evaluateChallenger`) is a **disabled-by-default, offline/shadow** reconstruction of the mastery/error-hypothesis ideas audited in `context.md`'s Branch 2 (`feat/evidence-learning-core-v1`). It is not wired into any route, screen, scheduling decision, or stored fact. This document is the explicit, honest record of what has and has not been validated, per this project's own rule that a passed software test never substitutes for a demonstrated educational benefit.

## What is proven (software correctness only)

- `evaluateChallenger()` is pure, takes no DB handle, and — verified directly by an integration test (`server/test/experimental-mastery-policy.test.js`) — invoking it against a real evidence profile built from real database events changes zero stored rows (schedules, aggregate evidence, and item-level events are byte-identical before and after).
- It never emits a label containing "mastered" or any synonym (`CHALLENGER_LABELS`, structurally checked).
- A single independent-correct observation never reaches the strongest label (`PROVISIONAL_INDEPENDENT_PATTERN`) even with the challenger explicitly enabled — it requires at least `PROVISIONAL_THRESHOLDS.minIndependentCorrectForPattern` (2) independent-correct observations and no conflicting independent evidence.
- Conflicting independent evidence (an independent correct and a later independent incorrect for the same scope) always overrides any pattern label — the challenger never picks a side.
- `validated` is `false` on every possible output, unconditionally.
- The historical thresholds (24h delay window, 0.8 confidence cutoff, 0.35 low-confidence floor) are carried forward as literal, named, provisional constants from the audited branch — not re-derived, not claimed as validated, and not applied as a hard gate anywhere in this module (the delay/confidence thresholds are not currently consumed by `evaluateChallenger` at all; they are preserved for a future, explicitly human-authorized experiment design, not silently exercised).

## What is NOT proven and remains open

- Whether `PROVISIONAL_INDEPENDENT_PATTERN` (or any label this module could ever produce) corresponds to any real, durable, transferable learning outcome. No outcome study has been run.
- Whether the specific thresholds (2 independent-correct observations, 24h, 0.8, 0.35) are pedagogically meaningful at all, as opposed to arbitrary carry-overs from an unvalidated prior branch.
- Whether the grounded hypotheses (`NEEDS_MORE_INDEPENDENT_PRACTICE`, `CONFLICTING_EVIDENCE`, `MISSING_OBSERVATIONS_LIMIT_CONFIDENCE`) are useful or accurate suggestions for an actual learner, as opposed to internally-consistent labels over the available schema fields.
- Any claim of independence-from-assistance, transfer, retention, or mastery beyond what `evidence-profile.js` (T32) already reports as raw, transparent counts.

## Promotion gate

Promoting any part of this challenger to a user-visible feature (a label shown in the UI, a scheduling effect, an automated recommendation acted on by the app) requires, in order:

1. An explicit, separately-scoped feature proposal naming exactly what would become visible and to whom.
2. A pre-registered evaluation protocol (what outcome is measured, over what population, for how long) — not a unit test.
3. Human authorization of that protocol before any data collection begins.
4. A recorded evaluation result reviewed independently of the person who built the challenger.

Until all four steps are recorded here with links to their evidence, this module remains `enabled: false` in every real code path, and no PR may claim `SCIENTIFIC_LEARNING_BENEFIT: ESTABLISHED`.
