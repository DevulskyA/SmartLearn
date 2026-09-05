# SmartLearn Server-First v1 — Tasks

**Status:** NOT_STARTED
**Date:** 2026-09-05
**Spec:** spec.md
**Design:** design.md
**Governance:** TLC Strict + ECC Engineering

---

## Gate: All existing tests must pass after every task

`npm test 218/218` and `cargo test` must stay PASS at every intermediate commit.

---

## Phase 0 — Foundation (HUMAN_GATE before start)

Before any implementation, a HUMAN_GATE is required:
- Confirm port 57321 is acceptable (no known conflict with other local services)
- Confirm `axum` as the HTTP framework (already in Tauri ecosystem)
- Confirm service worker scope (path prefix for SW registration)
- Confirm migration dialog copy (PT-BR UI strings)

**HUMAN_GATE: SERVER_FIRST_FOUNDATION_APPROVAL**

---

## Phase 1 — Rust Broker

### T1.1 — SQLite pool + WAL setup
- Add `sqlx` or `r2d2-sqlite` to `src-tauri/Cargo.toml`
- Create `src-tauri/src/broker/db.rs`: `open_pool`, `enable_wal`, `backup`
- Unit test: open in-memory SQLite, verify WAL mode via `PRAGMA journal_mode`
- Gate: cargo test still PASS

### T1.2 — HTTP router (axum)
- Create `src-tauri/src/broker/router.rs`
- Routes: `GET /api/health`, `POST /api/query`, `POST /api/execute`, `POST /api/transaction`, `GET /api/schema`
- CORS middleware: restrict to known origins
- Input validation: max body size 1MB, max statements per transaction 100
- Gate: cargo test still PASS

### T1.3 — Broker startup integration
- Wire `broker::start_broker` into Tauri `setup` hook
- Log broker URL on startup
- Handle port-in-use error: clear log message, graceful degradation (continue without broker)
- Gate: `npm run tauri dev` starts without error; `/api/health` returns 200

### T1.4 — Broker tests
- Integration test: spawn broker, send transaction, verify SQLite row written
- Concurrent read test: 4 parallel queries during a write — all succeed
- Kill test: transaction interrupted mid-write → DB stays consistent
- Gate: cargo test PASS with new tests

---

## Phase 2 — JS BrokerStore Adapter

### T2.1 — BrokerStore class
- Add `BrokerStore` to `src/db.js` (see design.md for interface)
- Methods: `transaction(statements)`, `query(sql, params)`
- Retry: 1 retry on network error with 200ms delay
- Gate: npm test 218/218 still PASS (BrokerStore not yet in the DB facade)

### T2.2 — Platform detection update
- Update `DB` facade: detect broker via `fetch('/api/health', { signal: AbortSignal.timeout(500) })`
- Priority: SqliteStore (Tauri) > BrokerStore (broker reachable) > BrowserStore (offline fallback)
- Gate: npm test 218/218 still PASS; manual verify: browser tab with Tauri running uses BrokerStore

### T2.3 — BrokerStore contract tests
- Add test suite mirroring existing BrowserStore tests against a real broker process
- Same AC coverage: dedup, rollback, NUL rejection, etc.
- Gate: npm test PASS with new tests; no existing tests removed

---

## Phase 3 — Service Worker (offline)

### T3.1 — SW registration
- Create `src/sw.js` — basic fetch intercept for `/api/*`
- Register in `index.html` (scope: `/`)
- Gate: SW registers without error in browser console; no existing functionality broken

### T3.2 — Read cache
- Cache GET/POST `/api/query` responses; key = `method + sha256(body)`
- On fetch failure: return cached response with `{ cached: true, cachedAt }`
- Gate: simulate offline → query returns cached data with flag

### T3.3 — Write buffer
- On fetch failure for `/api/transaction`: enqueue to IndexedDB `pending_writes` store
- Return `{ queued: true }` to caller
- Gate: simulate offline → transaction queued; IndexedDB entry visible in DevTools

### T3.4 — Background sync (reconnect)
- On SW `activate` and on fetch success: process `pending_writes` FIFO
- Mark each entry processed; remove from IndexedDB on success
- Gate: offline write → reconnect → data visible in broker SQLite

---

## Phase 4 — Migration: BrowserStore → Broker

### T4.1 — Broker migration endpoint
- `POST /api/migrate/import`: accepts existing backup JSON format
- Calls `assertImportData` (port JS validation to Rust or call via embedded JS)
- Atomic: full transaction or rollback
- Returns `{ ok }` or `{ error }`
- Gate: cargo test with migration test

### T4.2 — Client migration dialog
- On BrokerStore detection with `needsMigration: true`: show dialog
- "Migrar dados" → export BrowserStore JSON → POST → on success clear BrowserStore
- "Depois" → continue with BrowserStore for this session; ask again next time
- Gate: manual test in browser; BrowserStore cleared on success; data visible in desktop app

---

## Phase 5 — Daily Backup

### T5.1 — Backup on startup
- On broker startup: if today's backup doesn't exist in `<app_data_dir>/backups/`, run `VACUUM INTO`
- Keep last 30 days; delete older
- Gate: cargo test; check backup file exists after dev run

---

## Phase 6 — Integration Validation

### T6.1 — Cross-platform read/write proof
- Browser writes via BrokerStore → Tauri WebView reads same data (and vice versa)
- Manual test: write in browser tab → reload Tauri app → data visible
- Document as J7 in validation.md

### T6.2 — Regression gates
- npm test 218/218 PASS
- cargo test PASS
- npm run build CLEAN
- J1-J6 still PASS
- J7 (cross-platform) PASS

### T6.3 — Fresh Verifier
- Independent adversarial review of broker security surface
- Confirm: no external bind, no SQL injection path, no CORS wildcard

---

## Commit Convention

Each task = one commit. Prefix: `feat(server-first):` for new code, `test(server-first):` for tests, `docs(server-first):` for spec/design updates.

---

## HUMAN_GATES

| Gate | Before | Condition |
|------|--------|-----------|
| SERVER_FIRST_FOUNDATION_APPROVAL | Phase 1 start | Port, framework, SW scope, UI copy confirmed |
| MIGRATION_DIALOG_APPROVAL | T4.2 | PT-BR copy reviewed by user |
| SERVER_FIRST_CORRECTION_READY | After T6.3 | All gates PASS; ready for PR update |
