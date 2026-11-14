# Evidence Contract

The tooling separates declarations from observations.

## Evidence chain

```text
Requirement -> Acceptance criterion -> Task -> Test or observation -> Gate receipt -> Repository snapshot
```

The deterministic validator checks that this graph closes and that receipts match the current snapshot. A fresh verifier still judges whether the cited test or observation semantically proves the criterion.

## Commands

Resolve `scripts/tlc.py` through the active host adapter.

```bash
python3 <skill-root>/scripts/tlc.py lint-spec <feature-or-spec>
python3 <skill-root>/scripts/tlc.py lint-tasks <feature-or-tasks> --spec <spec> --repo <repo>
python3 <skill-root>/scripts/tlc.py run-gate --repo <repo> --feature <feature-dir> --id <gate-id> -- <argv...>
python3 <skill-root>/scripts/tlc.py verify-evidence <feature-dir> --repo <repo>
python3 <skill-root>/scripts/tlc.py self-test
```

`run-gate` executes an argv array directly without a shell. Put pipelines, redirects, environment setup, and multi-command logic in a reviewed repository script; never pass untrusted Markdown to a shell.

## Receipt

Each receipt records:

- schema and integrity digest;
- gate ID, explicit argv, working directory, timeout, and observed exit code;
- start/end timestamps and hashes/byte counts of stdout and stderr;
- Git `HEAD`, branch, and a content fingerprint before and after execution;
- hashes of `spec.md`, `tasks.md`, and `traceability.json`;
- outcome calculated by the runner.

The fingerprint covers tracked and non-ignored untracked project files, including modes and symlink targets, while excluding generated gate receipts and derived validation reports. The runner rejects a gate that mutates this governed snapshot.

Local integrity hashes detect editing and staleness; they do not authenticate who ran a command. CI attestation or another trusted execution boundary is required when adversarial authorship matters.

## Result vocabulary

- `SPEC_STRUCTURE_OK`, `TASKS_STRUCTURE_OK`: declared structure is internally valid.
- `GATE_OBSERVED`: the explicit process produced its expected exit on one exact snapshot.
- `EVIDENCE_VERIFIED`: traceability and current receipts are mechanically complete and fresh.
- `SEMANTIC_PASS`: a fresh verifier inspected that evidence and found it sufficient for the contract.
- `UNVERIFIED`: evidence is missing or the host cannot execute it.
- `STALE`: governed inputs or project content changed after execution.
- `FAIL`: a declared check or behavior failed.

Never report `SEMANTIC_PASS` from a bundled parser or from prose inside `validation.md`.

## Exit codes

| Code | Meaning |
| ---: | --- |
| 0 | The command's explicitly promised check succeeded |
| 1 | Invalid artifact, failed behavior, or incomplete evidence |
| 2 | Usage, schema, path, or configuration error |
| 3 | Execution infrastructure failure or timeout |
| 4 | Stale or integrity-invalid evidence |
| 70 | Unexpected validator defect |

## Trust boundaries

- Paths must remain within the declared repository after realpath and symlink checks.
- Generated evidence must not follow repository-controlled symlinks.
- Receipts never store raw stdout/stderr by default because logs may contain secrets; hashes and byte counts are retained.
- A passing command may still test nothing. The verifier must inspect collection/results or use a project-native structured test report when test count matters.
- A killed mutation proves only that the selected test distinguishes that fault; it does not prove general correctness.
