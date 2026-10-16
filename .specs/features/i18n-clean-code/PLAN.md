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
FEITO e commitado: base `t()` (`10fd7d5`); formatadores (`4e6c0a1`); scanner+catraca (`afd6dc2`); tema; scheduler; priorities-text; catálogo dividido por área (`e1c41da`); validação; remote-store; propostas; UI compartilhada; status (offline, build, migração); lesson/analytics; materials-ui (`0c90078`); db.js (só 1 string segura, `ff3080f`); editor de lições (`9d2ac40`); `app.js` primeira parte, 133 de 314 textos (`621cb04`, catraca 497→200 em `35916f5`).
FEITO nesta rodada (2026-10-16, tudo local): CI — `practice.spec.js` (3 corridas, `3ca4cd1`), `playwright.config.js` com stdout do Vite (`cbc70e1`); teste de integridade do catálogo (`c4c9a17`); pseudo-locale na interface real com catraca por tela (`60bd7d8`, `e7ddcb5`); `index.html` por `data-i18n` (mecanismo `770c1f0`; Hoje `f616c56`; Plano/Acompanhamento/Disciplinas `dc27847`; Estatísticas `4790b6c`; Configurações/Conta `edae2c0`; Materiais/Prova/Estudar agora/diálogos `d837c86`; navegação/Cadastro `24940ff`). Regressão completa no `24940ff`: eslint 0, 712 unitários, E2E 240 passaram / 2 ignorados.
MEDIDO NA INTERFACE REAL (pseudo-locale, textos fora do catálogo por tela): hoje 0, plano 0, estatísticas 0, acompanhamento 0, disciplinas 0, navegação 0, configurações 2, conta 1, cadastro 6 (limites em `e2e/i18n-pseudo-locale.spec.js`). Os 9 restantes são desenhados por `app.js`.
PENDENTE: o restante de `app.js` (181 textos) e `db.js` (18), em fatias por área; `api-client.js` (1 string); textos que `app.js` reescreve em elementos do HTML (título de resultado, "Ver resposta", "Praticar", "Refazer erros", título da prova) migram junto com o código que os escreve; mensagens em português da API do servidor (só registrar; exige decisão de contrato).
NÃO FAZER sem decisão: ligar `setLocale` a `uiLocale` do aluno e criar catálogos es/en (HG-13). Hoje existe UM idioma traduzido (pt-BR): a infraestrutura está pronta para traduzir, mas NÃO há suporte multilíngue nem troca de idioma na interface.
EXCEÇÕES TÉCNICAS (não são texto traduzível): autônimos dos idiomas (Português (Brasil), Español, English); canal e hash da build; nome do produto; datas e números formatados pelo idioma ativo; chaves que o código compara (`unique constraint`).
LIMITE CONHECIDO DE UMA FUTURA TROCA DE IDIOMA EM TEMPO DE EXECUÇÃO: o que o app desenha na inicialização não é redesenhado; `select-ui` relê o rótulo no `sync()`, mas telas já renderizadas exigem recarregar. Hoje o idioma é escolhido uma vez, antes de o app iniciar.

## Como continuar (próxima tarefa)
1. `git status`; `node scripts/scan-portuguese-i18n.mjs --list` e `PSEUDO_VERBOSE=1 node scripts/e2e.mjs e2e/i18n-pseudo-locale.spec.js` para ver o que ainda está no código.
2. Uma área de `app.js` por fatia (importação/backup; prática/reteste; listas de Cadastro; mensagens "Falha ao…"). Por fatia: chaves em `src/i18n/locales/pt-BR/app*.js`; prova de que nenhum literal antigo se perdeu (script de comparação AST entre `git show HEAD:src/app.js` e o catálogo + código novo); `npx eslint`; `npm test`; E2E dos specs que tocam a área; plural que pode ser 0 mantém `n === 1 ? one : other`.
3. Regressão completa ao fechar o lote: `npm run lint`, `npm test`, `npm --prefix server test`, `node scripts/e2e.mjs` (~8 min). O teste de acessibilidade já falhou uma vez com `ERR_CONNECTION_REFUSED` sem causa provada; o stdout do Vite agora fica no log para explicar a próxima ocorrência.
4. Um commit por fatia com caminhos explícitos; depois `node scripts/scan-portuguese-i18n.mjs --update` e baixar os limites de `e2e/i18n-pseudo-locale.spec.js` em commit próprio.
5. Reportar no formato do BRIEF: ANTES→DEPOIS, ARQUIVOS, INTERNACIONALIZAÇÃO, VALIDAÇÃO, REVERSÃO, PRÓXIMA FATIA.

## /goal sugerido (só o usuário digita)
`/goal i18n: node scripts/scan-portuguese-i18n.mjs mostra 0 textos a migrar em src/ (exceto db.js SQL e diagnósticos justificados); npm test, npm --prefix server test, npm run lint e node scripts/e2e.mjs passam no HEAD; git status sem alterações versionadas; nenhum push, merge ou deploy feito`

## Provas já feitas (para não repetir)
Differenciais contra o Git: validação 284 entradas, 0 diferenças; propostas 264, 0; materials 87, 0; status e lesson/analytics: 22 testes de caracterização passam na árvore ANTIGA e na nova. Mutações detectadas em cada fatia.
