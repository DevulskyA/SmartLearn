# Evidence Learning Core V1 Spec

## Objective
Create a transparent learning-evidence core that distinguishes assisted performance from independent, delayed, transferable learning without changing the existing SmartLearn UI or persistence yet.

## Requirements
| ID | Requirement | Source | Priority |
| --- | --- | --- | --- |
| ELC-001 | Learning events must explicitly record competency, evidence type, correctness, assistance, time and optional confidence. | canonical evidence architecture | must |
| ELC-002 | A revealed solution must provide zero positive mastery evidence. | canonical evidence architecture | must |
| ELC-003 | Error causes must remain hypotheses and may return multiple competing explanations. | canonical evidence architecture | must |
| ELC-004 | V1 mastery must require independent success, delayed stability and independent transfer/simulation evidence. | canonical evidence architecture | must |
| ELC-005 | A high-confidence wrong answer after prior evidence must block mastery until later strong independent evidence exists. | canonical evidence architecture | must |
| ELC-006 | The domain core must be pure JavaScript with no SQL, network, UI or Tauri dependency. | current architecture / INV-24 | must |
| ELC-007 | Existing fixed review behavior must remain untouched in this milestone. | regression protection | must |

## Acceptance Criteria
| ID | Given | When | Then | Spec-defined outcome |
| --- | --- | --- | --- | --- |
| AC-001 | A correct event whose assistance level is SOLUTION | evidence strength is evaluated | it cannot increase mastery evidence | strength = none |
| AC-002 | Two independent retrieval/application successes separated by at least 24h and one independent transfer/simulation success | mastery is evaluated | competency may pass the gate | mastered = true when no unresolved misconception exists |
| AC-003 | Multiple correct events inside one session plus transfer | mastery is evaluated | delayed stability fails | mastered = false |
| AC-004 | A learner answers incorrectly with confidence >= 0.8 | error inference runs | misconception and calibration are both represented | both hypotheses returned |
| AC-005 | Prior independent success followed by failure on a transfer task | error inference runs | transfer failure is prioritized | top hypothesis = transfer_failure |
| AC-006 | A later high-confidence error occurs after otherwise sufficient mastery evidence | mastery is evaluated | mastery is blocked | misconceptionResolved = false |
| AC-007 | Core unit tests run | node test runner completes | all learning-core tests pass | exit status 0 |

## Edge Cases
- Empty evidence returns not-mastered, never an exception.
- Mixed competencies in one mastery evaluation are rejected.
- Invalid confidence, assistance or evidence-type values are rejected.
- Correct low-confidence answers are treated as potentially unstable rather than strong evidence by default.

## Non-goals
- SQLite migrations.
- UI changes.
- LLM tutoring.
- Automatic content generation.
- Replacing the current 16-step scheduler.
- Claiming that the V1 heuristic is a validated cognitive model.

## Open Questions
- none
