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

## L-009 — Padrão de safety copy para operações destructivas em localStorage

Antes de qualquer `localStorage.removeItem(KEY)` que ocorre em janela assíncrona (entre await e reload):
1. `localStorage.setItem(BACKUP_KEY, raw)` — cópia de segurança
2. Se a operação FALHAR: remove o backup (dados ainda no source original)
3. Se a operação PASSAR: deixa o backup; remova-o na próxima inicialização confirmando que o destino tem os dados

Esse padrão reduz a janela de perda de dados a zero: o backup sempre existe quando os dados
foram removidos do source. A limpeza do backup é feita de forma preguiçosa (lazy cleanup) na
próxima execução bem-sucedida que confirma o destino.
**Caso real:** D-002 migration — backup antes de removeItem(BROWSER_STORE_KEY), cleanup em DB.init().

## L-008 — Módulos adicionados depois do SW precisam ser incluídos em SHELL_ASSETS

O SW caches SHELL_ASSETS no evento `install`. Módulos JS adicionados após o SW ser escrito
ficam fora da lista e não são pré-cacheados. O resultado: primeiro page load (sem SW controlando)
funciona; segundo page load offline falha porque o arquivo não está no cache.
**Regra:** sempre que um novo módulo JS for adicionado, verificar se está em `SHELL_ASSETS` em `sw.js`.
**Caso real:** `migration.js` foi criado em T4 mas omitido de SHELL_ASSETS; descoberto em reconciliação final.

## L-007 — Dependency injection torna IDB/localStorage testáveis em Node

Funções que dependem de `indexedDB` ou `localStorage` não são testáveis diretamente em Node.js.
O padrão adotado no projeto: aceitar um parâmetro opcional `{ queueTransaction }` em
`createBrokerStore` (default para `queueOfflineTransaction`), e helper `withLocalStorage(store, fn)`
em testes de migração. Ambos usam substituição temporária de globais — zero overhead de framework.
**Variante `globalThis.*`**: útil para substituições one-shot em testes isolados.
**Variante parâmetro default**: preferível quando o módulo tem múltiplos callers em produção.

## L-010 — Testes axum não precisam de TCP real: usar `Router::oneshot()`

Para testar handlers axum, importar `tower::ServiceExt` e chamar `router.oneshot(Request)`.
O router responde à requisição sem abrir nenhuma porta TCP. Cada teste cria seu próprio
`Router` com um SQLite em arquivo temporário — sem conflito de porta entre testes paralelos,
sem cleanup de servidor, sem `bind: address already in use` flaky.
**Caso real:** `src-tauri/src/broker/router.rs` usa este padrão em todos os testes de integração (T1.4).
O custo: o teste não exercita o stack HTTP real (headers, framing), mas exerce toda a lógica
de roteamento, middleware CORS e handlers — suficiente para os ACs do servidor local.

## L-006 — `INSERT OR REPLACE` passa na validação do endpoint `/api/migrate/import`

O endpoint Rust valida o prefixo da instrução SQL: `"INSERT"`, `"CREATE"`, `"PRAGMA"`.
`INSERT OR REPLACE INTO ...` começa com `"INSERT"` e passa a validação.
Diferente de `REPLACE INTO ...` (que poderia ser confundido com `REPLACE` de string replace),
`INSERT OR REPLACE` é claramente uma variante de INSERT. Documentado para evitar confusão futura.
