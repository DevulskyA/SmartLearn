# Agent prompt — adopt TLC Governance Standard without feature drift

Read `00_PROJECT_GOVERNANCE_STANDARD.md` and `01_ADOPTION_CHECKLIST.md` first.

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
6. Convert only grounded, intentionally deferred imperfections to DEBT-### items. Do not use debt to waive failing ACs.
7. Identify any active structural task that currently lacks a regression sensor. Mark it BLOCKED_FOR_SENSOR; do not edit the target until protection exists.
8. Do not create ADRs for local choices. Create ADR only for active cross-feature architecture decisions costly to rediscover.
9. Update future formal tasks to reference impact + sensor + requirement + narrow gate + regression gate + difficulty 1–5 when non-trivial.
10. Do not implement product features during this adoption pass.
11. Do not push/PR/merge.

Deliver only:
- repository truth reconciled;
- files added/normalized;
- active DEBT items created;
- active impact map summary;
- structural changes blocked for missing sensors;
- any material human decision still required.

Stop at:
`HUMAN_GATE: GOVERNANCE_ADOPTION_APPROVAL`
