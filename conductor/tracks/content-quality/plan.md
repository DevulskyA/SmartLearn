# TRACK: CONTENT-QUALITY — Conteúdo médico confiável e didático

> Ledger MACRO de marcos (GOV-2 opção A: execução de tarefa = skill `tlc-spec-driven-strict`). Chat/UI = projeções deste arquivo.
> Hierarquia: Constitution = intenção · GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Worktree isolado: `.claude/worktrees/content-quality`, branch `claude/content-quality` (base 933cb7e). Outro agente escreve em
> `smartlearn-v1-complete` (T45, plano antigo = histórico/paralelo, NÃO prioridade). Reconciliar as branches só com estado estável.

```
Track:    content-quality                      Status: IN_PROGRESS
MARCO ATUAL: desenvolvimento contínuo em sprints produtivas (CQ-7 -> EXAM-1..3 -> NEXT)
Iniciado: 2026-09-19
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: AUTHOR-1 (GUI). Uma ativa POR AGENTE é válido (CLI publica a dele em CLI.md).
```

## Tarefas

- [✓] **CQ-1 Caracterizar o pipeline real e provar lacunas** — pipeline lido do código e lacunas PROVADAS executando rascunhos fabricados contra `validateDraft` (evidência abaixo).
- [✓] **CQ-2 Garantir qualidade/proveniência do Resumo Mestre** — commit 0f2aad8. Pipeline: 1 geração -> triagem DETERMINÍSTICA (valor sem suporte, termo ausente da fonte, conceito central omitido, resumo raso) -> só com provider real: 1 auditoria independente por modelo + no máximo 1 reparo dirigido -> revalida (`draft-schema`) -> triagem de novo; achados (`issue/severity/scope/generatedClaim/sourceEvidence/repair`) gravados no rascunho; permanece DRAFT; falha do modelo degrada p/ triagem, nunca derruba o rascunho; SEM IA em runtime. Proveniência do resumo: `summarySourceSpans` (quarentena de página inválida; sem spans = faixa inteira da proposta) congelada no aceite em `unit_summary_citations` (mig 022) + `GET /v1/learning-units/:id/summary-sources`; a revisão mostra a fonte ao lado do resumo/questões e os achados; Plano e Study Now mostram "Origem do resumo". Prova: `server/test/draft-audit.test.js` (8), `draft-audit-model.test.js` (10: 3 chamadas no máximo, contradição semântica só por modelo, reparo inválido rejeitado, modelo fora do ar), `accept-draft.test.js` (+2: fonte congelada, owner-scoped, manual = vazio), e2e `draft-acceptance` (3: fonte visível/verificável, achado de omissão exibido, aceite segue humano). server 413/413, unit 370/370. LIMITES HONESTOS: a triagem determinística é de alto recall/baixa precisão (aviso, não veredito); contradição/mecanismo errado só um modelo ou humano vê; qualidade de um modelo REAL não foi exercida (sem chave aqui) = NOT_PROVEN.
- [✓] **CQ-3 Garantir qualidade das questões, respostas e feedback** — a resposta agora é o gabarito CONCISO e o `explanation` (novo, opcional; mig 023 `exercise_versions.explanation`, imutável por versão, carregado adiante numa edição) ensina o porquê usando só a(s) página(s) citada(s); `questionType` opcional (RECALL/CONCEPT/MECHANISM/APPLICATION/DISCRIMINATION/CLINICAL_REASONING/TRANSFER, rótulo ignorado se fora do menu). Prompt v3: uma resposta defensável, sem entregar a resposta, sem cópia longa, sem fato fora da página citada, alvos REVALIDA/provas da faculdade/exames no Paraguai como ORIENTAÇÃO editorial (nunca pesos oficiais inventados). Triagem determinística por questão (escopo `question:N`): resposta rasa (HIGH), sem explicação, resposta/dica que entrega a resposta (HIGH), valor fora da página CITADA (HIGH), termo ausente da página citada, pouco apoio lexical, duplicada, cópia literal (LOW/aviso); auditoria por modelo cobre ambiguidade, detalhe irrelevante, contradição, exigência cognitiva (só com provider real; 1 auditoria + no máx. 1 reparo). Feedback: "Por quê" no Study Now (após revelar), no cartão de erros e na revelação da Hoje; revisão do rascunho mostra tipo, explicação e achados por questão. Estudo vs prova: MODO PROVA NÃO EXISTE no produto (nada a violar; N/A); estudo = revelar resposta e feedback imediato, intacto. Alternativas/distratores: N/A (questões abertas, autojulgadas). Reteste/evidência intactos (nenhuma linha de evidência nova; testes de Analytics/attempts verdes). Prova: `draft-audit-questions.test.js` (8), `draft-audit-model.test.js` (10, prompts fixados), `exercise-explanation.test.js` (3), e2e `exercise-explanation` (1) + `draft-acceptance` (3) + `plan-study-now`/`study-now-flow`. server 424/424, unit 370/370. NOT_PROVEN: nota de qualidade de um modelo real; ambiguidade/mais de uma resposta defensável só é julgada por modelo/humano.
- [✓] **CQ-4 Validar o fluxo completo sobre material médico** — UMA unidade (fisiologia renal, PDF de 2 páginas com texto médico real, extração real) pelo produto inteiro no caminho do provider REAL (servidor real + UI real), com o endpoint do modelo trocado por um stub local via `SMARTLEARN_AI_API_URL` (nova config, padrão = API real): `e2e/content-quality-flow.spec.js`. O stub devolve rascunho com valor inventado (25 mmHg vs 10 na fonte) + resposta que CONTRADIZ a fonte (angiotensina II "dilata" a eferente), achado semântico do auditor e reparo dirigido. Provado ponta a ponta: chamadas do modelo = exatamente [GERAR, AUDITAR, REPARAR] (sem loop; estudar/refazer não chama modelo); o revisor vê o rascunho REPARADO (10 mmHg, "Contrai"), marcado como corrigido, re-triado limpo (PASS), tipo/explicação por questão, fonte do resumo (páginas 1–2) e de cada questão com o texto da página a um clique, e o aviso "não verificado"; 375px sem scroll horizontal no painel de revisão e no resultado; só depois do aceite humano existe unidade; Plano mostra "Origem do resumo · fisiologia-renal.pdf, páginas 1–2"; Study Now: cada resposta com "Por quê" só após revelar; item errado -> cartão com resposta, POR QUÊ e "Trecho do material · página 2"; refazer -> "1/1 erros corrigidos" e exatamente UMA linha de evidência (INITIAL_PRACTICE 2/3), i.e. o reteste não infla. Inspeção visual real (capturas 1280/375 via `SCREENSHOT_DIR`): achou ruído de triagem (gerúndio "sustentando" sinalizado como termo ausente) -> corrigido (gerúndios/-mente não contam) com teste. Correção de honestidade: a rota gravava `promptVersion` "1" nos rascunhos, mesmo com o prompt v3 -> agora usa a versão corrente. LIMITES: o modelo é um STUB roteirizado (prova o PIPELINE, não a qualidade de um modelo real = NOT_PROVEN); "melhor que colar o PDF numa IA genérica" aparece em continuidade/fonte/revisão/erros/evidência, não em fluência do texto.
- [✓] **CQ-5 Fechar o marco com regressão e uso real representativo** — GATE no snapshot integrado ce31b64 (content-quality + claude/smartlearn-v1-complete@6f32f4f, merge sem conflitos): unit 378/378, server 466/466, e2e COMPLETO com progresso [n/120]: 119 passaram + 1 falha CLASSIFICADA como AMBIENTE, não produto: `production-build.spec.js` roda `npm run build` e o `prebuild` (`scripts/require-work-branch.mjs`) recusa qualquer branch que não seja `claude/smartlearn-v1-complete` ("SMARTLEARN_WRONG_WORKTREE"); com `CI=1` (que só pula esse guard) o mesmo spec passa 1/1 no mesmo código. Guard NÃO alterado. Uso real: fluxo vertical exercitado na UI real com capturas 1280/375 (CQ-4). ACEITE: SOURCE_GROUNDED_SUMMARY=YES na medida do que se prova (triagem + auditoria + reparo dirigido; nada sem fonte passa despercebido pela triagem determinística de valores; termo/omissão = aviso), SUMMARY_TRACEABLE=YES (fonte no rascunho e congelada na unidade), SUMMARY_HUMAN_ACCEPTANCE=YES (só aceite humano cria unidade), QUESTION_SOURCE_GROUNDED=YES (citação validada + triagem na página CITADA), ANSWER_VERIFIED=PARCIAL (valores/termos/apoio na página; contradição só por modelo/humano, provada com stub), EXPLANATION_TEACHES=YES (campo `explanation` + "Por quê" na UI; conteúdo de um modelo real NOT_PROVEN), STUDY_EXAM_SEMANTICS_PRESERVED=N/A (modo prova não existe; estudo intacto), NO_NEW_RUNTIME_AI_DEPENDENCY=YES (modelo só em `createDraft`; nenhum caminho de estudo/revisão/cliente chama modelo), REAL_FLOW_VALIDATED=YES (pipeline real com modelo simulado), MOBILE_VALIDATED=YES. NOT_PROVEN: qualidade de um modelo REAL (sem chave); ambiguidade/2 respostas defensáveis fora de modelo/humano. Follow-up sugerido (não feito, decisão de produto/ambiente): rodar o pipeline uma vez com chave real e revisar a saída a olho.
- [✓] **CQ-6 Revisor corrige o ponto sinalizado do rascunho antes de aceitar** — SPRINT_GOAL: quem vê "1 ponto para verificar" na revisão do rascunho corrige o texto ali mesmo (resumo, resposta, explicação), vê a conferência refeita e só então aceita — o que foi aceito é exatamente o que ele revisou.
      BEFORE: a revisão só oferece "Aceitar e criar aula" ou descartar/regerar: um achado real (valor inventado, resposta que entrega o gabarito) obriga a aceitar o erro ou perder o rascunho inteiro; a API `PATCH /v1/drafts/:id` (reviseDraft, com re-triagem) existe mas NENHUMA tela a usa.
      AFTER: Editar em cada campo do rascunho -> Salvar -> painel re-renderiza com a nova triagem (achado some ou persiste) e a revisão nova; Aceitar usa a revisão atual (`expectedRevision`); a unidade criada tem o texto corrigido.
      PROOF: e2e com rascunho realmente sinalizado (provider fake + página que omite o conceito central): editar o resumo -> triagem passa de REPAIR para PASS -> aceitar -> `summaryBody` da unidade = texto editado; conflito de revisão continua fail-closed.
      DONE_WHEN: o e2e acima verde, unit/server sem regressão, 375px sem overflow, sem mudança em Analytics/estudo. Fechamento exige PRODUCT_DELTA/PROOF_OBSERVED/USER_VALUE/NOT_PROVEN (regra "Sprint produtiva").
      PRODUCT_DELTA: o revisor corrige resumo, enunciado, resposta, explicação e dica DENTRO da revisão ("Corrigir o rascunho" -> "Salvar correções"); o servidor revalida e refaz a triagem, a revisão sobe (+1), o formulário de aceite (disciplina/data) sobrevive ao re-render e "Aceitar" cria a unidade com exatamente o texto salvo; depois do aceite o servidor recusa edição (409).
      PROOF_OBSERVED: e2e `draft-acceptance` (2 novos, 5/5 no arquivo): rascunho REALMENTE sinalizado (data-result=REPAIR, omissão do conceito central) -> editar o resumo -> data-result=PASS, revisão +1, campos do aceite preservados -> aceitar -> `summaryBody` da unidade === texto editado; correção inválida (resposta vazia) é reportada no lugar e a revisão não muda; 375px sem overflow e alvo >=44px; source-proposals + content-quality-flow verdes; unit 378/378, server 466/466.
      USER_VALUE: um achado real deixa de forçar "aceitar o erro" ou "jogar o rascunho fora": o aluno conserta em segundos e o que estuda é o que ele revisou.
      NOT_PROVEN: usabilidade do editor com rascunhos longos reais (50 questões); tipo e páginas-fonte não são editáveis (por desenho); sem full e2e nesta fatia (foco em Materiais).
      PERGUNTA: "O que o SmartLearn faz melhor agora?" — deixa o aluno CORRIGIR um ponto sinalizado do conteúdo gerado antes de virar estudo (antes só podia aceitar o erro ou descartar). SPRINT_PRODUCTIVE=TRUE.
