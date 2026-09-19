# TRACK: CONTENT-QUALITY — Conteúdo médico confiável e didático

> Ledger MACRO de marcos (GOV-2 opção A: execução de tarefa = skill `tlc-spec-driven-strict`). Chat/UI = projeções deste arquivo.
> Hierarquia: Constitution = intenção · GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Worktree isolado: `.claude/worktrees/content-quality`, branch `claude/content-quality` (base 933cb7e). Outro agente escreve em
> `smartlearn-v1-complete` (T45, plano antigo = histórico/paralelo, NÃO prioridade). Reconciliar as branches só com estado estável.

```
Track:    content-quality                      Status: IN_PROGRESS
MARCO ATUAL: Content quality — Resumo Mestre → questões → respostas → feedback fiéis à fonte
Iniciado: 2026-09-19
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: CQ-4
```

## Tarefas

- [✓] **CQ-1 Caracterizar o pipeline real e provar lacunas** — pipeline lido do código e lacunas PROVADAS executando rascunhos fabricados contra `validateDraft` (evidência abaixo).
- [✓] **CQ-2 Garantir qualidade/proveniência do Resumo Mestre** — commit 0f2aad8. Pipeline: 1 geração -> triagem DETERMINÍSTICA (valor sem suporte, termo ausente da fonte, conceito central omitido, resumo raso) -> só com provider real: 1 auditoria independente por modelo + no máximo 1 reparo dirigido -> revalida (`draft-schema`) -> triagem de novo; achados (`issue/severity/scope/generatedClaim/sourceEvidence/repair`) gravados no rascunho; permanece DRAFT; falha do modelo degrada p/ triagem, nunca derruba o rascunho; SEM IA em runtime. Proveniência do resumo: `summarySourceSpans` (quarentena de página inválida; sem spans = faixa inteira da proposta) congelada no aceite em `unit_summary_citations` (mig 022) + `GET /v1/learning-units/:id/summary-sources`; a revisão mostra a fonte ao lado do resumo/questões e os achados; Plano e Study Now mostram "Origem do resumo". Prova: `server/test/draft-audit.test.js` (8), `draft-audit-model.test.js` (10: 3 chamadas no máximo, contradição semântica só por modelo, reparo inválido rejeitado, modelo fora do ar), `accept-draft.test.js` (+2: fonte congelada, owner-scoped, manual = vazio), e2e `draft-acceptance` (3: fonte visível/verificável, achado de omissão exibido, aceite segue humano). server 413/413, unit 370/370. LIMITES HONESTOS: a triagem determinística é de alto recall/baixa precisão (aviso, não veredito); contradição/mecanismo errado só um modelo ou humano vê; qualidade de um modelo REAL não foi exercida (sem chave aqui) = NOT_PROVEN.
- [✓] **CQ-3 Garantir qualidade das questões, respostas e feedback** — a resposta agora é o gabarito CONCISO e o `explanation` (novo, opcional; mig 023 `exercise_versions.explanation`, imutável por versão, carregado adiante numa edição) ensina o porquê usando só a(s) página(s) citada(s); `questionType` opcional (RECALL/CONCEPT/MECHANISM/APPLICATION/DISCRIMINATION/CLINICAL_REASONING/TRANSFER, rótulo ignorado se fora do menu). Prompt v3: uma resposta defensável, sem entregar a resposta, sem cópia longa, sem fato fora da página citada, alvos REVALIDA/provas da faculdade/exames no Paraguai como ORIENTAÇÃO editorial (nunca pesos oficiais inventados). Triagem determinística por questão (escopo `question:N`): resposta rasa (HIGH), sem explicação, resposta/dica que entrega a resposta (HIGH), valor fora da página CITADA (HIGH), termo ausente da página citada, pouco apoio lexical, duplicada, cópia literal (LOW/aviso); auditoria por modelo cobre ambiguidade, detalhe irrelevante, contradição, exigência cognitiva (só com provider real; 1 auditoria + no máx. 1 reparo). Feedback: "Por quê" no Study Now (após revelar), no cartão de erros e na revelação da Hoje; revisão do rascunho mostra tipo, explicação e achados por questão. Estudo vs prova: MODO PROVA NÃO EXISTE no produto (nada a violar; N/A); estudo = revelar resposta e feedback imediato, intacto. Alternativas/distratores: N/A (questões abertas, autojulgadas). Reteste/evidência intactos (nenhuma linha de evidência nova; testes de Analytics/attempts verdes). Prova: `draft-audit-questions.test.js` (8), `draft-audit-model.test.js` (10, prompts fixados), `exercise-explanation.test.js` (3), e2e `exercise-explanation` (1) + `draft-acceptance` (3) + `plan-study-now`/`study-now-flow`. server 424/424, unit 370/370. NOT_PROVEN: nota de qualidade de um modelo real; ambiguidade/mais de uma resposta defensável só é julgada por modelo/humano.
- [>] **CQ-4 Validar o fluxo completo sobre material médico** — PDF fixture médico → unidade → resumo → aceite → questões → estudo → feedback → evidência.
- [ ] **CQ-5 Fechar o marco com regressão e uso real representativo** — full unit/server/e2e com progresso; mobile 375.

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

## Adiados / paralelos

- T45 "prioridades explicáveis" (plano antigo): trabalho de outro agente em `smartlearn-v1-complete` (`server/test/priorities.test.js`, não commitado). Preservado, classificado como histórico/paralelo.
- Pendência de produto (Analytics): veredito agregado conta disciplinas com peso igual.
