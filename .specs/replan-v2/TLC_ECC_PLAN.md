---
name: tlc-ecc-plan
description: Plano executável TLC Strict + ECC — server-central-v1 pós-audit
metadata:
  type: project
  phase: FASE_D
  created: 2026-09-05
---

# TLC/ECC Plan — SmartLearn server-central-v1

> Base: auditoria FASE A-C. Autoridade: 10 decisões canônicas do goal.
> Ordem: prerequisites → foundation → features. Nenhuma task avança sem DONE de deps.

---

## Pré-requisitos (HUMANO — fora do escopo do agente)

| ID | Objetivo | Blocker? |
|----|----------|---------|
| PRE-1 | Merge PR #3 em main (após HUMAN_GATE tests + UAT Tauri) | SIM |
| PRE-2 | Aprovação DC-10: URL/hosting do servidor, estratégia de auth, TLS | SIM |
| PRE-3 | Executar testes de PR #3 (npm + cargo) e confirmar PASS | SIM |
| PRE-4 | UAT Tauri: abrir app desktop, criar aula, completar revisão, exportar | SIM |

Nenhuma das tasks abaixo inicia antes de PRE-1 e PRE-2 serem concluídos.

---

## TASK-A01 — Binário axum standalone (servidor central)

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A01 |
| **Objetivo** | Extrair broker axum para binário Rust standalone (não subprocess Tauri). Roda independente de qualquer cliente. |
| **Dificuldade** | 3/5 |
| **Risco** | 3/5 — primeira mudança de arquitetura; sem regressão de DB |
| **Deps** | PRE-1, PRE-2 |
| **Arquivos** | Novo: `server/src/main.rs`, `server/Cargo.toml`. Aproveitar: `src-tauri/src/broker/db.rs`, `src-tauri/src/broker/router.rs` (adaptados). |
| **Invariantes** | DC-2 (servidor central), DC-3 (SQLite+WAL), DC-8 (NO_DATA_LOSS) |
| **Proposta de impl** | 1. Criar crate `smartlearn-server`. 2. Copiar db.rs e router.rs do broker. 3. Remover subprocess Tauri — servidor é processo independente. 4. URL/porta: configurável via env var SERVER_URL (não hardcoded). 5. HTTPS: configuração conforme decisão de DC-10. 6. Schema v3 (de PR #3) no servidor. |
| **Data/Migration** | Servidor inicia com schema v3. Migração V1→V3 via endpoint `/api/import`. NO_DATA_LOSS. |
| **ACs** | AC-1: `cargo run --bin smartlearn-server` sobe sem crash. AC-2: GET /api/health retorna 200. AC-3: POST /api/subjects cria subject no SQLite. AC-4: GET /api/health de cliente diferente (não Tauri) retorna 200. AC-5: servidor PERSISTE dados entre restarts. |
| **Testes** | Cargo tests: health, create subject, rollback, concurrent WAL reads. Reusar TempDb pattern. Sem TCP real (tower::ServiceExt::oneshot). |
| **Sensor de discriminação** | Rota GET /api/health — se retornar 200 de outro processo, servidor está central. |
| **Rollback** | Binário novo — não afeta Tauri nem cliente. Rollback = não usar. |
| **Gate** | Cargo test PASS + health reachable from separate process |
| **HUMAN_GATE** | HUMAN_GATE: aprovação de DC-10 (URL, auth, TLS) antes de deploy |
| **DONE** | `cargo test --bin smartlearn-server` PASS + health 200 de processo separado |

---

## TASK-A02 — Schema v3 no servidor

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A02 |
| **Objetivo** | Servidor usa schema v3 (learning_units, learning_evidence, exercises) — não study_records. |
| **Dificuldade** | 2/5 |
| **Risco** | 2/5 — schema correto já existe em PR #3; só precisa ser portado |
| **Deps** | TASK-A01 |
| **Arquivos** | `server/src/schema.sql` (extraído de PR #3 schemaStatements). `server/src/db.rs`. |
| **Invariantes** | DC-9 (dados primeiro), DC-3 (SQLite v1) |
| **Proposta de impl** | 1. Extrair schemaStatements de PR #3/src/db.js para arquivo SQL. 2. Aplicar via sqlx migrate ou PRAGMA user_version check. 3. Incluir ensureColumns equivalentes. 4. Campos: subjects, learning_units, review_tasks, exercises, learning_evidence, settings. |
| **Data/Migration** | Servidor cria banco novo com v3. Dados existentes chegam via endpoint import (TASK-A05). |
| **ACs** | AC-1: Servidor inicia com banco vazio — nenhum erro. AC-2: tabelas learning_units, learning_evidence existem. AC-3: tabela study_records NÃO existe. AC-4: foreign_keys ON verificado. |
| **Testes** | Rust: verificar tabelas via PRAGMA table_list. |
| **Sensor** | `PRAGMA table_list` — learning_units PRESENTE, study_records AUSENTE. |
| **Rollback** | Schema novo — banco novo. Sem dados reais para rollback. |
| **Gate** | Cargo test PASS + schema correto verificado |
| **HUMAN_GATE** | Nenhum |
| **DONE** | Cargo test + PRAGMA table_list confirma schema v3 |

---

## TASK-A03 — API domain-specific (substituir raw SQL)

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A03 |
| **Objetivo** | Substituir `/api/query` e `/api/execute` (SQL raw) por endpoints de domínio. |
| **Dificuldade** | 4/5 |
| **Risco** | 4/5 — mudança de protocolo cliente-servidor; clientes precisam atualizar |
| **Deps** | TASK-A02 |
| **Arquivos** | `server/src/handlers/subjects.rs`, `learning_units.rs`, `review_tasks.rs`, `settings.rs`. Router atualizado. |
| **Invariantes** | DC-2 (servidor autoridade), DC-9 (dados primeiro) |
| **Proposta de impl** | Endpoints mínimos para v1: `GET /api/subjects`, `POST /api/subjects`, `PATCH /api/subjects/:id`, `GET /api/learning-units`, `POST /api/learning-units` (com review_tasks associadas), `POST /api/review-tasks/:id/complete` (atômico: update RT + insert LE), `GET /api/agenda` (due today), `GET /api/settings`, `PUT /api/settings`. Manter `/api/health` e `/api/import`. Remover `/api/query` e `/api/execute`. |
| **Data/Migration** | N/A — novos endpoints, sem migration de dados |
| **ACs** | AC-1: POST /api/subjects cria subject. AC-2: POST /api/review-tasks/:id/complete é atômico (TX). AC-3: GET /api/agenda retorna revisões de hoje. AC-4: `/api/query` retorna 404. |
| **Testes** | Cargo tests por endpoint. Manter oneshot pattern. |
| **Sensor** | POST /api/review-tasks/:id/complete: verificar que learning_evidence row foi inserida na mesma TX. |
| **Rollback** | API nova — cliente também precisa atualizar. Rollback = reverter client JS. |
| **Gate** | Cargo test PASS por endpoint + `/api/query` retorna 404 |
| **HUMAN_GATE** | HUMAN_GATE: aprovação da lista de endpoints antes de implementar (proposta acima é rascunho) |
| **DONE** | Todos endpoints da lista PASS + `/api/query` 404 |

---

## TASK-A04 — lastSyncedAt + endpoint de agenda offline

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A04 |
| **Objetivo** | Implementar campo lastSyncedAt e endpoint GET /api/agenda para Android offline read-only. |
| **Dificuldade** | 2/5 |
| **Risco** | 1/5 — additive; sem mudança em dados existentes |
| **Deps** | TASK-A03 |
| **Arquivos** | `server/src/handlers/agenda.rs`. Schema: adicionar `last_synced_at` em settings ou nova tabela sync_state. |
| **Invariantes** | DC-5 (Android offline read), DC-8 (NO_DATA_LOSS) |
| **Proposta de impl** | 1. Adicionar campo `last_synced_at TEXT` em `settings`. 2. Atualizar `last_synced_at` em cada operação bem-sucedida de escrita. 3. GET /api/agenda: retorna `{lastSyncedAt, dueToday: [...], upcoming: [...]}`. 4. SW: cache GET /api/agenda com network-first + stale-while-revalidate. 5. Android offline: serve stale /api/agenda com aviso visual de lastSyncedAt. |
| **Data/Migration** | ALTER TABLE settings ADD COLUMN last_synced_at TEXT — additive, sem perda. |
| **ACs** | AC-1: settings tem last_synced_at após init. AC-2: GET /api/agenda retorna estrutura correta. AC-3: last_synced_at atualizado após complete review. AC-4: SW serve agenda offline com stale data. |
| **Testes** | Cargo: agenda endpoint. Jest/Vitest: SW serve stale agenda quando offline. |
| **Sensor** | GET /api/agenda offline (server down): SW retorna cached response com lastSyncedAt. |
| **Rollback** | ALTER TABLE additive — reversível com DROP COLUMN (SQLite 3.35+). |
| **Gate** | Cargo test PASS + SW offline test PASS |
| **HUMAN_GATE** | HUMAN_GATE: confirmação do escopo de "agenda" (quais campos, quanto lookforward) |
| **DONE** | GET /api/agenda retorna dados + SW serve stale offline |

---

## TASK-A05 — Migration BrowserStore/SQLite-local para servidor central

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A05 |
| **Objetivo** | Migrar dados de usuários existentes (BrowserStore ou SQLite Tauri local) para servidor central. ONE-WAY, NO_DATA_LOSS. |
| **Dificuldade** | 3/5 |
| **Risco** | 5/5 — operação sobre dados reais do usuário; irreversível |
| **Deps** | TASK-A03 |
| **Arquivos** | `src/migration.js` (reescrito). Aproveitar MIGRATION_BACKUP_KEY pattern (L-009). |
| **Invariantes** | DC-8 (NO_DATA_LOSS), DC-6 (sem escrita offline) |
| **Proposta de impl** | 1. `hasMigrationData()`: verifica learningUnits (schema v3) em localStorage — não studyRecords. 2. Antes de migrar: escrever MIGRATION_BACKUP_KEY. 3. `buildImportStatements()`: POST /api/import com dados v3. 4. Verificar resposta servidor (200 OK). 5. Apenas após confirmação: `localStorage.removeItem(BROWSER_STORE_KEY)`. 6. Se falha: manter backup intacto + mostrar erro. |
| **Data/Migration** | safety copy antes de qualquer removeItem. Servidor usa `/api/import` que valida integridade referencial. |
| **ACs** | AC-1: hasMigrationData checa learningUnits (não studyRecords). AC-2: falha de rede interrompe migração sem perda. AC-3: MIGRATION_BACKUP_KEY sobrevive ao processo. AC-4: removeItem só após 200 do servidor. |
| **Testes** | Jest: falha de rede mantém backup. Jest: sucesso limpa apenas BROWSER_STORE_KEY. |
| **Sensor** | Simular falha de rede antes de removeItem — MIGRATION_BACKUP_KEY deve estar intacto. |
| **Rollback** | MIGRATION_BACKUP_KEY — restaurar via BROWSER_STORE_KEY. |
| **Gate** | Jest PASS + HUMAN_GATE |
| **HUMAN_GATE** | HUMAN_GATE: teste de migração com dados reais do usuário (agente não pode tocar dados reais) |
| **DONE** | Jest PASS + usuário confirma migração com dados reais |

---

## TASK-A06 — Client JS atualizado para servidor central

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A06 |
| **Objetivo** | Substituir db.js paths (SQLite local / BrowserStore) por chamadas ao servidor central. Remover offline write queue. |
| **Dificuldade** | 4/5 |
| **Risco** | 3/5 — mudança de arquitetura do cliente; testes cobrem |
| **Deps** | TASK-A03, TASK-A04 |
| **Arquivos** | `src/db.js` (substituir BrokerStore por ServerStore), `src/broker-transport.js` (adaptar), `src/sw.js` (adaptar URL). Remover: offline write queue (queueOfflineTransaction, syncPendingWrites, IDB pending_writes). |
| **Invariantes** | DC-1 (PWA), DC-4 (shell fino), DC-6 (escrita offline ADIADA) |
| **Proposta de impl** | 1. Criar `createServerStore(serverUrl)` que substitui BrokerStore. Sem offline queue. 2. Falha de rede = erro propagado ao usuário. Sem fila silenciosa. 3. `checkServerReachable(serverUrl, 2000ms)`. 4. Hierarquia: ServerStore > BrowserStore (fallback read-only para offline view). 5. SW: intercept URL do servidor central (não 127.0.0.1). 6. SW SHELL_ASSETS: atualizar lista para remover broker-transport.js/migration.js. |
| **Data/Migration** | Migração via TASK-A05. DB client não gerencia migração diretamente. |
| **ACs** | AC-1: sem `queueOfflineTransaction` no código. AC-2: falha de rede ao completar revisão mostra erro ao usuário. AC-3: GET /api/agenda cacheado no SW. AC-4: BrowserStore offline = read-only (sem formulário de nova aula). |
| **Testes** | Jest: ServerStore cria subject via POST. Jest: falha de rede retorna erro, não enfileira. Vitest SW: intercept URL correta. |
| **Sensor** | Desligar servidor > tentar criar aula > deve mostrar erro, não silenciar. |
| **Rollback** | Git revert de src/db.js. |
| **Gate** | Jest + Vitest PASS |
| **HUMAN_GATE** | HUMAN_GATE: UAT com servidor rodando + offline mode manual |
| **DONE** | Jest PASS + UAT confirma erro em escrita offline |

---

## TASK-A07 — Tauri refatorado para shell fino

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A07 |
| **Objetivo** | Remover toda a lógica de DB do Tauri. Tauri = WebView + autenticação nativa. |
| **Dificuldade** | 3/5 |
| **Risco** | 4/5 — mudança estrutural do Tauri; Android e Windows afetados |
| **Deps** | TASK-A06, PRE-2 (auth decidida) |
| **Arquivos** | `src-tauri/src/lib.rs` (remover execute_sqlite_transaction, db commands). Remover: `src-tauri/src/broker/`. Manter: WebView, IPC para auth token, file dialog para export. |
| **Invariantes** | DC-4 (shell fino), DC-2 (servidor é autoridade) |
| **Proposta de impl** | 1. Remover plugin-sql e tauri-plugin-sql. 2. Remover execute_sqlite_transaction command. 3. Tauri apenas: abre WebView na URL do servidor. 4. IPC remanescente: file_dialog para export CSV (não DB). 5. Auth: depende de DC-10. |
| **ACs** | AC-1: Tauri abre sem erro após remover plugin-sql. AC-2: Nenhum invoke('execute_sqlite_transaction') no JS. AC-3: App funciona (via servidor) em Windows. |
| **Testes** | Cargo build PASS. Smoke: abrir app, ver lista de aulas (vinda do servidor). |
| **Sensor** | Grep: nenhum `execute_sqlite_transaction` em src/. |
| **Rollback** | Git revert src-tauri/. Dados no servidor não afetados. |
| **Gate** | Cargo build PASS + smoke Windows |
| **HUMAN_GATE** | HUMAN_GATE: UAT Windows + Android após refatoração Tauri |
| **DONE** | Cargo build PASS + UAT Windows + UAT Android confirmados por humano |

---

## TASK-A08 — Service Worker para servidor central

| Campo | Valor |
|-------|-------|
| **ID** | TASK-A08 |
| **Objetivo** | Atualizar SW para interceptar URL do servidor central (não 127.0.0.1). Shell assets atualizados. Offline: agenda read-only. |
| **Dificuldade** | 2/5 |
| **Risco** | 1/5 — SW é additive; não afeta lógica de dados |
| **Deps** | TASK-A04, TASK-A06 |
| **Arquivos** | `src/sw.js`. |
| **Invariantes** | DC-1 (PWA), DC-5 (offline read agenda) |
| **Proposta de impl** | 1. URL do servidor: configurável via `const SERVER_URL = self.registration.scope + 'api'` ou env injetada no build. 2. SHELL_ASSETS: remover broker-transport.js, migration.js. Adicionar db.js, app.js, review-score.js, review-schedule.js, stats.js. 3. SW intercept: `url.origin === SERVER_ORIGIN && url.pathname.startsWith('/api/')`. 4. GET /api/agenda: cache-first + network update. 5. Writes (POST/PATCH): network-only + erro se offline. |
| **ACs** | AC-1: SW instala sem erro com nova lista SHELL_ASSETS. AC-2: Offline + SW ativo: GET /api/agenda retorna stale. AC-3: Offline: POST /api/learning-units retorna 503 (não enfileira). AC-4: Novo CACHE_NAME bumped. |
| **Testes** | Vitest (service worker test): install, agenda offline, write 503. |
| **Sensor** | DevTools: Network offline + POST learning-units retorna 503. |
| **Rollback** | Git revert src/sw.js. |
| **Gate** | Vitest SW PASS |
| **HUMAN_GATE** | Nenhum |
| **DONE** | Vitest PASS + smoke de offline agenda no browser |

---

## Sequência e Dependências

```
PRE-1 ──► PRE-2 ──► PRE-3 ──► PRE-4
               │
               ▼
          TASK-A01 (servidor standalone)
               │
               ▼
          TASK-A02 (schema v3)
               │
               ▼
          TASK-A03 (API domain)
               │
          ┌────┴────┐
          ▼         ▼
     TASK-A04    TASK-A05
    (agenda)   (migration)
          │
          ▼
     TASK-A06 (client)
          │
     ┌────┴────┐
     ▼         ▼
TASK-A07   TASK-A08
 (Tauri)     (SW)
```

**Caminho crítico:** PRE-2 > TASK-A01 > A02 > A03 > A04/A05 > A06 > A07/A08

---

## Métricas de DONE global

| Métrica | Critério |
|---------|---------|
| Cargo tests | 100% PASS (servidor + db.rs) |
| npm/Vitest tests | 100% PASS (client + SW) |
| Smoke Windows | App abre + cria aula + completa revisão |
| Smoke Android | App abre + visualiza agenda offline |
| Migração | 0 registros perdidos (HUMAN_GATE) |
| Offline write | Erro visível ao usuário — sem fila silenciosa |
| Offline read | Agenda disponível com lastSyncedAt visível |
