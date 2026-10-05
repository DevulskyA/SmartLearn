# TRACK: HARDENING-ROADMAP-V1 — endurecimento da V1 (correções e melhorias)

> VISÃO EXECUTÁVEL legível por humanos: fases, tarefas, subtarefas, caixas de seleção, tarefa atual, próxima, bloqueios e human gates. Nada além disso.
> Tudo entre `PLAN:BEGIN` e `PLAN:END` é GERADO de `.specs/features/hardening-roadmap-v1/tasks.md` (`npm run plan:sync`; o `agent-tasklist` também sincroniza) e `npm run context:check` FALHA se divergir. Não edite essa região à mão: mude `tasks.md` e sincronize.
> Autoridades (nada disto é copiado para cá): `PROGRAM.md` = ordem macro · `tasks.md` = ids, dependências, estado técnico · `spec.md` = requisitos/invariantes · `validation.md` = provas · `uat-visual.md` = UAT · Git/testes = realidade.
> NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE. Tarefa em DECISÕES HUMANAS depende de decisão do usuário (HG-xx em `spec.md` §8): parar e perguntar. FASES = as sprints de `PROGRAM.md` (S0, S1, S2, ...) na ORDEM canônica de execução, e as tarefas seguem a ordem que o `PROGRAM.md` dá; BASE = entregue antes das sprints; SEM-SPRINT = human gate ou ainda não sequenciadas.

```
Track:    hardening-roadmap-v1                 Status: ACTIVE
MARCO ATUAL: S3 — verdade do runner e2e (T-F6-08 → T-F6-03 + contrato do test-live)
Iniciado: 2026-10-04
```

<!-- PLAN:BEGIN (gerado de tasks.md por node scripts/plan-sync.mjs; não edite à mão) -->

ATIVA AGORA: T-F6-03 (S3) · PRÓXIMA: T-F3-01 · TAREFAS: 25/70 · SUBTAREFAS: 14/14 · BLOQUEADAS POR DEPENDÊNCIA: 5 · DECISÕES HUMANAS: 18

VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — e2e DESATUALIZADO (testado 8dc5e65) · server DESATUALIZADO (testado 7d90455) · unit DESATUALIZADO (testado 3af934a); HEAD atual ≠ HEAD testado

Legenda das tarefas: [x] feita · [>] ativa · [ ] pendente · [!] bloqueada (aguarda dependência ou decisão humana, dita na linha; só segue sozinha se a causa for tarefa comum) · [H] decisão humana · [=] dividida. Subtarefas: [x] feita · [>] atual · [ ] pendente (subtarefas = itens de checklist dentro de um bloco de tarefa; as filhas de uma tarefa dividida contam como tarefas). Fase: [✓] concluída · [>] contém a ativa · [H] só decisões humanas restantes · [!] nada executável. AGORA é o único lugar com a árvore completa da tarefa ativa; cada linha de tarefa existe uma única vez, em FASES.

## AGORA — TAREFA ATIVA

- T-F6-03 · Partição e tempo-alvo do e2e completo · S3 · subtarefas 0/0
  Objetivo: Separar specs independentes em grupos, mantendo a ordem onde há dependência; meta ≤ 8 min com 2 workers sem aumentar flakes
  Próximo passo: Ler scripts/e2e.mjs e playwright.config.* e a medição de 2026-10-04 em validation.md

## PRÓXIMO

- T-F3-01 · Tabela e máquina de estados de jobs · S4 · independente de S3 · dependências concluídas: T-F1-01, T-F1-02, T-F2-04, T-F10-02a, T-F10-03, T-F10-04a
- T-F3-05 · Explicação obrigatória por validação · S4 · independente de S3 · sem dependência pendente · passa à frente de T-F3-02, T-F3-03, T-F3-04 (aguardam T-F3-01)
- T-F4-03 · Posição de "Rascunhos em andamento" e confirmação de salvar no índice · S5a · independente de S3 · sem dependência pendente

## BLOQUEADAS POR DEPENDÊNCIA

