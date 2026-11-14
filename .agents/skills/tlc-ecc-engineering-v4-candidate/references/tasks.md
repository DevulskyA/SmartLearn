# Task Planning and Traceability Capabilities

Load this reference only when `TASK_PLANNING` or `TRACEABILITY` is triggered.

A task list is useful when sequencing, ownership, handoff, or proof would otherwise become ambiguous. Traceability is useful when many criteria, multiple executors/sessions, auditability, or long duration make proof links hard to preserve.

Do not create either artifact for a small self-contained slice merely because tooling exists.

## `tasks.md`

Define only the dependency-bearing tasks needed to reach the outcome.

```markdown
## Gate Registry
| Gate ID | Level | Command | Source |
| --- | --- | --- | --- |
| G-UNIT | task | python -m pytest tests/unit | pyproject.toml:42 |
| G-CLOSE | closure | python -m pytest | CI workflow or project docs |

### T-001: <cohesive behavior slice>
**Requirements**: REQ-001
**Acceptance**: AC-001, AC-002
**Depends on**: none
**Gate IDs**: G-UNIT
**Files**: src/example.py, tests/test_example.py

**Done when**:
- [ ] <observable condition>
- [ ] required proof is current for this snapshot
```

Commands in Markdown are declarations, not execution evidence. Pass explicit argv to `run-gate` when formal evidence recording is required.

## `traceability.json`

Create machine-readable links only when `TRACEABILITY` is active:

```json
{
  "schema": "tlc.traceability/v2",
  "feature": "example",
  "spec": "spec.md",
  "tasks": "tasks.md",
  "gates": {
    "G-CLOSE": {
      "level": "closure",
      "argv": ["python", "-m", "pytest"],
      "cwd": ".",
      "source": "pyproject.toml:42"
    }
  },
  "mutations": {},
  "criteria": [
    {
      "id": "AC-001",
      "tasks": ["T-001"],
      "tests": [{"path": "tests/test_example.py", "line": 12, "symbol": "test_exact_outcome"}],
      "gates": ["G-CLOSE"],
      "mutations": []
    }
  ],
  "closure_gates": ["G-CLOSE"],
  "discrimination": {"required": false, "reason": "not triggered for this change"}
}
```

Set `discrimination.required` to `true` only when `MUTATION` is actually triggered and list the relevant receipt IDs.

## Invariants when traceability is active

- Every required criterion appears exactly once.
- Every criterion maps to existing tasks and proof sources.
- Automated criteria cite existing test locations.
- Dependencies are acyclic and point to existing earlier tasks.
- Gate commands come from repository configuration, CI, scripts, or governed documentation; never invent them.
- Parallelize only ownership-independent tasks.

Run `tlc.py lint-tasks <tasks-or-feature> --spec <spec> --repo <repo>` only when these formal artifacts exist. Structural success does not mean any gate ran.
