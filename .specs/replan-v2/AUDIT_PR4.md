---
name: audit-pr4
description: Auditoria PR #4 — server-first experimental (HEAD 1ca54e71)
metadata:
  type: project
  phase: FASE_B
  created: 2026-09-05
  supersedes: .specs/features/server-first/tasks.md (T6.3 HUMAN_GATE) e .specs/features/server-first/validation.md
---

# AUDIT PR #4 — server-first experimental

**Branch:** `claude/server-first-v1`
**HEAD auditado:** `1ca54e71143245c08e3f7d2a4cc645f0f187ffea`
**Base (merge-base com A):** `25756494268ab9a2bc49d6dcfc10a14d9f66f5ad`
**Evidências:** src-tauri/src/broker/{db.rs,router.rs,mod.rs}, src/db.js, src/broker-transport.js, src/migration.js, src/sw.js

> PUBLICAR PARA INSPEÇÃO NÃO APROVA A IMPLEMENTAÇÃO.
> Classificações abaixo seguem AUTORIDADE CANÔNICA definida no goal.

---

## 1. Processo do Servidor (Rust axum)

### 1a. src-tauri/src/broker/db.rs

| Componente | Classificação | Evidência |
|------------|--------------|-----------|
| `open_pool` com SqliteConnectOptions: create_if_missing + foreign_keys | **APROVEITAR** | db.rs:5-11 — correto |
| `enable_wal`: journal_mode=WAL + synchronous=NORMAL + autocheckpoint=1000 | **APROVEITAR** | db.rs:13-18 — configuração sólida |
| `backup` via VACUUM INTO com guard de aspas simples | **APROVEITAR** | db.rs:22-33 — proteção correta contra injection |
| `startup_backup + rotate_backups (30 dias)` | **APROVEITAR** | db.rs:69-83 — padrão seguro |
| Testes: open_pool, enable_wal, backup, rotate, quote-guard | **APROVEITAR** | 4 testes sólidos, TempDb pattern correto |

### 1b. src-tauri/src/broker/router.rs

| Componente | Classificação | Evidência |
|------------|--------------|-----------|
| `row_to_json` waterfall (i64 > f64 > String > Null) | **APROVEITAR** | router.rs:38-57 — type coercion correto |
| `bind_params!` macro | **APROVEITAR** | router.rs:61-83 — funciona bem |
| `/api/health` endpoint | **APROVEITAR** | router.rs:85-87 |
| `/api/transaction` com rollback em falha | **APROVEITAR** | router.rs:119-165 |
| `MAX_TRANSACTION_STATEMENTS = 100` guard | **APROVEITAR** | router.rs:12 |
| `migrate_import_handler` com validação INSERT/CREATE/PRAGMA | **APROVEITAR** | router.rs:190-239 — protege contra DROP/DELETE |
| Body limit 16MB | **APROVEITAR** | router.rs:263 |
| Testes via `tower::ServiceExt::oneshot()` (L-010) | **APROVEITAR** | TempDb, sem TCP real, 10 testes |
| **`/api/query` e `/api/execute` — SQL raw exposto** | **DESCARTAR (nesta forma)** | Qualquer SQL pode ser enviado do client; sem domain enforcement; inaceitável num servidor central multi-usuário |
| **CORS: AllowOrigin::predicate para localhost/tauri** | **ADAPTAR** | Correto para broker local; para servidor central precisa de origem real (domínio deployado) |

### 1c. Independência do Tauri

| Item | Classificação | Evidência |
|------|--------------|-----------|
| Broker axum roda como tokio task dentro do processo Tauri | **DESCARTAR** | mod.rs (não lido mas inferido de L-003): broker é filho do Tauri, não processo independente |
| Porta hardcoded 57321 no código cliente | **DESCARTAR** | migration.js:56 `http://127.0.0.1:57321` hardcoded |
| Broker é local (127.0.0.1) — depende do dispositivo do aluno | **DESCARTAR** | Contradiz AUTORIDADE CANÔNICA #2: servidor CENTRAL |
| `start_broker` sem JoinHandle — falha silenciosa (DEBT-006) | **DESCARTAR** | Degradação silenciosa para BrowserStore; não aplicável num servidor central |

---

## 2. SQLite/WAL no Servidor

| Item | Classificação | Evidência |
|------|--------------|-----------|
| Pool SqlitePool com foreign_keys=ON | **APROVEITAR** | db.rs:9 |
| WAL mode com synchronous=NORMAL | **APROVEITAR** | db.rs:14-15 — correto para SSD/servidor |
| autocheckpoint=1000 | **APROVEITAR** | db.rs:16 — razoável |
| **Schema do servidor: OLD (study_records, sources)** | **DESCARTAR** | schemaStatements em db.js cria study_records, sources — schema obsoleto. Servidor central precisa do schema v3 |
| VACUUM INTO backup no servidor | **APROVEITAR** | db.rs:22-33 — seguro, testado |

