# VALID-4 — TLC checkpoint (PDF → IA → DRAFT → edição)

VALID-4 = NOT_PROVEN. This file is the working checkpoint of the correction cycle opened after the first real Desktop run
(Costanzo, Codex, 2026-10-03). Defect register: memory `project_valid4_defect_register`. Rule given by the human during the
cycle: **no more Codex work and no text sent to Codex while fixing the interface.** No generation was run in this cycle.

## Findings → status

| Finding | Root cause (proved) | Fix | Proof |
|---|---|---|---|
| Whole book listed / editorial pages offered | outline units were page-bounded; no classification | `unit-kind.js` (kind + `effectiveKind` for legacy rows), editorial units refused before any provider (`NOT_GENERATABLE`), listed apart | `unit-kind.test`, `source-scope.test` (incl. legacy row) |
| Neighbour text in the unit (PAH sample problem in Glomerular Filtration) | page 267 holds the tail of *Renal Blood Flow* printed AFTER the next heading (content-stream order); unit = whole pages | units are SPANS owned by outline headings (`section-spans.js`); real Costanzo: Glomerular Filtration 267–273 = 23.317 chars, no PAH sample; Measurement of GFR = 6.014 chars from offset 3478 | `section-spans.test`, real-data check, mutation (offsets ignored → 7 fail) |
| Payload not provable | only a sha256 was stored | `assertPayloadWithinScope` re-reads stored pages and compares BEFORE the provider call; `sourceScope` stored with the draft | `source-scope.test` (4 mutations killed) |
| Topic selection | no way to choose a subsection | `GET /sources/:id/topics`, `POST /sources/:id/scopes` (section or page/offset range) | `source-scope.test`, `lesson-editor.spec` |
| Lesson = one vertical flow | draft was one JSON blob replaced whole | stable question ids, per-entity versions, granular `PATCH summary` / `PATCH|DELETE question`, rejected questions never become exercises | `lesson-granular-edit.test` (9) |
| UI: audit/controls/other units mixed with content | one container, `textContent` glued | lesson editor (Resumo/Questões/Fonte/Revisão), list replaced by the editor, findings carry `entityId` | `lesson-editor.spec` (9), `lesson-view-model.test` |
| 67 false audit alerts | word-overlap compared PT draft against EN source | `language-detect.js`; lexical checks step aside across languages, numbers/units/citations/duplicates/leaks stay | `draft-audit-cross-language.test`; real draft 67 → 0 actionable |
| Stale Desktop (07/09 release opened by shortcut) | shortcuts pointed at release/installed exe | `scripts/launch-desktop-dev.ps1`, `scripts/install-dev-shortcut.ps1`, build identity line (`/health/build`) | `desktop-entrypoint.test`, `health.test` |

## NOT done (explicitly)

- Codex job observability (job id / phase / last activity / stall + hard timeout / cancel): designed and partly prototyped, then
  **reverted on the human's instruction** (no Codex changes). Probe result worth keeping: `codex exec --json` emits only
  `thread.started`, `turn.started`, `item.completed`, `turn.completed`; a long reasoning step is silent, so "last activity" from
  output alone would flag a healthy call as stalled — a stall policy needs a generous silence limit and a CPU/liveness signal.
  The screen shows elapsed time only, labelled as such (the server reports no progress).
- Regenerate ONE question (needs a single-question contract with the model).
- Structured Resumo Mestre from the model (prompt unchanged; the editor supports `##` headings and a reading view).
- Deterministic cross-language *qualifier* / unsupported-fact sensors (only values, units, citations, duplicates, leaks); semantic
  support across languages depends on the model audit and the human.
- Bounded question volume (35 questions for ~6 pages): prompt says "as many as the source supports"; no cap added (prompt untouched).
- Orphan `codex` child after the Desktop closes (the Rust wrapper kills `node`, not its child).

## Next action

Human test on the canonical Desktop (`SmartLearn DEV`): open the existing Costanzo draft in the new lesson editor, topic-search
"Measurement of Glomerular Filtration Rate", inspect the approved scope — without generating.
