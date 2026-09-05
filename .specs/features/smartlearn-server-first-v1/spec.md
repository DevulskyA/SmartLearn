# SmartLearn Server-First v1 — Spec

**Status:** DRAFT
**Date:** 2026-09-05
**Governance:** TLC Strict + ECC Engineering

---

## Problem Statement

Web, Windows, and Android clients currently maintain independent storage:
- Web: BrowserStore (localStorage)
- Windows/Android: SQLite via Tauri plugin-sql

A user studying on the browser sees different data than on the desktop app. This contradicts the original requirement that all platforms see the same database.

---

## Scope

Server-First v1 establishes a **local HTTP broker** that owns the single SQLite database. All clients (Web browser, Tauri Windows, Tauri Android) read/write through the broker. No cloud dependency.

Out of scope v1: cloud sync, multi-device/remote access, user accounts/auth, real-time collaboration.

---

## API Boundary

All broker endpoints are localhost-only. The broker process runs as part of the Tauri app (sidecar or integrated Rust process).

### Endpoints (JSON over HTTP)

```
GET  /api/health
POST /api/query         { sql, params }  → { rows }
POST /api/execute       { sql, params }  → { changes, lastInsertRowid }
POST /api/transaction   { statements: [{ sql, params }] }  → { ok }
GET  /api/schema        → { version, tables }
```

All writes go through `/api/transaction` (atomic). Reads use `/api/query`. The broker enforces WAL mode on open.

### Security

- Bind to `127.0.0.1` only, never `0.0.0.0`
- Port: 57321 (fixed, not configurable in v1)
- No authentication token in v1 (localhost-only; v2 can add token if needed)
- CORS: allow `tauri://localhost` and `http://localhost:5173` (dev) and `http://localhost:5174` (dev-isolated)

---

## Storage Model

```
Single SQLite file: <app_data_dir>/smartlearn.db
Mode: WAL (write-ahead logging) — enables concurrent reads during writes
Connection pool: single write connection + N read connections (N=4 default)
Backup: daily snapshot to <app_data_dir>/backups/smartlearn-<date>.db
```

---

## Migration: BrowserStore → SQLite

When a Web client connects to the broker for the first time and the broker's DB is empty, the broker offers a one-time import:
1. Broker returns `{ needsMigration: true }` on `/api/health`
2. Client exports current BrowserStore data as the existing backup JSON format
3. Client sends JSON to `POST /api/migrate/import` — broker validates with existing `assertImportData`, then writes atomically
4. BrowserStore keys are cleared after confirmed write

**Safety constraint:** Migration is a one-way, one-time operation. Broker never reads BrowserStore directly. Client drives it explicitly.

---

## PWA / Offline-Read Cache

When the broker is unreachable (browser used without Tauri running):
1. Service worker intercepts all `/api/*` requests
2. Returns cached read responses (last successful fetch, keyed by request body hash)
3. Write requests are buffered in IndexedDB with a pending queue
4. On reconnect, pending writes are replayed in order

Stale reads are marked with `{ cached: true, cachedAt: "<iso-date>" }` in the response.

---

## Multiuser Identity (v1 minimal)

v1: single implicit user. All data belongs to one profile.
v2: local profiles with a `profile_id` column added to all tables via migration.

No passwords, no cloud accounts in v1.

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-SF-001 | Broker binds to 127.0.0.1:57321 only |
| AC-SF-002 | All writes go through /api/transaction; atomicity proven by kill-during-write test |
| AC-SF-003 | WAL mode enabled; concurrent reads do not block during write |
| AC-SF-004 | Web client reads same data as Windows client after write via either |
| AC-SF-005 | BrowserStore migration is one-time, atomic, explicit — no partial state |
| AC-SF-006 | Offline read: cached response returned when broker unreachable |
| AC-SF-007 | Pending writes buffered offline; replayed on reconnect in order |
| AC-SF-008 | Backup written daily to app_data_dir/backups/ |
| AC-SF-009 | CORS restricted to known origins; no external origin accepted |
| AC-SF-010 | Existing npm test 218/218 and cargo test 13/13 still pass after implementation |

---

## Non-Goals (v1)

- Cloud sync or remote database
- Multi-device access (different machines)
- Real-time collaboration
- Authentication tokens or user accounts
- Android broker support (Android v2 — different transport needed)
