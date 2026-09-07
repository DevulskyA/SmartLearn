# SmartLearn V1 task plan - V2

## Execution Plan

Tasks are authored here by ChatGPT. The executor may adjust local names/organization if evidence shows an equivalent safer implementation; it may not redefine product scope, evidence requirements or scientific claims. Every task includes its tests. Phases are checkpoints, not automatic global stops. Read only the current phase plus needed design sections after the initial overview.

Execution priority is the ordered task dependency graph, not a defect severity label. A documentation prerequisite is not automatically a P0 incident. Actual P0/P1 defects are classified by demonstrable impact.

The direct lane is T01 onward. Each task keeps implementation status and verification status separately. IMPLEMENTED_WITH_EXTERNAL_GATE is not PASS. A dependent task may use a proved local interface while a clearly identified live-provider or physical-device gate is pending only when that dependent work does not require the missing capability; keep the missing acceptance gate open. T38/T46/T49 may exercise the validated fake-provider contract locally while the live-provider gate stays open. T42/T43 are independent platform tasks. T44 can implement shared reminder contracts before both device tests, which remain required at final closure. T52/T53 inspect and report the entire candidate, including unresolved platform/provider gates. T54 safety checkpoint applies on any genuine terminal blocker, not just after a successful T53. If an external dependency blocks a task, record it and execute another task with satisfied dependencies; T34 onward source work and T39 onward snapshots may proceed independently of some later migration/evidence closures when their listed dependencies are met. Do not mark skipped dependencies PASS.

One material task produces a focused commit with tests and evidence. A separate verifier runs at high-risk phase closure (identity, lossless import, and final release); targeted domain reviewers may be used when they materially reduce risk. Each review runs against a frozen product tree. A docs-only later commit may reuse product evidence only after confirming its diff has no execution impact.

## Test Coverage Matrix

| Layer | Tests | Expectation | Location | Command |
| --- | --- | --- | --- | --- |
| Client/shared pure logic | node:test | Acceptance boundaries and preservation of existing test inventory | test/, shared/test/; explicit inventory | npm test |
| Server routes/services/DB | node:test + real SQLite temp files | Success, invalid input, ownership, transaction failures/retries | server/test/ | npm --prefix server test |
| Web workflows | Playwright | Actual intended controls, exact data delta, new context, real API | e2e/ | npm run test:e2e |
| Server lifecycle | child process + real HTTP | Startup, port/path errors, restart, cleanup | server/test/process-smoke.test.js | Focused node:test after file exists |
| Native bridge | Rust plus native UAT | Minimal permissions, same authority, offline/account isolation | src-tauri/ | cargo test --locked --manifest-path src-tauri/Cargo.toml |
| Build | production web + native | Actual current artifact | dist/native output | npm run build; installed Tauri CLI commands from package/toolchain |
| Data migration | golden fixtures/integration | Row values, relationships, files, failures and idempotency | server/test/ | Focused server tests, then full |
| Pedagogical claims | event fixtures + separate evaluation | No unsupported independence/transfer/mastery claim | domain tests/validation | Recorded explicit commands and evaluation protocol |

## Gate Check Commands

Known existing scripts from the inspected repository: `npm test`, `npm --prefix server test`, `npm run build`, `npm run test:e2e` on continuation. Native Rust gate: `cargo test --locked --manifest-path src-tauri/Cargo.toml`. New named test files/scripts below are prescribed deliverables; execute them only after creating them. Never claim a nonexistent command was run.

Run narrow tests during a change, relevant integration checks on a task boundary, and full required gates at phase/release closure. Use the actual installed TLC validators from the discovered skill directory, never a guessed path. Spec/tasks/completion PASS must be backed by validator output inspecting nonzero relevant items. Missing tooling is recorded explicitly.

For every task record: input/source SHA, diff/tree hash, environment, commands, exit codes, tested behaviors and residual gaps. Meaningful tests are never weakened/deleted/skipped to obtain green. Mocks do not replace a required real storage/runtime path.

## Task Breakdown

## Phase 00 - Recover context, target and trustworthy tests
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T01: Reconcile continuation and preserve existing work
**Difficulty / risk:** 2/5 / 4/5.
**Depends on:** none.
**Requirement:** V1-01. **Acceptance:** AC-01, AC-02.
**Where:** Git refs/worktrees; this execution pack; .specs/STATE.md.
**What / implementation:** Find the continuation and verify ancestry from 215c89d and the inspected main f645a07. Record dirty files and other session ownership. If safe and reviewed, merge the known main ancestry locally into the continuation using a normal merge. Preserve later descendant work. Copy this pack without reinterpretation. No historical branch transplant or remote operation.
**Tests and discriminating evidence:** Record exact before/after SHAs, file inventory and hashes of preserved dirty files. The resulting source contains the foundation plus intentional continuation changes only.
**Recovery / rollback:** Retain original refs and untouched dirty files; stop on unexpected conflicts, never reset to the old snapshot.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Git ancestry/diff inspection; no application data or app startup required.

### T02: Reconcile product authority and adopt proportionate learning principles
**Difficulty / risk:** 3/5 / 3/5.
**Depends on:** T01.
**Requirement:** V1-02, V1-16. **Acceptance:** AC-01, AC-27.
**Where:** PRODUCT.md; README.md; .specs/project/{PROJECT,INVARIANTS}.md; .specs/STATE.md; current agent entrypoints; .specs/governance/.
**What / implementation:** Write current medical/server-central identity and an AS-IS versus target distinction. Preserve invariant IDs and archive superseded local-first prohibitions with pointers. Link this plan and a short reconstructed pedagogical contract; do not copy old governance wholesale or claim empirical validation. Mark old SESSION_MEMENTO historical. STATE points to active task, not the full history.
**Heritage amendment:** Create heritage.md (Heritage Contract) and complete an initial Heritage Coverage Matrix using CURRENT repo evidence. Reconcile each historical function (subjects, learning_units, scheduler, agenda, evidence, analytics, tracking, backup) as PROVEN, GAP or SUPERSEDED. Do not implement product features merely to fill the table.
**Tests and discriminating evidence:** A fresh reader can identify Node server stack, actual remaining local-client transition, fixed schedule, read-only offline target, next task and authorization boundaries without conflicting active instructions.
**Recovery / rollback:** One documentation commit; preserve historical documents in Git and avoid unrelated skill edits.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Document link/contradiction review; TLC spec/tasks validators when available, with commands and results recorded.

### T03: Prove the existing one-save path and correct the E2E harness
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T02.
**Requirement:** V1-03, V1-08. **Acceptance:** AC-02, AC-03, AC-04.
**Where:** playwright.config.js; e2e/smartlearn-plan-flow.spec.js; e2e/helpers/; src/app.js only for a reproduced defect.
**What / implementation:** Inspect the actual planUnitSaveBtn handler before editing product. Replace fixed sleeps/loose first-Save locators with explicit intended controls and condition assertions. Test new name + title + one #plan-unit-save-btn click, without clicking the subject subform submit. Isolate browser contexts, cwd, ports, run identity and fixtures. Use exact row deltas and IDs, not count>0 on seeded data.
**Tests and discriminating evidence:** One-save works with one subject/one unit/16 linked tasks; injected save failure leaves exact pre-state. Wrong target fails preflight. A timeout looking for an absent error is not classified as a page crash. A genuine crash needs page crash/console/process evidence.
**Recovery / rollback:** Retain diagnostic traces privately; keep only stable regression tests. Product edits only after a failing acceptance test discriminates the defect.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: npm run test:e2e -- e2e/smartlearn-plan-flow.spec.js; root unit tests for any affected product path.

