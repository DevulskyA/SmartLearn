# Recovered branch intent and current-state audit

## Scope and evidence level

Repository reads are pinned to the commits below. Eight remote branches were inventoried. This is an intention and contract extraction, not approval of those branches for merge. The complete historical learning-core module and its tests were read. Targeted probes ran on a byte-identical copy in Linux / Node v22.16.0; the prescribed product runtime remains Node 24. This audit does not claim to have run the Windows/Tauri application, the entire repository suite, or the user's local uncommitted work.

## Branch inventory

| Branch | Inspected head | Disposition |
| --- | --- | --- |
| main | f645a0730f6e37560de813b1610f359a57419f27 | Integrated baseline; retain |
| claude/fix-complete-review-sqlite-593426 | 23358b61135b1d24921387972b473d4844318985 | Baseline incorporated by PR #3; no reconstruction |
| claude/server-central-foundation-v1 | 215c89d991043ba44ef35e7a580980f16aebf1ce | Foundation incorporated by PR #5; reuse directly from main |
| claude/smartlearn-v1-complete | 18e903b2f297a251764b8e37a567a0fef1634664 | Active continuation; five-file E2E delta |
| claude/com-tlc-replanning-77f844 | e1dd579bc67976e34b3c6b0d3b2987052653a1a5 | Fully ancestral to main; zero exclusive commits |
| codex/pedagogy-kernel-v1 | 5ac623f52a76f3259699a0085d3e9e4abd694a64 | Recover pedagogical principles; four document changes; do not transplant old governance |
| feat/evidence-learning-core-v1 | fbfb7208169da1f66bf80ca38eaee881fbd5833e | Recover event semantics and test ideas; reconstruct on current server architecture |
| claude/server-first-v1 | fcd599eb14fc6bf1ba49c6cf7cb20928fa3d7d09 | Experimental local broker; retain as historical reference only |

Ahead/behind counts do not measure code quality and do not by themselves imply an unsafe merge. Here the decision to reconstruct follows the actual local-first contracts, unvalidated heuristics and old domain assumptions, not merely the age of a branch. Do not delete any historical branch in this assignment.

## Branch 1: pedagogical kernel - recovered intent

The four-file delta adds a pedagogical quality contract to software delivery. Its useful intention is to protect durable, transferable, medically faithful learning while keeping student administration low.

Retain, proportionally: observable performance; independence from assistance; causal explanation; retrieval when appropriate; transfer and retention as distinct observations; uncertainty about error causes; medical/source fidelity; preserving evidence history; measuring learning rather than raw activity; reversible challenger evaluation. Do not implement a separate subsystem for every pedagogical concept.

The original file labels its ADR accepted and governance permanent. Those labels do not establish current user approval. Rebuild a concise V2 contract under T02, with explicit scope and claim-proportional evidence. Software correctness, factual/source correctness and demonstrated educational benefit receive separate verdicts. Longitudinal learning evidence is required for a longitudinal learning claim, not for every UI fix. Skill/provider names are not hard runtime dependencies.

## Branch 2: evidence-learning-core - what it actually does

### Product intention

Replace the simplistic question 'Did the student get it right?' with a more informative record: 'What did the student attempt, with what assistance, at what time, and what can that observation support?'

Intended loop: source -> competency -> attempt -> evidence -> possible error explanation -> intervention -> delayed retest -> transfer -> estimated mastery. The branch deliberately leaves persistence, UI and scheduler integration for later. It is a pure-module prototype, not a working learning subsystem.

### All exported operations

| Operation | Observed behavior | Intention to retain |
| --- | --- | --- |
| createLearningEvent | Coerces and freezes fields including competency, evidence type, correctness, assistance, confidence, delay, transfer distance, timing, signals and metadata | Normalize explicit observations at a controlled boundary |
| classifyEvidenceStrength | Returns none/weak/moderate/strong using correctness, event type, help and a 24-hour delay threshold | Do not equate exposure/solution reveal with independent performance |
| inferErrorHypotheses | Builds competing hypotheses using confidence, prior success and caller-provided signals | Suggest further investigation instead of diagnosing cognition from one error |
| evaluateMastery | Requires a count of independent successes, delayed evidence, transfer/simulation, and no later unresolved confident error | Expose reasons behind an estimate rather than one opaque percentage |
| recommendNextAction | Maps the top hypothesis/event to repair, diagnose, retest, space or advance | Give a useful next learning action |

Constants contain seven assistance levels (NONE through SOLUTION), six evidence types and ten error-hypothesis classes. These are source terminology, not automatically a validated numerical scale.

### Source versus implementation

The branch's own `validation.md` is PARTIAL: nine focused tests passed; whole-repository tests/build and mutation checks were not performed there. Its `design.md` and product/governance edits retain local-first architecture. Its spec calls the evidence document canonical, conflicting with the later user correction that this document is supporting research. These changes must not overwrite current server-central contracts.

### Executable probes performed in this audit

Both source files were reconstructed from connector reads and their Git blob hashes verified before execution:
- learning-core.js: `f00bf098f7f18dc91da152b9edbadd402020edde`.
- learning-core.test.js: `6d11f71ac2fc9fe8f35f8a727aec9423b5a11b7f`.

