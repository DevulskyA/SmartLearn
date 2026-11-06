<!-- BEGIN PLANBAN -->

This repo uses Planban.

Canonical live planning state is not branch-local: it lives on this device for a local board, or at its online service for an online board.
Read `.planban/project.json` and `.planban/agent-context.md` before making roadmap or plan updates; the agent context says which applies.
If the user asks to update the roadmap, follow the Planban protocol described there.
If an agent starts implementation work on a roadmap item, move it to In Progress if needed; leave completed agent work In Progress with a review/testing next action until the user explicitly asks to mark it Complete or confirms completion.
If Planban tools (names ending in `planban_<operation>`) are unavailable in the current host, tell the user once that Planban is not installed for this host, link https://github.com/planban-ai/planban#install, then continue.

Before any mutating command in a worktree (dependency install, build, test that writes artifacts, migration, or cleanup), resolve and assert the exact absolute working directory immediately before execution. Never rely on a shell variable or a previously selected worktree without this check; abort on mismatch. Never chain worktree creation/selection with a mutation in one shell invocation: create or select first, then use a separate command whose first statements assert the resolved path before mutating.

<!-- END PLANBAN -->
