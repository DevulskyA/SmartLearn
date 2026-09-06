# Acceptance, negative testing and evidence contract

## What counts as a completed task

For each task keep IMPLEMENTATION_STATUS and VERIFICATION_STATUS separately. The allowed verification states are PASS, FAIL, NOT_RUN, BLOCKED_EXTERNAL and NOT_APPLICABLE_WITH_REASON. A implemented interface with a missing live-provider or native-runtime test is not a validated product feature. A dependent local task can proceed only when it uses an independently proved interface and does not depend on the unavailable integration itself.

A completed phase is a checkpoint. Continue the next specified task without inventing more product scope. A material defect blocks dependent work; it need not block unrelated safe work. The terminal report may be produced from any blocked state. The final product verdict remains PARTIAL until required runtime gates pass.

## Required evidence record

For each acceptance criterion record:
- requirement and task IDs;
- expected behavior and relevant negative path;
- exact source commit/tree plus dirty-file manifest if applicable;
- test file and command actually run;
- OS, Node/browser/native runtime, dependency versions and database mode;
- exit code, test count and assertion/result;
- trace/log/report path with secrets and personal data redacted;
- verifier identity/context and examined scope;
- any remaining external gate.

Keep source, API, UI, native runtime and pedagogical outcomes distinct. A HTTP 200 does not prove UI interaction. A UI interaction does not prove central data authority. A source citation does not prove medical correctness. Unit tests of an educational heuristic do not demonstrate better learning. A passed characterization of a known undesirable behavior does not satisfy its replacement acceptance criterion.

## Gate commands

Known current commands:

