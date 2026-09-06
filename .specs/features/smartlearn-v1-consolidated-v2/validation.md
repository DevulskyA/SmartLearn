# SmartLearn V1 consolidated validation - initial state

PLAN STATUS: AUTHORED_FOR_USER_ACTIVATION
PRODUCT IMPLEMENTATION STATUS: NOT_EXECUTED_BY_THIS_PACK
CURRENT EXECUTOR CANDIDATE: TO_BE_RECONCILED_AT_T01
FORMAL TLC EXECUTION VALIDATORS: NOT_RUN_IN_THIS_AUTHORING_DELIVERY
INDEPENDENT AUTHORING VERIFIER: NOT_AVAILABLE; no independent-verification claim

This file starts honestly incomplete. The executor updates it with actual commands/results as T01-T54 proceed. Never copy historical results into new candidate PASS cells without a justified source/tree equivalence check.

## Evidence actually obtained while authoring

- Read the remote eight-branch inventory pinned in context.md.
- Read the entire historical learning-core.js, its nine tests, its spec/design/validation/contract and relevant governance changes.
- Reconstructed the source/test files from connector reads; Git blob hashes match the cited historical blobs.
- Ran the historical nine focused tests: 9/9 PASS in Linux, Node v22.16.0.
- Executed ten characterization probes; all ten reproduced the outputs in evidence/adversarial-results.json. These expose limitations/defects in the historical prototype; they do not certify it.
- Read the real current planUnitSaveBtn implementation and the continuation E2E file. The existing single-save path is present; the recent two-button test did not exercise it.
- Authored a forward dependency graph of 54 tasks, mapped to 24 requirements and 28 acceptance criteria. Structural plan checks are recorded in PLAN_QA.json; they are not TLC product completion checks.

## Historical baseline, not rerun here

Source baseline: main f645a0730f6e37560de813b1610f359a57419f27.
Executor previously reported client 223/223, server 17/17, Rust 13/13, build, process smoke and independent verifier PASS. Runtime results are reports of that baseline, not a claim that the authoring environment reran them or that later V1 changes passed.

## Fill at execution

