# SmartLearn V1 implementation decisions - V2

**ARCH-01 (2026-09-11, canonical, externally decided):** §5's "Production clients share central authority; local stores are migration sources/cache only" is SUPERSEDED for Desktop — Windows/Tauri becomes the complete local-first product (material stays local, no requirement to upload full PDFs to the cloud), while the Companion Web/PWA stays a deliberately smaller, read-only surface built against this same server. Full decision text lives in `.specs/STATE.md`'s "ARCHITECTURE SUPERSESSION — ARCH-01" section. This is a recorded decision, not redesigned here: the technical solution for `LOCAL-01` (restoring Desktop as its own local-first authority) is deferred to be supplied externally before implementation. §5 below is left intact as historical record of the server-central design it supersedes.

## 1. Repository and delivery model

Use `claude/smartlearn-v1-complete` as the sole current execution branch, preserving its local descendants. Reconcile it with the inspected main snapshot before implementation. Merge the reviewed main ancestry normally only when the source trees/conflicts have been examined; no reset/rebase/wholesale historical cherry-pick. Stage named files only. Newer unrelated commits require delta inspection, not rollback.

Keep the merged PR-0/PR-1 as historical evidence, not as a command to rerun everything indefinitely. Local test artifacts belong under an ignored, isolated run directory. An intentional current change to a protected behavior invalidates only relevant prior evidence, then receives a closure run.

`PRODUCT.md` holds product identity. `.specs/project/INVARIANTS.md` holds active requirements with existing IDs preserved and superseded entries linked, not renumbered. `.specs/STATE.md` holds one compact current handoff. This spec/design/tasks supplies the active execution contract. Old PROJECT, README and SESSION_MEMENTO receive precise pointers or historical banners. A memory entry is a discovery aid.

## 2. Runtime, data and HTTP boundaries

Continue Node 24.x ESM, Fastify 5, better-sqlite3 and SQLite WAL. Respect committed lockfiles; use npm ci for reproducible installs. Pin the approved native dependency and record Node/OS/dependency versions; do not upgrade the stack opportunistically. Fresh installs must work without GC workarounds.

Create modular `server/src/{auth,routes,services,repositories,domain}/` only where responsibilities actually appear. Reuse the existing main/app/config/db/migrations/backup lifecycle. Do not create one abstraction layer per table by habit. Transactions are synchronous better-sqlite3 callbacks; network calls and async password/PDF work occur outside them.

One configured data directory outside web assets. Domain API receives typed intentions, never SQL. Server derives user_id from the authenticated session. Route schemas reject unknown fields and wrong types; configure AJV not to silently remove additional fields or coerce bodies. Parse query strings explicitly. Errors use `{error:{code,field?,requestId}}`; Portuguese messages belong in presentation catalogs. Never expose SQL, stack traces, filesystem paths or another user's resource existence.

For new authoritative user writes, use SQLite synchronous=FULL unless a later explicit durability decision approves another level. This is a planned strengthening of the earlier foundation's NORMAL configuration, not a claim that NORMAL was misconfigured for that prior spec. Retain WAL, foreign_keys=ON and busy_timeout=5000. Test expected PRAGMAs and real restart/backup behavior. Backups use the database backup API and reconcile related uploaded files; raw copying of a live .db alone is insufficient.

## 3. Authentication and sessions

Implement the previously requested built-in account model; no external identity vendor is required.

- Identifier: email normalized for this application's account lookup, with original display form preserved. Do not claim mailbox verification until a configured delivery/verification flow exists.
- Password: accept long passphrases, minimum 15 Unicode code points, bounded maximum 1,024 UTF-8 bytes, no trimming/normalization/truncation; disallow null input and wrong types. Store async Node crypto.scrypt output with independent 16-byte random salt, 64-byte derived key, N=131072, r=8, p=1 and maxmem at least 256 MiB; persist algorithm/parameters for future rehash. Password checks use timingSafeEqual over equal-size derived buffers. Bound parallel hashing (initially two active jobs with a bounded queue); rate-limit before expensive work.
- Sessions: random 32-byte opaque token; store SHA-256 token hash, user_id, issued_at, expires_at, last_seen and revoked_at. Never store raw token in logs, localStorage, URLs or exported backups. Default absolute lifetime 30 days with 7-day inactivity expiry; these are operational defaults, not learning rules.
- Cookie: HttpOnly, SameSite=Lax, Path=/, Secure and __Host- prefix on HTTPS production; development may use a distinct non-Secure name only on loopback. Logout revokes on server, clears cookie and private caches. Rotate on login and credential change. Password change revokes other sessions. Provide a fixture-tested operator reset-token CLI for authorized recovery; no unauthenticated direct reset and no invented email delivery.
- CSRF: exact configured origin validation for login/register and mutations; add a per-session synchronizer token returned by authenticated bootstrap and required in X-CSRF-Token for authenticated mutations, including uploads. SameSite is defense in depth. Missing/null/unexpected origins fail closed except explicitly isolated non-browser test tooling. No credentialed wildcard CORS. Dev uses a Vite API proxy; production uses one origin.
- Auth abuse: bounded per-IP plus per-account failure counters, generic login errors, no secret logging, explicit proxy trust configuration. Start with 10 failed attempts/15min per account and 60/15min per IP as configurable operational caps; test expiry/unblocking and avoid unlimited lockout from attacker input. No successful tenant access can be inferred from a body.userId.

