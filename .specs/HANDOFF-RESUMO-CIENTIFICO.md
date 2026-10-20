# HANDOFF — Resumo Mestre científico multimodal (2026-10-19, parada pedida pelo usuário)

Missão: "SMARTLEARN — IMPLEMENTAÇÃO CIENTÍFICA MULTIMODAL". /goal ativo: implementar resumos científicos com fórmulas editáveis e figuras integradas, preservando fontes, dados e compatibilidade, com funcionamento provado de ponta a ponta. O usuário mandou PARAR e salvar este handoff (um "pare" explícito vence o hook do /goal).

## Onde está
- Worktree: `C:\Projetos\SmartLearn\.claude\worktrees\smartlearn-next-sprints`, branch `claude/smartlearn-next-sprints`. Só commits locais; NUNCA push/merge/rebase/deploy/release; PR #7 fica DRAFT.
- HEAD no momento da parada: `63a4cc9` + 1 commit de handoff/`SL_JOURNEY_NO_INTERNET` (ver `git log`).
- Entregas (todas commitadas): A `ebc8461` (renderer único markdown-it + KaTeX + mhchem + diálogo MathLive), B `f0acd59` (imagens privadas, migração 038, sharp, rotas dono-só, backup operacional com mídia, exportação textual com aviso), ajuste de teste `a90cf63`, C `cd5b3a9` (Selecionar do PDF com pdf.js), `63a4cc9` (teste de caminho completo no servidor + E2E sem internet).

## Provado (rodada final, antes do HEAD final)
- Lint limpo; unitários e servidor sem falha (servidor 1122; unit ~777+).
- Jornada nativa (`node scripts/desktop-study-journey.mjs`) 20/20; também 20/20 com `SL_JOURNEY_NO_INTERNET=1` (WebView manda tudo que não é loopback para proxy morto; `fetch` externo falha antes de começar). Rede NÃO foi desligada de verdade (seria mexer no sistema).
- E2E completa: 292 passaram + 1 falha instável (`keyboard-study-materials` ACCESS-5, passa 4/4 isolada duas vezes). Uma nova E2E completa (`$LOCALAPPDATA/Temp/sl-e2e-final2.txt`, termina com `e2e_exit=`) foi iniciada e INTERROMPIDA/INCONCLUSIVA pela parada: reexecute se quiser fechar com 100% verde.
- Caminho completo no servidor: rascunho com texto+fórmula+imagem+recorte → editar → aceitar → backup → restaurar → reabrir: bytes, registros e proveniência idênticos (`server/test/visual-assets.test.js`, teste "the whole path").
- Auditoria dos 14 itens: mapa em "Mapa de provas" abaixo.

## NÃO provado / riscos
- Recorte de PDF = só "imagem escolhida da página"; não é conferido com a fonte nem validado clinicamente. Sem aceite humano.
- "Offline" provado por bloqueio de saída (proxy morto + rota Playwright), não por rede desligada.
- E2E completa verde 100% no HEAD final não demonstrada (1 flaky conhecido).
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

## Próximo (por ordem)
1. Reexecutar E2E completa no HEAD final para fechar 100% verde (aceitar 1 flaky conhecido só se passar isolado).
2. Esperar do usuário: metodologia, T-F4-01, decisão do prompt v10, autorização de integração. Nada autorizado resta sem essas decisões.
3. Se o usuário pedir: relatório final por entrega no formato RESULTADO / EVIDÊNCIA / ARQUIVOS / RISCO / PRÓXIMO.