- [✓] **CQ-7 Provar (e corrigir só se preciso) a revisão de um rascunho grande** — OWNER: GUI
      SPRINT_GOAL: um aluno consegue revisar, corrigir e aceitar um rascunho médico realisticamente grande (~50 questões) sem perder contexto, alterações ou a capacidade de localizar os pontos sinalizados.
      BEFORE: CQ-6 foi provado com 1-3 questões; o uso com ~50 questões era NOT_PROVEN (lista longa, editor com 50 blocos, rolagem, save enviando tudo).
      AFTER: comprovado (e ajustado só se houver problema real) que abrir, achar o item sinalizado, editar, salvar, ver a triagem refeita e aceitar funciona com ~50 questões, também a 375px, sem perda silenciosa.
      WHY: conteúdo médico real vem em lotes grandes; se a revisão não escala o aluno aceita sem revisar ou desiste.
      SCOPE: painel de revisão de rascunho em Materiais (src/app.js renderDraftPanel/createDraftEditor); nenhuma mudança de servidor esperada.
      DETAILS: medir primeiro (tempo de render, tamanho do PATCH, foco/rolagem, achar o item sinalizado) com um rascunho de 50 questões contendo itens sinalizados; corrigir o MENOR problema real que impeça o uso; se já funciona, fechar só com a prova.
      PROOF: e2e com stub de modelo devolvendo 50 questões (algumas com valor inventado/resposta entregue): abrir, localizar o sinalizado, editar uma questão do meio, salvar, triagem refeita, aceitar, unidade com 50 exercícios e o texto editado; 375px sem overflow; medições registradas.
      DONE_WHEN: fluxo grande utilizável e comprovado (ou ajustado e comprovado); sem regressão.
      DEPENDENCIES: CQ-6 (feito).
      EVIDENCE: `e2e/large-draft-review.spec.js` — rascunho de 50 questões (5 páginas, stub do modelo no caminho do provider real; conteúdo sintético Zeta/Omega, mede a EXPERIÊNCIA, não a qualidade médica). Medido: gerar -> rascunho revisável (50 questões, triagem incluída) em ~300 ms; PATCH com as 50 questões e re-render sem perda. Achado real por inspeção + teste vermelho: com 50 blocos o revisor não tinha como ACHAR o item sinalizado (o achado dizia "Questão 30" sem levar até ela) -> corrigido com o menor ajuste: cada achado tem "Corrigir a questão N" / "Corrigir o resumo" (abre o editor, rola e foca o campo), e a questão sinalizada aparece marcada ("Sinalizada") na leitura.
      PRODUCT_DELTA: num rascunho de 50 questões o revisor chega ao item sinalizado em 1 clique, corrige 3 pontos (resumo, resposta rasa, valor inventado), a triagem é refeita a cada salvar, uma edição em questão NÃO sinalizada (Q10) sobrevive a dois salvamentos, e "Aceitar" cria 50 exercícios com exatamente o texto revisado (Q30/Q41 corrigidas, Q1/Q10/Q50 conferidas); 375px sem overflow.
      PROOF_OBSERVED: e2e acima verde (1/1) + draft-acceptance, content-quality-flow, source-proposals verdes (8/8 no conjunto).
      USER_VALUE: revisar um lote grande deixa de exigir caça manual ao problema; o aluno não aceita sem revisar nem perde edições.
      NOT_PROVEN: rascunho com conteúdo médico real de um modelo real; mais de 50 questões (limite do servidor = 50); leitor de tela na navegação por "Corrigir a questão N".
      COMMIT: ver `git log` (feat(content-quality): jump to a flagged item in a large draft).
