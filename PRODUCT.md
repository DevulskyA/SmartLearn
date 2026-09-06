# SmartLearn — Product Context

## What it is
SmartLearn is a local-first learning system for Medicine that converts source material into a structured learning loop: study, independent retrieval, error evidence, spaced retesting, transfer and integrated performance.

The current Tauri 2 + vanilla HTML/CSS/JS + SQLite application remains the product base. The existing review workflow is preserved during migration, but the product direction is no longer a fixed review calendar. The target is a transparent adaptive learning engine whose decisions are grounded in observable evidence about what the learner can do independently over time.

## Primary user
A medical student studying large volumes of source-grounded content over months or years, often on a phone and often under cognitive fatigue. The interface must remain simple even when the internal learner model becomes sophisticated.

## Product objective
Maximize durable, independent and transferable learning per unit of learner effort.

The system should answer:

> What learning experience should this learner perform next to improve a specific competency, given the evidence currently available and the uncertainty around it?

## Core learning loop

`source -> competency -> attempt -> evidence -> error hypothesis -> intervention -> delayed retest -> transfer -> mastery`

The system must distinguish:
- exposure from recognition;
- recognition from retrieval;
- assisted success from independent success;
- immediate performance from delayed retention;
- retention from transfer;
- aggregate score from evidence of specific competencies.

## Current migration strategy
The existing application is a working legacy baseline and must remain usable while the learning core is introduced incrementally.

1. Preserve current local-first data, UI simplicity and build targets.
2. Introduce a pure, testable learning-evidence core.
3. Add competencies and learning-event persistence.
4. Instrument current review completion as evidence rather than replacing the interface immediately.
5. Add error hypotheses and mastery state.
6. Add transfer tasks and adaptive intervention.
7. Replace fixed scheduling only after the new scheduler demonstrates superior learning outcomes.

## Strategic principles
1. **Independent performance is the target.** Assistance can teach, but assisted success is not mastery.
2. **Evidence before inference.** The system records what happened before inferring why it happened.
3. **Errors are diagnostic signals.** Error causes remain hypotheses until supported by converging evidence.
4. **Transfer is explicit.** Remembering trained material and applying it in a novel context are measured separately.
5. **Source fidelity matters.** Medical learning objects must remain traceable to source material as AI-assisted generation is introduced.
6. **Simple surface, sophisticated engine.** The learner should spend energy studying, not managing the adaptive system.
7. **Local and private by default.** No account or remote backend is required for the current product architecture.
8. **Measured improvement only.** A new adaptive mechanism is promoted only when independent outcomes justify its complexity.

## Pedagogical authority
Implementation decisions that affect learning behavior must consult:
- `docs/research/SMARTLEARN_PEDAGOGICAL_CONTRACT_V1.md`
- `.specs/features/evidence-learning-core-v1/spec.md` for the current migration milestone

The pedagogical contract supersedes legacy assumptions that intelligent learning mechanisms are permanently out of scope.

## Tone and UX
Focused, adult, calm and low-friction. Portuguese (pt-BR) in the product UI. Avoid gamified noise, unnecessary management controls and interfaces that expose internal model complexity to the learner.

## Technical baseline
- Tauri 2
- HTML/CSS/JavaScript
- SQLite local through `src/db.js`
- Desktop + Android from one codebase; iOS kept build-compatible
- No remote database or mandatory account in the current architecture