### T04: Unify safe Unicode validation without changing valid medical content
**Difficulty / risk:** 2/5 / 3/5.
**Depends on:** T03.
**Requirement:** V1-04. **Acceptance:** AC-05.
**Where:** src/naming-validation.js; relevant current callers/tests; shared/text-validation.js; e2e/.
**What / implementation:** Replace the Latin-centric subject allowlist with explicit type/length/control policies shared by create/update and eventually server validation. Keep NFC and purposeful whitespace normalization. Greek letters, superscripts, en/em dash and mathematical symbols remain valid. Distinguish single-line and multiline fields. Update the E2E that currently expects the known defect to expect successful exact persistence.
**Tests and discriminating evidence:** Creation, rename, save and export preserve the same valid string. Empty/overlong/control input is rejected visibly with drafts preserved. Reintroducing the old allowlist fails the new acceptance test.
**Recovery / rollback:** Revert this narrow validator/caller commit if unrelated accepted text regresses; never modify saved user text in place.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Focused text-validation unit tests, affected existing tests, and Unicode E2E; no full UI redesign.

### T05: Make all test families discoverable and establish CI
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T04.
**Requirement:** V1-05. **Acceptance:** AC-02, AC-27.
**Where:** package.json; scripts/run-unit-tests.mjs; scripts/check-test-inventory.mjs; .github/workflows/ci.yml; playwright.config.js.
**What / implementation:** Replace the top-level test/*.test.js blind spot with deterministic explicit discovery of intended client/shared unit roots, excluding server, E2E and historical evidence fixtures. Report discovered/executed file sets. Keep server tests separate. Create a CI workflow using committed locks, Node24, required platform Rust prerequisites, build and official E2E. Define any new scripts before invoking them; no deployment workflow. Pin external actions to reviewed official revisions.
**Tests and discriminating evidence:** A nested or src-located intended test is either run or explicitly mapped; there is no silent exclusion. A failing fixture test makes its CI job fail. No .only/skip hides a required criterion. CI remote result stays UNVERIFIED until an authorized push runs it.
**Recovery / rollback:** Workflow/script change only; do not remove existing tests or broad-enable install scripts.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: npm test; npm --prefix server test; npm run build; cargo test --locked --manifest-path src-tauri/Cargo.toml; npm run test:e2e.

### T06: Prove clean-install and native lifecycle stability
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T05.
**Requirement:** V1-05, V1-24. **Acceptance:** AC-07, AC-27.
**Where:** server/package.json and lock; server/src/{config,main,app,db}.js; server/test/process-smoke.test.js.
**What / implementation:** Use a clean scratch checkout/copy and approved dependency install. Pin the resolved native dependency/Node major and remove any remaining GC workaround. Test real main.js startup from different cwd, proper migration path resolution, occupied port failure, graceful shutdown and cleanup. Do not reset the accepted foundation or demand unrelated redesign.
**Tests and discriminating evidence:** Normal node:test runs repeatedly without native crash; real HTTP live/ready respond, restart retains a temporary marker and all child processes are joined. Failure to listen returns a nonzero exit and closes DB handles.
**Recovery / rollback:** Restore prior lock/manifests in scratch for diagnosis; unresolved native crash is a reproducer/blocker, not hidden by forced GC.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: npm --prefix server test; explicit real-process smoke; clean npm ci logs; regressions only for changed boundaries.

## Phase 01 - Identity and security
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T07: Create a strict domain HTTP envelope
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T06.
**Requirement:** V1-06, V1-07. **Acceptance:** AC-06, AC-07, AC-08.
**Where:** server/src/app.js; server/src/http-contract.js; server/test/http-contract.test.js.
**What / implementation:** Introduce the /v1 plugin boundary with default-deny actor resolution, strict body schemas, stable error codes and request IDs. Health remains public/minimal. Configure body limits and AJV to reject rather than strip/coerce invalid body fields. Define exact configured origin and development proxy policy.
**Tests and discriminating evidence:** Unknown fields, body.userId, wrong primitive types and unauthenticated access are rejected. API errors remain JSON and never SPA HTML. Logs omit secrets and stack/SQL details from responses.
**Recovery / rollback:** Isolated plugin can be removed without changing health or stored data.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Focused server HTTP tests plus existing server suite.

### T08: Add owned accounts and session persistence
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T07.
**Requirement:** V1-06. **Acceptance:** AC-06, AC-07.
**Where:** server/migrations/002-identity.sql; server/src/repositories/users.js; server/src/repositories/sessions.js; server/test/identity-schema.test.js.
**What / implementation:** Create users/session schema per design with unique normalized email, secret hashes, expiry/revocation and no public secret DTO. Add migration transaction/upgrade tests without editing applied migrations. Enforce foreign keys and strengthen authoritative production durability to FULL as a new scoped decision.
**Tests and discriminating evidence:** Fresh and existing foundation databases migrate idempotently; broken migration rolls back; duplicate email conflicts; session cannot reference missing user; expected WAL/FK/FULL settings are observed.
**Recovery / rollback:** Forward repair or restore a test snapshot; never remove identity data to downgrade a real database.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Identity/migration tests; existing M1-M5-style mutation checks for modified persistence behavior.

### T09: Implement bounded password authentication
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T08.
**Requirement:** V1-06. **Acceptance:** AC-07, AC-08.
**Where:** server/src/auth/passwords.js; server/src/routes/auth.js; server/test/passwords.test.js.
**What / implementation:** Implement async scrypt per design, unique salts, stored parameters and constant-time equal-length verification. Validate email/password types and lengths without altering passwords. Registration/login return safe DTOs only. Bound hash concurrency and use a constant-shape unknown-account path.
**Tests and discriminating evidence:** Same password gets different hashes; correct/wrong cases work; long Unicode passphrases survive; plaintext never reaches database/log output; overloaded hashing is rejected safely and health stays responsive.
**Recovery / rollback:** Keep hash algorithm metadata backward-readable; no destructive password conversion.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Password/route tests with production parameters verified at least once; performance tests identify runtime and load, not universal speed claims.

### T10: Implement sessions, CSRF and revocation
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T09.
**Requirement:** V1-06. **Acceptance:** AC-07, AC-08, AC-23.
**Where:** server/src/auth/{sessions,csrf}.js; server/src/routes/auth.js; server/test/session-security.test.js.
**What / implementation:** Issue opaque random tokens, store only hashes, set cookie policy by environment, bind server-generated CSRF token and exact origin checks. Implement me, logout, expiration, password change and revocation of other sessions. No wildcard credentialed CORS or client-specified actor.
**Tests and discriminating evidence:** Expiry/logout/revocation deny access; cross-origin/null-origin forged writes fail; session fixation is not accepted; tokens are absent from URLs/storage/export/logs. Clock is injected in tests.
**Recovery / rollback:** Revoke test sessions if needed; preserve users and historical domain data.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Auth integration tests; mutations bypassing actor, expiry or CSRF must fail.

### T11: Add the minimal account experience and recovery boundary
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T10.
**Requirement:** V1-06, V1-23. **Acceptance:** AC-07, AC-23, AC-26.
**Where:** src/auth-ui.js; src/i18n/index.js; src/i18n/locales/pt-BR.js; index.html; server/scripts/reset-password.mjs; e2e/auth.spec.js.
**What / implementation:** Add login/register/logout/me and password-change UI using the small presentation catalog. Keep current learning UI accessible after login. Implement a fixture-tested operator reset-token path requiring explicit operational authorization; do not claim email recovery until configured. Handle session expiry without losing an unsent local form or creating an outbox.
**Tests and discriminating evidence:** Keyboard journey registers/signs in/out; errors are understandable and contain no sensitive existence leak. UI clears old identity/caches on switch. Operator fixture token expires and is single-use.
**Recovery / rollback:** Feature toggle account UI during staged cutover; real user remains on the explicit legacy path until migration acceptance.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Auth browser E2E plus route tests; no live reset of a real account.

### T12: Enforce authentication abuse limits and security review
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T11.
**Requirement:** V1-06, V1-24. **Acceptance:** AC-06, AC-08, AC-27.
**Where:** server/src/auth/rate-limits.js; server/test/auth-abuse.test.js; active validation.md.
**What / implementation:** Implement configured per-account/IP limits, bounded memory/expiry, trusted-proxy rules and security-event redaction. A separate verifier reviews the identity phase against threat cases. Check browser, API and database boundaries rather than trusting happy-path login.
**Tests and discriminating evidence:** Repeated failures throttle and recover after expiry; spoofed forwarding headers do not evade policy; no unbounded expensive work; one user cannot retrieve another session. Reviewer evidence is recorded at the frozen SHA.
**Recovery / rollback:** Tune bounded operational limits via reviewed config; preserve required security controls.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Focused abuse tests, independent security review and full server gate.

## Phase 02 - Owned learning-domain API
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T13: Create the current owned learning-domain schema
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T12.
**Requirement:** V1-07, V1-11. **Acceptance:** AC-06, AC-09, AC-10.
**Where:** server/migrations/003-learning-domain.sql; server/test/domain-schema.test.js.
**What / implementation:** Add subjects, learning_units, review_tasks, exercises, exercise_versions, learning_evidence and per-user settings. Preserve current DTO semantics and provenance values. Enforce owner-qualified FKs, same-unit review/evidence links, positive integer counts and valid context linkage at DB and service boundaries. Keep historical evidence protected from destructive cascade.
**Tests and discriminating evidence:** Direct cross-user or cross-unit inserts fail; count/context invariants fail closed; migration preserves existing infrastructure/users and reruns safely.
**Recovery / rollback:** Additive migration; rollback tested on a copy, no real database downgrade.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: SQLite schema/integrity tests and negative direct SQL fixtures (test-only).

### T14: Implement subject management with shared normalization
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T13.
**Requirement:** V1-04, V1-07, V1-11. **Acceptance:** AC-05, AC-06.
**Where:** server/src/{routes,services}/subjects.js; server/test/subjects.test.js; shared/text-validation.js.
**What / implementation:** Implement list/create/rename/archive/reactivate/order/color and delete-empty. Use the same name key across UI/server/database uniqueness enforcement. Do not remove a subject with owned history. An archived homonym is an explicit conflict, not silent reactivation.
**Tests and discriminating evidence:** Medical Unicode round trips; two users may own same display name; one user cannot create duplicates by case/whitespace; delete-nonempty and foreign-owned ID fail without effects.
**Recovery / rollback:** Small service/route commit; no renaming of existing user data.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Subject API and Unicode contract tests; cross-user and validation mutations.

### T15: Move unit creation and fixed scheduling into one transaction
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T14.
**Requirement:** V1-08, V1-09. **Acceptance:** AC-03, AC-04, AC-09, AC-12.
**Where:** shared/review-schedule.js; src/review-schedule.js; server/src/services/learning-units.js; server/src/routes/learning-units.js; server/test/create-unit.test.js.
**What / implementation:** Extract the existing fixed schedule into one pure source and retain compatibility re-exports. Create/reuse subject, unit and exactly 16 reviews atomically using server-validated input. Add user/operation idempotency storage in an additive migration. Define date edits as correction of pending projections only, preserving completed history.
**Tests and discriminating evidence:** Correct exact due dates including leap days and timezone boundaries; injected failure after subject/unit leaves zero partial state; same operation retry adds nothing; changed payload conflicts.
**Recovery / rollback:** Keep client legacy path explicit during staging; do not recalculate all schedules.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Focused schedule/unit transaction tests; mutants removing transaction, owner scope, an offset or idempotency are killed.

### T16: Implement agenda and both review completion modes
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T15.
**Requirement:** V1-09, V1-10. **Acceptance:** AC-09, AC-10, AC-11, AC-12.
**Where:** server/src/{routes,services}/reviews.js; server/test/reviews.test.js.
**What / implementation:** Provide agenda buckets with defined local-day semantics. Complete with questions in one transaction with aggregate REVIEW evidence; complete without questions records review-only status without fake evidence. Server computes scores/timestamps. Add explicit audited correction/reopen operations where current UI requires them; generic arbitrary task field patch is forbidden.
**Tests and discriminating evidence:** Missing questions remain missing; exact q/c stored once; duplicate/conflicting completion distinguished; later correction preserves prior facts; completedToday includes review-only completion; cross-user denial and timezone tests pass.
**Recovery / rollback:** No deletion of historical evidence; disable a failing new correction path while preserving read access and prior records.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Review API, transaction, retry, date and evidence linkage tests; missing evidence/partial-write mutants killed.

### T17: Implement exercises with immutable versions and provenance
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T16.
**Requirement:** V1-11, V1-14. **Acceptance:** AC-06, AC-18.
**Where:** server/src/{routes,services}/exercises.js; server/test/exercises.test.js.
**What / implementation:** Implement owned list/create/edit/order/archive. Editing creates a new exercise version with question/answer/hint/provenance/source refs while preserving old versions. Keep MANUAL, SOURCE and AI_GENERATED distinctions. A hint is not a citation.
**Tests and discriminating evidence:** Only owner can read answers/manage exercises; an archived/edited item does not corrupt an existing attempt reference; invalid provenance is rejected; order is deterministic.
**Recovery / rollback:** Keep old item versions and use archive instead of deleting referenced items.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Exercise/version/provenance tests with direct relation checks.

### T18: Implement aggregate evidence and actual settings contracts
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T17.
**Requirement:** V1-10, V1-11. **Acceptance:** AC-06, AC-10, AC-11.
**Where:** server/src/{routes,services}/evidence.js; server/src/routes/settings.js; server/test/evidence-settings.test.js.
**What / implementation:** Direct evidence POST accepts INITIAL_PRACTICE/EXTERNAL aggregates only, with assessment source explicit. REVIEW evidence comes through completion. Expose owned unit/date filters. Settings include timezone and actual preferences while keeping fixed scheduling; never interpret account preference edits as approval for adaptive rescheduling.
**Tests and discriminating evidence:** q/c must be integers in range; REVIEW bypass fails; scores are derived; unknown performance is not zero; settings changes remain tenant scoped and leave factual evidence untouched.
**Recovery / rollback:** Additive fields/defaults with backward-compatible DTOs; preserve aggregate records.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Evidence/filter/settings API tests and REVIEW-bypass mutation.

### T19: Deliver owned logical export and server backup contracts
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T18.
**Requirement:** V1-13. **Acceptance:** AC-15.
**Where:** server/src/routes/backup.js; server/src/backup.js; server/test/backup-contract.test.js.
**What / implementation:** Produce versioned logical export of the complete owned learning domain, excluding credentials/sessions and other users. Retain consistent physical SQLite backup and validate it in a separate temporary open. Include schema metadata and source references; source-file manifest integration follows T50.
**Tests and discriminating evidence:** Logical round trip matches every supported value/relation; physical copy passes integrity check and content comparison; user A export contains no user B or auth secrets.
**Recovery / rollback:** Exports are read-only; failed backup leaves original untouched and removes only owned incomplete temporary output.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Backup/export integration tests and omission/tenant-leak discriminators.

## Phase 03 - Server-authoritative Web
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T20: Map every existing DB caller and implement RemoteStore
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T19.
**Requirement:** V1-07, V1-11, V1-12. **Acceptance:** AC-13.
**Where:** src/db.js; src/remote-store.js; src/api-client.js; test/remote-store.test.js; active impact section.
**What / implementation:** Inventory the actual DB method callers before replacement. Implement equivalent DTO behavior through domain endpoints, including explicit errors and operation keys. Avoid moving the entire monolith into a generic remote SQL tunnel. Protect safe retry and uncertain-write state; API errors never create local success.
**Tests and discriminating evidence:** A contract matrix covers every current caller; mocked transport covers mapping/error shape, real API tests cover authority. Generic SQL or owner injection has no route.
**Recovery / rollback:** Keep legacy read/export adapter reachable only through explicit migration mode, never automatic error fallback.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: RemoteStore contract tests and real-server adapter integration tests.

### T21: Connect the Web to real server-owned reads and writes
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T20.
**Requirement:** V1-12. **Acceptance:** AC-07, AC-12, AC-13.
**Where:** server/src/app.js; src/app.js screen controllers; vite.config.js; e2e/server-authority.spec.js.
**What / implementation:** Serve built SPA and API coherently under one origin. Use a dev proxy, authenticated bootstrap and explicit production remote mode. Connect the major read/write screens while staging on temporary accounts. UI login and data load errors distinguish unavailable server from empty data.
**Tests and discriminating evidence:** Two browser contexts with the same account observe exact state changes; another user sees none; server restart persists; network loss causes a clear write failure without BrowserStore fallback.
**Recovery / rollback:** Use a configuration-controlled staging path and preserved legacy data source; never silently select a different authority.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Real HTTP plus two-context E2E, server outage/401/404 assertions.

### T22: Complete screen and settings parity without losing old data
**Difficulty / risk:** 4/5 / 4/5.
**Depends on:** T21.
**Requirement:** V1-11, V1-12. **Acceptance:** AC-13, AC-15.
**Where:** src/ screen controllers; settings/import/export UI; e2e/feature-parity.spec.js.
**What / implementation:** Finish Hoje/Plano/Disciplinas/Estatisticas/Acompanhamento/Configuracoes and summary/exercise flows against RemoteStore. Identify any obsolete Cadastro route and preserve required entry behavior or redirect deliberately. Replace dangerous local reset affordances in server mode with an explicit supported owned operation or safe explanatory state. Offer legacy export until migration completes.
**Tests and discriminating evidence:** Every protected current journey has a server-mode equivalent; data previously visible locally remains recoverable; zero inaccessible core method or silent no-op. Theme preference remains compatible.
**Recovery / rollback:** Retain legacy export tooling and old source data; isolate UI rewrites by screen.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Feature-parity E2E plus affected unit/adapter tests.

### T23: Prove one-intention UX, retries and recoverable errors on server
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T22.
**Requirement:** V1-03, V1-08, V1-10. **Acceptance:** AC-03, AC-04, AC-05, AC-12.
**Where:** e2e/atomic-save.spec.js; src/api-client.js; touched forms.
**What / implementation:** Port the one-save acceptance from T03 to real server transactions. Test double-click, response-lost-after-commit, mid-transaction failure and render failure after successful save. Reuse operation key only for the same intent. Preserve drafts and show clear result without resubmitting successful work.
**Tests and discriminating evidence:** Database and UI each show exactly one intended outcome, 16 linked tasks and no orphan rows. Error focus and correction/retry are usable.
**Recovery / rollback:** Change only request/form lifecycle; keep saved data and operation ledger intact.
**Done when:**
- [x] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [x] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [x] Gate passes: Real-server fault-injection E2E; inject faults in test harness, not production debug endpoints.

### T24: Close the server-authoritative Web slice
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T23.
**Requirement:** V1-12, V1-24. **Acceptance:** AC-06, AC-07, AC-13, AC-27.
**Where:** Web slice validation; e2e/ server-backed suite.
**What / implementation:** Run an independent verification of identity, ownership, current feature parity, source-target identity and the absence of writable production local fallback. Capture real request/response and owned DB evidence. Record migration remains fixture-only until the next phase.
**Tests and discriminating evidence:** All essential Web flows run against temporary real server data from two accounts; existing client/server/Rust/build gates remain green; required contracts are mapped to tests.
**Recovery / rollback:** A slice failure opens a precise fix task; no blanket restart or premature V1 declaration.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Full relevant code gates, production-build E2E and independent verifier at frozen candidate.

## Phase 04 - Lossless migration tooling
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T25: Normalize supported legacy snapshots without data invention
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T24.
**Requirement:** V1-13, V1-15. **Acceptance:** AC-14, AC-15.
**Where:** shared/import-normalization.js; server/test/import-fixtures/; legacy export adapter.
**What / implementation:** Build versioned normalizers from actual v1/v2/v3 exported shapes, including camel/snake aliases and old source mapping where supported. Preserve timestamps, algorithm fields, summaries, exercises and aggregate evidence. Missing item-level observations remain unknown. Reject ambiguous duplicates/unsupported loss-making fields rather than skipping rows.
**Tests and discriminating evidence:** Golden synthetic fixtures cover all supported versions and edge aliases; normalization is deterministic and reports every lossy/ambiguous input. A single missing evidence row is detected.
**Recovery / rollback:** Read-only normalization; original bytes/checksum retained.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Golden fixture/unit/property-style normalization tests.

### T26: Implement import preview and explicit ID mapping
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T25.
**Requirement:** V1-13. **Acceptance:** AC-14.
**Where:** server/src/services/imports.js; server/src/routes/imports.js; server/test/import-preview.test.js.
**What / implementation:** Create source namespace/checksum, owned preview report, conflict list and proposed old->new ID mappings. Initial migration into an empty account is the supported default. Nonempty conflicts never overwrite by name. Preview expires safely and binds exact input/user/version.
**Tests and discriminating evidence:** Preview changes zero learning rows; cross-user reuse fails; record counts and relations are listed; stale/tampered preview or unknown schema is rejected.
**Recovery / rollback:** Discard only owned temporary preview records/files, not original source or account data.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Preview no-side-effect, ownership and tamper tests.

### T27: Commit imports atomically and idempotently
**Difficulty / risk:** 5/5 / 5/5.
**Depends on:** T26.
**Requirement:** V1-13. **Acceptance:** AC-12, AC-14.
**Where:** server/src/services/imports.js; server/test/import-commit.test.js.
**What / implementation:** Apply accepted mapping in one bounded tenant-scoped transaction. Preflight configured byte/row limits; reject an oversized batch before writes and report the capacity constraint. Never replace the shared multi-user database or silently split an atomic import into partial commits. Record source checksum/idempotency; verify counts, exact field values and FKs before final commit. Preserve original local data and all source snapshots.
**Tests and discriminating evidence:** Injected failure at every entity boundary rolls back; duplicate retry adds zero records; wrong-user mappings fail; deliberately removed/corrupted row is caught by reconciliation.
**Recovery / rollback:** Keep source backup, preview and mapping ledger; test restore in a temporary copy only.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Full migration integration and missing-row/wrong-link/double-import mutants.

### T28: Deliver migration UI and recovery rehearsal
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T27.
**Requirement:** V1-13, V1-24. **Acceptance:** AC-14, AC-15, AC-27.
**Where:** src/migration-ui.js; e2e/migration.spec.js; migration runbook.
**What / implementation:** Expose upload/preview/confirm/results clearly with records preserved and a downloadable report. Rehearse failure recovery and source export in isolated storage. Leave real-user migration as a named authorization gate; never count a fixture rehearsal as the real-user cutover.
**Tests and discriminating evidence:** A fresh test user migrates a representative fixture end-to-end and restores a test backup; old source remains byte-identical; live approval status is explicit.
**Recovery / rollback:** Abort without changing authority; keep readable source until separate real cutover succeeds.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Migration E2E, full owned export round trip and independent data-integrity review.

## Phase 05 - Reconstructed learning evidence
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T29: Add attributable item-level event schema
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T28.
**Requirement:** V1-14, V1-15. **Acceptance:** AC-16, AC-18.
**Where:** server/migrations/004-learning-events.sql; server/src/domain/learning-event.js; server/test/learning-events-schema.test.js.
**What / implementation:** Add the minimal competencies, exercise_attempts and immutable learning_events structures in design, referencing exercise versions. Strict event types, unknown assistance/outcome, assessment method, unique operation/sequence IDs and owner-qualified relations. Preserve aggregates without fabricating attempts or defaulting unknown help to NONE.
**Tests and discriminating evidence:** Missing help remains UNKNOWN; duplicate event/attempt does not count twice; cross-owner or wrong-version link fails; aggregates retain exact counts and remain distinguishable.
**Recovery / rollback:** Additive schema with old aggregates readable; no drop/overwrite migration.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Schema and domain input tests, duplicate/unknown/coercion adversarial fixtures.

### T30: Capture actual practice assistance and item version
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T29.
**Requirement:** V1-14. **Acceptance:** AC-16, AC-18.
**Where:** server/src/routes/attempts.js; server/src/services/attempts.js; src/practice-ui.js; e2e/practice.spec.js.
**What / implementation:** Start server-owned attempts; expose hint/solution through attributable actions; submit outcome with explicit self-report/automatic assessment method. Persist observed help and the item version used. Once a solution is revealed, that attempt cannot become independent by a later request. Confidence remains optional.
**Tests and discriminating evidence:** Concurrent/repeated submit is idempotent; reveal-then-correct stays assisted; editing an exercise leaves historical attempt content intact; missing observation stays unknown.
**Recovery / rollback:** Keep event history; disable the new practice entrypoint if needed while legacy aggregate practice remains supported.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Attempt lifecycle API/E2E; assistance-reset/version-swap mutants killed.

### T31: Reconcile item observations with aggregate results
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T30.
**Requirement:** V1-10, V1-14, V1-15. **Acceptance:** AC-10, AC-11, AC-16.
**Where:** server/src/services/review-results.js; server/test/result-reconciliation.test.js.
**What / implementation:** Link item-derived results to the review aggregate so dashboard totals do not double count. Manual external q/c remains aggregate-only. Review-only completion emits no fabricated correctness. Corrections append/revise through explicit audit links and retain original facts.
**Tests and discriminating evidence:** The same practice produces correct aggregate totals exactly once; assistance stays available to evidence views; imported/manual results do not become independent attempts.
**Recovery / rollback:** Retain original aggregates and raw events; rebuild derived views instead of deleting facts.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Reconciliation tests with mixed manual/item/imported data and correction/retry paths.

### T32: Reconstruct a transparent evidence profile
**Difficulty / risk:** 4/5 / 4/5.
**Depends on:** T31.
**Requirement:** V1-14, V1-15, V1-22. **Acceptance:** AC-16, AC-17.
**Where:** server/src/domain/evidence-profile.js; server/test/evidence-profile.test.js.
**What / implementation:** Implement pure calculations over unique owner-scoped events with explicit asOf/policyVersion. Report observed independent/assisted/unknown outcomes, time separation, reviewed transfer evidence, conflicting results and missing observations with supporting IDs. Keep confidence separate from correctness and never trust caller delayHours as history.
**Tests and discriminating evidence:** All relevant ELC-X probes have safe specified outcomes; out-of-order/duplicate events are invariant; conflicting later evidence is visible; one correct recognition is not mastery.
**Recovery / rollback:** Profiles are derived and versioned; raw events remain untouched and can be recalculated.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Pure deterministic profile tests, boundary inputs and targeted omission/type/time mutants.

### T33: Preserve an experimental challenger without promoting it
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T32.
**Requirement:** V1-16. **Acceptance:** AC-17, AC-27.
**Where:** server/src/domain/experimental/; test fixtures; pedagogical validation artifact.
**What / implementation:** Translate historical mastery/error ideas into a small versioned offline/shadow policy and fixtures only where useful. Keep feature disabled by default and no user-facing mastered label, scheduling effect or automatic diagnosis. Record hypotheses as alternatives with discriminating follow-up suggestions. Historical thresholds are explicit provisional parameters, not product law.
**Tests and discriminating evidence:** Enabling/disabling the challenger leaves schedules, evidence and public learner claims unchanged by default; replay fixtures expose thresholds and prior failure cases; pending educational validation remains pending.
**Recovery / rollback:** Remove/disable the derived challenger without affecting any stored learning fact.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Policy validation + no-effect integration test; separate pedagogical review, no invented learning-benefit PASS.

## Phase 06 - Source and AI draft pipeline
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T34: Secure private PDF upload and source ownership
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T24.
**Requirement:** V1-17. **Acceptance:** AC-06, AC-19.
**Where:** server/src/routes/sources.js; server/src/services/source-storage.js; server/migrations/005-sources.sql; server/test/uploads.test.js.
**What / implementation:** Add bounded private source upload outside web root, owner scope, random filenames, streaming size checks, file/content verification and quotas. Reject path traversal and unsupported/encrypted input clearly. State-changing multipart upload uses the same authentication/CSRF contract.
**Tests and discriminating evidence:** Wrong user cannot fetch source; fake PDF/oversize/path payload is rejected without residual accepted rows/files; duplicate source checksum handling is explicit per user.
**Recovery / rollback:** Quarantine/delete only owned incomplete staging files; retain original accepted files.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Upload security tests with synthetic fixtures, no real user documents.

### T35: Extract PDF text with page provenance under limits
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T34.
**Requirement:** V1-17. **Acceptance:** AC-19.
**Where:** server/src/pdf/extract-worker.js; server/src/services/source-extraction.js; server/test/pdf-extraction.test.js.
**What / implementation:** Pin a maintained compatible PDF.js parser; extract per-page text in a bounded child/worker. Record source checksum/parser version/page indices and diagnostics. No network or executable instructions from PDF content. Image-only/encrypted/unreadable documents get explicit statuses; no silent OCR or invented text.
**Tests and discriminating evidence:** Multi-page fixture preserves text and page mapping; malformed/resource-heavy fixtures time out safely and workers exit; extract failure leaves original source intact.
**Recovery / rollback:** Extraction is reproducible from source; discard only incomplete derived output.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Parser fixture tests plus process deadline/cleanup smoke.

### T36: Create inspectable source-to-unit proposals
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T35, T15.
**Requirement:** V1-17. **Acceptance:** AC-19, AC-21.
**Where:** server/src/services/content-proposals.js; src/source-proposals-ui.js; e2e/source-proposals.spec.js.
**What / implementation:** Chunk by source structure and page boundaries, maximum 10 pages by default. Show original excerpt/pages beside a proposed title/summary/units; allow manual correction before acceptance. Persist source-segment links independently from hint text.
**Tests and discriminating evidence:** Every proposed unit is attributable to exact source segments; user can inspect before any learning unit is created; chunk boundaries do not silently discard pages.
**Recovery / rollback:** Keep proposals separate from accepted material and retain source unchanged.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Chunk/source-link tests and inspection UI E2E.

### T37: Implement bounded AI draft generation with verified adapter contracts
**Difficulty / risk:** 5/5 / 5/5.
**Depends on:** T36.
**Requirement:** V1-18. **Acceptance:** AC-20, AC-27.
**Where:** server/src/ai/; server/src/services/generated-drafts.js; server/test/ai-drafts.test.js.
**What / implementation:** Implement deterministic fake plus one configured real-provider adapter. Validate a strict draft schema and source IDs/pages/spans. Bound request size/time/cost and require configured consent before external source transmission. Keep source instructions untrusted; provider has no tools for database/secret access. Record model/prompt versions and raw validation outcomes privately.
**Tests and discriminating evidence:** Invalid JSON/fake citations/injection/timeout are rejected or quarantined; fake fixture path passes without network; separately record whether an authorized real-provider call passed. Missing credentials never becomes a fake LIVE PASS.
**Recovery / rollback:** Disable provider capability; manual proposals and existing study remain usable.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Adapter/schema/prompt-injection tests; live integration only with explicit configured authorization and budget.

### T38: Accept generated material atomically into normal study
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T37, T17.
**Requirement:** V1-08, V1-18. **Acceptance:** AC-20, AC-21.
**Where:** server/src/services/accept-draft.js; src/draft-review-ui.js; e2e/draft-acceptance.spec.js.
**What / implementation:** Show draft provenance and uncertainty, permit inspection/edit, and accept unit/exercises/versions/source links plus 16 reviews in one idempotent transaction. Acceptance records who accepted and the draft version. It does not declare scientific or medical validation of unsupported content.
**Tests and discriminating evidence:** Repeated acceptance returns the same result; midway failure leaves no partial accepted material; citations remain resolvable; source/AI/manual provenance remain distinct.
**Recovery / rollback:** Keep original draft/source and reversible acceptance metadata; no deletion of later learner evidence.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Acceptance API/E2E and partial-write/double-acceptance mutants.

## Phase 07 - Offline PWA, wrappers and reminders
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T39: Build the versioned owned offline agenda snapshot
**Difficulty / risk:** 4/5 / 4/5.
**Depends on:** T24.
**Requirement:** V1-19. **Acceptance:** AC-22, AC-23.
**Where:** server/src/routes/agenda-snapshot.js; server/test/agenda-snapshot.test.js.
**What / implementation:** Return pending/overdue and known future agenda, minimal display records, schemaVersion/dataRevision/generatedAt/timezone. Paginate large snapshots with one consistent generation; the client swaps only a complete validated generation. No secrets or other tenant data.
**Tests and discriminating evidence:** Snapshot includes future tasks beyond today; concurrent changes cannot create a mixed incomplete generation; wrong-user access fails; last sync time reflects receipt of a valid generation.
**Recovery / rollback:** Snapshots are derived; retain last valid generation on fetch/validation failure.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Snapshot consistency/ownership/size tests.

### T40: Implement PWA shell and private cache lifecycle
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T39, T21.
**Requirement:** V1-19. **Acceptance:** AC-22, AC-23.
**Where:** public/manifest.webmanifest; src/service-worker.js; src/offline-store.js; e2e/offline.spec.js.
**What / implementation:** Cache versioned static assets and an explicit owned snapshot store. Add navigation fallback, controlled update activation and cache migration. Scope cache by trusted origin/account; logout/switch purges private data. Never cache mutation responses or authentication material generically.
**Tests and discriminating evidence:** Cold offline reopen after prior sync displays the app/agenda; corrupt or partial new cache does not replace good old snapshot; user B never sees A after switch.
**Recovery / rollback:** Keep last valid static/data generation until successful activation; do not erase legacy source data.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Browser offline/restart/update/account-switch E2E, stale generation tests.

### T41: Enforce offline read-only actions visibly and technically
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T40.
**Requirement:** V1-19. **Acceptance:** AC-22, AC-23.
**Where:** src/offline-ui.js; src/api-client.js; all mutation entrypoints; e2e/offline-writes.spec.js.
**What / implementation:** Show lastSyncedAt/stale state and preserve access to known agenda. Disable/explain authoritative actions offline, while server denial remains decisive. Failed requests preserve a form draft in memory but create no persistent outbox or fake success. Reconnect refreshes data and revalidates session.
**Tests and discriminating evidence:** Create/complete/edit/import/accept-draft offline changes zero server/cache truth and no pending_writes exists. An expired online session locks protected operations and clears stale identity as specified.
**Recovery / rollback:** Disable cache feature without changing source/server authority; keep failed drafts recoverable within the current view.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Exhaustive mutation-entrypoint offline tests and outbox/no-fallback code inspection.

### T42: Deliver the Windows wrapper using the same application
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T41.
**Requirement:** V1-20. **Acceptance:** AC-13, AC-24.
**Where:** src-tauri/ configuration/capabilities; minimal native snapshot adapter if required; Windows UAT.
**What / implementation:** Load the configured trusted application origin and remove local broker/SQL authority from the production path. Prove actual remote-WebView service-worker cold start. If needed, use the same UI build for a read-only bundled snapshot fallback with fixed scoped bridge operations. Keep legacy export behind a safe migration-only path.
**Tests and discriminating evidence:** Web and Windows share owned server state; remote content has no arbitrary SQL/filesystem/shell access; offline cold start shows last valid snapshot; precise build SHA and runtime evidence recorded.
**Recovery / rollback:** Preserve installed user data/export option; release/cutover remains authorized separately.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Rust tests/build, capability security checks and real Windows runtime UAT in isolated app data.

### T43: Deliver the Android wrapper without a second product UI
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T41.
**Requirement:** V1-20. **Acceptance:** AC-13, AC-24.
**Where:** src-tauri Android configuration/generated toolchain; shared snapshot UI; Android UAT.
**What / implementation:** Reuse the same web origin/components and narrow capability policy. Test actual emulator/device storage, authentication and cold offline start. Generated platform glue is allowed; no separate Kotlin/Java domain/scheduler/UI. If tooling/device is unavailable, record the exact gate and continue independent work.
**Tests and discriminating evidence:** Create on Web appears on Android; Android restart/offline shows owned agenda; no local authoritative SQLite/broker is needed; cross-account cache test passes.
**Recovery / rollback:** Keep prior installed data safe; do not uninstall/reset the real user app as a test shortcut.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Android build plus isolated install/runtime/offline UAT; results cannot be inferred from browser tests.

### T44: Add consent-based reminders from the synchronized agenda
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T39, T41.
**Requirement:** V1-21. **Acceptance:** AC-25.
**Where:** src/notifications.js; minimal native notification bridge; notification tests/UAT.
**What / implementation:** Use user-selected reminder preference and stable task/reminder IDs. Replace/cancel after sync and logout, handle timezone changes and declined permissions. Native offline reminders use already-received agenda; Web push needs online capability. No always-listening service or authoritative background write sync.
**Tests and discriminating evidence:** Duplicate sync does not duplicate reminders; changed schedule replaces old reminders; denied permission leaves study usable; actual delivery is tested where promised and otherwise marked unsupported/unverified.
**Recovery / rollback:** Cancel only this app/account reminders; disable reminders without affecting agenda.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Scheduling/idempotency tests and per-platform reminder UAT.

## Phase 08 - Learning experience, analytics and accessibility
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T45: Deliver explainable evidence-driven priorities and analytics
**Difficulty / risk:** 4/5 / 4/5.
**Depends on:** T32, T24.
**Requirement:** V1-22. **Acceptance:** AC-17, AC-27.
**Where:** server/src/domain/priorities.js; existing analytics/tracking adapters; src/analytics-ui.js; relevant tests.
**What / implementation:** Reuse correct analytics logic after dependency audit. Order overdue/due work predictably and expose optional weak-practice suggestions from observed recent evidence with sample sizes/reason codes. Distinguish absent evidence, self-report and independent attempts; do not double-count aggregate+item events or alter the fixed schedule.
**Heritage amendment:** Verify H-05, H-06, H-07 and H-08 from heritage.md: volume+outcome (never percentage alone when counts exist), history/schedule separation (scheduler changes never rewrite evidence), honest denominators (weighted accuracy over simple mean of session percentages), and unit-level evolution (weak/improving/declining/insufficient-evidence units identifiable).
**Tests and discriminating evidence:** Known fixture events produce exact denominators/date windows and explainable ordering; no record yields invented zero performance/mastery; cached offline priorities reflect snapshot age.
**Recovery / rollback:** Priorities/analytics are recalculable views; disable challenger scoring while keeping raw facts and baseline statistics.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Analytics/timezone/denominator tests and deterministic priority mutations.

### T46: Complete presentation internationalization
**Difficulty / risk:** 3/5 / 3/5.
**Depends on:** T38, T45.
**Requirement:** V1-23. **Acceptance:** AC-26.
**Where:** src/i18n/; index.html; theme/status/error presentation modules; test/i18n.test.js.
**What / implementation:** Move remaining user-facing strings to semantic pt-BR keys, preserving user-authored content and domain IDs/enums. Use Intl formatting for dates/numbers. Add missing-key checks and a pseudolocale test; do not promise real translations not written. Logs may remain technical; domain does not depend on presentation catalogs.
**Tests and discriminating evidence:** pt-BR screens have no missing keys; changing locale cannot change status logic, persistence or user text; long pseudolocale strings do not hide primary actions.
**Recovery / rollback:** Fallback to complete pt-BR catalog; preserve keys and old user preferences.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Catalog completeness/invariant tests and selected E2E.

### T47: Make states and actions self-explanatory
**Difficulty / risk:** 3/5 / 3/5.
**Depends on:** T46.
**Requirement:** V1-22, V1-23. **Acceptance:** AC-03, AC-26.
**Where:** status-presentation module; main screens; tooltip/help component; e2e/state-help.spec.js.
**What / implementation:** Preserve five canonical enum states and precedence. Define each visible label from actual predicates and explain the next action in plain pt-BR. Em dia means agenda current, not learned/mastered. Tooltips are supplementary and keyboard/touch accessible; key meaning is visible without hover. Keep independent subject-management actions distinct from the one-save unit flow.
**Tests and discriminating evidence:** Representative state fixtures show matching label/help/action; no ambiguous universal Pendente; keyboard/touch users can obtain help and dismiss it without losing focus.
**Recovery / rollback:** Presentation-only changes preserve enums/domain behavior.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: State/presentation contract tests and real UI interaction E2E.

### T48: Verify accessibility, responsive layout and safe rendering
**Difficulty / risk:** 3/5 / 4/5.
**Depends on:** T47.
**Requirement:** V1-23. **Acceptance:** AC-05, AC-26.
**Where:** src/styles.css; semantic markup; e2e/accessibility.spec.js.
**What / implementation:** Audit actual rendered screens at narrow/mobile/tablet/desktop and 200% zoom. Test keyboard focus, forms/errors, dialogs, contrast and long content; run axe where available plus manual/visual inspection. Ensure medical text and untrusted source content render as text/sanitized allowlisted markup, not active HTML.
**Tests and discriminating evidence:** No critical inaccessible main journey or executable injected markup; screenshots/trace are tied to current build; visible primary actions remain reachable.
**Recovery / rollback:** Local CSS/markup commits; preserve design tokens/themes and established workflows.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Accessibility/security UI tests plus visual inspections with recorded evidence.

### T49: Run representative student journeys across the complete Web product
**Difficulty / risk:** 4/5 / 4/5.
**Depends on:** T48.
**Requirement:** V1-11, V1-17, V1-18, V1-22. **Acceptance:** AC-03, AC-10, AC-13, AC-19, AC-20, AC-21, AC-27.
**Where:** e2e/student-journeys.spec.js; current validation.md.
**What / implementation:** Run source upload -> proposal/draft -> acceptance -> practice -> evidence -> review -> progress, with second browser and restart. Include manual source/aggregate fallback, failed network request and a returning student with imported data. Use source-reviewed fixtures, not invented medical correctness.
**Heritage amendment:** At least one journey must prove the modern end-to-end descendant of the original core loop (create learning unit → automatic schedule → Hoje decision → practice/review → evidence → analytics/tracking) without the student performing spreadsheet-like manual administration.
**Tests and discriminating evidence:** The student can complete the learning loop without hidden administrative steps; every saved result has the intended owner/source/history and no redundant counting. Live AI and mocks remain separately labelled.
**Recovery / rollback:** Open bounded defects against the failing journey; preserve passing neighboring behavior.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Production-build E2E and source-fidelity review, with no blanket statistical learning claim.

## Phase 09 - Operational and integrated closure
Phase entry: listed task dependencies satisfied. Phase exit: acceptance coverage reviewed, relevant gates pass, independent verification where material, and compact STATE updated. Continue immediately to the next available task.

### T50: Create operational backup and restore rehearsal for all accepted assets
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T28, T38.
**Requirement:** V1-13, V1-24. **Acceptance:** AC-15, AC-27.
**Where:** server/scripts/backup.mjs; operational runbook; server/test/operational-backup.test.js.
**What / implementation:** Package a consistent database backup and immutable accepted source files with a manifest/checksums. Restore into a separate temporary environment, verify owned logical exports and source resolution. Define retention as an explicit operational setting; no automatic deletion of real backups.
**Tests and discriminating evidence:** A fresh temporary restore can open units/questions and resolve their citations/assets; missing/corrupt source file is detected. Auth/session export handling is explicit and protected.
**Recovery / rollback:** Original environment untouched; all destructive rehearsal paths are temporary and logged.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Full backup/restore rehearsal and missing-asset/data-corruption discriminators.

### T51: Prepare deployment configuration and release permissions
**Difficulty / risk:** 4/5 / 5/5.
**Depends on:** T50, T12, T41.
**Requirement:** V1-24. **Acceptance:** AC-07, AC-08, AC-24, AC-27.
**Where:** server config; packaging scripts; .github workflow checks; deployment/security runbook.
**What / implementation:** Document one-origin HTTPS deployment, explicit host/origin/proxy trust, persistent data paths, process management, secrets injection, upload/provider budgets and ownership. Build distributable Windows/Android packages from current source. Prepare main-protection/check policy for explicit administrator approval; do not mutate repository protection or deploy without authorization.
**Tests and discriminating evidence:** A local staging launch uses production settings with no dev seed/debug endpoints. Artifacts record source/version/hash. Missing TLS/domain/signing/provider requirements are individually listed.
**Recovery / rollback:** No live deployment; retain last known release artifacts and backup/runbook.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Production-config tests, package builds and static secret/capability review.

### T52: Execute the final integrated gate matrix
**Difficulty / risk:** 5/5 / 5/5.
**Depends on:** T49, T51.
**Requirement:** V1-24. **Acceptance:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27.
**Where:** All current tests and .specs/features/smartlearn-v1-consolidated-v2/validation.md.
**What / implementation:** Freeze a candidate and run all required code/build/E2E/native/migration gates against exact source and isolated data. Re-derive AC coverage rather than summing test counts. Execute material mutation families from acceptance.md. External unavailability is explicit, never replaced with a fake pass.
**Heritage amendment:** Add Heritage Coverage Matrix (heritage.md) reconciliation to this gate. Every row must be PROVEN or explicitly SUPERSEDED. A remaining material GAP blocks V1 validation unless the current approved Product Constitution explicitly places it outside V1.
**Tests and discriminating evidence:** Each AC has test/file/command/environment/SHA/result and required platform evidence. Surviving mutants become scoped defects. Existing 223/17/13 baselines are protected by behavior/test inventory, not a forced final test count.
**Recovery / rollback:** Fix only identified defects, then rerun affected gates and closure; preserve the previous candidate and evidence.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Full gates in acceptance.md, with bounded reruns and exact environment reporting.

### T53: Obtain independent release and pedagogical-claim verification
**Difficulty / risk:** 5/5 / 5/5.
**Depends on:** T52.
**Requirement:** V1-16, V1-24. **Acceptance:** AC-17, AC-20, AC-27.
**Where:** Frozen diff/spec/tasks/tests/evidence; independent verifier output.
**What / implementation:** Assign a separate verifier the current contract, diff and evidence, not a request to rubber-stamp. Focus on tenant/auth boundaries, migration, source/AI claims, offline account isolation, native capabilities and test integrity. Verifier does not edit the implementation. Verify no empirical learning claim exceeds the available evidence.
**Tests and discriminating evidence:** Independent report lists examined ACs and refutations or PASS; a unavailable independent context is labelled fallback and does not satisfy an independent requirement. All blocking findings are closed with rerun evidence.
**Recovery / rollback:** Keep the release unapproved until material findings are resolved; disable experimental learning policy if it causes uncertainty.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Independent security/data/learning-claim review plus targeted confirmation of its findings.

### T54: Deliver an honest final checkpoint and stop this mission cleanly
**Difficulty / risk:** 2/5 / 4/5.
**Depends on:** T53.
**Requirement:** V1-24. **Acceptance:** AC-28.
**Where:** .specs/STATE.md; final validation; local checkpoints; owned process/job registry.
**What / implementation:** Record implementation, V1 validation and release status separately. Persist validated local commits and all required evidence; list any real-data/provider/runtime/admin gates. Prepare publication instructions without executing unauthorized remote changes. Cancel only this mission's loop and stop owned temporary processes. Then apply the standing user request for shutdown.exe /h as the last action if this execution is terminal and Windows permissions permit.
**Heritage amendment:** Identify in the final checkpoint any historical spreadsheet capability deliberately superseded or deferred (see heritage.md section C), so future agents do not accidentally "restore" old spreadsheet behavior.
**Tests and discriminating evidence:** New session can resume from exact SHA/task/evidence without chat; no repeated empty wait reports or phase-boundary hibernation. V1 complete is declared only when required gates passed; otherwise a precise terminal blocked checkpoint is delivered.
**Recovery / rollback:** Preserve all incomplete intentional work; no blanket cleanup, branch deletion or data reset.
**Done when:**
- [ ] The specified behavior and its negative paths are implemented or an existing implementation is proven equivalent.
- [ ] Required evidence above is recorded against the real candidate; unrelated work/data are preserved.
- [ ] Gate passes: Final handoff/diff/status verification and owned-job cleanup; hibernation success is never assumed if command fails.
