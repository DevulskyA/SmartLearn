# TRACK: V1-VALIDATION — H0 do SMARTLEARN_PRODUCT_EVOLUTION_V3

> Ledger MACRO do horizonte H0 (GOV-2 opção A). Plano mestre: `.specs/governance/SMARTLEARN_PRODUCT_EVOLUTION_V3.md`. Só o H0 é executável;
> H1-H6 ficam no plano mestre como horizontes com gate. Execução de tarefa = skill `tlc-spec-driven-strict` (menor slice + prova). Evidência > narrativa.
> NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE. Estados mantidos separados: IMPLEMENTATION_COMPLETE != V1_VALIDATED != PRODUCTION_RELEASED.

```
Track:    v1-validation                        Status: ACTIVE
MARCO ATUAL: VALID-2 — fechar as falhas de qualidade de conteúdo observadas no canário do Codex
Iniciado: 2026-10-03
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: VALID-2
```

## Tarefas

- [✓] **VALID-1 Reconciliar a realidade atual (H0.1)** — OWNER: GUI
      EVIDENCE (2026-10-03, Git real): CURRENT_BRANCH=claude/smartlearn-v1-complete · CURRENT_HEAD=7b54c25 (código do CODEX = db49a7c) · WORKTREE_STATUS=arquivos modificados + 1 teste novo, TODOS trabalho em andamento do VALID-2 (server/src/ai/{draft-audit,draft-audit-model,draft-prompt}.js, services/generated-drafts.js, 3 testes ajustados, server/test/draft-quality-hardening.test.js), sem commit; `.impeccable/` e `.specs/benchmarks/` untracked pré-existentes · CURRENT_ACTIVE_TRACK=nenhum (product-closure DONE) · CODEX_PROVIDER_STATE=PROVEN (commitado) · REALMODEL_STATE=pipeline provado com fonte sintética; qualidade em fonte médica REAL = OPEN · FULL_REGRESSION_STATE=OPEN após o CODEX (em db49a7c: unit 417/417, servidor 703/703, lint 22 avisos (=), inventário 154, e2e do spec novo; e2e COMPLETO não rodado) · KNOWN_PRODUCT_GAPS=4 defeitos observados (explicação circular, dica que entrega a resposta, cópia literal, qualificador perdido), prova com PDF real, consistência entre gerações, jornada integrada com CODEX · KNOWN_BLOCKERS=nenhum PDF médico autorizado dentro do projeto (varredura só no worktree) -> HUMAN_GATE só para o caminho absoluto de 1 PDF (VALID-4); deploy T51, push do PR #6 e merge em main são humanos.
      CLASSIFICAÇÃO: PROVEN = IMPORT-1, VERDICT-1, DECOMP, product-closure (A11Y-1, JOURNEY-1), provider CODEX · PARTIAL = qualidade de conteúdo (VALID-2, em andamento) · OPEN = regressão completa pós-CODEX, canário com PDF real, consistência, jornada integrada · DEFERRED = T46 (i18n), T47 (copy de estados) · BLOCKED(humano) = T51 deploy, push, merge · SUPERSEDED = a marca [✓] de REALMODEL-1 no plano content-quality vale só para o PIPELINE (corrigida).
- [>] **VALID-2 Fechar as falhas de qualidade de conteúdo observadas do Codex (H0.2)** — OWNER: GUI
      SPRINT_GOAL: as quatro classes observadas deixam de passar em silêncio: explicação circular, dica que entrega a resposta (ou o valor), cópia literal desnecessária, qualificador clinicamente relevante perdido ("em depleção de volume").
      SCOPE: menor mudança no contrato existente de geração/auditoria (prompt, auditoria do modelo, 2 regras determinísticas estreitas); sem arquitetura nova; sem reabrir o provider CODEX.
      REGRA: determinístico só onde detectável com segurança (dica contém a resposta ou o valor; explicação sem nenhum termo ou número novo); causalidade, completude e qualificadores = auditoria do modelo + revisão independente. Cada regra nova com contraexemplo que DEVE passar.
      PROVA: testes primeiro com saídas simuladas (sem gastar cota do Codex), mutantes das regras novas, regressão dos testes de geração/auditoria/reparo/schema; modelVersion honesto (codex:<modelo> ou codex:default) e versão do Codex CLI registrada na evidência.
      DONE_WHEN: as quatro classes têm proteção provada por teste discriminante e o conjunto direcionado está verde.
