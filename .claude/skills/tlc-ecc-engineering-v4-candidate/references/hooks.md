# Deterministic Hooks

Hooks are optional accelerators for cheap, repeatable checks. They never replace explicit task or closure evidence.

Good hook candidates include formatting, static lint, generated-file consistency, secret scanning, and commit-policy checks already required by the repository.

Requirements:

- use argv-safe tooling or a reviewed script; do not concatenate untrusted content into a shell command;
- keep latency bounded and failure messages actionable;
- avoid hidden network calls, state mutation, or credential access;
- record expensive or behavior-level checks explicitly through TLC gates;
- document installation in the active host adapter or project configuration, not in the portable core;
- do not weaken permissions or auto-install remote packages to make a hook convenient.
