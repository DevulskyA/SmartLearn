# spec: server-central-foundation-v1

## Summary

Create an isolated Node.js/Fastify server package (`server/`) independent of Tauri, Vite, and the browser. Provides persistent SQLite with WAL, transactional migrations with checksum verification, health/readiness endpoints, and verifiable backup. This is infrastructure only — no domain schema, no auth, no user API.

## Acceptance Criteria

### T1 — Server Isolated
- [ ] `server/package.json`, `server/src/main.js`, `server/src/app.js`, `server/src/config.js` exist
- [ ] Server starts with `node server/src/main.js` without Tauri, Vite, or browser
- [ ] Default HOST=127.0.0.1, PORT=3000
- [ ] Production configurable via environment variables

### T2 — Database
- [ ] `server/src/db.js` opens SQLite with all four required PRAGMAs: `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`
- [ ] Configured via `SMARTLEARN_DB_PATH`
- [ ] Creates parent directory when missing
- [ ] All tests use temporary directories — never real DB paths

### T3 — Migrations
- [ ] `server/src/migrations.js` and `server/migrations/001-bootstrap.sql` exist
- [ ] `schema_migrations(version, name, checksum, applied_at)` table exists after runner executes
- [ ] Migrations run in sorted filename order, inside transactions, idempotently
- [ ] Already-applied migration with matching checksum skips without error
- [ ] Already-applied migration with divergent checksum throws — startup FAIL
- [ ] Failed migration SQL triggers full transaction rollback
- [ ] `001-bootstrap.sql` creates only: `server_meta`. Runner owns `schema_migrations`.
- [ ] No user/domain schema in this PR

### T4 — HTTP Lifecycle
- [ ] `GET /health/live` returns HTTP 200 (process alive check only)
- [ ] `GET /health/ready` returns HTTP 200 only when: DB accessible, `SELECT 1` passes, `journal_mode = WAL`, `foreign_keys = 1`, migration checksums valid
- [ ] `GET /health/ready` returns HTTP 503 on any check failure
- [ ] No raw SQL endpoints (`/api/query`, `/api/execute`, `/api/transaction`, or equivalent)

### T5 — Persistence + Backup
- [ ] `server/src/backup.js` exists
- [ ] Persistence test: init → write `server_meta` → close → reopen → value present
- [ ] Backup test: produce consistent copy → open copy independently → verify expected content
- [ ] No destructive restore, no automatic rotation, no real-data migration

### T6 — Verification
- [ ] All tests use `node:test`
- [ ] `npm --prefix server test` PASS
- [ ] `npm test` (root) PASS — no regressions in existing tests
- [ ] `cargo test` in `src-tauri` PASS
- [ ] `npm run build` PASS
- [ ] Fresh Verifier run in clean process after all gates
- [ ] Discrimination mutations confirmed killed (see validation.md)

## Invariants

- Do NOT modify `src/`, `index.html`, or any UI logic
- Zero functional change to Tauri
- No auth, no domain API, no PWA/offline, no scheduler
- No user/domain schema in migrations
- No bulk cherry-pick from `server-first-v1` branch
- `docs/research/SMARTLEARN_EVIDENCE_ARCHITECTURE_V1.md` is supporting research — not authoritative for this PR
- MEMORY does not substitute spec, STATE, code, or tests