- [✓] **EXAM-1 Modo Prova sem feedback antecipado** — OWNER: GUI
      SPRINT_GOAL: o aluno consegue fazer uma prova completa sem receber resposta, explicação, dica ou nota antes de submeter.
      BEFORE: o SmartLearn só tem estudo por questão (Estudar agora / revisões) com feedback imediato; não existe prova.
      AFTER: o aluno inicia uma prova de uma unidade, responde as questões, navega entre elas sem perder respostas e submete; nada de gabarito/explicação/dica/nota aparece antes da submissão.
      WHY: medir desempenho ANTES da intervenção pedagógica é a base da evidência honesta e do treino de prova (REVALIDA, provas da faculdade).
      SCOPE: nova tela/fluxo "Prova" reutilizando exercícios existentes; sem analytics novo; sem mastery.
      DETAILS: a menor extensão do fluxo atual que agrupa as questões de uma unidade, guarda a resposta digitada de cada uma durante a navegação e só na submissão fecha a tentativa; as questões são abertas (autojulgadas), então a prova registra a resposta do aluno e a autoavaliação só depois de revelar o gabarito (decisão local: ver EXAM-2).
      PROOF: e2e discriminante: iniciar prova; várias questões visíveis; digitar respostas; ir e voltar sem perder; gabarito/explicação/dica/nota AUSENTES do DOM antes de submeter (e a API não devolve o gabarito na fase de prova); submeter encerra a tentativa.
      DONE_WHEN: uma prova completa é respondida e submetida sem vazamento pedagógico antes da submissão.
      DEPENDENCIES: CQ-7.
      EVIDENCE: migration 024 (`exams`, `exam_items`; versão do exercício capturada, resposta do aluno por item); `server/src/services/exams.js` + rotas `POST /v1/exams` (retoma prova em andamento), `GET /v1/exams/:id`, `PUT .../items/:itemId/answer`, `POST .../submit`; UI: botão "Fazer prova" no Plano -> tela Prova (uma questão por vez, navegação anterior/próxima/numerada, resposta digitada guardada ao sair do campo, submissão em 2 passos que avisa "N questões sem resposta"). Testes: `server/test/exams.test.js` (6: chaves proibidas ausentes do DTO, retomada, submit trava e só então libera o gabarito, versão capturada não muda com edição/arquivamento, dono, HTTP com o corpo da resposta sem nenhum segredo) e `e2e/exam-mode.spec.js` (2: prova completa + mobile 375). server 472/472, unit 381/381, e2e focado + regressão do Estudar agora 17/17.
      PRODUCT_DELTA: o SmartLearn agora TEM Modo Prova: o aluno faz uma prova de uma aula sem receber nenhuma correção antes de submeter — provado no FIO (nenhuma das respostas de /v1/exams antes do submit contém gabarito/explicação/dica) e no DOM (sem gabarito, dica, "por quê", nota); respostas sobrevivem à navegação e ao reload (a prova é retomada); depois do submit as respostas ficam travadas (409) e os dados de correção passam a existir no servidor.
      PROOF_OBSERVED: e2e `exam-mode` 2/2; `exams.test.js` 6/6 (incl. HTTP); regressão de estudo/plano verde.
      USER_VALUE: medir antes de ensinar — a base para treino de prova (REVALIDA, provas da faculdade) e para evidência honesta.
      NOT_PROVEN: quem abrir o Plano/Estudar agora ainda vê os gabaritos por lá (a prova garante o FLUXO de prova, não impede o aluno de espiar por outro caminho — é app de estudo, não proctoring); a correção (EXAM-2) e a evidência (EXAM-3) ainda não existem: após submeter a tela só confirma o envio.