---

## 3. API / Protocolo

| Item | Classificação | Evidência |
|------|--------------|-----------|
| JSON-over-HTTP como protocolo cliente-servidor | **APROVEITAR** | boa escolha para PWA |
| Formato `{sql, params}` → passagem de SQL raw do cliente | **ADAPTAR→DESCARTAR** | Para servidor central: API deve ser domain-specific (POST /api/subjects, etc.), não SQL raw |
| Retorno `{rows: [...]}` de queries | **ADAPTAR** | Formato reutilizável se API domain-specific retornar arrays |
| Retorno `{rows_affected, last_insert_id}` de executes | **ADAPTAR** | idem |
| `/api/schema` introspection | **ADIAR** | útil para debug; não necessário em produção v1 |

---

## 4. BrokerStore (JS client)

| Item | Classificação | Evidência |
|------|--------------|-----------|
| `checkBrokerReachable(127.0.0.1, 500ms)` | **ADAPTAR** | URL e timeout precisam mudar para servidor central |
| `wrapBrokerAsDatabase(transport)` | **ADAPTAR** | O padrão adapter é bom; implementação depende do schema antigo |
| `createBrokerStore.transaction()` | **ADAPTAR** | Lógica de transport OK; offline queue deve ser REMOVIDA |
| `fetchWithRetry(retries=1)` | **APROVEITAR** | lógica simples e correta |
| **Offline write queue (IDB pending_writes)** | **DESCARTAR** | Contradiz AUTORIDADE CANÔNICA #6: escrita offline ADIADA |
| **`queueOfflineTransaction`** | **DESCARTAR** | idem |
| **`syncPendingWrites / registerOnlineSync`** | **DESCARTAR** | idem |
| **`drainPendingWrites / clearPendingWrite`** | **DESCARTAR** | idem |

---

## 5. Service Worker (src/sw.js)

| Item | Classificação | Evidência |
|------|--------------|-----------|
| CACHE_NAME / QUERY_CACHE_NAME versioning | **APROVEITAR** | boa prática |
| Shell assets pré-cache em install | **APROVEITAR** | sw.js:17-22 |
| Activate: cleanup de caches antigos | **APROVEITAR** | sw.js:24-32 |
| Network-first para /api/query com fallback de cache | **ADAPTAR** | url.hostname === '127.0.0.1' — hardcoded broker local; servidor central terá URL diferente |
| Cache-first para assets do mesmo origin | **APROVEITAR** | sw.js:83-96 |
| **Intercepts 127.0.0.1 specifically** | **ADAPTAR** | SW precisa interceptar URL do servidor central em vez de 127.0.0.1 |
| bodyHash via crypto.subtle para cache key de POST | **APROVEITAR** | sw.js:34-37 — elegante |
| Offline fallback 503 para broker API | **ADAPTAR** | Conceito bom; adaptar para nova URL |
| SHELL_ASSETS lista apenas módulos do broker-era | **CORRIGIR** | lista inclui broker-transport.js e migration.js — precisará atualizar na v2 |

---

## 6. Migration BrowserStore→Broker

| Item | Classificação | Evidência |
|------|--------------|-----------|
| migration.js: `hasBrowserStoreData()` checa studyRecords (schema antigo) | **DESCARTAR** | schema antigo; nova migration precisará checar schema v3 (learningUnits) |
| `buildMigrationStatements` — INSERT OR REPLACE no schema antigo | **DESCARTAR** | estuda studyRecords/sources; incompatível com schema v3 |
| Padrão safety copy (MIGRATION_BACKUP_KEY) | **APROVEITAR** | L-009 — dois-fases antes de removeItem; preservar padrão |
| DB.init() 3-way: BrokerStore > SQLite > BrowserStore | **ADAPTAR** | Hierarquia correta (servidor > offline fallback) mas URLs precisam mudar |

---

## 7. Segurança

