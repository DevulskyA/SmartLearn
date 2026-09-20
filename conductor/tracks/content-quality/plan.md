# TRACK: CONTENT-QUALITY — Conteúdo médico confiável e didático

> Ledger MACRO de marcos (GOV-2 opção A: execução de tarefa = skill `tlc-spec-driven-strict`). Chat/UI = projeções deste arquivo.
> Hierarquia: Constitution = intenção · GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Worktree isolado: `.claude/worktrees/content-quality`, branch `claude/content-quality` (base 933cb7e). Outro agente escreve em
> `smartlearn-v1-complete` (T45, plano antigo = histórico/paralelo, NÃO prioridade). Reconciliar as branches só com estado estável.

```
Track:    content-quality                      Status: IN_PROGRESS
MARCO ATUAL: desenvolvimento contínuo por sprints produtivas (CQ-1..7, GUI-01..05 = EXAM-1..3, AUTHOR-1, EXAM-4/5, UX-1, ATTEMPT-1, INTEGRATE-1 concluídos; FIRSTRUN-1 ativa)
Iniciado: 2026-09-19
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: FIRSTRUN-1 (GUI). Uma ativa POR AGENTE é válido (CLI publica a dele em CLI.md).
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
- [>] **FIRSTRUN-1 Primeira vez do aluno: telas vazias levam a uma ação (desktop + 375px)** — OWNER: GUI
      SPRINT_GOAL: uma conta nova, sem nada cadastrado, vê em Hoje/Plano/Estatísticas/Materiais/Disciplinas estados vazios que dizem o que fazer a seguir, sem beco sem saída.
      BEFORE: a jornada foi provada de ponta a ponta com dados criados no caminho, mas ninguém inspecionou o que a conta vazia mostra em cada tela.
      AFTER: capturas revisadas de cada tela vazia; cada beco sem saída ou texto confuso achado vira teste vermelho e a menor correção.
      WHY: a primeira impressão decide se o aluno continua; uma tela vazia sem próximo passo é o pior ponto de abandono.
      SCOPE: estados vazios (src/app.js, index.html); sem redesign de superfície protegida (Estatísticas só ganha texto/ação se faltar).
      PROOF: capturas 1280/375 por tela + e2e que segue o primeiro passo sugerido de cada tela vazia até a tela seguinte.
      DONE_WHEN: nenhuma tela vazia sem saída clara; defeitos materiais corrigidos e provados.
      DEPENDENCIES: INTEGRATE-1.

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