- [✓] **EXAM-2 Resultado que ensina depois de medir** — OWNER: GUI
      SPRINT_GOAL: depois de submeter, o aluno entende o resultado e aprende com os erros.
      BEFORE: EXAM-1 mede mas não entrega análise.
      AFTER: após submissão: acertos/total, percentual derivado, e por questão: enunciado, resposta do aluno, resposta correta, explicação ("Por quê"), fonte, acerto x erro separados.
      WHY: a prova mede primeiro e ensina depois; o erro precisa virar aprendizagem.
      SCOPE: tela de resultado da prova; reutiliza cartão de erro do Estudar agora.
      DETAILS: dados só liberados pelo servidor após a submissão; autojulgamento (acertei/errei) por questão feito na correção, com o gabarito à vista.
      PROOF: e2e garante que tudo isso aparece SOMENTE depois da submissão e que antes a API recusa.
      DONE_WHEN: "prova mede primeiro e ensina depois" observável.
      DEPENDENCIES: EXAM-1.
      EVIDENCE: `judge()` (PUT /v1/exams/:id/items/:itemId/judgment; só depois de submeter; mudável até finalizar) + `start()` agora RETOMA também prova SUBMETIDA ainda sem correção completa. UI: tela "Correção da prova" com, por questão, enunciado, "Sua resposta" (ou "Sem resposta"), "Resposta correta", "Por quê" (só onde existe), trecho da fonte (quando há citação), botões Acertei/Errei (aria-pressed, foco preservado), chip "Acerto/Erro/A julgar" + borda por resultado (nunca só cor), contagem "Acertos: X · Erros: Y" e resultado "X/N corretas — P%" SÓ quando todas foram julgadas. Testes: `exams-judgment.test.js` (2: julgar só após submeter, sem nota parcial, nota derivada, mudar de ideia, dono/foreign item) + `exams.test.js` (retomada da submetida) + e2e `exam-mode` (3: prova completa sem vazamento; EXAM-2 correção; mobile 375). server 474/474 esperado, e2e exam-mode 3/3.
      PRODUCT_DELTA: "a prova mede primeiro e ensina depois" é observável: só depois de submeter o aluno vê a própria resposta ao lado do gabarito, o porquê e a fonte, corrige item a item e recebe "2/3 corretas — 66,7%" com acertos e erros distintos; sair e voltar retoma a mesma correção; a nota nunca aparece parcial.
      PROOF_OBSERVED: e2e EXAM-2 (chips 'A julgar' x3 -> 'Acerto'/'Erro', score oculto até o último, 1/3 -> 2/3 ao mudar de ideia, reload retoma com o mesmo resultado, sem overflow horizontal).
      USER_VALUE: o erro na prova vira aprendizagem (resposta certa + porquê + trecho) logo depois da medição, sem antecipar nada durante a prova.
      NOT_PROVEN: renderização do trecho da fonte na correção não foi exercitada no e2e da prova (mesmo dado/DTO do Estudar agora, coberto lá); enquanto a correção não é finalizada (EXAM-3) não se pode iniciar outra prova da mesma aula (a submetida é retomada).
