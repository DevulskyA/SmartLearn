# Achados — teste funcional em lote, app nativo isolado (2026-11-01)

Instrumento: `scripts/zz-ui-driver.mjs` em modo `batch` (auto-teste 12/12). Lotes em `lotes/`. Erros causados pelo driver foram descartados e corrigidos antes (ver `descartado-rodada1/`).

## Log por jornada
| Jornada | Resultado | Observação |
|---|---|---|
| J00 Preparação | PASSOU | 23 linhas, 2,6 s; senha curta/e-mail inválido: validação sem erro de console |
| J02 Hoje | PASSOU COM RESSALVAS | "Revisão feita" conclui (vencidas 2→1, "1 feita"); não existe botão "Desfazer" com esse nome |
| J03 Estudar agora | PASSOU | acerto/erro/acerto = 2/3, 66,7%, "Refazer erros (1)", próxima revisão 02/11 |
| J05 Plano filtros | PASSOU | filtros e ordenação sem erro; "Limpar" por seletores |
| J06 Disciplinas | PASSOU (criar) | nome repetido não duplica; vazio é recusado; renomear/cor/excluir NÃO TESTADO em lote |
| J07 Aulas | PASSOU | 62 linhas, 8 s: vazio, espaços, repetido, `<b>x</b>`, aspas, emoji, 300 caracteres, data passada e futura |
| J10 Materiais/PDF | PASSOU | envio do PDF, 1 trecho proposto, rascunho com provedor falso, aceitar aula |
| J11 Estatísticas | PASSOU COM RESSALVAS | 3 questões / 2 acertos / 66,7% coerentes com o estudo |
| J12 Configurações | PASSOU COM RESSALVAS | temas e idioma salvam; "Apagar base local" só mostra aviso de não suportado |
| J13 Conta | PASSOU | senha errada: "incorretos"; entrar de novo ok; 401 no console é esperado |
| J01 Menu | PASSOU COM RESSALVAS | 6 destinos abrem; Materiais e Estatísticas lembram a última subtela (rascunho aberto, aba "Por conteúdo"), o que quebrou as esperas do roteiro, não o produto |
| J04 Revisão focada | NÃO APLICÁVEL COM ESTES DADOS | "Começar agora" abre a revisão vencida da aula sem exercícios (expande resumo e exercícios externos); a revisão focada exige vencida com exercícios, e a aula com exercícios só vence em 02/11 |
| J14 Persistência | PASSOU | F5 em Estatísticas, Plano e Hoje; hash inexistente; voltar e avançar: 13 linhas, 2,7 s, sem erro (requisições abortadas no recarregamento são esperadas) |
| J15 Teclado | PASSOU | Tab, Shift+Tab, Enter e Esc sem erro; foco visual não conferido |
| J08 Editor do resumo | PASSOU | editar, salvar, recarregar: o texto com `<b>`, acentos e emoji persiste e aparece literal (12 linhas, 2,9 s) |
| J09 Provas | NÃO ENCONTRADO | nenhuma entrada de prova visível na interface testada |
| J16 Estresse e janela estreita | NÃO TESTADO | redimensionar a janela e diálogos nativos não são controláveis |

## Achados do produto
| ID | Jornada | Observado | Gravidade |
|---|---|---|---|
| A-01 | J07 | Título de 300 caracteres é cortado em 240 sem aviso; o texto ultrapassa a borda do cartão na lista (`prints/J07-salvar-sem-disciplina.png`) | P2 |
| A-02 | J11/Plano | A mesma nota aparece como 66,7% em Estatísticas e 67% no Plano (arredondamento diferente) | P2 |
| A-03 | J12 | O botão de apagar base local existe mas só responde "ainda não é uma operação suportada no modo servidor" | P2 |
| A-04 | geral | Avisos antigos permanecem visíveis ao trocar de tela (ex.: o de apagar dados, o de "Ainda não há evidência…") | P2 |
| A-05 | J07 | A validação do formulário de aula cobra o conteúdo estudado antes da disciplina | P2 (ordem) |
| A-06 | J00 | Criar conta e Entrar levam ~840 ms cada | atrito |

## Candidato a defeito funcional (a corrigir no 1º sprint)
| ID | Jornada | Observado | Gravidade |
|---|---|---|---|
| A-07 | J06 | Renomear disciplina: **Salvar** grava e persiste após recarregar; **Enter** no campo não grava e a edição segue aberta (sem mensagem, sem erro no console). Reproduzido 3 vezes, também com digitação real (clicar, Ctrl+A, digitar, Enter), lote `lotes/J06b.txt` e variações. O código em `src/app.js:4854` trata Enter, então a causa não está diagnosticada (hipóteses: foco fora do `.inline-edit-input`, ou build do exe diferente do fonte). | P1 candidato |

Nota de método: J04 só pode ser exercido com revisão vencida de aula que tenha exercícios; J08 e a renomeação por **Salvar** passaram.

