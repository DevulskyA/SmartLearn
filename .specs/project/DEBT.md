---
name: project-debt
description: Known technical debt items in SmartLearn, ordered by priority
metadata:
  type: project
---

# DEBT.md — SmartLearn

Itens de dívida técnica conhecidos. Atualizar ao identificar ou resolver.

---

## ~~D-001 — `hasBrowserStoreData` não testada (localStorage)~~ ✅ FECHADA

- **Resolvida:** 4 testes unitários adicionados em `test/migration.test.js` usando `withLocalStorage` helper
  que substitui `globalThis.localStorage` por test scope. Cobre: key ausente, studyRecords vazio,
  studyRecords com entrada, JSON malformado.

## ~~D-002 — Migração não tem rollback no lado JS~~ ✅ FECHADA

- **Resolvida:** `MIGRATION_BACKUP_KEY` salvo em `localStorage` ANTES de `removeItem(BROWSER_STORE_KEY)`.
  Se o app crashar no intervalo entre removeItem e reload, o backup preserva os dados.
  Na próxima inicialização com broker reachable, DB.init() remove o backup automaticamente
  (confirmação implícita de que SQLite tem os dados). Se a POST falhar, o backup é removido
  imediatamente (migração não aconteceu — dados ainda no localStorage principal).

## D-003 — SW não tem estratégia de invalidação do cache de queries

- **Risco:** Baixo. Usuário pode ver dados obsoletos até navegar de forma que force network.
- **Motivo:** O cache `smartlearn-query-v1` é network-first, então só fica obsoleto no modo offline.
  Ao voltar online, a próxima requisição idêntica atualiza o cache.
- **Caminho:** Adicionar header `Cache-Control: no-store` ou versão no cache-key em iteração futura.

## D-006 — Conflito de porta 57321 causa degradação silenciosa para BrowserStore

- **Risco:** Médio. Se a porta `127.0.0.1:57321` estiver em uso por outro processo,
  `start_broker` falha silenciosamente, `checkBrokerReachable()` retorna `false`, e
  `DB.init()` cai para BrowserStore. Usuário Tauri com dados em SQLite vê app vazio.
- **Motivo:** Porta hardcoded em `BROKER_PORT = 57321` sem detecção de conflito.
  O broker usa `TcpListener::bind` que retorna erro se a porta estiver ocupada,
  mas o erro é absorvido pela task spawned sem JoinHandle (L-003).
- **Caminho:** Adicionar health-check no startup do Tauri: se `checkBrokerReachable()`
  retornar false após N ms, logar erro visível ao usuário (toast ou console) antes do
  fallback; ou tentar portas alternativas na faixa 57321–57330.

## D-004 — `syncPendingWrites` não tem retry com backoff

- **Risco:** Baixo. O sync dispara somente no evento `online`, então uma falha nessa janela é silenciosa.
- **Motivo:** Um único `break` interrompe o loop de sync no primeiro erro de rede.
- **Caminho:** Adicionar backoff exponencial com no máximo 3 tentativas por entrada em iteração futura.

## ~~D-005 — Sem spec formal para `server-first` feature~~ ✅ FECHADA

- **Resolvida:** `.specs/features/server-first/tasks.md` criado com tabela completa T1.1–T6.3 e gates.
