---
name: asis-tobe-gaps
description: Matriz AS-IS x TO-BE — 10 decisões canônicas vs estado comprovado dos PRs
metadata:
  type: project
  phase: FASE_C
  created: 2026-09-05
---

# AS-IS × TO-BE — Gaps e Ações

> Fonte canônica: 10 decisões aprovadas pelo usuário (goal /goal 2026-09-05).
> Evidência: leitura direta dos arquivos fonte dos dois PRs; nenhuma suposição.

---

## Matriz Principal

### DC-1: Uma única Web App/PWA responsiva

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | App única — PWA responsiva. Nenhuma aplicação separada por plataforma. |
| **AS-IS comprovado** | PR #3: SPA HTML/CSS/JS sem framework. Sem roteamento por plataforma. `hasTauriRuntime()` isola apenas chamadas SQLite, não fork de UI. BrowserStore = fallback web funcional. PWA: sw.js em PR #4 (não em PR #3). |
| **GAP** | PR #3 não tem Service Worker — PWA incompleta no PR que contém o domínio correto. PR #4 tem SW mas com assets de broker-era hardcoded. |
| **AÇÃO** | Portar sw.js de PR #4 para PR #3 com shell assets atualizados (remover broker-transport.js/migration.js; adicionar src/db.js, src/app.js etc). Fazer merge dos dois PRs antes de server-first-v2. |
| **EVIDÊNCIA** | PR #4/src/sw.js: SHELL_ASSETS inclui broker-transport.js. PR #3: sem sw.js no worktree. |

---

### DC-2: Servidor CENTRAL independente do computador do aluno = única autoridade dos dados

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Servidor central (não local, não por device). Única autoridade dos dados. |
| **AS-IS comprovado** | PR #4: broker axum em 127.0.0.1:57321 roda como subprocess do Tauri no device do aluno. PR #3: sem servidor; autoridade = SQLite local via plugin Tauri ou BrowserStore. |
| **GAP** | **CRÍTICO.** Nenhum dos dois PRs implementa servidor central. PR #4 é local por device. PR #3 é cliente puro. |
| **AÇÃO** | Criar novo branch `server-central-v1`: axum como binário standalone, não subprocess Tauri. URL do servidor configurável (não hardcoded 127.0.0.1). Decisão #10 (auth, hosting, porta) ainda é PROPOSTA — requer aprovação antes de implementar. |
| **EVIDÊNCIA** | PR #4/src/broker-transport.js:2 `baseUrl='http://127.0.0.1:57321'`. PR #4/src-tauri/src/broker/mod.rs (inferido): `start_broker` chamado em setup do Tauri. |

---

### DC-3: SQLite + WAL no servidor na v1. PostgreSQL/Turso adiados.

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | SQLite com WAL no servidor. Postgres/Turso são adiados. |
| **AS-IS comprovado** | PR #4/db.rs: WAL implementado (`enable_wal`), `open_pool` com SqliteConnectOptions, `VACUUM INTO` backup, `rotate_backups`. Funciona. Schema é antigo (study_records). PR #3: SQLite via plugin Tauri `execute_sqlite_transaction`, sem configuração WAL explícita no JS. |
| **GAP** | WAL correto em PR #4 mas schema obsoleto. Schema correto em PR #3 mas no servidor não existe ainda. |
| **AÇÃO** | Para server-central-v1: usar db.rs de PR #4 (WAL + backup) COM o schema v3 de PR #3 (learning_units, learning_evidence). |
| **EVIDÊNCIA** | PR #4/src-tauri/src/broker/db.rs:13-18 (WAL). PR #3/src/db.js:21 `SCHEMA_VERSION = 3`. |

---

### DC-4: Windows/Android = shells finos da mesma aplicação

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Tauri = shell fino. App lógica roda no servidor. Clients são PWA. |
| **AS-IS comprovado** | PR #3: Tauri é autoridade do banco (invoke execute_sqlite_transaction). Toda a lógica de domínio está no JS do cliente (db.js). PR #4: Tauri hospeda broker SQLite local — ainda mais pesado, não mais fino. |
| **GAP** | Tauri atual não é shell fino — é autoridade de dados. Para ser shell fino, precisa apenas de WebView apontado para servidor central + autenticação. |
| **AÇÃO** | Na arquitetura servidor-central: Tauri exibe a PWA do servidor. `execute_sqlite_transaction` e toda lógica DB removida do Tauri. Novo Tauri: apenas WebView + autenticação native. HUMAN_GATE: decisão de manter Tauri ou mudar para Electron/PWA puro. |
| **EVIDÊNCIA** | PR #3/src/db.js:512-514 `hasTauriRuntime()` condiciona todo o path SQLite. |

