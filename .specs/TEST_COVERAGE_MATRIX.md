# SmartLearn — Test Coverage Matrix (FASE 2, first pass)

```
COVERAGE_MATRIX_STATUS=FIRST_PASS_MODULE_LEVEL
CREATED=2026-09-15
METHOD=tlc-spec-driven-strict FASE 2
```

## What this is, and what it is not

This is a **module-level inventory**: for each source module, which test
artifacts (unit/contract/e2e) exist that exercise it, by name and by having
been run green this session. It is the map for prioritizing FASE 3+, not a
finished behavior-by-behavior audit.

`PROTECTED` here means: a named test file targeting this module exists AND
was run green this session. It does **not** yet mean every test in it passed
a Cardboard Test ("what wrong implementation would still pass this?") —
that discriminating-power audit is FASE 8, not done yet for most of what is
marked PROTECTED below. Per doctrine, `PROTECTED` in this matrix should be
read as "has real automated evidence," not "provably bug-proof."

`UNKNOWN` means: no test artifact obviously targets this module by name,
verified by directory listing, not by reading the module or its likely
consumers deeply. A module marked UNKNOWN may in fact be indirectly
exercised by an e2e spec that happens to click through it — this pass did
not trace that.

## Server (`server/src/`)

Every service and route file has a directly-named test file, confirmed by
listing `server/test/`. Full suite: **360/360 green** this session.

