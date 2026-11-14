# Erros observados nos testes de interface e Desktop

## Estado atual

Documento vivo. Cada ocorrência observada gera um Item no Planban. Nenhum Item é marcado como concluído sem revisão e nova prova.

## E-001 — Artefato Desktop incompatível com o código atual

- Contexto: `scripts/desktop-study-journey.mjs` usando `C:\Projetos\SmartLearn\src-tauri\target\release\smartlearn.exe`.
- Evidência: `build-info.json` do executável indicou hash de conteúdo `19c3c98f…`; o código atual calculou `81d9…`.
- Impacto: o teste não pode provar o comportamento do Desktop atual.
- Próxima ação: gerar artefato DEV/Release compatível no branch autorizado e repetir a jornada.
- Status: aberto.

## E-002 — WebView2 não publicou página no CDP

- Contexto: primeira tentativa da jornada nativa.
- Evidência: `the Desktop window page was not found over CDP`; `steps: 1`, `PASS: 0`, `FAIL: 1`, `21 NOT_RUN`, código 1, 50,926 s.
- Impacto: nenhum preenchimento ou clique da jornada chegou a executar.
- Causa provável: artefato/runtime incompatível; ainda não isolada como defeito do produto.
- Próxima ação: repetir com artefato compatível; reduzir a espera diagnóstica quando CDP não expuser uma página.
- Status: aberto.

## E-003 — Provedor implícito divergente do contrato do roteiro

- Contexto: execução Desktop com `SMARTLEARN_AI_PROVIDER` ausente.
- Evidência: Rust aplicou o padrão `CODEX`; o roteiro esperava provedor nulo/fake e falhou em `an AI provider is configured: CODEX`.
- Impacto: a jornada parou antes da geração.
- Correção aplicada: o roteiro passou a declarar o provedor explicitamente e validar o provedor/modelo real do fluxo. A validação final ainda depende de artefato compatível.
- Status: aguardando prova final.

## E-004 — Timeout de chamada real de IA sem diagnóstico final

- Contexto: tentativa autorizada com CODEX real.
- Evidência: execução interrompida antes de retorno final porque o timeout herdado podia chegar a 1.200.000 ms; não houve JSON final nem código funcional.
- Impacto: benchmark da chamada real não foi concluído.
- Próxima ação: executar uma única chamada real com timeout controlado e registrar provider, modelo, duração, estado e custo/telemetria disponível.
- Status: aberto.

## E-005 — Executor completo ausente no worktree autorizado

- Contexto: `C:\Users\Ariel\smartlearn-open-20261105` após build Release válido.
- Evidência: `node scripts/desktop-study-journey.mjs` falhou em 0,1 s com `MODULE_NOT_FOUND`; o arquivo não existe nesse worktree.
- Impacto: não foi possível iniciar a jornada completa usando simultaneamente o executor existente e os recursos do artefato autorizado.
- Limite: misturar o script de `C:\Projetos\SmartLearn` com recursos de outra branch invalidaria a identidade do teste.
- Correção aplicada: executor copiado para `C:\Users\Ariel\smartlearn-open-20261105\scripts\desktop-study-journey.mjs`; origem preservada e SHA-256 conferido (`860CE8B5E5D28174AD53091FD90306E0CCA5619485D413CFE0A45EF63D1F4C30`). Helper ausente também foi adaptado em `e2e/support/summary-editing.js`.
- Status: corrigido; a jornada passou a abrir o executável Release autorizado via CDP.

## E-006 — Upload do PDF não gerou propostas no Desktop

- Contexto: jornada nativa com executável `ed15172+local`, WebView2 carregado, login confirmado e tela Materiais aberta.
- Reavaliação: falso positivo do executor. O upload foi concluído e o DOM continha 1 `.source-proposal-item`; a sessão antes do upload respondeu 200.
- Causa: a asserção `/trechos? propostos?/` não aceitava o texto real `1 trecho(s) proposto(s)` e aguardou até timeout.
- Correção: regex ajustada no executor para aceitar as formas literal e plural; passo 4 aprovado em 924 ms na execução final observada.
- Status: encerrado como erro do teste, sem defeito confirmado no produto.

