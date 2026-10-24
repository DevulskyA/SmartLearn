# HANDOFF — Resumo Mestre científico multimodal (2026-10-19, parada pedida pelo usuário)

Missão: "SMARTLEARN — IMPLEMENTAÇÃO CIENTÍFICA MULTIMODAL". /goal ativo: implementar resumos científicos com fórmulas editáveis e figuras integradas, preservando fontes, dados e compatibilidade, com funcionamento provado de ponta a ponta. O usuário mandou PARAR e salvar este handoff (um "pare" explícito vence o hook do /goal).

## Onde está
- Worktree: `C:\Projetos\SmartLearn\.claude\worktrees\smartlearn-next-sprints`, branch `claude/smartlearn-next-sprints`. Só commits locais; NUNCA push/merge/rebase/deploy/release; PR #7 fica DRAFT.
- HEAD: ver `git log` (`6177f7e` = parada de 2026-10-19; a Entrega D, editor visual, vem depois).
- Entregas (todas commitadas): A `ebc8461` (renderer único markdown-it + KaTeX + mhchem + diálogo MathLive), B `f0acd59` (imagens privadas, migração 038, sharp, rotas dono-só, backup operacional com mídia, exportação textual com aviso), ajuste de teste `a90cf63`, C `cd5b3a9` (Selecionar do PDF com pdf.js), `63a4cc9` (teste de caminho completo no servidor + E2E sem internet).

## Provado (rodada final, antes do HEAD final)
- Lint limpo; unitários e servidor sem falha (servidor 1122; unit ~777+).
- Jornada nativa (`node scripts/desktop-study-journey.mjs`) 20/20; também 20/20 com `SL_JOURNEY_NO_INTERNET=1` (WebView manda tudo que não é loopback para proxy morto; `fetch` externo falha antes de começar). Rede NÃO foi desligada de verdade (seria mexer no sistema).
- E2E completa em 2026-10-19, código de `6177f7e`: 293 passaram, 0 falharam, 2 ignorados, saída 0 (log `sl-e2e-final2.txt`, SHA-256 `574EC5DD43C833C6EC8D602E2212FF3782696ECEE98C430E8E45322AC240CF57`). Fecha a pendência da suíte completa; o instável `keyboard-study-materials` ACCESS-5 não falhou.
- Caminho completo no servidor: rascunho com texto+fórmula+imagem+recorte → editar → aceitar → backup → restaurar → reabrir: bytes, registros e proveniência idênticos (`server/test/visual-assets.test.js`, teste "the whole path").
- Auditoria dos 14 itens: mapa em "Mapa de provas" abaixo.

## NÃO provado / riscos
- Recorte de PDF = só "imagem escolhida da página"; não é conferido com a fonte nem validado clinicamente. Sem aceite humano.
- "Offline" provado por bloqueio de saída (proxy morto + rota Playwright), não por rede desligada.
- Prompt de geração v10 ainda diz que tabelas não são renderizadas (decisão humana aberta; não mexer no MED-SUM nem no gerador).
- Integração: bloqueada até T-F4-01 + autorização. Outras decisões humanas abertas: reconciliação da base do PR, texto do aviso de retomada.
- Fila A–F de `.specs/LOOP_BACKLOG.md`: itens independentes esgotados (ver linhas do PROGRAMA A–F); restam só itens BLOQUEADOS por decisão do aluno.

## Proibições vigentes (não reabrir)
Banco humano/Desktop humano: nunca abrir nem copiar. Branch de uso `claude/smartlearn-v1-complete`: não tocar. `~/SmartLearn-DevData` antigo: não tocar. Sem geração paga, sem migração humana, sem push/merge/deploy/release, sem alterar a Constituição V1, sem integrar antes de T-F4-01. Sem privados/figuras no Git. Edição de código só com Edit/Write (nada de script/regex/heredoc com barras invertidas). A metodologia do usuário virá depois: NÃO pesquisar uma.
Recorrência `/loop` job `fe05d18b` (10 min) existe: não duplicar nem cancelar; tick sem mudança = uma linha.

