# Claude Code Host Adapter

Use only when Claude Code is the execution host.

## Root and installation

Resolve bundled resources from `${CLAUDE_SKILL_DIR}`. Never resolve them from the project working directory.

Claude Code discovers personal skills at `~/.claude/skills/<skill-name>/` and project skills at `.claude/skills/<skill-name>/`. Invoke this package as `/tlc-ecc-engineering-v4-candidate` when installed under that directory name.

Choose an available Python launcher once:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/tlc.py" self-test
```

If `python3` is absent and `python` is the repository's supported launcher, substitute `python`.

## Capabilities

- Use Plan Mode when a non-trivial or cross-cutting change benefits from read-only exploration before editing; do not require a persistent plan artifact unless `TASK_PLANNING`, `DESIGN`, or `HANDOFF` justifies one.
- Map bounded Worker and Verifier roles to Claude subagents only when separate context improves the result.
- When `ORCHESTRATION` is active and dynamic workflows are available in the installed Claude Code version, let the task compile the minimum workflow it needs rather than forcing a permanent agent team.
- Use separate Git worktrees for parallel mutating workers unless ownership is provably non-overlapping and repository policy permits another isolation mechanism.
- Use Claude hooks only for cheap deterministic invariants or lifecycle gates. Explicit TLC gates remain authoritative for governed evidence.
- Use loops only when each iteration receives new evidence from tests, tools, runtime observations, or an independent evaluator; stop repeated same-cause failure and reopen the hypothesis.
- Do not add broad `allowed-tools` grants. Respect project and user permission policy.
- Treat bundled `/run`, `/verify`, `/loop`, `/goal`, or workflow commands as host capabilities only when present in the active installation; never assume syntax from another version.
- Treat Code Review or other managed review features as additional evidence, not automatic semantic proof.

## Knowledge placement

Use the repository's `CLAUDE.md` hierarchy for stable always-relevant conventions in its scope. Put reusable on-demand procedures in Skills. Put deterministic invariants in tests/hooks/CI where possible. Do not copy the same rule into every layer.

## Cross-runtime production

When Claude Code produces an artifact for Codex, keep Claude tools and paths out of the artifact unless the user explicitly requests a Claude-side wrapper.
