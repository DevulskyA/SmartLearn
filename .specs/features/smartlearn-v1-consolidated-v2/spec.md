# SmartLearn V1 consolidated specification - V2

Status: execution proposal authored by ChatGPT at the user's request; active when the user sends the accompanying adoption instruction and goal. It supersedes conflicting earlier execution instructions for this delivery. It does not grant scientific validation to recovered heuristics or authority to historical research files.

## Observable product outcome

A medical student can sign in, organize source-grounded learning units, practise, record results, see an accurate review agenda and understandable progress, and find the same server-owned data on Web, Windows and Android. A previously synchronized device opens the last-known agenda offline. PDF-derived and AI-assisted material is attributable and explicitly accepted before becoming study material. Existing user records survive migration without silent omission or fabricated evidence.

One product, one responsive web UI, one central server authority, small native wrappers. Node 24 / Fastify 5 / better-sqlite3 / SQLite WAL remain the stack. The server operates independently of the student's computer. The fixed 16-review schedule stays in V1.

## Requirements

| ID | Requirement | Source / decision |
| --- | --- | --- |
| V1-01 | Recover the real worktree, preserve uncommitted work and build on the merged foundation | User decisions; merged baseline |
| V1-02 | One durable product/architecture/task authority, with historical material clearly classified | User decisions; context loss incidents |
| V1-03 | Tests prove the intended production path at an identified source snapshot | Wrong-target and wrong-locator incidents |
| V1-04 | Shared text rules accept valid medical Unicode and give actionable errors | User product contract |
| V1-05 | Isolated, reproducible installs/test discovery/CI and honest evidence | TLC; source audit |
| V1-06 | Real authenticated accounts and owner-scoped data, cookies and revocation | Previously requested Master Goal; detailed design here |
| V1-07 | Parameterized domain API; no client-provided SQL or owner authority | Server-central contract |
| V1-08 | Creating a learning unit optionally creates/reuses its subject and creates its schedule atomically | Protected baseline behavior |
| V1-09 | One fixed schedule definition, preserved historical dates/results and explicit date semantics | Baseline + user deferral of adaptive scheduling |
| V1-10 | Review completion and actual results remain consistent, idempotent and audit-preserving | Source behavior; integration corrections here |
| V1-11 | Current subjects, units, exercises, settings, tracking and statistics remain usable | Product continuity |
| V1-12 | Production clients share central authority; local stores are migration sources/cache only | Explicit user decision |
| V1-13 | Backup/export and fixture migration preserve complete owned data and provenance | NO_DATA_LOSS |
| V1-14 | Item-level evidence preserves observed assistance, assessment method, item version, time and identity | Recovered branch intent, corrected design |
| V1-15 | Unknown observations stay unknown; imported aggregate scores do not become invented attempts | Reconstruction decision |
| V1-16 | A proposed mastery model is versioned and disabled by default until validated; no automatic scheduler replacement | User deferral + branch audit |
| V1-17 | PDF ingestion extracts page-attributable text safely, with inspectable learning proposals | Previously requested Master Goal |
| V1-18 | AI output is validated as an attributable draft; acceptance is explicit and live-provider evidence is separate from mocks | Previously requested Master Goal + fidelity contract |
| V1-19 | Offline V1 is read-only, opens cold after a prior sync, shows lastSyncedAt and never invents server updates | Explicit user decision |
| V1-20 | Windows and Android reuse one UI, with narrowly scoped native capabilities | Explicit user decision |
| V1-21 | Reminders use the last received agenda where supported and never duplicate or silently claim delivery | User mobile requirement; operational specification here |
| V1-22 | Prioritization is explainable from evidence and due dates; activity is not represented as mastery | Pedagogical intent |
| V1-23 | Full pt-BR presentation catalog and accessible, self-explanatory workflows | User decision |
| V1-24 | Final functional, security, migration and platform validation remain distinct from deployment | TLC and permissions |

## Acceptance criteria

