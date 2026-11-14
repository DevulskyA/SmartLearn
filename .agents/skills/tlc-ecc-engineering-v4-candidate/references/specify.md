# Formal Specification Capability

Load this reference only when `FORMAL_SPEC` is triggered because a durable contract materially reduces ambiguity, coordination cost, audit risk, or expensive rework.

Do not create a formal spec merely because the project is brownfield, stateful, or important.

## Durable artifact

Create `.specs/features/<feature>/spec.md` only when the capability is active:

```markdown
# <Feature> Spec

## Objective
<One observable end state.>

## Relevant Guardrails
- <only invariants this change can affect>

## Risk / Irreversibility
| Dimension | Level | Reason | Required control |
| --- | --- | --- | --- |
| reversibility | low/medium/high/critical | ... | ... |

## Requirements
| ID | Requirement | Source | Priority |
| --- | --- | --- | --- |
| REQ-001 | ... | user/repository/official-docs/decision | must/should |

## Acceptance Criteria
| ID | Requirement IDs | Given | When | Then | Observable outcome | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| AC-001 | REQ-001 | ... | ... | ... | exact value/state/effect | automated/manual/inspection |

## Baseline
<Current behavior and reproduction evidence, or not-applicable with reason.>

## Non-goals
- ...

## Decisions
| ID | Question | Status | Resolution |
| --- | --- | --- | --- |
| DEC-001 | ... | resolved/blocking | ... |
```

## Rules

- Keep the spec no larger than necessary to judge implementation and proof.
- One acceptance criterion should prove one observable outcome.
- Every `must` requirement needs at least one criterion; every criterion names existing requirements.
- Use exact values, transitions, statuses, payloads, side effects, invariants, or error behavior where the contract determines them.
- A criterion may be manual when automation is disproportionate or cannot capture the relevant behavior; state the observation.
- For bugs, reproduce or characterize the baseline before implementation when feasible.
- Separate facts, human decisions, hypotheses, and unresolved questions.
- A blocking product decision stops implementation; do not disguise it as an assumption.
- If the change touches a triggered security or operations boundary, load the corresponding capability reference.

Run `tlc.py lint-spec <spec-or-feature>` only when a formal spec exists. `SPEC_STRUCTURE_OK` means only that the declared contract is structurally coherent.