Tables: users and sessions first; no secret fields in normal serialized user DTOs. Domain tables use user_id NOT NULL. Child relationships use composite ownership constraints, e.g. `(user_id, subject_id)` references `subjects(user_id,id)`. A review-to-evidence relationship also verifies the linked unit, not just the owner. Use explicit unique indexes needed by these FKs.

## 4. Domain compatibility and public API

Preserve camelCase client DTOs and server snake_case internally. IDs are positive safe integers for existing entities. Imported legacy IDs are mapped within a source namespace; never reused blindly across tenants. Shared name normalization is NFC, trimmed and internal ordinary whitespace collapsed; preserve display spelling, Greek characters, accents and superscripts. Dedup key uses deterministic case normalization without stripping accents. Confirm its behavior against protected baseline examples.

Single-line names/titles/source labels reject inappropriate line/control characters. Multiline summaries/questions allow ordinary newlines and tabs with explicit bounds. Use safe text rendering; accepting '<' in medical text never authorizes innerHTML. Subject length 100 code points, title 240, source label 200; multiline content up to 100,000 code points initially. Over-limit inputs are rejected, never silently truncated.

Calendar dates use real Gregorian YYYY-MM-DD validation; due dates are calendar arithmetic, not elapsed local milliseconds. User timezone is an IANA zone stored in settings. Server records UTC instants plus the applicable local calendar date/timezone. Future planned study dates remain valid; planned dates alone never create learning evidence. New evidence timestamps come from the server; backdated reported study uses an explicit reported date and keeps recorded_at. Legacy import preserves original date precision.

Existing review offsets remain `[1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]`, one shared pure source plus compatibility re-exports. Do not recompute all users' schedules or completed review dates. Date correction for a unit may change its still-pending projections atomically while preserving completed tasks/evidence and recording the correction; no global adaptive rewrite.

Minimum API, implemented as needed by the real UI:
- /v1/auth/register, login, logout, me; authenticated password change.
- /v1/subjects GET/POST; /:id PATCH; DELETE only when empty, otherwise 409 with an actionable alternative (archive).
- /v1/learning-units GET/POST; /:id GET/PATCH. Create requires exactly one of subjectId or newSubjectName; newSubjectColor is optional. Resolve/reuse active name; an archived homonym returns conflict. Subject + unit + 16 reviews commit in one transaction.
- /v1/agenda?date=... returns overdue/today/completedToday/tomorrow plus revision and timezone. Read/complete dates have explicit meanings; completedToday includes review-only completion, not only questions evidence.
- /v1/review-tasks/:id/complete: questions omitted means review-only completion. With questions, require integers q>0 and 0<=c<=q; update completion plus one REVIEW aggregate evidence atomically and derive score. Reopening/correcting is an explicit audited operation, never deletion of factual history or a generic unrestricted task patch.
- /v1/learning-evidence GET with unit/date filters; POST permits INITIAL_PRACTICE/EXTERNAL aggregate reports only. REVIEW is produced by completion. Keep assessment provenance (manual/self-report/item-derived/imported) explicit.
- /v1/learning-units/:id/exercises and /v1/exercises/:id for owned CRUD/order; immutable exercise_versions preserve the question, answer, hint and provenance used by past attempts. Hint is teaching assistance, never a substitute for a source citation.
- /v1/settings GET/PATCH for actual preferences. Schedule algorithm is fixed. Theme may remain device-local; that is a preference, not a parallel domain database.
- /v1/backup/export; /v1/imports/preview and /:id/commit as specified below.

All logical mutations carry a client-generated operation key scoped by user/operation. Store key + canonical semantic payload hash + original result in the transaction. A network-ambiguous retry reuses that key; same key/different payload returns 409. Review completion additionally has a unique task/evidence relation. Do not automatically retry a POST without such a key. No persisted offline command queue.

## 5. Web authority and cutover

Create RemoteStore behind the current DB interface, based on a written inventory of every caller. Preserve useful current UI rather than rewriting it. Production mode uses API; API failure must never activate writable BrowserStore. The local adapter remains only in explicitly marked legacy export/migration and isolated tests until migration acceptance.

