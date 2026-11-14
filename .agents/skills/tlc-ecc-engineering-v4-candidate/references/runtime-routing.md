# Runtime Routing

The project domain does not select the runtime. Resolve execution and delivery independently.

## Decision order

1. Identify the actual host from the environment and available capabilities.
2. Classify the mode:
   - `execute`: change, run, or validate the current project;
   - `produce`: create an artifact for another agent or runtime;
   - `analyze`: inspect or recommend without mutation.
3. Honor an explicit destination.
4. In `execute`, destination normally equals host.
5. In `produce`, use the named consumer. Under this user's standing rule, artifacts to SmartLearn agents default to Claude Code.
6. In `analyze`, remain runtime-neutral unless a concrete consumer changes the result.
7. Ask only when ambiguity changes tools, syntax, permissions, or the deliverable.

## Canonical cases

| Request | Host | Mode | Destination |
| --- | --- | --- | --- |
| Implement this in the current Codex workspace | Codex | execute | Codex |
| Implement directly in SmartLearn from this Codex workspace | Codex | execute | Codex |
| Create a task or prompt for SmartLearn agents | current host | produce | Claude Code |
| Analyze SmartLearn architecture | current host | analyze | neutral |
| Prepare specifically for Codex | current host | produce | Codex |
| Execute this in Claude Code | Claude Code | execute | Claude Code |

## Non-negotiable boundaries

- The host adapter governs actions performed now.
- A destination profile governs only the produced artifact.
- Load two runtime documents only for a cross-runtime production task.
- Never claim that a destination runtime was executed merely because the artifact targets it.
- Never invent a host capability. If the host lacks shell, filesystem, Git, or workers, downgrade and label the evidence level.
- Generating a handoff or prompt is not permission to send it.
