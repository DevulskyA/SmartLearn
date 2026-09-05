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

## D-002 — Migração não tem rollback no lado JS

- **Risco:** Médio. Se `execute()` lançar após limpar localStorage, dados perdidos.
- **Motivo:** `localStorage.removeItem(BROWSER_STORE_KEY)` ocorre após `resp.ok`, mas antes do reload.
  Se o reload falhar e o usuário fechar a aba, os dados sumirão do browser sem estar no SQLite.
- **Mitigação atual:** O endpoint `/api/migrate/import` é atômico (transação SQLite); se falhar, lança e não limpa localStorage. O risco real é um crash entre `removeItem` e o reload.
- **Caminho:** Copiar os dados para um campo temporário (ex.: `smartlearn:browser-db-backup`) antes de remover e só removê-lo após o reload confirmar DB disponível.

## D-003 — SW não tem estratégia de invalidação do cache de queries

- **Risco:** Baixo. Usuário pode ver dados obsoletos até navegar de forma que force network.
- **Motivo:** O cache `smartlearn-query-v1` é network-first, então só fica obsoleto no modo offline.
  Ao voltar online, a próxima requisição idêntica atualiza o cache.
- **Caminho:** Adicionar header `Cache-Control: no-store` ou versão no cache-key em iteração futura.

## D-004 — `syncPendingWrites` não tem retry com backoff

- **Risco:** Baixo. O sync dispara somente no evento `online`, então uma falha nessa janela é silenciosa.
- **Motivo:** Um único `break` interrompe o loop de sync no primeiro erro de rede.
- **Caminho:** Adicionar backoff exponencial com no máximo 3 tentativas por entrada em iteração futura.

## ~~D-005 — Sem spec formal para `server-first` feature~~ ✅ FECHADA

- **Resolvida:** `.specs/features/server-first/tasks.md` criado com tabela completa T1.1–T6.3 e gates.
