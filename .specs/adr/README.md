# ADR Index — SmartLearn

Architecture Decision Records. Numbered sequentially; never delete, only supersede.

| ID | Título | Status |
|----|--------|--------|
| ADR-001 | SQLite + WAL como banco server-side no broker | Ativo |
| ADR-002 | axum 0.7 + tower-http CORS predicate (sem wildcard) | Ativo |
| ADR-003 | Platform detection: SqliteStore > BrokerStore > BrowserStore | Ativo |

---

## ADR-001 — SQLite + WAL como banco server-side no broker

- **Data:** 2026-09-05
- **Status:** Ativo
- **Contexto:** O broker HTTP local precisa de um banco durável, rápido e com suporte a WAL para concorrência de leitura.
- **Decisão:** SQLite com `PRAGMA journal_mode=WAL` via `sqlx 0.8.6` (`runtime-tokio + sqlite`). Pool de conexões Tokio.
- **Alternativas rejeitadas:** PostgreSQL/MySQL (pesado para local), LibSQL/Turso (complexidade extra sem benefício no MVP).
- **Consequências:** Backup via `VACUUM INTO` (não aceita parâmetros — rejeitar aspas simples no caminho). WAL separado por arquivo `.wal` e `.shm`.

## ADR-002 — axum 0.7 + tower-http CORS predicate

- **Data:** 2026-09-05
- **Status:** Ativo
- **Contexto:** O broker precisa aceitar requisições de origens WebView (`tauri://localhost`, `https://tauri.localhost`) e localhost de dev.
- **Decisão:** `AllowOrigin::predicate` com whitelist explícita. Wildcard (`*`) proibido porque o broker escuta em loopback com dados locais.
- **Alternativas rejeitadas:** Wildcard (`*`) — viola princípio de menor privilégio mesmo em loopback.
- **Consequências:** Novas origens legítimas exigem atualização manual da lista no `router.rs`.

## ADR-003 — Platform detection: SqliteStore > BrokerStore > BrowserStore

- **Data:** 2026-09-05
- **Status:** Ativo
- **Contexto:** SmartLearn roda em três contextos: Tauri (SQLite nativo), web+broker (broker reachable), web pura (offline).
- **Decisão:** Prioridade: `window.__TAURI_INTERNALS__` presente → SqliteStore; broker reachable em 500ms → BrokerStore; caso contrário → BrowserStore.
- **Consequências:** BrowserStore é fallback temporário. Usuários web sem broker têm dados em localStorage (perdível). Migration dialog aparece quando broker acessível + dados em localStorage.
