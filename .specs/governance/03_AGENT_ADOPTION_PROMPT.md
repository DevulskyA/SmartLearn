# Agent prompt — adopt TLC Governance Standard without feature drift

Read `00_PROJECT_GOVERNANCE_STANDARD.md`, `01_ADOPTION_CHECKLIST.md`, and `04_PEDAGOGICAL_KERNEL.md` first.

Objective: make this ACTIVE TLC-managed repository governance-compliant without implementing new product behavior.

Rules:

1. Reconcile branch, HEAD, `git status --porcelain`, recent commits and active feature artifacts. Evidence wins over handoff prose.
2. Do not rewrite historical specs/tasks merely to match the new template.
3. Create/normalize only the missing governance skeleton:
   - `.specs/STATE.md`
   - `.specs/LESSONS.md`
   - `.specs/DEBT.md`
   - `.specs/adr/README.md`
4. Preserve existing project truth. If an old STATE lives elsewhere, create a canonical migration/pointer plan rather than silently losing decisions.
5. Audit the ACTIVE feature. If it is Large/Complex and changes existing behavior, create `impact.md` that answers:
   - callers/entry points;
   - dependencies;
   - requirements/ACs;
   - existing tests/sensors;
   - API/schema/data/contracts changed;
   - neighboring regression surface;
   - sensor(s) required BEFORE further structural edits;
   - rollback/recovery;
   - residual unknowns.
6. If the active feature can alter learning outcomes, apply `04_PEDAGOGICAL_KERNEL.md` and add a pedagogical impact section covering:
   - kernel clauses affected;
   - learner outcome expected to improve;
   - current champion behavior to preserve;
   - discriminating evidence/metric;
   - learning-regression sensor;
   - falsification criterion;
   - rollback if learning quality degrades.
7. For learning claims, treat exposure, completion, time-in-app, and raw activity counts as process signals. Use observable learner evidence appropriate to the claim, preferring retrieval, explanation, application, discrimination, transfer, and delayed retention as stronger evidence.
8. Preserve the champion when a pedagogical challenger is inconclusive. Do not promote a change that materially regresses protected learning outcomes, learner burden, correctness, or medical/content fidelity.
9. Convert only grounded, intentionally deferred imperfections to DEBT-### items. Do not use debt to waive failing ACs.
10. Identify any active structural task that currently lacks a regression sensor. Mark it BLOCKED_FOR_SENSOR; do not edit the target until protection exists.
11. Do not create ADRs for local choices. Create ADR only for active cross-feature architecture decisions costly to rediscover.
12. Update future formal tasks to reference impact + sensor + requirement + narrow gate + regression gate + pedagogical gate when applicable + difficulty 1–5 when non-trivial.
13. Do not implement product features during this adoption pass.
14. Do not push/PR/merge.

Deliver only:
- repository truth reconciled;
- files added/normalized;
- active DEBT items created;
- active impact map summary;
- pedagogical gate status when learning behavior is in scope;
- structural changes blocked for missing sensors;
- any material human decision still required.

Stop at:
`HUMAN_GATE: GOVERNANCE_ADOPTION_APPROVAL`