## Decisões de design (não reabrir)
- Texto canônico: `summary_body` editável. Fórmula inline `\( \)`, bloco `\[ \]`; `$` nunca é matemática; figura = linha própria `[[fig:UUID]]`; legenda/alt/descrição/proveniência no registro do ativo. Resumos antigos nunca reescritos.
- Stack: markdown-it (HTML desligado), KaTeX (trust false) + mhchem, MathLive sob demanda local, pdfjs-dist 6.3.289 local (worker via `?url`), sharp, Fastify/SQLite. Sem CDN.
- Recorte: retângulo NORMALIZADO (0..1) na página como exibida; `rotation` = `/Rotate` da página; PNG recortado do canvas; guarda source_id, page_index, rect, rotation, checksum da fonte.
- Chave de operação única por diálogo (reenvio após resposta perdida não duplica). A rota recebe números do recorte como texto e converte (`asNumber`).
- Exportação lógica textual: sem binários; referências viram `[Figura não incluída nesta exportação: <legenda|alt>]` + `notices[MEDIA_NOT_INCLUDED]`; restore aceita exportações antigas.
- Auditoria de rascunho ignora marcadores técnicos (`AUDIT_RULES_VERSION='audit-rules-5'`).

## Mapa de provas (14 itens)
1 legado byte a byte: `test/summary-markdown.test.js` + `e2e/summary-math-editor.spec.js` · 2/3 fórmulas e inválidas: unitários + E2E Plano/editor · 4 todas as telas: E2E + jornada · 5 edição/aceite: teste de rascunho+aceite e caminho completo · 6 persistência: jornada passos 17–18 · 7 backup/restore com mídia: `server/test/operational-backup.test.js` (4) + caminho completo · 8 isolamento: testes de servidor/HTTP · 9 malicioso: SVG/HTML/pixel-bomb recusados, CSP sandbox · 10 recortes: `e2e/summary-pdf-crop.spec.js` (cor de pixel, normal e girado 90°) · 11 repetição: operationKey + E2E resposta perdida · 12 referência inexistente: recusa ao salvar/aceitar + marcador · 13 exportação textual: `server/test/logical-export-media.test.js` · 14 dados humanos intactos: jornada passo 18 + suíte.

## Como retomar (comandos)
```
cd C:\Projetos\SmartLearn\.claude\worktrees\smartlearn-next-sprints
git log --oneline -8 ; git status --short
npm run lint
npm test
node --test "server/test/*.test.js"
CI=1 node scripts/e2e.mjs                      # completa (~12 min); um spec: CI=1 node scripts/e2e.mjs e2e/summary-pdf-crop.spec.js
# nativo isolado (exe em %LOCALAPPDATA%\Temp\sl-next-target):
export CARGO_TARGET_DIR="$LOCALAPPDATA/Temp/sl-next-target"
SMARTLEARN_BUILD_MODE=DEV npx vite build ; node scripts/package-standalone.mjs ; (cd src-tauri && cargo build)
node scripts/desktop-study-journey.mjs         # 20 passos; SL_JOURNEY_NO_INTERNET=1 para modo sem internet; SL_JOURNEY_NO_MOVE=1 não move a janela
```
Armadilhas: o classificador de Write/Edit/Bash cai às vezes (tentar de novo; migrações via scratchpad+cp); manifest de migrações tem checksum (arquivo .sql fora do manifest impede o servidor de subir); portas E2E 13950–13999 (usadas: 13970, 13972, 13974, 13976); `process-smoke` e `exam-mode`/ACCESS-5 oscilam sob carga; jornada falha se o código mudou depois do build (reconstruir); janela de teste precisa estar des-maximizada (`window-rect.ps1` faz `ShowWindow`).

