# ADR-0001 — Protected surfaces / design non-regression

- **Status**: accepted
- **Date**: 2026-09-16
- **Scope**: project-level only

## Context

Estatísticas went through a real design regression, recovery, and explicit
visual approval this project (see `.specs/EXECUTION.md`'s
`SEQUENCE_E_ESTATISTICAS_INCIDENT` and `SEQUENCE_E_ESTATISTICAS_PROGRESS`,
and `SEQUENCE_H_PROGRESS`/`SELECT_UI_ROLLOUT`): a large, markup-only,
one-shot redesign attempt mid-session caused a half-wired DOM regression,
was reverted (`git revert` back to commit `4357c36`), and the surface was
then rebuilt faithfully in small, fully-wired, rendered-and-tested slices
against the already-locked composition in
`C:\Projetos\SmartLearn-Stats-Prototype`. The corrective method adopted at
the time (LOCKED vs OPEN areas, no markup-only slices, never a large
one-shot swap) was task-scoped guidance in `EXECUTION.md`, not a standing,
citable governance rule. Nothing before this ADR formally distinguished
"the agent needs to change something on this surface" from "the agent may
redesign this surface" — a future task with a legitimate functional need
(new data, a bug fix, an accessibility fix) could plausibly justify
touching the same surface's composition/hierarchy again, silently
re-triggering the same class of incident `SAFE_SOFTWARE_EVOLUTION_
PRINCIPLES_V2.md` §4.19/§4.27/§4.28 already warn about in the abstract, but
without a concrete, named instance to point back to.

## Decision

Adopt **PROTECTED SURFACES / DESIGN NON-REGRESSION** as a permanent
architectural rule, recorded as `SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md`
§4.33 (AMENDED 2.1.0) and invariant I11. Summary (full text lives in that
file, not duplicated here):

A surface that has already gone through regression, recovery, and explicit
visual approval is `KNOWN_GOOD`. On such a surface the agent may
autonomously fix bugs, wire new data/functionality, improve accessibility,
add/strengthen tests, and make the minimal visual adjustment strictly
required by a function change — but may NOT autonomously redesign it,
change its composition or visual hierarchy, restructure its UI, replace an
already-approved pattern, or reinterpret/"modernize"/"simplify" it.
`FUNCTIONAL_CHANGE_NEED != REDESIGN_AUTHORIZATION`. The larger a surface's
regression/recovery history, the smaller the agent's freedom to
reinterpret it — autonomy scales with reversibility and evidence (§4.24);
redesign freedom shrinks with the cost already paid to reach the approved
state. Authority split: real product = functional authority; approved/
restored design = visual authority (§4.31); tests are sensors, not
redesign authorization (§4.15). A feature that genuinely needs material
visual/structural change on a protected surface must stop that part,
preserve the rest, present the need + alternatives, and wait for a human
gate — the decision belongs to the product's architects (user + architecture
partner), not to the agent alone.

**Estatísticas is the first surface formally designated protected** under
this rule. The concrete, currently-approved details to preserve on it
(not duplicated here — see `DESIGN.md` and `EXECUTION.md`'s
`SEQUENCE_E_ESTATISTICAS_PROGRESS`/`SEQUENCE_H_PROGRESS` for the evidence
trail behind each one) include: recovered/approved geometry; responsive
behavior proven at 375/768/1280; `Por disciplina` and `Por conteúdo` as
the same visual language; no return of `.th-sort-stack`; no silent loss of
information or capability; `no evidence` rendered neutral, never 0%/red;
`subjectColor` != `performanceColor`; percentages kept semantically
neutral; ordinary `<select>` != context-switcher as distinct patterns; the
approved context-switcher grammar (trigger = current discipline, menu =
alternatives only); charts/stats representing real data without
misleading visual inference.

Other surfaces gain protected status the same way this one did: a real
regression + recovery + explicit visual approval cycle, named here or in a
future ADR — not by assumption, and not retroactively for surfaces that
simply haven't been touched yet.

## Alternatives considered

- **Leave it as task-scoped guidance in `EXECUTION.md` only** — rejected:
  that file is a rolling recovery cockpit, not a durable governance
  artifact; the rule would not survive a future context clear as a citable
  standing decision, and a new session working from `STATE.md`/`DESIGN.md`
  alone would have no way to discover it.
- **Encode it only in `DESIGN.md`** — rejected: `DESIGN.md` is the visual
  authority for *what* is approved on a given surface; it is not where the
  project records *behavioral/process* rules for agents (what autonomy an
  agent has). Keeping the process rule in the safe-evolution standard and
  pointing to `DESIGN.md` for the concrete visual facts avoids duplicating
  either document's authority into the other.
- **A brand-new top-level governance file** — rejected per the user's own
  instruction not to create a parallel authority; `SAFE_SOFTWARE_EVOLUTION_
  PRINCIPLES_V2.md` already owns exactly this class of rule (§4.19/§4.27/
  §4.28/§4.31 are the direct ancestors this ADR specializes), so it is
  amended in place instead.

## Consequences / trade-offs

- Any future task touching Estatísticas (or a later-designated protected
  surface) that appears to need composition/hierarchy change now carries a
  mandatory stop-and-ask step instead of proceeding on the agent's own
  judgment — slower for that narrow case, by design.
- A functional-only change (new data source, bug fix, a11y fix, minimal
  necessary visual adjustment) is explicitly still fully autonomous — this
  ADR does not freeze the surface, only its composition/hierarchy/pattern
  choices.
- Declaring a surface protected has a real cost (loses reflexive redesign
  freedom even when a change might be a genuine improvement) which is why
  the bar is a real regression+recovery+approval cycle, not just "it looks
  finished" or "nobody has touched it."

## Related
- Specs: `.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` §4.33, I11; `DESIGN.md`; `.specs/EXECUTION.md` (`SEQUENCE_E_ESTATISTICAS_INCIDENT`, `SEQUENCE_E_ESTATISTICAS_PROGRESS`, `SEQUENCE_H_PROGRESS`)
- Debt: none
- Commits: (recorded in the commit that introduces this ADR)
- Supersedes / superseded by: none