- [✓] **EXAM-3 Resultado vira continuidade** — OWNER: GUI
      SPRINT_GOAL: terminar uma prova não é um beco sem saída: o resultado entra no ciclo longitudinal e leva a uma próxima ação útil.
      BEFORE: o valor da prova acabaria na tela de resultado.
      AFTER: a prova submetida gera exatamente a evidência esperada (uma linha agregada, sem duplicar) e oferece seguir para os erros / unidade / reforço existentes.
      WHY: PROVA -> RESULTADO -> EVIDÊNCIA -> FRAQUEZA -> PRÓXIMA AÇÃO.
      SCOPE: evidência (learning_evidence) e navegação; preserva review_tasks != learning_evidence; sem mastery/ML/scheduler novo.
      DETAILS: reutiliza o mecanismo de evidência da prática inicial; um reteste imediato continua sem gerar evidência.
      PROOF: e2e + servidor: submeter uma prova gera exatamente 1 evidência com contagens corretas; submeter de novo não duplica; refazer erro depois não infla.
      DONE_WHEN: a prova faz parte do ciclo e é comprovado sem duplicação/contaminação.
      DEPENDENCIES: EXAM-2.
      EVIDENCE: `finalize()` (POST /v1/exams/:id/finalize; só com TODAS as questões julgadas; idempotente; 1 transação): cada item vira uma tentativa SELF_REPORT sem review_task e UMA linha `INITIAL_PRACTICE` agregada as liga (mesma forma do Estudar agora) -> Plano/"para reforçar", Estatísticas e tendências já enxergam a prova sem mecanismo novo; prova vira CORRECTED (respostas e julgamentos finais) e uma NOVA prova pode começar. UI: "Concluir e registrar o resultado" (aparece só com tudo julgado) -> nota "Resultado registrado no seu histórico (2/3)…", "Refazer erros (N)" (fluxo de reteste existente), "Voltar para o Plano", "Ir para Hoje". Testes: `exams-finalize.test.js` (5: 1 evidência com contagens certas + 1 tentativa ligada por item com os outcomes, idempotência, incompleta/não submetida recusada sem resíduo, sinal "para reforçar" + redo sem evidência nova + sem review_task, CORRECTED final e nova prova) e e2e `exam-mode` EXAM-3 (evidência 0 antes de concluir, 2/3 -> 1 linha INITIAL_PRACTICE 3/2, /v1/reinforcement = 1 item, refazer erro -> "1/1 erros corrigidos", evidência CONTINUA 1, reforço 0, nova prova). server 479/479, unit 381/381, e2e focado 4/4 + regressão estudo/plano/estatísticas 13/13.
      PRODUCT_DELTA: a prova faz parte do ciclo: PROVA -> RESULTADO -> EVIDÊNCIA (1 linha, sem duplicar) -> FRAQUEZA (erro vira "para reforçar" nos mesmos lugares de sempre) -> PRÓXIMA AÇÃO (refazer erros já, ou Plano/Hoje), sem mastery, ML, scheduler novo ou review_tasks; um reteste depois NÃO infla a evidência.
      PROOF_OBSERVED: e2e + servidor acima; contagens de evidência conferidas antes/depois de concluir e depois do reteste.
      USER_VALUE: o esforço da prova não morre na tela: aparece no histórico do aluno e aponta o que reforçar.
      NOT_PROVEN: a evidência da prova usa o tipo existente INITIAL_PRACTICE (o esquema só admite REVIEW/INITIAL_PRACTICE/EXTERNAL), então o rótulo "Prática inicial" no histórico do Plano não distingue prova de estudo, e o botão "Estudar agora" some depois da 1ª evidência dessa aula; tentativas apontam a versão ATUAL do exercício (se editado entre iniciar e concluir a correção, a versão vinculada é a nova); nenhuma agenda de revisão nasce da prova (por desenho).