First prove the complete server-backed UI with a temporary test account while the existing user store remains untouched. The real user's transition is a separate explicit operation. Never create an empty new account and silently abandon prior local data. Same-origin build delivery uses Fastify static assets; /v1 errors never fall through to the SPA HTML response. Health endpoints remain public and minimal.

Introduce a minimal pt-BR catalog before adding new screens; later extract remaining strings. Avoid adding a second monolithic app.js. New modules may separate auth, API and screen controllers surgically while tests protect behavior.

## 6. Migration and backups

Use a single normalized logical import representation, with explicit v1/v2/v3 adapters where existing compatibility requires them. Fields such as camelCase/snake_case, legacy studyRecords and source mappings must be handled deliberately. Unknown versions, invalid counts/dates, duplicate IDs, cross-unit links and unsupported fields that would lose meaning result in a preview error, not partial success.

Initial production migration targets an empty owned account; nonempty targets require an explicit supported additive mapping policy or a conflict. Do not overwrite existing records by name/ID. Give each source snapshot a stable sourceInstanceId/snapshot checksum and record old->new ID mapping. Preview reports counts, field normalization and conflicts. Commit is transactional and idempotent for that source. Enforce a measured configured byte/row bound before mutating the tenant; oversized inputs produce an explicit capacity error. Never swap the shared multi-user database as an import shortcut. Reconcile values and relations, not only row counts. Keep the original file/local DB intact. Backups never contain credentials/session tokens or other tenants' records.

Use fixture copies for destructive restore and failures. Operational backup of database plus accepted source files includes a manifest and verification; ensure DB metadata and file versions are mutually consistent. Any real-data cutover, restore or retention deletion requires explicit approval.

## 7. Reconstructed learning evidence - raw observations before estimates

Retain `learning_evidence` as the existing aggregate reporting boundary. Introduce item-level facts separately only when actual exercise interaction supplies them. Never manufacture q individual successes from a report 'q questions, c correct'. Derived analytics must not count both an aggregate and its constituent attempts twice.

Minimal new records:
- competencies: explicit owned label linked to a unit when the feature needs a concept; old aggregates remain unit-level unless deliberately mapped.
- exercise_versions: immutable question/answer/hint/source snapshot for past attempts.
- exercise_attempts: server-created attempt ID, owner, unit, optional competency, exercise version, started/submitted UTC times, status and max assistance observed.
- learning_events: immutable event ID and attempt/sequence idempotency, owner, unit/competency, kind/type, outcome (including unknown), observed assistance available/used, assessment method, item version, recorded_at/occurred_at, provenance and schemaVersion. A correction appends a linked correction, not silent historical mutation.

Keep the source enums discoverable, but absence maps to UNKNOWN, never NONE. Real help/reveal routes update the attempt's observed assistance. A manually reported success remains self-report. NONE means no assistance was observed through the instrumented application, not proof that the learner used no external help; retain that observation scope and never market it as certainty about the person. A source/AI suggestion of correctness is not silently a medical fact. Confidence is optional and never forced on every action. Transfer/novelty require reviewed exercise metadata; no inference solely from a client string or numerical distance. Server derives observed elapsed time from linked timestamps/exposures; 'delayHours=48' from the client is not retention proof.

Rebuild pure functions with explicit inputs, clock/cutoff and policy version: normalize event; derive evidence profile; suggest a discriminating next action. Output reason codes plus supporting event IDs and missing data, not English instructional paragraphs inside domain logic.

A separate experimental evaluateMastery/policy may be tested offline/in shadow mode. Default disabled. No user-visible universal mastered status, no schedule changes and no psychological diagnosis until claim-appropriate evaluation and explicit promotion. The branch's 24h, .8 and .35 thresholds are historical heuristics, not validated constants. Conflicting recent evidence is visible; one later success does not prove repair of an unrelated misconception.

## 8. PDF, generation and acceptance

Private sources live outside the static root with random IDs and owner-scoped access. Validate actual file type/content plus MIME, cap initially at 25 MiB/300 pages, apply per-account quota and parser deadline/memory limits, and use a worker/child process for PDF parsing. These are configurable operational limits, not pedagogical rules. Use a maintained PDF.js/pdfjs-dist release compatible with the pinned runtime; pin and record the verified version. No automatic executable content or network fetches from a PDF. Encrypted/scanned/image-only input gets an explicit status; OCR is deferred unless separately approved.

Store original checksum, parser version, per-page text and page boundaries. Chunk proposals by headings/page boundaries with a default maximum of 10 pages, retaining exact source spans. This is a provisional chunking heuristic, not an assertion of optimal learning. A unit can point to one or more source segments; provenance type and citation locator are separate fields.

A single provider interface accepts bounded source segments and returns a strictly validated draft schema (summary, questions, answers, hints, source spans, provider/model/prompt version). Implement a fake provider for deterministic tests and one configured real-provider adapter using the provider selected in environment/explicit configuration. Credentials remain server-side. Sending material to an external provider requires the user's configured consent and budget cap. Missing credentials block only the live integration gate.

