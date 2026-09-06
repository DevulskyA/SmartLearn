# Evidence Learning Core V1 Design

## Context Loaded
- Spec: `.specs/features/evidence-learning-core-v1/spec.md`
- Current product: local-first Tauri 2 + vanilla JS + SQLite
- Existing SQL boundary: `src/db.js`
- Lessons: preserve current working product while replacing the learning model incrementally

## Architecture
`src/learning-core.js` is a dependency-free domain module. It accepts explicit learning events and returns deterministic, inspectable decisions. It does not persist data and does not call the UI. This keeps the first pedagogical change independently testable and prevents a large migration before the learning contract is stable.

The core exposes four operations:
1. normalize/validate a learning event;
2. classify how much mastery evidence a successful event provides;
3. infer ranked error hypotheses from an event plus prior history;
4. evaluate a conservative mastery gate and recommend the next pedagogical action.

## Interfaces and Contracts
| Component | Contract | Inputs | Outputs | Errors |
| --- | --- | --- | --- | --- |
| createLearningEvent | validates event semantics | plain object | frozen normalized event | invalid enum/range/timestamp |
| classifyEvidenceStrength | separates assistance from mastery evidence | learning event | none/weak/moderate/strong | invalid event |
| inferErrorHypotheses | produces competing causal hypotheses, not diagnoses | current event + history | ranked hypothesis list | invalid event |
| evaluateMastery | applies explicit conservative gate | same-competency events | checks, blockers, evidence counts | mixed competencies |
| recommendNextAction | maps strongest current evidence to a next operation | event + history | repair/retest/space/advance | invalid event |

## State and Data
No persistence change in V1. The event shape is intentionally ready for a later SQLite migration, but persistence is a separate feature so migration risk and pedagogical logic can be verified independently.

## Test Strategy
- Unit tests cover every acceptance criterion.
- Regression boundary: current scheduler, database and UI files are untouched.
- Closure gate: `node --test src/learning-core.test.js`.

## Tech Decisions
| Decision | Reason | Trade-off | Scope | Record in STATE? |
| --- | --- | --- | --- | --- |
| Pure JS core first | enables deterministic testing before migration | not yet user-visible | feature | no |
| Qualitative error strength | avoids fake probability calibration | less granular | feature | no |
| Conservative mastery gate | protects against assisted-performance false positives | may delay mastery | project pedagogy | yes later |
| No scheduler replacement | minimizes regression risk | adaptive scheduling deferred | feature | no |

## Risks
| Risk | Mitigation | Owner |
| --- | --- | --- |
| Heuristics treated as scientific truth | docs explicitly label them V1 operational rules | project |
| Core never reaches UI | follow with persistence + instrumentation feature | next milestone |
| Over-complex learner model | only four operations and no learned model in V1 | project |
