# SmartLearn V1 — Programa de sprints (arquitetura, ordem e critérios)

Este arquivo governa SOMENTE: arquitetura de sprints, ordem, critérios de pronto e regras de execução.
Ele NÃO guarda estado. Onde cada coisa vive:

| O quê | Onde (única fonte) |
|---|---|
| Status de cada tarefa, dependências por ID, gates por tarefa | `tasks.md` (campo `Status:`) |
| Posição corrente (sprint ativa, próximo slice, bloqueio, HEAD) | `.specs/HANDOFF.md` (local, sobrescrito) + painel `plan.md` do track |
| Evidência, medições, achados | `validation.md` |
| Critérios, invariantes, HG-01..10, definição de fechamento | `spec.md` (§8, §10) |
| Roteiro de UAT humano | `uat-visual.md` |
| Direção do produto / estado de VALID | Constitution §0.1 / `conductor/tracks/v1-validation/plan.md` |

Se este arquivo divergir do repositório, o repositório vence. Nenhum número, SHA ou "feito/aberto" deve ser copiado para cá.

## 1. Regras de arquitetura do programa

1. **Uma governança só** (GOV-2): sem diretório novo, sem `traceability.json`, sem `state.md`. A rastreabilidade é requisito → tarefa → gate em `tasks.md`; só se cria artefato novo se a S0 provar requisito sem tarefa.
2. **Uma sprint ACTIVE por vez**; sprint só ativa com outcome único e observável, dependências por ID satisfeitas, tarefas concretas, proof target, gates conhecidos e nenhuma decisão de produto em aberto no caminho.
3. **Dependência por ID de tarefa**, nunca "fase fechada". Tarefa `[H]` fica de fora, é registrada e contornada; nunca bloqueia a sprint inteira.
4. **Isolamento de WIP:** WIP não commitado de outra tarefa nunca entra em gate de sprint diferente. Enquanto T-F5-08 estiver em WIP, só S0 (sem gate de código) e S1 (a própria T-F5-08) podem rodar; se um gate de outra sprint for inevitável antes, o WIP sai da árvore (cópia fora do repositório, restaurada depois) e isso é registrado na evidência.
5. **Evidência discrimina:** teste verde prova execução; só prova o comportamento quando falharia se ele estivesse errado. Prova invalidada por mudança na sua superfície vira `STALE`; reexecuta-se só ela mais o gate global no fechamento.
6. **Papéis:** Sonnet 5.5 High faz todo trabalho intelectual; Haiku só executa testes e devolve `COMMAND/HEAD/EXIT/PASSED/FAILED/SKIPPED/DURATION` (+ primeira falha). Haiku não diagnostica nem decide.
7. **Proibido sem ordem explícita:** Codex, Prompt Lab, gasto de API, push, merge, deploy, release, rebase, squash, force, tocar o banco DEV humano, editar migração histórica.
8. **Bug:** observação → hipóteses concorrentes → menor discriminador → causa → patch mínimo → regressão. Duas tentativas falhas na mesma hipótese = reabrir a hipótese. Falha sem causa provada nunca é rotulada (ambiental, flake) por inferência.
9. **Geração:** `IMPORTAR != GERAR`. Qualquer chamada ao provedor passa por escopo aprovado → reuso → idioma alvo → estimativa → reserva atômica; nenhum teste chama modelo real (provedor simulado/espiões); valores de franquia não são inventados (HG-11).
10. **Anti-pergunta:** antes de perguntar, registrar o que foi buscado e por que não se deriva nem se contorna. Reabrir o Desktop e verificações mecânicas por CDP não são gate.

## 2. Sprints (uma ACTIVE por vez; estado de cada tarefa em `tasks.md`)