## E-007 — Assertiva de mensagem incompatível com o texto real

- Contexto: primeiro bloqueio do passo de importação no executor copiado.
- Evidência: `#sources-message` continha `1 trecho(s) proposto(s)...`; `source-proposal-item` tinha 1 item, mas o locator com `/trechos? propostos?/` expirou em 20.000 ms.
- Impacto: a jornada parava antes da IA apesar do PDF ter sido processado.
- Correção: regex do passo 4 aceita `trecho(s)`/`trechos` e `proposto(s)`/`propostos`; prova posterior passou.
- Status: corrigido.

## E-008 — Jornada não aguardava geração assíncrona nem exercitava “Ver andamento”

- Contexto: primeira execução após corrigir o upload, com provedor CODEX real.
- Evidência: passos 1–4 passaram; o passo 5 clicou “Gerar rascunho com IA” e expirou aguardando `.lesson-editor` em 30.000 ms; a tela ainda estava em Materiais com a proposta presente. Código 1; duração total 40,31 s.
- Impacto: o executor encerrava a janela antes de observar a conclusão/erro do job, impedindo a confirmação da geração real e podendo ocultar o comportamento de “Ver andamento”.
- Correção em andamento: o executor passou a manter o Desktop aberto por até 180.000 ms, consultar o estado real do job e clicar “Ver andamento”/“Abrir rascunho” quando a UI os expuser; falha do provedor continua sendo registrada, sem FAKE.
- Status: em validação.

## E-009 — “Ver andamento” aparece desabilitado durante o painel de geração

- Contexto: execução nativa com CODEX real após a correção da espera assíncrona.
- Evidência: o botão real foi encontrado por role/aria-label como `button[data-action="show-generation"]`, com texto `Ver andamento`, mas `disabled`; o clique Playwright expirou em 30.000 ms aguardando o controle ficar habilitado.
- Impacto: a UI não permite reabrir o andamento enquanto o painel de geração observado está ativo; o executor não deve interpretar isso como falha de upload ou da IA.
- Correção do executor: só clicar quando o botão estiver habilitado; acompanhar o job por estado real e preservar a evidência de `disabled`.
- Status: ocorrência registrada; comportamento de produto/UX pendente de decisão após a jornada completa.

## E-010 — Editor visual ausente no artefato autorizado

- Contexto: jornada CODEX nativa no Release `ed15172+local`, após PDF e geração concluídos.
- Evidência: passos 1–6 passaram; o passo 7 não encontrou o botão acessível `Inserir fórmula` em 30.000 ms. O worktree autorizado contém `src/lesson-editor-ui.js` textual, mas não contém os módulos `summary-visual-editor.js`, `summary-insert.js`, `pdf-crop-dialog.js` e `figure-ui.js` presentes no outro worktree.
- Impacto: fórmula, tabela/figuras visuais e recorte de região do PDF não podem ser testados nesse executável sem incorporar código e recompilar, o que está fora da restrição atual.
- Adaptação do executor: testar resumo textual, questão, aceite e persistência disponíveis; parar explicitamente no passo visual com assertiva de capacidade ausente, sem simular os controles.
- Status: bloqueio técnico específico do artefato; requer build com a paridade visual ou autorização para alterar/recompilar o produto.

## E-011 — Contrato de salvamento do executor não correspondia ao editor textual

- Contexto: após adaptar o passo visual para a capacidade disponível, o resumo/questão foram editados, mas o helper aguardou `.save-indicator[data-state="saved"]`.
- Evidência: o artefato autorizado usa `p.form-message.lesson-message` com `Resumo salvo. As questões não foram alteradas.`; o indicador moderno não existe. O passo 7 expirou em 15.000 ms.
- Impacto: falso bloqueio do executor antes da verificação de reload/persistência.
- Correção: helper aceita o indicador moderno ou a mensagem textual real; a asserção de persistência permanece obrigatória.
- Status: em validação.

## E-012 — Validação visual do Resumo Mestre ausente no artefato autorizado

