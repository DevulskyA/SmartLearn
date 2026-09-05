# tasks.md — server-first

Rastreamento de tarefas da feature server-first (branch: `claude/server-first-v1`).

## Status final

| Task | Descrição | Status |
|------|-----------|--------|
| T1.1 | SQLite pool + WAL (`broker/db.rs`) | ✅ PASS |
| T1.2 | axum router, CORS predicate, 5 rotas | ✅ PASS |
| T1.3 | Broker startup wired no hook Tauri | ✅ PASS |
| T1.4 | Testes de integração oneshot (sem TCP) | ✅ PASS |
| T2.1 | BrokerStore transport JS (query/transaction) | ✅ PASS |
| T2.2 | Detecção de plataforma em `DB.init()` | ✅ PASS |
| T2.3 | Contract tests fetch-mocked | ✅ PASS |
| T3.1 | Service Worker: registro + guard Tauri | ✅ PASS |
| T3.2 | SW cache de leitura `/api/query` network-first | ✅ PASS |
| T3.3 | Write buffer offline → IDB `pending_writes` | ✅ PASS |
| T3.4 | Background sync no evento `online` | ✅ PASS |
| T4.1 | `POST /api/migrate/import` atômico (Rust) | ✅ PASS |
| T4.2 | Dialog de migração PT-BR (`showMigrationDialog`) | ✅ PASS |
| T5.1 | Backup startup VACUUM + rotação 30 dias | ✅ PASS |
| T6.1 | Validação de integração (gates cargo + npm) | ✅ PASS |
| T6.2 | Fresh Verifier (CORS/SQL injection/offline) | ✅ PASS |
| T6.3 | SERVER_FIRST_CORRECTION_READY | 🔴 HUMAN_GATE |

## Gates de conclusão

- `cargo test`: 13/13 PASS
- `npm test`: 33/33 PASS (inclui testes D-001 + offline queue TypeError vs HTTP Error)
- Verificador fresco: sem issues de segurança ou correção