| Sprint | Outcome observável | Tarefas (ledger) | Prio | Dependências |
|---|---|---|---|---|
| **S0** Reconciliação | O que o ledger não cobre fica classificado com evidência (`VERDICT-1`, `IMPORT-1`, `VALID-8`, abertos de `v1-validation`/`product-closure`, skips do e2e); `IMPLEMENTATION_SHA` das tarefas `[✓]` que só têm `BASE_SHA` preenchido via `git log`; resultado em `validation.md`/`HANDOFF.md`. **Sem gate de código.** Tarefa nova só se descobrir trabalho material sem tarefa | (nenhuma nova) | P0/P4 | — |
| **S1** Extração por colunas | Texto extraído de página de duas colunas sai na ordem de leitura, sem partir frases; coluna única e tabelas inalteradas; prova read-only no PDF real (págs. 267–273): "PAH" fora do span "Glomerular Filtration" | T-F5-08 (isolada) | P1 | — |
| **S2** F2 local (edição e proveniência) | Edição só por entidade com adicionar/reordenar por id e proveniência por questão/resumo | T-F2-02, T-F2-04 (T-F2-03 e T-F2-06 `[H]`) | P2 | T-F2-01 |
| **S2G-a** Geração segura: idiomas | `uiLocale`, `generationLocale` e `sourceLanguage` independentes; a geração valida o idioma do conteúdo contra o alvo; aulas existentes intactas | T-F10-01, T-F10-02a (T-F10-02b `[H]`, HG-13) | P1 | — |
| **S2G-b** Geração segura: escopo, reuso e créditos | Importar ≠ gerar; reuso sem nova chamada; reserva atômica de crédito dentro de limites configuráveis; caminho único até o provedor com todas as guardas | T-F10-05, T-F10-03, T-F10-04a, T-F10-04b (valores: HG-11) | P0/P1 | T-F10-02a (para 04b) |
| **S2b** Pré-visualização do aceite | Pré-visualização somente-leitura idêntica ao aceite real, mostrada antes do botão final | T-F2-05 (sensor RED guardado fora da árvore; retoma o desenho já feito) | P2 | T-F2-01 |
| **S3** Verdade do runner | Uma única autoridade de e2e; o runner "ao vivo" expressa esse contrato; sensor falha se o runner for contornado; causa da falha do run 2 discriminada; T-F6-03 só fecha com 3 execuções consecutivas sem falha e meta ≤ 8 min com 2 workers | T-F6-08 → T-F6-03 → T-F6-09 | P4 | T-F6-02 |
| **S4** Jobs observáveis | Geração em segundo plano com estado, sinal de vida e cancelamento, sem Codex; o job carrega escopo, idiomas e reserva e nunca amplia o escopo | T-F3-01..05 | P1/P2 | T-F1-01, T-F1-02, T-F2-04, T-F10-02a, T-F10-03, T-F10-04a (para T-F3-01); demais por ID no ledger |
| **S5a** UI local da aula | Posição de "Rascunhos em andamento", editor em tela estreita, acessibilidade do editor, cópia/i18n, provados em viewport Desktop; agenda offline do Companion com as próximas revisões (somente leitura) | T-F4-03, T-F4-04, T-F4-05, T-F4-07, T-F4-08 | P3 | por ID no ledger |
| **S5c** UI de idioma e consumo | Idioma da interface e do conteúdo em controles separados; estado da unidade e recusa clara por limite; cenário 5 provado | T-F10-06 (alcance es/en: HG-13) | P3 | T-F10-01, T-F10-03, T-F10-04b |
| **S5b** Hierarquia da Revisão | Revisão com achados ordenados e sem ruído | T-F4-02 | P3 | T-F2-03 (`[H]`, HG-02) → `BLOCKED_HUMAN` até a decisão; não segura S5a |
| **S6A** Confiança: discriminação e cobertura | Mutações repetíveis em worktree descartável; matriz de cobertura reconciliada | T-F6-04, T-F6-07 | P4 | T-F6-01 |
| **S6B** Confiança: persistência | Contrato de persistência executável contra os adaptadores vivos | T-F6-06a, T-F6-06b (T-F6-06c `[H]`) | P2 | — |
| **S6C** Higiene mensurada | Avisos de lint e do Rust reduzidos sem alterar comportamento | T-F6-05 | P5 | — (só sobe se houver risco demonstrado) |
| **S7** Segurança e empacotamento | Artefato empacotado inspecionado, PDFs adversariais, segredos/consentimento, dependências auditadas | T-F8-01, T-F8-02, T-F8-03, T-F8-05 (T-F8-04 `[H]`) | P0 | T-F1-01, T-F1-08 (T-F8-01) |
| **S8** Real-use e continuidade | Estado A → restart do backend/Desktop → estado A, e as provas mecânicas do checkpoint F1 (Job Object sem órfãos, segundo escritor recusado, título real, snapshot do dia). **Baseada em evidência invalidada**, não em repetição integral: reexecuta só o que mudanças posteriores invalidaram | T-F1-09 (fumaça nativa de IMPORT-1/VERDICT-1, em cópia) + provas de F1 e das superfícies tocadas por S1–S7 | P3 | S1–S7 |
| **S9** Fechamento | Snapshot único, gates globais no mesmo HEAD, jornada integrada, integridade do banco, verificação independente (uma vez, sem a narrativa) | T-F9-02 + gates §3 | — | S0–S8 |

