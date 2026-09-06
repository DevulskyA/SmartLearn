# ADR Policy — SmartLearn

ADRs record project-level decisions that are **costly or surprising to rediscover** and affect **cross-feature architecture or contracts**.

## When to create an ADR

Create an ADR when ALL of these are true:
- The decision affects more than one feature or module boundary
- The decision would be non-obvious to reconstruct from code or commit messages alone
- The decision is not already captured in `.specs/project/STATE.md` DEC-NNN entries

## When NOT to create an ADR

- Feature-local implementation choices → stay in `design.md`
- Decisions already captured as DEC-NNN in STATE → do NOT duplicate; migrate only if actively relevant cross-feature
- Historical decisions that are closed and stable → leave in Git history

## Format

File: `ADR-NNNN-kebab-title.md` using the template in `templates/ADR.md`.

Statuses: `proposed | accepted | superseded | rejected`

## Existing cross-feature decisions

The following DEC-NNN entries in `.specs/project/STATE.md` qualify for future ADRs if they become sources of confusion or are revisited:

| DEC | Decision | ADR candidate reason |
|-----|----------|---------------------|
| DEC-009 | Tauri 2 as sole target | Cross-feature; affects every platform build |
| DEC-011 | db.js SQL authority contract | Cross-feature; affects every module touching data |
| DEC-016 | vNext scheduler boundary + FSRS deferral | Cross-feature; affects scheduling, UI, analytics |

No ADRs needed today. Create the first ADR when one of the above is revisited or a new cross-feature architectural decision arises.