| Gate | Status | Candidate/environment/command/evidence |
| --- | --- | --- |
| Worktree/authority reconciliation (T01) | PASS | Continuation `claude/smartlearn-v1-complete` before=18e903b2f297a251764b8e37a567a0fef1634664 (215c89d + E2E harness, pre-integration). `git merge origin/main` (f645a0730f6e37560de813b1610f359a57419f27, containing 23358b6 PR#3 + 215c89d PR-1 via merge-commits) -> after=e5292fa03ef29efa4bf0c90d640ba9699192f133, clean ort merge, only diff: deletion of `data/smartlearn-backup-importavel.json` (4015 lines), confirmed via `git log --oneline -- <path>` to be the same legacy non-medical dataset main had already deliberately removed (commit da4684b "chore(data): remove legacy non-medical backup dataset") — not new data loss. Then materialized consolidated-v2 pack (62ea681) + heritage.md + T02/T45/T49/T52/T54 amendments (bfbb82b). `git merge-base --is-ancestor 23358b6.. HEAD` and `...215c89d.. HEAD` both true. `npm test` post-merge: 223/223 PASS. Sibling worktree `fix-complete-review-sqlite-593426` (PR#3 branch) observed DIRTY with another session's uncommitted work (.claude/loop.md, docs/research/, .specs tasks.md status edit) — recorded, not touched, not merged. |
| Source and intended test inventory (T02) | PASS | Heritage Coverage Matrix filled in heritage.md with real repo evidence: 7/9 rows PROVEN (discipline catalog, master study entry, automatic schedule, daily decision surface, discipline performance, unit evolution, longitudinal tracking), 2/9 PARTIAL with explicit GAP linked to future tasks (execution results — item-level evidence GAP -> T29-T33; backup/recoverability — server migration GAP -> T25-T28). No row silently dropped. STATE.md updated with current active-plan handoff, old PR-0/PR-1 checkpoint preserved below as historical evidence per design.md §1. |
| Client/shared suite | PASS | `npm test` on claude/smartlearn-v1-complete @ 8dd276b+: 223/223 PASS, no regression from E2E harness rewrite |
| Target-proven E2E (T03) | PASS | Rewrote e2e/smartlearn-plan-flow.spec.js (11 tests, `npx playwright test`, all PASS). Key fix: prior test clicked the subject-subform's own "Adicionar" submit before "Salvar aula" (two clicks) and asserted `length>0` on seeded data — both were test defects. New AC-03 test types the new subject name, does NOT click "Adicionar", clicks ONLY #plan-unit-save-btn once, and asserts exact deltas: +1 subject row (by name, deduped), +1 learning_unit row (by subjectId+title), +16 review_task rows (by unitId) — confirming src/app.js:3347 handler + src/db.js:1464 `newSubjectName` atomic path is real and already compliant with AC-03. Added preflight() (title="SmartLearn" + exact 6-screen data-screen set + #plan-unit-save-btn existence) run in beforeEach before any localStorage write, satisfying AC-02. AC-04 (injected mid-write failure) recorded BLOCKED_EXTERNAL — no window-exposed DB hook exists to inject a failure without a test-only product seam; deferred to T13+ server-side transaction test instead of fabricating a pass. |
| Server suite and real SQLite | NOT_RUN | |
| Native Rust suite | NOT_RUN | |
| Production Web build | NOT_RUN | |
| Target-proven E2E | NOT_RUN | |
| Unified Unicode validation (T04) | PASS | Extended `NAMING_PATTERN` in src/naming-validation.js to accept en/em dash (U+2013/U+2014), Greek letters (U+0370-U+03FF), superscripts/subscripts (U+2070-U+209F + legacy ¹²³), and µ ± × ÷ < >, while still rejecting sentence-signal ASCII symbols (@ # $ % ^ \` ~ \| \\) and curly quotes — surgical extension, not full allowlist removal, per T04 "smallest sufficient change". Verified via node -e against exact AC-05 corpus (Na⁺/K⁺-ATPase, β-bloqueador, O₂, µg, pH < 7,35, em-dash) before editing tests. Updated test/naming-validation.test.js (Contract C/D/H) to assert acceptance instead of rejection for em-dash/Greek/superscripts, kept rejection assertions for @ and control chars. Updated e2e KNOWN GAP test to AC-05 PASS test with exact round-trip assertion. 68/68 naming-validation unit tests PASS, 231/231 full root suite PASS (was 223, +8 new positive-case tests), 12/12 E2E PASS (was 11, +1 new sentence-signal-still-rejected test). |
| Identity/CSRF/cross-user security | NOT_RUN | |
| Single-save and no-partial-state | NOT_RUN | |
| Review-only and question-evidence semantics | NOT_RUN | |
| Import/export/data-loss discrimination | NOT_RUN | |
| Real PDF/source fidelity | NOT_RUN | |
| AI fake-provider contract | NOT_RUN | |
| Configured real-provider integration | NOT_RUN | Requires credentials/consent |
| Offline account isolation/cold start | NOT_RUN | |
| Windows build and actual UAT | NOT_RUN | |
| Android build and actual UAT | NOT_RUN | |
| Reminders per supported runtime | NOT_RUN | |
| Accessibility/pt-BR | NOT_RUN | |
| Operational restore with source assets | NOT_RUN | |
| Material mutations MX01-MX21 | NOT_RUN | |
| Formal spec/task/completion validators | NOT_RUN | |
| Final independent verifier | NOT_RUN | |
| Authorized real-data migration | NOT_RUN | External authorization required |
| Authorized deployment/store publication | NOT_RUN | External authorization required |

## Required final report

Exact HEAD/tree, task counts and IDs, source/build environment, every required gate, open defects by impact, deferred items, uncommitted files preserved, external permissions still needed, independent verifier scope, next action, and distinct IMPLEMENTATION_COMPLETE / V1_VALIDATED / PRODUCTION_RELEASED.

A blocked final verification is not permission to erase unverified criteria or invent alternative scope. Preserve code/evidence and produce a resumable terminal checkpoint.
