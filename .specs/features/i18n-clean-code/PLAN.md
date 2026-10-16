# PLAN — Clean Code moderno + i18n (estado e continuação)
Direção: `BRIEF.md` (texto do usuário, vale sobre este arquivo). Fila operacional: `.specs/LOOP_BACKLOG.md`. Posição de sessão (local): `.specs/HANDOFF.md`. Código, testes e Git vencem qualquer texto. Atualizado em 2026-10-16.

## Ledger de requisitos
REQUIREMENTS
- R1 Todo texto visível ao usuário vem do catálogo via `t()`/`tn()` (conteúdo, `title`, `aria-label`, `placeholder`, `alt`, status, erro, confirmação, vazio/carregando).
- R2 Comportamento e textos pt-BR idênticos; E2E e unitários seguem verdes sem alterar expectativas.
- R3 Data, número e ordenação pelo idioma ativo (`src/i18n/format.js`); nenhum 'pt-BR' fixo em `src/`.
- R4 Sem concatenar fragmentos: uma chave por frase com `{parâmetros}`; plural por `.one/.other`.
- R5 `uiLocale`, `sourceLanguage` e `generationLocale` continuam independentes.
- R6 Só pt-BR traduzido; es/en caem em pt-BR por chave (HG-13: tradução completa adiada; nada de tradução inventada).
- R7 Fatias pequenas, coesas e reversíveis; sem misturar limpeza, correção e i18n; sem abstração nova sem necessidade.
- R8 Comentários explicam o PORQUÊ; JSDoc só onde acrescenta; sem ruído.
INVARIANTS
- I1 Sem push, merge, deploy, release, rebase ou force-push sem autorização explícita (commits locais).
- I2 Banco humano nunca é tocado; IA = rascunho; ledger imutável; sem chamada real a modelo.
- I3 Nunca editar código por regex/`sed`/script; só `Edit`/`Write`. Texto novo sem escapes `\uXXXX` (o editor os converte).
- I4 Agente que só roda testes usa `model: "haiku"`.
- I5 Teste não é alterado para esconder regressão; chave que o código COMPARA (ex.: `unique constraint`) nunca vira texto traduzível.
FORBIDDEN
- Reescrita ampla, nova governança, nova dependência/camada, TypeScript, segundo plano de dezenas de tarefas.

## Mecanismo implementado (onde está)
- `src/i18n/index.js`: `t(chave, params)`, `tn(chave, n, params)`, `setLocale/getLocale`, `has`, `registerCatalog`; fallback pt-BR por chave; chave ausente devolve a chave. `src/i18n/format.js`: `formatDate`, `formatNumber`, `compareText`, `sameName` (identidade de nome independe do idioma).
- Catálogo: `src/i18n/locales/pt-BR.js` monta `AREAS` a partir de `src/i18n/locales/pt-BR/*.js` (uma área por tela/módulo). `test/i18n.test.js`: sem chave duplicada entre áreas, toda chave literal de `t()` existe, sem mojibake.
- Scanner por AST `scripts/scan-portuguese-i18n.mjs` (`--list`, `--update`) + catraca `scripts/i18n-baseline.json` (`test/i18n-scan.test.js`): nenhum arquivo pode ganhar texto no código.

## Estado das fatias (commits locais; `git log --oneline`)
FEITO e commitado: base `t()` (`10fd7d5`); formatadores (`4e6c0a1`); scanner+catraca (`afd6dc2`); tema; scheduler; priorities-text; catálogo dividido por área (`e1c41da`); validação; remote-store; propostas; UI compartilhada; status (offline, build, migração); lesson/analytics; materials-ui (`0c90078`); db.js (só 1 string segura, `ff3080f`). Regressão completa verde no `8b37071`: lint, 705 unitários, 1051 servidor, E2E 239/0/2.
EM ANDAMENTO, NÃO COMMITADO (instantâneo na referência `refs/wip/i18n-lote2`, ver `HANDOFF.md`): `src/lesson-editor-ui.js` + `editor.js` (área) e `src/app.js` + áreas `appShell/appToday/appPlan/appStudies/appStats/appSettings/appAccount` + linhas em `pt-BR.js`.
PENDENTE: fechar o lote 2 (abaixo); `index.html` por `data-i18n`; `api-client.js` (1 string); mensagens em português da API do servidor (só registrar; exige decisão de contrato).
NÃO FAZER sem decisão: ligar `setLocale` a `uiLocale` do aluno e criar catálogos es/en (HG-13).

## Como fechar o lote 2 (próxima tarefa)
1. `git status`, `git diff --stat`, `node scripts/scan-portuguese-i18n.mjs --list | grep -E "app.js|lesson-editor"`. Se a árvore estiver vazia, restaurar do instantâneo: `git diff HEAD refs/wip/i18n-lote2 --stat` e `git checkout refs/wip/i18n-lote2 -- src` (só se a árvore estiver limpa).
2. Por arquivo: `npx eslint`; prova de preservação dos textos antigos (extrair a árvore antiga `git archive HEAD src shared test | tar -x -C <tmp>`; rodar testes de caracterização nela; ou conferir cada literal antigo contra um valor do catálogo); plural que pode ser 0 mantém `n === 1 ? one : other` (em pt-BR `tn` trata 0 como singular).
3. Regressão completa por agente Haiku `test-runner`: `npm run lint`, `npm test`, `npm --prefix server test`, `node scripts/e2e.mjs` (~8 min; conferir o log).
4. Um commit por arquivo com caminhos explícitos (incluir `app*.js` e `pt-BR.js`); depois `node scripts/scan-portuguese-i18n.mjs --update` em commit próprio.
5. Reportar no formato do BRIEF: ANTES→DEPOIS, ARQUIVOS, INTERNACIONALIZAÇÃO, VALIDAÇÃO, REVERSÃO, PRÓXIMA FATIA.

## /goal sugerido (só o usuário digita)
`/goal i18n: node scripts/scan-portuguese-i18n.mjs mostra 0 textos a migrar em src/ (exceto db.js SQL e diagnósticos justificados); npm test, npm --prefix server test, npm run lint e node scripts/e2e.mjs passam no HEAD; git status sem alterações versionadas; nenhum push, merge ou deploy feito`

## Provas já feitas (para não repetir)
Differenciais contra o Git: validação 284 entradas, 0 diferenças; propostas 264, 0; materials 87, 0; status e lesson/analytics: 22 testes de caracterização passam na árvore ANTIGA e na nova. Mutações detectadas em cada fatia.
