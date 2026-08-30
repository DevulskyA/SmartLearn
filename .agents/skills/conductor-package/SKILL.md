---
name: conductor-package
description: Operate the repo Conductor as a single package by keeping reusable procedure in the skill and project state in conductor/ without duplicating policy.
---

# Conductor Package

Use this skill when the task is about the repo's Conductor setup, version sync, or track governance.

## Contract

- Treat `conductor/` as project state, not as a second copy of the procedure.
- Treat this skill as the reusable operating package.
- Do not duplicate the same rules in `conductor/` and the skill body.

## Workflow

1. Read `conductor/index.md` and `conductor/tracks.md`.
2. If the task touches repo governance, update the relevant `conductor/*` file only.
3. If the task touches the reusable procedure, update this skill only.
4. Keep version and wording aligned across both surfaces.

## Guardrails

- Keep changes minimal.
- Do not move code or UI unless the user explicitly asks.
- Preserve the original Conductor wording when comparing against upstream.