Treat source text as data, including any embedded instructions. The generator has no ability to call mutation APIs, read credentials or alter source files. Validate cited source IDs/pages/spans against the actual input; quarantine unsupported citations. Citation presence alone does not establish medical correctness. User inspection/acceptance creates ordinary learning material transactionally; it does not automatically promote an AI answer to a validated medical reference. Expose that distinction. Retry acceptance must not duplicate units or reviews.

## 9. Offline, shared shells and reminders

Offline availability starts after at least one successful device synchronization. A device that never received a record cannot display it while disconnected. This limitation does not justify discarding older known future reviews. The server returns an owned, versioned snapshot of pending/overdue and known future reviews, minimal unit/subject display data, generatedAt, dataRevision, schemaVersion and timezone. Keep the entire known finite agenda, not just today's card. Large snapshots page into a temporary generation and are swapped atomically after all pages validate. Cached data is partitioned by server origin and user. On logout/switch remove private cache and reminders. Never cache auth tokens or a credentialed response for another account.

The web service worker caches static assets with revisioned manifests and a navigation fallback. Private agenda snapshots use explicit owned storage, not generic cache-every-GET or cached POST. Offline requests are read-only; no queue or fake success. Show lastSyncedAt and a stale indication without hiding the last-known agenda merely because it is old. A changed server agenda replaces the snapshot on reconnect; historical records are not edited locally.

Keep Tauri wrappers thin. Online they load the same trusted application origin. Prove service-worker cold-start behavior in the actual Windows and Android runtimes instead of assuming browser parity. If a runtime cannot cold-start its remote app offline, use a bundled read-only view built from the SAME UI components plus a narrow native snapshot store. Both views are built from the same source and catalog; offline views are not a fork maintained by hand. It performs no authenticated writes or domain scheduling and contains no second UI/rule implementation. This fallback must be tested and documented; a material platform redesign returns to ChatGPT rather than starting another application.

Remote content receives no generic SQL, shell or filesystem capability. Any native bridge has one configured origin and fixed snapshot/notification operations, bounded payloads, and no arbitrary path/command arguments. Inspect capabilities and embedded-frame exposure. Windows/Android release signing/distribution remain external gates.

Reminders derive from received schedule and user's consent/time preference; stable reminder IDs support replacement/cancellation after sync/logout. Native scheduling where supported may operate offline; Web push needs network. Denied permission and runtime limitations are represented honestly. Exact-time/background delivery is tested per platform rather than promised from a unit test.

## 10. Priorities, UI and quality

Prioritize deterministically: overdue first (oldest due date), due today, then explicitly requested practice for weak or missing recent evidence. Within a requested weak-practice list use observed counts/proportions plus sample size, not a fabricated mastery probability. No automatic rescheduling. The fixed offsets remain the scheduling authority. Publish tracking meanings centrally from the inspected getTrackingState: ATRASADO = an unfinished review has dueDate < today; otherwise SEM_EVIDENCIA = the unit has zero aggregate evidence rows; otherwise EM_REVISAO = an unfinished review is due today; otherwise EM_ESTUDO = there is evidence, no REVIEW-context evidence, and at least one unfinished future review; otherwise EM_DIA. Preserve this order and the pt-BR labels Atrasada / Sem pratica registrada / Revisar hoje / Em estudo / Em dia (use proper accents in the catalog). No recorded practice means only absence of that record, not that the student failed to learn. Keep due-today actions available even when the higher-priority absence-of-evidence badge applies. Display why a suggestion exists and distinguish no evidence from failure. Keep canonical tracking precedence and labels; Em dia describes agenda, not mastery.

User-facing strings live in a pt-BR catalog with semantic keys; domain error/reason codes remain stable. Acceptable medical punctuation in user input is independent of UI style rules. Tooltips supplement a clear visible label and support keyboard/touch; important meaning is never hover-only. Protect keyboard focus, form error associations, 200% zoom, narrow layouts and reasonable contrast. Test visible workflows and exact data changes, not just HTTP 200 or existing fixture rows.

## 11. Operations and acceptance

Build/test artifacts include source SHA/tree/worktree status, versions, exact commands, environment and logs. Separate runtime smoke, native UAT, source correctness and pedagogical outcome claims. No assertion of better memory without suitable longitudinal evidence. Required external gates cannot be replaced by mocks or marked deferred while still claiming complete V1.

CI runs on push/PR with least privileges and no secrets for untrusted branches. Prefer locked dependencies and action revisions verified from official sources. Keep unit/shared/server discovery explicit; do not silently omit src-located tests. Candidate build must not include test fixtures, mutation code or private sources. Real hosting, account data and remote repository administration remain explicit authorization boundaries.