- Contexto: depois do aceite real da aula, o passo Plano abriu a unidade, mas o roteiro esperava KaTeX/tabela/figuras.
- Evidência: aceite passou com `unitId: 1`, `4 exercício(s)` e `16 revisões`; o passo 9 expirou em 10.000 ms aguardando `.katex` em `.plan-summary-body`. O texto do Resumo Mestre estava presente.
- Impacto: a apresentação visual não pode ser validada neste executável; a navegação e o conteúdo textual ainda podem ser testados.
- Correção do executor: validar o texto quando `visualEditorAvailable=false` e preservar a lacuna visual como evidência.
- Status: em validação.

## E-013 — Julgamento ultrapassa a gravação de revelação em Estudar agora

- Contexto: exercícios reais depois do aceite; primeira revelação passou com `attemptId=1` e `maxAssistance=SOLUTION`.
- Evidência: no terceiro exercício o executor atrasou deliberadamente a requisição de revelação em 700 ms e julgou imediatamente, para testar a corrida real. O servidor retornou `assistance=NONE` em vez de `SOLUTION`; houve respostas 409 e console `Esta tentativa já foi finalizada`. Passos 1–11 passaram; passo 12 falhou em 392 ms; código 1.
- Impacto: a tentativa pode ser julgada antes de a revelação ser registrada, corrompendo a métrica de assistência e interrompendo a verificação de persistência/revisão.
- Próxima ação: corrigir o contrato de ordenação/idempotência entre `reveal-solution` e `submit`, depois repetir a jornada; preservar o teste de corrida como regressão.
- Contraprova: no mesmo executor com `SL_JOURNEY_RACE=off`, revelação aguardada antes do julgamento, os passos 12 e 13 passaram com `maxAssistance=SOLUTION`; a corrida imediata continua sendo a falha específica.
- Status: defeito real observado; aberto.

## E-014 — Handler de corrida do executor encerrou o processo sem JSON final

- Contexto: primeira execução no modo exploratório de sessão única, após E-013.
- Evidência: o handler Playwright atrasou a rota de revelação; depois de uma falha, uma chamada pendente executou `route.continue()` numa rota já tratada. O Node terminou com `route.continue: Route is already handled!`, sem JSON final; duração 102,10 s. O processo Tauri foi verificado e não ficou órfão.
- Impacto: a sessão única não entregou o inventário completo de etapas e erros.
- Correção: handler nomeado, `try/finally`, `unroute` garantido e erro de rota absorvido durante encerramento/limpeza; o defeito do produto E-013 continua visível.
- Status: corrigido no executor; precisa de nova prova de sessão única.

## E-015 — Auxiliares PowerShell do executor ausentes no worktree autorizado

- Contexto: sessão única exploratória chegou ao fechamento/reabertura.
- Evidência: `scripts/window-rect.ps1` e `scripts/move-window-to-small-display.ps1` não existiam em `C:\Users\Ariel\smartlearn-open-20261105`; o passo 17 falhou ao executar `window-rect.ps1`. O processo Tauri foi encerrado sem órfão.
- Impacto: a prova de restauração de posição e parte da reabertura não pôde ser concluída.
- Correção histórica: os dois auxiliares foram copiados/adaptados no worktree autorizado, preservando os originais.
- Reclassificação: o executor Playwright/CDP corrigido não os chama mais; a etapa de posição nativa foi removida do caminho de execução para preservar o mouse/desktop do usuário.
- Status: encerrado como caminho de teste removido; os arquivos permanecem preservados para histórico.

## E-016 — Cartão agrupado de Hoje não existe no artefato executado

- Contexto: depois do aceite e da prática inicial, a sessão única tentou iniciar a revisão vencida.
- Evidência: na repetição, o executor esperou `#today-primary-action-btn[data-review-id]` e obteve as 16 linhas reais, com IDs 1–16. Ainda assim, nenhuma linha estava dentro de `details.overdue-unit`; o passo 14 falhou com `Hoje: the review is not inside a grouped details.overdue-unit card`. A falha anterior de `reviewId=undefined` era do timing do executor e foi corrigida.
- Impacto: a revisão Hoje agrupada e sua persistência não puderam ser verificadas nessa sessão.
- Classificação: defeito/ausência de contrato visual do artefato executado, não mais um problema de leitura do executor. O botão expõe o `reviewId`, mas o DOM renderiza linhas avulsas em vez de uma unidade vencida agrupada.
- Contraprova no código atual: `npx playwright test e2e/hoje-overdue-groups.spec.js --workers=1 --retries=0 --reporter=line --forbid-only` passou (`1 passed`, 30,2 s); os testes puros de agrupamento também passaram (`5/5`).
- Status: corrigido/provado no código atual; o executável autorizado `ed15172` continua antigo e não prova essa correção no Desktop.