- [✓] **NEXT Selecionar automaticamente a próxima sprint produtiva** — OWNER: GUI
      SPRINT_GOAL: decidir e abrir sozinho a próxima melhoria de maior valor (ganho x confiança / custo).
      DETAILS: consultar estado canônico, NOT_PROVEN, experiência atual, CLI.md/GUI.md; não escolher trabalho cosmético/arquitetural havendo ganho de produto maior.
      EVIDENCE: seleção 2026-09-19 (ganho x confiança / custo), candidatos avaliados: (A) "Por quê" nas questões ESCRITAS pelo aluno — o campo existe no servidor desde a mig 023 e alimenta Estudar agora, erro e correção da prova, mas só questões geradas por IA o têm: ganho médio-alto, confiança alta, custo baixo (form + edição) => ESCOLHIDA; (B) rótulo "Prova" no histórico do Plano — ganho baixo/médio, custo baixo => depois; (C) prova por disciplina (multi-unidade, amostrando o que reforçar) — ganho alto, custo/risco altos (migração, evidência por unidade) => próxima grande; (D) veredito de Estatísticas ponderado por volume — semântica de produto em aberto, superfície protegida => não agora; (E) rodar o pipeline com chave real — bloqueado (sem chave).
      PRODUCT_DELTA: sprints seguintes definidas: AUTHOR-1 (ativa) e EXAM-4 (candidata).