- T-F10-06 · UI: idioma da interface × idioma do conteúdo, estado da unidade e consumo · aguarda decisão humana: HG-13
- T-F4-02 · Hierarquia da Revisão e ruído de achados · aguarda decisão humana: HG-02 (via T-F2-03)
- T-F5-04 · VALID-5: consistência entre gerações · aguarda decisão humana: T-F5-03
- T-F5-05 · Sensores determinísticos de qualificadores entre idiomas · aguarda decisão humana: T-F5-03
- T-F5-06 · Execução do Prompt Lab e relatório comparativo · aguarda decisão humana: HG-06 + HG-07 + HG-08 (via T-F5-01); HG-07 (via T-F5-02); T-F5-03

## FASES

### [✓] BASE · Entregue antes das sprints (F0/F1) — tarefas 14/14

- [x] **T-F0-01** — Congelar o baseline e registrar o Memento
- [x] **T-F0-02** — Compactar `STATE.md` (~2,8 mil linhas) sem perder decisões canônicas
- [x] **T-F0-03** — Reconciliar painel mestre e planos de track
- [x] **T-F0-04** — Regra de ignore para artefatos regeneráveis e decisão sobre não rastreados
- [x] **T-F1-01** — Lock de escritor único também para o Desktop
- [x] **T-F1-02** — Snapshot diário e antes de migração no caminho do Desktop
- [x] **T-F1-03** — Ensaio de restauração (restore drill) documentado e automatizado
- [x] **T-F1-04** — Ciclo de vida de processos: Job Object e limpeza do launcher
- [x] **T-F1-06** — Purga de sessões expiradas/revogadas
- [x] **T-F1-07** — Critério de build por conteúdo, não por commit
- [x] **T-F1-08** — Versão na barra de título e comando de diagnóstico
- [x] **T-F2-01** — Substituir a edição posicional da lista inteira por operações por id
- [x] **T-F6-01** — Definir e etiquetar a suíte "materiais"
- [x] **T-F6-02** — Portas dinâmicas e saída única por execução

### [✓] S1 · Extração por colunas — tarefas 1/1

- [x] **T-F5-08** — Ordem de leitura por colunas na extração de PDF (achado D1 de VALID-4/5)

### [H] S2 · F2 local (edição e proveniência) — tarefas 2/4

- [x] **T-F2-02** — Adicionar questão e reordenar como operações próprias
- [x] **T-F2-04** — Proveniência por questão e por rascunho
- [H] **T-F2-03** — Auditoria versionada e reauditoria explícita — HG-02
- [H] **T-F2-06** — Política de volume de questões (aplicação) — HG-01

### [H] S2G-a · Geração segura: idiomas — tarefas 2/3

- [x] **T-F10-01** — Preferências de idioma: `uiLocale` e `generationLocale` independentes
- [x] **T-F10-02a** — Contrato de idioma na geração (domínio, sem mudar o texto do prompt)
- [H] **T-F10-02b** — Diretiva mínima de idioma no prompt e campo `language` no contrato do modelo — HG-13

### [✓] S2G-b · Geração segura: escopo, reuso e créditos — tarefas 4/4

- [x] **T-F10-05** — "Importar ≠ gerar": guardas de escopo na fronteira
- [x] **T-F10-03** — Reuso, estado da unidade e política de prefetch (JIT)
- [x] **T-F10-04a** — Livro-razão de crédito, estimativa e reserva atômica (domínio)
- [x] **T-F10-04b** — Integrar escopo + orçamento + idioma no caminho de geração

### [✓] S2b · Pré-visualização do aceite — tarefas 1/1

- [x] **T-F2-05** — Pré-visualização do aceite

### [>] S3 · Verdade do runner — tarefas 1/3 · subtarefas 14/14

- [x] **T-F6-08** — Causa da falha funcional do run 2 do e2e completo — subtarefas 14/14
  - [x] Rodadas com workers=1 (5): 4 PASS, 1 FAIL
    - [x] w1-r1 — PASS 38/38 (208 s)
    - [x] w1-r2 — PASS 38/38 (207 s)
    - [x] w1-r3 — PASS 38/38 (208 s)
    - [x] w1-r4 — PASS 38/38 (199 s)
    - [x] w1-r5 — FAIL 7 passaram / 8 falharam (50 s): `Target crashed`, não é o sintoma
  - [x] Rodadas com workers=2 (5): 5 PASS
    - [x] w2-r1 — PASS 38/38 (131 s)
    - [x] w2-r2 — PASS 38/38 (127 s)
    - [x] w2-r3 — PASS 38/38 (132 s)
    - [x] w2-r4 — PASS 38/38 (126 s)
    - [x] w2-r5 — PASS 38/38 (126 s)
  - [x] Coletar os traces das falhas (`trace.zip` do run da w1-r5)
  - [x] Analisar a taxa de falha por workers (1 × 2)
  - [x] Registrar contagens e causa em `validation.md` (seção T-F6-08)
  - [x] Decidir o fechamento ou a próxima ação (fechada sem correção; reabrir só se o sintoma reaparecer com trace)
