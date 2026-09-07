# STATE.md — SmartLearn (compact checkpoint)

> Full history: `.specs/project/STATE.md` + git log. This file = current snapshot only.

**Date:** 2026-09-05
**Governance:** TLC Strict + ECC Engineering (all sessions)

---

## CHECKPOINT — 2026-09-07 (session 6, T25 DONE — PHASE 04 IN PROGRESS)

Reconciled first, per this file's own governance: HEAD `9334410` confirmed
(matched the last checkpoint exactly), `git status --short` empty, tasks.md
T24 all `[x]`/T25 all `[ ]` confirmed by direct read before starting — no
work began on stale assumption.

BRANCH: `claude/smartlearn-v1-complete`. Working tree: clean before/after.

T25 ("Normalize supported legacy snapshots without data invention") DONE:
`shared/import-normalization.js` — pure, read-only, no I/O — normalizes the
REAL v1/v2/v3 legacy export shapes `src/db.js` already produces (not
invented shapes; golden fixtures under `server/test/import-fixtures/` are
built from the literal fixtures already committed in
`test/learning-evidence.test.js`/`test/learning-units.test.js`) into one
canonical, source-agnostic, `legacy*Id`-keyed representation. Per design.md
§6's hard-reject list, the whole import is rejected (never partial) on:
unsupported version, duplicate ids, invalid/impossible dates, cross-entity
dangling references, invalid counts, unguessable exercise provenance, and —
the acceptance criterion's own named case — a completed+scored reviewTask
with no matching evidence row. All issues in one source are collected and
reported together, not just the first. Cosmetic gaps (color/sortOrder/
timestamps) get a safe disclosed default in a `warnings` array instead of
blocking. `server/test/import-normalization.test.js`: 14/14 PASS. Full gate:
server 188/188 (was 174, +14), root 259/259 (unchanged), build PASS,
test:inventory PASS (42 files, was 41). Rust not re-run — untouched by this
task, last recorded 13/13 stands.

T25's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's T25
row for full detail. This task is deliberately read-only normalization
only — no preview, no ID mapping, no account/commit logic yet; that is
T26/T27's job, both still `[ ]` and NOT started.

NEXT_TASK: T26 — "Implement import preview and explicit ID mapping"
(depends on T25, now dependency-ready). T27 depends on T26 in turn; T28 on
T27. Per the user's own standing instruction, independent tasks with no
open dependency may continue without stopping between them — but each
still needs its own real gate run and evidence before its checkboxes flip.

BLOCKERS: none.

WORKING TREE / UNCOMMITTED FILES: none — this checkpoint plus the T25
implementation/tests/fixtures are the only changes this session, committed
together.

---

## CHECKPOINT — 2026-09-07 (session 5, PHASE 03 CLOSED)

BRANCH: `claude/smartlearn-v1-complete`. Working tree: clean before/after.