---

### DC-5: Android offline v1 = leitura da última agenda sincronizada + lastSyncedAt

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Offline read-only: agenda sincronizada, campo `lastSyncedAt`. Defasagem aceita. |
| **AS-IS comprovado** | Nenhum dos dois PRs implementa `lastSyncedAt`. PR #4 tem `createBrokerStore` com fila offline de ESCRITA (contradiz DC-6). Não há endpoint de sync. |
| **GAP** | **TOTAL.** Campo `lastSyncedAt` ausente do schema em ambos os PRs. Sem endpoint de sincronização. Sem cache offline read-only. |
| **AÇÃO** | Adicionar `lastSyncedAt` ao schema do servidor (review_tasks ou settings). Criar endpoint GET /api/agenda (agenda do dia + próximas revisões). SW cache para leitura offline da agenda. HUMAN_GATE: definir escopo da "agenda" (quais dados cacheados). |
| **EVIDÊNCIA** | PR #3/src/db.js: sem `lastSyncedAt` em nenhuma tabela. PR #4/src/broker-transport.js: IDB pending_writes = escrita offline (incorreta). |

---

### DC-6: Escrita offline ADIADA. Criar/alterar/concluir revisão exige conexão.

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Offline write ADIADO. Toda escrita exige conexão com servidor. |
| **AS-IS comprovado** | PR #4/src/broker-transport.js: implementa fila offline (IDB `pending_writes`, `queueOfflineTransaction`, `syncPendingWrites`, `registerOnlineSync`). Esta implementação contradiz diretamente DC-6. PR #3: sem fila offline — compatível. |
| **GAP** | PR #4 implementa exatamente o que DC-6 proíbe. |
| **AÇÃO** | DESCARTAR toda a lógica offline de PR #4 (queueOfflineTransaction, drainPendingWrites, registerOnlineSync, IDB pending_writes). No servidor central: se conexão falhar durante escrita, mostrar erro ao usuário — sem buffer. |
| **EVIDÊNCIA** | PR #4/src/broker-transport.js:42-90 (fila offline completa). |

---

### DC-7: Scheduler simples/fixo agora. Adaptativo depois.

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Scheduler fixo (SM-2 simplificado ou intervals fixos). FSRS/adaptativo adiado. |
| **AS-IS comprovado** | PR #3: review_schedule em settings; review-schedule.js com cálculo de próximas datas. Lógica fixada no cliente JS. |
| **GAP** | Scheduler no cliente, não no servidor. Para server-first: servidor deve calcular próximas datas na revisão (ou endpoint GET /api/due retorna agenda pré-calculada). |
| **AÇÃO** | Mover cálculo de due_date para o servidor em server-central-v1. Manter algoritmo fixo (não FSRS). HUMAN_GATE: confirmar regras do scheduler (Leitner? SM-2 fixo?). |
| **EVIDÊNCIA** | PR #3/src/review-schedule.js (cliente). |

---

### DC-8: Migração de dados = NO_DATA_LOSS

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Toda migration preserva dados. Zero perda. |
| **AS-IS comprovado** | PR #3: `assertImportData` + `validateImportContent` com integridade referencial completa. `migrateV1ImportData` backward-compat. `buildClearStatements` não apaga settings. Safety copy pattern (MIGRATION_BACKUP_KEY). PR #4/src-tauri/db.rs: `VACUUM INTO` backup antes de qualquer operação. |
| **GAP** | schema antigo de PR #4 (study_records) não tem path de migração para schema v3. Se PR #4 for mergeado antes de PR #3, dados em study_records seriam perdidos sem migração. |
| **AÇÃO** | Merge PR #3 antes de qualquer branch server-first. Validar que migration V1→V3 cobre todos os cenários de dados existentes antes de deploy. HUMAN_GATE: teste de migração com dados reais (impossível para agente). |
| **EVIDÊNCIA** | PR #4/src/migration.js:10 usa `state?.studyRecords` (schema antigo). PR #3/src/db.js:225 `migrateV1ImportData`. |

