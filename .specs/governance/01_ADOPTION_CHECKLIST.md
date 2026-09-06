# TLC Governance Adoption Checklist

Use once per active project, then keep enforcement in normal feature work.

## Project baseline
- [ ] Identify canonical branch/worktree.
- [ ] Reconcile real Git state before trusting handoff docs.
- [ ] Create/normalize `.specs/STATE.md`.
- [ ] Create `.specs/LESSONS.md` if absent.
- [ ] Create `.specs/DEBT.md`.
- [ ] Create `.specs/adr/` and document ADR policy.
- [ ] Do not rewrite historical specs merely to match the new structure.

## Active feature
- [ ] Identify active feature and current spec/design/tasks.
- [ ] Add `impact.md` if Large/Complex change touches existing behavior.
- [ ] Map callers, dependencies, requirements, tests, contracts/data, regression surface.
- [ ] Identify/create regression sensor before further structural edits.
- [ ] Convert discovered deferred issues to DEBT items.
- [ ] Ensure each formal task is atomic and owns its tests/gates.
- [ ] Ensure no known unmet AC is labeled PASS.

## Closure
- [ ] Full/build/e2e/UAT gates run in the real required environment.
- [ ] Fresh verifier uses evidence-or-zero.
- [ ] Discrimination sensor kills plausible faults.
- [ ] `validation.md` truthfully reports PASS/FAIL/GAP.
- [ ] STATE updated to current reality.
- [ ] DEBT/ADR updated if needed.
- [ ] Push/PR/merge only after explicit approval.