| Module | Test evidence | Status |
|---|---|---|
| services/attempts.js, routes/attempts.js | attempts.test.js | PROTECTED |
| services/evidence.js, routes/evidence.js | evidence.test.js (new, this task) | PROTECTED |
| services/exercise-review.js | exercise-review.test.js (new, this task) | PROTECTED |
| services/exercises.js, routes/exercises.js | exercises.test.js | PROTECTED |
| services/reviews.js, routes/reviews.js | reviews.test.js, result-reconciliation.test.js | PROTECTED |
| services/subjects.js, routes/subjects.js | subjects.test.js | PROTECTED — mutation-verified 2026-09-15 (see below) |
| services/learning-units.js, routes/learning-units.js | create-unit.test.js | PROTECTED |
| services/settings.js, routes/settings.js | evidence-settings.test.js | PARTIAL — name mismatch, not re-verified this pass that it actually targets settings.js and not just evidence's settings-adjacent behavior |
| services/imports.js, routes/imports.js | import-commit.test.js, import-preview.test.js, import-normalization.test.js, import-fixtures.test.js | PROTECTED |
| services/content-proposals.js, routes/content-proposals.js | content-proposals.test.js | PROTECTED |
| services/generated-drafts.js, routes/generated-drafts.js | ai-drafts.test.js | PARTIAL — name mismatch, not re-verified |
| services/accept-draft.js | accept-draft.test.js | PROTECTED |
| services/agenda-snapshot.js, routes/agenda-snapshot.js | agenda-snapshot.test.js | PROTECTED |
| services/source-extraction.js | pdf-extraction.test.js, pdf-fixtures/ | PROTECTED |
| services/source-storage.js | uploads.test.js | PARTIAL — name mismatch, not re-verified |
| services/idempotency.js | idempotency.test.js (2026-09-15) | PROTECTED — found and fixed a real bug while writing it (LESSON-008: canonicalHash dropped nested-object contents) |
| domain/learning-event.js, domain/evidence-profile.js | learning-events-schema.test.js, evidence-profile.test.js | PROTECTED |
| auth/* (csrf, passwords, rate-limit, session-tokens, reset-tokens) | session-security.test.js, passwords.test.js, auth-abuse.test.js, reset-password.test.js, auth-routes.test.js | PROTECTED |
| migrations.js, manifest.json | migrations.test.js, identity-schema.test.js, domain-schema.test.js | PROTECTED — includes the manifest-checksum self-check that caught nothing wrong with this task's own new migration |
| backup.js, routes/backup.js | backup-contract.test.js | PROTECTED |
| app.js (server wiring), db.js (server) | http-contract.test.js, health.test.js, static-serving.test.js, db.test.js, process-smoke.test.js | PROTECTED |

**Server-side conclusion:** mature, disciplined, near-total file-level
coverage already. The real remaining server risk is depth (FASE 8: are
these tests discriminating, or just present?), not breadth.

## Client (`src/`)

| Module | Lines | Test evidence | Status |
|---|---|---|---|
| app.js | ~5060 | No dedicated unit test (expected — DOM orchestrator). Exercised across ~20 e2e specs (practice, exercise-attempt-review, stats-*, atomic-save, offline*, migration, local-authority, feature-parity, smartlearn-plan-flow, select-ui, context-switcher-keyboard, source-proposals, draft-acceptance, study-now-flow) | PARTIAL — huge surface, e2e-only for what remains; filterByPeriod/sortMatrixRows extracted to analytics.js 2026-09-15 (see gap #1 below), first crack in the no-isolated-logic problem, most of the file is still DOM-coupled by nature |
| db.js (LocalDB, 2047 lines) | 2047 | learning-evidence.test.js, learning-units.test.js, exercises.test.js, subjects.test.js, dev-dataset.test.js (by domain concept, not filename) | PROTECTED for the domain operations tested; import/export and backup-format migration logic not independently confirmed this pass |
| remote-store.js | 395 | remote-store.test.js (includes a real-server round-trip test) | PROTECTED |
| api-client.js | — | No dedicated unit test; exercised transitively through remote-store.test.js and every REMOTE_MODE e2e | PARTIAL |
| stats.js | 149 | stats.test.js | PROTECTED |
| analytics.js | 164 | analytics.test.js | PROTECTED |
| scheduler.js, review-schedule.js, review-score.js | — | scheduler.test.js, review-schedule.test.js, review-score.test.js | PROTECTED |
| performance-thresholds.js, tracking-state.js, naming-validation.js | — | matching .test.js files | PROTECTED |
| auth-ui.js | — | auth-ui.test.js + e2e/auth.spec.js | PROTECTED |
| select-ui.js | — | e2e/select-ui.spec.js, e2e/context-switcher-keyboard.spec.js | PROTECTED (e2e-only) |
| draft-review-ui.js | — | e2e/draft-acceptance.spec.js | PROTECTED (e2e-only) |
| source-proposals-ui.js | — | e2e/source-proposals.spec.js | PROTECTED (e2e-only) |
| migration-ui.js | — | e2e/migration.spec.js | PROTECTED (e2e-only) |
| offline-store.js, offline-ui.js | — | e2e/offline.spec.js, e2e/offline-writes.spec.js | PROTECTED (e2e-only) |
| theme.js | — | test/theme.test.js (pure logic) + e2e/theme.spec.js (2026-09-15) | PROTECTED |

## Named gaps worth carrying into FASE 3+ (priority order, RISK ≈ IMPACT × REACH × UNCERTAINTY × REGRESSION_HISTORY)

1. **app.js's non-DOM logic has no fast focused gate.** ~5060 lines (was 5105), one file, mostly e2e-only. **PARTIAL, 2026-09-15**: extracted `filterByPeriod`/`sortMatrixRows` (the pure row-filter/sort logic driving both Estatísticas matrix tables — period cutoff, 4 sort keys, tie-break-to-null-last convention) into `analytics.js`, alongside `subtractDays` which they already depended on. CHARACTERIZE → EXTRACT → TEST → REGRESSION → VERIFY: behavior copied verbatim (same file, just moved + exported), app.js now imports instead of declaring locally, 10 new characterization tests added to `test/analytics.test.js` (boundary cases: period cutoff inclusivity, null-handling in every sort key, non-mutation of input, pt-BR locale identity sort) — one test's own initial assumption about the last-30 boundary was wrong (assumed the same today-29/today-30 split as `Analytics.bySubject`'s different windowing convention) and was corrected to match the code's actual, unchanged behavior, not the other way around. Full regression after: root 316/316 (306 baseline + 10 new), e2e 102/102, zero fixes needed elsewhere — proves the extraction changed nothing observable. Public contract unchanged (still called the same way from app.js), no schema/data change. Still open: the other ~40 functions in app.js (createReviewRow, renderContentContext, renderEvolutionSvg, etc.) remain DOM-coupled by nature or not yet triaged for extractable pure cores — this is a first slice, not the whole gap closed.
2. ~~theme.js is genuinely unprotected.~~ **DONE 2026-09-15** — test/theme.test.js (pure logic, including a regression sensor for a hardcoded-dark-id-list duplication hazard found while writing it) + e2e/theme.spec.js (real picker, persistence, OS auto-follow, quick toggle).
3. ~~idempotency.js is cross-cutting and only indirectly tested.~~ **DONE 2026-09-15** — idempotency.test.js added, found and fixed a real latent bug (LESSON-008).
4. ~~This task's own known gap: Study Now's client-side attemptIds collection has no automated test.~~ **DONE 2026-09-15** — e2e/study-now-flow.spec.js (2 specs: correct and incorrect judgment) drives Study Now → judgeStudyNow/finishStudyNowSession → evidence write → reload → Exercícios resolvidos end to end against the real app, no mocks. Written one session, deliberately left unrun (WIP) across an explicit user stop; run for real this session — both passed on first execution, selectors matched the live DOM as written. Full regression after: root 306/306, server 372/372, e2e 102/102 (all green, zero fixes needed).
5. **FASE 8 (test-quality audit): first real mutation-test run, 2026-09-15.** Picked the single highest-consequence property in a multi-tenant app — cross-user ownership isolation — and mutated `services/subjects.js`'s `findOwned()` to drop its `AND id = ?`→`user_id`-scoping (`WHERE id = ?` only, no owner check). Ran the real, pre-existing `subjects.test.js` against the mutant (not a hypothetical — actually edited the file, ran the suite, reverted via `git checkout`, confirmed clean). Result: killed. `a user cannot rename, archive, reorder, or delete a subject owned by another user` failed exactly as expected (expected 404, got 200) — this test is real protection, not decoration. Still not swept project-wide; this is one data point, not a blanket "PROTECTED means mutation-tested" claim for every row above.
   **Continued 2026-09-15 (goal item 3), swept two more ownership gates on the same critical property, risk-ordered by consequence (attempt/evidence integrity > subjects, since evidence is the learning record itself):**
   - `services/attempts.js`'s `findOwnedAttempt()` — dropped `user_id = ?` (kept `id = ?` only). Ran `attempts.test.js`'s `a user cannot start, hint, reveal, submit, or read an attempt owned by another user`: killed — `getById` for userB against userA's attempt returned the row instead of throwing `NOT_FOUND` (`Missing expected exception`). This is the single gate every one of start/getById/useHint/revealSolution/submit routes through — one mutation point, five protected operations.
   - `services/evidence.js`'s attempt-linking lookup inside `create()` (the `attemptIds` ownership check) — same mutation, dropped `user_id = ?`. Ran `evidence.test.js`'s `create() cannot be tricked into linking another user's attempt`: killed, but via a **different, informative path** — the query still returned the foreign attempt, but the pre-existing `attempt.unit_id !== unitId` check caught it anyway (wrong error code: `VALIDATION_FAILED` instead of the expected `NOT_FOUND`, so the test's `err.code === 'NOT_FOUND'` predicate failed). Root cause: `learning_units.id` is a single global auto-increment PK, never reused across owners, so a foreign attempt's `unit_id` can structurally never equal a value the caller's own `findOwnedUnit()` already verified they own — real defense-in-depth from the schema shape itself, not a coincidence to rely on going forward, but not a gap either. Documented, not "fixed" (nothing is broken).
   - `services/learning-units.js`'s `findOwned()` — same mutation, dropped `user_id = ?`. Ran `create-unit.test.js`'s T20 tests: **both** killed — the unit-level test (`getById denies a foreign id`) threw nothing instead of `NOT_FOUND`, and the HTTP-level test got `200` instead of the expected `404`. Clean kill, no incidental second gate this time.
   Both mutants reverted via `git checkout --`, worktree confirmed clean before continuing. FASE 8 is now 4 data points (subjects, attempts, evidence-linking, learning-units) on the same property, all real kills — still not a project-wide sweep (exercises.js, imports.js, content-proposals.js, backup.js and others carry the same `user_id = ?` pattern, unverified by mutation).
8. ~~weightedAccuracy's own value — the single number every Estatísticas row exists to show — had no direct assertion anywhere.~~ **FOUND + FIXED 2026-09-15, goal item 3, pivoted away from the ownership pattern per the goal's own instruction not to blind-sweep.** Mutated `Analytics.byUnit`'s accuracy formula to a plausible copy-paste bug (`totalC / totalC` instead of `totalC / totalQ`, always ~100%) and ran the full root suite: **317/317 still passed** — no test anywhere asserted the actual `weightedAccuracy` value for either `bySubject` or `byUnit`, only derived things like `recentQuestions` (window-boundary tests) or sort/filter behavior on a manually-supplied value. Confirmed the server doesn't import `src/analytics.js` at all (grep, zero hits), and the only e2e assertion on this value (`stats-responsive-regression.spec.js`) checks the format via `/%/` regex, never the number. Fixed: added 4 direct-value tests to `test/analytics.test.js` (bySubject and byUnit, each a real-ratio case and a zero-questions-yields-null case) — re-ran the same mutant against the new tests: killed (`100 !== 70`), reverted, confirmed clean. Full regression: root 321/321 (317 + 4 new). No product code changed.
9. **idempotency.js's payload-conflict detection — a different critical property (duplicate-write prevention, not ownership or arithmetic).** Mutated `checkIdempotency()` to drop the `existing.payload_hash !== payloadHash` conflict check entirely (a repeated `operationKey` with a genuinely different payload would then silently replay the old cached result instead of throwing). Ran `idempotency.test.js`: killed cleanly — `same (user, operation, key) with a DIFFERENT payload throws IdempotencyConflictError...` failed with `Missing expected exception`. Real protection, no gap found here. Mutant reverted, worktree confirmed clean.
10. ~~evidence.js's `correctCount > questionsCount` rejection had zero unit-level tests in `evidence.test.js`.~~ **FOUND + FIXED 2026-09-15.** Mutated `create()`'s validation (`correctCount < 0` only, dropped `|| correctCount > questionsCount`) and ran the full server suite: **371/372 still passed** — the sole catch was `evidence-settings.test.js`'s incidental DB round-trip, which surfaced a raw `SqliteError: CHECK constraint failed...` (the schema-level defense-in-depth constraint) instead of the intended `EvidenceError('VALIDATION_FAILED')` — a route handler hitting this would likely return an opaque 500 instead of a clean 400, a real error-quality regression even though nothing is silently corrupted (the DB itself refuses the bad row). Fixed by adding a direct unit test to `evidence.test.js` asserting the clean typed rejection (`err.code === 'VALIDATION_FAILED' && err.field === 'correctCount'`) — re-ran the same mutant against it: killed with the exact distinction it was written to catch (`actual: SqliteError...` failed the predicate). Reverted, full regression: server 373/373 (372 + 1 new).
6. ~~ordinary-select vs context-switcher semantic separation — "there's a test" is not proof.~~ **DONE 2026-09-15, empirically mutation-tested both directions**, not just re-read: (a) reintroduced the exact historical regression this file's own header comment warns about — removed the `if (row.subjectId === currentSubjectId) continue;` guard in `renderContentContext` (app.js) so the current discipline would leak into its own open switcher menu — and ran `e2e/context-switcher-keyboard.spec.js`'s dedicated dedup test against the mutant: it failed exactly as expected (`Expected: 0, Received: 1`). (b) the inverse mutant — applied the switcher's "exclude current value" filter inside `select-ui.js`'s `buildItems()`, i.e. the shared ordinary-select primitive — and ran `e2e/select-ui.spec.js`: **12 of 15 specs failed** across every real `<select>` consumer in the app (Acompanhar, Plano, Estatísticas, Materiais' source-draft-subject-select), each on the same `aria-selected="true"` current-option assertion. Both mutants reverted via `git checkout --`, worktree confirmed clean before continuing. Conclusion: the semantic separation between the two ARIA patterns has real, broad, discriminating test coverage in both directions — not a single fragile assertion.
7. ~~REVIEW_DAY_OFFSETS' interior values (shared/review-schedule.js) had exactly one sensor in the entire project, on the server side.~~ **FOUND + FIXED 2026-09-15 (goal item 3, pivoted to a different critical property: silently wrong spaced-repetition dates are undetectable by a user, high pedagogical consequence).** Mutated index 7 of the canonical 16-offset array (150 -> 145) and ran the full root suite: **316/316 still passed** — `test/review-schedule.test.js`'s existing test only ever characterized `dates[0]`, `dates[1]`, `dates.at(-1)`, and array length, none of which depend on any interior value. Ran the full server suite next: exactly **1 of 372** caught it — `server/test/evidence-settings.test.js`'s `deepStrictEqual` over the full array, incidental to a test named for settings behavior, not schedule correctness. That single assertion was the only thing standing between a corrupted interior offset and a silent production regression. Fixed by adding a dedicated `REVIEW_DAY_OFFSETS matches the design.md-specified contract exactly, every element` test directly to `test/review-schedule.test.js` (client side, where the canonical constant is imported and re-exported) asserting the full array via `deepEqual` — re-ran the same mutant against it: killed, confirmed client-side alone. Mutant reverted via `git checkout --` (twice — once before adding the test, once after re-confirming the kill), only the new test file left in the diff. Full regression after: root 317/317 (316 + 1 new). No product code changed.

## Explicitly out of scope for this pass

Full per-behavior traceability (every acceptance criterion × every test
assertion), mutation testing, and a11y-specific audit were not attempted —
this matrix is FASE 2's module map, sized to fit one session without
degrading into shallow, low-value padding. FASE 3 (domain-core depth) and
FASE 8 (test-quality audit) are the natural next increments, targeted at
items 1–3 above first per the risk ranking.