---

### DC-9: Arquitetura de dados primeiro; depois i18n/copy; depois UX.

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | Prioridade: schema/domínio > i18n > UX. Não avançar UX sem schema estável. |
| **AS-IS comprovado** | PR #3: schema v3 correto (learning_units, learning_evidence). PR #4: schema antigo (study_records). Ambos: sem i18n formal (strings hardcoded em pt-BR). |
| **GAP** | PR #4 viola DC-9 ao ter schema desatualizado enquanto avança na implementação do servidor. Nenhum dos PRs tem i18n formal — mas isso está em ordem per DC-9 (schema primeiro). |
| **AÇÃO** | Bloquear PR #4 até schema ser v3. Confirmar que server-central-v1 começa com schema v3. i18n formal = fase posterior. |
| **EVIDÊNCIA** | PR #3/src/db.js:21 `SCHEMA_VERSION = 3`. PR #4/src/db.js: sem SCHEMA_VERSION, cria study_records. |

---

### DC-10: Axum, porta, auth, hosting, deployment = PROPOSTAS, não decisões

| Campo | Conteúdo |
|-------|----------|
| **DECISÃO CANÔNICA** | DC-10 (axum, 57321, nenhuma auth, localhost, etc.) são PROPOSTAS. Precisam aprovação explícita antes de implementar em produção. |
| **AS-IS comprovado** | PR #4 implementa: axum como servidor, porta 57321, sem auth, CORS localhost. Tudo isso como fait accompli. |
| **GAP** | PR #4 implementou propostas como fatos. Falta aprovação das decisões de deployment/auth/hosting. |
| **AÇÃO** | HUMAN_GATE: aprovação das decisões de infraestrutura antes de server-central-v1. Mínimo: (a) URL/hosting, (b) estratégia de autenticação, (c) porta/TLS. |
| **EVIDÊNCIA** | PR #4: axum hard-coded. Goal: "Axum, porta, auth, hosting e detalhes de deployment são PROPOSTAS, não decisões aprovadas." |

---

## Mapa de Gaps por Severidade

| Severidade | Decisão | Gap | Bloqueia v1? |
|-----------|---------|-----|-------------|
| CRÍTICO | DC-2 | Nenhum servidor central existe | SIM |
| CRÍTICO | DC-10 | Infra/auth/deploy não decididos | SIM |
| ALTO | DC-5 | `lastSyncedAt` ausente, sem sync endpoint | SIM (Android offline) |
| ALTO | DC-6 | Offline write queue implementada (errado) | SIM (descartar) |
| ALTO | DC-4 | Tauri não é shell fino | SIM |
| MÉDIO | DC-1 | Service Worker ausente em PR #3 | Não bloqueia logic |
| MÉDIO | DC-3 | WAL correto mas schema errado em PR #4 | Não bloqueia (PR #4 descartado) |
| MÉDIO | DC-7 | Scheduler no cliente, não servidor | Não bloqueia v1 |
| BAIXO | DC-8 | Sem path de migração study_records→v3 | Não bloqueia se PR #3 primeiro |
| BAIXO | DC-9 | i18n ausente (correto — data first) | Não bloqueia |

---

## Sequência de Resolução

```
1. Merge PR #3 (schema v3 + validação) em main                          [HUMAN_GATE: tests + UAT]
2. HUMAN_GATE: aprovar DC-10 (auth, URL, hosting)                        [blocker]
3. server-central-v1: binário axum standalone + schema v3                 [após DC-10]
4. Adicionar lastSyncedAt + endpoint GET /api/agenda                      [DC-5]
5. SW atualizado para URL do servidor central                              [DC-1 + DC-4]
6. Tauri refatorado para shell WebView                                     [DC-4]
```

Passos 3-6 requerem que DC-10 seja aprovado (HUMAN_GATE) — sem isso não há como saber URL, auth ou hosting para implementar.