Fora do fechamento local (gate humano ou posterior): F5 com Codex/Prompt Lab (T-F5-01..04, 05, 06, 07), VALID-8, F7 (HG-09), entrega F9 (T-F9-01/03, HG-05/10), T-F1-05 (HG-03), T-F0-05, T-F2-03/06, T-F4-01/06, T-F6-06c, T-F8-04.
T-F5-05 depende de T-F5-03 e NÃO integra nenhuma sprint autônoma.

## 2b. Marcos USE-FIRST (2026-10-05, prioridade: USO REAL CONTROLADO > fechar todo o hardening)
Reclassificação das tarefas JÁ existentes (sem IDs novos, sem reescrever histórico; a ordem das sprints acima não muda). P0 = impede o fluxo de uso real ou ameaça dados · P1 = degrada materialmente aprendizagem/confiabilidade · P2 = necessário para uso diário prolongado · P3 = hardening, limpeza ou release que pode esperar. Só P0/P1 podem ser iniciados antes do uso real; P2/P3 aguardam.

| Marco | Resultado | Tarefas |
|---|---|---|
| M0 USABLE_NOW | PDF → gerar aula → revisar/aceitar → estudar → responder → evidência → revisão → Hoje/Estatísticas no Desktop real, sem risco aos dados | CONCLUÍDO no que é automatizável: S1, S2G-b (escopo, reuso, créditos), S3 (runner), S4 (jobs), S5a (UI/offline), F1 (banco único, lock, snapshot, restore), T-F1-09 (Desktop real: IMPORT-1/VERDICT-1). Falta o UAT humano: **T-F4-01 (P0, só o usuário pode fazer)** |
| M1 CONTENT_QUALITY | Conteúdo médico gerado confiável e medido | T-F5-03 VALID-4 com PDF real (P1), T-F5-01 desenho do Prompt Lab, rascunhos prontos (P1), T-F5-07 VALID-8 (P1), T-F10-02b diretiva de idioma (P1), T-F2-06 volume de questões (P1), T-F5-02 / T-F5-04 / T-F5-05 / T-F5-06 (P2), T-F4-06 regenerar uma questão (P2) |
| M2 DAILY_USE | Uso diário prolongado confortável | T-F2-03 reauditar (P2), T-F4-02 hierarquia da Revisão (P2), T-F10-06 UI de idioma/consumo (P2), T-F7-01 recuperação de atraso (P2), T-F7-02 onboarding (P2), T-F7-03 FSRS (P3) |
| M3 RELEASE_HARDENING | Entrega e higiene | T-F8-04 retirar o release instalado (P2), T-F8-05 cargo audit (P3), T-F0-05, T-F1-05, T-F9-01 (P3), T-F9-03 entrega (P3) |

Regra: nenhuma tarefa de M1–M3 vira ativa antes do M0 ser usado de verdade; o achado do uso real decide o próximo outcome.

## 2c. Precedência de marcos e frentes A e B (2026-10-17)

Origem: decisões do aluno de 2026-10-17 (Constituição I.19; spec.md R-11 AC-11.4, R-14, INV-15..17, HG-14). Classificação: a ORDEM abaixo é CANÔNICA; os detalhes de cada tarefa são DERIVADOS. Onde divergir da ordem implícita de M1 a M3 (2b), esta seção prevalece; M0 segue como definido. Não altera a tabela de sprints (2) nem o estado de nenhuma tarefa (o estado vive em `tasks.md`).