Original tests: 9/9 passed in Linux / Node v22.16.0. Ten characterization probes also reproduced the outputs below. A reproduced output is not an endorsement. See `evidence/adversarial-results.json` and the runnable probes.

| ID | Observed result | Classification | Reconstruction decision |
| --- | --- | --- | --- |
| ELC-X01 | Omitted assistance becomes NONE; sufficient events still produce mastered=true | Missingness/authority defect for evidence-based independence | UNKNOWN remains unknown; independence requires an observation |
| ELC-X02 | The same transfer event supplied twice, with caller delayHours=48, yields two successes and mastered=true | Duplicate-event and unverifiable-delay risk | Deduplicate event/attempt IDs; derive temporal evidence from attributable records |
| ELC-X03 | Low-confidence transfer is classified strong and potentially lucky simultaneously; low-confidence histories may pass mastery | Inconsistent module contracts, including spec edge-case intent | Separate observed correctness, confidence and uncertainty; one explicit policy per claim |
| ELC-X04 | Transfer label at distance=0 is strong | Unverified transfer classification | Require reviewed task metadata before claiming transfer; unknown novelty stays unknown |
| ELC-X05 | A later wrong answer without high confidence leaves mastered=true | Limitation of the stated heuristic, not proof of a universal learning law | Surface conflicting recent evidence; avoid an irreversible mastered badge |
| ELC-X06 | String 'false' in both procedural signals is truthy and triggers a high-strength procedural hypothesis | Input type-validation defect | Strict Boolean/schema validation; reject unsupported signal types |
| ELC-X07 | Confident transfer failure ranks misconception first despite unconditional AC-005 expecting transfer_failure first | Spec/implementation mismatch under combined signals | Preserve competing hypotheses; explicitly define any tie policy instead of implying causal certainty |
| ELC-X08 | Correct exposure provides strength=none but recommends advance | Policy inconsistency needing explicit intention | Exposure alone cannot promote mastery; the next practice suggestion remains a separate decision |
| ELC-X09 | Any later strong transfer in the competency clears prior confident errors without a repair linkage | Heuristic limitation; does not prove specific misconception repair | Preserve the hypothesis and link any resolution to discriminating evidence |
| ELC-X10 | Object competency ID becomes '[object Object]'; Boolean confidence becomes 0; numeric-string help is accepted | Coercive input normalization | Typed identifiers, numbers and timestamps; no coercion into false certainty |

Additional source observations: missing timestamps use the wall clock inside the purported pure core; identity/tenant context is not represented; event IDs are optional; metadata is only shallow-frozen; policy parameters are not validated; there is no evidence-retention ageing policy. A pure module may legitimately rely on outer authentication, but a server integration must supply and test that boundary explicitly.

### What to rebuild now

1. Preserve aggregate `learning_evidence` and all historical compatibility.
2. Add attributable item-level observations only for interactions the app actually observes; imported aggregates remain aggregates.
3. Preserve assistance, item version, time, provenance and assessment method; UNKNOWN is allowed and honest.
4. Compute inspectable evidence profiles from unique, user-scoped events.
5. Use simple explanations of weak or missing evidence to suggest practice while preserving the fixed schedule.
6. Keep a reconstructed mastery/error classifier as a versioned, disabled-by-default challenger until an explicit experiment validates its claims. No 24h/0.8/0.35 threshold is promoted to a scientific constant.

### What to leave out

No direct merge, cherry-pick or migration from this branch. No local-first authority, no silent new competency mapping for old records, no mass creation of mastery scores, no learner diagnosis, no advanced scheduler, no new mandatory confidence questionnaire. Copying code is not the extraction strategy; current code and source-derived intent are inputs to a new implementation.

## Other branch: experimental server-first

`src/broker-transport.js` retries fetches, translates client SQL into broker calls, queues failed transactions in IndexedDB and flushes them later. Recover the general need for transport timeouts, safe retries, consistent backups and failure visibility. Rebuild retry only for safe GET requests or mutations with a server-side idempotency key. Do not repeat arbitrary POST writes after an uncertain result.

Reject the local Tauri-started authority, arbitrary SQL API, pending_writes and background write replay. Current main already supplies the Node/Fastify/SQLite foundation, so rebuilding the Rust broker has no priority.

## New correction: current UI evidence

The main `src/app.js` handler for `planUnitSaveBtn` already reads `newSubjectName` and calls `generateReviewTasks`, which calls `DB.learningUnits.createWithReviews`. The continuation E2E test instead clicks the separate Add button, then Save, and checks only `learningUnits.length > 0` on a seeded database. It neither tests the one-save alternative nor proves rollback/atomicity. Therefore the earlier blanket claim 'one-save is missing' is not established.

T03 must first test the existing one-save path directly. Only a reproduced failure permits a product fix. The separate Unicode restriction in `validateNamingField` remains a genuine contract mismatch; the E2E currently expects rejection and must be converted into an acceptance test for the desired behavior during its fix.

Control-character feedback was ultimately found to exist. The obsolete reports of silent rejection and content-induced page crashes must not create fresh product-fix tasks. Preserve their diagnostic history as superseded evidence.

## Planning consequence

Prioritize truthful repository entrypoints, executable tests against the actual target, then safe central data contracts. Reconstruct raw learning evidence before any mastery engine. Build the entire agreed V1 through explicit tasks, with each phase advancing automatically, rather than asking the executor to invent the next product decision.