Closed the exact, single remaining gap from session 4 below (production-build
E2E) with the smallest sufficient harness: new `e2e/production-build.spec.js`
builds the real SPA (`npm run build`), spawns the real server with
`SMARTLEARN_STATIC_DIR` pointed at that build (T21's actual single-origin
production-serving path), and drives a real browser directly at that
server's own origin — no Vite dev server anywhere in the loop. One
walking-skeleton journey (register -> login -> create unit -> reload ->
persists) plus a check that the served HTML contains no `@vite/client`
(proving it's genuinely the built artifact). Confirmed stable (3 clean runs).
Full e2e re-run with it included: 31/31 PASS (30 existing + 1 new),
test:inventory PASS (41 files). Server/root/rust/build were not re-run —
nothing outside `e2e/` and docs changed this session, so their last recorded
values stand (server 174/174, root 259/259, rust 13/13, build PASS — all
already current at this HEAD, confirmed by `npm run build` itself running
clean 4 times as part of the new spec's own setup).

T24's 3 done-when boxes in tasks.md are now all `[x]`: independent verifier
PASS (session 4's HTTP/DTO-level evidence) + this production-build E2E PASS
+ full relevant code gates green. See validation.md's two T24 rows (verifier
evidence, then this gap-closure row) for full detail.

PHASE 03 EXIT GATE: SATISFIED. Phase 03 is CLOSED. T01-T24 all PROVEN
(commit + validation.md evidence row + tasks.md `[x]` each).

NEXT_TASK: T25 ("Normalize supported legacy snapshots without data
invention", Phase 04) is now the first dependency-ready task — its only
listed dependency (T24) is closed. Not started this session per explicit
instruction to close Phase 03 documentally and then stop.

BLOCKERS: none.

WORKING TREE / UNCOMMITTED FILES: none — `e2e/production-build.spec.js`
(new) plus this file and validation.md/tasks.md's T24 updates are the only
changes this session, all committed together.

---

## CHECKPOINT — 2026-09-07 (session 4, Phase 03 doc closure — STILL NOT closed, real gate gap found)

BRANCH: `claude/smartlearn-v1-complete`. HEAD: `125de99` (docs(state) checkpoint below).
Working tree: clean (`git status --short` empty) before and after this session; no
product code touched.

Phase 03: NOT closed. T24's independent Fresh Verifier subagent finished and
reported VERIFIER_RESULT=PASS against frozen HEAD `9a8c7cb` (full gate reruns
server 174/174, root 259/259, rust 13/13, build PASS, e2e 30/30,
test:inventory PASS/40 files, plus 32/32 independent HTTP ownership/isolation
checks and a full DTO field-by-field cross-check — zero defects, no fix
needed). Checked that report against T24's own done-when criteria in
tasks.md and found it does NOT fully satisfy them: criterion 3 requires
"production-build E2E" as a distinct item from the dev e2e suite and the
verifier itself. `playwright.config.js`'s only webServer config runs
`npx vite --port 5199` (the Vite DEV server) — confirmed by reading the file
directly. No production-build E2E run exists anywhere in this feature's
history (T20-T23 nor this verifier pass). Recorded this gap honestly as a
new T24 row in validation.md rather than marking T24 done on a partial
match. tasks.md T24 boxes correctly remain `[ ]`. See validation.md's T24
row for full detail.

T01-T23: PROVEN (commit + validation.md evidence row + tasks.md `[x]` each,
unchanged from prior checkpoints).
T24: OPEN — identity/ownership/parity/DTO-identity/no-local-fallback all
independently verified PASS; production-build E2E gate still missing.

NEXT_TASK (exact, still T24, NOT T25): close the production-build E2E gap —
either add a second Playwright project/config pointed at a real
`npm run build` + `vite preview` (or the server's own T21 `staticDir`
SPA-serving mode) and record its result, or make an explicit, recorded
scope decision that dev-server E2E is accepted instead — then check T24's
3 done-when boxes and add its validation.md PASS row. T25 (Phase 04,
"Normalize supported legacy snapshots without data invention") must NOT
start before T24 actually closes.

BLOCKERS: none external. The production-build E2E gate is real, well-defined,
unstarted work — not a stall and not ambiguous.

WORKING TREE / UNCOMMITTED FILES: none — this checkpoint commit is the only
change this session (this file + validation.md's new T24 row).

---

## CHECKPOINT — 2026-09-07 (session 3, Phase 03 reconciliation — NOT closed)

Reconciled directly against Git, not assumed. HEAD `9a8c7cb`
(`fix(t23): prove one-intention UX with real server fault-injection E2E`),
branch `claude/smartlearn-v1-complete`, working tree clean (`git status
--short` empty).

T23: DONE — all 3 done-when boxes checked in tasks.md, evidence row in
validation.md, committed at `9a8c7cb`. See detailed session-3 checkpoint
immediately below for what was built.

T24 ("Close the server-authoritative Web slice"): IN_PROGRESS, NOT closed.
Per this plan's own governance (STATE.md/tasks.md T24: "independent
verifier at frozen candidate"), T24 must be verified by a session/maker
independent of the one that built T20-T23 — this session cannot self-certify
it. An independent verifier subagent was launched against this exact frozen
HEAD (`9a8c7cb`) and is still running as of this checkpoint; no PASS/FAIL
has been recorded yet, tasks.md T24 done-when boxes correctly remain `[ ]`,
and no T24 row exists yet in validation.md.

PHASE 03 EXIT GATE ("acceptance coverage reviewed, relevant gates pass,
independent verification where material, and compact STATE updated"):
NOT SATISFIED — blocked on T24's independent verification completing.
Phase 03 is therefore NOT closed.

BLOCKERS: none external; T24 verification is in progress, not stalled.

NEXT_TASK: finish T24 (await/continue the independent verifier, then record
its PASS/FAIL evidence in tasks.md + validation.md + here). T25 (Phase 04,
"Normalize supported legacy snapshots without data invention") is the first
unproven Phase 04 task and the expected next task AFTER Phase 03 actually
closes — it has NOT been started and must not start before T24 closes.

---

## CHECKPOINT — 2026-09-07 (session 3, T23 closed)

Supersedes session 2 immediately below (same day). Resumed after `/clear` via
goal reconciliation: found the real T01-T54 plan lives in this worktree
(`smartlearn-v1-complete`), not the repo root `main` — confirmed by memory
pointer + `git worktree list`, not assumed.

WHERE ARE WE? HEAD `9c41004` at session start, `M src/app.js` only. Finished
T23 in this session: added Cadastro's `operationKey` wiring (`studySaveOperation`
tracker, same `createOperationKeyTracker()` pattern Plano already used —
confirmed via `remote-store.js:createWithReviews` that no server change was
needed, since it forwards the whole payload including `operationKey`
straight through). Wrote `e2e/atomic-save.spec.js` (4/4): double-click via
two concurrent real HTTP requests under the same key, response-lost-after-
commit via `route.fetch()`+`route.abort()`, mid-transaction failure via the
real UNIQUE(user_id,name) subjects constraint firing inside
`resolveOrCreateSubject`'s own `db.transaction()`, and render-failure-after-
successful-save via an aborted follow-up GET.

WHAT IS PROVEN? T23 done-when items all checked in tasks.md; evidence
recorded in validation.md. Full gate green: server 174/174, root 259/259,
rust 13/13, build PASS, e2e 30/30 (26 existing unchanged + 4 new),
test:inventory PASS (40 files, was 39).

WHAT IS NEXT? Commit this T23 work as one atomic commit. Then T24 — an
independent Fresh Verifier for the whole server-authoritative-Web slice —
explicitly MUST NOT be the same session/maker that did T23 per this file's
own governance line; a future session (or a fresh subagent) should run it,
not this one. Conductor cockpit (`conductor/tracks.md`,
`conductor/tracks/smartlearn-v1/plan.md`) updated in lockstep.

WHAT IS BLOCKED? Nothing technical. T24's Fresh Verifier independence
requirement is a process constraint, not an external blocker.

WHAT MUST NOT BE FORGOTTEN?
- GATE_P1 (DOC-01..72 document-learning priority backlog) remains explicitly
  deferred by the user — do not start it before T24.
- No push/merge/deploy this session; all work local on `claude/smartlearn-v1-complete`.

---

## CHECKPOINT — 2026-09-07 (session 2, pre-/clear)

Supersedes the "session 1" checkpoint immediately below (same day — that one
is now historical; kept, not deleted, per this file's own append convention).

WHERE ARE WE?
Worktree `C:/Projetos/SmartLearn/.claude/worktrees/smartlearn-v1-complete`, branch `claude/smartlearn-v1-complete`, HEAD `56b2c6018c285a199f1e2e5c60b2216105f9fab2` (reconciled against Git directly this session — confirmed a real, linear descendant of `bfbb82b`, 37 commits ahead, no reset performed). T01-T22 of the T01-T54 plan are PROVEN (`tasks.md` canonical checkboxes: 66/162 `[x]` = exactly T01-T22 × 3; verified by direct grep, not assumed). T23 is open, partially implemented, uncommitted — unchanged since session 1 (no new implementation happened this session; this session did status reconciliation + an external-audit pack, not product work).

WHAT IS PROVEN?
T01-T22 — same evidence as session 1 (server/root/rust/build/e2e/test:inventory counts in validation.md, unchanged). Additionally this session: `tasks.md`'s own Done-when checkboxes for T01-T22 were found drifted (`[ ]` despite PROVEN) and reconciled to `[x]` in two atomic commits (`4b16ddd` T13-T15, re-running those 3 test files live: 35/35 PASS; `56b2c60` T01-T12, evidence reused from validation.md, not re-run — see commit messages for the exact commit SHAs cited as evidence per task).

WHAT IS IN PROGRESS?
T23 (prove one-intention UX, retries and recoverable errors on server) — identical to session 1, re-confirmed via `git diff --stat`: `src/app.js` only, 33 insertions/4 deletions, unchanged. Per-save-intent `operationKey` tracker (`createOperationKeyTracker()`) wired into Plano's `planUnitSaveBtn` click handler. NOT started: Cadastro's equivalent tracker (`studyForm`/`generateReviewTasks()`); `e2e/atomic-save.spec.js`; no gate (re)run against this edit — still UNVERIFIED.

WHAT IS NEXT?
Finish T23: Cadastro operationKey wiring -> `e2e/atomic-save.spec.js` (double-click, response-lost-after-commit, mid-transaction failure, render-failure-after-successful-save) -> full gate -> validation.md evidence -> commit. Then T24 (independent Fresh Verifier for the whole server-authoritative-Web slice — must NOT be the same session/maker that did T23, per this file's own governance line). Then T25/T34/T39 all become simultaneously dependency-ready (see `02_NEXT_PHASE_INPUTS.md` in the audit pack below) — GATE_P1 (document-learning priority) is still unresolved and still explicitly deferred by the user.

WHAT IS BLOCKED?
Nothing technical. This session was explicitly told to stop before implementing T23 further and produce only this checkpoint.

WHAT MUST NOT BE FORGOTTEN?
- **Conductor cockpit created 2026-09-07** at `conductor/` (this worktree only): `conductor/tracks.md` = painel principal, `conductor/tracks/smartlearn-v1/plan.md` = checklist operacional, `conductor/workflow.md` = Bridge Contract. This file remains authority on conflict.
- **T01-T22 canonical status reconciled 2026-09-07** (commits `4b16ddd`, `56b2c60`): `tasks.md` Done-when checkboxes now correctly show `[x]` for T01-T22, matching this file and validation.md. No task ID/wording/dependency changed.
- **External audit pack produced 2026-09-07** (outside this worktree, in the session's scratchpad, not committed): `SMARTLEARN_V1_AUDIT_PACK.zip`, final SHA-256 `5183370b5c256296e456ec7e96c4c3f03a7e8bf7dee250914288c8bb38d2a352` — a full evidence snapshot (specs/design/tasks/validation/heritage/STATE/conductor + tracked source tree at HEAD + git evidence + T23 status) prepared for external review (GPT-6), not yet acted upon.
- `src/app.js` has real, wanted, uncommitted T23 work (git status: `M src/app.js`) — do not discard; finish and commit it or explicitly decide otherwise first.
- The `operationKey` renew-on-ApiError-but-not-NetworkError rule is a deliberate design decision, still NOT written into design.md/tasks.md — belongs in T23's validation.md entry when written.
- No push/merge/deploy occurred; all commits are local only, on `claude/smartlearn-v1-complete`.
- **Product-priority correction RECORDED, NOT executed**: `.specs/features/smartlearn-v1-consolidated-v2/document-learning-backlog-DOC-01-72.md` (DOC-01..DOC-72). DOC-01 audit has NOT been run. Explicitly deferred by the user. Finish T23 (and likely T24) before touching this.

---

## CHECKPOINT — 2026-09-07 (session 1, historical — superseded above, same day)

WHERE ARE WE?
Worktree `C:/Projetos/SmartLearn/.claude/worktrees/smartlearn-v1-complete`, branch `claude/smartlearn-v1-complete`, HEAD `8e933f6` (stale — session 2 advanced this to `56b2c60` via 2 status-reconciliation commits; no product code changed). T01-T22 of the T01-T54 plan are done and gated. T23 is open, partially implemented, uncommitted.

WHAT IS PROVEN?
T01-T22, each with a commit and a full green gate at commit time (server/root/rust/build/e2e/test:inventory — exact counts already in this file's T01-T22 entries below and in validation.md; not repeated here). Last full gate actually run: at T22 close (cb5762e/8e933f6) — server 174/174, root 259/259, rust 13/13, build PASS, e2e 26/26, test:inventory PASS (39 files).

WHAT IS IN PROGRESS?
T23 (prove one-intention UX, retries and recoverable errors on server). Done so far (uncommitted, in `src/app.js` only): a per-save-intent `operationKey` tracker (`createOperationKeyTracker()`) wired into Plano's `planUnitSaveBtn` click handler and forwarded to `DB.learningUnits.createWithReviews`. Renewal rule: renew on success or explicit form cancel; renew on a definitive `ApiError` (validation/conflict — an edited resubmission is a new intent); do NOT renew on `NetworkError` (unknown outcome — a retry must replay the same key so the server's existing T15 idempotency guard returns the original result instead of creating a duplicate). No server-side change was needed (T15 already supports `operationKey`). NOT started: the equivalent tracker for the Cadastro screen's `studyForm` (same `generateReviewTasks()` call, a separate intent); `e2e/atomic-save.spec.js` (not created); no gate has been (re)run against this edit — UNVERIFIED against the real server and against the existing e2e suites.

WHAT IS NEXT?
Finish T23: Cadastro operationKey wiring -> e2e/atomic-save.spec.js (double-click, response-lost-after-commit via Playwright route interception against a real server, mid-transaction failure, render-failure-after-successful-save) -> full gate -> validation.md evidence -> commit. Then T24 (closes Phase 03; independent Fresh Verifier for the whole server-authoritative-Web slice is explicitly assigned there, not before). Then T25+ (Phase 04, lossless migration tooling).

WHAT IS BLOCKED?
Nothing technical. Session is paused solely because the user explicitly asked to stop (repeatedly) mid-T23.

WHAT MUST NOT BE FORGOTTEN?
- `src/app.js` has real, wanted, uncommitted T23 work (git status: `M src/app.js`) — do not discard; either finish and commit it or explicitly decide otherwise before touching that file further.
- The `operationKey` renew-on-ApiError-but-not-NetworkError rule above is a deliberate design decision made this session and is NOT yet written anywhere else (not in design.md/tasks.md) — if T23's validation.md entry is written later, this rationale belongs there.
- No test/dev server processes were left running by this session (all manually-spawned Node/Vite instances from live-browser verification were killed).
- No push/merge/deploy occurred; all commits are local only, on `claude/smartlearn-v1-complete`.
- **Product-priority correction RECORDED, NOT executed**: `.specs/features/smartlearn-v1-consolidated-v2/document-learning-backlog-DOC-01-72.md` — a 72-item backlog (DOC-01..DOC-72) proposing to bring the document→summary→questions→active-study vertical slice forward in priority, without discarding T01-T54. Explicitly deferred by the user ("A execução vai ser depois") — DOC-01 (audit against current spec/design/heritage/tasks/acceptance) has NOT been run. Finish T23 (and likely T24) before touching this.

---

## HANDOFF — 2026-09-06 SMARTLEARN_V1_CONSOLIDATED_V2 ACTIVE

FEATURE:       smartlearn-v1-consolidated-v2 (T01-T54, AC-01..AC-28)
AUTHORITY:     .specs/features/smartlearn-v1-consolidated-v2/{spec,design,heritage,tasks,acceptance}.md
BRANCH:        claude/smartlearn-v1-complete
HEAD:          bfbb82b (pre-T01-execution checkpoint) -> advancing per task commits below
PR3:           #3 MERGED into main (931dbd9, 2026-09-06)
PR1:           #5 server-central-foundation-v1 MERGED into main (f645a07, 2026-09-06)
MAIN:          f645a0730f6e37560de813b1610f359a57419f27 (contains both merges)

STATUS: Phase 00 (T01-T06) DONE. HEAD=be7cd75.
- T01 DONE: reconciliation evidence recorded (18e903b -> e5292fa merge -> 62ea681 pack -> bfbb82b heritage).
- T02 DONE: Heritage Coverage Matrix filled with real evidence (7 PROVEN, 2 PARTIAL w/ linked GAP to T25-T28/T29-T33). STATE.md restructured.
- T03 DONE: fixed E2E harness defects (two-click flow tested instead of real single-click; length>0 instead of exact deltas). New AC-03 test proves true single-save atomic path already works: 1 click on #plan-unit-save-btn -> +1 subject, +1 unit, +16 reviews. AC-04 honestly BLOCKED_EXTERNAL (no DI seam to inject mid-write failure without touching product for test-only purpose).
- T04 DONE: fixed real product bug — NAMING_PATTERN rejected em-dash/Greek/superscripts in discipline names (AC-05 violation). Extended allowlist surgically; kept sentence-signal symbols (@#$%^`~|\) rejected. Updated 3 tests that had proven the old (non-compliant) behavior as contract.
- T05 DONE: scripts/check-test-inventory.mjs (npm run test:inventory) proves no orphan test files. .github/workflows/ci.yml created (not pushed).
- T06 DONE: found and fixed missing SIGTERM/SIGINT graceful-shutdown handler in server/src/main.js. server/test/process-smoke.test.js (4 tests): cwd-independence, occupied-port clean exit, restart-same-DB, SIGTERM (win32 limitation documented honestly).

Gates at Phase 00 close: root 231/231, server 21/21 (x3 repeat, no native crash), rust 13/13, build PASS, e2e 12/12, test:inventory PASS.

STATUS UPDATE: Phase 01 (T07-T12) DONE + independently verified. Phase 02 in progress (T13-T15 DONE). HEAD=e71756f.

- T07 DONE: /v1 strict envelope (default-deny actor, AJV strict, JSON-only errors).
- T08 DONE: users/sessions schema, synchronous=FULL.
- T09 DONE: bounded scrypt auth (N=131072, decoy-hash for unknown accounts).
- T10 DONE: sessions+CSRF+cookies, /me /logout /password.
- T11 DONE: minimal account UI (self-contained, not yet gating learning screens — real cutover is T20-T24), operator reset-token CLI.
- T12 DONE: trustProxy config, LRU-fixed rate limiter.
- **Independent Fresh Verifier round 1 (separate subagent) found a REAL exploitable defect**: login's malformed-email path called real scrypt (runDecoyHash) BEFORE any rate-limit check; /auth/register had zero rate limiting; scrypt queue had no size cap. VERIFIER_RESULT=FAIL.
- Fixed: rate-limit checked first in login/register; added register limiter; added MAX_QUEUE_LENGTH=100 backstop; fixed a real test-isolation bug (rate limiters were module singletons, now created per registerAuthRoutes() call).
- **Independent Fresh Verifier round 2 (different subagent) confirmed the fix**: traced code, reran all tests, AND built+ran a real exploit script against the actual spawned server process (571ms->12ms transition at exactly the account limit). VERIFIER_RESULT=PASS. Found one more (lower-severity, requires-auth) gap: /auth/password had no rate limit either — fixed immediately, same pattern.
- T13 DONE: learning-domain schema (subjects/learning_units/review_tasks/exercises/exercise_versions/learning_evidence/user_settings) with COMPOSITE FKs (user_id, parent_id) making cross-user linkage a database-level impossibility, verified by direct SQL injection attempts that throw real FK errors.
- T14 DONE: subjects API (list/create/rename/archive/reactivate/reorder/delete-empty), shared/text-validation.js as new single source for name rules.
- T15 DONE: atomic unit+16-reviews creation in one transaction, shared/review-schedule.js, operation-key idempotency. Found+fixed a real calendar bug (JS Date silently overflows Feb 30 to Mar 2 instead of rejecting it).
- T16 DONE (1a932d2): agenda (Intl-based local-day buckets: overdue/today/tomorrow/completedToday) + complete() (review-only vs question-based, server-derived score, one aggregate REVIEW evidence row, ALREADY_COMPLETED guard) + reopen() (never mutates prior evidence). Found a test-harness limitation (not a product bug): `Date.now` mocking does not reliably affect bare `new Date()` on this Node/V8 — fixed via an injectable `now` parameter on complete().
- T17 DONE (e29c057): exercises service (owned list/create/edit/archive/reorder) with migrations/006-exercise-archive.sql (archived_at, archive-not-delete). edit() always appends a new exercise_versions row, never mutates an existing one — a past attempt reference stays resolvable to exactly what it was scored against even after later edits/archival. provenance enum (MANUAL/SOURCE/AI_GENERATED) enforced at service layer.
- T18 DONE (16cb22a): evidence.js (direct POST accepts only INITIAL_PRACTICE/EXTERNAL, never REVIEW; server-derived score, null not zero for unknown performance; owned unit/date filters) + settings.js (timezone is the only editable field; fixed review schedule has no settings path at all — a preference edit can never imply adaptive-rescheduling consent; reads never fabricate a row). reviews.js's getUserTimezone now delegates to settings.get().
- T19 DONE (4cd5692): createLogicalExport (versioned, user-scoped, excludes credentials/sessions/other users) + createPhysicalBackup/verifyPhysicalBackup (atomic tmp-then-rename, separate-connection integrity_check + exact row-count comparison). GET /v1/export is the only HTTP surface (owned data only); whole-DB physical backup stays an operator CLI (scripts/backup.mjs), never an HTTP route, since it spans other tenants' data. SELF-CAUGHT DEFECT: creating backup.js via Write overwrote a pre-existing PR-1 `backup()` function without reading the file first, breaking test/persistence.test.js — caught by the very next full gate run, repaired per code-preservation-guard (restored original function verbatim alongside new exports). LESSON: before Write-ing a "new" file, check it doesn't already exist (Glob/git log), even under time pressure mid-loop — a confident wrong assumption about greenfield is exactly what silently destroys prior work.

Gates at this point: server 165/165, root 240/240, rust 13/13, build PASS, e2e 17/17, test:inventory PASS (35 files).

PHASE 02 (T13-T19) COMPLETE.

- T20 DONE (2c3d520): inventoried every DB.* caller (delegated to a read-only Explore subagent) before writing anything. Found a real pre-existing bug (app.js:1534 `DB.subjects.delete` never existed, silently swallowed) and two real server gaps (no learning-units list/update, no unscoped review-tasks listing) — added learning-units.list/getById/updateFields (title/source/summary only, studyDate excluded — that's design.md §4's date-correction-reschedule, out of scope) and reviews.list(). Built src/api-client.js (typed ApiError vs NetworkError) and src/remote-store.js (drop-in DB-shaped export over /v1, with DTO adapters where the new model deliberately differs — exercises flatten versioned shape, reviewTasks synthesizes reviewDone from completedAt since there are no per-task question/score columns anymore). importAll/clearAll throw NOT_YET_SUPPORTED (T22's UX decision, not faked here). db.js/BrowserStore is UNTOUCHED — actual UI cutover is T21.

Gates at this point: root 257/257, server 169/169, rust 13/13, build PASS, e2e 17/17 (unchanged), test:inventory PASS (36 files).

- T21 DONE (d860660): src/app.js now has a config-controlled REMOTE_MODE switch (window.__SMARTLEARN_REMOTE_MODE__, defaults off — db.js/BrowserStore stays the shipped default, remote-store.js is opt-in/staged) with an auth-gate (unauthenticated + remote mode -> redirect to Conta, never an empty agenda). One origin: vite dev proxy for /v1+/health, server gained an opt-in staticDir (@fastify/static, upgraded 10.1.1->10.1.3 after npm audit flagged it) for production SPA+API on one origin. Found+fixed 2 real bugs by actually driving the app in a real browser against a real server: AJV schemas rejected the `null` the UI has always sent for empty optional fields (blocked unit creation entirely); an unconditional post-init render bypassed the new auth gate. New e2e/server-authority.spec.js (5/5, REMOTE_MODE actually on): two browser contexts/same account see identical server state; different account sees nothing; data survives a real server restart; network-loss write fails loudly, no silent success. Deliberately deferred to T22: per-task score/comment/questionsDone detail panel (fails loudly, not silently, via T20's existing UNSUPPORTED_PARTIAL_UPDATE), Disciplinas/Estatisticas/Acompanhar/Configuracoes screens (basic reads work, no dedicated remote-mode E2E yet), import/reset (explicitly NOT_YET_SUPPORTED).

Gates at this point: server 173/173, root 257/257, rust 13/13, build PASS, full e2e 22/22 (17 existing unchanged + 5 new), test:inventory PASS (38 files).

- T22 DONE (cb5762e): found+fixed 3 real DTO/signature mismatches between remote-store.js and db.js's actual call shapes (subjects.create(name,color) and exercises.create(unitId,fields) both take real positional args not a merged object; server exercises.edit() needed real partial-update semantics since the UI never resends provenance) — all caught by driving the app in a real browser against a real server, not by reading code. Fixed a CSS bug where .secondary-button/.primary-button's own `display` rule silently defeated `element.hidden` on every button. Made and then REVERTED a wrong decision within the task (recorded honestly): initially redirected #register/"Cadastro" away as a supposed duplicate of Plano — live verification caught that Cadastro is the ONLY UI managing exercises, so the redirect would have made exercise management unreachable; reverted, and fixed a second real gap found in the process (Cadastro's own list never ran on plain navigation). Estatisticas/Acompanhamento/Disciplinas needed zero code changes (already compatible via T20's DTOs). Configuracoes: import/reset now show a safe explanatory state instead of a permanently-failing button; export's bookkeeping call can no longer turn a real success into a reported failure. New e2e/feature-parity.spec.js (4/4).

Gates at this point: server 174/174, root 259/259, rust 13/13, build PASS, full e2e 26/26 (22 unchanged + 4 new), test:inventory PASS (39 files).

NEXT_STEP: T23 (prove one-intention UX, retries and recoverable errors on server) — port the one-save acceptance from T03 to real server transactions: double-click, response-lost-after-commit, mid-transaction failure, render-failure-after-successful-save. Reuse operation key only for the same intent. e2e/atomic-save.spec.js. No blockers. Independent Fresh Verifier for the whole Phase 03 server-authoritative-Web slice is explicitly assigned to T24, not before.

PRESERVED_HISTORY: everything below this block (2026-09-05 and earlier) is historical PR-0/PR-1 evidence, superseded as the active plan by smartlearn-v1-consolidated-v2 per design.md §1. Do not treat it as current authority; it remains valid evidence of what the merged foundation already proved (223 client / 17 server / 13 Rust tests, PR-0 J1-J6, PR-1 gates).

SIBLING_WORKTREE_DIRTY (observed, not touched): `fix-complete-review-sqlite-593426` (PR#3 branch) has another session's uncommitted changes (.claude/loop.md, docs/research/, .specs tasks.md status edit) as of 2026-09-06. Not part of this mission; do not merge/reconcile without separate authorization.

NEXT_STEP: finish T02 (PRODUCT.md AS-IS/target doc pass), then T03 (prove one-save E2E path, fix wrong locators from prior session).

---

## HANDOFF — 2026-09-05 PR-0 BASELINE CLOSED (historical, superseded above)

FEATURE:       input-integrity-hardening-v2 (PR #3)
PHASE:         PR-0 Baseline Closure — CONCLUÍDO
BRANCH_A:      claude/fix-complete-review-sqlite-593426 @ c28af47
BRANCH_B:      claude/server-first-v1 @ fcd599e
PR3:           #3 DRAFT / open / not merged (audit code baseline)
PR4:           #4 DRAFT / open (experimental; replan-v2 = histórico de auditoria, NÃO plano canônico)

COMPLETED:
- J1 PASS — empty sandbox; unit created; subjectId linked; 16 review tasks; persisted after reload
- J2 PASS — dedup fired (unique constraint); 1 subject; double-click = 1 unit (AC-013)
- J3 PASS — QuotaExceededError; zero partial state; draft preserved; retry succeeded
- J4 PASS — filter reset after save under different subject; summary persisted
- J5 PASS — schemaVersion=99 rejected; state unchanged; valid v3 roundtrip imported
- J6 PASS — corrupt bytes identical after reload; recovery banner shown
- JS: 223/223 PASS (fresh run)
- Rust: 13/13 PASS (fresh run)
- Build: PASS 279ms (fresh run)
- DISCRIMINATION: N/A — FIXES=0
- Fresh Verifier: PASS — no material gap; 1 new P2 added (D4)
- P0/P1: 0 open
- REPORT: .specs/PR0_BASELINE_REPORT.md @ c28af47

IN_PROGRESS: NONE

NEXT_STEP: AGUARDAR plano PR-1 produzido pelo ChatGPT. Claude Code = EXECUTOR; não escolhe arquitetura, roadmap, ou próximo trabalho.

BLOCKERS:
- HUMAN_GATE: UAT Tauri Windows (app desktop real)
- HUMAN_GATE: UAT Android (device/emulador)
- HUMAN_GATE: decisões de infraestrutura PR-1 (Axum/auth/hosting/porta) — ver abaixo

DEFERRED_P2:
- D1: test/learning-units.test.js:104 — stale test name "schemaVersion 2" verifica 3
- D2: test/learning-evidence.test.js:310 — weak assertion `>= 1` (não mascara bug)
- D3: test/learning-units.test.js:329 — dead variable `callCount` nunca assertado
- D4: test/learning-evidence.test.js:537 — M2 kill test UTC-3 only; SQLite path sem _now injection; ambas implementações corretas; gap = test-integrity only

UNCOMMITTED_PRESERVED (não commitados intencionalmente):
- .claude/loop.md          (untracked — prior loop config)
- .specs/features/smartlearn-server-first-v1/tasks.md  (modified — rascunho spec broker-era; NÃO autoridade)
- src-tauri/Cargo.toml     (modified — CRLF line-ending only; sem mudança de conteúdo)

REAL_DATA_PROTECTED: no reset / seed / import / destructive migration / clean / reinstall
PLATFORMS: WEB + ANDROID + WINDOWS (WebView = runtime, not 4th platform)
JAVA_INVARIANT: JDK/Gradle toolchain only; no product Java/Kotlin without HUMAN_GATE

SERVER_CENTRAL_DECISIONS (supersede broker-era decisions; autoridade = goal aprovado 2026-09-05):
- STORAGE: SQLite + WAL mode no servidor central (processo independente, não subprocess Tauri)
- AUTHORITY: servidor central = única autoridade dos dados; não device do aluno
- WEB_PLATFORM: uma única Web/PWA responsiva; sem fork de UI por plataforma
- SHELLS: Windows e Android = shells finos da mesma aplicação (Tauri WebView aponta para servidor)
- OFFLINE_V1: leitura offline da agenda sincronizada + campo lastSyncedAt; defasagem aceita
- WRITES: criar/alterar/concluir revisão exige conexão; erro imediato se offline
- OFFLINE_WRITE: escrita offline ADIADA — sem buffer, sem queue, sem sync background
- SCHEDULER: simples/fixo agora; adaptativo/FSRS adiado
- MIGRATION: NO_DATA_LOSS — toda migration preserva dados
- INFRA_PENDING: Axum, porta, auth, hosting, deployment = decisões técnicas a validar no plano PR-1 (HUMAN_GATE)
- REPLAN_V2: .specs/replan-v2/ = histórico de auditoria (FASE A-E); NÃO autoridade do planejamento futuro

---

## PRIOR CHECKPOINT — 2026-09-04 (closed audit round; preserved for evidence)

PROJECT: SmartLearn
BRANCH: claude/fix-complete-review-sqlite-593426
HEAD_BEFORE: 753424c (fix(p0-3): validateImportContent — correctCount without questionsCount)
HEAD_AFTER: b80fc35 (fix(audit): P1-A+P2-A+P2-B closed; tracking real module, canonical schema, exercises migration)
REMOTE_PR: #3
REMOTE_HEAD_KNOWN: 585d766d56ea576c362b6c4029adfdb559cf95cc
PR_STATE: DRAFT / open / not merged
WORKTREE: clean (post commit)

PLATFORM_INVARIANT:
- WEB = navegador normal; BrowserStore/localStorage
- ANDROID = app Android real via Tauri; distribuível Google Play; SQLite
- WINDOWS = app Windows via Tauri/WebView; SQLite via plugin-sql
- PLATFORMS = WEB + ANDROID + WINDOWS
- WebView é runtime interno do Windows/Tauri, não uma quarta plataforma

JAVA_INVARIANT:
- JDK/Gradle permitido SOMENTE como toolchain Android
- nenhum código de produto em Java (domínio/UI/scheduler/analytics/persistência/learning engine)
- Java/Kotlin manual exige HUMAN_GATE
- arquivos gerados automaticamente pela toolchain são permitidos sem lógica de produto

CURRENT_OBJECTIVE: Fechar External Audit Round 2 — HUMAN_GATE atingido.

LAST_PROVEN_LOCAL_GATES:
- JS: 139/139 node:test PASS (post P0-3 kill test, 2026-09-04)
- Rust: 11/11 cargo test PASS (canonical JSON schema, 2026-09-04)
- WEB_BUILD: PASS — vite build clean (2026-09-04)
- WEB_REAL: PASS — browser: Plano→Nova aula→save→reload→persists (localStorage, 2026-09-04)
- WINDOWS_BUILD: PASS — cargo build PASS (2026-09-04)
- WINDOWS_INSTALLER: PASS — cargo tauri build → MSI + NSIS produced (2026-09-04)
- WINDOWS_REAL: PASS — NSIS installer from HEAD 74e3ee7 (2026-09-04 23:38); installed to C:\Users\Ariel\AppData\Local\SmartLearn; launched; human created unit "WINDOWS_REAL_UAT"; closed app; reopened; unit persisted — SQLite native persistence confirmed (2026-09-04)
- ANDROID_INIT: PASS — cargo tauri android init success (2026-09-04)
- ANDROID_BUILD: PASS — debug APK (app-universal-debug.apk, 608MB) + release unsigned APK (54MB) produced (2026-09-04)
- ANDROID_REAL: PASS — emulator SmartLearn_API_36; installed debug APK; DB schema verified (all vNext tables present); learning_unit inserted → force-stop → relaunch → data persists in UI (Plano screen shows "ANDROID_REAL_TEST" unit); nav verified (Hoje/Plano/Estatísticas/Acompanhar/Disciplinas — no Cadastro); migration from main schema confirmed (app_version=1.0.0 in settings, study_records→learning_units migration happened)

P1-7: TLC_RUNTIME=UNAVAILABLE (CLAUDE_SKILL_DIR="" confirmed by echo); TLC_STRUCTURAL=UNVERIFIED; DEBT.md updated (647503c)

P0_OPEN: 0

P1_OPEN: 0

P1_CLOSED (all evidence executed):
- P1-1: tracking Option C (47fd617; 16 tests + discrimination) — DONE
- P1-2: Cadastro removed from nav (e944c04); orphan handler removed (8f3c849); WEB_REAL functional proof; ANDROID_REAL confirmed no Cadastro in nav — DONE
- P1-3: Resumo Mestre real edit + Ir para revisão routing (3d358e5) — DONE
- P1-4: analytics 30-day exact windows (eb35fd2; 8 boundary tests) — DONE
- P1-5: threshold authority (eb35fd2) — DONE
- P1-6: CANONICAL_PRODUCTION_MIGRATION=PASS (104e158+8d63cc6); migration-main-to-vnext.json consumed by db.js (all migration SQL including ensureColumns) + Rust tests (load_migration_plan); kill test proven (2/11 Rust tests FAIL when JSON broken, restore→PASS); schema-statements.json also shared — DONE
- P1-7: DEBT.md corrected (647503c); TLC_RUNTIME=UNAVAILABLE documented; $CLAUDE_SKILL_DIR="" verified — DONE
- P1-8: WEB_REAL PASS; WINDOWS_BUILD+INSTALLER PASS; ANDROID_BUILD+ANDROID_REAL PASS; WINDOWS_REAL = HUMAN_GATE only

P0_CLOSED:
- P0-1: pre-migration block (eb35fd2) — DONE
- P0-2: evidence integrity (committed) — DONE
- P0-3: validateImportContent (647503c + P0-3 kill test added 2026-09-04) — DONE
- P0-4: BrowserStore seed guard (committed) — DONE

FRESH_VERIFIER: EXECUTED on HEAD b80fc35 (2026-09-04) — FINAL DELTA AUDIT
FRESH_VERIFIER_VERDICT: CONFIRMED_CLEAN — all 6 gates PASS; CONFIRMED_BUGS=0; no gaps
FRESH_VERIFIER_GATES:
- P1-A (tracking real module): PASS (import from src/tracking-state.js; no local copy; mutation killed)
- P2-A (canonical schema complete): PASS (color/is_active/sort_order subjects; algorithm review_tasks; Rust sensor PASS)
- P2-B (exercises preMigration[2] sensor): PASS (Rust test uses load_migration_plan()[2]; kill test confirmed)
- JS_139: PASS (139/139)
- Rust_13: PASS (13/13)
- WEB_BUILD: PASS

TRACKING_CANONICAL:
ATRASADO > SEM_EVIDENCIA > EM_REVISAO > EM_ESTUDO > EM_DIA
sem regra arbitrária de 7 dias

EXTERNAL_ACTIONS_NOT_AUTHORIZED: merge / deploy

MIGRATION_MAIN_TO_VNEXT: PASS (canonical JSON authority: migration-main-to-vnext.json shared by db.js production + Rust tests; kill test: break JSON → 2 Rust tests FAIL; restore → 11/11 PASS; Android runtime confirmed migration ran)
IMPORT_ROLLBACK: PASS (P0-3: importAll fail-closed test)
DISCRIMINATION: 10 mutants killed (prior session) + P0-3 kill test (correctCount field mutation)
BrowserStore_PARITY: PASS (WEB_REAL confirmed)

KNOWN_GAPS:
1. P1-3 runtime verification: routing code present; full end-to-end requires app execution (partially covered by ANDROID_REAL + WEB_REAL but not exhaustively)

REMOTE_ACTIONS_AUTHORIZED: NONE

STOP_CONDITION: WINDOWS_REAL=PASS confirmed — all gates closed; Ready for Review authorized

COMMITS:
- 585d766 (remote base)
- eb35fd2 fix(db+analytics)
- 4c4d85e test(p0-3)
- 47fd617 fix(p1-1)
- 296e9dc fix(p1-2)
- 3d358e5 fix(p1-3)
- dfce1bd test(p1-6)
- f75ce5f chore(state)
- 647503c fix(p0-3,p1-7,invariants)
- e944c04 fix(p1-2)
- 8f3c849 fix(p1-6,p1-2)
- 753424c fix(p0-3)
- 104e158 fix(p1-6): canonical migration JSON + db.js + Rust load_migration_plan
- 8d63cc6 fix(p1-6): ensureColumns hardcoded SQL replaced with migrationPlan indices
- 4f50d5f fix(audit): P1-A+P2-A+P2-B — tracking real module, canonical schema, exercises migration
- b80fc35 fix(test): rename buggy discrimination fixture (no local getTrackingState* name)
