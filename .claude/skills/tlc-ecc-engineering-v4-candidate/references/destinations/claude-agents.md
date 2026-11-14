# Claude Agent Destination Profile

Use only when the produced artifact will be consumed by Claude Code or SmartLearn agents running on Claude.

- State the goal, repository context, constraints, observable acceptance criteria, required evidence, authorization boundaries, and stopping condition.
- Use Claude-specific paths or commands only when the destination genuinely needs them.
- Express optional specialists as roles with bounded inputs and outputs; do not assume they exist until the destination runtime confirms them.
- Reference `${CLAUDE_SKILL_DIR}` only for resources bundled inside the destination Skill.
- Keep Codex tool names, sandbox paths, Work-mode mechanics, and OpenAI-only metadata out of the artifact.
- Make the artifact self-contained. The destination agent does not inherit this conversation.
- Do not claim execution, verification, or delivery that occurred only in the host producing the artifact.
