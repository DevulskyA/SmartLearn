# SmartLearn — Product Evolution Master Plan (V3)

```
MASTER_ID=SMARTLEARN_PRODUCT_EVOLUTION_V3
STATUS=CANONICAL (forward planning)   ADOPTED=2026-10-03
ACTIVE_HORIZON=H0
ACTIVE_TRACK=conductor/tracks/v1-validation/plan.md
NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE
```

## What this file is — and is not

This is the **long-horizon progression and the gates between horizons**. It is a hypothesis, not destiny: product evidence may
reorder or invalidate any horizon. **Plan far. Authorize near.** Only the active horizon has executable detail, and that detail
lives in its Conductor track — not here.

| Responsibility | Lives in |
|---|---|
| Why the product exists; direction authority | `SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` (§0.1 tie-breaker) |
| Inherited quality / safe-evolution floor | `02_SMARTLEARN_QUALITY_STANDARD_V1.md`, `SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` |
| Long-horizon progression + gates | **this file** |
| Which approved work is active now | `conductor/tracks.md` → ACTIVE TRACK |
| Executable macro tasks | the active track's `plan.md` |
| Smallest correct slice + proof | `tlc-spec-driven-strict` (TLC/ECC) |
| Compact current position | `.specs/STATE.md`; `.specs/EXECUTION.md` (cockpit) |
| Disposable resume pointer | `.specs/HANDOFF.md` (position, never authority) |
| What is actually true | Git, code, tests, runtime |

It must not become a second Constitution, a second Conductor, a future tasklist, or a specification for hypotheses not yet
validated. `SMARTLEARN_MASTER_BUILD_PLAN_V1.md` stays as the **V1 build mandate/record**; for what comes after V1 validation, this
file governs.

Authority when sources disagree: local Git/worktree > executable behavior > current tests/evidence > explicit current human
decisions > Constitution/governance > approved specs > Conductor > STATE/HANDOFF > historical plans > conversation.

## Product north star

medical material → meaningful learning unit → trustworthy learning representation → active retrieval/application → question →
feedback/remediation → factual learning evidence → review → weakness/uncertainty detection → priority → next useful activity →
delayed retention and transfer.

The student supplies information once; the system derives what it can derive reliably. Administrative work competes with
learning. The internal system may grow sophisticated; the visible experience stays simple. Long-term target:
**delayed retention + transfer per unit of real learner time** — not question counts, streaks, clicks, session length, immediate
accuracy, review volume or AI activity.

## Architectural invariants preserved (unless a newer canonical decision supersedes them)

Web/PWA + thin clients → central Node/Fastify server → SQLite/WAL. Server authoritative; clients are projections. User ownership
and isolation; secure sessions; idempotent mutations where required; factual historical learning evidence; NO_DATA_LOSS;
source/PDF provenance; AI-generated material stays DRAFT until a human accepts it; `review_tasks != learning_evidence`; offline V1
is a read-only safety net; House Simulator stays a separate product. Not resurrected: IndexedDB/local-first as authority,
authoritative offline writes, spreadsheet mechanics, derivable manual administration, obsolete review schedules, adaptive
scheduling inside V1.

## Reconciled current position (2026-10-03, verified against Git — see the track for evidence)

- PROVEN and CLOSED (do not reopen): IMPORT-1 (restore of the student's own backup into an empty account), VERDICT-1 (stats
  verdict weighted by compared volume), DECOMP (app.js decomposition), previous product-closure (A11Y-1, JOURNEY-1).
- CODEX provider: implemented and committed locally (`db49a7c`): `SMARTLEARN_AI_PROVIDER=CODEX` runs the operator's already
  logged-in Codex CLI (ChatGPT login, no API key) as bounded, isolated, fail-closed inference; OPENAI/ANTHROPIC/FAKE preserved.
- REALMODEL: **pipeline proven with a synthetic source** (PDF → Codex → schema → deterministic + model audit → ≤1 repair → DRAFT →
  review UI → accept). **Real-medical-source quality is NOT proven.**
- Open, observed content-quality defects (from the real canary): circular explanations; hints that give the answer away; an
  answer copied wholesale from the source; a clinically meaningful qualifier dropped ("in volume depletion").
- Full E2E after the CODEX change: NOT yet run. Known historical load-sensitive flakes exist and are evidence, not an excuse.

## Horizons

### H0 — V1 VALIDATION · STATUS=ACTIVE
Decide whether the current V1 is genuinely validated as a medical learning product. Executable detail: the track
`conductor/tracks/v1-validation/plan.md` (macro tasks VALID-1…VALID-8). Exactly one macro task active at a time.
Terminal states are kept apart: `IMPLEMENTATION_COMPLETE` ≠ `V1_VALIDATED` ≠ `PRODUCTION_RELEASED` (the last is a separate future
authorization). V1_VALIDATED needs: reconciled repo; critical gaps closed; CODEX operational; **real medical source quality
proven**; the observed defect classes protected; full relevant regression executed; integrated student journey proven; persistence
and recoverability preserved; analytics not materially misleading; no known material P0/P1; Conductor/STATE equal to reality. It
does not need zero debt, adaptive learning, or release. When H0 ends: `HORIZON_DONE` — and H1 is **re-justified before** starting.

