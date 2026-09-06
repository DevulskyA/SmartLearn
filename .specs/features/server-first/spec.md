# spec.md — server-first

## Objetivo

Eliminar dependência de dados do BrowserStore (localStorage) introduzindo um broker HTTP local
(`axum` em `127.0.0.1:57321`) que serve SQLite+WAL como banco autoritativo no desktop/Tauri.
Garantir continuidade offline e caminho de migração sem perda de dados.

## Contexto

- BrowserStore usa localStorage: volatilidade máxima (browser pode apagar).
- Tauri desktop já tem `execute_sqlite_transaction` (Rust). A extensão para broker HTTP é natural.
- Android e Windows usam Tauri nativo (SqliteStore); o broker serve a Web/PWA.

## Plataformas alvo

| Plataforma | Store usado | Broker necessário |
|------------|-------------|-------------------|
| Tauri desktop | SqliteStore (nativo) | Não |
| Tauri Android | SqliteStore (nativo) | Não |
| Web/PWA + broker ativo | BrokerStore | Sim |
| Web/PWA offline | BrowserStore (fallback) | Não |

## Invariantes

1. **NO_DATA_LOSS**: nenhuma escrita do usuário é descartada sem aviso explícito.
2. **Offline-first**: app Web/PWA responde mesmo sem broker (BrowserStore + SW cache).
3. **Atomicidade de migração**: import BrowserStore → SQLite usa uma única transação.
4. **Sem dados reais em testes**: todos os testes usam fixture/isolado. Nunca tocar AppData real.

## Não está no escopo

- Multi-usuário / autenticação
- Sincronização cloud
- Android offline write buffer (Android usa SqliteStore — sempre disponível)
