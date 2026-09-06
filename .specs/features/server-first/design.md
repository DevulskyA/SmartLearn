# design.md — server-first

## Arquitetura

```
Tauri app (desktop/Android)
├── SqliteStore  ← plugin-sql nativo (já implementado)
└── Broker HTTP (127.0.0.1:57321, axum)
    ├── GET  /api/health
    ├── POST /api/query          (leitura, cacheável pelo SW)
    ├── POST /api/execute        (escrita simples)
    ├── POST /api/transaction    (escrita atômica)
    └── POST /api/migrate/import (import em bloco, 16 MB, INSERT/CREATE/PRAGMA only)

Web/PWA (browser)
├── db.js — DB.init() detecta plataforma
│   ├── __TAURI_INTERNALS__ → SqliteStore
│   ├── checkBrokerReachable() → BrokerStore
│   └── BrowserStore (fallback)
├── broker-transport.js — createBrokerStore, fetchWithRetry, offline IDB queue
├── migration.js — hasBrowserStoreData, buildMigrationStatements
└── sw.js — Service Worker
    ├── app-shell cache (install)
    ├── /api/query: network-first + SHA-256 cache key
    └── /api/transaction, /api/execute: pass-through
```

## Módulos Rust

| Módulo | Responsabilidade |
|--------|-----------------|
| `src-tauri/src/broker/db.rs` | Pool SQLite, WAL, backup, rotação |
| `src-tauri/src/broker/router.rs` | axum router, handlers, CORS |
| `src-tauri/src/broker/mod.rs` | startup: pool → backup → HTTP server |
| `src-tauri/src/lib.rs` | hook `setup` → `broker::start_broker` |

## Módulos JS

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/broker-transport.js` | BrokerStore, offline IDB, background sync |
| `src/migration.js` | BrowserStore → broker migration statements |
| `src/sw.js` | Service Worker cache + offline shell |
| `src/db.js` | Orquestrador: detecção de plataforma, DB.init() |
| `src/app.js` | showMigrationDialog() — UI PT-BR |

## Decisões críticas

- **tokio::JoinHandle descartado**: servidor axum vive enquanto o processo Tauri viver (ADR-002).
- **`tower::ServiceExt::oneshot`**: testes de integração sem TCP real (evita flakiness de porta).
- **`AbortSignal.timeout(500)`**: health probe da Web; DOMException ≠ TypeError (não enfileira).
- **IDB `pending_writes`**: buffer de escritas offline; drenado no evento `online`.