### H1 — LEARNING QUALITY · STATUS=PLANNED · not executable
Intent: improve how SmartLearn teaches before building sophisticated learner models. Candidates: retrieval before rereading;
error-specific feedback; meaningful retry/retest; worked examples and completion problems; progressive fading; contrastive /
interleaved discrimination; near transfer; delayed retest; practice-vs-assessment feedback timing; confidence only where it changes
a decision. Activation gate: H0 V1_VALIDATED, real student-flow evidence reviewed, and H1 still the highest-value next use of time.
Success: one learning hypothesis at a time, each with `LEARNING_HYPOTHESIS / CURRENT_BEHAVIOR / NEW_BEHAVIOR / OBSERVABLE_RESULT /
KEEP|REVISE|REMOVE`. Never all mechanisms together.

### H2 — LEARNING OBSERVABILITY · STATUS=PLANNED · not executable
Intent: collect only factual signals that can improve later decisions (item/version, response, correctness, attempts, help/hint,
scaffold level, contextualized latency, explicitly collected confidence, retry, delayed and transfer results, source/version,
competency link when available). Facts first, inference second, uncertainty explicit. No telemetry because it is possible; no
inference of ADHD, attention, psychological traits or mastery from weak proxies. Activation gate: H1 shows that richer
longitudinal decisions are now limited by missing evidence. Success: each new signal is tied to a decision it improves.

### H3 — COMPETENCY + ITEM INTELLIGENCE · STATUS=RESEARCH_GATED · not authorized
Intent: the semantic structure longitudinal decisions need — discipline → topic → competency → subcompetency (→ prerequisite where
useful); items with primary/secondary competency, cognitive operation, family, variants, empirical difficulty and discrimination,
transfer distance, redundancy, provenance/version. No universal medical ontology. Activation gate: evidence that unit/topic
organization materially limits learning decisions, plus an explicit decision on any major persistent cross-cutting schema.
Success: a decision measurably better with the structure than without it.

### H4 — LEARNER STATE + NEXT-BEST-ACTIVITY · STATUS=RESEARCH_GATED · not authorized
Intent: an interpretable, multidimensional learner state when evidence supports it (memory, understanding, fluency,
discrimination, transfer, calibration, misconception hypothesis, uncertainty) — never one unsupported "mastery %", never an LLM as
sole authority. Question: given evidence and available time, which next activity has the highest expected educational value
(retrieve, re-explain, worked example, completion problem, prerequisite repair, contrastive item, review, transfer case,
diagnostic item, independent problem, **STOP**)? Start with an interpretable policy. Gate: useful telemetry (H2), competency/item
structure (H3), and evidence that simpler scheduling is insufficient. Success: the policy beats the simpler baseline on learner
outcomes, explainably.

### H5 — ADAPTIVE MEMORY + PSYCHOMETRICS · STATUS=EVIDENCE_GATED · not authorized
Intent: memory scheduling and competence measurement are distinct. FSRS/HLR/forgetting models are memory components, not a learner
model; the V1 fixed schedule stays the champion until beaten (fixed vs FSRS vs HLR/others). Psychometrics grows from real data:
classical item statistics → empirical difficulty/discrimination → calibrated bank → Rasch/IRT if justified → CAT only if
measurement efficiency demands it. CAT asks "which item measures best"; pedagogical sequencing asks "which activity teaches best":
never merged. Gate: adequate real response data and a demonstrated limit of the simpler approach. Success: better retention or
measurement at acceptable complexity, shown against the champion.

### H6 — ADVANCED ADAPTIVE MODELS · STATUS=NOT_AUTHORIZED
Examples: deep knowledge tracing, sequence transformers, contextual bandits, reinforcement learning, giant medical knowledge
graphs. Reconsider only when sufficient longitudinal data exists, an interpretable baseline is proven, its limit is shown
empirically, the candidate materially improves learner outcomes (offline benchmark gain alone is not enough), and complexity,
cost, interpretability and safety stay acceptable.

## Standing product principles (direction, not work)

- **Time budget and STOP.** Learner time is globally scarce; future sequencing should allocate across subjects (new learning,
  memory risk, important weaknesses, prerequisites, transfer, upcoming assessments) instead of letting each topic grow an unlimited
  queue. STOP is a valid pedagogical action when another activity is unlikely to change a meaningful decision.
- **House** stays separate; any future interoperability (House clinical-reasoning evidence → SmartLearn learning evidence) needs its
  own product/data contract.
- **Product-first guard.** Ask continuously: "what became perceptibly better for the learner?" Several consecutive slices of only
  infrastructure, harness, documentation, refactor, hardening or internal testing — without learner value or a clearly necessary
  safety/proof property — is a warning: return to product.

## Activation rule (every horizon)

Before activating a future horizon: reconcile Git/STATE/Conductor, re-ask "is this still the highest-value next use of development
time?", and if not, change the roadmap. Product governs the roadmap; the roadmap does not govern the product. A horizon becomes
executable only by opening a Conductor track for it with explicit scope — never by promoting text from this file into a backlog.

## Autonomy and gates

One capable executor (Claude CLI Sonnet 5.5 default). Escalate to a stronger model only for material unresolved uncertainty (two
distinct failed approaches, unresolved root cause, material security/data risk, expensive-to-reverse architecture, meaningful
verifier disagreement, explicit human request). Independent read-only watchdog only where it can materially change confidence
(medical-content quality, persistent data, restore/import, security, migration, cross-module behavior, milestone closure).
HUMAN_GATE only for: product decisions, material scope change, expensive-to-reverse architecture, major new persistent semantics,
unresolved credible data-loss risk, new security/trust boundary, significant external cost, destructive action, push, merge,
deploy, release, or a genuine conflict between current evidence and an explicit human decision.

## Changing this file
A deliberate planning action: update ACTIVE_HORIZON / statuses together with the Conductor track and STATE in the same change, keep
`MASTER_ID`, and never turn a gated horizon into a task list here.
