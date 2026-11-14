# Coding Principles

- Preserve behavior outside the confirmed change.
- Prefer the repository's established domain language, architecture, test style, and toolchain.
- Keep changes local; separate cleanup that is not required for correctness.
- Assert observable values, states, payloads, permissions, side effects, and failure behavior rather than incidental calls.
- Treat vague expected behavior as a specification gap, not freedom to guess.
- Define idempotency, ordering, atomicity, and retry behavior wherever state or concurrency makes them material.
- Preserve compatibility during transitions and make irreversibility explicit.
- Add observability that can detect the failure mode the design depends on.
- Validate untrusted data at the trust boundary and keep secrets out of logs, prompts, errors, and governed artifacts.
- Prefer the cheapest gate that can falsify the active claim; run broader closure gates when dependencies make local evidence insufficient.