## Atualização: A-07 corrigido (2026-11-01)
- **Causa:** o formulário de edição dos cartões do catálogo de disciplinas (`src/app.js`, campo `.subject-edit-name`) só tinha os botões Salvar/Cancelar; o tratador de Enter/Esc existia apenas no editor da lista antiga (`inline-edit-input`). O Enter não fazia nada e a edição ficava aberta.
- **Correção:** `keydown` no campo: Enter salva, Esc cancela (5 linhas).
- **Prova:** teste E2E novo em `e2e/feature-parity.spec.js` ("Enter in the rename field saves and Escape cancels"): passa com a correção e FALHA sem ela (`expect(...toBeHidden()) failed`, 94); os dois testes de Disciplinas passam em 19,7 s. Falta reconferir no exe nativo depois de reconstruir.

## Erros do meu próprio instrumento (registrados por regra)
| ID | Onde | Observado | Status |
|---|---|---|---|
| I-01 | driver | número de controle velho esperava 6 s e repetia | corrigido (falha em ~0,2 s) |
| I-02 | driver | clique por texto acertava o título e não o botão ("Criar conta") | corrigido |
| I-03 | driver | clique/preenchimento em elemento escondido (formulário de login sob o de cadastro) | corrigido (`visible=true`) |
| I-04 | driver | `expect` aceitava texto escondido | corrigido |
| I-05 | roteiros | `ensure` necessário: painéis que alternam abrem e fecham com o mesmo botão | corrigido (`ensure`) |
| I-06 | driver | aspas escapadas dentro de argumentos não são entendidas pelo lote | limitação conhecida; usar aspas simples |
| I-07 | operador | pasta `C:\c\` criada por caminho errado | pendente: apagar |

## Reclassificação (2026-11-01)
- **A-05 (ordem da validação) não é defeito:** o código documenta a ordem de propósito (data, conteúdo, depois disciplina, "antes de criar qualquer disciplina", `src/app.js:5842`). Fechado como projeto intencional.
- **A-01 (título de 240 caracteres):** o corte em 240 vem do `maxlength` do campo (digitação real não passa de 240; o `fill` do teste truncou). O defeito real era o texto sem espaços ultrapassar a borda do cartão na lista: corrigido com `overflow-wrap: anywhere` em `.plan-unit-title` (`src/styles.css`). Falta conferir visualmente no app reconstruído.

## Verificação no app nativo (build 5c469f0)
- **A-07 corrigido no exe:** Esc cancela e descarta; Enter salva; o novo nome persiste após recarregar (lote `lotes/J06c.txt`, 21 linhas, 0 falhas).
- **A-01 corrigido no exe:** título de 200 caracteres sem espaços quebra em duas linhas dentro do cartão (`prints/A01-titulo-longo-corrigido.png`).
- **Baselines** gravados sobre dados novos (J00, J06c). Lotes que dependem de estado só têm baseline válido a partir de dados novos.

## Higiene dos dados de teste (2026-11-01)
- **Problema:** o conjunto de dados compartilhado tinha lixo (título de 300 "A", `<b>x</b>`, emoji, "Descartavel", "Renomeada", "Zeta"), vindo das jornadas de borda rodadas no mesmo app.
- **Correção:** as jornadas de borda foram para `lotes/bordas/` e rodam em instância descartável (`scripts/zz-ui-bordas.sh`); o ciclo realista (`scripts/zz-ui-full.sh`) só usa dados corretos (disciplinas, aulas, resumo e PDF com nomes reais). Varredura de todas as telas depois do ciclo: nenhuma ocorrência de padrões de lixo.
- **I-08 (instrumento):** seletor CSS com espaço (combinador descendente) era cortado no primeiro espaço pelo lote; usar aspas simples em volta do argumento inteiro. Explicava as falhas do J06d.
- **A-08 (produto, candidato):** a tela final da revisão mostrava "Próxima revisão: 27 de out. de 2026", data anterior a hoje (01/11). Há uma correção não commitada em `src/app.js` e `src/i18n/locales/pt-BR/appStudyNow.js` feita por outra sessão; falta confirmar e commitar.

## A-08 corrigido e verificado no app nativo
- **Antes:** a tela final da revisão focada mostrava "Próxima revisão: 27 de out. de 2026" com hoje = 01/11 (data no passado). Observado no ciclo nativo.
- **Correção:** `src/app.js` (`finishStudyNowSession`) e `src/i18n/locales/pt-BR/appStudyNow.js`: se a revisão pendente mais antiga é anterior a hoje, a tela diz "Revisão em atraso desde {data}".
- **Prova:** o lote `J04` agora exige "Revisão em atraso desde" depois de concluir a revisão; o ciclo completo no exe reconstruído deu 15 lotes, 0 falhas, 41 s. J04 e J16 passam (J16 com janela de 420 px sem rolagem horizontal).
- J09 (provas) segue sem entrada na interface.

## Estatísticas: cálculo verificado (2026-11-01)
O lote J11 agora confere os valores, não só a presença das telas: depois do J04 (acertou, errou, acertou), Estatísticas mostra "66,7%" e "3 questões" (2 de 3 = 66,7%). Ciclo completo: 15 lotes, 0 falhas, 40 s. Com menos de 10 questões a tendência continua "evidência insuficiente" por regra (`src/analytics.js`).

## Fora do alcance do teste (decisão do usuário)
- J09 (provas): não existe entrada de provas na interface; sem tela não há o que testar. Se a funcionalidade deveria existir, é decisão de produto.
- Mudança de monitor da janela: está na branch `fix/window-opens-on-primary-monitor` (c65f53e), provada na janela real; a integração ao app usado (merge) é do usuário.

## A-09 SEED2c falhou 1 de 3 rodadas (intermitente) — registrado na T04, 2026-11-01
- **Onde:** `seed/SEED2c-pdf-aula-passada.txt` linha 5, `expect "Gerar rascunho com IA"` (timeout de 3 s).
- **Esperado:** botão aparece depois da análise do PDF. **Observado (rodada 1):** `texto esperado não apareceu`; a tela capturada 3 s depois já mostrava o botão `[16]`. Lote levou 5213 ms e o guarda marcou DESVIO (baseline ≈ 2,7 s). Rodadas 2 e 3: 0 falhas, 2675 e 2716 ms.
- **Severidade:** baixa (teste), mas é intermitência; o guarda de tempo a detectou.
- **Evidência:** `lotes/seed/falhas/SEED2c-pdf-aula-passada-L5/` (falha.png, tela.txt), primeira captura automática do driver.
- **Causa:** NÃO PROVADA. Hipótese: análise do PDF excedeu 3 s com a máquina carregada na 1ª rodada (instrumento com espera curta, ou produto lento sob carga). Reprodução: repetir o ciclo sob carga. Status: aberto, sem correção (regra: não corrigir durante o ciclo).

### A-09 — causa e correção (2026-11-01)
- **Causa provada (sincronização do teste, não desempenho do produto):** `expect "propostos"` casava com o texto de progresso `materials.upload.chunking` = "Gerando trechos propostos…" (`src/i18n/locales/pt-BR/materials.js:93`), que aparece ANTES do fim da análise. A espera passava cedo e o `expect` seguinte do botão corria contra a análise do PDF (3 s). Na rodada limpa o botão aparece em ~2,5 s; sob carga passou de 3 s.
- **Correção mínima:** os 3 lotes que esperavam por "propostos" (SEED2c, SEED2, J10) passam a esperar a mensagem final "trecho proposto." (não aparece no texto de progresso, que está no plural). Nenhum timeout aumentado; nenhum limite de produto tocado.
- **Prova:** SEED1 + SEED2c em app novo: 0 falhas, SEED2c 2545 ms (baseline 2395 ms), sem DESVIO. Não repeti os 17 lotes. Classe do erro: instrumento (rodada 1 = 1 em 3 era a corrida), regra "espera pelo alvo certo" já existia em "Fail fast, name the cause": eu não conferi se o alvo do `expect` era a condição final (classe 1).

## A-10 Lotes de borda B07 (3 linhas) e B08 (2 linhas) falham na instância descartável — T05, 2026-11-01
- **Onde:** `bordas/B07-aulas-bordas.txt` L17 e L25 (`select #plan-subject-select Farmacologia`, timeout 1200 ms), L29 (`expect "Farmacodinamica receptores"`); `bordas/B08-resumo-html-emoji.txt` L7 e L11 (`expect "ADME"`).
- **Observado:** lotes de borda nunca tiveram baseline (sem medição) e não rodam no ciclo oficial; 5 linhas falham. Evidência: `lotes/bordas/falhas/` (local, fora do Git) e `lotes/bordas/logs/`.
- **Causa:** NÃO PROVADA. SEED1 contém "Farmacologia"; hipótese: B06 ou a ordem dos lotes de borda altera o estado do qual B07/B08 dependem, ou os lotes ficaram defasados em relação à interface. Status: aberto; não afeta o isolamento; resolver na T06/T12 ao gravar baselines das bordas.
- **Meu erro (classe 1, regra "Every test has a measured runtime"):** lotes de borda sem baseline desde o commit 2b42ce0.

