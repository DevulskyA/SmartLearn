# TRACK: CONTENT-QUALITY — Conteúdo médico confiável e didático

> Ledger MACRO de marcos (GOV-2 opção A: execução de tarefa = skill `tlc-spec-driven-strict`). Chat/UI = projeções deste arquivo.
> Hierarquia: Constitution = intenção · GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Worktree isolado: `.claude/worktrees/content-quality`, branch `claude/content-quality` (base 933cb7e). Outro agente escreve em
> `smartlearn-v1-complete` (T45, plano antigo = histórico/paralelo, NÃO prioridade). Reconciliar as branches só com estado estável.

```
Track:    content-quality                      Status: IN_PROGRESS
MARCO ATUAL: desenvolvimento contínuo por sprints produtivas (CQ-1..7, GUI-01..05 = EXAM-1..3, AUTHOR-1, EXAM-4/5, UX-1, ATTEMPT-1, INTEGRATE-1, TESTLIVE-1, FLAKE-1, INTEGRATE-5, NEXT-2, RETEST-1, ACCESS-2, INTEGRATE-6, NEXT-3 concluídos; SCANNED-1 ativa)
Iniciado: 2026-09-19
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: SCANNED-1 (GUI). Uma ativa POR AGENTE é válido (CLI publica a dele em CLI.md).
BACKLOG AUTORIZADO (2026-09-19): GUI-01=CQ-7 ✓ · GUI-02=EXAM-1 ✓ · GUI-03=EXAM-2 ✓ · GUI-04=EXAM-3 ✓ · GUI-05=JORNADA ✓. Depois: seleção automática (AUTHOR-1, EXAM-4, ...).
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
- [✓] **CQ-7 [GUI-01] Provar (e corrigir só se preciso) a revisão de um rascunho grande** — OWNER: GUI
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
- [✓] **EXAM-1 [GUI-02] Modo Prova sem feedback antecipado** — OWNER: GUI
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
- [✓] **EXAM-2 [GUI-03] Resultado que ensina depois de medir** — OWNER: GUI
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
- [✓] **EXAM-3 [GUI-04] Resultado vira continuidade** — OWNER: GUI
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
- [✓] **GUI-05 Jornada completa do aluno, ponta a ponta** — OWNER: GUI
      SPRINT_GOAL: provar uma jornada real sem dead ends: material -> unidade -> Resumo Mestre -> revisão/aceite -> estudo -> perguntas -> feedback -> revisão -> prova -> resultado -> evidência -> Estatísticas -> próxima ação.
      BEFORE: cada parte foi provada em spec separado (draft-acceptance, study-now-flow, exam-mode, stats); nenhuma prova única conecta todas, então um dead end ENTRE etapas passaria despercebido.
      AFTER: um único e2e percorre a jornada inteira num mesmo perfil e banco reais (servidor, UI e PDF reais; modelo = stub), a 1280 e a 375px, e cada etapa termina com uma próxima ação visível baseada na evidência do próprio aluno.
      WHY: um produto só existe quando o fluxo completo funciona; quebras entre telas são o que faz o aluno desistir.
      SCOPE: e2e/student-journey.spec.js (novo) + correção do MENOR dead end material que a jornada revelar (src/app.js).
      DETAILS: reutilizar helpers e stubs dos specs existentes (content-quality-flow, exam-mode); medir, não redesenhar; qualquer beco sem saída achado vira teste vermelho -> menor correção.
      PROOF: e2e da jornada completa; desktop + 375px sem overflow; dados persistem após reload; Estatísticas reflete a evidência da prova/estudo; a próxima ação (Hoje/Plano "para reforçar") aponta para o erro do aluno; toda tela alcançada tem saída clara.
      DONE_WHEN: um aluno entra com um PDF e chega, sem sair do produto, a uma próxima ação baseada na própria evidência; e2e verde e regressão relevante verde.
      DEPENDENCIES: GUI-01..04 (feitos); gate e2e completo do snapshot EXAM.
      EVIDENCE: `e2e/student-journey.spec.js` (1 teste, 3/3 repetições verdes; mutação — trocar "Refazer erros (1)" por (9) — o deixa vermelho): PDF real -> rascunho (stub no caminho do provider real) -> aceite -> Plano com origem do resumo -> Estudar agora (Por quê após revelar; erro com resposta + trecho da página 2; "Refazer erros"/"Concluir" visíveis) -> reteste (1/1, sem evidência nova) -> Prova (nenhum gabarito/"Por quê" no DOM antes de submeter) -> correção (resposta do aluno ao lado do gabarito e do porquê; nota só quando tudo julgado, 2/3 — 66,7%) -> registrar (exatamente 2 linhas de evidência: estudo + prova; 1 item "para reforçar") -> Hoje "1 exercício para reforçar" -> Estatísticas/Por conteúdo lista a aula -> "Ver no Plano" -> chip "1 para reforçar" -> reload preserva tudo; o modelo só foi chamado para PRODUZIR o material (GENERATE, AUDIT). 375px sem overflow horizontal no resultado do estudo, na prova, na correção, em Hoje e em Estatísticas. Nenhum dead end achado; nenhum código de produto alterado. GATE do snapshot EXAM: e2e completo 125/127 — 1 falha era corrida DE TESTE (product-value:141 lia data-attempt-id uma vez, sem esperar o POST assíncrono; passou 4/4 isoladamente; corrigido com toHaveAttribute que espera) e 1 é AMBIENTE conhecido (production-build exige a branch claude/smartlearn-v1-complete; passa com CI=1, guard não alterado).
      PRODUCT_DELTA: o SmartLearn passa a ter a jornada inteira provada num só perfil/banco, sem seed por API: um aluno entra com um PDF e chega a uma próxima ação (reforçar o erro) baseada na própria evidência de estudo E de prova.
      PROOF_OBSERVED: e2e acima + gate completo (ver EVIDENCE).
      USER_VALUE: quebras entre telas — o que faz o aluno desistir — passam a ser detectadas por um teste único; hoje não há nenhuma.
      NOT_PROVEN: qualidade de um modelo REAL; leitor de tela; uso com vários dias/revisões agendadas (a aula usa data futura para a sugestão vir do ledger, não de revisão vencida); Android/Windows nativos (esta prova é WEB).
      COMMIT: ver `git log` (test(journey): full student journey).
- [✓] **AUTHOR-1 O aluno escreve o "Por quê" das próprias questões** — OWNER: GUI
      SPRINT_GOAL: uma questão criada pelo próprio aluno ensina como as geradas por IA: ele escreve (e edita) o porquê da resposta e o vê no Estudar agora, no cartão de erro, na revisão da Hoje e na correção da prova.
      BEFORE: só questões geradas por IA têm "Por quê"; o formulário de exercício manual tem enunciado, resposta e dica, sem explicação; editar uma questão não permite mexer no porquê.
      AFTER: o formulário de criar e o de editar exercício têm o campo "Por quê (opcional)"; o texto salvo aparece onde a resposta aparece; vazio = nada aparece (nunca inventado).
      WHY: quem estuda com as próprias questões (o caso comum) perde o feedback que ensina exatamente no momento do erro.
      SCOPE: formulário de exercícios em Registro/Plano (src/app.js), remote-store (create/update), já suportado pelo servidor.
      PROOF: e2e: criar exercício com porquê pela UI -> aparece após revelar no Estudar agora e na correção da prova; editar o porquê -> nova versão mostra o texto novo; sem porquê -> nenhum bloco "Por quê"; unit do mapeamento.
      DONE_WHEN: o fluxo acima verde, sem regressão nos e2e de exercícios.
      DEPENDENCIES: EXAM-3 (feito).
      EVIDENCE: formulários de criar e de editar exercício (Registro) ganharam "Por quê (opcional)" (`.exercise-why-input`, só em modo servidor — o armazenamento local não tem a coluna; não se finge salvar); `remote-store` create/update passam `explanation` (update: undefined mantém, null limpa); a lista do Registro mostra "Por quê: …". Prova: `e2e/author-why.spec.js` (2): o texto escrito pelo aluno aparece na lista, SÓ depois de revelar no Estudar agora, no cartão de erro e na correção da prova; item sem porquê não mostra bloco algum; editar pré-preenche, salva nova versão com o texto novo (visto no Estudar agora); esvaziar remove; resposta preservada; formulários de criar e editar a 375px sem overflow. Regressão: unit 382/382; e2e practice, plan-study-now, study-now-flow, exercise-explanation, exam-mode, feature-parity, offline-writes = 17/17 verdes.
      PRODUCT_DELTA: quem estuda com as PRÓPRIAS questões (o caso comum) passa a ter o mesmo feedback que ensina, no momento do erro, que as questões geradas por IA têm.
      PROOF_OBSERVED: e2e + unit acima.
      USER_VALUE: o aluno escreve o porquê uma vez (quando entende) e o relê no momento em que erra, em vez de só ver a resposta seca.
      NOT_PROVEN: no modo local (sem servidor) o campo não é oferecido; texto longo (limite do servidor = 2000 caracteres) sem teste de UI; leitor de tela nos novos campos.
      COMMIT: ver `git log` (feat(exercises): student writes the Por quê).
- [✓] **EXAM-4 Prova por disciplina** — OWNER: GUI
      SPRINT_GOAL: o aluno faz uma prova que cobre várias aulas de uma disciplina, com prioridade ao que precisa reforçar, e o resultado vira evidência por aula.
      BEFORE: a prova cobre UMA aula; quem se prepara para uma prova de disciplina (REVALIDA, faculdade) precisa fazer N provas separadas e não vê a disciplina como um todo.
      AFTER: "Fazer prova da disciplina" monta uma prova com questões de várias aulas da disciplina, priorizando o que precisa reforçar; a correção e o resultado funcionam como hoje; a evidência é registrada POR AULA (uma linha por aula, contagens só das questões daquela aula), sem duplicar.
      WHY: é assim que o aluno realmente é medido; sem isso a prova mede pedaço e nunca o conjunto.
      SCOPE: exams/exam_items (migração 025+ — a 024 é do GUI; CLI usa 025 SÓ se combinado: reivindicar 025 no GUI.md), rotas /v1/exams, Plano (botão por disciplina), reaproveitando prioridades (/v1/priorities) para amostrar.
      DETAILS: decisão local de amostragem (menor correta): até 20 questões; primeiro as "para reforçar" (último resultado errado), depois as demais, distribuídas entre as aulas em ordem estável; exam ganha subject_id (unit_id passa a ser opcional) e exam_items já guarda exercício e versão; finalize agrupa por aula. Sem mastery, ML ou agenda nova.
      PROOF: teste de servidor (amostragem determinística, itens de 2+ aulas, finalize cria 1 evidência por aula com contagens certas, idempotente) + e2e (prova da disciplina, correção, evidência por aula no histórico de cada uma, sem vazamento de gabarito antes de submeter).
      DONE_WHEN: uma prova de disciplina pode ser feita, corrigida e vira evidência por aula; prova de aula única intacta.
      DEPENDENCIES: EXAM-1..3, EXAM-5 (feitos). Risco: migração — só dados novos, nada destrutivo.
      EVIDENCE: migração 025 (aditiva: `exams.subject_id` + tabela `exam_evidence` com backfill das provas existentes; `unit_id` segue NOT NULL e guarda a aula da 1ª questão como âncora). Serviço: `startSubject` (até 20 questões; primeiro as "para reforçar", depois rodízio entre as aulas, apresentadas agrupadas por aula; retoma a prova aberta; prova de aula única independente), `finalize` agora agrupa por aula (1 evidência INITIAL_PRACTICE POR aula, só com as questões dela; idempotente), DTO com `scope`/`title`/`unitTitle` por item/`evidenceIds`; `POST /v1/exams` aceita `unitId` XOR `subjectId`; origem "EXAM" agora lida da tabela de vínculo. UI: botão "Prova da disciplina" no Plano, título "Prova — <disciplina>", "Aula: …" por questão na correção, nota "Resultado registrado no seu histórico (3/4), por aula (2)", "Refazer erros" busca os erros em várias aulas. Prova: `server/test/exams-subject.test.js` (4: mistura + sem vazamento + retomada; máx. 20 com fraca primeiro e rodízio 10/10; evidência por aula com contagens próprias, idempotente; dono/inexistente/vazia) + e2e `exam-mode` EXAM-4 (sem gabarito/porquê no DOM antes de submeter, duas aulas presentes, correção por aula, evidência 1/2 e 2/2 com origem EXAM, refazer erro, histórico da aula B mostra "Prova: 2/2", 375px sem overflow). GATE COMPLETO no snapshot: unit 383/383, server 484/484, e2e 131/132 — a falha é `production-build.spec` (guard de worktree, AMBIENTE; passa 1/1 com CI=1 neste código, guard não alterado).
      PRODUCT_DELTA: o aluno faz UMA prova cobrindo a disciplina inteira, começando pelo que errou, e cada aula recebe a própria evidência (histórico/Estatísticas continuam por aula, sem mistura).
      PROOF_OBSERVED: testes e gate acima.
      USER_VALUE: prepara para provas de disciplina (REVALIDA/faculdade) em vez de várias provas isoladas; o erro certo volta primeiro.
      NOT_PROVEN: a amostragem é uma regra simples e explicável, não uma calibração de qualidade; disciplinas com centenas de questões usam só 20 por prova; backup/rehearse do CLI ainda não cobre exams/exam_evidence (registrado para o CLI); Android/Windows nativos.
      COMMIT: ver `git log` (feat(exam): Prova da disciplina).
- [✓] **EXAM-5 O histórico distingue Prova de Estudo** — OWNER: GUI
      SPRINT_GOAL: no histórico do Plano o aluno vê quais registros vieram de uma prova e quais do estudo; "Estudar agora" deixa de sumir depois da primeira evidência.
      BEFORE: a prova grava evidência do tipo INITIAL_PRACTICE; o rótulo "Prática inicial" não diferencia prova de estudo e "Estudar agora" some após a 1ª evidência da aula.
      AFTER: rótulo próprio para a origem prova sem quebrar o esquema (REVIEW/INITIAL_PRACTICE/EXTERNAL) nem duplicar evidência; estudar de novo continua disponível.
      WHY: medir e estudar são coisas diferentes; sem o rótulo o aluno não lê a própria trajetória.
      DETAILS: menor mudança: o DTO da evidência ganha `origin` ("EXAM" quando existe exams.evidence_id = evidência; senão null) por LEFT JOIN, sem migração nem novo tipo de evidência; o Plano rotula "Prova" e passa a oferecer "Estudar agora" mesmo com evidência de prova (só a evidência de ESTUDO esconde o botão).
      PROOF: teste de servidor (evidência de prova tem origin EXAM; a de estudo e a externa não) + e2e: estudar (Prática inicial) e prova (Prova) aparecem com rótulos distintos no histórico; só prova => "Estudar agora" continua disponível; só estudo => some como antes.
      DONE_WHEN: o histórico do Plano diz de onde veio cada linha e o botão de estudo não some por causa de uma prova; sem regressão em Estatísticas/analytics (tipo continua INITIAL_PRACTICE).
      DEPENDENCIES: AUTHOR-1 (feito).
      EVIDENCE: `evidence.list` faz LEFT JOIN em exams.evidence_id e o DTO ganha `origin: 'EXAM'` (ausente para estudo/externo; o TIPO segue INITIAL_PRACTICE, sem migração, esquema e analytics intactos); `remote-store` repassa `origin`; o Plano rotula "Prova: 1/2" e só evidência de ESTUDO (origin != EXAM) esconde "Estudar agora". Prova: `server/test/evidence-origin.test.js` (vermelho antes: origin inexistente; verde depois); e2e `exam-mode` EXAM-5: só prova => 1 linha "Prova: 1/2" e "Estudar agora" continua; depois estudo => 2 linhas ("Prova: 1/2", "Prática inicial: 2/2") e só agora o botão some. Regressão: unit 382/382, server 480/480, e2e 32/32 (plano, estudar agora, veredito, prioridades/Hoje, reteste, drilldown de Estatísticas, tentativas, jornada) + exam-mode 5/5 + student-journey.
      PRODUCT_DELTA: o histórico do Plano diz de onde veio cada linha (Prova x Prática inicial) e fazer uma prova deixa de tirar do aluno o "Estudar agora".
      PROOF_OBSERVED: teste de servidor + e2e acima.
      USER_VALUE: o aluno lê a própria trajetória sem confundir medir com estudar e continua podendo estudar depois de medir.
      NOT_PROVEN: Estatísticas/"Exercícios resolvidos" continuam tratando a prova como INITIAL_PRACTICE (rótulo lá não muda; decisão consciente para não tocar superfície protegida); Android/Windows nativos.
      COMMIT: ver `git log` (feat(exam): history labels Prova).
- [!] **VERDICT-1 Veredito de Estatísticas ponderado por volume (bloqueada: precisa de decisão de produto)** — OWNER: GUI
      SPRINT_GOAL: o veredito agregado deixa de contar disciplinas com peso igual quando os volumes de evidência são muito diferentes.
      DETAILS: lido o código (src/analytics.js studyVerdict): o veredito CONTA disciplinas e mostra cada contagem à parte ("Disciplinas: 1 melhorando · 1 piorando"), com o volume por período exigido dentro de cada disciplina (mín. 10 questões) — não há erro, e ponderar por volume mudaria o significado do veredito numa superfície protegida (ADR-0001). Só ativar com decisão de produto (HUMAN_GATE); até lá, adiada.
- [✓] **UX-1 Inspeção visual do fluxo de prova em uso real (desktop + 375px)** — OWNER: GUI
      SPRINT_GOAL: olhar de verdade (capturas 1280/375) o fluxo Plano -> Prova (aula e disciplina) -> correção -> resultado e corrigir só os defeitos visuais/de uso realmente observados.
      BEFORE: os e2e provam comportamento e ausência de overflow, mas ninguém olhou as telas novas de prova/correção/disciplina como um aluno olharia.
      AFTER: capturas revisadas; cada defeito material achado (hierarquia, botões apertados, texto cortado, rótulo confuso) virou teste vermelho -> menor correção; se não houver defeito, fecha só com as capturas.
      WHY: uma tela que passa no teste mas confunde o aluno não é entrega.
      SCOPE: telas da Prova (src/app.js, src/styles.css, index.html); sem redesign de superfície protegida.
      PROOF: capturas 1280/375 de: botões no Plano, prova em andamento, correção (aula e disciplina), resultado registrado; lista de defeitos com decisão (corrigido/aceito).
      DONE_WHEN: telas revisadas; defeitos materiais corrigidos e provados; sem regressão.
      DEPENDENCIES: EXAM-4 (gate e2e completo).
      EVIDENCE: prova por disciplina executada no app real (servidor real, UI real) a 1280 e 375px com capturas de: Plano com os botões, prova em andamento (1ª e última questão), confirmação, correção, tudo julgado, resultado registrado. Defeitos MATERIAIS observados: (1) no Plano "Estudar agora / Fazer prova / Prova da disciplina" ficavam COLADOS, sem espaço; (2) depois de registrar o resultado os botões Acertei/Errei continuavam à vista (um com anel de foco) parecendo ativos embora desabilitados. Correções mínimas: contêiner flex com gap `.plan-exercise-actions` e `.exam-judge[hidden]` (o chip Acerto/Erro continua mostrando o resultado). Prova: e2e `exam-mode` UX-1 (vermelho antes: contêiner inexistente; verde depois) mede o espaço entre os botões a 1280 e a 375px e exige os botões ocultos após registrar. Sem defeito achado em: navegação entre questões, resposta preservada, numeração com respondidas destacadas, aviso/confirmação de submissão, correção legível a 375px (aula por questão, sua resposta x correta x porquê), nenhum vazamento antes de submeter (coberto pelos e2e EXAM-1/4), sem overflow horizontal. Regressão: exam-mode 7/7 + plano/estudar/jornada/autoria/prioridades/product-value/mobile-nav 15/15.
      PRODUCT_DELTA: a prova (aula e disciplina) deixa de ter dois defeitos de uso que o teste funcional não pegava: ações coladas no Plano e controles "vivos" após o resultado final.
      PROOF_OBSERVED: capturas revisadas antes/depois + e2e acima.
      USER_VALUE: menos confusão e menos toque errado no celular; o resultado registrado é lido como final.
      NOT_PROVEN: leitor de tela e navegação só por teclado da prova não foram exercitados além do que os e2e já cobrem (foco após julgar); dispositivo físico real (só emulação de viewport).
      COMMIT: ver `git log` (fix(exam): space Plano action buttons; hide Acertei/Errei).
- [✓] **ATTEMPT-1 A própria resposta da prova aparece ao rever o desempenho** — OWNER: GUI
      SPRINT_GOAL: ao abrir um item de prova em "Exercícios resolvidos" (Estatísticas/Plano), o aluno vê o que ELE escreveu ao lado do gabarito, e não só o "acertei/errei" — o dado já existe (exam_items.student_answer) e hoje se perde.
      BEFORE: o detalhe da tentativa mostra enunciado, gabarito e resultado; para provas ele diz que o produto nunca captura a resposta do aluno — o que deixou de ser verdade com o Modo Prova.
      AFTER: tentativas nascidas de uma prova mostram "Sua resposta na prova" (ou "Sem resposta"); estudo/revisão seguem como hoje (sem campo inventado).
      WHY: rever o erro comparando com o que se escreveu é o que faz a prova ensinar depois de dias; sem isso a resposta some depois da tela de correção.
      SCOPE: server/src/services/exercise-review.js (+DTO), diálogo de tentativas (src/app.js). Superfície de Estatísticas: acréscimo funcional de um campo, sem redesenhar.
      DETAILS: junção evidence -> exam_evidence -> exam_items por exercise_id (a mesma questão pode aparecer em provas diferentes: o vínculo é pela prova daquela evidência); campo só quando a fonte é prova; texto vem do aluno, sempre inserido como texto (nunca HTML).
      PROOF: teste de servidor (prova de disciplina: cada tentativa traz a resposta certa do aluno; estudo não traz o campo; outra prova da mesma questão não vaza) + e2e (prova -> registrar -> Estatísticas/Plano -> abrir a evidência -> "Sua resposta na prova").
      DONE_WHEN: a resposta digitada na prova é visível ao rever a evidência, sem regressão nos fluxos de tentativa existentes.
      DEPENDENCIES: EXAM-3/4 (feitos).
      EVIDENCE: `getAttemptDetails` junta evidência -> exam_evidence -> exam_items (por exercise_id, só da prova DAQUELA evidência) e devolve `origin: 'EXAM'` + `studentAnswer` (null = sem resposta) por tentativa; estudo/revisão não ganham o campo. O diálogo de "Exercícios resolvidos" mostra "Sua resposta na prova: …" (ou "sem resposta", em itálico) acima do Gabarito, sempre como TEXTO. Prova: `server/test/exercise-review-exam.test.js` (2: resposta do aluno por tentativa + null sem resposta + origin; duas provas da mesma questão não se misturam; estudo sem o campo) + e2e `exam-mode` ATTEMPT-1 (prova -> registrar -> Estatísticas -> abrir a linha; "<b>…</b>" digitado aparece como texto, sem HTML; 375px sem overflow). Regressão: server 486/486, unit 383/383, e2e 32/32 (tentativas, estudar agora, exam-mode, stats sorting/responsive).
      PRODUCT_DELTA: a resposta escrita na prova deixa de sumir depois da tela de correção: dias depois, ao rever o desempenho, o aluno compara o que escreveu com o gabarito.
      PROOF_OBSERVED: testes acima.
      USER_VALUE: revisar o erro com a própria resposta na frente é o que transforma a prova em aprendizado duradouro.
      NOT_PROVEN: só provas registradas depois desta mudança e com resposta digitada mostram o campo (provas antigas: idem, pois o dado sempre existiu em exam_items); não há edição da resposta depois de submetida (por desenho).
      COMMIT: ver `git log` (feat(stats): show the student's exam answer when reviewing an attempt).
- [✓] **INTEGRATE-1 Trazer o trabalho do GUI para o branch canônico (fast-forward)** — OWNER: GUI
      SPRINT_GOAL: quem abre o app pelo worktree canônico (claude/smartlearn-v1-complete) passa a ter a Prova, o "Por quê" autoral, a jornada e o painel novos — hoje só existem em claude/content-quality (~17 commits à frente).
      BEFORE: o branch canônico está em 2ca64d8 e não tem Modo Prova, prova por disciplina, migrações 023-025 nem o painel de duas lanes; o CLI ficou pausado sem nada a mesclar.
      AFTER: fast-forward sem conflitos (CLI pausado, árvore limpa, sem trabalho em voo); gate no branch canônico com production-build verde (o guard de worktree passa lá).
      WHY: entregar o que foi construído; o guard de build só passa no branch canônico, então o gate completo só fecha 100% lá.
      SCOPE: git (ff-only) no worktree canônico; nenhuma mudança de código.
      DETAILS: conferir CLI.md (PAUSED, FILES_IN_FLIGHT=none) e git status limpo no worktree canônico; `git merge --ff-only claude/content-quality` (reversível: mover o ponteiro do branch de volta a 2ca64d8); registrar em GUI.md para o CLI reconciliar.
      PROOF: git log/HEAD iguais nos dois; `npm test` + server + e2e completo no worktree canônico com 0 falhas (inclusive production-build).
      DONE_WHEN: branch canônico em ff com o GUI e o gate completo verde lá.
      DEPENDENCIES: ATTEMPT-1 (feito); CLI pausado.
      EVIDENCE: pré-condições conferidas (CLI.md PAUSED, FILES_IN_FLIGHT=none, worktree canônico só com o .impeccable/ não rastreado, ff possível); `git merge --ff-only claude/content-quality` em claude/smartlearn-v1-complete: 2ca64d8 -> d6109f6, sem conflitos. GATE COMPLETO NO BRANCH CANÔNICO: unit 383/383, server 486/486, e2e 134/134 (inclusive production-build, que só passa nesse branch pelo guard de worktree — o "1 falha de ambiente" dos gates anteriores desaparece).
      PRODUCT_DELTA: o branch canônico passa a ter tudo o que o GUI entregou (Prova por aula e por disciplina, "Por quê" autoral, resposta da prova ao rever, jornada provada, painel de duas lanes) com o gate 100% verde; quem abre o app por lá já usa essas capacidades.
      PROOF_OBSERVED: gate acima.
      USER_VALUE: o que foi construído está onde o produto roda, com prova de que nada quebrou.
      NOT_PROVEN: Android/Windows nativos (o gate é WEB); o CLI ainda precisa reconciliar ao voltar (registrado em GUI.md).
      COMMIT: fast-forward para d6109f6 (sem commit novo de código).
- [!] **REALMODEL-1 Rodar o pipeline com um modelo REAL e revisar a saída (bloqueada: precisa de chave)** — OWNER: GUI
      SPRINT_GOAL: provar (ou refutar) a qualidade do conteúdo médico gerado por um modelo real — o maior NOT_PROVEN do track.
      DETAILS: exige SMARTLEARN_AI_API_KEY + consentimento + orçamento (custo real, dependência paga): HUMAN_GATE. Quando liberado: 1 PDF médico, revisar a saída a olho, registrar achados; sem chamar o modelo em runtime de estudo.

- [✓] **LARGEPDF-1 Material grande (aula de ~150 páginas) do PDF ao rascunho** — OWNER: GUI
      SPRINT_GOAL: provar (e corrigir só o que quebrar) que um PDF de aula realista, de dezenas a ~150 páginas, sai do upload para propostas e rascunhos utilizáveis sem travar, estourar limite silenciosamente ou perder páginas.
      BEFORE: todos os fluxos foram provados com PDFs de 2 a 5 páginas; o tamanho real de uma aula médica (slides/capítulo) é NOT_PROVEN — extração, divisão em trechos de 10 páginas, teto de entrada do modelo (SMARTLEARN_AI_MAX_INPUT_CHARS) e a lista de propostas na UI nunca foram exercitados em escala.
      AFTER: um PDF sintético de ~150 páginas percorre upload -> extração -> propostas -> rascunho de UM trecho; tempo medido; limites (tamanho, caracteres de entrada) têm mensagem clara ao aluno em vez de falha muda; a lista de propostas continua navegável a 375px.
      WHY: o aluno real envia o material inteiro da aula; se o produto engasga ou trunca sem avisar, ele desiste ou estuda conteúdo incompleto.
      SCOPE: source-extraction / content-proposals / generated-drafts (servidor) e a lista de propostas em Materiais (src/app.js); só correções mínimas do que a medição mostrar.
      DETAILS: medir primeiro (tempo de extração, nº de propostas, tamanho do prompt de um trecho de 10 páginas densas vs o teto de entrada, comportamento acima do teto); corrigir o menor problema real; se já funciona, fechar só com a prova e os números.
      PROOF: e2e com PDF sintético de 150 páginas (stub de modelo) + medições registradas; caso de trecho acima do teto de entrada com mensagem explícita; 375px sem overflow.
      DONE_WHEN: fluxo grande utilizável e comprovado (ou ajustado e comprovado), sem regressão em source-proposals/draft-acceptance.
      DEPENDENCIES: INTEGRATE-1.
      EVIDENCE: MEDIDO (e2e/large-pdf.spec.js, PDF sintético de 150 páginas ≈ 303 KB, servidor e UI reais): upload -> extração -> 15 propostas em ~1,5 s, cobrindo 1-10 … 141-150 (toda página em exatamente uma proposta), sem overflow a 1280/375px, e um trecho do meio vira rascunho revisável. ACHADOS REAIS: (1) páginas densas (10 x 6.500 caracteres = 65.000 > limite de entrada de 50.000) geravam um trecho que NUNCA podia virar rascunho; (2) o clique em "Gerar rascunho com IA" nesse trecho não mostrava NADA perto do item — o erro caía em #sources-message no topo, fora da tela numa lista longa — e o texto era técnico ("excede o limite de 50000"). CORREÇÕES MÍNIMAS: `chunkSource` fecha o trecho antes de ultrapassar o limite de caracteres (padrão 45.000; a rota usa 90% de `aiMaxInputChars`; máx. 10 páginas como antes; uma página acima do limite vira trecho próprio, nunca é descartada); mensagem em português claro para o caso restante (uma única página gigante); erro de Materiais passa a rolar até a mensagem. Prova: `server/test/content-proposals.test.js` (+2: páginas densas partem antes do limite com todas as páginas presentes e em ordem; páginas leves mantêm 10 por trecho e uma página gigante fica sozinha) e e2e `large-pdf` (2): o trecho denso agora tem >=2 propostas e a 1ª vira rascunho; página gigante no fim de uma lista de 16 propostas mostra "texto demais…" DENTRO da tela — vermelho sem a rolagem (toBeInViewport), verde com. Regressão: server 488/488, unit 384/384, e2e source-proposals/draft-acceptance/content-quality-flow/large-draft-review/product-value/jornada + large-pdf = 13/13.
      PRODUCT_DELTA: uma aula de ~150 páginas percorre o produto sem travar em ~1,5 s até propostas utilizáveis; nenhum trecho fica impossível de virar rascunho por excesso de texto, e o único caso restante (uma página gigante) é explicado ao aluno e aparece na tela.
      PROOF_OBSERVED: medição + testes acima.
      USER_VALUE: o aluno que sobe o material inteiro da aula não esbarra num botão que "não faz nada".
      NOT_PROVEN: PDF real escaneado/com imagens (OCR não existe), tabelas/figuras médicas; PDFs próximos do teto de 25 MB; qualidade do rascunho de um modelo real sobre um trecho denso; a geração de rascunho de TODOS os 15 trechos em sequência (só um por vez foi exercitado).
      COMMIT: ver `git log` (feat(sources): chunks close before the model input limit).
- [✓] **FIRSTRUN-1 Primeira vez do aluno: telas vazias levam a uma ação (desktop + 375px)** — OWNER: GUI
      SPRINT_GOAL: uma conta nova, sem nada cadastrado, vê em Hoje/Plano/Estatísticas/Materiais/Disciplinas estados vazios que dizem o que fazer a seguir, sem beco sem saída.
      BEFORE: a jornada foi provada de ponta a ponta com dados criados no caminho, mas ninguém inspecionou o que a conta vazia mostra em cada tela.
      AFTER: capturas revisadas de cada tela vazia; cada beco sem saída ou texto confuso achado vira teste vermelho e a menor correção.
      WHY: a primeira impressão decide se o aluno continua; uma tela vazia sem próximo passo é o pior ponto de abandono.
      SCOPE: estados vazios (src/app.js, index.html); sem redesign de superfície protegida (Estatísticas só ganha texto/ação se faltar).
      PROOF: capturas 1280/375 por tela + e2e que segue o primeiro passo sugerido de cada tela vazia até a tela seguinte.
      DONE_WHEN: nenhuma tela vazia sem saída clara; defeitos materiais corrigidos e provados.
      DEPENDENCIES: INTEGRATE-1.
      EVIDENCE: conta nova (servidor e UI reais) inspecionada em Hoje, Plano, Estatísticas, Materiais, Disciplinas, Acompanhamento e Configurações a 1280 e 375px (capturas + texto de cada tela). Estatísticas, Materiais, Disciplinas e Acompanhamento já diziam o que fazer; Configurações não é ponto de partida. DEFEITO MATERIAL: a PRIMEIRA tela que o aluno vê (Hoje vazia) dizia só "Nenhuma revisão cadastrada. Cadastre ou importe estudos…" SEM nenhum botão — beco sem saída (o aluno tinha de adivinhar Materiais ou Plano). CORREÇÃO MÍNIMA: Hoje vazio agora explica o começo (envie o PDF de uma aula, o SmartLearn propõe resumo e questões para revisar) e oferece "Enviar um PDF de aula" (abre Materiais; só aparece onde Materiais existe) e "Criar uma aula" (abre Plano com o formulário de nova aula aberto e focado); o Plano vazio aponta para Materiais/“+ Nova aula”. Prova: `e2e/first-run.spec.js` (3, vermelhos antes: botões inexistentes): com autoridade de PDF os dois botões levam às telas certas; sem ela não há botão morto; 375px sem overflow e botões >= 44px. A continuação (PDF -> aula -> estudo) é a jornada já provada em `student-journey`. Regressão: e2e 39/39 (primeiro uso, Hoje, prioridades, plano, paridade, nav mobile, jornada, offline, auth) + unit 384/384.
      PRODUCT_DELTA: um aluno novo sabe o que fazer na primeira tela e chega a Materiais ou ao formulário de aula com um toque.
      PROOF_OBSERVED: capturas antes/depois + e2e acima.
      USER_VALUE: a primeira impressão deixa de ser uma tela vazia sem saída.
      NOT_PROVEN: aluno real sem orientação (a prova é um roteiro automatizado); textos em outro idioma; OBSERVADO E NÃO CORRIGIDO: a barra inferior a 375px quebra palavras no meio ("Estatístic/as", "Disciplin/as", "Configur/ações") — vira MOBILENAV-1.
      COMMIT: ver `git log` (feat(first-run): Hoje vazio oferece os dois caminhos).
- [✓] **MOBILENAV-1 Barra de navegação inferior legível a 375px** — OWNER: GUI
      SPRINT_GOAL: os oito itens da barra inferior no celular deixam de quebrar palavras no meio e continuam tocáveis.
      BEFORE: a 375px "Estatísticas", "Disciplinas", "Configurações" e "Acompanhar" quebram no meio da palavra (visto nas capturas de FIRSTRUN-1) — aparece em TODA tela no celular.
      AFTER: rótulos inteiros e legíveis (ou forma abreviada consistente), alvos >= 44px, sem overflow, sem perder acesso a nenhuma tela.
      WHY: é a navegação principal do celular; texto quebrado parece defeito e dificulta reconhecer o destino.
      SCOPE: CSS/markup da navegação inferior (index.html, src/styles.css); sem mudar as telas.
      DETAILS: medir a largura real por item a 375/360/320; menor solução que couber (fonte/espaçamento, rótulo curto por item, ou rolagem horizontal do trilho) — decidir pelo que preserva alvo de toque e legibilidade.
      PROOF: e2e mede que nenhum rótulo quebra no meio da palavra (altura de linha única ou palavras inteiras) e que cada item tem >= 44px de alvo, a 375 e 360px; captura antes/depois.
      DONE_WHEN: navegação legível e provada em 375/360px, sem regressão em mobile-nav.
      DEPENDENCIES: FIRSTRUN-1.
      EVIDENCE: teste MEDIDO (vermelho antes: "Estatísticas" a 375px e até "Materiais" a 360px quebravam em duas linhas) exige, com os 8 destinos visíveis, rótulo de UMA linha sem overflow e alvo >= 44px a 375 e 360px. Correção mínima: as quatro palavras longas mostram forma curta no celular (Estat., Acomp., Discipl., Config.) enquanto a palavra inteira fica no DOM, visualmente oculta, como nome acessível (getByRole 'Estatísticas' continua achando 1 botão); rótulos sem quebra no meio da palavra; espaçamento lateral reduzido; desktop intacto (rótulos completos). Capturas 375/360/1280 revisadas. Regressão: e2e 49/49 (nav mobile, tema, paridade, auth, estatísticas responsivas, seletor de contexto, primeiro uso, prova).
      PRODUCT_DELTA: a navegação principal do celular deixa de mostrar palavras cortadas no meio em todas as telas.
      PROOF_OBSERVED: teste medido + capturas.
      USER_VALUE: o destino de cada botão é reconhecível de relance no celular.
      NOT_PROVEN: aparelho físico e leitor de tela real (o nome acessível está no DOM, não foi ouvido); larguras < 360px; abreviações "Estat./Acomp./Discipl./Config." são uma escolha de texto que o usuário pode preferir trocar.
      COMMIT: ver `git log` (fix(nav): short labels in the phone bottom bar).
- [✓] **EXAM-6 Resposta da prova não se perde quando a conexão cai** — OWNER: GUI
      SPRINT_GOAL: uma resposta digitada na prova nunca é perdida nem ignorada em silêncio se o servidor não puder ser alcançado; a submissão só acontece com tudo guardado.
      BEFORE: `saveExamAnswer` marcava a resposta como "guardada" ANTES de salvar; se o PUT falhava, o próximo salvamento via "nada mudou" e nunca reenviava — a resposta sumia do servidor, a mensagem dizia "continuam guardadas" e a submissão prosseguia (bug achado lendo o código durante a inspeção de uso).
      AFTER: respostas que falharam ficam pendentes no aparelho, são reenviadas a cada salvar/navegar/submeter; submeter com pendência é RECUSADO com explicação clara; ao voltar a conexão o mesmo clique guarda tudo e segue.
      WHY: a prova é medição; perder uma resposta por uma queda de rede distorce o resultado sem o aluno saber.
      SCOPE: src/app.js (fluxo da prova); sem mudança de servidor.
      EVIDENCE: e2e `exam-mode` EXAM-6 (vermelho antes: a submissão prosseguia com a 1ª resposta perdida): com a rede derrubada (rota abortada) a resposta 1 falha ao navegar (mensagem), a 2 falha ao submeter -> aviso "2 respostas ainda não foram guardadas … Nada foi submetido" e sem tela de confirmação; com a rede de volta o mesmo clique guarda as duas, confirma, submete, e a correção mostra "resp 1" e "resp 2". Regressão: exam-mode 9/9. Implementação: mapa `unsaved` por questão, `pushExamAnswer`/`flushExamAnswers`, submeter e confirmar só com tudo guardado.
      PRODUCT_DELTA: uma queda de conexão no meio da prova deixa de apagar respostas em silêncio; o aluno é avisado e nada é submetido pela metade.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: confiança de que o que foi digitado chega ao servidor.
      NOT_PROVEN: fechar a aba/travar o navegador com resposta pendente (o texto pendente vive só em memória; não há rascunho local persistente); julgamento/registro do resultado sem rede já mostram erro e permitem repetir, sem teste dedicado.
      COMMIT: ver `git log` (fix(exam): unsaved answers are retried and block submission).
- [✓] **ACCESS-1 A prova pode ser feita só com teclado e é compreensível por leitor de tela** — OWNER: GUI
      SPRINT_GOAL: provar (e corrigir só o que faltar) que o fluxo da prova funciona sem mouse e expõe estado a tecnologias assistivas: ordem de foco, numeração de questões, anúncio de progresso e de resultado.
      BEFORE: UX-1 deixou "navegação só por teclado e leitor de tela" como NOT_PROVEN; há aria-labels e foco em pontos isolados, mas nenhum teste percorre a prova inteira só com teclado.
      AFTER: um e2e faz a prova inteira (navegar, responder, submeter, corrigir, registrar) só com teclado, e verifica nomes acessíveis (questão atual, respondida, progresso, resultado) e foco previsível.
      WHY: acessibilidade é requisito de uso real e a prova é a tela mais interativa.
      SCOPE: tela da prova (src/app.js, index.html); correções mínimas de foco/rótulos.
      DETAILS: percorrer com Tab/Shift+Tab/Enter/Espaço; conferir role/aria (nav numerada com aria-current, alerta de submissão, status do resultado); medir onde o foco cai depois de cada ação.
      PROOF: e2e só-teclado + asserções de nome acessível; defeitos achados viram teste vermelho -> menor correção.
      DONE_WHEN: prova completa só com teclado e estados anunciados, sem regressão.
      DEPENDENCIES: EXAM-6.
      EVIDENCE: e2e `exam-mode` ACCESS-1 percorre a prova INTEIRA só com teclado (abrir pela tecla Enter no botão do Plano, digitar, Tab até "Próxima" e Enter — o foco volta à caixa de resposta da questão seguinte —, submeter e confirmar com Enter, foco na confirmação e depois no título da correção, julgar com Espaço/Enter mantendo o foco no botão, registrar com Enter). Defeitos MATERIAIS achados (vermelho antes): (1) a caixa "Sua resposta" não estava ligada à pergunta nem ao progresso — um leitor de tela ouvia só "Sua resposta" ao focar; (2) todos os botões "Acertei"/"Errei" tinham o MESMO nome acessível, sem dizer a qual questão se referem. Correções mínimas: `aria-describedby="exam-progress exam-question-text"` na caixa de resposta e `aria-label` "Acertei — questão N" / "Errei — questão N" (nomes distintos). Já estavam certos e ficaram provados: lista numerada nomeada com `aria-current` e rótulos "Ir para a questão N (respondida)", Anterior desabilitado na 1ª questão, foco previsível em cada etapa. Regressão: exam-mode + jornada + autoria + estudar agora = 15/15.
      PRODUCT_DELTA: a prova passa a ser realizável sem mouse e a expor, a tecnologias assistivas, a pergunta, o progresso e a qual questão cada botão de correção se refere.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: quem usa teclado ou leitor de tela consegue fazer e corrigir a prova.
      NOT_PROVEN: NENHUM leitor de tela real foi ouvido (só atributos/nomes acessíveis e foco medidos); contraste de cores; outras telas (Estudar agora, Materiais) não passaram pela mesma auditoria só-teclado.
      COMMIT: ver `git log` (fix(exam): keyboard-only proof + accessible names).
- [✓] **STUDYRESUME-1 Sair do "Estudar agora" no meio não perde nem duplica o que já foi respondido** — OWNER: GUI
      SPRINT_GOAL: descobrir (e corrigir só se houver dano real) o que acontece com o progresso quando o aluno sai, recarrega ou perde a conexão no meio de uma sessão de Estudar agora ou de um reteste.
      BEFORE: a prova retoma de onde parou (EXAM-1) e agora guarda respostas pendentes (EXAM-6); o Estudar agora nunca foi inspecionado desse ângulo — as tentativas são criadas no servidor ao revelar, mas o que resta se a sessão é interrompida antes do fim (evidência, "para reforçar", duplicação ao recomeçar) é desconhecido.
      AFTER: comportamento MEDIDO e documentado; se a interrupção perde respostas já julgadas ou cria evidência duplicada/enganosa, corrigido com o menor ajuste e provado; se já é seguro, fecha só com a prova.
      WHY: o aluno é interrompido o tempo todo (celular, aula, rede); uma sessão que o pune por sair não se sustenta.
      SCOPE: fluxo Estudar agora / reteste (src/app.js) e, se preciso, serviço de tentativas/evidência (servidor).
      DETAILS: e2e que julga 1 de 3 itens, recarrega/navega e volta: o que o Plano mostra ("para reforçar", "Estudar agora"), quantas tentativas e evidências existem; depois concluir a sessão e conferir que não há linha duplicada; simular queda de rede ao julgar.
      PROOF: e2e com contagens de tentativas/evidência antes e depois da interrupção; defeitos achados viram teste vermelho -> menor correção.
      DONE_WHEN: interromper e retomar não perde resposta julgada nem duplica evidência, ou o comportamento é explicado ao aluno.
      DEPENDENCIES: ACCESS-1.
      EVIDENCE: MEDIDO em e2e reais (`e2e/study-resume.spec.js`). (a) Interromper no meio (julgar 1 errado, revelar 2, recarregar): o julgamento já feito PERMANECE ("1 para reforçar"), NENHUMA evidência é escrita até o fim da sessão, "Estudar agora" segue disponível e recomeçar é uma passada completa nova que não dobra a contagem (evidência 3/3 só da passada concluída; a tentativa errada antiga deixa de pesar porque a última tentativa do item 1 é a certa) — já era seguro, agora provado. (b) DEFEITO REAL: se a conexão cai exatamente ao julgar, a sessão AVANÇAVA em silêncio: contadores locais (respondidas/acertos) eram incrementados antes do POST e o erro era engolido — o resultado mostrava uma resposta que o servidor não tinha, a evidência ficava com questionsCount maior que as tentativas ligadas e o item errado não entrava em "para reforçar" (mesma classe do EXAM-6). CORREÇÃO MÍNIMA: o servidor é avisado PRIMEIRO; se falhar, o aluno fica na mesma questão, com os mesmos botões e a mensagem "Não foi possível registrar sua resposta…" (novo #study-now-message, aria-live), sem contar nada; ao voltar a conexão o MESMO botão registra e a sessão segue; toque duplo não julga duas vezes. Prova (vermelho antes: elemento de mensagem inexistente e sessão avançando): e2e com rota abortada — servidor sem nada, mensagem, "Questão 1 de 2" mantida, retry registra, "Questão 2 de 2", 1 item para reforçar, evidência final 2/1 batendo com as tentativas. Regressão: e2e 11/11 (estudar agora, plano, prática, reteste de Hoje, explicação, fluxo de conteúdo, jornada).
      PRODUCT_DELTA: uma queda de conexão ao responder no Estudar agora deixa de gerar resultado/evidência que o servidor não tem; o aluno é avisado e repete o toque.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: o que aparece no resultado e no histórico é exatamente o que foi registrado.
      NOT_PROVEN: falha ao INICIAR a tentativa ao revelar (o desenho atual trata esse rastreio como aditivo e segue sem tentativa); fechar a aba com sessão em andamento (o estado da sessão vive só em memória — recomeça na questão 1); reteste e revisão agendada de Hoje não passaram pelo mesmo cenário de queda.
      COMMIT: ver `git log` (fix(study-now): a judgment the server does not have is never counted).
- [✓] **RESILIENCE-1 Quedas de conexão nos passos restantes (correção da prova, registrar resultado, revisão de Hoje, revelar)** — OWNER: GUI
      SPRINT_GOAL: aplicar o mesmo teste de queda de conexão aos passos ainda não cobertos — julgar item da prova, registrar o resultado da prova, salvar revisão de Hoje, iniciar tentativa ao revelar — e corrigir só divergência real entre o que a tela mostra e o que o servidor tem.
      BEFORE: EXAM-6 e STUDYRESUME-1 corrigiram resposta da prova e julgamento do Estudar agora; os demais passos só foram lidos como "erro visível e repetível" sem teste.
      AFTER: cada passo tem teste de queda com o resultado observado (mensagem + retry sem duplicar) e, onde a tela e o servidor divergirem, correção mínima.
      WHY: a mesma classe de falha silenciosa apareceu duas vezes em duas horas; procurá-la sistematicamente é mais barato que descobrir pelo aluno.
      SCOPE: src/app.js (prova, reteste, revisão de Hoje); servidor só se preciso.
      DETAILS: rota abortada por passo; para cada um registrar: a tela avançou? o servidor tem o dado? o retry duplica?
      PROOF: e2e por passo com contagens no servidor; defeitos viram teste vermelho -> menor correção.
      DONE_WHEN: nenhum passo mostra ao aluno progresso que o servidor não tem, ou a divergência é explicada e repetível.
      DEPENDENCIES: STUDYRESUME-1.
      EVIDENCE: `e2e/resilience.spec.js` (3, rota abortada por passo, contagens no servidor). SEGUROS (já se comportavam certo, agora provados): julgar item da prova sem rede (mensagem "Não foi possível registrar essa correção", o chip continua "A julgar", o servidor sem resultado, o retry salva UMA vez) e registrar o resultado da prova sem rede (botão volta a ficar habilitado, nenhuma nota "registrado", 0 evidências; o retry cria exatamente 1). DEFEITO REAL: se o clique em "Ver resposta" não conseguia INICIAR a tentativa (conexão caída naquele instante), o julgamento seguinte avançava a sessão em silêncio — sem mensagem e com o servidor vazio (a "melhor tentativa" do desenho aditivo virava divergência). CORREÇÃO MÍNIMA: ao julgar sem tentativa, o cliente inicia a tentativa AGORA; se não conseguir, mesma mensagem e mesma questão (o botão repete); com a conexão de volta o mesmo toque inicia, registra e segue (1 item para reforçar; evidência final 2/1 batendo). Vermelho antes / verde depois. Regressão: resilience + study-resume + estudar agora + plano + prática + jornada = 10/10.
      PRODUCT_DELTA: nenhum dos passos de medição/estudo mostra ao aluno progresso que o servidor não tem; onde a rede falha há mensagem e repetição do mesmo toque.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: o histórico e o "para reforçar" refletem exatamente o que o aluno fez, mesmo com rede instável.
      NOT_PROVEN: a revisão agendada de Hoje (item-level tracking é aditivo por desenho; o salvamento principal já é coberto pelo teste de escritas offline); reteste; falhas parciais (rede que cai entre "iniciar" e "revelar" do servidor); Android/Windows nativos.
      COMMIT: ver `git log` (fix(study-now): start the attempt when judging if reveal could not).
- [✓] **INTEGRATE-2 Gate completo e integração no branch canônico (tudo desde d6109f6)** — OWNER: GUI
      SPRINT_GOAL: levar ao branch canônico o que foi entregue desde a última integração (primeiro uso, navegação mobile, rascunho grande/PDF grande, resiliência de rede, acessibilidade, painel simples) com o gate completo verde.
      BEFORE: claude/smartlearn-v1-complete está em d6109f6; o GUI está ~20 commits à frente e o gate completo do último trecho ainda não rodou.
      AFTER: fast-forward sem conflitos (CLI pausado, árvore limpa) e unit + server + e2e completos verdes no branch canônico.
      WHY: entregar onde o produto roda e provar que a soma das sprints não quebrou nada.
      SCOPE: git (ff-only); nenhuma mudança de código.
      PROOF: contagens do gate no worktree canônico (inclui production-build).
      DONE_WHEN: canônico == GUI e gate 100% verde, ou falha classificada e corrigida.
      DEPENDENCIES: RESILIENCE-1; CLI pausado.
      EVIDENCE: pré-condições conferidas (CLI.md PAUSED, FILES_IN_FLIGHT=none, worktree canônico só com .impeccable/ não rastreado); `git merge --ff-only claude/content-quality`: d6109f6 -> 7494e61, sem conflitos. GATE COMPLETO NO BRANCH CANÔNICO: unit 385/385, server 488/488, e2e 148/148 (inclusive production-build, prova do guard de worktree).
      PRODUCT_DELTA: o branch canônico tem tudo desde a última integração (primeiro uso, navegação mobile, PDF/rascunho grande, resiliência de rede, acessibilidade da prova, painel simples) com gate 100% verde.
      PROOF_OBSERVED: contagens acima.
      USER_VALUE: o que foi construído roda onde o produto roda, provado.
      NOT_PROVEN: Android/Windows nativos (gate WEB); o CLI ainda precisa reconciliar ao voltar.
      COMMIT: fast-forward para 7494e61.

- [✓] **EXAM-7 Respostas pendentes da prova sobrevivem a fechar/recarregar a aba** — OWNER: GUI
      SPRINT_GOAL: uma resposta digitada e ainda não guardada no servidor (rede caída) não se perde se a aba for fechada ou recarregada; ao reabrir a prova, ela volta e é enviada.
      BEFORE: EXAM-6 retém pendências só em memória (NOT_PROVEN registrado): fechar a aba com resposta pendente a perde.
      AFTER: pendências persistem localmente por prova (armazenamento do navegador, com try/catch e sem depender dele) e são reenviadas na retomada; nada é criado sem ação do aluno.
      WHY: prova é medição; perder o que foi digitado ao trocar de aba/travar o celular no meio de uma queda de rede é exatamente quando o aluno mais precisa que ela sobreviva.
      SCOPE: fluxo da prova (src/app.js); sem mudança de servidor.
      DETAILS: espelhar o mapa `unsaved` em sessionStorage/localStorage por id de prova (try/catch em toda leitura/escrita; a tela funciona sem ele); ao abrir a prova, fundir as pendências locais sobre o que o servidor devolveu e reenviar; limpar ao submeter ou ao guardar com sucesso. Só o texto que o aluno digitou; nada de dado do servidor (gabarito) vai para o navegador.
      PROOF: e2e derruba a rede, digita, recarrega, reabre a prova, vê a resposta e a submissão a guarda; sem o armazenamento (bloqueado) a prova segue funcionando como hoje.
      DONE_WHEN: uma resposta pendente sobrevive ao recarregar e chega ao servidor; nada vaza; sem regressão nos e2e da prova.
      DEPENDENCIES: EXAM-6 (feito).
      EVIDENCE: pendências espelhadas em localStorage por prova (`smartlearn.exam.pending.<id>`, só o texto digitado, todo acesso em try/catch), gravadas a cada tecla (fechar a aba antes do blur não perde) e removidas quando o servidor confirma; ao reabrir a prova elas são mescladas sobre o retorno do servidor, aparece "Recuperei respostas que não tinham sido enviadas…" e são reenviadas sozinhas. Prova (`e2e/resilience.spec.js`, vermelho antes: caixa vazia após recarregar): rede caída + resposta 1 pendente + resposta 2 digitada sem blur -> recarregar com a rede de volta -> reabrir: caixa mostra "pendente 1", o servidor recebe AS DUAS ("pendente 1", "digitando 2") sem redigitar, submete e a correção mostra a resposta; nenhuma chave sobra no aparelho; com localStorage bloqueado a prova completa funciona como antes. Regressão: resilience + exam-mode = 15/15.
      PRODUCT_DELTA: a resposta digitada durante uma queda de rede sobrevive a fechar/recarregar a aba e chega ao servidor sozinha.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: o aluno não redigita nada depois de um problema de conexão no meio da prova.
      NOT_PROVEN: navegador que apaga o armazenamento ao fechar (modo privado); outro aparelho (o rascunho é local); expiração das pendências antigas (ficam até serem enviadas ou a prova ser submetida).
      COMMIT: ver `git log` (feat(exam): pending answers survive a reload).
- [✓] **STUDYSTATE-1 A sessão do Estudar agora retoma da questão onde parou** — OWNER: GUI
      SPRINT_GOAL: recarregar/sair no meio de uma sessão continua da próxima questão não julgada, em vez de recomeçar da 1ª (medido em STUDYRESUME-1: o julgado permanece como "para reforçar", mas a sessão reinicia).
      BEFORE: a sessão vive só em memória; ao recarregar o aluno refaz da questão 1, inclusive itens já julgados nesta mesma passada.
      AFTER: ao voltar a "Estudar agora" da mesma aula existe a opção clara de continuar de onde parou (com o placar parcial) ou recomeçar; concluir grava UMA evidência com as tentativas de toda a passada.
      WHY: o aluno é interrompido; repetir o que já respondeu desperdiça a sessão e distorce o ganho do "primeiro contato".
      SCOPE: src/app.js (estado da sessão); sem mudança de servidor.
      DETAILS: menor mudança: espelhar no navegador (guardado, com try/catch) o estado mínimo da sessão — ids dos exercícios na ordem, índice, ids de tentativas já submetidas, acertos/erros — por aula; ao iniciar, se existir e for da mesma aula com os mesmos exercícios, oferecer continuar/recomeçar; validar contra o servidor (exercícios ainda existem); limpar ao concluir. Nada de dado do servidor sensível (gabarito) é guardado além do que a sessão já tinha em tela.
      PROOF: e2e: julgar 2 de 3, recarregar, voltar: "Continuar (2 de 3 respondidas)" -> termina na questão 3, evidência 1 linha com 3 questões e as 3 tentativas; "Recomeçar" descarta e não duplica; sem armazenamento a sessão funciona como hoje.
      DONE_WHEN: retomar continua da questão certa sem duplicar evidência nem contagem.
      DEPENDENCIES: STUDYRESUME-1, EXAM-7 (feitos).
      EVIDENCE: estado mínimo da passada "inicial" espelhado no navegador (`smartlearn.studynow.<aula>`: ids dos exercícios na ordem, índice, tentativas já aceitas pelo servidor, acertos/erros) após CADA julgamento aceito; ao abrir "Estudar agora" com snapshot válido (mesma lista de exercícios, índice entre 1 e N-1, < 7 dias) aparece "Você já respondeu 2 de 3 nesta aula (1 acerto). Quer continuar de onde parou?" com [Continuar de onde parei] / [Recomeçar]; concluir/recomeçar limpa. Todo acesso ao armazenamento em try/catch. Prova (`e2e/study-resume.spec.js`, vermelho antes: bloco de retomada inexistente): (1) julgar 2 de 3, recarregar, "2 de 3", continuar na Questão 3, concluir -> UMA evidência 3 questões/2 acertos com as 3 tentativas ligadas, nada sobra no aparelho; (2) Recomeçar -> Questão 1 de 3, evidência 3/3 só da nova passada; (3) storage bloqueado -> começa na questão 1 como antes; prompt a 375px sem overflow e botões >= 44px. O teste de interrupção do STUDYRESUME-1 passou a clicar Recomeçar (o comportamento mudou de propósito). Regressão: 17/17 (estudar agora, plano, prática, reteste, jornada, explicação, fluxo de conteúdo, resiliência) + unit 385/385.
      PRODUCT_DELTA: interromper o Estudar agora deixa de custar a passada: o aluno continua da próxima questão, com o placar parcial, e a evidência final soma a passada inteira sem duplicar.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: o aluno é interrompido o tempo todo; retomar de onde parou respeita o esforço já feito.
      NOT_PROVEN: retomada em outro aparelho (o snapshot é local); reteste ("Refazer erros") não é retomável; se exercícios forem editados entre a interrupção e a volta o snapshot é descartado por segurança (recomeça).
      COMMIT: ver `git log` (feat(study-now): resume an interrupted pass).
- [✓] **TODAYUX-1 Hoje e Plano com dados reais no celular: inspeção de uso (375px)** — OWNER: GUI
      SPRINT_GOAL: olhar de verdade a tela que o aluno abre todo dia — Hoje com revisões, "para reforçar" e prioridades, e o Plano com várias aulas — a 375px e a 1280px, e corrigir só os defeitos materiais observados.
      BEFORE: Hoje/Plano foram provados por comportamento e "sem overflow", mas a densidade real (várias revisões vencidas, chips, textos longos) nunca foi inspecionada visualmente com dados.
      AFTER: capturas revisadas com uma conta populada (várias disciplinas, revisões atrasadas/hoje/futuras, itens para reforçar); cada defeito material (texto cortado, ação escondida, hierarquia confusa, alvo pequeno) vira teste vermelho -> menor correção; se estiver bom, fecha só com as capturas.
      WHY: Hoje é a tela diária; qualquer atrito ali é sentido todo dia.
      SCOPE: Hoje e Plano (src/app.js, src/styles.css, index.html); Estatísticas é superfície protegida (só leitura).
      PROOF: capturas 1280/375 antes/depois + e2e para cada defeito corrigido.
      DONE_WHEN: telas revisadas; defeitos materiais corrigidos e provados; sem regressão.
      DEPENDENCIES: STUDYSTATE-1.
      EVIDENCE: conta populada no app real (8 aulas em 4 disciplinas, revisões vencidas, itens errados, textos longos) — Hoje e Plano a 1280 e 375px, capturas antes/depois. DEFEITOS MATERIAIS (vermelho antes, verde depois): (1) HOJE 375px: em cada cartão de revisão a data quebrava em TRÊS linhas ("30 de / ago. de / 2026") e o título ficava numa faixa de ~100px — causa dupla: a regra legada `.review-meta{display:grid;grid-template-columns:repeat(2,1fr)}` (de uma lista de definição) também pegava a linha de data e a espremia em metade da largura, e as etiquetas ("Atrasada 20 dias", "1 para reforçar") ocupavam a coluna ao lado; correção: a data volta a bloco e, a 30rem ou menos, as etiquetas descem para baixo do título; teste mede data em 1 linha e título >= 60% da largura do cartão; (2) PLANO 375px: com chip de disciplina longo + etiqueta, o chevron de expandir caía SOZINHO numa linha própria; correção: fixado no canto superior direito (linha de identidade) sem cobrir as etiquetas; teste mede posição e sobreposição. Sem defeito em: resumo do dia, bloco "Começar agora", lista de vencidas, filtros do Plano, nav inferior. Regressão: 48/48 (Hoje, prioridades, reteste, plano, prova, nav mobile, primeiro uso, ordenação/veredito de Estatísticas) + resiliência.
      PRODUCT_DELTA: a tela diária no celular deixa de espremer título/data e de soltar o chevron no meio do nada.
      PROOF_OBSERVED: capturas + testes de geometria acima.
      USER_VALUE: as revisões de todo dia ficam legíveis de relance no celular.
      NOT_PROVEN: aparelho físico; Estatísticas (superfície protegida) só observada, não alterada; o "—" solto ao lado das etiquetas (placeholder de nota) segue como está.
      COMMIT: ver `git log` (fix(mobile): Hoje/Plano rows readable at 375px).
- [✓] **TRACKUX-1 Varredura de uso no celular das telas restantes (Acompanhamento, Disciplinas, Materiais com propostas, Configurações)** — OWNER: GUI
      SPRINT_GOAL: repetir a inspeção com dados reais nas telas ainda não vistas a 375px e corrigir só defeitos materiais.
      BEFORE: Hoje, Plano, Prova e primeiro uso foram inspecionados; Acompanhamento, Disciplinas, Materiais (lista de propostas) e Configurações não.
      AFTER: capturas revisadas; defeitos materiais viram teste de geometria vermelho -> correção mínima.
      WHY: o celular é o caminho de estudo diário; cada tela com texto espremido/ação escondida custa uso.
      SCOPE: src/styles.css / app.js dessas telas; Estatísticas fica de fora (protegida).
      PROOF: capturas antes/depois + testes de geometria.
      DONE_WHEN: telas revisadas e defeitos materiais corrigidos e provados.
      DEPENDENCIES: TODAYUX-1.
      EVIDENCE: capturas a 375px de Acompanhamento, Disciplinas, Materiais (PDF de 30 páginas, 3 propostas, nome de arquivo longo) e Configurações. Sem defeito em Acompanhamento (cartões legíveis, ações em linha que quebram bem), Disciplinas e Configurações (opções de tema em cartões). DEFEITO MATERIAL em Materiais: NENHUM CSS existia para as propostas — apareciam como itens de lista com marcador, caixa do título com ~190px (cortava o título que o aluno edita: "aula-de-fisiologia-renal-c…") e botões soltos. Correção: propostas viram cartões (lista sem marcador, borda, espaçamento), rótulo de páginas em destaque discreto, caixa do título com a largura do cartão, ações alinhadas. Prova (vermelho antes: marcador "disc", largura < 85%): e2e `large-pdf` TRACKUX-1 mede ausência de marcador, borda de cartão, título >= 85% da largura e sem overflow a 375px. Regressão: source-proposals, aceite de rascunho, fluxo de conteúdo, rascunho grande, product-value, PDF grande, jornada = 14/14.
      PRODUCT_DELTA: o passo de revisar os trechos propostos de um PDF deixa de parecer um esboço: o título editável fica legível e cada proposta é um cartão claro no celular.
      PROOF_OBSERVED: capturas + teste de geometria.
      USER_VALUE: quem envia o material vê e ajusta os títulos antes de gerar rascunho sem esforço.
      NOT_PROVEN: painel de rascunho (já revisado em CQ-4/CQ-7) não foi re-inspecionado; aparelho físico; Estatísticas (protegida) não tocada.
      COMMIT: ver `git log` (fix(materials): proposals as cards on the phone).

- [✓] **INTEGRATE-3 Gate completo e integração no branch canônico (EXAM-7 … TRACKUX-1)** — OWNER: GUI
      SPRINT_GOAL: levar ao branch canônico o que veio depois de 7494e61 (pendências da prova no aparelho, retomada do Estudar agora, Hoje/Plano/Materiais legíveis no celular) com o gate completo verde.
      BEFORE: canônico em 7494e61; o GUI está alguns commits à frente sem gate completo.
      AFTER: ff sem conflitos (CLI pausado, árvore limpa) e unit + server + e2e completos verdes no canônico.
      WHY: entregar onde o produto roda e provar que a soma das sprints não quebrou nada.
      SCOPE: git (ff-only); sem mudança de código.
      PROOF: contagens do gate no worktree canônico (inclui production-build).
      DONE_WHEN: canônico == GUI e gate 100% verde, ou falha classificada e corrigida.
      DEPENDENCIES: TRACKUX-1; CLI pausado.
      EVIDENCE: pré-condições conferidas (CLI.md PAUSED, FILES_IN_FLIGHT=none, worktree canônico só com .impeccable/); `git merge --ff-only claude/content-quality`: 7494e61 -> cd7966e (8 arquivos), sem conflitos. GATE COMPLETO NO CANÔNICO: unit 385/385, server 488/488, e2e 156/156 (inclusive production-build).
      PRODUCT_DELTA: o branch canônico ganha pendências da prova no aparelho, retomada do Estudar agora, Hoje/Plano/Materiais legíveis no celular, com gate 100% verde.
      PROOF_OBSERVED: contagens acima.
      USER_VALUE: o que foi construído roda onde o produto roda, provado.
      NOT_PROVEN: Android/Windows nativos (gate WEB); o CLI ainda precisa reconciliar ao voltar.
      COMMIT: fast-forward para cd7966e.
- [✓] **REVIEWNET-1 Revisão agendada de Hoje com conexão instável** — OWNER: GUI
      SPRINT_GOAL: aplicar o teste de queda de conexão ao fluxo mais usado do produto — concluir uma revisão agendada em Hoje (marcar feita, notas, julgar itens, refazer erros) — e corrigir só divergência real entre o que a tela mostra e o que o servidor tem.
      BEFORE: a mesma falha silenciosa (progresso mostrado que o servidor não tem) apareceu em duas telas (resposta da prova, julgamento do Estudar agora); a revisão de Hoje só foi coberta por "escrita offline falha visível e sem linhas no servidor", não por cenários de queda no meio do fluxo.
      AFTER: cada passo da revisão tem teste de queda com o resultado observado (mensagem, retry sem duplicar, servidor consistente) e, onde a tela e o servidor divergirem, correção mínima.
      WHY: é a tela diária; a divergência silenciosa aqui distorce agenda e histórico todos os dias.
      SCOPE: src/app.js (revisão de Hoje: "Revisão feita", notas, julgar itens, reteste); servidor só se preciso.
      DETAILS: rota abortada por passo (concluir revisão, submit de tentativa de item, reteste); registrar para cada: a tela avançou? o servidor tem? o retry duplica evidência/revisão?
      PROOF: e2e com contagens no servidor; defeitos viram teste vermelho -> menor correção.
      DONE_WHEN: nenhum passo da revisão mostra ao aluno progresso que o servidor não tem, ou a divergência é explicada e repetível.
      DEPENDENCIES: INTEGRATE-3.
      EVIDENCE: MEDIDO em e2e reais (`e2e/resilience.spec.js`, rotas abortadas). "Revisão feita" com conexão caída já era segura (a caixa volta ao estado anterior e aparece "Não foi possível salvar a revisão."). DEFEITO REAL: o julgamento de um item na revisão de Hoje que não chegava ao servidor ficava só na tela; a revisão era concluída com evidência REVIEW 2/1 (certa: a contagem local é o registro principal) mas o item errado NUNCA entrava em "para reforçar" (0 no servidor) — a evidência e o "para reforçar" discordavam em silêncio. CORREÇÃO MÍNIMA: o desfecho pendente do item fica guardado no próprio item (`data-pending-outcome`), a tentativa é iniciada/enviada de novo (`flushPendingAttempt`) e, ao marcar "Revisão feita", todas as pendências são reenviadas ANTES de fechar a revisão; se ainda não houver conexão, a revisão é registrada e o aluno lê "Revisão registrada, mas não consegui marcar N itens como “para reforçar” (sem conexão com o servidor)." Prova (2 e2e, vermelhos antes): conexão volta antes de concluir -> evidência REVIEW 2/1 E 1 item "para reforçar"; conexão ainda caída -> mensagem "não consegui marcar 2 itens". Regressão: resiliência + reteste/Hoje + prática + escritas offline + prioridades + tentativas = 22/22.
      PRODUCT_DELTA: o que a revisão de Hoje diz (evidência) e o que o "para reforçar" mostra deixam de divergir em silêncio quando a rede oscila; quando não dá para reconciliar, o aluno é avisado.
      PROOF_OBSERVED: e2e acima.
      USER_VALUE: os erros de uma revisão feita com rede ruim não somem do reforço.
      NOT_PROVEN: reteste ("Refazer erros") não retenta pendências antes de abrir; reconciliação depois de fechar a aba (o pendente vive na tela); Android/Windows nativos.
      COMMIT: ver `git log` (fix(review): unsent item judgments are retried when the review is completed).
- [✓] **EXPORT-1 O backup do aluno inclui as próprias respostas e tentativas** — OWNER: GUI
      SPRINT_GOAL: a exportação por usuário passa a incluir o que o aluno produziu (tentativas, eventos de aprendizagem, respostas digitadas e correções das provas), além de disciplinas/aulas/revisões/exercícios/evidência — hoje esses dados só existem no banco e nunca saem numa exportação.
      BEFORE: `createLogicalExport` exporta settings, subjects, learningUnits, reviewTasks, exercises, exerciseVersions e learningEvidence; tentativas, eventos, provas (exams/exam_items com a resposta digitada) e a proveniência do rascunho ficam de fora — quem exporta perde o histórico fino e as respostas das provas.
      AFTER: as novas chaves são ADITIVAS (`exerciseAttempts`, `learningEvents`, `exams`, `examItems`, `examEvidence`): nenhuma chave existente muda e o importador as ignora; o texto de ajuda de Configurações diz o que a cópia contém.
      WHY: o aluno é dono do que produziu; um backup que perde as respostas da prova não é um backup do estudo.
      SCOPE: server/src/backup.js (createLogicalExport), texto em Configurações; sem migração; sem mudar o importador.
      DETAILS: só leitura por user_id; incluir apenas colunas do próprio usuário; não incluir sessões/segredos; versão de exportação inalterada (mudança aditiva) com nota no contrato.
      PROOF: teste de servidor (export traz tentativas/eventos/provas com a resposta digitada do próprio usuário e NADA de outro usuário; chaves antigas idênticas) + e2e/HTTP do endpoint; o teste de contrato existente do export continua verde.
      DONE_WHEN: exportação inclui os novos conjuntos sem quebrar contrato nem importador, provado.
      DEPENDENCIES: REVIEWNET-1.
      EVIDENCE: `createLogicalExport` ganhou as chaves ADITIVAS `exerciseAttempts`, `learningEvents`, `exams`, `examItems` (com `student_answer`) e `examEvidence`, sempre filtradas por user_id; chaves existentes e `exportVersion` intactos; sem segredos/sessões. O texto de "Segurança dos dados" em Configurações passou a dizer o que a cópia contém (exercícios, histórico de desempenho, tentativas, respostas das provas). Também `BACKUP_TABLES` (verificação do backup físico) agora conta exercise_attempts, learning_events, exams, exam_items e exam_evidence — uma cópia que perdesse linhas dessas tabelas passa a ser reprovada. Prova: `server/test/backup-contract.test.js` (+1, vermelho antes): usuário A exporta 1 tentativa, eventos, 1 prova com a resposta "MINHA-RESPOSTA-A", 1 vínculo de evidência, e NADA do usuário B ("RESPOSTA-DO-OUTRO-USUARIO" ausente); todas as chaves antigas presentes. Regressão: server 489/489 (inclui contrato do backup, verificação física) + e2e paridade/migração 7/7.
      PRODUCT_DELTA: a exportação do aluno deixa de perder o que ele produziu (tentativas e respostas de provas); a verificação do backup físico passa a cobrir essas tabelas.
      PROOF_OBSERVED: testes acima.
      USER_VALUE: dono dos próprios dados, inclusive das respostas que escreveu.
      NOT_PROVEN: o IMPORTADOR não lê as novas chaves (ignora por desenho; restaurar tentativas/provas por importação é outra sprint); proveniência de rascunhos/fontes (PDFs) não entra na exportação lógica; ensaio de restauração do CLI (rehearseRestore) não foi estendido — anotado para o CLI.
      COMMIT: ver `git log` (feat(export): attempts, events and exam answers in the student's export).
- [!] **IMPORT-1 Restaurar tentativas e respostas de provas a partir do backup do aluno (bloqueada: decisão de produto)** — OWNER: GUI
      SPRINT_GOAL: importar um backup do próprio SmartLearn devolve também tentativas, eventos e provas (com as respostas), não só disciplinas/aulas/exercícios.
      BEFORE: EXPORT-1 exporta esses dados, mas o importador os ignora: exportar e importar em outra instância perde as respostas das provas e o histórico fino.
      AFTER: importação idempotente e segura dos novos conjuntos, remapeando ids, sem duplicar em reimportação e sem tocar dados de outros usuários.
      WHY: um backup que não restaura por completo não protege o estudo.
      SCOPE: server/src/services/imports.js; contrato do import; sem migração.
      DETAILS: PRIMEIRO medir o importador atual (formato aceito — export lógico ou o formato legado local?) e decidir se restaurar tentativas/provas cabe sem risco; se o importador só aceita o formato legado, registrar HUMAN_GATE de produto em vez de improvisar.
      PROOF: teste de servidor export -> import em banco vazio: contagens e respostas iguais; reimportar não duplica; ids remapeados corretamente.
      DONE_WHEN: ida e volta sem perda dos novos conjuntos, provada; ou decisão registrada com o motivo.
      DEPENDENCIES: EXPORT-1.
      EVIDENCE (medição): o importador do servidor (server/src/services/imports.js -> shared/import-normalization.js) só normaliza o export LEGADO do app local (subjects/studies/reviews/exercises); NÃO existe fluxo de importar o export lógico do servidor. A restauração completa hoje é a cópia física por operador (server/scripts/backup.mjs --package|--verify|--rehearse), que já leva todas as tabelas. Criar um "restaurar backup lógico" é uma capacidade nova (contrato, remapeamento de ids, conflitos, idempotência, segurança entre usuários), não um ajuste — fora do que as decisões canônicas já autorizam.
      DECISÃO: bloqueada como HUMAN_GATE de produto ("o aluno precisa restaurar o próprio backup lógico sozinho?"); sem essa decisão nenhuma linha de código é escrita. Nada perdido: a exportação (EXPORT-1) já entrega os dados ao aluno e o backup físico do operador restaura tudo.

- [✓] **REVIEW-1 Revisão de código independente do que foi entregue nesta rodada (2ca64d8..HEAD)** — OWNER: GUI
      SPRINT_GOAL: um revisor que não escreveu o código lê as mudanças de servidor e cliente desta rodada e aponta bugs reais (corretude, segurança entre usuários, perda de dado); cada achado confirmado é corrigido com teste.
      BEFORE: toda a rodada foi verificada por testes escritos por quem implementou; nenhum revisor independente leu o diff (regra do padrão elite: autor != verificador).
      AFTER: achados classificados (confirmado/descartado com motivo); os confirmados viram teste vermelho -> correção mínima.
      WHY: testes do autor não pegam o ponto cego do autor; migrações 023-025, provas, exportação e fluxos de rede mexem em dados do aluno.
      SCOPE: git diff 2ca64d8..HEAD em server/src, server/migrations, src/app.js, src/remote-store.js (leitura); correções onde confirmado.
      PROOF: relatório do revisor + para cada achado confirmado um teste que falha antes e passa depois.
      DONE_WHEN: achados triados; confirmados corrigidos e provados; nenhum achado sem decisão.
      DEPENDENCIES: EXPORT-1.
      EVIDENCE: revisor independente (agente caveman:cavecrew-reviewer, somente leitura, diff 2ca64d8..HEAD de server/src, migrações, src/app.js, src/remote-store.js). 4 achados TRIADOS por mim lendo o código: (1) "migração 025 não idempotente — use ADD COLUMN IF NOT EXISTS": DESCARTADO — SQLite NÃO tem `ADD COLUMN IF NOT EXISTS` (a correção sugerida seria erro de sintaxe), o executor aplica cada versão UMA vez (schema_migrations com checksum) e a 023 usa o mesmo padrão; o arquivo tem 21 linhas (a linha citada não existe). (2) "maxPagesPerChunk sem limite (DoS)": PARCIALMENTE CONFIRMADO como endurecimento — não havia exaustão (o teto de caracteres e o número de páginas limitam o trabalho, e é usuário autenticado sobre a própria fonte), mas o esquema aceitava 0/negativos/gigantes; CORRIGIDO: `minimum: 1, maximum: 100`. (3) "INNER JOIN em exams.itemRows perde itens de exercício apagado": DESCARTADO — nenhum caminho apaga exercícios ou aulas (nenhum DELETE em server/src), `foreign_keys = ON` e `exam_items` referencia exercises: um delete falharia; exercícios são arquivados, não removidos. (4) "UPDATE ... WHERE status=SUBMITTED redundante": não é defeito (guarda contra corrida). O revisor CONFIRMOU sem achados: filtro por user_id em exams/exercise-review/evidence/backup, nenhum gabarito/explicação/dica em prova IN_PROGRESS, exportação aditiva, fluxo de pendências/retomada. LACUNA que eu mesmo achei ao triar: o contrato de corpo de POST /v1/exams (exatamente um de unitId/subjectId) só era exercitado pelo serviço, nunca pelo fio. Prova: `server/test/http-round-validation.test.js` (vermelho antes para o limite: 404 em vez de 400): sem chave -> 400, ambas -> 400, subjectId -> 201 com scope SUBJECT, unitId clássico continua 201; maxPagesPerChunk 0/-3/101 -> 400. Regressão: server 490/490.
      PRODUCT_DELTA: nenhum bug de dado do aluno achado pela revisão independente; dois contratos de entrada passaram a ser garantidos e testados no fio.
      PROOF_OBSERVED: teste acima + triagem documentada.
      USER_VALUE: confiança de que a rodada foi lida por alguém que não a escreveu.
      NOT_PROVEN: o revisor foi um agente de custo baixo com no máximo ~40 leituras: não substitui uma revisão humana nem cobriu todo src/app.js linha a linha; nada de leitor de tela/aparelho.
      COMMIT: ver `git log` (test(review): wire contracts for exams body and chunk size).
- [✓] **INTEGRATE-4 Gate completo e integração no branch canônico (REVIEWNET-1 … REVIEW-1)** — OWNER: GUI
      SPRINT_GOAL: levar ao canônico o que veio depois de cd7966e (revisão de Hoje com rede instável, exportação do aluno, contratos de entrada, verificação do backup) com o gate completo verde.
      BEFORE: canônico em cd7966e; o GUI está alguns commits à frente sem gate completo.
      AFTER: ff sem conflitos (CLI pausado, árvore limpa) e unit + server + e2e completos verdes no canônico.
      WHY: entregar onde o produto roda e provar que a soma não quebrou nada.
      SCOPE: git (ff-only); sem mudança de código.
      PROOF: contagens do gate no canônico (inclui production-build).
      DONE_WHEN: canônico == GUI e gate 100% verde, ou falha classificada e corrigida.
      DEPENDENCIES: REVIEW-1; CLI pausado.
      EVIDENCE: ff de cd7966e para 9066d93 (canônico == GUI), CLI pausado e árvore limpa. GATE NO CANÔNICO: unit 385/385, server 490/490, e2e 157 passaram + 1 falha em `product-value.spec.js:80` (timeout de 30 s esperando `#account-show-register` ficar visível no login do helper; NÃO chegou a rodar o produto). CLASSIFICAÇÃO: flaky de harness, não regressão — o mesmo spec passa 8/8 isolado no canônico (--repeat-each=4), e é a 2ª vez em ~6 gates completos que ele falha, cada vez por causa diferente (1ª: leitura única de data-attempt-id, já corrigida; 2ª: helper de login sem esperar a tela de conta). Nenhum produto tocado. Ação pendente de baixo custo: endurecer o helper de login desse spec (esperar #account-login-form visível antes de clicar).
      PRODUCT_DELTA: o canônico contém tudo até REVIEW-1 (revisão de Hoje com rede instável, exportação do aluno, contratos de entrada).
      PROOF_OBSERVED: contagens acima.
      NOT_PROVEN: Android/Windows nativos; o CLI ainda precisa reconciliar.
      COMMIT: fast-forward para 9066d93.