## E-017 — Verificação de reteste perdeu a referência da evidência após E-013

- Contexto: continuação exploratória após a corrida de assistência, antes da coleta parcial de baseline.
- Evidência: no modo padrão o passo 15 reportou `the retest added evidence rows: 1`; na contraprova `SL_JOURNEY_RACE=off`, o passo 15 passou com `evidenceRowsAfterRetest=1` e `retestIsNotEvidence=true`.
- Impacto: a falha anterior foi cascata de E-013 e da referência não preenchida; não há defeito confirmado de evidência no caminho ordenado.
- Status: encerrado como cascata; manter a asserção como regressão.

## E-018 — Provas de fonte original e reabertura visual foram cascatas não concluídas

- Contexto: passos 18–19 da sessão exploratória.
- Evidência: o passo 19 não encontrou `#study-now-errors-list .study-now-source-open`; o passo 18 não encontrou KaTeX após reabertura. O primeiro depende do resultado de prática/revisão; o segundo depende dos controles visuais ausentes no artefato autorizado.
- Impacto: não há prova válida de PDF original após a jornada nem de WYSIWYG visual após restart neste build.
- Status: separado como cascata/limitação; não tratar como aprovação.

## Evidência relacionada

- Executor nativo: `scripts/desktop-study-journey.mjs`.
- Executável informado: `C:\Projetos\SmartLearn\src-tauri\target\release\smartlearn.exe`.
- Dados humanos: não usados; as tentativas criaram diretórios temporários e os removeram na limpeza.

## Sessões de benchmark registradas

- Sessão única exploratória inicial: 127,29 s; incluiu E-014 antes da correção do handler de rota e os auxiliares PowerShell ausentes.
- Repetição corrigida: 116,10 s de parede; código de saída 1 por falhas observadas, não por crash do executor. Passos 1–11 e 16 passaram; passos 12–15 e 17–20 falharam; 21–23 ficaram bloqueados por ausência de editor visual. A chamada CODEX real consumiu 72,64 s; a geração confirmou `provider=CODEX`, `model=codex:default` e três questões.
- Preflight rápido adicionado ao mesmo executor: 24,88 s de parede, código 0, quatro etapas aprovadas (abertura, identidade/login, Materiais e upload do PDF), sem invocar CODEX. Redução de 78,6% contra a jornada completa; serve apenas para diagnosticar infraestrutura antes de gastar a chamada real.
- Preflight Playwright-only após E-020: 13,05 s de parede, código 0, quatro etapas aprovadas, processo autorizado confirmado e `desktopControl=none; Playwright/CDP inside WebView2 only`; nenhuma chamada CODEX foi feita.
- Jornada completa Playwright-only após E-020: 135,86 s de parede, código 1 por asserções observadas, 12 etapas PASS, 8 FAIL e 3 BLOCKED; processo autorizado confirmado com `desktopControl=none`. A geração CODEX consumiu 87,70 s; E-013, E-016, E-017 e as limitações visuais reapareceram no mesmo artefato, sem erro de executor ou controle OS.
- Evidência bruta da repetição: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-single-session-rerun-20261106.log`.
- Evidência bruta do preflight: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-preflight-20261106.log`.
- Evidência bruta do preflight Playwright-only: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-preflight-playwright-only-20261106.log`.
- Evidência bruta da jornada completa Playwright-only: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-full-playwright-only-20261106.log`.
- Evidência bruta do caminho direcionado `SL_JOURNEY_RACE=off`: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-target-ordered-reveal-20261107.log`.
- Evidência bruta do caminho direcionado de persistência/PDF: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-target-persistence-pdf-20261107.log`.
- Regressão atual sem IA: `e2e/review-completion-rule.spec.js` passou 6/6; `e2e/hoje-overdue-groups.spec.js` passou 1/1 em repetição isolada (30,2 s); unitários de conclusão/agrupamento passaram 9/9 em 137 ms. A primeira bateria teve uma falha de login no `beforeEach`, classificada como flakiness de infraestrutura porque a repetição isolada passou.
- As duas sessões usaram uma única instância Tauri por jornada, CDP/WebView2 e dados temporários isolados; não houve FAKE, navegador web substituto, controle do mouse físico ou nova compilação.

