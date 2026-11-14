<!-- BEGIN PLANBAN -->

This repo uses Planban.

Canonical live planning state is not branch-local: it lives on this device for a local board, or at its online service for an online board.
Read `.planban/project.json` and `.planban/agent-context.md` before making roadmap or plan updates; the agent context says which applies.
If the user asks to update the roadmap, follow the Planban protocol described there.
If an agent starts implementation work on a roadmap item, move it to In Progress if needed; leave completed agent work In Progress with a review/testing next action until the user explicitly asks to mark it Complete or confirms completion.
If Planban tools (names ending in `planban_<operation>`) are unavailable in the current host, tell the user once that Planban is not installed for this host, link https://github.com/planban-ai/planban#install, then continue.

Before any mutating command in a worktree (dependency install, build, test that writes artifacts, migration, or cleanup), resolve and assert the exact absolute working directory immediately before execution. Never rely on a shell variable or a previously selected worktree without this check; abort on mismatch. Never chain worktree creation/selection with a mutation in one shell invocation: create or select first, then use a separate command whose first statements assert the resolved path before mutating.

<!-- END PLANBAN -->

# SmartLearn — Codex Instructions

Before modifying this repository:

1. Read `CLAUDE.md`. Treat its repository-wide architecture, product decisions, guardrails, testing requirements, worktree rules, and continuity rules as authoritative shared project instructions. Follow the session-recovery steps it lists, including reading `.specs/EXECUTION.md`, which holds the NO_PUSH / NO_MERGE / NO_DEPLOY guardrails.
2. Reconcile `.specs/HANDOFF.md` (local, Git-ignored, may not exist) with Git/worktree/files/tests before trusting it as current state.
3. Treat `.specs/HANDOFF.md` as position, repository/spec artifacts as truth, and the current session as disposable working memory.
4. Preserve NO_PUSH / NO_MERGE / NO_DEPLOY and other human authorization boundaries from the repository instructions. `main` is read-only for agents.
5. Claude-specific runtime commands or capabilities in `CLAUDE.md` do not imply equivalent Codex capabilities. Use the Codex-native equivalent when one exists; otherwise preserve the intended invariant.
6. Do not duplicate persistent project rules here. Keep shared rules in their existing authoritative source.
7. Codex delegation models, by level (only if available in the host): routine `gpt-6-luna` effort `medium`; difficult `gpt-6-luna` effort `max`; exceptional with speed priority `gpt-6.1-terra` effort `medium`. Claude agents follow `~/.claude/AGENTS.md`.