| ID | Given / when | Required observable result |
| --- | --- | --- |
| AC-01 | A fresh executor reads repository entrypoints | It finds the current product, source snapshot, first unfinished task and authority order without the old chat |
| AC-02 | A stale/wrong server is started for an E2E run | Target preflight fails before writing fixtures; report identifies PID/path/build identity |
| AC-03 | A new valid subject name is typed in the new-unit form and only Save is pressed | One subject or safe reuse, one unit, 16 linked reviews; no separate Add required |
| AC-04 | Any stage of that save fails | No partial subject/unit/review rows; valid draft stays available |
| AC-05 | Greek letters, superscripts and typographic punctuation are saved, edited and exported | Exact semantic text survives round trip; invalid controls get visible associated feedback |
| AC-06 | Another user's IDs are used at any route or relationship | 404/denial, zero leaked records and zero cross-owner writes, including direct database constraints |
| AC-07 | Anonymous, expired or revoked session requests domain data | 401; public health has no sensitive details |
| AC-08 | Cross-origin mutation, malformed types or repeated authentication abuse is attempted | CSRF/type/rate protections deny it without logging secrets or freezing the event loop |
| AC-09 | A unit is created with calendar date X | Its 16 due dates match the canonical offsets in all tested time zones |
| AC-10 | A review is completed with valid question counts | Completion plus exactly one aggregate REVIEW evidence row commits together; score is server-derived |
| AC-11 | A review is marked read/reviewed without doing questions | Completion is recorded; no invented score or positive mastery evidence is created |
| AC-12 | An uncertain successful write is retried with the same operation key | The original result is returned once; changed semantic payload conflicts |
| AC-13 | The same account uses two fresh clients | Changes made in one are visible in the other after refresh/sync; a failed API never triggers a second writable local authority |
| AC-14 | A valid legacy fixture is previewed/imported/retried | All supported records and relationships survive, duplicate retry adds nothing; invalid input changes nothing |
| AC-15 | A user exports a logical backup or restores a test snapshot | No auth secrets or other users' records are exported; data and source references reconcile |
| AC-16 | Assistance is missing, solution was shown, or an event is duplicated | It cannot be silently promoted to unique independent success |
| AC-17 | Conflicting later evidence or uncertain transfer metadata arrives | Evidence remains inspectable; no unconditional mastered claim or cognitive diagnosis is produced |
| AC-18 | An exercise is changed after an attempt | Historical attempt retains its item version and result context |
| AC-19 | PDF is uploaded and processed | Source checksum, page boundaries and text excerpts are traceable; invalid/encrypted/unsupported files fail with an explicit status |
| AC-20 | AI returns invalid JSON, unsupported citations or prompt-injection content | Draft is rejected/quarantined; no direct write to accepted learning material |
| AC-21 | A valid draft is accepted twice by retry | One accepted unit/exercise set is produced with versioned provenance and 16 reviews, without duplicated evidence |
| AC-22 | A previously synced client starts without network | App opens to last-known agenda with truthful sync time; all mutations are disabled or denied without an outbox |
| AC-23 | User logs out or switches account | Old private cache and native reminders are cleared; next account cannot read the previous snapshot |
| AC-24 | Windows/Android starts online and offline | Same domain data/one UI; neither Tauri nor a local broker becomes authority |
| AC-25 | A reminder is scheduled/replaced/cancelled | Stable IDs avoid duplicates; missing permission is visible and non-blocking to study; no exact delivery claim without runtime proof |
| AC-26 | UI is used by keyboard at 200% zoom and narrow viewport | Main workflows remain operable, focus/errors visible, labels meaningful and pt-BR complete |
| AC-27 | The complete product is evaluated | Software, integration, source fidelity, pedagogical claims and release operation have separate evidence-backed verdicts |
| AC-28 | Execution ends or an external dependency blocks progress | Durable state, commits/evidence and a precise next action exist; owned loop/process cleanup precedes terminal hibernation |

## Non-goals

House fusion; iOS release; advanced/adaptive interval scheduler; offline writes or command replay; automatic diagnosis of cognition; empirically unvalidated permanent mastery scores; arbitrary SQL API; multi-master storage; speculative microservices; store publication, hosting purchase, real-user migration or credential use without explicit authorization. Voice/photo and live camera are future capabilities rather than prerequisites of this V1.

## Required truths and open external dependencies

The design fixes implementation decisions inside this scope. Hosting endpoint/TLS, signing/distribution credentials, real provider credentials/data-sharing consent, physical platform availability and real-user migration are external dependencies, not blanks the executor may silently fill. They block only dependent final validation/release. Available local and fixture work continues.

## Definition of completion

Tasks T01-T54 and AC-01-AC-28 must have evidence at the candidate being judged. Required unexecuted tests are UNVERIFIED, not PASS. A fake provider proves the adapter contract only. Native build proves build only; native UAT is separate. A source citation proves traceability, not medical correctness or retention improvement. The final overall verdict is V1_VALIDATED only when all mandatory runtime gates pass; otherwise PARTIAL/BLOCKED_EXTERNAL with exact omissions.
