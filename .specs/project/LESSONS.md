---
name: project-lessons
description: Lições aprendidas durante o desenvolvimento do SmartLearn
metadata:
  type: project
---

# LESSONS.md — SmartLearn

Lições aprendidas em sessões de desenvolvimento. Atualizar a cada milestone.

---

## L-001 — ES modules estáticos bloqueiam testes no Node

Módulos com imports estáticos de Tauri (`@tauri-apps/api`, `@tauri-apps/plugin-sql`) falham ao
ser importados no runner Node.js (`node --test`) porque esses pacotes assumem o ambiente Tauri.
**Solução adotada:** separar código puro (sem dependências Tauri) em módulos standalone
(`broker-transport.js`, `migration.js`) importáveis diretamente em testes Node.

## L-002 — `localStorage` só é mockável via globalThis em Node

Funções que leem `localStorage.getItem()` não têm equivalente direto em Node. A solução correta
é ou (a) extrair a leitura do localStorage para fora da função (injeção de dependência), ou (b)
fazer mock de `globalThis.localStorage` no preâmbulo do teste.
**Status:** D-001 documenta a dívida pendente para `hasBrowserStoreData`.

## L-003 — `tokio::JoinHandle` drop não aborta a task

Ao fazer `tokio::spawn(...)` sem guardar o `JoinHandle`, a task continua rodando. Isso é
intencional para o servidor axum no broker (`start_broker`): o servidor vive enquanto o processo
Tauri viver, independente do `JoinHandle` ser descartado.

## L-004 — `VACUUM INTO` não aceita parâmetros em SQLite

A instrução `VACUUM INTO 'caminho'` não suporta binding de parâmetros SQLite (ex.: `VACUUM INTO ?`).
O caminho deve ser interpolado literalmente. Para evitar injeção, a função `backup()` em `db.rs`
rejeita caminhos com aspas simples antes da interpolação.

## L-005 — `AbortSignal.timeout` vs `TypeError` no fetch offline

Quando `fetch` é abortado por `AbortSignal.timeout()`, lança `DOMException` (não `TypeError`).
Quando falha por conexão recusada (ECONNREFUSED), lança `TypeError`. Ambos resultam em retorno
`false` de `checkBrokerReachable` porque o `catch` captura qualquer erro. Mas no
`createBrokerStore.transaction()`, o queue de offline usa `instanceof TypeError` — um timeout
NÃO seria enfileirado. Isso é correto: um timeout do servidor é diferente de ausência de rede.

## L-006 — `INSERT OR REPLACE` passa na validação do endpoint `/api/migrate/import`

O endpoint Rust valida o prefixo da instrução SQL: `"INSERT"`, `"CREATE"`, `"PRAGMA"`.
`INSERT OR REPLACE INTO ...` começa com `"INSERT"` e passa a validação.
Diferente de `REPLACE INTO ...` (que poderia ser confundido com `REPLACE` de string replace),
`INSERT OR REPLACE` é claramente uma variante de INSERT. Documentado para evitar confusão futura.
