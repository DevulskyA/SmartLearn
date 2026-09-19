# TRACK: CONTENT-QUALITY — Conteúdo médico confiável e didático

> Ledger MACRO de marcos (GOV-2 opção A: execução de tarefa = skill `tlc-spec-driven-strict`). Chat/UI = projeções deste arquivo.
> Hierarquia: Constitution = intenção · GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Worktree isolado: `.claude/worktrees/content-quality`, branch `claude/content-quality` (base 933cb7e). Outro agente escreve em
> `smartlearn-v1-complete` (T45, plano antigo = histórico/paralelo, NÃO prioridade). Reconciliar as branches só com estado estável.

```
Track:    content-quality                      Status: DONE
MARCO ATUAL: Content quality — FECHADO (CQ-1..CQ-6; sem tarefa ativa)
Iniciado: 2026-09-19
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: nenhuma (track fechado)
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