## Entrega D — editor visual do Resumo (Tiptap/ProseMirror, 2026-10-23)
Autorizada pelo usuário em 2026-10-23. Aba Resumo do editor de rascunho (`src/lesson-editor-ui.js`): botões "Visual" / "Texto" (padrão **Texto**, escolha lembrada por navegador; mudar o padrão é uma linha em `src/summary-toolbar.js`, `readMode`). A textarea continua a fonte única: salvar, versão (`expectedVersion`), auditoria e Plano/Hoje não mudaram.
- `shared/summary-doc.js`: conversor puro Markdown ↔ documento do editor. Bloco intacto volta com os bytes originais (`origin`, `gap`, `lead`, `tail`); o que o editor não modela (tabela, citação, código, regra, lista com conteúdo estranho, fórmula dentro de negrito) vira `rawBlock` editável como texto; `serializeVerified` relê o que escreveu e RECUSA (`{error}`) o que não voltaria igual. Não usa `@tiptap/markdown`.
- `src/summary-visual-schema.js` (esquema, sem DOM) + `src/summary-visual-editor.js` (editor, barra, diálogos de fórmula/imagem/PDF reutilizados, colar imagem, soltar arquivo). Dependências `@tiptap/*` fixadas em 3.31.4, carregadas sob demanda (chunk próprio), sem CDN, sem `<style>` injetado.
- Se a edição visual não puder ser gravada com fidelidade (ex.: negrito terminando em pontuação colado a uma letra, `**(a)**b`): aviso na tela, a textarea mantém a última versão fiel, "Salvar resumo" recusa com mensagem, e sair para Texto pede confirmação.
- Provas: `test/summary-doc.test.js` (15+), `test/summary-visual-schema.test.js` (documentos × esquema real do Tiptap, edições via ProseMirror), `e2e/summary-visual-editor.spec.js` (11: padrão Texto, abrir sem mudar nem um byte, editar/salvar/recarregar, desfazer, teclado/axe, fórmulas, figuras, recorte de PDF, colar HTML hostil, estado bloqueado, histórico/arrastar arquivo), `scripts/desktop-study-journey.mjs` passo 21 (Desktop nativo, sem internet, 21/21).
- Armadilhas: `setContent` precisa de `addToHistory:false` e o histórico é recriado ao recarregar (senão Ctrl+Z esvazia o editor); o documento nunca pode ficar sem bloco (parágrafo vazio de reserva); atributos novos de lista (`loose`) precisam estar no esquema; digitar `*x*` vira itálico (atalho padrão do Tiptap).
- Não incluído nesta fatia (próximos candidatos): colar Markdown (texto puro) e convertê-lo em estrutura; usar o editor visual também no Plano e no Hoje; tabela editável (hoje é bloco de texto); padrão "Visual" depois de uso real.

## Auditoria independente da Entrega D (ChatGPT, 2026-10-24) e correções
Pacote auditado: `SmartLearn_AUDITORIA_2026-10-24.zip` (HEAD `7245d2c`). Achados, cada um reproduzido por teste que falhava antes da correção:
- P1 salvamento concorrente: o que o aluno digitava durante a requisição era apagado pela resposta (texto e visual; defeito já existia no editor de texto). Corrigido: só o buffer enviado é zerado (`src/lesson-editor-ui.js`, E2E "in flight", 2 testes).
- P1 edição visual bloqueada escapava de Voltar / ver o que será criado / Aceitar / atualizar ao voltar à janela: agora `summaryHasUnsavedChanges()` (descarrega o editor visual e considera o bloqueio) vale para todas as saídas (E2E "every way out").
- P2 referências `[[fig:UUID]]`: o scanner do servidor contava linhas dentro de código recuado e de cerca de 4 crases, e a regra do renderizador aceitava figura dentro de lista/citação (que o scanner não via, logo o backup omitiria a mídia). Nova definição única: figura = linha própria na margem esquerda do documento, fora de código, fórmula, lista e citação. `shared/summary-figure-refs.js` é uma reimplementação sem dependências (o servidor não importa markdown-it) e `test/summary-figure-scan.test.js` a compara com a regra do markdown-it em 3000 documentos gerados (mais 180 mil fora do repositório, 0 divergências).
- P2 `destroy()` não era propagado: agora `summaryAuthoring.destroyVisual()` roda no `destroy` da tela (E2E sem erro de script; a retenção de memória não foi medida).
- Colagem de HTML: `data-figure-id` só vira figura se for UUID bem formado; o servidor continua recusando ids que não são do aluno (E2E).
- O auditor notou que o log nativo identificava o build como `6177f7e`: a jornada foi refeita sobre o HEAD final (ver `git log`).
Fica registrado, não corrigido: bloco de texto bruto dividido por linha em branco é recusado (aviso) em vez de virar dois blocos.