- [✓] **TESTLIVE-1 Painel mostra "TESTES AO VIVO" a partir do runner real (PASS/FAIL/STALE ligados ao HEAD)** — OWNER: GUI
      SPRINT_GOAL: toda validação material fica observável pelo usuário no painel existente (conductor/.view/tasklist.html), com a verdade vinda do runner — nunca da narrativa do agente.
      BEFORE: os resultados de teste só aparecem no chat (texto do agente); o usuário não vê progresso, PASS/FAIL nem se o resultado é do commit atual.
      AFTER: seção compacta "TESTES AO VIVO" com HEAD testado x atual, suíte, comando, PID vivo, RUNNING/PASS/FAIL/ABORTED/STALE, total/concluídos/passed/failed/skipped, duração, último teste, última atualização, exit code e caminho do log bruto; STALE inequívoco se HEAD testado != atual; processo morto nunca fica RUNNING.
      WHY: evidência real > narrativa do agente; o usuário precisa ver o estado dos testes sem confiar em quem os roda.
      SCOPE: scripts (runner wrapper + gerador do painel); NÃO altera o produto; sem dependência pesada.
      DETAILS: wrapper `scripts/test-live.mjs <suite>` executa o comando real (unit: node --test com reporter; server: idem; e2e: playwright --reporter=json/list) e grava, de forma atômica (tmp+rename), um artefato JSON determinístico (headTested, cmd, pid, state, counts, exit code, log bruto preservado); o gerador do painel lê o artefato e compara com o HEAD atual e com a vivacidade do PID. Proibido o agente escrever status à mão.
      PROOF: 4 execuções reais: PASS; FAIL controlado (teste temporário que falha); término anormal (kill do processo) -> ABORTED; resultado antigo com HEAD novo -> STALE; painel + artefato + exit code concordam em cada uma.
      DONE_WHEN: painel, artefato estruturado e processo/exit code concordam nas 4 execuções; testes materiais passam a usar o wrapper.
      DEPENDENCIES: INTEGRATE-4.
      EVIDENCE: `scripts/test-live.mjs <unit|server|e2e>` roda o comando real do projeto (sem shell), grava `conductor/.view/test-live/<suite>.json` de forma atômica (HEAD testado, cmd, pid do runner e do filho, contagens lidas da saída do próprio runner — resumo final do node --test/playwright é autoritativo —, exit code, log bruto) com heartbeat de 1 s; `agent-tasklist.mjs` deriva o estado mostrado a partir de artefato + HEAD atual + vivacidade do pid (por worktree) e o wrapper re-renderiza o painel a cada ~4 s. 4 EXECUÇÕES REAIS, painel = artefato = exit code: (1) PASS unit 390/390 exit 0; (2) FAIL controlado (teste temporário removido depois): 391 feitos, 390 ok, 1 falha, wrapper exit 1; (3) ABORTED: wrapper morto com Stop-Process -Force durante execução -> artefato ficou RUNNING, painel/status mostram ABORTED ("processo do runner não existe mais"), nunca RUNNING; (4) STALE: após commit d09b9cc as três suítes (HEAD testado 4495d13) passaram a STALE ("HEAD testado ≠ atual"), e voltaram a PASS ao rodar no HEAD novo (unit 391/391, server 490/490). e2e parcial real (21 testes) confirmou o parser do playwright (21/21). ACHADO AO PROVAR: meu glob do server (test/*.test.js) contava 489 vs 490 da descoberta padrão (`npm test` = `node --test`) — um teste ficaria de fora e o painel mostraria PASS a menos; suíte server agora usa exatamente `node --test` e um teste (test/test-live.test.js) trava SUITES == scripts do package.json. Testes: test/test-live.test.js (6). Produto intocado.
      PRODUCT_DELTA: nenhum no produto; o desenvolvimento passa a ter evidência de teste observável e não forjável no painel.
      PROOF_OBSERVED: as 4 execuções acima + status via `node scripts/test-live.mjs status`.
      USER_VALUE: o usuário vê PASS/FAIL/STALE/ABORTED reais e o HEAD a que se referem, sem confiar no relato do agente.
      NOT_PROVEN: caminho SIGINT/SIGTERM gracioso do wrapper (no Windows só o kill forçado foi exercido); e2e completo (158) via wrapper ainda não rodado; a página só reflete quem está vivo quando o painel é re-renderizado (--watch ou o próprio wrapper) — sem isso o heartbeat no navegador mostra "SEM SINAL" após 15 s.
      COMMIT: d09b9cc.
- [✓] **FLAKE-1 Endurecer o login do product-value.spec (flaky classificado em INTEGRATE-4)** — OWNER: GUI
      SPRINT_GOAL: eliminar a 2ª falha intermitente do gate completo (`product-value.spec.js:80`: `#account-show-register` não fica visível em 30 s), sem tocar o produto.
      BEFORE: o helper clica em Conta logo após networkidle e espera o botão para sempre; falhou 1 vez em ~6 gates, passa 8/8 isolado.
      AFTER: o helper repete o clique de navegação até a tela de Conta aparecer (toPass), e o spec passa repetido sem falha.
      WHY: um gate que falha por acaso ensina a ignorar falhas.
      SCOPE: e2e/product-value.spec.js (helper registerAndLogin) somente.
      PROOF: `node scripts/test-live.mjs e2e e2e/product-value.spec.js --repeat-each=8` verde; painel mostra o resultado.
      DONE_WHEN: repetido 8x sem falha e a mudança é só de espera (nenhuma asserção enfraquecida).
      DEPENDENCIES: TESTLIVE-1.
      EVIDENCE: no helper `registerAndLogin`, o clique em Conta agora é repetido até `#account-show-register` aparecer (`expect(...).toPass`, 20 s; a asserção é a mesma, só a espera muda). `node scripts/test-live.mjs e2e e2e/product-value.spec.js --repeat-each=8`: 16/16 passaram (2 testes x 8), exit 0, HEAD d09b9cc, visto no painel.
      PRODUCT_DELTA: nenhum no produto; um gate a menos que falha por acaso.
      PROOF_OBSERVED: 16/16 acima.
      NOT_PROVEN: a falha original nunca foi reproduzida (1 ocorrência em ~6 gates), então isto é endurecimento da causa mais provável (clique antes de a navegação estar ligada), não cura provada; só o histórico dos próximos gates confirma.
      COMMIT: ver `git log` (test(e2e): retry account navigation in product-value login helper).
- [✓] **INTEGRATE-5 Gate completo pelo painel e integração no branch canônico (INTEGRATE-4 … FLAKE-1)** — OWNER: GUI
      SPRINT_GOAL: levar ao canônico o que veio depois de 9066d93 (painel de testes ao vivo, helper de login endurecido) e provar o gate completo pelo wrapper, visível no painel.
      BEFORE: canônico em 9066d93; o GUI está 3 commits à frente.
      AFTER: ff sem conflitos (CLI pausado, árvore limpa) e unit + server + e2e completos, rodados com scripts/test-live.mjs no canônico, PASS no HEAD atual.
      WHY: entregar onde o produto roda e provar que a soma não quebrou nada, com evidência do runner.
      SCOPE: git (ff-only); sem mudança de código.
      PROOF: `node scripts/test-live.mjs status` no canônico com as 3 suítes PASS e HEAD == atual (inclui production-build).
      DONE_WHEN: canônico == GUI e gate 100% verde, ou falha classificada e corrigida.
      DEPENDENCIES: FLAKE-1; CLI pausado.
      EVIDENCE: pré-condições conferidas (CLI.md PAUSED, FILES_IN_FLIGHT=none, canônico só com .impeccable/); `git merge --ff-only claude/content-quality`: 9066d93 -> 490bf20, sem conflitos. GATE COMPLETO NO CANÔNICO, rodado pelo wrapper e visto no painel, HEAD testado 490bf20: unit 391/391 exit 0, server 490/490 exit 0, e2e 158/158 exit 0 (12,2 min, inclusive production-build e product-value). O commit docs que fecha esta tarefa vem depois de 490bf20 (só plan.md/tracks.md), então o painel os mostrará STALE até o próximo gate — esperado.
      PRODUCT_DELTA: o canônico contém o painel de testes ao vivo e o helper de login endurecido; gate 100% verde, agora com evidência do runner.
      PROOF_OBSERVED: contagens acima.
      NOT_PROVEN: Android/Windows nativos (gate WEB); o CLI ainda precisa reconciliar ao voltar.
      COMMIT: fast-forward para 490bf20.
- [✓] **NEXT-2 Selecionar automaticamente a próxima sprint produtiva** — OWNER: GUI
      SPRINT_GOAL: decidir e abrir a próxima melhoria de maior valor (ganho x confiança / custo), já que VERDICT-1, IMPORT-1 (decisão de produto) e REALMODEL-1 (chave) estão bloqueadas.
      DETAILS: consultar NOT_PROVEN acumulados, experiência atual do aluno, CLI.md/GUI.md; não escolher trabalho cosmético/arquitetural havendo ganho de produto maior; se nada de ganho claro sobrar sem decisão humana, dizer isso em vez de inventar tarefa.
      DONE_WHEN: uma sprint concreta aberta com SPRINT_GOAL/BEFORE/AFTER/PROOF, ou a lista de decisões humanas pendentes apresentada ao usuário.
      DEPENDENCIES: INTEGRATE-5.
      EVIDENCE: candidatos lidos dos NOT_PROVEN acumulados, sem depender de VERDICT-1/IMPORT-1/REALMODEL-1: (A) "Refazer erros" da revisão de Hoje não reenvia o julgamento pendente antes de abrir o reteste — mesma classe de divergência silenciosa já corrigida 3x (EXAM-6, STUDYRESUME-1, REVIEWNET-1), NOT_PROVEN explícito de REVIEWNET-1, custo baixo, confiança alta => ESCOLHIDA; (B) auditoria só-teclado de Estudar agora/Materiais: ganho médio, custo médio; (C) OCR de PDF escaneado: ganho alto, custo alto, sem provedor decidido; (D) reteste retomável após fechar a aba: ganho baixo. Sprint aberta: RETEST-1.
      PRODUCT_DELTA: próxima sprint definida (RETEST-1).
- [✓] **RETEST-1 "Refazer erros" da revisão de Hoje reenvia o que ficou pendente antes de abrir** — OWNER: GUI
      SPRINT_GOAL: garantir que quando o aluno erra um item da revisão de Hoje sem conexão e toca "Refazer erros", o erro original chega ao servidor (vira "para reforçar") antes do reteste começar.
      BEFORE: o julgamento pendente só é reenviado ao concluir a revisão (REVIEWNET-1); "Refazer erros" abre o reteste sem tentar, então o reteste pode registrar correção de um erro que o servidor nunca soube que aconteceu.
      AFTER: ao tocar "Refazer erros", os pendentes do bloco são reenviados primeiro; se ainda falharem, o reteste abre mesmo assim (não bloqueia o estudo) e o aluno é avisado.
      WHY: mesma divergência silenciosa entre o que a tela mostra e o que o servidor tem, no fluxo diário.
      SCOPE: src/app.js (handler retest-block) + e2e/resilience.spec.js.
      PROOF: e2e vermelho antes: item errado com rota de submit abortada -> conexão volta -> "Refazer erros" -> `/v1/reinforcement` deve listar o item já ao abrir o reteste; outro cenário: rede ainda fora -> reteste abre e há aviso.
      DONE_WHEN: os dois cenários verdes e o resto de resilience.spec.js verde.
      DEPENDENCIES: NEXT-2.
      EVIDENCE: vermelho antes (e2e via wrapper: reforço 0 em vez de 1 ao abrir o reteste; aviso ausente). Correção em src/app.js (handler retest-block agora async): `flushPendingAttempts(section)` antes de abrir o reteste; se ainda falhar o reteste abre mesmo assim e #study-now-message avisa "Não consegui marcar N item(ns) como para reforçar…". e2e/resilience.spec.js +2 (RETEST-1): 11/11; regressão dos specs com reteste (hoje-block-retest, plan-study-now, priorities-hoje, student-journey, exam-mode) 19/19; unit 391/391. Tudo pelo wrapper, HEAD c4a0884 + árvore com a mudança (o resultado vira STALE ao commitar; o gate completo fica para INTEGRATE-6).
      PRODUCT_DELTA: o reteste de Hoje só começa depois de o erro original ter chegado ao servidor, ou o aluno é avisado de que não chegou.
      PROOF_OBSERVED: contagens acima.
      NOT_PROVEN: reteste do Estudar agora (fora da revisão de Hoje) não foi exercido neste cenário; Android/Windows nativos.
      COMMIT: ver `git log` (fix(review): "Refazer erros" resends pending item judgments first (RETEST-1)).
- [✓] **ACCESS-2 Estudar agora e Materiais só com teclado, e leitor de tela** — OWNER: GUI
      SPRINT_GOAL: repetir para Estudar agora e Materiais a auditoria só-teclado feita para a prova (ACCESS-1) e corrigir só o que impedir concluir o fluxo.
      BEFORE: ACCESS-1 cobriu a prova; NOT_PROVEN registra que Estudar agora e Materiais não passaram pela mesma auditoria.
      AFTER: cada fluxo (estudar uma questão, revelar, julgar, ver erros; subir material, revisar rascunho, aceitar) é concluído só com teclado, com foco visível e nomes acessíveis medidos.
      WHY: um aluno que não usa mouse (ou usa leitor de tela) precisa poder estudar.
      SCOPE: e2e novo de teclado + a menor correção em src/app.js / index.html / styles.css.
      PROOF: e2e que percorre os dois fluxos com Tab/Enter/Space e mede foco e nomes; defeitos viram teste vermelho -> menor correção.
      DONE_WHEN: os dois fluxos completos só com teclado e verdes.
      DEPENDENCIES: RETEST-1.
      EVIDENCE: e2e/keyboard-study-materials.spec.js (3 testes, só Tab/Shift+Tab/Enter, foco e anel medidos), VERMELHO sem a correção (3/3) e verde com ela. DEFEITOS REAIS achados e corrigidos (src/app.js, index.html): Estudar agora — (1) ao iniciar, o foco ficava no container da página e Enter não fazia nada (agora vai para "Ver resposta"); (2) "Continuar de onde parei"/"Recomeçar" escondiam o botão pressionado e o foco caía no body (agora vai para a pergunta); (3) o botão em foco não dizia a pergunta nem o progresso, e Acertei/Errei não diziam a resposta (aria-describedby, como na prova). Materiais — (4) "Gerar rascunho", "Salvar correções" e "Aceitar" se desabilitavam com foco e o foco caía no body (agora: rascunho gerado/salvo -> foco no painel do rascunho, que ganhou tabindex -1 + role group + nome; falha -> volta ao botão; aceito -> foco em "Estudar agora", que funciona com Enter); (5) mensagens de erro de aceitar/salvar não eram anunciadas (role=status). Sem defeito: ordem de foco do rascunho (o Aceitar é alcançável por Tab com anel visível, nenhuma parada cai fora da página), foco do resultado (título) e "Refazer erros". Regressão: 27/27 e2e (draft-acceptance, study-now-flow, plan-study-now, large-draft-review, source-proposals, content-quality-flow, student-journey, resilience...), unit 391/391.
      PRODUCT_DELTA: o aluno que usa só teclado (ou leitor de tela) consegue estudar uma aula e subir/revisar/aceitar um material sem perder o foco nem o contexto.
      PROOF_OBSERVED: contagens acima; vermelho/verde do teste novo.
      NOT_PROVEN: leitor de tela real (só atributos e nomes calculados); seletor de arquivo do SO; segmentos do campo de data nativo não têm anel próprio (padrão do navegador); Materiais não-remoto/mobile por teclado; propostas de trecho (renomear/ocultar) não foram varridas.
      COMMIT: ver `git log` (fix(a11y): keyboard focus in Estudar agora and Materiais (ACCESS-2)).
- [✓] **INTEGRATE-6 Gate completo pelo painel e integração no branch canônico (INTEGRATE-5 … ACCESS-2)** — OWNER: GUI
      SPRINT_GOAL: levar ao canônico RETEST-1 e ACCESS-2 com o gate completo rodado pelo mecanismo TESTES AO VIVO no HEAD que será integrado.
      BEFORE: canônico em c4a0884; o GUI está 2 commits de código à frente (+ docs).
      AFTER: ff sem conflitos (CLI pausado, árvore limpa), gate completo PASS no HEAD canônico, sem STALE.
      WHY: manter a divergência pequena e a evidência atual.
      SCOPE: git (ff-only); sem mudança de código.
      PROOF: `node scripts/test-live.mjs status` no canônico com unit/server/e2e PASS e HEAD == atual.
      DONE_WHEN: canônico == GUI e gate 100% verde, ou falha classificada e corrigida.
      DEPENDENCIES: ACCESS-2; CLI pausado.
      EVIDENCE: gate completo pelo wrapper no worktree GUI ANTES de integrar (e2e com CI=1 só para pular o guard de branch do production-build, que é reexecutado no canônico). Rodada 1 (1f730ca): e2e 161/163 — 2 falhas caracterizadas: (a) large-pdf: REGRESSÃO MINHA da ACCESS-2 — devolver o foco ao botão de gerar, ao falhar, rolava a página e tirava a mensagem de erro da viewport; corrigido com focus({ preventScroll: true }) nos 4 refocos de falha; (b) keyboard-study-materials "retomada": corrida do MEU helper (decidia "expandir?" antes de o Plano renderizar e fechava a linha aberta); helper corrigido. Rodada 2 (a115864): unit 392, server 490, e2e 162/163 — falha em exam-mode UX-1 (intermitente, código intocado): reproduzido 1/8 isolado -> causa: leitura de aria-expanded antes do re-render do Plano -> teste espera as 3 ações; 16/16 depois. Rodada 3 (93a6185, código idêntico ao a115864 + só o teste): unit 392/392, server 490/490, e2e 163/163, exit 0. Ferramenta: o painel agora mantém um resultado válido quando os commits seguintes só tocam conductor/ (docs), sem afrouxar o STALE para qualquer arquivo de código (teste em test/test-live.test.js).
      PRODUCT_DELTA: RETEST-1 e ACCESS-2 chegam ao canônico com o gate verde e sem regressão de mensagem de erro.
      PROOF_OBSERVED: contagens acima (rodada 3) + vermelho->verde de cada falha.
      NOT_PROVEN: Android/Windows nativos; UX-1 pode ter uma raiz de produto (Plano recolher a linha ao re-renderizar) — só a espera do teste foi endurecida; o CLI ainda precisa reconciliar.
      COMMIT: fast-forward para o HEAD deste commit de docs.
- [✓] **NEXT-3 Selecionar automaticamente a próxima sprint produtiva** — OWNER: GUI
      SPRINT_GOAL: decidir e abrir a próxima melhoria de maior valor (ganho x confiança / custo) depois da verificação no canônico.
      DETAILS: NOT_PROVEN acumulados (ex.: raiz de produto do UX-1, propostas de trecho por teclado, reteste do Estudar agora sob falha de rede), experiência atual do aluno; não escolher trabalho cosmético/arquitetural havendo ganho de produto maior.
      DONE_WHEN: sprint concreta aberta com SPRINT_GOAL/BEFORE/AFTER/PROOF.
      DEPENDENCIES: INTEGRATE-6.
      EVIDENCE: candidatos (ganho x confiança / custo, sem depender de decisão humana): (A) páginas SEM texto de um PDF misto (slides com figura/escaneadas) são descartadas em silêncio — a UI só trata o caso "PDF inteiro é imagem" (frase sem próximo passo) e não há nenhuma menção a páginas puladas: o aluno não sabe que parte do material não virou trecho, o que mina a confiança no resumo -> ganho médio-alto, confiança alta, custo baixo => ESCOLHIDA; (B) propostas de trecho por teclado: ganho baixo-médio; (C) raiz de produto do UX-1: ganho baixo. Sprint aberta: SCANNED-1.
      PRODUCT_DELTA: próxima sprint definida (SCANNED-1).
- [>] **SCANNED-1 O aluno sabe quais páginas do PDF não entraram e o que fazer** — OWNER: GUI
      SPRINT_GOAL: quando um PDF tem páginas sem texto extraível (escaneadas/figuras), a tela de Materiais diz quantas e quais páginas ficaram de fora e dá um próximo passo; para PDF inteiro em imagem, a mensagem deixa de ser um beco sem saída.
      BEFORE: só o caso "PDF inteiro é imagem" tem mensagem (sem próximo passo); em PDF misto as páginas sem texto somem sem aviso.
      AFTER: após a extração, a mensagem lista "N página(s) sem texto extraível (p. X, Y) não entram nos trechos"; PDF só de imagem diz o que fazer (usar versão com texto selecionável ou criar a aula à mão).
      WHY: cobertura silenciosa de material médico é risco pedagógico; o aluno precisa saber o que o resumo NÃO cobre.
      SCOPE: server (se preciso expor as páginas vazias na resposta de extração) + src/app.js (mensagem) + teste.
      DETAILS: medir primeiro com um PDF de 3 páginas (2 com texto, 1 vazia): o que a API devolve e o que a UI mostra; qualquer defeito vira teste vermelho -> menor correção; sem OCR.
      PROOF: e2e com PDF misto e PDF só de imagem; mensagem observada.
      DONE_WHEN: PDF misto mostra as páginas puladas; PDF de imagem mostra próximo passo; regressão de Materiais verde.
      DEPENDENCIES: NEXT-3.

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