## A-11 Senha no snapshot e instâncias esquecidas — corrigidos na T05
- Valor de `input:password` aparecia em `tela.txt`/logs (agora `***`); 40 pastas de instância ficavam em `%TEMP%` (agora `quit` apaga e o guarda varre >1 dia).

## A-12 Janelas de teste abriam no monitor de trabalho e janelas de console piscavam — corrigido, 2026-11-01
- **Observado (usuário):** janelas de teste caíam no monitor direito (o de operação) e janelas pretas de console apareciam.
- **Causa 1 (monitor):** o app cria a janela escondida no monitor principal e a mostra ~0,5 s depois; depois se recentraliza no principal ~1 s após. O movedor começava depois do app, via `Process.MainWindowHandle` (só vê janela visível), e movia uma vez só. Medido antes: janela em 156,156 → movida → de volta a 312,114 (direita).
- **Causa 2 (console):** o daemon não tem console; cada filho (git, node, powershell, taskkill) abria uma janela preta. Medido antes: 10 janelas de console por início/fim de teste. Além disso o exe de debug tem uma janela de console própria.
- **Correção:** `scripts/move-window-to-small-display.ps1` inicia ANTES do app (sinal de pronto), acha a janela pelo PID mesmo escondida, move-a para o menor monitor (esquerdo) antes de ser mostrada, a mantém lá por 30 s e esconde o console do exe; `windowsHide: true` em todos os processos auxiliares (`zz-ui-driver.mjs`, `zz-ui-cycle.mjs`, `desktop-study-*.mjs`).
- **Prova:** janela nunca visível fora do monitor esquerdo (criada escondida em -1360,40 e mostrada em -1368,24); janelas de console: 10 → 1 visível por ~4 ms (o console do exe, escondido em seguida); selftest 21/21; ciclo completo 17 lotes, 0 falhas, 51 s.
- **Limite:** se houver um único monitor, nada é movido. Se o movedor morrer, a janela volta a se recentralizar no principal.

