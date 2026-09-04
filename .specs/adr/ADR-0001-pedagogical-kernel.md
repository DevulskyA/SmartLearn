# ADR-0001 — Pedagogical Kernel as permanent SmartLearn governance

- **Status:** accepted
- **Date:** 2026-09-04

## Context

SmartLearn is evolving from a review tracker into a learning system with summaries, exercises, longitudinal evidence, scheduling, analytics, and future adaptive behavior.

The repository already has strong software governance, but software correctness alone cannot guarantee educational quality. A feature can preserve data integrity and UI behavior while degrading retrieval difficulty, transfer, retention, calibration, or medical fidelity.

The project therefore needs a cross-feature educational contract that agents must consult before changing learning behavior.

## Decision

Adopt `.specs/governance/04_PEDAGOGICAL_KERNEL.md` as the permanent pedagogical contract of the SmartLearn Harness.

The Harness must treat the current accepted behavior as the champion and any proposed pedagogical change as a challenger. Promotion requires preservation of critical correctness/fidelity plus evidence of superior learning outcomes or equivalent outcomes with materially lower learner burden.

Core consequences:

1. Learning claims are based on observable evidence rather than exposure/completion alone.
2. Mastery evolves from a single score toward an inspectable evidence model covering recall, explanation, application, discrimination, transfer, retention, and misconceptions when available.
3. Retrieval, transfer, delayed retention, and misconception repair become first-class design considerations.
4. Pedagogical technique is routed by knowledge type rather than applied universally.
5. Feynman remains the preferred explanatory engine; orchestration determines when explanation is the correct action.
6. Medical fidelity and provenance are release-critical properties.
7. Learner burden remains a protected metric: sophistication should increase automatically, not by adding management work.
8. The long-term learner model is derived from an audit-preserving evidence ledger so future models can be recalculated without destroying history.
9. Learning-affecting features require an explicit pedagogical impact/gate in TLC artifacts.
10. Inconclusive challenger evidence preserves the champion.

## Alternatives considered

### Keep pedagogy inside individual feature specs
Rejected because cross-feature learning principles would drift and depend on agents remembering prior discussions.

### Replace the current Feynman/SmartLearn design with an external tutoring skill
Rejected because external skills contribute useful mechanisms but do not justify discarding proven project-specific strengths, especially the medical reasoning route and existing low-friction product architecture.

### Encode a single universal mastery score now
Deferred because thresholds and weights are not yet empirically validated. The evidence ledger is the more stable substrate; derived scores can evolve later.

## Consequences

### Positive

- Pedagogical anti-regression becomes part of repository governance.
- Future agents receive explicit decision metrics and promotion rules.
- Product evolution can absorb superior mechanisms selectively without replacing the whole system.
- Historical evidence remains useful as mastery models improve.
- The system can optimize for durable competence rather than activity volume.

### Cost

- Learning-affecting changes require an additional impact/validation section.
- Some outcomes such as delayed retention require longitudinal evidence before strong claims can be made.
- Existing aggregate `learning_evidence` is a foundation, not yet the complete evidence model described by the kernel.

## Scope

Cross-feature. Applies to study, review, exercises, scoring, summaries, learner state, scheduling, tutoring, analytics, and medical-content behavior.

## Related artifacts

- `.specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md`
- `.specs/governance/04_PEDAGOGICAL_KERNEL.md`
- `.specs/features/smartlearn-learning-vnext/`
- `test/learning-evidence.test.js`
