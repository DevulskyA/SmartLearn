# validation.md — server-first

## Gates obrigatórios (automatizados)

| Gate | Comando | Resultado esperado |
|------|---------|-------------------|
| Cargo tests | `cargo test` | 12/12 PASS |
| npm tests | `npm test` | 33/33 PASS |

## Critérios de aceitação verificados (T6.2 Fresh Verifier)

### Segurança
- [x] CORS não usa wildcard (`*`); usa `AllowOrigin::predicate` com lista explícita
- [x] `/api/migrate/import` valida prefixo SQL: rejeita DELETE/DROP/UPDATE/REPLACE puro
- [x] Backup VACUUM: rejeita caminhos com aspas simples (guard contra path injection)
- [x] Broker escuta exclusivamente em `127.0.0.1` (loopback), nunca `0.0.0.0`

### Correção
- [x] `hasBrowserStoreData` retorna `false` em JSON malformado (não lança)
- [x] `createBrokerStore.transaction` enfileira em IDB somente para `TypeError` (rede), não `Error` HTTP
- [x] `INSERT OR REPLACE` passa na validação do endpoint (prefixo "INSERT")
- [x] Backup idempotente: skip se destino já existe (guard same-second)
- [x] Rotação 30 dias: remove apenas arquivos `smartlearn-backup-<ts>.db` mais antigos que o limite

### Offline
- [x] SW registra app-shell cache no install; serve offline mesmo sem broker
- [x] SW não registra em Tauri (`window.__TAURI_INTERNALS__` guard em index.html)
- [x] Escritas offline enfileiradas no IDB são drenadas ao evento `online`

## Gate externo (HUMAN_GATE T6.3)

Revisão humana dos 19 commits em `claude/server-first-v1` antes de qualquer merge/PR/push.

## Critérios NÃO verificados (dívida aberta)

| Item | Motivo | Debt |
|------|--------|------|
| Migration JS rollback (crash entre removeItem e reload) | Requer decisão de produto | D-002 |
| SW cache invalidation strategy | Baixo risco; network-first mitiga | D-003 |
| syncPendingWrites retry com backoff | Baixo risco; dispara no evento online | D-004 |