| Item | Severidade | Evidência |
|------|-----------|-----------|
| **Sem autenticação em nenhum endpoint** | CRÍTICO para multi-user | Todos os endpoints aceitam qualquer request da origem permitida |
| **SQL raw via /api/query e /api/execute** | ALTO | Qualquer SQL pode ser injetado via body JSON pelo cliente |
| **HTTPS ausente** | ALTO para servidor central | HTTP only; broker local OK, servidor real exige TLS |
| **Porta hardcoded 57321** | MÉDIO | Sem config; conflito causa degradação silenciosa (DEBT-006) |
| **CORS predicate inclui qualquer localhost** | MÉDIO | `s.starts_with("http://localhost")` permite qualquer porta localhost |
| **Sem rate limiting** | MÉDIO para servidor central | Qualquer cliente pode enviar 100 statements/request ilimitadamente |
| **Sem validação de domínio no body** | MÉDIO | Os handlers Rust não validam o significado dos SQLs, apenas sintaxe |

---

## 8. Readiness Multiusuário

| Requisito | Status |
|-----------|--------|
| Auth/session | AUSENTE |
| Row-level isolation por usuário | AUSENTE — 1 DB único para tudo |
| Rate limiting | AUSENTE |
| Domain API (não SQL raw) | AUSENTE |
| HTTPS | AUSENTE |
| Deploy independente do Tauri | AUSENTE — broker é subprocess do Tauri |

**Conclusão:** PR #4 NÃO está pronto para multi-usuário. É um protótipo single-user local.

---

## 9. Testes (PR #4)

| Item | Classificação | Evidência |
|------|--------------|-----------|
| 16 Rust tests PASS (cargo) | NOT_RERUN | Evidência histórica; não reexecutado nesta auditoria |
| 34 npm tests PASS | NOT_RERUN | Idem — baseados no schema antigo |
| Rust tests são de alta qualidade (TempDb, oneshot, rollback) | **APROVEITAR padrão** | router.rs:268-600 — padrão reutilizável |
| npm tests usam broker simulado / BrowserStore (schema antigo) | **DESCARTAR conteúdo** | precisarão ser reescritos para schema v3 |

---

## 10. Compatibilidade com Canonical Architecture

| Decisão Canônica | Status em PR #4 |
|-----------------|----------------|
| **2. Servidor CENTRAL** | **INCOMPATÍVEL** — broker é local (127.0.0.1) no device do aluno |
| **3. SQLite+WAL no servidor** | PARCIAL — WAL implementado mas servidor é local |
| **4. Shells finos Windows/Android** | INCOMPATÍVEL — Tauri ainda é autoridade do DB local |
| **5. Offline read com lastSyncedAt** | AUSENTE — sem endpoint de sync ou lastSyncedAt |
| **6. Escrita offline ADIADA** | **INCOMPATÍVEL** — offline write queue implementada |
| **9. Arquitetura dados primeiro** | **INCOMPATÍVEL** — schema OLD (study_records, sources) |

---

## 11. O Que Aproveitar no Replan

### Código APROVEITÁVEL de PR #4:
1. `src-tauri/src/broker/db.rs` — pool, WAL, backup, rotate (100% aproveitável)
2. Padrão de testes Rust: TempDb + tower::ServiceExt::oneshot (padrão, não conteúdo)
3. `router.rs:transaction_handler` (com rollback) — aproveitável, adaptar CORS
4. `router.rs:migrate_import_handler` — aproveitável para migration one-time
5. `src/sw.js` — estrutura shell/query cache, bodyHash
6. `fetchWithRetry` — aproveitável
7. `wrapBrokerAsDatabase` — padrão adapter aproveitável, implementação a mudar
8. Padrão safety copy migration (MIGRATION_BACKUP_KEY)

### Código DESCARTADO de PR #4:
1. `/api/query` e `/api/execute` raw SQL — substituir por API domain-specific
2. Toda a fila offline (IDB pending_writes, queueOfflineTransaction, syncPendingWrites)
3. `migration.js` com schema antigo (studyRecords, sources)
4. `db.js` de PR #4 — substituir pelo db.js de PR #3 (schema correto)
5. Schema antigo em schemaStatements (study_records, sources)
6. `checkBrokerReachable(127.0.0.1)` — trocar pela URL do servidor central
7. Toda a lógica de detecção de porta local

---

## Sumário Executivo

PR #4 é um **protótipo válido de conceitos** mas arquiteturalmente incompatível com as decisões canônicas #2, #6 e #9. O maior valor está no código Rust (db.rs, testes) e nos padrões de SW/transport — não na arquitetura de broker local.

**O que NÃO pode ser mergeado como está:**
- Broker local contradiz servidor central (decisão #2)
- Offline write queue contradiz decisão #6
- Schema antigo contradiz schema v3 de PR #3 (decisão #9)

**VEREDICTO: NÃO APROVAR implementação. Aproveitar componentes isolados conforme ASIS_TOBE_GAPS.md e TLC_ECC_PLAN.md.**