## E-019 — Executável autorizado anterior às correções e à paridade visual atuais

- Contexto: o executável autorizado continua sendo `ed15172+local`, com `inputsHash=9a0421b94d16…`.
- Evidência independente: o código atual contém as correções `dece8a6` (aguardar `pendingReveal` antes do julgamento), `d8e2443` (agrupamento de vencidas em Hoje) e os módulos de seleção de região/editor visual; esses artefatos não estão no worktree autorizado usado pelo executável.
- Impacto: uma nova execução com o mesmo binário não pode provar o comportamento atual nem concluir recorte visual, WYSIWYG e os contratos corrigidos. Repetir sem mudar a identidade produziria apenas as mesmas falhas.
- Proteção aplicada: nenhum arquivo do executável foi sobrescrito e nenhuma nova compilação foi iniciada. A identidade e a origem permanecem registradas para uma futura autorização explícita de atualização do artefato.
- Nova prova: o preflight do executável local `C:\Projetos\SmartLearn\src-tauri\target\release\smartlearn.exe` encontrou frontend `6cbedac+local`, enquanto o código atual é `37b17e7`; `npm run build:exe` foi recusado pelo guardrail `SMARTLEARN_WRONG_WORKTREE` porque a árvore atual é `codex/restore-pdf-parity` e builds exigem `claude/smartlearn-v1-complete`.
- Status: bloqueio técnico de release; requer artefato compatível antes da prova final.

## E-020 — Controle nativo de janela estava misturado ao executor Playwright

- Contexto: o executor continha chamadas PowerShell para mover/redimensionar a janela e ler seu retângulo, embora a regra da jornada exigisse Playwright/CDP e mouse físico livre.
- Evidência: `placeWindowOnSmallDisplay()` chamava `move-window-to-small-display.ps1`; `windowRect()` chamava `window-rect.ps1`; os usos estavam na abertura, na persistência e no teste visual de figuras.
- Impacto: mesmo sem clicar com o mouse físico, esse caminho controlava o Desktop fora do WebView2 e não atendia ao contrato de executor exclusivamente programático.
- Correção: removidas as chamadas e funções do executor. O aplicativo ainda abre visível e a prova de persistência continua testando banco/exportação/reabertura; posição nativa de janela deixou de ser declarada como requisito da jornada Playwright.
- Verificação: `node --check scripts/desktop-study-journey.mjs`, busca sem referências aos auxiliares no executor e `git diff --check` passaram.
- Status: corrigido no executor; não é defeito do produto.

## E-021 — Reteste deixou tentativa STARTED órfã

- Contexto: suíte direcionada `e2e/study-retest-network.spec.js`, com três cenários de perda/repetição de rede e verificação direta, somente leitura, do banco SQLite isolado.
- Comando: `npx playwright test e2e/study-retest-network.spec.js --workers=1 --retries=0 --reporter=line --forbid-only`.
- Evidência atual: `3 passed (43.7s)`; em cada cenário, a consulta final encontrou `0` tentativas `STARTED`, três tentativas `SUBMITTED` (duas originais e uma de reteste), três eventos de aprendizagem com `sequence=1`, uma única evidência `INITIAL_PRACTICE` e o reteste separado da evidência original.
- Distinção: a tentativa anteriormente observada como `STARTED` pertencia à execução/artefato anterior; nesta prova não há tentativa aberta órfã. Uma tentativa inacabada só seria legítima se ainda estivesse em execução e vinculada ao fluxo ativo; nenhum caso desse tipo permaneceu ao final.
- Escopo da prova: a jornada Desktop compatível também confirmou no passo 15 que o reteste produziu `1/1 erros corrigidos`, sem nova evidência; a persistência final fechou com sete tentativas submetidas e zero tentativa aberta.
- Status: encerrado/provado no código atual e no artefato Desktop `37b17e7+local`.

