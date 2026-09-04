# STATE.md — SmartLearn (canonical)

> History lives in `.specs/project/STATE.md` and Git log. This file is the compact current snapshot only.

**Date:** 2026-09-03
**Governance:** TLC Strict vNext (adopted 2026-09-03)

---

## Current status

| Field | Value |
|-------|-------|
| Active branch | `claude/com-tlc-replanning-77f844` |
| Active feature | `smartlearn-ui-analytics-vnext` + `bootstrap-seed` |
| Feature status | PASS — smoke manual 2026-09-03 ✅; see validation.md |
| Tests | 88 node:test (81 + 7 fixture), 5 Rust (2 original + 3 bootstrap lifecycle) |
| HUMAN_GATE | PR_AND_MERGE_APPROVAL (analytics-vnext) — push concluído 2026-09-03 |
| Pending — open | DEBT-007: empty state/onboarding (produção primeiro uso) — feature separada P2 |

## Active human gates

| Gate | Blocks | Reference |
|------|--------|-----------|
| PR_AND_MERGE_APPROVAL | PR creation + merge of analytics-vnext | validation.md PASS; push done 2026-09-03 |

## Active decisions (abbreviated — full text in `.specs/project/STATE.md`)

| ID | Decision | Status |
|----|----------|--------|
| DEC-001 | Stack: HTML/CSS/JS + Vite + Tauri 2, no frameworks | accepted |
| DEC-003 | 16 fixed review tasks per unit (legacy algorithm) | SUPERSEDED_FOR_VNEXT by DEC-016 |
| DEC-009 | Tauri 2 as sole desktop+mobile target | accepted |
| DEC-011 | db.js is sole SQL authority; camelCase public API | accepted |
| DEC-012 | Subject as reusable entity | accepted |
| DEC-013 | fonte = text-livre; empty initial state | PROPOSED — awaits DOMAIN_REDESIGN_APPROVAL |
| DEC-016 | vNext: Scheduler boundary; legacy algo preserved; FSRS = WP-07 | accepted for vNext |

## Known debt

See `.specs/DEBT.md`.

## ADR location

`.specs/adr/` — policy in `adr/README.md`. No active ADRs yet; future cross-feature architectural decisions go here.