- [>] **T-F6-03** — Partição e tempo-alvo do e2e completo
- [ ] **T-F6-09** — Contrato do runner e2e: uma única autoridade (`test-live` × `e2e.mjs`)

### [ ] S4 · Jobs observáveis — tarefas 0/5

- [ ] **T-F3-01** — Tabela e máquina de estados de jobs
- [ ] **T-F3-02** — Execução em segundo plano com limite duro e cancelamento
- [ ] **T-F3-03** — Sinal de vida do provedor e política de "parada"
- [ ] **T-F3-04** — UI de geração: fase real, sair e voltar
- [ ] **T-F3-05** — Explicação obrigatória por validação

### [ ] S5a · UI local da aula — tarefas 0/4

- [ ] **T-F4-03** — Posição de "Rascunhos em andamento" e confirmação de salvar no índice
- [ ] **T-F4-04** — Editor da aula em telas estreitas
- [ ] **T-F4-05** — Acessibilidade do editor (teclado, foco, anúncios)
- [ ] **T-F4-07** — Cópia de estados e i18n (T46/T47) com guarda de acentuação

### [!] S5c · UI de idioma e consumo — tarefas 0/1

- [!] **T-F10-06** — UI: idioma da interface × idioma do conteúdo, estado da unidade e consumo — aguarda decisão humana: HG-13

### [!] S5b · Hierarquia da Revisão — tarefas 0/1

- [!] **T-F4-02** — Hierarquia da Revisão e ruído de achados — aguarda decisão humana: HG-02 (via T-F2-03)

### [ ] S6A · Confiança: discriminação e cobertura — tarefas 0/2

- [ ] **T-F6-04** — Comando de discriminação (mutação) repetível
- [ ] **T-F6-07** — Matriz de cobertura reconciliada

### [ ] S6B · Confiança: persistência — tarefas 0/3

- [=] **T-F6-06** — Contrato de persistência entre adaptadores (DEBT-006, parte 1) — dividida em T-F6-06a/b/c (tarefas)
  - [ ] **T-F6-06a** — Levantamento dos adaptadores de persistência vivos
  - [ ] **T-F6-06b** — Suíte de contrato executável contra os adaptadores vivos
  - [H] **T-F6-06c** — Decisão de aposentadoria do legado

### [ ] S6C · Higiene mensurada — tarefas 0/1

- [ ] **T-F6-05** — Avisos de lint e do Rust

### [ ] S7 · Segurança e empacotamento — tarefas 0/5

- [ ] **T-F8-01** — Inspeção do artefato empacotado
- [ ] **T-F8-02** — Testes adversariais de upload de PDF
- [ ] **T-F8-03** — Segredos e consentimento de IA
- [ ] **T-F8-05** — Dependências e auditoria
- [H] **T-F8-04** — Caminho único de abertura e retirada do release antigo — HG-04

### [ ] S8 · Real-use e continuidade — tarefas 0/1

- [ ] **T-F1-09** — Fumaça nativa Windows de IMPORT-1 e VERDICT-1 (criada na S0)

### [ ] S9 · Fechamento — tarefas 0/1

- [ ] **T-F9-02** — `validation.md` por fase e validador de estado

### [!] SEM-SPRINT · Fora da sequência de sprints (decisões humanas ou ainda não sequenciadas) — tarefas 0/16

