# STATE.md — SmartLearn (canonical)

> History lives in `.specs/project/STATE.md` and Git log. This file is the compact current snapshot only.

**Date:** 2026-09-03
**Governance:** TLC Strict vNext (adopted 2026-09-03)

---

## Current status

| Field | Value |
|-------|-------|
| Active branch | `claude/com-tlc-replanning-77f844` |
| Active feature | `smartlearn-ui-analytics-vnext` |
| Feature status | BROWSER_PASS — awaiting SQLite/Tauri smoke before merge |
| Tests | 81 node:test passing, 0 failures |
| HUMAN_GATE | PUSH_AND_PR_APPROVAL (analytics-vnext) |
| Next action | Governance adoption; then user decides push/PR |

## Active human gates

| Gate | Blocks | Reference |
|------|--------|-----------|
| PUSH_AND_PR_APPROVAL | push / PR / merge of analytics-vnext | validation.md BROWSER_PASS verdict |
| GOVERNANCE_ADOPTION_APPROVAL | further feature work | this STATE |

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
