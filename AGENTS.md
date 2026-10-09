# SmartLearn — Codex Instructions

Before modifying this repository:

1. Read `CLAUDE.md`. Treat its repository-wide architecture, product decisions, guardrails, testing requirements, worktree rules, and continuity rules as authoritative shared project instructions. Follow the session-recovery steps it lists, including reading `.specs/EXECUTION.md`, which holds the NO_PUSH / NO_MERGE / NO_DEPLOY guardrails.
2. Reconcile `.specs/HANDOFF.md` (local, Git-ignored, may not exist) with Git/worktree/files/tests before trusting it as current state.
3. Treat `.specs/HANDOFF.md` as position, repository/spec artifacts as truth, and the current session as disposable working memory.
4. Preserve NO_PUSH / NO_MERGE / NO_DEPLOY and other human authorization boundaries from the repository instructions. `main` is read-only for agents.
5. Claude-specific runtime commands or capabilities in `CLAUDE.md` do not imply equivalent Codex capabilities. Use the Codex-native equivalent when one exists; otherwise preserve the intended invariant.
6. Do not duplicate persistent project rules here. Keep shared rules in their existing authoritative source.