## E-024 — Executor encerrou geração CODEX durante progresso legítimo

- Contexto: a primeira jornada com o artefato compatível parou no passo 5 após 30 s, enquanto o job assíncrono ainda estava em `CALLING_PROVIDER`.
- Evidência: o backend expõe fases observáveis; a jornada final registrou `CALLING_PROVIDER:GENERATING` → `CALLING_PROVIDER:AUDITING` → `SUCCEEDED:FINISHED`, com geração CODEX de `48.539 ms`.
- Causa: o executor esperava `.lesson-editor` com timeout fixo de 30 s e não aguardava o estado do job.
- Correção: `scripts/desktop-study-journey.mjs` passou a consultar `/v1/generation-jobs?proposalId=...`, registrar transições e aguardar estado terminal, usando 5 min somente como limite de segurança.
- Status: corrigido no executor; não é defeito confirmado do produto.

## E-022 — Revisão Hoje é concluída antes de todos os exercícios

- Contexto: caminho direcionado com agrupamento apenas observado (`SL_JOURNEY_REVIEW_GROUPING=observe`) e revelação ordenada no Hoje (`SL_JOURNEY_REVIEW_RACE=off`), para atravessar E-016 e testar conclusão/persistência.
- Evidência: a revisão abriu com 16 etapas vencidas; dois exercícios foram julgados (`CORRECT` e `INCORRECT`) e ambos chegaram a `SUBMITTED` com `maxAssistance=SOLUTION`. Ao clicar “Revisão feita” antes do terceiro exercício, a caixa ficou marcada; o teste falhou com `a partial review was incorrectly completed`.
- Impacto: o aluno pode concluir uma revisão incompleta; a etapa posterior de persistência e a evidência `REVIEW` ficam inválidas ou incompletas.
- Causa: o comportamento foi observado no executável autorizado antigo `ed15172`; o código atual já centraliza a regra em `src/review-completion.js` e rejeita qualquer `answered < total` como `PRACTICE_PENDING`.
- Correção/proteção: o E2E passou a cobrir explicitamente 0/3, 2/3 e 3/3, incluindo reload entre 1/3 e 2/3, ausência de conclusão/evidência parcial e uma única evidência `REVIEW` somente em 3/3.
- Evidência: `npx playwright test e2e/review-completion-rule.spec.js --workers=1 --retries=0 --reporter=line --forbid-only` passou com `6 passed`; o teste unitário de `reviewConclusion` passou `3/3`.
- Status: corrigido/provado no código atual; requer novo artefato Desktop compatível para confirmar a mesma correção no Tauri.

## E-023 — Timeout global confundia fixture lenta com travamento

- Contexto: a suíte de bloco/reteste falhou uma vez no limite padrão de 30 s durante o `beforeEach`, antes do corpo do teste começar; a repetição com limite de segurança passou em 38,0 s.
- Diagnóstico medido: API isolada 1,1–1,4 s; autenticação real 21,7–28,6 s; criação 0,7 s; julgamentos 1,2 s; recarga/persistência 2,0–5,3 s; reteste 0,8–0,9 s. As transições do reteste foram observadas em 43–132 ms.
- Correção: `e2e/support/progress-watchdog.js` adiciona `test.step()` temporizado e `waitForProgress()` baseado em snapshots de estado. O watchdog aceita progresso lento, falha após silêncio observável, registra o último estado/amostras e captura screenshot quando usado pela jornada.
- Validação: `test/progress-watchdog.test.js` passou 3/3 (165 ms); `e2e/hoje-block-retest.spec.js` passou 2/2 (48,1 s); a suíte combinada de prática/reteste/robustez passou 10/10 em 1,9 min.
- Proteção: 60 s permanece apenas como circuito de segurança do teste, não como condição de aprovação. Uma tentativa de reutilizar `storageState` entre testes foi revertida porque contaminou o segundo caso com uma revisão `R2` duplicada; o login isolado foi preservado.
- Status: infraestrutura de espera corrigida; custo de autenticação continua sendo benchmark separado, não defeito confirmado do produto.
