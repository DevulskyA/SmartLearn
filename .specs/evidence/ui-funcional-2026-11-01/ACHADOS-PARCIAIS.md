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
