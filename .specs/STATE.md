# STATE.md — SmartLearn (compact checkpoint)

> Full history: `.specs/project/STATE.md` + git log. This file = current snapshot only.

**Date:** 2026-09-05
**Governance:** TLC Strict + ECC Engineering (all sessions)

---

## CHECKPOINT — 2026-09-07 (session 11, T35 DONE)

Continued directly from this session's T34 checkpoint. `git status
--short` empty before starting, tasks.md T34 all `[x]`/T35 all `[ ]`
confirmed.

T35 ("Extract PDF text with page provenance under limits") DONE. New
pinned dependency `pdfjs-dist@6.3.289` (Node 24-compatible `legacy`
build, text-extraction only, no canvas/rendering).
`server/src/pdf/extract-worker.js` runs in a `worker_threads` Worker
(never the main thread): no network fetch attempted (cMap/font URLs
left undefined), `isEvalSupported: false` (no PDF-embedded code ever
evaluated). `server/src/pdf/classify-extraction-error.js` maps pdf.js
exceptions to explicit statuses, unit-tested with synthetic errors
(constructing a genuinely-encrypted PDF fixture was judged
disproportionate). `server/src/services/source-extraction.js`
(`extractSource`/`listPages`) bounds the worker with a memory limit and
a deadline (`worker.terminate()` + `TIMEOUT` on expiry); a successful
extraction atomically replaces `source_pages`; any other outcome only
updates `sources.extraction_status` — the original file is never
opened for writing by any path here (verified byte-identical
before/after a failed extraction).
`server/migrations/013-source-extraction.sql` adds the extraction
columns + `source_pages` table.

Found and fixed a real bug WHILE building the test fixture (not a
product bug): `server/test/pdf-fixtures/build-fixture-pdf.js`'s
originally-narrow MediaBox silently truncated pdf.js's
`getTextContent()` output at the page's visible boundary — reproduced
directly outside the worker before concluding the fixture's page
geometry (not the extraction code) was at fault; fixed by widening it,
documented in the fixture file.

`server/test/pdf-extraction.test.js` (7/7): classifier unit tests,
real multi-page fixture with exact text/page-index/checksum/parser-
version, truncated-PDF explicit failure with original file untouched,
1ms-deadline TIMEOUT proof, idempotent re-extraction, cross-user
denial, nonexistent-source rejection. Full gate: server 282/282 (was
274, +8), root 259/259 unchanged, test:inventory PASS (53 files, was
52). Build/rust/e2e not re-run — untouched, last recorded values
stand.

T35's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T35 row for full detail.

NEXT_TASK: T36 ("Create inspectable source-to-unit proposals", depends
on T35 AND T15, both closed) —
server/src/services/content-proposals.js + src/source-proposals-ui.js +
e2e/source-proposals.spec.js. Chunk `listPages()` output by source
structure/page boundaries (max 10 pages by default per design.md §8),
show original excerpt/pages beside a proposed title/summary/units,
allow manual correction before acceptance, persist source-segment links
independently from hint text. Every proposed unit must be attributable
to exact source segments; nothing is created in the real learning
domain until explicit acceptance (that's T38's job). This task has a
real client/UI component (`src/source-proposals-ui.js` + an e2e spec),
unlike T34/T35 — expect a client build + e2e re-run this time, not a
skip.

---

## CHECKPOINT — 2026-09-07 (session 11, T34 DONE — PHASE 06 STARTED)

Fresh session reconciliation (not a continuation of session 10's live
context): `git branch --show-current` = `claude/smartlearn-v1-complete`,
`git rev-parse --short HEAD` = `e2f8c0e` (matched the expected
checkpoint exactly), `git status --short` empty, tasks.md T33 all `[x]`
confirmed, T34 all `[ ]` confirmed, server gate re-run cold and
confirmed 262/262 before touching anything — no divergence from the
prior session's recorded checkpoint.

T34 ("Secure private PDF upload and source ownership") DONE — Phase
06's first task. New pinned dependency: `@fastify/multipart@10.1.1`
(needed for real streaming size enforcement — no existing dependency
does that). `server/migrations/012-sources.sql` (renumbered from the
plan's suggested 005; next real number was 012) adds `sources`
(`UNIQUE(user_id, checksum)` for per-user dedup; `status` has no CHECK
enum yet, deliberately, since T35 will need more values than SQLite can
add to an existing CHECK). `server/src/services/source-storage.js`
(`acceptUpload`/`list`/`getById`): validates declared content-type AND
real magic bytes (`%PDF-`), heuristically rejects an apparent
`/Encrypt` trailer (explicit heuristic, not authoritative — T35's real
parse is), the on-disk filename is always a fresh random hex string
with the original filename stored only as sanitized display metadata
(never used to build a path — path traversal is structurally inert),
quota/size caps checked before any disk write, and a byte-identical
re-upload by the same user returns the existing row (explicit dedup,
with race-recovery on a genuine `SQLITE_CONSTRAINT_UNIQUE`).
`server/src/routes/sources.js` registered inside the same
authenticated/CSRF-checked `/v1` context as every other mutating route.

Caught and fixed mid-session: an authoring-tool artifact briefly wrote
literal NUL/control bytes into `source-storage.js` while I was typing a
hex-escape regex (`/[\x00-\x1F\x7F]/`) — some layer in the tool chain
interpreted the escape literally. Caught immediately via a Node
byte-level check (`buffer.includes(0)`) before any test ran, and fixed
by rewriting the sanitizer to strip control characters via codepoint
comparison instead of any hex-escape regex, avoiding the whole class of
risk. Noting this here as a reusable lesson: verify byte-level file
content after any edit involving `\x`/`\u`-style escape sequences in
this tool chain, don't just trust the Read tool's rendered output.

`server/test/uploads.test.js` (12/12): valid-PDF acceptance +
random-filename proof, fake-PDF/encrypted/oversize rejection (each with
zero-residual-row-and-file proof), path-traversal containment,
same-user dedup, cross-user non-conflict, quota enforcement, wrong-
content-type rejection, cross-user fetch denial, and 2 real-HTTP
multipart lifecycle tests. Full gate: server 274/274 (was 262, +12),
root 259/259 unchanged, build PASS, test:inventory PASS (52 files, was
51). Rust/e2e not re-run — untouched (server-only, no client/native
file touched), last recorded values stand (rust 13/13, e2e 35/35).

T34's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T34 row for full detail.

NEXT_TASK: T35 ("Extract PDF text with page provenance under limits",
depends on T34, now dependency-ready) —
server/src/pdf/extract-worker.js + server/src/services/source-
extraction.js + server/test/pdf-extraction.test.js. Pin a maintained
PDF.js/pdfjs-dist release compatible with Node 24 (a new dependency,
like T34's), extract per-page text in a bounded child/worker process
(deadline + memory bound, no network/executable content from the PDF),
record source checksum/parser version/page indices/diagnostics.
Image-only/encrypted/unreadable documents get an explicit status —
T34's `/Encrypt` heuristic becomes checkable against T35's real parse
result here. No silent OCR, no invented text, extraction failure must
leave the original source file untouched.

---

## CHECKPOINT — 2026-09-07 (session 10, T33 DONE — PHASE 05 CLOSED)

Continued directly from this session's T32 checkpoint. `git status
--short` empty before starting, tasks.md T32 all `[x]`/T33 all `[ ]`
confirmed.

T33 ("Preserve an experimental challenger without promoting it") DONE
— Phase 05's last task. `server/src/domain/experimental/mastery-
policy.js` (`evaluateChallenger`) reconstructs the historical mastery/
error-hypothesis ideas from context.md's audited Branch 2 as a small,
versioned, DISABLED-BY-DEFAULT offline/shadow policy consuming T32's
evidence-profile output only — no route/service/UI/schedule/DB-write
path exists for it anywhere. Historical thresholds (24h/0.8/0.35)
preserved as literal named constants, not re-derived or applied as a
hard gate. No label is ever "mastered"; `validated` is always false;
one independent-correct observation never reaches the strongest label
even when explicitly enabled (requires >=2, zero conflicts);
conflicting evidence always overrides any pattern label. Hypotheses
are grounded only in real schema fields (assistance, conflict, missing
observations) — no fabricated procedural/conceptual signals.

`server/test/experimental-mastery-policy.test.js` (9/9), including a
real-DB integration proof that invoking the enabled challenger changes
zero rows across review_tasks/learning_evidence/learning_events/
exercise_attempts. New `.specs/features/smartlearn-v1-consolidated-v2/
pedagogical-validation.md` records `SCIENTIFIC_LEARNING_BENEFIT:
NOT_ESTABLISHED` and a 4-step human-gated promotion path.

Full gate: server 262/262 (was 253, +9), root 259/259 unchanged,
test:inventory PASS (51 files, was 50). Build/rust/e2e not re-run —
untouched (pure domain + markdown only), last recorded values stand.

T33's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T33 row for full detail.

**PHASE 05 EXIT GATE: SATISFIED.** T29-T33 all proven (commit +
validation.md evidence row + tasks.md `[x]` each), all required gates
green, zero P0/P1 open. Phase 05 (Reconstructed learning evidence) is
CLOSED.

NEXT_TASK: Phase 06 ("Source and AI draft pipeline", T34-T38) is now
dependency-ready — T34's only listed dependency is T24, already closed
long before this phase. T34 ("Secure private PDF upload and source
ownership", depends on T24) — server/src/routes/sources.js +
server/src/services/source-storage.js +
server/migrations/0NN-sources.sql (renumber from the plan's suggested
005 — next real number is 012) + server/test/uploads.test.js. Bounded
private source upload outside web root, owner scope, random filenames,
streaming size checks, file/content verification, quotas; reject path
traversal and unsupported/encrypted input; state-changing multipart
upload uses the same auth/CSRF contract as every other mutating route
in this codebase.

---

## CHECKPOINT — 2026-09-07 (session 10, T32 DONE)

Continued directly from this session's T31 checkpoint. `git status
--short` empty before starting, tasks.md T31 all `[x]`/T32 all `[ ]`
confirmed.

T32 ("Reconstruct a transparent evidence profile") DONE. Retroactively
fixed a real gap first: `learning_events` had no `confidence` column at
all even though design.md requires it kept separate from correctness —
`server/migrations/011-event-confidence.sql` (nullable REAL, single-
column CHECK) + threaded through `normalizeLearningEvent`,
`attempts.submit()`, `review-results.correctItemEvent()`.

`server/src/domain/evidence-profile.js` (`buildEvidenceProfile`, pure,
no DB/clock access, explicit `asOf`/`policyVersion`): classifies each
event into INDEPENDENT_CORRECT/INDEPENDENT_INCORRECT/ASSISTED/UNKNOWN
(assistance dominates outcome — an assisted CORRECT is never
independent, ELC-X08; UNKNOWN never coerces to a false-certainty
bucket, ELC-X01/MX10). Corrections collapse via max-sequence-per-attempt
(re-implemented locally, pure). Conflicting independent evidence is
surfaced explicitly, never auto-resolved (ELC-X05/X09). Time separation
is computed only from real `occurredAt` timestamps — a forged
`delayHours` field on an input event has zero effect (MX12) — and no
24h/0.8/0.35 threshold is applied (those are T33's territory, if ever
promoted). Transfer evidence requires an explicit `isTransfer:true`
from already-reviewed metadata, never inferred. The profile has NO
mastery/mastered field at all, asserted directly via `Object.keys()` —
"one correct recognition is not mastery" holds structurally.

`server/test/evidence-profile.test.js` (14/14): boundary, ELC-X01/X02/
X05/X08 restaged, determinism under shuffled input, correction/retry,
no-mastery-field, confidence-independence, forged-delayHours
discriminator, transfer-tagging, asOf cutoff. Full gate: server
253/253 (was 237, +16), root 259/259 unchanged, test:inventory PASS
(50 files, was 49). Build/rust/e2e not re-run — untouched (pure domain
module only), last recorded values stand.

T32's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T32 row for full detail.

NEXT_TASK: T33 ("Preserve an experimental challenger without promoting
it", depends on T32, now dependency-ready) —
server/src/domain/experimental/ + test fixtures + a pedagogical
validation artifact. Translate the historical mastery/error heuristics
into a small versioned offline/shadow policy consuming T32's
evidence-profile output — disabled by default, no user-facing mastered
label, no schedule effect, no automatic diagnosis. Historical
thresholds (24h/0.8/0.35) are explicit provisional parameters, not
product law. This is Phase 05's last task; closing it should update
STATE/validation for the phase exit gate the same way T24/T28 did for
their phases.

---

## CHECKPOINT — 2026-09-07 (session 10, T31 DONE)

Continued directly from this session's T30 checkpoint. `git status
--short` empty before starting, tasks.md T30 all `[x]`/T31 all `[ ]`
confirmed.

T31 ("Reconcile item observations with aggregate results") DONE.
`server/migrations/010-attempt-review-link.sql` adds a plain nullable
`exercise_attempts.review_task_id` (no composite FK — SQLite can't add
one via ADD COLUMN; app-layer enforcement in `attempts.start()` instead,
same tradeoff T17 recorded for `exercises.provenance`). Client/route
wiring now threads the real review task id through so a practice
attempt is actually linked to the review it happened during.

`server/src/services/review-results.js`: `reconcile()` collapses each
attempt's events to its highest-sequence row (a correction always
outranks what it corrects, per T29's own CHECK) and returns
`reconciledTotalCount`/`reconciledCorrectCount` that is NEVER the sum
of item counts + the aggregate — items win when they exist
(`ITEMS_ONLY`/`ITEMS_OVER_AGGREGATE`), aggregate is the fallback
(`AGGREGATE_ONLY`), empty is `NONE` with null counts (no fabricated
zero, MX07). EXTERNAL/INITIAL_PRACTICE evidence has no review_task_id
at all, so it's structurally invisible here. `correctItemEvent()`
appends an audited CORRECTION event through T29's normalization
boundary; the original event stays untouched.

`server/test/result-reconciliation.test.js` (8/8) covers items-only,
aggregate-only, the discriminating "same practice counted exactly
once" case, assistance-visible-in-itemEvents, empty-review NONE,
EXTERNAL-evidence invisibility, correction/retry, and cross-user
denial. Full gate: server 237/237 (was 229, +8), root 259/259
unchanged, build PASS, test:inventory PASS (49 files, was 48),
targeted e2e re-run (practice.spec.js + feature-parity.spec.js) 5/5,
zero regressions. Rust not re-run, last recorded 13/13 stands.

T31's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T31 row for full detail.

NEXT_TASK: T32 ("Reconstruct a transparent evidence profile", depends
on T31, now dependency-ready) — server/src/domain/evidence-profile.js +
server/test/evidence-profile.test.js. Pure calculations over
unique owner-scoped learning_events with explicit asOf/policyVersion:
observed independent/assisted/unknown outcomes, time separation,
reviewed transfer evidence, conflicting results, missing observations
with supporting event IDs. Confidence stays separate from correctness;
one correct recognition is not mastery; caller-supplied delay is never
trusted as history (design.md's ELC-X01 through X10 failure catalog in
context.md is the discriminating fixture set to probe against).

---

## CHECKPOINT — 2026-09-07 (session 10, T30 DONE)

Continued directly from this same session's T29 checkpoint (no restart,
no re-read of plan history beyond T30's own tasks.md entry + AC-16/17/18
+ design.md's practice-assistance section). `git status --short` empty
before starting, tasks.md T29 all `[x]`/T30 all `[ ]` confirmed.

T30 ("Capture actual practice assistance and item version") DONE.
`server/src/services/attempts.js` + `server/src/routes/attempts.js`
(start/hint/reveal-solution/submit/getById), registered in
`server/src/app.js`. Three structural guarantees, each directly tested:
(1) `start()` pins the exercise's CURRENT version at that instant and
never re-resolves it, so a later edit (which only appends a new version,
T17) cannot retroactively change what an attempt was scored against
(AC-18); (2) `max_assistance` only ever escalates (`NONE < HINT <
PARTIAL_SOLUTION < SOLUTION`) via a shared `bumpAssistance()`, never
lowers; (3) `submit()` reads `assistanceUsed` from the attempt's own
tracked state, never from the request body — reveal-then-correct is
structurally impossible to record as independent (AC-16/AC-17).
Idempotency reuses T15/T16's `checkIdempotency`/`recordIdempotency`
pattern exactly; a keyless resubmit of a SUBMITTED attempt fails closed
(409 `ALREADY_SUBMITTED`), matching `reviews.complete()`'s contract.

Client: `src/remote-store.js` gained a REMOTE_MODE-only `attempts`
namespace; `src/app.js`'s EXISTING review-exercise reveal/judge UI (the
aggregate flow T16/T22 already accepted, not a new screen) now lazily
starts an attempt on first reveal, calls `revealSolution` at that same
moment (the "Ver resposta" action already existed), calls `useHint`
right after start when the item's hint text is present (recorded
honestly — this UI shows hints unconditionally, not gated behind their
own action, a documented scope limit not a fabricated NONE), and calls
`submit` on Acertei/Errei. Every call is best-effort/REMOTE_MODE-gated —
a failure only logs, never blocks the existing aggregate-evidence save
path (recovery/rollback: "legacy aggregate practice remains supported").

`server/test/attempts.test.js` (10/10) + `e2e/practice.spec.js` (1/1,
new — real browser: create exercise via Cadastro, reveal answer on
Hoje's real review-exercise-item, confirm over real HTTP that reveal
already recorded `maxAssistance: 'SOLUTION'` before judging, then judge
and confirm `status: 'SUBMITTED'`).

Full gate: server 229/229 (was 219, +10), root 259/259 (unchanged),
build PASS, test:inventory PASS (48 files, was 46), full `npx playwright
test` 35/35 (34 existing + 1 new, zero regressions in the touched
Cadastro/Hoje flow). Rust not re-run — untouched, last recorded 13/13
stands.

T30's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T30 row for full detail.

NEXT_TASK: T31 ("Reconcile item observations with aggregate results",
depends on T30, now dependency-ready) —
server/src/services/review-results.js — link item-derived
learning_events results to the review's aggregate learning_evidence so
dashboard totals don't double-count the same practice twice; manual
external q/c stays aggregate-only; review-only completion still emits
no fabricated correctness; corrections append/revise via the
kind='CORRECTION'/corrects_event_id pair T29 already built, retaining
original facts.

---

## CHECKPOINT — 2026-09-07 (session 10, T29 DONE — PHASE 05 STARTED)

Reconciled first: HEAD confirmed at T28's commit, `git status --short`
empty, tasks.md T28 all `[x]`/T29 all `[ ]` confirmed by direct read
before starting. `.specs/STATE.md` + tasks.md + acceptance.md AC-16/17/18
+ design.md's "Reconstructed learning evidence" section + context.md's
ELC-X01/X10/X11 findings read; rest of the plan history not reread.

BRANCH: `claude/smartlearn-v1-complete`. Working tree: clean before/after
(this checkpoint's own commit is the only change).

T29 ("Add attributable item-level event schema") DONE — Phase 05's
first task, schema-only as scoped. `server/migrations/009-learning-
events.sql` (design's suggested "004" renumbered to 009 — 004-008 already
committed, same renumbering precedent T13 recorded) adds `competencies`,
`exercise_attempts` and an immutable `learning_events` ledger, all on the
established composite `(user_id, parent_id)` FK pattern. Two structural
invariants enforced at the DB level: `UNIQUE(user_id, attempt_id,
sequence)` (attempt/sequence idempotency — MX11, a replayed duplicate
event is rejected, not just de-duplicated in app code) and a two-way
CHECK pairing `kind='CORRECTION'` with a non-null `corrects_event_id`
(T31's audit-append contract). `assistance_available`/`assistance_used`
both default `'UNKNOWN'`, never `'NONE'` (MX10 — the concrete fault this
schema exists to make structurally impossible); `exercise_attempts.
max_assistance` deliberately defaults `'NONE'` instead, recorded as an
intentional asymmetry since the app fully observes every attempt it
starts itself. `server/src/domain/learning-event.js`
(`normalizeLearningEvent`, pure, explicit `now` input) is the T30
insert-time validation boundary: rejects unknown enums and non-integer
coercion attempts (numeric-string sequence, object competencyId — see
ELC-X10). `server/test/learning-events-schema.test.js` (11/11) covers
table creation, the NONE-vs-UNKNOWN asymmetry, duplicate-sequence
rejection, the CORRECTION pairing CHECK both directions plus
original-row-untouched proof, cross-user composite-FK rejection, and the
domain module's own adversarial fixtures.

Full gate: server 219/219 (was 208, +11), root 259/259 (unchanged,
server-only change), test:inventory PASS (46 files, was 45). Build/
rust/e2e not re-run — untouched by this task, last recorded values
stand (build PASS, rust 13/13, e2e 34/34).

T29's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T29 row for full detail.

NEXT_TASK: T30 ("Capture actual practice assistance and item version",
depends on T29, now dependency-ready) — server/src/routes/attempts.js +
server/src/services/attempts.js + src/practice-ui.js +
e2e/practice.spec.js. Server-owned attempt lifecycle: start attempt,
expose hint/solution as attributable actions (each bumping
exercise_attempts.max_assistance), submit outcome via
normalizeLearningEvent + INSERT into learning_events. Reveal-then-correct
must stay assisted permanently once a solution is shown; concurrent/
repeated submit must be idempotent via the (attempt_id, sequence)
constraint just built.

---

## CHECKPOINT — 2026-09-07 (session 9, T28 DONE — PHASE 04 CLOSED)

Reconciled first: HEAD confirmed at T27's commit, `git status --short` empty,
tasks.md T27 all `[x]`/T28 all `[ ]` confirmed by direct read before
starting.

BRANCH: `claude/smartlearn-v1-complete`. Working tree: clean before/after
(this checkpoint's own commits are the only changes).

T28 ("Deliver migration UI and recovery rehearsal") DONE — Phase 04's
last task. `src/migration-ui.js` (pure, DOM-free API layer, mirrors
`src/auth-ui.js`) + a new REMOTE_MODE-only "Importar de um backup
antigo" card on Configurações (`index.html`/`src/app.js`) drive the real
T25-T27 pipeline end to end: select file -> preview (counts/warnings/
conflicts, confirm disabled while unresolved) -> confirm behind a real
dialog -> commit -> result panel + downloadable JSON report.
`e2e/migration.spec.js` (3/3): full happy path with a genuine owned
export round trip proof (real HTTP fetch to `/v1/export` over the
session, not client-side rendering) plus a byte-identical source-file
check; cancelled-preview rehearsal (zero rows, account still
migratable after); name-conflict rehearsal (confirm blocked, nothing
committed). `.specs/features/smartlearn-v1-consolidated-v2/
migration-runbook.md` records the whole pipeline and an explicit
`HUMAN_GATE: REAL_USER_MIGRATION_APPROVAL` — "Live approval status: NOT
GRANTED" — per the task's own instruction that no fixture rehearsal
(every e2e run uses a synthetic test account) counts as that
authorization.

Independent data-integrity review (T28's own required gate, matching
this project's T24 fresh-verifier pattern) ran two rounds. Round 1 (a
subagent with zero context from the build) found 2 real bugs in
`server/src/services/imports.js`, both NO_DATA_LOSS-safe (clean
rollback in both cases) but real contract breaks: (a) `commitImport`
checked preview expiry before its own `committed_at` cached-result
short-circuit, so retrying an already-succeeded commit after the
original 30-minute window elapsed wrongly threw `PREVIEW_EXPIRED`
instead of returning the original result (breaks AC-12's
idempotent-retry guarantee for a lost-response-after-real-success
retry); (b) preview-time conflict detection was scoped to
`is_active = 1`, so a name colliding with an ARCHIVED subject was
invisible at preview time and only surfaced as an unclassified 500 at
commit time. Both fixed (reordered the check; dropped the `is_active`
filter and added an `ARCHIVED_HOMONYM` reason, mirroring
`subjects.js`'s own archived-homonym handling), with 2 new
discriminating tests. Round 2 (a second, independent subagent)
confirmed both fixes correct and complete, reasoned through several
edge cases, found zero remaining defects: `VERIFIER_RESULT=PASS`.

Full gate after fixes: server 208/208 (was 195 pre-T27), root 259/259,
build PASS, test:inventory PASS (45 files), full e2e suite 34/34 (31
existing + 3 new migration tests), no regressions. Rust not re-run —
untouched, last recorded 13/13 stands.

T28's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T28 row for full detail.

**PHASE 04 EXIT GATE: SATISFIED.** T25-T28 all proven (commit +
validation.md evidence row + tasks.md `[x]` each), all required gates
green, zero P0/P1 open, evidence recorded in validation.md/this file.
Phase 04 (Lossless migration tooling) is CLOSED.

NEXT_TASK: Phase 05 ("Reconstructed learning evidence", T29-T33) is now
dependency-ready (T24 was its only listed dependency, already closed).
Not started this session.

BLOCKERS: none.

WORKING TREE / UNCOMMITTED FILES: none — 2 commits this session: (1) a
`fix(t27)` for the independent review's 2 confirmed bugs, since
imports.js was already-committed T27 code, not new T28 work; (2)
`feat(t28)` for the migration UI/e2e/runbook itself, plus this
checkpoint and the tasks.md/validation.md/conductor updates.

---

## CHECKPOINT — 2026-09-07 (session 8, T27 DONE)

Reconciled first: HEAD `2664d40` confirmed, `git status --short` empty,
tasks.md T26 all `[x]`/T27 all `[ ]` confirmed by direct read before
starting.

BRANCH: `claude/smartlearn-v1-complete`. Working tree: clean before/after.

T27 ("Commit imports atomically and idempotently") DONE — the
highest-risk task in the plan (5/5 difficulty AND risk), first task that
actually writes imported data into a real account. `commitImport()` added
to `server/src/services/imports.js` + `server/migrations/008-import-commit.sql`
(`import_previews.committed_at`/`commit_result_json`) + `POST
/v1/imports/:id/commit`. Idempotency is bound to the previewId itself
(already 1:1 to one checksum-verified source via T26) rather than an
optional client operationKey — re-committing the same previewId always
returns the original result, zero new rows, no client cooperation
required. Unresolved name conflicts (T26's `NAME_ALREADY_EXISTS`) refuse
the whole commit (409) rather than silently overwriting — conflict
resolution is explicitly T28's job. Row/byte capacity preflight runs
before any write. The apply itself is one `db.transaction()` across all
5 entity types with per-legacy-id reference resolution through freshly
built id maps; an unresolvable reference throws inside the transaction
(atomic rollback), and a final reconciliation pass re-checks every
entity's inserted count against the preview's own reported counts before
letting the transaction return. `offset_days` for migrated review_tasks
is recomputed (UTC calendar-day diff between unit studyDate and task
dueDate) since T25's normalized shape doesn't carry it.
`server/test/import-commit.test.js`: 11/11 — happy path, duplicate-commit
no-op, cross-user 404, conflict refusal, oversized-batch rejection, 4
independent corrupted-reference rollback tests (one per entity boundary:
unit->subject, reviewTask->unit, exercise->unit, evidence->reviewTask),
1 reconciliation-mismatch test, 1 expired-preview test. Full gate: server
206/206 (was 195, +11), root 259/259 (unchanged), build PASS,
test:inventory PASS (44 files, was 43). Rust/e2e not re-run — untouched
by this server-only task, last recorded values stand (rust 13/13, e2e
31/31).

T27's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's
T27 row for full detail, including the idempotency-mechanism design
decision (checksum-bound previewId identity, not operationKey) recorded
there since design.md leaves the exact mechanism open.

NEXT_TASK: T28 — "Deliver migration UI and recovery rehearsal" (depends
on T27, now dependency-ready). This is Phase 04's last task — closing it
closes the phase. Not started this session.

BLOCKERS: none.

WORKING TREE / UNCOMMITTED FILES: none — this checkpoint plus the T27
implementation/tests/migration are the only changes this session,
committed together.

---

## CHECKPOINT — 2026-09-07 (session 7, T26 DONE)

Reconciled first: HEAD `620fcb4` confirmed, `git status --short` empty,
tasks.md T25 all `[x]`/T26 all `[ ]` confirmed by direct read.

BRANCH: `claude/smartlearn-v1-complete`. Working tree: clean before/after.

T26 ("Implement import preview and explicit ID mapping") DONE: new
`server/migrations/007-import-previews.sql` (`import_previews`,
`UNIQUE(user_id, source_checksum)`) + `server/src/services/imports.js` +
`server/src/routes/imports.js` (`POST /v1/imports/preview`,
`GET /v1/imports/:id`), wired into app.js. Runs T25's
`normalizeLegacyExport()` first (invalid source -> 400, zero preview rows
created); computes a real SHA-256 checksum of the exact bytes received;
reports counts/warnings/conflicts/proposed mapping scoped to the owner,
expiring in 30 minutes. A legacy subject name colliding with an existing
ACTIVE owned subject (the only real uniqueness constraint in this schema,
T13) is a `NAME_ALREADY_EXISTS` conflict, never silently mapped to CREATE.
Cross-user reuse fails (404, same pattern as subjects.js's foreign-id
handling). Stale (expired, 30 min) and tampered (bytes changed since
preview) reads are rejected via an injectable-clock `getPreview()`/
`verifyPreview()`, tested directly at the service level with a fixed
clock. `server/test/import-preview.test.js`: 7/7. Full gate: server
195/195 (was 188, +7), root 259/259 (unchanged), build PASS,
test:inventory PASS (43 files, was 42). Rust not re-run — untouched, last
13/13 stands.

T26's 3 done-when boxes are all `[x]` in tasks.md. See validation.md's T26
row for full detail, including the explicit scoping decision that
"proposed mapping" at preview time is a CREATE/CONFLICT plan keyed by
legacyId, not a fabricated final row id (real ids only exist after an
actual commit transaction, which is T27's job, not built).

NEXT_TASK: T27 — "Commit imports atomically and idempotently" (depends on
T26, now dependency-ready). T27 is the highest-risk task in this phase
(5/5 difficulty AND risk) — it's the first task that actually WRITES
imported data into a real account, so it needs particular care around
NO_DATA_LOSS, injected-failure rollback at every entity boundary, and
capacity limits, per its own done-when criteria. Not started this session.

BLOCKERS: none.

WORKING TREE / UNCOMMITTED FILES: none — this checkpoint plus the T26
implementation/tests/migration are the only changes this session,
committed together.

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