## A-13 Tela Conta logada mostra só "Alterar senha" e "Sair" — relatado pelo usuário, 2026-11-01 
- **Onde:** app nativo DEV 6f1fe2b, menu Conta, sessão `dev@smartlearn.local` já ativa.
- **Esperado (usuário):** logado = estado claro de "conectado" (quem, e como sair); NÃO deixar campos de senha abertos para digitar, senão quem usa não sabe se está logado ou não e pode digitar achando que não entrou. Trocar senha só atrás de uma ação explícita (botão que abre o formulário). O usuário estuda medicina, não computação: o estado de login tem que ser óbvio sem conhecimento técnico.
- **Observado:** "Conectado como dev@smartlearn.local" seguido direto do formulário Alterar senha (Senha atual / Nova senha) com o campo de senha em destaque; "Sair" fica no rodapé do cartão.
- **Severidade:** média (UX/confusão de estado de login; usuário é estudante de medicina). **Status:** aberto, correção adiada (regra: registrar agora, corrigir depois).
- **Relacionado:** A-14 abaixo.

## A-14 App abre maximizado na tela 2 (primária), não na tela 1 — 2026-11-01
- **Onde:** `npm run dev:desktop` em 6f1fe2b (sem a correção da branch `fix/window-opens-on-primary-monitor`, c65f53e).
- **Esperado:** janela na DISPLAY1 (esquerda, 1440x900). **Observado:** L=-8 T=-8 R=1928 B=1088 (DISPLAY2). Movida à mão para DISPLAY1.
- **Regra violada:** pedido repetido do usuário; memória `feedback_open_screen1_and_login`. **Status:** contornado à mão; correção real = integrar c65f53e (decisão do usuário).

## A-15 App nativo DEV fechou sozinho — 2026-11-01
- **Onde:** `npm run dev:desktop` em 6f1fe2b. **Observado:** launcher terminou com exit 0; nenhum `smartlearn.exe` rodando depois; log sem erro. **Causa:** não identificada (sem evidência de quem fechou). **Status:** aberto, sem reprodução.
- **A-14, preparação da validação (2026-11-02):** `git merge-tree` de HEAD com `fix/window-opens-on-primary-monitor` (c65f53e) CONFLITA em `src-tauri/src/lib.rs` e `window_state.rs`: o HEAD já tem sua própria versão do estado de janela (d5215a6, 2bed0cf, 5ed8075, c985a9d). Não integrar às cegas. A diferença provável que falta no HEAD é só "primeira execução / monitor sumido centraliza na DISPLAY1". Próximo passo: reabrir o app sem mover a janela à mão e ver onde ele abre; se abrir na DISPLAY2, portar só essa regra (não a branch inteira). Integração depende de autorização do usuário.

## A-16 ACCESS-3 (keyboard-today) falhou 1 vez em lote paralelo, passa sozinho — 2026-11-02
- **Onde:** `e2e/keyboard-today.spec.js:77`, rodando junto com 4 outras specs (5 specs, 3 workers). **Observado:** `toBeChecked` estourou os 8 s e o teste levou 14,6 s (sozinho: 3,3 s, 2 de 2 execuções verdes). **Hipótese:** carga do lote, não a mudança do botão "Desfazer conclusão" (a falha não toca o botão). **Status:** DECLARED, não provado; reabrir se repetir em lote.
- **J02 (corrigido):** botão "Desfazer conclusão" em revisão concluída (mesmo reopen auditado); E2E `robustness-study-loop.spec.js` verde.

## A-17 E2E completo em 96f2e47: 4 testes antigos falharam (3 de tema, 1 do Plano) — 2026-11-02
- **Onde:** `e2e/theme.spec.js` (3 testes) e `e2e/exam-mode.spec.js:404` (UX-1). Rodada completa: 372 passaram, 4 falharam, 2 ignorados, 14,3 min (baseline ~13 min).
- **Causa (provada, reproduz sozinho):** testes velhos, não defeito do produto. O tema virou um combo `#theme-select` em 6f1fe2b e os testes ainda procuravam `[data-theme-option]`; o B03 (0348c3d) trouxe o 4º botão "Editar questões" e UX-1 contava 3.
- **Correção:** testes atualizados para o comportamento novo (combo com 3 grupos, valor e rótulo ativos; 4 botões). 14/14 verdes em 46 s.
- **Classificação (erro meu):** 1 — a regra de ampliar a regressão conforme o alcance existia; rodei só grupos focados e não as specs que tocam o mesmo DOM. Só o E2E completo pegou. Regra não alterada.