- [>] **AUTHOR-1 O aluno escreve o "Por quê" das próprias questões** — OWNER: GUI
      SPRINT_GOAL: uma questão criada pelo próprio aluno ensina como as geradas por IA: ele escreve (e edita) o porquê da resposta e o vê no Estudar agora, no cartão de erro, na revisão da Hoje e na correção da prova.
      BEFORE: só questões geradas por IA têm "Por quê"; o formulário de exercício manual tem enunciado, resposta e dica, sem explicação; editar uma questão não permite mexer no porquê.
      AFTER: o formulário de criar e o de editar exercício têm o campo "Por quê (opcional)"; o texto salvo aparece onde a resposta aparece; vazio = nada aparece (nunca inventado).
      WHY: quem estuda com as próprias questões (o caso comum) perde o feedback que ensina exatamente no momento do erro.
      SCOPE: formulário de exercícios em Registro/Plano (src/app.js), remote-store (create/update), já suportado pelo servidor.
      PROOF: e2e: criar exercício com porquê pela UI -> aparece após revelar no Estudar agora e na correção da prova; editar o porquê -> nova versão mostra o texto novo; sem porquê -> nenhum bloco "Por quê"; unit do mapeamento.
      DONE_WHEN: o fluxo acima verde, sem regressão nos e2e de exercícios.
      DEPENDENCIES: EXAM-3 (feito).
- [ ] **EXAM-4 Prova por disciplina (candidata)** — OWNER: GUI
      SPRINT_GOAL: o aluno faz uma prova que cobre várias aulas de uma disciplina, com prioridade ao que precisa reforçar, e o resultado vira evidência por aula.
      DETAILS: exige decisão de amostragem e migração (exam sem unit único); só ativar depois de AUTHOR-1 e de reavaliar valor x custo.

## Evidência CQ-1

```
SOURCE_STORAGE      sources + source_pages(page_index,text) via extração PDF com fronteira de erro por página (mig 012/013/020 qualidade de página)
PAGE_PROVENANCE     source_pages.page_index; congelada em exercise_source_citations.page_text_snapshot no aceite
UNIT_PROVENANCE     content_proposals(page_start..page_end, title) -> generated_drafts.accepted_unit_id; a unidade NÃO exibe sua origem
SUMMARY_GENERATION  provider: FAKE (recorta 150 chars) | ANTHROPIC (prompt v2, fidelidade/mecanismo/terminologia); summary <=2000 chars
SUMMARY_STATE       generated_drafts.draft_json.summary, status DRAFT, revision; vira learning_units.summary_body só no aceite
SUMMARY_ACCEPTANCE  acceptDraft explícito + expectedRevision (REVISION_CONFLICT); reviseDraft revalida; nunca aceita sozinho
QUESTION_GENERATION mesma chamada; campos question/answer/hint/sourceSpans[{pageIndex}]; SEM tipo, SEM explicação separada, SEM alvo
ANSWER/EXPLANATION  um único campo `answer` (prompt pede 1-3 frases de porquê); nada valida que ensina
QUESTION_SOURCE_LINK exercise_source_citations (fonte+página+trecho congelado), provenance AI_GENERATED
FEEDBACK_SOURCE_LINK Study Now mostra o trecho congelado só nos itens ERRADOS
AI_PROVIDER_PATH    selectProvider: chave+modelo+consentimento+orçamento, senão FAKE; validateDraft idêntico para ambos
RUNTIME_AI_REQUIRED NÃO (IA só na produção do rascunho)
CURRENT_VALIDATION  forma/limites + quarentena de citação a página inexistente (pergunta sem citação é descartada)
CURRENT_MEDICAL_AUDIT NENHUMA
UI_REVISAO          Materiais mostra aviso + resumo + P/R; NÃO mostra fonte/página de nada -> o revisor não consegue verificar
MODO_PROVA          não existe no produto (nada a violar; N/A)
AMBIENTE            sem chave de IA aqui: qualidade de modelo real = NOT_PROVEN; auditoria testável só com provider/fetch controlado
```