```text
npm test
npm --prefix server test
npm run build
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Execute each in its intended repository/worktree; tests require isolated data paths. Create prescribed new scripts/files before referencing their commands. Pin dependencies through committed manifests/locks and record any approved install-script execution. Native packaging commands must be taken from the installed Tauri CLI/toolchain for this checkout; do not reuse an old installer as proof of a new source tree.

TLC formal checks use the actual installed skill root:

```text
python <ACTUAL_TLC_SKILL_ROOT>/scripts/validate_spec.py <active-feature>/spec.md
python <ACTUAL_TLC_SKILL_ROOT>/scripts/validate_tasks.py <active-feature>/tasks.md
python <ACTUAL_TLC_SKILL_ROOT>/scripts/validate_completion.py <active-feature>/validation.md
```

Use the Python launcher present locally. Placeholder paths above are not literal executable paths. Record nonzero inspected requirements/tasks. If the local validator requires a different Markdown layout, adapt formatting only and preserve IDs, dependencies and every requirement; never change semantic requirements to obtain PASS. Missing validators remain UNAVAILABLE, not a fabricated PASS. Do not install or search an entire skill ecosystem to satisfy a small format check.

## Material mutation families

Inject one plausible fault at a time into an isolated disposable copy. Record the specific fault, sensor, failure and restored baseline. Failures must be behavior assertions, not merely syntax/import errors, except when the criterion is explicitly invalid configuration handling. Do not mutate the user's working tree, real database or other agent's branch.

| ID | Fault to inject | Sensor that must distinguish it |
| --- | --- | --- |
| MX01 | Test server uses a wrong cwd/build or pre-existing unrelated process | Target preflight rejects before fixture writes |
| MX02 | Restore Latin-only subject allowlist | Valid Greek/superscript/dash name fails exact save/rename/export test |
| MX03 | Remove owner predicate or accept body.userId | Two-user route test detects leak/write; composite FK test catches wrong owner relation |
| MX04 | Remove create-unit transaction | Failure after subject/unit insertion leaves forbidden partial state |
| MX05 | Remove/change a fixed review offset | Exact 16-date oracle across calendar/time-zone boundaries fails |
| MX06 | Commit completed review before result evidence or vice versa | Injected failure detects inconsistent task/evidence state |
| MX07 | Create fake evidence for review-only completion | Test expects completion with no invented q/c/score/event |
| MX08 | Ignore operation payload or duplicate idempotent replay | Same-key changed payload conflict/one-write count fails |
| MX09 | Accept a missing/corrupt import row or cross-unit ID | Golden record/value/relationship reconciliation fails |
| MX10 | Default unknown assistance to NONE | Independent-evidence profile test fails |
| MX11 | Count duplicate event/attempt twice | Unique-observation counts and profile stay invariant under replay |
| MX12 | Trust supplied delay/transfer/confidence as mastery proof | Attributable-time, reviewed-item and uncertainty tests fail |
| MX13 | Clear all error hypotheses after one unrelated success | Linked supporting/contradicting event test fails |
| MX14 | Share private offline snapshot across users or retain it after logout | Account-switch cold-start test detects forbidden private data |
| MX15 | Queue or report success for an offline mutation | Network-offline test expects rejection, zero write/outbox and preserved draft |
| MX16 | Accept external/invalid PDF path or unsupported AI citation | Path/ownership and source-span rejection tests fail |
| MX17 | Let source text instruct the generation tool to mutate data | Provider sandbox/permission boundary test detects any side effect |
| MX18 | Omit an uploaded source from operational backup | Restored source resolution/checksum test fails |
| MX19 | Remove cookie/session expiry/CSRF enforcement | Security tests reject missing/wrong/revoked session/origin/token |
| MX20 | Include a known bad nested test outside discovery | Inventory/runner gate detects the excluded expected test |
| MX21 | Reintroduce DB non-WAL/FK-off, checksum bypass, missing migration rollback or unconditional readiness | Existing foundation regression tests and real-process checks fail |

Select faults proportional to the touched behavior during each task. The final matrix must cover the listed material invariants. Repeated 17/17 or 223/223 runs cannot replace a missing negative sensor. Do not retain deliberate mutants in production/history.

## Mandatory representative journeys

1. Clean production-mode test instance; register/login A; wrong credentials, expiry and logout deny access.
2. A creates a unit with a new subject by one Save; verify exact subject/unit/task IDs and rollback on injected failure.
3. A completes a review with questions; repeat an ambiguous network retry; one completion/evidence exists. Conflicting retry gets 409.
4. A completes a review without questions; agenda changes while no learning score is invented.
5. B attempts A's IDs and export/source/cache paths; no data leaks or unauthorized relations exist.
6. A uses two fresh browser contexts; changes and restarts preserve the same central state, with no automatic local write fallback.
7. Valid legacy fixtures preview/import/export/restore; exact records, relationships, precision and source assets reconcile. Invalid and repeated inputs preserve state.
8. A performs an actual exercise with a hint/solution; item version/help remain attached. Unknown metadata or duplicates do not improve the independent profile.
9. Source PDF -> attributable text -> draft -> inspect/accept -> practice -> review -> understandable progress. Fake and live provider results are separately labelled.
10. Previously synced PWA starts cold offline with the known future agenda and lastSyncedAt; offline writes fail; account switch purges private state.
11. Windows and Android prove their actual shared UI/authority, online and offline, and consent-based reminder behavior. A browser resize is not native UAT.
12. Keyboard/200% zoom/narrow viewport completes core flows; translated messages and input errors stay usable.
13. Candidate production package starts with approved config, no dev seed/debug authority and no broad remote native commands.

## Release result

Report separately:
IMPLEMENTATION_COMPLETE; V1_VALIDATED; PRODUCTION_RELEASED; SCIENTIFIC_LEARNING_BENEFIT.

The first three require their own evidence and authorization boundaries. SCIENTIFIC_LEARNING_BENEFIT remains NOT_ESTABLISHED unless an appropriate outcome study exists; that does not prevent delivery of a truthful, tested learning tool. A disabled experimental policy is not an optimized learning engine.

When integration/device credentials are unavailable, record the exact blocked acceptance gate and continue independent work. At true terminal block, preserve all work, produce the report, cancel this mission's recurring job and stop only owned temporary processes before the user-authorized hibernation command. A failed power command is a recorded limitation, never a false success.

## Criterion-to-task coverage

| Criterion | Planned tasks |
| --- | --- |
| AC-01 | T01, T02, T52 |
| AC-02 | T01, T03, T05, T52 |
| AC-03 | T03, T15, T23, T47, T49, T52 |
| AC-04 | T03, T15, T23, T52 |
| AC-05 | T04, T14, T23, T48, T52 |
| AC-06 | T07, T08, T12, T13, T14, T17, T18, T24, T34, T52 |
| AC-07 | T06, T07, T08, T09, T10, T11, T21, T24, T51, T52 |
| AC-08 | T07, T09, T10, T12, T51, T52 |
| AC-09 | T13, T15, T16, T52 |
| AC-10 | T13, T16, T18, T31, T49, T52 |
| AC-11 | T16, T18, T31, T52 |
| AC-12 | T15, T16, T21, T23, T27, T52 |
| AC-13 | T20, T21, T22, T24, T42, T43, T49, T52 |
| AC-14 | T25, T26, T27, T28, T52 |
| AC-15 | T19, T22, T25, T28, T50, T52 |
| AC-16 | T29, T30, T31, T32, T52 |
| AC-17 | T32, T33, T45, T52, T53 |
| AC-18 | T17, T29, T30, T52 |
| AC-19 | T34, T35, T36, T49, T52 |
| AC-20 | T37, T38, T49, T52, T53 |
| AC-21 | T36, T38, T49, T52 |
| AC-22 | T39, T40, T41, T52 |
| AC-23 | T10, T11, T39, T40, T41, T52 |
| AC-24 | T42, T43, T51, T52 |
| AC-25 | T44, T52 |
| AC-26 | T11, T46, T47, T48, T52 |
| AC-27 | T02, T05, T06, T12, T24, T28, T33, T37, T45, T49, T50, T51, T52, T53 |
| AC-28 | T54 |
