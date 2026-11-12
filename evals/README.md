# Avaliações (evals)

As avaliações automatizadas do SmartLearn ficam nos locais abaixo; esta pasta é só o ponto de entrada.

- Suíte E2E (Playwright): `e2e/*.spec.js`. Execução: `node scripts/e2e.mjs --changed` (rápido), `--failed` (repetir falhas), suíte completa uma vez ao fim do lote.
- Linhas de base de tempo e desvios: `scripts/zz-ui-driver.mjs` (`batch <arquivo> --record`; saída `PERF DEVIATION` / `NO BASELINE`).
- Matriz de cobertura: `.specs/TEST_COVERAGE_MATRIX.md`.
- Comandos e ordem de execução: `.specs/EXECUTION.md`.

Regra: teste novo entra em `e2e/` (ou no teste unitário do módulo), não aqui. Esta pasta só recebe fixtures de avaliação que não pertençam a nenhum teste existente.