| Prec. | Marco | Resultado observável | Itens | Situação em 2026-10-17 |
|---|---|---|---|---|
| 1 | Corrigir P0 e demonstrar um SmartLearn utilizável | M0 usado de verdade no Desktop real; defeitos P0 que o uso revelar corrigidos; decisão sobre integrar o agrupamento de vencidas; jornada nativa Windows repetida no HEAD final | T-F4-01 (`[H]`), HG9-00 (integrado localmente; publicar: HG-05, HG-10), defeitos P0 do uso (sem ID até aparecerem) | M0 comprovado no que é automatizável; falta o uso humano. O agrupamento de vencidas foi provado na branch `claude/smartlearn-v1-split-fatia2` e depois integrado ao branch de uso local por `d8e2443` e `6aa6198` (VERIFICADO por `git log`; sem push nem merge); a repetição nativa pós-integração está com outro agente (INFORMADO, não reverificado aqui) |
| 2 | Completar o primeiro estudo real e anotar as limitações | uma sessão de estudo real concluída, com tempo gasto, atritos e o que faltou registrados | T-F4-01; registro em `validation.md`/`uat-visual.md` | pendente (só o aluno faz) |
| 3 | Spec executável do planejamento diário, começando pela menor solução (orçamento de tempo + plano do dia) | spec PROPOSED aprovada pelo aluno | `.specs/features/daily-plan-time-budget-v1/spec.md`; T-F12-01 (`[H]`, HG-14) | spec escrita (PROPOSED); aprovação pendente |
| 4 | Preparar a decisão HG-09 com impacto e migração | pacote de decisão: análise de impacto, simulação em dados sintéticos, contrato de cobertura | T-F7-04, T-F7-05, T-F7-06; decisão T-F7-07 (`[H]`) | reconciliação feita (`hg-09-proposal.md` §0); análise de impacto, simulador e cobertura pendentes |
| 5 | Implementar as novas funcionalidades em incrementos verificáveis, depois das aprovações | cada incremento com prova própria e regressão proporcional | ordem abaixo | bloqueado por aprovações e por 1 e 2 |

Ordem dentro do marco 5 (uma tarefa ativa por vez; cada frente com tarefas e dependências próprias, nunca uma tarefa grande):
- Frente A (R-14, prevenir sobrecarga): T-F12-02, T-F12-03, T-F12-04, T-F12-05, T-F12-06; depois T-F12-07 (calibração com tempo medido), T-F12-09 (previsão de carga, depende do contrato de calendário da B), T-F12-10 (data de prova, compartilhada com B) e T-F12-11 (priorização), T-F12-12 (rastreio), T-F12-13 (pausas, futuro). O incremento 1 (T-F12-02..06) NÃO espera a frente B.
- Frente B (HG-09, dívida artificial): T-F7-07 (decisão e emenda), T-F7-08 (migração), T-F7-01 (realização), T-F7-09 (validação de retenção). A direção do aluno (uma obrigação exigível por unidade) está ACEITA; a decisão formal e toda implementação seguem PENDENTES.

Regras:
1. Trabalho documental e analítico dos marcos 3 e 4 (spec, análise, simulação sobre dados sintéticos) pode andar durante os marcos 1 e 2 e não consome a janela de uso. Código, migração ou mudança de dado das frentes A e B só depois dos marcos 1 e 2 e das aprovações.
2. AUTORIZADO hoje: registrar, especificar, analisar e simular em dados sintéticos. NÃO autorizado: qualquer mudança de código, migração, dado, calendário de revisões ou comportamento de Hoje; adotar a Opção 3 (uma linha exigível por vez); usar FSRS ou ajuste adaptativo; classificar conteúdo como dispensável.
3. Decisões do aluno que destravam: HG-14 (DP-D1..DP-D9), HG-09 (D-1 e D-12 a D-16 de `hg-09-proposal.md`), D-6 (data de prova), HG-05/HG-10 (integração do agrupamento).
4. Conflitos abertos (CONFLITO): DECISION_CONFLICT-3 (frente B × Constituição §21/§91-C e INV-04), -4 (disponibilidade diária × §23/§39), -5 (priorização × §35) em `spec.md` §11.
5. Tarefas novas (T-F7-04..09, T-F12-01..13) estão no registro "Frentes A e B" de `tasks.md` e NÃO são blocos do ledger executável até serem promovidas (cada promoção sincroniza o plano do conductor).

## 3. Gate Registry (comandos reais de `package.json`)

