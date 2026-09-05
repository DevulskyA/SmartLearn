# SmartLearn Server-First v1 — Design

**Status:** DRAFT
**Date:** 2026-09-05

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                 Host Machine                    │
│                                                 │
│  ┌─────────────┐     ┌───────────────────────┐  │
│  │  Browser    │     │    Tauri App          │  │
│  │  (PWA/tab)  │     │  ┌─────────────────┐  │  │
│  │             │     │  │  WebView (UI)   │  │  │
│  │  Service    │     │  │  index.html     │  │  │
│  │  Worker     │     │  └────────┬────────┘  │  │
│  │  (offline   │     │           │            │  │
│  │   buffer)   │     │  ┌────────▼────────┐  │  │
│  └──────┬──────┘     │  │  Rust broker   │  │  │
│         │            │  │  (axum/hyper)  │  │  │
│         │            │  │  127.0.0.1:    │  │  │
│         │            │  │  57321         │  │  │
│         │            │  └────────┬────────┘  │  │
│         │            │           │            │  │
│         │            │  ┌────────▼────────┐  │  │
│         │            │  │  SQLite + WAL  │  │  │
│         │            │  │  smartlearn.db │  │  │
│         │            │  └────────────────┘  │  │
│         │            └───────────────────────┘  │
│         │                        │              │
│         └────────────────────────┘              │
│              HTTP localhost:57321               │
└─────────────────────────────────────────────────┘
```

---

## Component Design

### Rust Broker (src-tauri/src/broker.rs)

Built with `axum` (already a Tauri ecosystem choice). Manages a `SqlitePool` (r2d2 or sqlx).

```rust
// Startup: called from Tauri app setup
pub async fn start_broker(app_data_dir: PathBuf) -> Result<BrokerHandle> {
    let db_path = app_data_dir.join("smartlearn.db");
    let pool = open_pool(&db_path).await?;
    enable_wal(&pool).await?;
    let router = build_router(pool.clone());
    let listener = TcpListener::bind("127.0.0.1:57321").await?;
    let handle = tokio::spawn(axum::serve(listener, router));
    Ok(BrokerHandle { pool, handle })
}
```

The existing `execute_sqlite_transaction` Tauri command continues to work for Tauri WebView (internal calls bypass HTTP). The broker is additive — it exposes the same SQLite to the external browser tab.

### JS DB Adapter (src/db.js) — broker path

Add a `BrokerStore` adapter alongside existing `BrowserStore` and `SqliteStore`:

```js
class BrokerStore {
  constructor(baseUrl = 'http://127.0.0.1:57321') {
    this.base = baseUrl;
  }
  async transaction(statements) {
    const r = await fetch(`${this.base}/api/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statements }),
    });
    if (!r.ok) throw new Error(`Broker error ${r.status}`);
    return r.json();
  }
  async query(sql, params = []) {
    const r = await fetch(`${this.base}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    if (!r.ok) throw new Error(`Broker error ${r.status}`);
    return (await r.json()).rows;
  }
}
```

Platform detection in `DB` facade: if `window.__TAURI__` present → SqliteStore (existing); else if broker reachable → BrokerStore; else → BrowserStore (offline fallback).

### Service Worker (src/sw.js)

Intercepts `/api/*` fetch requests:
- On success: cache response keyed by `method + body hash`
- On network failure (broker unreachable):
  - GET/query: return cached response with `{ cached: true, cachedAt }`
  - POST/transaction: enqueue to IndexedDB `pending_writes` store; return `{ queued: true }`
- On reconnect: background sync processes `pending_writes` in FIFO order

### WAL and Backup

```rust
async fn enable_wal(pool: &SqlitePool) {
    pool.execute("PRAGMA journal_mode=WAL;", []).await?;
    pool.execute("PRAGMA synchronous=NORMAL;", []).await?;
    pool.execute("PRAGMA wal_autocheckpoint=1000;", []).await?;
}
```

Daily backup: Tauri cron or startup check copies `smartlearn.db` to `backups/smartlearn-<date>.db` using SQLite's `VACUUM INTO` (clean copy, not raw file copy — avoids WAL file inconsistency).

---

## Migration Path: BrowserStore → Broker

```
Browser app startup
    │
    ├─ broker reachable?
    │     ├─ YES: check /api/health → { needsMigration }
    │     │         ├─ true: show "Migrar dados para banco compartilhado" dialog
    │     │         │         user confirms → export BrowserStore JSON → POST /api/migrate/import
    │     │         │         broker: assertImportData → atomic write → respond ok
    │     │         │         client: clear BrowserStore keys → switch to BrokerStore
    │     │         └─ false: use BrokerStore directly
    │     └─ NO: use BrowserStore (offline mode)
```

Migration is user-initiated, not automatic. The dialog explains what will happen. The user can postpone.

---

## Security Notes

- Broker binds `127.0.0.1` — not accessible from LAN or internet
- No authentication in v1; loopback-only is the security boundary
- CORS header: `Access-Control-Allow-Origin: <allowed-origins>` (not `*`)
- All SQL goes through parameterized queries in the broker — no raw SQL from client
- The `/api/transaction` body is validated (max size limit, max statement count)

---

## Testing Strategy

| Layer | Test |
|-------|------|
| Unit | Rust broker routes with in-memory SQLite |
| Integration | JS BrokerStore against real broker process (node test + cargo run) |
| Contract | Same AC matrix as BrowserStore/SqliteStore: same result for same input |
| Offline | Service worker cache: mock network failure → cached response returned |
| Migration | BrowserStore export → import → BrokerStore read → same data |
| Regression | npm test 218/218 and cargo test 13/13 still PASS |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Port 57321 already in use | Detect on startup; log clear error; offer alternative port in settings |
| Browser tab outlives Tauri app | Service worker offline mode handles reads; writes queue |
| WAL checkpoint starvation | `wal_autocheckpoint=1000`; explicit checkpoint on clean shutdown |
| Android: broker not accessible | Android v2 — use different IPC transport (Tauri plugin or Unix socket) |