## Salvamento automático do rascunho (2026-10-24, política aprovada pelo usuário)
Resumo e cada questão se salvam sozinhos **2,5 s sem digitação**. Peças: `src/draft-autosave.js` (agendador sem DOM: espera, uma requisição por entidade, retentativa com espera crescente 2,5/5/10/30 s e imediata ao voltar a conexão, conflito/recusa sem repetição cega), `src/draft-recovery.js` (cópia local recuperável em localStorage, gravada **a cada tecla antes de qualquer requisição**, apagada só quando o servidor tem o texto), `src/save-indicator.js` (indicador), `src/lesson-editor-ui.js` (integração).
- Indicador ao lado de "Salvar resumo" e de cada questão: *Salva sozinho em instantes* (ponto que respira durante os 2,5 s) → *Salvando…* (círculo girando) → *Salvo agora* (✓ que se desenha uma vez) → *Salvo às 14:03*; problemas: *Sem conexão · cópia neste computador*, *Não salvo · alterado em outro lugar*, *Não salvo · veja o aviso* (a explicação longa vai para a linha de mensagem do próprio painel). Texto primeiro, ícone decorativo, cores do próprio app, respeita `prefers-reduced-motion`, **não é região viva** (cada área mantém uma só, regra do teste de acessibilidade).
- Resposta antiga nunca sobrescreve texto novo: só o buffer realmente enviado é zerado; digitado durante a requisição fica como não salvo e gera o próximo salvamento. O campo/forma da questão (reconstruído a cada atualização) devolve o cursor.
- Salvar ≠ aceitar: só campos de texto são enviados (`status` nunca); "Ver o que será criado" e "Aceitar" salvam o pendente e **param**, o aceite é um segundo clique (`editor.accept.savedNow*`). O servidor só edita rascunhos em estado DRAFT.
- Recuperação: ao abrir a aula, se há cópia local diferente do servidor aparece o aviso com *Recuperar* / *Descartar* (nada é aplicado sem o aluno; se a aula mudou depois da cópia, o aviso diz que recuperar substitui a versão atual).
- Provas: `test/draft-autosave.test.js` (11, relógio falso), `e2e/draft-autosave.spec.js` (13: espera de 2,5 s com digitação contínua, cópia a cada tecla, resposta lenta + sem duas requisições, perda de conexão, janela fechada com o servidor realmente inalcançável — `e2e/support/forwarder.js` —, descartar, conflito, recusa, editor visual, questão sem aceitar, indicador, movimento reduzido).
- Limites conhecidos: (1) localStorage é gravado em segundo plano pelo navegador; um processo morto dentro de milissegundos da última tecla pode perder essa última gravação. (2) A cópia local fica no perfil do navegador/WebView, sem separar contas: ao sair da conta ela continua lá até ser salva/descartada. (3) **Decisão pendente do usuário:** editar o texto de uma questão já ACEITA mantém o estado ACEITA (comportamento do servidor desde antes); com salvamento automático isso passa a acontecer sem clique. Sugestão: texto alterado volta a PROPOSTA.

## Testes em níveis (2026-10-24)
| Nível | Comando | Tempo medido | O que é |
|---|---|---|---|
| Unitário | `node --test test/summary-doc.test.js test/summary-visual-schema.test.js test/summary-figure-scan.test.js` ou `npm test` (800) | segundos | conversor, esquema, definição de figura |
| Fumaça | `npm run test:e2e:smoke` | ~20 s | `e2e/smoke.spec.js`: 1 servidor, 1 página, 1 login e 1 rascunho compartilhados por 10 passos em série (abrir sem mudar bytes, editar, desfazer, fórmula, colar HTML, figura, recarregar, aceitar, Plano/Estudar/Hoje, nada saiu da máquina). Falha no passo N para o resto. |
| Por área | `npm run test:e2e:summary` | ~150 s (72 testes, 4 workers; eram ~196 s com 2) | suíte `summary` em `e2e/support/suites.js`; o número de workers por suíte está em `SUITE_WORKERS` |
| Completa | `npm run test:e2e` | ~12 min | isolada, 2 workers, cada teste com seu usuário e rascunho: é a prova antes de integrar |
Fumaça mata 2 de 4 mutantes testados (separadores do conversor, moldura de fórmula); salvamento concorrente e o scanner de figuras ficam para a suíte por área e os unitários (o 4º mutante era equivalente). Compartilhar login/rascunho também na suíte por área economizaria só ~16 s de 196 s (o preparo é ~2 s de login + 1,4 s de geração por teste), então não foi feito. Com 4 workers houve 1 falha em 6 execuções (não identificada: o log não foi guardado); as 5 seguintes passaram. A suíte completa não usa 4 workers.

## Próximo (por ordem)
1. Esperar do usuário: metodologia, T-F4-01, decisão do prompt v10, autorização de integração (decisões humanas separadas).
2. Trabalho experimental independente: colar Markdown no editor visual; editor visual no Plano/Hoje; tabela editável.
3. Se o usuário pedir: relatório final por entrega no formato RESULTADO / EVIDÊNCIA / ARQUIVOS / RISCO / PRÓXIMO.
