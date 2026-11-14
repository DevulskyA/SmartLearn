# Grounded Lessons and Executable Learning

A lesson is a candidate cross-cutting policy extracted from observed failure or correction. It is not the default memory mechanism.

## Executable memory first

For an observed defect, incident, or repeated agent mistake:

1. reproduce or characterize the failure;
2. encode the smallest regression test/eval/hook/check that detects recurrence when feasible;
3. fix the cause and prove the executable memory fails on the defect and passes on the correction;
4. add a textual lesson only for the material remainder that cannot be enforced or detected executablely.

Do not create prose rules from a clean PASS or a one-off anecdote merely because it was memorable.

## Textual lesson lifecycle

```text
candidate -> eligible -> confirmed
          -> rejected/quarantined
```

- Each event needs a distinct feature/run identity and current structured evidence when formal evidence exists.
- Recurrence can make a candidate `eligible`; it never confirms truth automatically.
- Confirmation or quarantine requires an explicit review event with rationale and cited evidence.
- Load only confirmed, relevant, non-superseded lessons.
- Do not merge rules merely because normalized text looks similar.
- Expiration preserves history; deletion is a separate explicit maintenance action.
- Prefer narrowing or deleting a lesson when a test, hook, schema, or better-scoped instruction now captures it.

The canonical store is `.specs/lessons.json`; `.specs/LESSONS.md` is a regenerable projection. Queries must not mutate either file. Writes must be locked, atomic, schema-validated, symlink-safe, and free of secrets or uncontrolled markup.

Use `tlc.py lessons --help` for the deterministic store. If the host cannot provide safe filesystem primitives, record the lesson manually without claiming transactional storage.
