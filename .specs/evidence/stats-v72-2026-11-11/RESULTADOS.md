# Estatisticas V7.2 - resultados verificados

Commit testado: `d89014b` (pai `af98eb1`), branch `design/redesign-geral-20261110`. Dados: instancia sintetica (`scripts/design-preview.mjs --seed`), nunca dados do usuario.

| Item | Resultado | Prova |
|---|---|---|
| Escopo do commit | 20 arquivos, pai af98eb1, sem outro commit no intervalo | `git diff --name-status af98eb1 d89014b` |
| Consistencia HTML/JS/i18n | 88 chaves do HTML e 75 do JS existem no catalogo; 0 ids ausentes; 0 duplicados | script de auditoria (temporario) |
| Lint | limpo | `npx eslint src --max-warnings 0` |
| E2E (17 specs de Estatisticas e vizinhas) | 86 passed, 0 failed, 0 flaky, 1 skipped, 243 s | `node scripts/e2e.mjs ... --record-baseline` |
| Login pela interface real (conta sintetica) | formulario aparece, `/v1/auth/me` = 200 depois do envio, em 390, 800 e 1440 | script Playwright temporario |
| Capturas 390/800/1440 | tres abas, detalhe e historico sem sobreposicao, sem overflow de pagina, 0 textos cortados fora das regioes de rolagem | imagens inspecionadas |
| KPIs, filtros, ordenacao, paginacao, grafico, CSV, detalhe | cobertos por `stats-v72-table` (14), `stats-aaa`, `stats-sorting`, `stats-discipline-drilldown`, `stats-study-shortcut`, `stats-trend-chip` | lote acima |

## Divergencias registradas

- **RATCHET servidor+compartilhado**: 584 textos contra baseline commitada 582. As 2 entradas extras sao `LESSON_DATE_INVALID` e `LESSON_DATE_AFTER_STUDY` em `server/src/api-error-messages.js:25-26`, vindas do commit `8beeca3` (lessonDate), nao deste. `af98eb1` ja falhava. A alteracao nao commitada de outra frente em `scripts/scan-portuguese-i18n.mjs` (baseline 584) foi preservada; o teste nao foi enfraquecido.
- **Atalho DEV**: `scripts/work-target-guard.mjs` recusa a branch `design/redesign-geral-20261110` (WRONG_BRANCH), e `launch-desktop-dev.ps1` roda `npm run build`, que passa pela guarda. Liberar a branch em `scripts/work-branches.json` e decisao do dono.
- **Escopo visual**: o bloco "Tendencia historica" (verdict de estudo) fica entre o cartao de analise e o historico como texto simples; funcionalidade preservada do app, nao existe no V7.2.
- 401 de `/auth/me` antes do login aparecem no console: esperado.
