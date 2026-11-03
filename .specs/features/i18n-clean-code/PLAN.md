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
FEITO nesta rodada (2026-10-16, tudo local): CI — `practice.spec.js` (3 corridas, `3ca4cd1`), `playwright.config.js` com stdout do Vite (`cbc70e1`); teste de integridade do catálogo (`c4c9a17`); pseudo-locale na interface real com catraca por tela (`60bd7d8`, `e7ddcb5`); `index.html` por `data-i18n` (mecanismo `770c1f0`; Hoje `f616c56`; Plano/Acompanhamento/Disciplinas `dc27847`; Estatísticas `4790b6c`; Configurações/Conta `edae2c0`; Materiais/Prova/Estudar agora/diálogos `d837c86`; navegação/Cadastro `24940ff`); `app.js` inteiro (`fcda814` backup, `54698c2` Estudar agora, `87de162` Prova, `49115d1` Cadastro, `6b2c98c` disciplinas/exercícios, `c588eab` o resto); `db.js` e `api-client.js` (`b9c82df`); pseudo-locale em 30 estados com dados (`5eca26b`); prefixos de CSS e `<html lang>` (`9afb847`).
ESTADO NO HEAD `9afb847`: scanner por AST = 0 textos visíveis em `src/` (catraca em `scripts/i18n-baseline.json` = `{}`); pseudo-locale na interface real = 0 fora do catálogo nas 9 telas principais (limites 0 em `e2e/i18n-pseudo-locale.spec.js`) e nos 30 estados com dados de `e2e/i18n-pseudo-flows.spec.js` (exceções: data em tooltip e nome do arquivo enviado). Regressão completa executada por agente Haiku no `9afb847`: eslint 0, 712 unitários, 1051 do servidor, E2E 241 passaram / 0 falharam / 2 ignorados (os dois de modelo real).
O QUE O SCANNER NÃO VÊ E FOI TRATADO: texto em CSS (`content:`), `<html lang>`, texto de elementos do HTML que o `app.js` reescreve, leitura de volta de texto traduzido (`replace(/^Dica:/)`), plural de zero.
PENDENTE (não é código local): (1) mensagens em português que vêm do servidor/`shared/` e chegam à tela: avisos do painel de migração (`shared/import-normalization.js`, `shared/logical-import.js`, sem parâmetros na estrutura do aviso, só `code`) e `NetworkError` ("Falha de rede ao acessar…", anexada em "Não foi possível iniciar a prova."): exigem decisão de contrato (código + parâmetros no servidor, texto no cliente); (2) logs `console.*` e `Error` de diagnóstico em português (57 em `app.js`, 86 em `db.js`): exceção técnica, não chegam ao aluno; (3) o número `16` em "16 revisões criadas." é literal no texto, não deriva do agendador; (4) formatação decimal `toFixed(1).replace(".", ",")` em ~10 pontos: segue o idioma pt-BR sem passar por `formatNumber` (arredondamento de `Intl` difere em empates); fatia própria com teste comparando valores; (5) achado fora do escopo: `Falha ao iniciar tentativa (prática inicial). ApiError: Esta tentativa já foi finalizada.` no console de cada passagem de "Estudar agora" (`src/app.js` reveal handler); investigar à parte.
NÃO FAZER sem decisão: ligar `setLocale` a `uiLocale` do aluno e criar catálogos es/en (HG-13). Hoje existe UM idioma traduzido (pt-BR): a infraestrutura está pronta para traduzir, mas NÃO há suporte multilíngue nem troca de idioma na interface.
EXCEÇÕES TÉCNICAS (não são texto traduzível): autônimos dos idiomas (Português (Brasil), Español, English); canal e hash da build; nome do produto; datas e números formatados pelo idioma ativo; chaves que o código compara (`unique constraint`).
LIMITE CONHECIDO DE UMA FUTURA TROCA DE IDIOMA EM TEMPO DE EXECUÇÃO: o que o app desenha na inicialização não é redesenhado; `select-ui` relê o rótulo no `sync()`, mas telas já renderizadas exigem recarregar. Hoje o idioma é escolhido uma vez, antes de o app iniciar.

## Como continuar (próxima tarefa)
A internacionalização do que é código local está fechada no `9afb847` (ver "Estado"). O que sobra exige decisão (contrato do servidor, HG-13) ou é fatia própria (decimal por `formatNumber`). Qualquer texto novo: chave no catálogo + `t()`; o scanner, `test/i18n-catalog-integrity.test.js`, `test/i18n-html.test.js` e os dois specs de pseudo-locale (limite 0) falham se um texto ficar no código.
1. Próxima frente (só depois do fechamento acima): Clean Code moderno, uma superfície por vez, com caracterização antes. Candidatas medidas (S4): `createLessonEditor` 730 linhas, `createBrowserStore` 663 (legado), `createReviewRow` 397, `renderPlan` 355. Não mudar traduções, interface, persistência nem regras médicas.
2. O teste de acessibilidade já falhou uma vez com `ERR_CONNECTION_REFUSED` sem causa provada (não reproduziu em 45 repetições); o stdout do Vite agora fica no log.
3. Um commit por fatia com caminhos explícitos; regressão completa por agente Haiku ao fechar cada lote.
4. Reportar no formato do BRIEF: ANTES→DEPOIS, ARQUIVOS, INTERNACIONALIZAÇÃO, VALIDAÇÃO, REVERSÃO, PRÓXIMA FATIA.

## /goal sugerido (só o usuário digita)
`/goal i18n: node scripts/scan-portuguese-i18n.mjs mostra 0 textos a migrar em src/ (exceto db.js SQL e diagnósticos justificados); npm test, npm --prefix server test, npm run lint e node scripts/e2e.mjs passam no HEAD; git status sem alterações versionadas; nenhum push, merge ou deploy feito`

## Provas já feitas (para não repetir)
Differenciais contra o Git: validação 284 entradas, 0 diferenças; propostas 264, 0; materials 87, 0; status e lesson/analytics: 22 testes de caracterização passam na árvore ANTIGA e na nova. Mutações detectadas em cada fatia.