## A-18 Rodar E2E e ciclo nativo ao mesmo tempo gerou falha e lentidão falsas — 2026-11-02
- **Onde:** E2E completo em c9f797d (375 ok, 1 falha, 2 ignorados, 15,4 min contra ~14) e `e2e/sweep-fixes.spec.js:137` ("Criar conta": `#account-login-message` vazio em 5 s). Sozinha a spec passa 2/2 (8/8 testes, ~30 s).
- **Causa provável (DECLARADA, não provada):** eu rodei o ciclo nativo (`zz-ui-full.sh`) e o driver durante o E2E; o ciclo mediu 116 s contra ~50 s de baseline (PERF DEVIATION em quase todos os lotes) e o lote SEED1 foi REJEITADO COMO LENTO. A falha única e a lentidão coincidem com a disputa de CPU. Mesma classe de A-16.
- **Regra:** "Instrument integrity" (um instrumento de cada vez; lentidão anômala é sinal). Existia e eu não segui: iniciei dois instrumentos concorrentes. Classificação 1. Guarda: não iniciar o driver nativo enquanto `scripts/e2e.mjs` roda (anotado aqui; se repetir, guardar em código no zz-ui-guard.sh).
- **J12 (ciclo nativo):** 5 falhas porque o lote clica os botões antigos do tema (Papel, Sépia, Noite, Alto contraste, Automático) que viraram combo. Instrumento desatualizado; não alterado porque o usuário está refazendo a página de Tema.
- **Achado de instrumento:** o app do driver serve `src-tauri/resources/dist-runtime`, empacotado só pelo launcher/`npm run package:standalone`. Estava em 91fe3d9, então o ciclo nativo anterior testou código velho (sem B03, J02, A-04). Reempacotado em 3296f0d+local.

## A-19 Duas falhas intermitentes em 7 specs de Materiais/resumo — 2026-11-02
- **Onde:** `draft-autosave`, `lesson-editor`, `smoke`, `summary-figure-width`, `summary-math-editor`, `summary-visual-editor`, `summary-wysiwyg` (75 testes) rodando logo após `npm test`. **Observado:** 2 falhas (`expect(locator).toBeVisible()`), 73 ok, 3,8 min. Rerodando as mesmas 7 specs: 75 de 75 ok, 3,4 min.
- **Status:** DECLARADO, não provado. Não capturei os nomes dos 2 testes na primeira rodada (erro de instrumento meu: filtrei a saída antes de guardar). Mesma classe de A-16/A-18 (falha única sob carga, passa na repetição). Se repetir, rodar com `--repeat-each` e guardar o log inteiro.

- **E2E-F2 (2026-11-02, E2E completo em d186db3):** 7 specs falharam de 380 (migration:66, summary-pdf-crop:154, summary-wysiwyg:107, today-loading-state:59, sweep-fixes:139 e 157, ui-polish:58); o log tem 12 mensagens "real server did not become ready in time"; a duração foi 17,3 min contra 10,6 min da última rodada limpa (63% a mais). **Causa provável: carga da máquina (outras sessões e agentes ativos), não produto:** os mesmos 6 arquivos reexecutados isolados passaram 28 de 28 (2,3 min). **Severidade:** P2. **Status:** a suíte completa sobre d186db3 NÃO ficou verde numa única rodada; está verde só em duas rodadas parciais. Mitigação possível: não rodar a suíte com outras sessões ativas; o prazo de 8 s para o servidor subir nos specs é curto sob carga (guarda a considerar). Log: `.specs/evidence/e2e-full5.txt` e `e2e-rerun-failed.txt`.

## E2E completo a9fb9bb (2026-11-02) — flake de infraestrutura
- Onde: `e2e/study-now-reveal-order.spec.js:81`, `support/session.js:32` (`page.goto('/')`).
- Esperado: página carrega. Observado: `net::ERR_CONNECTION_REFUSED` em `localhost:62363` (servidor Vite do worker caiu/ainda não escutava).
- Gravidade: baixa (instrumento, não produto). Reprodução: não reproduz; reexecução isolada 5/5 verde. Suíte: 416 ok, 1 falha, 2 puladas, 10,1 min, sem desvio de duração.
- Estado: aberto como candidato F-1 (porta/servidor por worker); classe repetida (cartão anterior: 7 falhas por carga) — guardar no código se voltar.

## A-09 quebrou study-verdict.spec.js:139 (2026-11-03) — erro meu
- Onde: commit a585ff4 (nota da janela da tendência em Estatísticas). Usei a classe `stats-panel-note`, que o spec `study-verdict.spec.js:139` já usa com seletor único.
- Observado: `strict mode violation` (2 elementos). Corrigido neste commit com a classe `stats-trend-note`.
- Causa: rodei só os specs que eu julguei relacionados (stats-aaa, trend-chip, responsivo, ordenação) e empurrei sem buscar quem mais usa a classe nova/antiga.
- Classificação 2 (regra existia e segui, mas incompleta): "testes dirigidos" não diz para procurar por seletor/classe em TODOS os specs. Ajuste de método: antes de nomear classe ou id novo em HTML compartilhado, `grep` da classe em `e2e/`; a suíte completa final pega o resto.

## E2E completo 1638ac3 (2026-11-03)
- Resultado: 419 ok, 1 falha, 2 puladas, 15,6 min (rodada anterior: 10,1 min; +54%, desvio relevante; outra sessão ativa na máquina).
- Falha: `stats-responsive-regression.spec.js:149` (Prática/Recência), `Test timeout of 30000ms exceeded`. Sozinho passa em 18 s; o teste semeia e recarrega 6 vezes (um por largura) e o limite padrão de 30 s só serve em máquina ociosa. Causa: INSTRUMENTO (limite subdimensionado), não produto. Corrigido com `test.setTimeout(90000)`.
- Regra de método: o limite de um teste deve ser maior que 2x o tempo medido dele sozinho; este tinha 1,7x.

