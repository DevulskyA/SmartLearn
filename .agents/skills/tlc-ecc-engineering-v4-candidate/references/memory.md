# Handoff, Resume, and Worktree State

Use only when `HANDOFF` or `CONTEXT_RECOVERY` is triggered.

Repository evidence is authoritative; a handoff is a hypothesis.

## Minimal handoff by default

Persist only what cannot be reconstructed cheaply:

```text
OUTCOME=<observable destination>
POSITION=<what is proven now>
NEXT=<next necessary slice>
BLOCKER=<none | real gate>
WORKTREE=<identity>
HEAD=<sha>
STATUS=<clean/dirty + relevant paths>
```

Do not turn every session into a historical dossier.

For complex concurrent or auditable work, richer governed state may be justified, for example:

```text
.specs/
├── decisions/
├── features/<feature>/
├── runs/<run-id>/state.json
└── locks/<feature>.lock/
```

Only activate this richer form when coordination or recovery risk requires it.

## Resume

1. resolve repository and worktree identities;
2. confirm branch/detached state, `HEAD`, and status;
3. reconcile the compact handoff with actual files, recent commits, tests, and any governed artifacts that matter;
4. mark snapshot-bound evidence stale when its inputs changed;
5. continue from the first unproven necessary slice.

Do not silently resume a handoff from another worktree. Do not let memory loss trigger product replanning when repository evidence and resolved decisions already determine the next action.

When concurrent formal ownership exists, one writer owns each governed feature artifact. Never steal an unknown or remote lock automatically.