- [ ] **VALID-3 Provar a regressão completa pós-CODEX (H0.3)** — OWNER: GUI
      SPRINT_GOAL: fechar a lacuna: lint, inventário, unit, servidor, e2e COMPLETO e gates de build/runtime relevantes, com contagens exatas.
      REGRA: cada falha é classificada REGRESSION | PRE_EXISTING_FLAKE | ENVIRONMENTAL | REAL_DEFECT, reproduzida contra baseline quando importa; corrigir só regressão nova e defeito real; flake histórico não desculpa falha nova.
      DONE_WHEN: contagens registradas e nenhuma regressão material nova.
- [ ] **VALID-4 Canário com PDF médico REAL (H0.4)** — OWNER: GUI
      DEPENDENCIES: VALID-2, VALID-3. HUMAN_GATE ÚNICO: caminho absoluto de 1 PDF médico autorizado (nenhum existe no projeto).
      SPRINT_GOAL: PDF real -> extração -> unidade -> Codex -> auditoria determinística -> auditoria do modelo -> no máximo 1 reparo -> DRAFT -> UI de revisão; comparar fonte x rascunho em fidelidade, suporte, cobertura de conceito central, qualificadores, lógica causal, terminologia, rastreabilidade, responsabilidade das perguntas, profundidade, correção da resposta, explicação, vazamento de dica, fatos sem suporte. Sem nota agregada; defeitos concretos. Fato médico crítico sem suporte e não detectado bloqueia a prova de qualidade.
- [ ] **VALID-5 Verificação limitada de consistência (H0.5)** — OWNER: GUI
      DEPENDENCIES: VALID-4. SPRINT_GOAL: repetir a mesma unidade poucas vezes (sem benchmark grande) para responder se o gate segue eficaz entre gerações independentes (erros críticos, fatos sem suporte, qualificadores perdidos, achados, reparos, qualidade). Erro médico sério não detectado em qualquer geração bloqueia REALMODEL_CONTENT_QUALITY_PROVEN.
- [ ] **VALID-6 Jornada integrada do aluno (H0.6)** — OWNER: GUI
      SPRINT_GOAL: usar o produto como aluno: upload -> extração -> unidade -> DRAFT -> revisão da fonte -> aceite -> Resumo Mestre -> Estudar agora -> pergunta -> resposta -> feedback útil -> reteste -> evidência -> revisão -> Hoje -> Estatísticas -> próxima ação -> reload/persistência, com restore/backup intacto. Procurar becos sem saída, funcionalidade não descobrível, próxima ação confusa, administração desnecessária, remediação de erro fraca, analytics enganoso, quebra de continuidade, atrito e tempo longo até o primeiro valor. Sem redesign estético.
- [ ] **VALID-7 Corrigir só P0/P1 materiais (H0.7)** — OWNER: GUI
      REGRA: por achado: OBSERVED / STUDENT_IMPACT / ROOT_CAUSE / SMALLEST_FIX / DISCRIMINATING_PROOF. Sem limpeza de repositório e sem refatorar comportamento maduro por elegância.
- [ ] **VALID-8 Decisão de validação do V1 (H0.8)** — OWNER: GUI
      DONE_WHEN: V1_VALIDATED exige repo reconciliado, lacunas críticas fechadas, CODEX operacional, qualidade em fonte médica real provada, classes de defeito protegidas, regressão relevante completa, jornada integrada provada, persistência e recuperação preservadas, analytics sem engano material, nenhum P0/P1 conhecido, Conductor/STATE = realidade. Não exige dívida zero, aprendizagem adaptativa nem release. Ao concluir: HORIZON_DONE; NÃO iniciar o H1 sem reconciliar se ele continua sendo o melhor próximo horizonte.
