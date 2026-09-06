# design: server-central-foundation-v1

## Package Layout

```
server/
  package.json          — independent npm package, "type": "module"
  src/
    config.js           — env-based configuration
    db.js               — opens SQLite with required PRAGMAs
    migrations.js       — migration runner + validator
    app.js              — Fastify app factory
    main.js             — process entry point
    backup.js           — hot consistent backup
  migrations/
    001-bootstrap.sql   — server_meta table
  test/
    db.test.js
    migrations.test.js
    health.test.js
    persistence.test.js
```

## Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js 24 LTS | Matches spec; built-in `node:test` |
| HTTP | Fastify 5 | Spec; low overhead |
| SQLite driver | better-sqlite3 ^11 | Synchronous API; WAL support; `.backup()` |
| Test framework | `node:test` | Built-in; no extra dep |

## Config (`config.js`)

Reads environment; no file-based config:

```
HOST            default: 127.0.0.1
PORT            default: 3000
SMARTLEARN_DB_PATH  default: ./data/smartlearn.db (dev fallback only)
```

## Database Layer (`db.js`)

One connection per call to `openDb(path)`. Caller owns the connection and closes it.

PRAGMAs applied synchronously on every open:
```
PRAGMA foreign_keys = ON
PRAGMA journal_mode = WAL
PRAGMA synchronous  = NORMAL
PRAGMA busy_timeout = 5000
```

Creates parent directory with `mkdirSync({ recursive: true })` before opening.

## Migration Runner (`migrations.js`)

Two exported functions:

**`runMigrations(db, migrationsDir?)`**
1. `CREATE TABLE IF NOT EXISTS schema_migrations (...)` — runner's own table, not in migration SQL
2. Read and sort `.sql` files from `migrationsDir`
3. For each file:
   - Parse `NNN-name.sql` → `{ version: number, name: string }`
   - Compute SHA-256 of file content
   - Query `schema_migrations` for this version
   - If not found: run SQL in transaction, insert row
   - If found + checksum matches: skip
   - If found + checksum differs: throw (`startup FAIL`)
4. Throws propagate to caller; transaction failure rolls back the migration attempt

**`validateMigrations(db, migrationsDir?)`**
- Same checksum verification loop but no applying
- Used by `/health/ready` to re-verify on each readiness check

## HTTP Layer (`app.js` + `main.js`)

`buildApp(db, migrationsDir?)` returns a Fastify instance.

```
GET /health/live   → 200 { status: "alive" }
GET /health/ready  → 200 { status: "ready" }
                   → 503 { status: "not ready", error: "..." }
```

`/health/ready` checks (in order):
1. `db.prepare('SELECT 1').get()` — DB accessible
2. `PRAGMA journal_mode` === `"wal"`
3. `PRAGMA foreign_keys` === `1`
4. `validateMigrations(db, migrationsDir)` — checksums valid

Any throw → 503.

`main.js` wires config → openDb → runMigrations → buildApp → listen.

## Backup (`backup.js`)

```js
backup(db, backupDir) → Promise<backupPath>
```

Uses `db.backup(path)` from better-sqlite3. Produces a consistent copy readable by any SQLite client. Filename includes ISO timestamp.

## Test Isolation

Every test:
- Creates its own `tmpdir` via `os.tmpdir()` + unique suffix
- Passes the explicit path to `openDb()` or migration functions
- Closes the DB connection after use
- Removes the tmpdir in `finally`

No test shares state with any other, and no test touches real data paths.

## Commits

| Commit | Scope |
|--------|-------|
| `spec: add server-central-foundation-v1 contract` | spec files |
| `feat(T1): server isolated package` | config, app, main |
| `feat(T2): db module with WAL pragmas and tests` | db.js + db.test.js |
| `feat(T3): migrations runner with checksum and rollback` | migrations.js, 001-bootstrap.sql, migrations.test.js |
| `feat(T4): health endpoints live and ready` | app.js routes, health.test.js |
| `feat(T5): persistence and backup` | backup.js, persistence.test.js |
| `test(T6): install deps, full gate verification` | package-lock, gate results |