## CI-01 — job security do CI da main falhou na auditoria npm (2026-11-03)
- Onde: GitHub Actions, run 41559850493, job `security`, passo `Dependency audit (root)`.
- Esperado: auditoria sem vulnerabilidades. Observado: katex 0.11.0 a 0.18.1, prototype pollution contorna restrições de trust (1 baixa).
- Gravidade: baixa (o projeto usa `trust: false`), mas deixa a main vermelha.
- Causa: o CI novo nunca tinha rodado; o `npm audit` não foi verificado antes do merge (declarado como não verificado no parecer).
- Correção: katex 0.19.1 em 6eff76a (integração); 36 testes unitários e 13 E2E de matemática passam. Falta publicar na main (decisão do dono).
- Classe do erro (regra de auditoria de erro próprio): 3, sem regra que cobrisse "um gate novo que nunca rodou deve rodar localmente antes do merge". Guarda: rodar `npm audit --omit=dev` e `npm audit` do servidor antes de qualquer merge que traga CI.

## Estabilização 2026-11-07 (HEAD 37b17e7 + alterações locais)

### E-021 — `attempts.start()` não era idempotente (REPRODUZIDO e CORRIGIDO)
- Onde: `server/src/services/attempts.js` `start()`; cliente `src/app.js` `ensureAttemptStarted`, `recordStudyNowReveal`, `judgeStudyNow`; `src/remote-store.js` `attempts.start`.
- Esperado: resposta de `start` perdida e repetida devolve a mesma tentativa. Observado: segunda linha `STARTED` órfã (teste de serviço vermelho; E2E com a chave removida: 2 linhas, `STARTED` + `SUBMITTED`).
- Gravidade: média (tentativa órfã suja o ledger; não altera evidência agregada).
- Correção: `operationKey` opcional via `idempotency.js` na mesma transação do INSERT (409 em reuso conflitante); chave por (sessão de estudo, questão) e Promise compartilhada por item no Hoje. Provas: `server/test/attempts.test.js` 20/20 (inclui corrida HTTP); `e2e/study-retest-network.spec.js` RETESTNET-1 (3) + RETESTNET-2 novo, mutação sem chave falha como esperado.
- Reproduzir: `cd server && node --test test/attempts.test.js`.

### E-025 — `draft-autosave.spec.js:152` estourava os 30 s (INSTRUMENTO, não produto)
- Observado: passa sozinho com 90 s (39,1 s no total); com 30 s o tempo acaba no laço de digitação. Esperado: limite > 2x o tempo medido.
- Classificação (regra "Own errors"): 2 — a regra "limite > 2x o tempo sozinho" (registro de 2026-11-03) existia, mas não varre testes que nunca tiveram o tempo medido. Correção: `test.setTimeout(75000)` com o tempo medido no comentário; arquivo todo 17/17 (3,6 min).
- Guarda pendente: baseline por teste (`--record-baseline`) para os specs sem tempo registrado.

### E-026 — `draft-acceptance:79` e `content-quality-flow:130` estouram sob carga (3-4 workers)
- Observado: nas suítes `materials@3w` falharam por timeout de 30 s; sozinhos passam (33,7 s e 35,7 s no total, ou seja, já acima do limite padrão). Status: não reproduzido isolado; sensível a carga. Ação: ver rodada completa e medir baseline.

### REG-01 — "regressões" de PDF, editor, temas e i18n relatadas pelo dono
- Evidência (A): `~/SmartLearn-DevData/last-launch.json` aponta para `C:\Users\Ariel\smartlearn-open-20261105`, branch `claude/smartlearn-v1-complete`, HEAD `ed15172` (5 temas, 8 telas, 1 locale). O HEAD atual tem 24 opções de tema, `src/i18n` com 28 arquivos pt-BR, `pdf-crop-dialog`, `summary-visual-editor`, e zero arquivos removidos de `src`, `shared`, `server/src` contra `ed15172`.
- Inferência (B): o app aberto era o código antigo, por causa do guardrail `require-work-branch.mjs`. Falta confirmação do dono.

### Fechamento 2026-11-07
- E-026: `draft-acceptance:79`, `content-quality-flow:130`, `account-password-hint:5` e `accessibility:116` passam sozinhos e com 3 workers sob o timeout de 60 s (27/27). Causa: limite de 30 s curto para testes saudáveis de 30-40 s e máquina disputada por outro agente (dois `npm test` simultâneos vistos). Correção: `timeout: 60000` em `playwright.config.js`.
- E2E completo: 439 ok, 2 puladas, 2 falhas de timeout, 887 s contra baseline 702 s (+26%); desvio reportado, explicado por contenção, não por defeito. Sem baseline para smoke/summary/materials/completo.
- Instrumento: um `npm test --silent | grep` do servidor ficou pendurado sem saída; a mesma suíte direta (`node --test`) deu 1230/1230 em 123 s. Causa não investigada além de "invólucro"; mesma classe de E-024 se repetir: guarda = rodar direto com tempo esperado.