- [H] **T-F0-05** — Higiene do checkout principal e das worktrees auxiliares — HG-05
- [H] **T-F1-05** — Política dos bancos legados e do AppData (#1, #3, #5) — HG-03
- [H] **T-F4-01** — Roteiro de validação visual humana e registro
- [H] **T-F4-06** — Regenerar UMA questão (contrato) — HG-06
- [H] **T-F5-01** — Desenho do Prompt Lab (spec e rubrica) — HG-06, HG-07, HG-08
- [H] **T-F5-02** — Medir comportamento real do provedor (sem otimizar nada) — HG-07
- [H] **T-F5-03** — VALID-4 completo: canário com PDF real e avaliação humana
- [!] **T-F5-04** — VALID-5: consistência entre gerações — aguarda decisão humana: T-F5-03
- [!] **T-F5-05** — Sensores determinísticos de qualificadores entre idiomas — aguarda decisão humana: T-F5-03
- [!] **T-F5-06** — Execução do Prompt Lab e relatório comparativo — aguarda decisão humana: HG-06 + HG-07 + HG-08 (via T-F5-01); HG-07 (via T-F5-02); T-F5-03
- [H] **T-F5-07** — VALID-8: decisão de validação do V1
- [H] **T-F7-01** — Recuperação de atraso ("reagendar atrasadas") reversível — HG-09
- [H] **T-F7-02** — Onboarding e estado vazio de produção (DEBT-007) — HG-09
- [H] **T-F7-03** — Decisão sobre FSRS baseada em dados
- [H] **T-F9-01** — Mapa de integração e ensaio sem publicar — HG-05
- [H] **T-F9-03** — Entrega (push/merge/deploy) — HG-10

## DECISÕES HUMANAS

- T-F2-03 · Auditoria versionada e reauditoria explícita · HG-02 "Reauditar" como ação explícita é aceitável dado que abrir não recalcula?
- T-F2-06 · Política de volume de questões (aplicação) · HG-01 Política de volume de questões
- T-F10-02b · Diretiva mínima de idioma no prompt e campo `language` no contrato do modelo · HG-13 Autorizar a diretiva mínima de idioma no prompt e confirmar o alcance de uiLocale em es/en no V1
- T-F6-06c · Decisão de aposentadoria do legado · Decisão de produto/arquitetura sobre remover o adaptador legado (após T-F6-06a, T-F6-06b)
- T-F8-04 · Caminho único de abertura e retirada do release antigo · HG-04 Retirar o release instalado de 10/09
- T-F0-05 · Higiene do checkout principal e das worktrees auxiliares · HG-05 Estratégia de integração, destino de content-quality e do merge temporário
- T-F1-05 · Política dos bancos legados e do AppData (#1, #3, #5) · HG-03 Destino do banco antigo do AppData e dos legados #3/#5
- T-F4-01 · Roteiro de validação visual humana e registro · A execução é UAT humano
- T-F4-06 · Regenerar UMA questão (contrato) · HG-06 Avaliação humana de VALID-4/5 e decisão VALID-8
- T-F5-01 · Desenho do Prompt Lab (spec e rubrica) · HG-06 Avaliação humana de VALID-4/5 e decisão VALID-8; HG-07 Orçamento de chamadas ao Codex do Prompt Lab; HG-08 Política de ARMAZENAMENTO de PDF/dados reais usados em teste
- T-F5-02 · Medir comportamento real do provedor (sem otimizar nada) · HG-07 Orçamento de chamadas ao Codex do Prompt Lab (após T-F5-01)
- T-F5-03 · VALID-4 completo: canário com PDF real e avaliação humana · Gerar a unidade selecionada, humano avalia com a rubrica, achados classificados (após T-F5-01)
- T-F5-07 · VALID-8: decisão de validação do V1 · Decisão humana registrada com evidência (após T-F5-03, T-F5-04)
- T-F7-01 · Recuperação de atraso ("reagendar atrasadas") reversível · HG-09 Decisão de produto sobre recuperação de atraso e onboarding
- T-F7-02 · Onboarding e estado vazio de produção (DEBT-007) · HG-09 Decisão de produto sobre recuperação de atraso e onboarding
- T-F7-03 · Decisão sobre FSRS baseada em dados · Relatório com carga diária projetada, taxa de atraso e acertos por intervalo a partir do banco DEV/real
- T-F9-01 · Mapa de integração e ensaio sem publicar · HG-05 Estratégia de integração, destino de content-quality e do merge temporário
- T-F9-03 · Entrega (push/merge/deploy) · HG-10 Push, merge, deploy, release

<!-- PLAN:END -->
