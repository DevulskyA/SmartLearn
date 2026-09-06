# tasks: server-central-foundation-v1

## T1 — Server Isolated
- [ ] Create `server/package.json`
- [ ] Create `server/src/config.js` (env-based, HOST/PORT/SMARTLEARN_DB_PATH)
- [ ] Create `server/src/app.js` (Fastify factory, routes placeholder)
- [ ] Create `server/src/main.js` (process entry point)
- [ ] Verify: `node server/src/main.js` starts without Tauri/Vite

## T2 — Database
- [ ] Create `server/src/db.js` (openDb with all 4 PRAGMAs)
- [ ] Test: WAL mode confirmed after open
- [ ] Test: foreign_keys = 1 after open
- [ ] Test: creates nested directories when missing

## T3 — Migrations
- [ ] Create `server/migrations/001-bootstrap.sql` (server_meta only)
- [ ] Create `server/src/migrations.js` (runMigrations + validateMigrations)
- [ ] Test: 001-bootstrap applies cleanly (server_meta exists, 1 row in schema_migrations)
- [ ] Test: idempotent — running twice does not duplicate
- [ ] Test: checksum mismatch throws
- [ ] Test: broken SQL triggers rollback — schema_migrations count stays 0
- [ ] Test: validateMigrations passes after correct apply

## T4 — HTTP Lifecycle
- [ ] Add `/health/live` route to `app.js` (200 always)
- [ ] Add `/health/ready` route to `app.js` (real DB checks, 503 on failure)
- [ ] Test: /live returns 200
- [ ] Test: /ready returns 200 with valid DB + WAL + fk + migrations
- [ ] Test: /ready returns 503 when WAL not active
- [ ] Test: /ready returns 503 when foreign_keys OFF

## T5 — Persistence + Backup
- [ ] Create `server/src/backup.js` (async backup using db.backup())
- [ ] Test: write server_meta → close → reopen → value present
- [ ] Test: backup → open backup → verify content

## T6 — Verification
- [ ] `npm --prefix server install`
- [ ] `npm --prefix server test` PASS
- [ ] `npm test` PASS
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` PASS
- [ ] `npm run build` PASS
- [ ] Fresh Verifier PASS
- [ ] Discrimination mutations documented and confirmed killed
