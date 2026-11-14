# ChatGPT and Codex Host Adapter

Use when ChatGPT or Codex is the execution host. Capabilities vary by client; inspect what is actually available.

## Root and installation

Codex discovers user skills under `$HOME/.agents/skills/<skill-name>/` and repository skills under `.agents/skills/<skill-name>/` from the working directory through the repository root.

Resolve the Skill root from the source locator or `skill_root` exposed by the host. Validate that it contains this `SKILL.md` and the expected script, then use the absolute path. Do not invent `CODEX_SKILL_DIR` and do not run a same-named script from the project.

Example after resolving `<skill-root>`:

```bash
python3 "<skill-root>/scripts/tlc.py" self-test
```

Use the repository's supported Python launcher. If the host exposes no shell or filesystem executor, use the analytical workflow only and mark executable gates `UNVERIFIED`.

## Capabilities

- Use native Codex/ChatGPT workers or subagents only when available, authorized, and useful for bounded independent work.
- When `ORCHESTRATION` is active, map the portable topology in `orchestration.md` onto only the primitives actually present; otherwise execute the same topology sequentially with explicit independence limits.
- Use isolated worktrees or equivalent repository-safe isolation for parallel mutations when available.
- Follow the host's approval, sandbox, and file-editing contracts.
- Treat ChatGPT Work, desktop Codex, CLI, IDE, and cloud environments as capability variants, not interchangeable shells.
- Do not claim `/loop`, `/goal`, `/ultracode`, dynamic workflows, or Claude slash commands as native OpenAI capabilities unless the active host explicitly exposes equivalents.
- Prefer deterministic tools for mechanical enforcement and reserve model review for semantic judgment.

## Knowledge placement

Use the host-appropriate repository instruction mechanism for stable always-relevant conventions, Skills for on-demand procedures, and tests/hooks/CI for deterministic invariants. Avoid duplicating the same rule across layers.

## Cross-runtime production

When the destination is Claude Code, execute all analysis and validation with OpenAI-host tools, then format only the final artifact with the Claude destination profile.
