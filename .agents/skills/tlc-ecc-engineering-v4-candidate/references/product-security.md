# Product Security

Apply only controls relevant to the threat model.

- Enforce authorization server-side per action, resource, owner, role, and tenant; default-deny and fail closed.
- Deny before side effects. Test anonymous, wrong-role, cross-tenant, nonexistent-resource, stale-token, and dependency-failure cases when applicable.
- Keep tenant data, secrets, PII, and internal identifiers out of unauthorized responses, logs, prompts, and error paths.
- Validate type, format, encoding, length, depth, count, destination, and canonical path at the correct boundary.
- Parameterize data access; contain paths; defend command, template, query, header, deserialization, upload, and SSRF surfaces where they exist.
- Authenticate webhooks/messages, enforce freshness and replay protection, and make repeated delivery idempotent.
- Make sensitive transitions atomic and concurrency-safe; test races and partial failure.
- Version and verify dependencies and executable artifacts according to repository supply-chain policy.
- Preserve an audit trail for security-relevant decisions without logging secrets.

Map threats as `SEC-NNN` requirements and connect them to negative tests and gate receipts. Record residual risk and who must accept it.