Lacunas PROVADAS (9 rascunhos fabricados x `validateDraft`, fonte = 2 páginas de fisiologia renal):
```
  1 fato inventado no resumo (TFG 300 mL/min, furosemida)      ACEITO   <- lacuna
  2 citação a página inexistente                               REJEITADO (ok)
  3 resumo vazio                                               REJEITADO (ok)
  4 resumo omite o conceito central (só detalhe de Bowman)     ACEITO   <- lacuna
  5 termo trocado (oncótica -> osmótica)                       ACEITO   <- lacuna
  6 explicação com fato não sustentado (180 mL/min "sempre")   ACEITO   <- lacuna
 6b resposta rasa ("125")                                      ACEITO   <- lacuna
 6c resposta vazada no enunciado                               ACEITO   <- lacuna
 6d resposta contradiz a página citada (eferente "dilata")     ACEITO   <- lacuna
```
DECISÃO de arquitetura (menor mudança): etapa de AUDITORIA dentro de `createDraft` (depois de `validateDraft`, antes de gravar):
(a) auditor DETERMINÍSTICO sempre (números/valores sem suporte na fonte, resposta rasa, resposta vazada, cópia literal, sem cobertura de termos-chave,
resposta sem apoio lexical na página citada); (b) auditor + reparo por MODELO somente quando o provider real está ativo (mesmo consentimento/orçamento),
1 auditoria + 1 reparo dirigido; achados gravados no rascunho (`audit`) e exibidos na revisão; permanece DRAFT. Sem IA em runtime.

## Sprint produtiva — registro retroativo do marco CQ-1..CQ-5 (regra de 2026-09-19)

```
SPRINT_GOAL   O aluno revisa um rascunho de IA vendo de onde veio cada afirmação e o que a conferência achou, e estuda com feedback que explica o porquê.
BEFORE        8 de 9 rascunhos ruins fabricados eram aceitos sem aviso; a revisão não mostrava fonte alguma; a resposta era um campo único sem explicação.
AFTER         triagem + (provider real) auditoria e 1 reparo; fonte ao lado de resumo/questões; origem do resumo guardada na unidade; "Por quê" no feedback.
PRODUCT_DELTA o revisor enxerga achados e páginas-fonte antes de aceitar; a unidade mostra a origem do resumo; o erro do aluno vem com resposta + porquê + trecho da fonte.
PROOF_OBSERVED e2e vertical (servidor/UI/PDF reais, modelo = stub), capturas 1280/375; os 9 rascunhos fabricados que passavam agora são sinalizados (valor/termo/omissão/resposta rasa/vazada/sem apoio); reteste segue sem gerar evidência.
USER_VALUE    menos risco de estudar um erro de conteúdo sem perceber; verificar a fonte leva 1 clique.
NOT_PROVEN    qualidade de um modelo REAL; contradição/ambiguidade só por modelo ou humano; o revisor ainda NÃO consegue corrigir um ponto sinalizado na tela (-> CQ-6).
PERGUNTA      "O que o SmartLearn faz melhor agora?" — mostra e checa o que a IA produziu antes de virar estudo, e explica o porquê no erro. Resposta concreta e comprovada: SPRINT_PRODUCTIVE=TRUE (com a lacuna acima registrada).
```

## Adiados / paralelos

- T45 "prioridades explicáveis" (plano antigo): trabalho de outro agente em `smartlearn-v1-complete` (`server/test/priorities.test.js`, não commitado). Preservado, classificado como histórico/paralelo.
- Pendência de produto (Analytics): veredito agregado conta disciplinas com peso igual.