| ID | Nível | Comando |
|---|---|---|
| G-SERVER | sprint | `npm --prefix server test` |
| G-ROOT | sprint | `npm test` |
| G-LINT | sprint | `npm run lint` (0 erros; avisos contados) |
| G-INV | sprint | `npm run test:inventory` |
| G-E2E-SPEC | sprint | `node scripts/e2e.mjs <spec...>` ou `npm run test:e2e:materials` |
| G-E2E | closure | `npm run test:e2e` — **CANDIDATO canônico**; `npx playwright test` é **LEGADO**; S3 deixa uma só autoridade |
| G-BUILD | closure | `npm run build` |
| G-RUST | quando Rust mudar / closure | `cargo test --lib` em `src-tauri` |
| G-DESKTOP | closure | `npm run dev:desktop` + observação mecânica por CDP quando o runtime permite |

E2E completo só em S3 (medição) e S9. Por tarefa, apenas as specs da superfície.

## 4. Human Gate Registry (decisões em `spec.md` §8; aqui só o efeito na execução)

| Gate | Desbloqueia | Trabalha ao redor? |
|---|---|---|
| HG-01 volume de questões | T-F2-06 | sim |
| HG-02 reauditar | T-F2-03 (→ T-F4-02) | sim |
| HG-03 banco antigo | T-F1-05 | sim |
| HG-04 desinstalar release 10/09 | T-F8-04 | sim |
| HG-05 integração/branches | T-F0-05, T-F9-01 | sim |
| HG-06 avaliação humana VALID-4/5/8 | VALID-8, V1_VALIDATED | sim |
| HG-07 orçamento do Codex | F5 geração | sim |
| HG-08 política de armazenamento de PDF/dados reais (o Costanzo já existe; não pedir outro) | F5 geração | sim |
| HG-09 produto de estudo (direção da frente B aceita em 2026-10-17; decisão formal D-1 e D-12..D-16 pendente) | F7 (T-F7-01, T-F7-07, T-F7-08) | sim |
| HG-10 push/merge/deploy/release | T-F9-03 | sim |
| HG-11 valores e unidade de custo das franquias | T-F10-04a (valores), produção com provedor real | sim (estrutura configurável) |
| HG-12 política de prefetch | execução de prefetch (T-F10-03 já traz o parâmetro, padrão 0) | sim |
| HG-13 diretiva mínima de idioma no prompt; alcance de `uiLocale` es/en | T-F10-02b, T-F10-06 | sim (DECISION_CONFLICT-1/2 em `spec.md` §11) |
| HG-14 aprovar o spec do plano do dia (DP-D1..DP-D9) | T-F12-02..06 | sim (preparo documental segue) |
| Julgamento perceptivo do UAT (`uat-visual.md`) | T-F4-01, `VISUAL_VALIDATION` | sim |

Reabrir o Desktop e provas mecânicas por CDP NÃO são gate.

## 5. Resultado final (definição em `spec.md` §10)

- `ENGINEERING_LOCAL_PROVEN` · `ENGINEERING_LOCAL_PROVEN_WITH_HUMAN_GATES` · `ENGINEERING_LOCAL_NOT_PROVEN`.
- **`V1_VALIDATED` é outro estado e só existe com VALID-8 decidido pelo humano e `REALMODEL_CONTENT_QUALITY_PROVEN=PROVEN`.** Fechamento local com gates humanos NÃO equivale a V1 validada.

## 6. Execução

- **Ao iniciar sessão:** `git worktree list` → HEAD/status → `.specs/HANDOFF.md` → este arquivo → sprint ACTIVE → `node scripts/agent-tasklist.mjs` e uma linha com ATIVA/PRÓXIMA.
- **Por tarefa:** outcome → proof target (menor observação que me desmentiria) → RED/caracterização → patch mínimo → teste focado → regressão da superfície → commit causal (BASE_SHA/IMPLEMENTATION_SHA em `tasks.md`) → evidência em `validation.md` → `tasks.md` + `plan.md` na mesma ação.
- **`/goal` e `/loop`:** só forçam este programa; a inteligência vive no repositório. `/goal` é digitado pela pessoa (texto proposto na conversa, não aqui, para não duplicar autoridade). `.claude/loop.md` só se houver processo longo real a vigiar.