### Rodada final 2026-11-07 (17:14-17:38)
- E2E: smoke 10/10 (62 s), summary 105/105 (269 s), materials 67/67 (238 s), completo 441 ok / 0 falhas / 2 puladas (894 s). Baselines gravados em `e2e/.duration-baseline.json`; `full@3w` passou de 702 (425 testes) para 895 (441 testes). Desvio de +27% com +4% de testes: contenção de outro agente na máquina (dois `npm test` ociosos vistos); re-gravar com a máquina livre.
- Erro MEU de instrumento (classe 1, regra "Instrument integrity": o laço de espera deve casar só a linha final): meu `grep "E2E passed.*[0-9]{3} s"` casou linhas de suítes anteriores e encerrou a espera cedo; percebido pelo relógio e corrigido para casar `baseline full`. Sem efeito no resultado.

## Jornada Desktop real 2026-11-07 (autorizada pelo owner)
- Alvo: exe debug construído do HEAD 3575715 em CARGO_TARGET_DIR=C:/Projetos/SmartLearn-journey-target; dados descartáveis em temp; humanDevDatastoreTouched=false.
- Resultado: 23/23 PASS com CODEX real (provider CODEX, modelo codex:default, 3 questões, geração 70 s). Inclui E-021 no fluxo Estudar agora/Hoje, reabertura, editor visual, autosave, figuras.
- OBS-J1 (baixa, não investigada): 5 `console.error` "401 Unauthorized" (passos 1, 2, 22, 23). Prováveis sondas pré-sessão/pós-kill do autosave; passos passaram. Reproduzir: rodar a jornada e ler consoleErrorSample. Status: aberto.
- Instrumento: `npm run build` foi bloqueado pelo guardrail SMARTLEARN_WRONG_WORKTREE (branch codex/restore-pdf-parity); dist usado era de 17:31, posterior à edição de src/app.js (15:59) e contém attemptKey (verificado). Exe antigo (05/11) não servia: sem E-021.

## Rodada 2026-11-07 (noite): classe E-021 e teste instável
- E-028 (média, corrigido): `POST /learning-units/:id/exercises` e `POST /learning-evidence` (EXTERNAL) duplicavam sob chamada simultânea (2 linhas). Achado pela sonda `server/test/creator-routes-concurrency.test.js`. Correção: `operationKey` opcional (idempotência no mesmo `db.transaction`, como `attempts.start`); sem chave o comportamento é o antigo; reuso com payload diferente = 409. `subjects` e `exams` já eram seguros por estado. Rotas ainda não sondadas (exigem fixtures): `/generation-jobs`, `/proposals/:id/drafts`, `/drafts/:id/accept`, `/imports/:id/commit`, `/sources`. O cliente ainda NÃO envia a chave nessas duas rotas (próximo passo: `src/remote-store.js`).
- E-029 (baixa, corrigido): `server/test/process-smoke.test.js` "restart on same DB after graceful stop retains a written marker" falhou 2 em 4 rodadas com `waitFor timed out` (5,2 s). Causa: timeout de 5 s para subir um servidor real enquanto `node --test` roda outros arquivos em paralelo (instrumento, não produto). Correção: 15 s; depois 3 rodadas completas seguidas 1234/1234. Classe 3 das regras de erro meu/instrumento (nenhuma regra cobria; guarda é o próprio timeout dimensionado e o comentário no código).

### OBS-J1 follow-up (2026-11-07): the 401 URLs

`scripts/desktop-study-journey.mjs` now records the URL of every 401 response in `http401`. A run against an exe older than HEAD (bundled frontend `37b17e7`, expected `7f2877f`) stopped at step 2 by the identity check, as designed, and still showed 401s: `GET /v1/auth/me` x4 during step 1 (session probes before any login) and `GET /v1/agenda` + `GET /v1/review-tasks` from the step 2 state read, which ran unauthenticated. Reading: the `auth/me` 401s are the expected "no session yet" probe; the other two come from the failed step, not from a logged-in screen. NOT PROVEN for a passing run: that needs the exe rebuilt at HEAD (release/build is blocked by the branch guardrail, owner decision). The identity check worked: the stale exe was refused, not accepted. Classification: instrument/target mismatch (class 3), not a product defect.

### Jornada nativa em fc54183+local (2026-11-07 noite): 22 de 23 passos, FALHA no passo 20 (J-20)

- Alvo confirmado: exe debug com bundle `fc54183`, hash de recursos `b23dbf19a9b9`, banco e perfil descartáveis, `humanDevDatastoreTouched=false`. `http401`: 3 URLs, todas `GET /v1/auth/me` antes do login (esperado).
- Resultado: passos 1-15, 19, 21-23 PASS; passo 20 FAIL; 16-18 NOT_RUN (a jornada para no primeiro erro). `--record-baseline` não gravou (exige 23/23). Tempos por passo medidos (total dos passos executados ~129 s; passo 5, geração Codex real, 56,8 s; passo 22, 25 s; passo 20, 16,5 s até o timeout).
- J-20 (alta até reproduzir): em Hoje, após responder a 3ª questão da etapa (as duas primeiras foram julgadas no passo 14) a revisão NÃO concluiu em 15 s. Estado do servidor no instante: 16 vencidas, nenhuma concluída, sem erro de console no passo (portanto o servidor não recusou nada: o clique de conclusão não foi enviado ou ficou esperando). O e2e headless `review-completion-rule` (6 testes) passa no mesmo HEAD, e nenhum commit desde 3575715 (último 23/23) toca a conclusão de revisão; as mudanças de produto desde então são só `operationKey` em exercícios/evidência/rascunho. Causa NÃO provada: candidatas = `await flushPendingAttempt` pendente (reveal/submit da 3ª questão) ou contador `exercisesAnswered` da seção divergente após o re-render de Hoje no WebView2.
- Instrumento: a jornada agora captura, na falha, `reviewRow` (total/answered/correct da seção, estado da caixa, itens e mensagem) para decidir entre as duas hipóteses sem adivinhar. Reexecutar exige nova geração Codex real (passo 5, ~57 s), proibida pela autorização vigente; fica para uma rodada autorizada.

