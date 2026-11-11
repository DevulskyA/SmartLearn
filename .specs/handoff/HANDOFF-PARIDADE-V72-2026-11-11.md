

## 7. Verificação de 2026-11-11 (commit f835f81a, local, sem push)

- **Paridade V7.2 (estrutural):** Hoje 14, Plano 2, Materiais 3, Estatísticas 1, Configurações 5, Conta 3 (antes 15, 2, 3, 1, 4, 4). O verificador não mede cor nem fonte. Estudo agora e Prova exigem a jornada real.
- **Configurações (5):** são só acréscimos do app que o V7.2 não tem: 2 títulos e 1 botão a mais, e os ids `settings-period-name`, `generation-locale`, `choose-backup-file`. Os dois títulos fora de posição (83 e 120 px) decorrem desses acréscimos. Nada a corrigir.
- **F5:** em `#account` aparece só o painel da Conta; o Hoje não pisca.
- **E2E completo (3 workers):** 475 passaram, 4 falharam sob carga (`lesson-editor`, `lesson-editor-responsive`, `materials-themes`, `review-completion-rule`); os 4 passam isolados (38 testes). Causa exata não achada. **Baseline gravado** (commit `a61dd860`): `full@3w` = 1381 s, de rodada completa limpa (478 passaram, 0 falhas) numa cópia isolada do commit `f7d3cbed`. As rodadas na pasta principal falharam porque outro agente editava `src/` e outro processo do Playwright apagou `test-results`. Cópia isolada: `git worktree add --detach` + `node_modules` copiado (a junção quebra o `pdfjs` no Vite) + `src-tauri/resources/shared/pdf-crop-geometry.js` (ignorado pelo Git). Tempos de 980 a 1381 s: o baseline é frouxo (alerta só acima de ~1900 s). Teste de acessibilidade por tema ganhou limite de 120 s (`f7d3cbed`). Gravar de novo: `node scripts/e2e.mjs --record-baseline` (sem `--workers`; usar `E2E_WORKERS`).
