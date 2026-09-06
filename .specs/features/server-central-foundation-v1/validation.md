# validation: server-central-foundation-v1

## Required Gates — All Must PASS

| Gate | Command | Expected |
|------|---------|---------|
| Server install | `npm --prefix server install` | Exit 0 |
| Server tests | `npm --prefix server test` | All pass |
| Root tests | `npm test` | All pass — no regression |
| Rust | `cargo test --manifest-path src-tauri/Cargo.toml` | All pass |
| Build | `npm run build` | Exit 0 |
| Fresh Verifier | Run server tests in clean process after above | All pass |

## Discrimination Mutations

Each mutation is applied in scratch, `npm --prefix server test` is run, result verified as FAIL, then reverted.

| # | Mutation | File | Change | Killed By |
|---|---------|------|--------|-----------|
| M1 | WAL → DELETE | `server/src/db.js` | `journal_mode=WAL` → `journal_mode=DELETE` | `health.test.js` — /ready returns 503 instead of 200 |
| M2 | foreign_keys OFF | `server/src/db.js` | `foreign_keys=ON` → `foreign_keys=OFF` | `db.test.js` (fk=1 assert fails) + `health.test.js` (/ready 503) |
| M3 | bypass checksum | `server/src/migrations.js` | Remove `if (existing.checksum !== cs) throw` | `migrations.test.js` — checksum mismatch test no longer throws |
| M4 | remove rollback | `server/src/migrations.js` | Remove `db.transaction(...)` wrapper, use bare `db.exec()` + insert | `migrations.test.js` — broken migration test: schema_migrations count != 0 after failure |
| M5 | ready unconditional | `server/src/app.js` | Replace `/ready` handler body with `return { status: 'ready' }` | `health.test.js` — /ready returns 200 even when WAL=DELETE and fk=OFF |

## P0 Criteria (blocking)

- Server starts (`node server/src/main.js` exits 0 within timeout)
- Migrations apply on first start
- `/health/ready` returns 200 with valid configuration
- `/health/ready` returns 503 when DB checks fail
- Persistence verified (write survives close/reopen)
- Backup readable with correct content
- All five mutations killed

## P1 Criteria (blocking)

- No regression in root `npm test`
- `cargo test` passes
- `npm run build` exits 0
- Fresh Verifier passes independently

## Deferred (out of scope for this PR)

- Authentication
- Domain/user API endpoints
- User schema migrations
- Automatic backup rotation
- Restore operations
- Scheduler / cron
- PWA / offline support
- Production deployment config
- PR-2 planning