- J-20 causa PROVADA (A, dado da própria rodada): o Codex gerou 4 questões (passos 5, 6, 8 "4 exercícios", 12 "3/4 corretas"); o passo 20 supunha 3 e esperava a conclusão após a 3ª resposta. Com 4 questões a revisão corretamente NÃO conclui antes da 4ª (regra do produto). Defeito do instrumento (classe: premissa fixa sobre saída não determinística do modelo), não do produto. Correção em 5b23188: a jornada lê o total real (`ctx.reviewTotal`, mínimo 3), responde as restantes e compara evidência/tentativas com esse total. As hipóteses anteriores (reveal/submit pendente, contador divergente) ficam descartadas. Pendente: rodada 23/23 confirmatória (exige 1 geração Codex real).

- Jornada nativa 23/23 PASS em fc54183+local (2026-11-07, após 5b23188 e a correção da conta esperada: 1 acerto + restantes; o erro da rodada anterior era MEU, o app contou 3/3 respondidas e 2 corretas, certo). Baseline gravada em `e2e/.journey-baseline.json` (total dos passos 147,7 s). Onde vai o tempo: passo 5 (geração Codex real) 60,7 s = 41%; passo 22 (autosave/encerramento) 26,8 s; passo 17 (fechar e reabrir) 13,7 s; passo 18 7,6 s; passo 23 7,6 s; os outros 18 passos somam ~27 s. Sem Codex ≈ 87 s (antes ≈ 122 s com Codex de 70 s). Nenhum gargalo de produto comprovado; 22 e 17 são esperas deliberadas de encerramento/reabertura, não investigadas. `http401`: 3x `GET /v1/auth/me` pré-login (esperado). Console: 5 erros (3x 401 esperados, 1 `net::ERR_FAILED` no passo 22 ao encerrar o app, 1 409 ASSET_IN_USE esperado no passo 23).

## Axe nos 23 temas (2026-11-08)
- Lacuna fechada: `e2e/accessibility.spec.js` rodava axe em 12 dos 23 temas concretos (THEME_OPTIONS menos "auto"). Agora cobre os 23 em 1280 px mais paper em 375 px (24 casos). Resultado: 24/24 sem violação critical/serious.
- E-030 (baixa, instrumento, classe 3): 1 dos 24 casos falhou na primeira rodada com `registering ... over HTTP failed with 429 RATE_LIMITED` (24 registros de usuário em ~5 min com 3 workers batem no limitador do servidor). Não é acessibilidade. Reexecutado isolado: passou. Se voltar, o caso deve semear o usuário sem passar pelo limitador ou o teste deve ser dividido em lotes.
- PERF DEVIATION do runner (336 s contra baseline 48 s) é esperado: o número de casos dobrou; a baseline `full@3w+args` pertence a outra seleção. Não é regressão.

## Baseline visual 390/1280 (2026-11-08)
- Capturado por `e2e/visual-baseline.spec.js` (só roda com `SCREENSHOT_DIR`): 6 telas x 2 larguras em `.specs/evidence/visual-baseline-2026-11-08/` (12 PNG, 572 KB), servidor real, dados realistas (2 disciplinas, 6 exercícios), banco descartável. Headless; o banco humano não foi tocado.
- V-01 (média, CANDIDATO, a confirmar com captura só da viewport): Estatísticas a 390 px, tabela "Desempenho por disciplina": o cabeçalho "DESEMPENHO" aparece cortado ("DESEMPENHC") e, na linha da disciplina, "Sem evi…", "Sem que…" e "Amostra insuficiente" se sobrepõem. A barra inferior aparece no meio da imagem por ser captura fullPage (artefato do instrumento, não defeito). Estatísticas é superfície protegida (ADR-0001): só registrar, correção exige decisão do dono.
- Hoje a 390 px: sem corte nem sobreposição visível na área capturada.
- V-01 CONFIRMADO (2026-11-08, duas observações independentes: captura só da viewport `390-estatisticas-viewport.png` e medida no DOM). A 390 px, em Estatísticas, `span.subject-compare-value` ("Sem evidência") e `div.practice-compact` ("Sem questões") têm texto mais largo que a caixa e ficam cortados; o cabeçalho "DESEMPENHO" aparece como "DESEMPENHC". A 1280 px nada fora os rótulos visually-hidden (esperado). Superfície protegida (ADR-0001): correção exige decisão do dono. Severidade média. O spec agora imprime `CLIPPED [...]` por tela e salva também a captura de viewport.
