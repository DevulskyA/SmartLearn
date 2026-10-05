# TRACK: HARDENING-ROADMAP-V1 — endurecimento da V1 (correções e melhorias)

> VISÃO EXECUTÁVEL legível por humanos: fases, tarefas, subtarefas, caixas de seleção, tarefa atual, próxima, bloqueios e human gates. Nada além disso.
> Tudo entre `PLAN:BEGIN` e `PLAN:END` é GERADO de `.specs/features/hardening-roadmap-v1/tasks.md` (`npm run plan:sync`; o `agent-tasklist` também sincroniza) e `npm run context:check` FALHA se divergir. Não edite essa região à mão: mude `tasks.md` e sincronize.
> Autoridades (nada disto é copiado para cá): `PROGRAM.md` = ordem macro · `tasks.md` = ids, dependências, estado técnico · `spec.md` = requisitos/invariantes · `validation.md` = provas · `uat-visual.md` = UAT · Git/testes = realidade.
> NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE. Tarefa em HUMAN GATE depende de decisão humana (HG-xx em `spec.md` §8): parar e perguntar. FASES = as sprints de `PROGRAM.md` (S0, S1, S2, ...) na ORDEM canônica de execução, e as tarefas seguem a ordem que o `PROGRAM.md` dá; BASE = entregue antes das sprints; SEM-SPRINT = human gate ou ainda não sequenciadas.

```
Track:    hardening-roadmap-v1                 Status: ACTIVE
MARCO ATUAL: S3 — verdade do runner e2e (T-F6-08 → T-F6-03 + contrato do test-live)
Iniciado: 2026-10-04
Legenda das fases (painel): [✓] concluída · [>] contém a tarefa ativa (EXATAMENTE UMA) · [ ] pendente · [!] nada executável (bloqueio/human gate)
Legenda das tarefas: [x] feita · [ ] pendente (a etiqueta ao lado diz se está em execução, em human gate, bloqueada ou dividida)
```

<!-- PLAN:BEGIN (gerado de tasks.md por node scripts/plan-sync.mjs; não edite à mão) -->

ATIVA AGORA: T-F6-08 (S3) · PRÓXIMA: T-F6-03 · PROGRESSO: 24/70 · BLOQUEADAS: 2 · HUMAN GATE: 20

Legenda das tarefas: [x] feita · [>] ativa · [ ] pendente · [!] bloqueada · [H] human gate · [=] dividida. Fase: [✓] concluída · [>] contém a ativa · [H] só human gate restante · [!] nada executável · [ ] pendente. Os blocos abaixo de EM EXECUÇÃO a BLOQUEADO e HUMAN GATE são só ponteiros; a linha completa de cada tarefa existe uma única vez, em FASES.

## EM EXECUÇÃO

- T-F6-08 · Causa da falha funcional do run 2 do e2e completo

## PRÓXIMA

- T-F6-03 · Partição e tempo-alvo do e2e completo

## BLOQUEADO

- T-F4-02 · Hierarquia da Revisão e ruído de achados · aguarda T-F2-03
- T-F5-05 · Sensores determinísticos de qualificadores entre idiomas · aguarda T-F5-03

## FASES

### [✓] BASE · Entregue antes das sprints (F0/F1)

- [x] **T-F0-01** — Congelar o baseline e registrar o Memento
- [x] **T-F0-02** — Compactar `STATE.md` (~2,8 mil linhas) sem perder decisões canônicas
- [x] **T-F0-03** — Reconciliar painel mestre e planos de track
- [x] **T-F0-04** — Regra de ignore para artefatos regeneráveis e decisão sobre não rastreados
- [x] **T-F1-01** — Lock de escritor único também para o Desktop
- [x] **T-F1-02** — Snapshot diário e antes de migração no caminho do Desktop
- [x] **T-F1-03** — Ensaio de restauração (restore drill) documentado e automatizado
- [x] **T-F1-04** — Ciclo de vida de processos
- [x] **T-F1-06** — Purga de sessões expiradas/revogadas
- [x] **T-F1-07** — Critério de build por conteúdo, não por commit
- [x] **T-F1-08** — Versão na barra de título e comando de diagnóstico
- [x] **T-F2-01** — Substituir a edição posicional da lista inteira por operações por id
- [x] **T-F6-01** — Definir e etiquetar a suíte "materiais"
- [x] **T-F6-02** — Portas dinâmicas e saída única por execução

### [✓] S1 · Extração por colunas

- [x] **T-F5-08** — Ordem de leitura por colunas na extração de PDF (achado D1 de VALID-4/5)

### [H] S2 · F2 local (edição e proveniência)

- [x] **T-F2-02** — Adicionar questão e reordenar como operações próprias
- [x] **T-F2-04** — Proveniência por questão e por rascunho
- [H] **T-F2-03** — Auditoria versionada e reauditoria explícita — HG-02
- [H] **T-F2-06** — Política de volume de questões (aplicação) — HG-01

### [H] S2G-a · Geração segura: idiomas

- [x] **T-F10-01** — Preferências de idioma
- [x] **T-F10-02a** — Contrato de idioma na geração (domínio, sem mudar o texto do prompt)
- [H] **T-F10-02b** — Diretiva mínima de idioma no prompt e campo `language` no contrato do modelo — HG-13

### [✓] S2G-b · Geração segura: escopo, reuso e créditos

- [x] **T-F10-05** — "Importar ≠ gerar"
- [x] **T-F10-03** — Reuso, estado da unidade e política de prefetch (JIT)
- [x] **T-F10-04a** — Livro-razão de crédito, estimativa e reserva atômica (domínio)
- [x] **T-F10-04b** — Integrar escopo + orçamento + idioma no caminho de geração

### [✓] S2b · Pré-visualização do aceite

- [x] **T-F2-05** — Pré-visualização do aceite

### [>] S3 · Verdade do runner

- [>] **T-F6-08** — Causa da falha funcional do run 2 do e2e completo
- [ ] **T-F6-03** — Partição e tempo-alvo do e2e completo
- [ ] **T-F6-09** — Contrato do runner e2e

### [ ] S4 · Jobs observáveis

- [ ] **T-F3-01** — Tabela e máquina de estados de jobs
- [ ] **T-F3-02** — Execução em segundo plano com limite duro e cancelamento
- [ ] **T-F3-03** — Sinal de vida do provedor e política de "parada"
- [ ] **T-F3-04** — UI de geração
- [ ] **T-F3-05** — Explicação obrigatória por validação

### [ ] S5a · UI local da aula

- [ ] **T-F4-03** — Posição de "Rascunhos em andamento" e confirmação de salvar no índice
- [ ] **T-F4-04** — Editor da aula em telas estreitas
- [ ] **T-F4-05** — Acessibilidade do editor (teclado, foco, anúncios)
- [ ] **T-F4-07** — Cópia de estados e i18n (T46/T47) com guarda de acentuação

### [ ] S5c · UI de idioma e consumo

- [ ] **T-F10-06** — UI: idioma da interface × idioma do conteúdo, estado da unidade e consumo — aguarda HG-13

### [!] S5b · Hierarquia da Revisão

- [ ] **T-F4-02** — Hierarquia da Revisão e ruído de achados — aguarda T-F2-03

### [ ] S6A · Confiança: discriminação e cobertura

- [ ] **T-F6-04** — Comando de discriminação (mutação) repetível
- [ ] **T-F6-07** — Matriz de cobertura reconciliada

### [ ] S6B · Confiança: persistência

- [=] **T-F6-06** — Contrato de persistência entre adaptadores (DEBT-006, parte 1) — dividida em subtarefas
  - [ ] **T-F6-06a** — Levantamento dos adaptadores de persistência vivos
  - [ ] **T-F6-06b** — Suíte de contrato executável contra os adaptadores vivos
  - [H] **T-F6-06c** — Decisão de aposentadoria do legado

### [ ] S6C · Higiene mensurada

- [ ] **T-F6-05** — Avisos de lint e do Rust

### [ ] S7 · Segurança e empacotamento

- [ ] **T-F8-01** — Inspeção do artefato empacotado
- [ ] **T-F8-02** — Testes adversariais de upload de PDF
- [ ] **T-F8-03** — Segredos e consentimento de IA
- [ ] **T-F8-05** — Dependências e auditoria
- [H] **T-F8-04** — Caminho único de abertura e retirada do release antigo — HG-04

### [ ] S8 · Real-use e continuidade

- [ ] **T-F1-09** — Fumaça nativa Windows de IMPORT-1 e VERDICT-1 (criada na S0)

### [ ] S9 · Fechamento

- [ ] **T-F9-02** — `validation.md` por fase e validador de estado

### [!] SEM-SPRINT · Fora da sequência de sprints (human gate ou ainda não sequenciadas)

- [H] **T-F0-05** — Higiene do checkout principal e das worktrees auxiliares — HG-05
- [H] **T-F1-05** — Política dos bancos legados e do AppData (#1, #3, #5) — HG-03
- [H] **T-F4-01** — Roteiro de validação visual humana e registro
- [H] **T-F4-06** — Regenerar UMA questão (contrato) — HG-06
- [H] **T-F5-01** — Desenho do Prompt Lab (spec e rubrica) — HG-06, HG-07, HG-08
- [H] **T-F5-02** — Medir comportamento real do provedor (sem otimizar nada) — HG-07
- [H] **T-F5-03** — VALID-4 completo
- [H] **T-F5-04** — VALID-5: consistência entre gerações
- [ ] **T-F5-05** — Sensores determinísticos de qualificadores entre idiomas — aguarda T-F5-03
- [H] **T-F5-06** — Execução do Prompt Lab e relatório comparativo
- [H] **T-F5-07** — VALID-8: decisão de validação do V1
- [H] **T-F7-01** — Recuperação de atraso ("reagendar atrasadas") reversível — HG-09
- [H] **T-F7-02** — Onboarding e estado vazio de produção (DEBT-007) — HG-09
- [H] **T-F7-03** — Decisão sobre FSRS baseada em dados
- [H] **T-F9-01** — Mapa de integração e ensaio sem publicar — HG-05
- [H] **T-F9-03** — Entrega (push/merge/deploy) — HG-10

## HUMAN GATE

- T-F2-03 · Auditoria versionada e reauditoria explícita · HG-02 "Reauditar" como ação explícita é aceitável dado que
- T-F2-06 · Política de volume de questões (aplicação) · HG-01 Política de volume de questões
- T-F10-02b · Diretiva mínima de idioma no prompt e campo `language` no contrato do modelo · HG-13 Autorizar a diretiva mínima de idioma no prompt
- T-F6-06c · Decisão de aposentadoria do legado · aguarda T-F6-06a, T-F6-06b
- T-F8-04 · Caminho único de abertura e retirada do release antigo · HG-04 Retirar o release instalado de 10/09
- T-F0-05 · Higiene do checkout principal e das worktrees auxiliares · HG-05 Estratégia de integração
- T-F1-05 · Política dos bancos legados e do AppData (#1, #3, #5) · HG-03 Destino do banco antigo do AppData
- T-F4-01 · Roteiro de validação visual humana e registro · decisão humana
- T-F4-06 · Regenerar UMA questão (contrato) · HG-06 Avaliação humana de VALID-4/5
- T-F5-01 · Desenho do Prompt Lab (spec e rubrica) · HG-06 + HG-07 + HG-08
- T-F5-02 · Medir comportamento real do provedor (sem otimizar nada) · HG-07 Orçamento de chamadas ao Codex do Prompt Lab
- T-F5-03 · VALID-4 completo · aguarda T-F5-01
- T-F5-04 · VALID-5: consistência entre gerações · aguarda T-F5-03
- T-F5-06 · Execução do Prompt Lab e relatório comparativo · aguarda T-F5-01
- T-F5-07 · VALID-8: decisão de validação do V1 · aguarda T-F5-03, T-F5-04
- T-F7-01 · Recuperação de atraso ("reagendar atrasadas") reversível · HG-09 Decisão de produto sobre recuperação de atraso e
- T-F7-02 · Onboarding e estado vazio de produção (DEBT-007) · HG-09 Decisão de produto sobre recuperação de atraso e
- T-F7-03 · Decisão sobre FSRS baseada em dados · decisão humana
- T-F9-01 · Mapa de integração e ensaio sem publicar · HG-05 Estratégia de integração
- T-F9-03 · Entrega (push/merge/deploy) · HG-10 Push, merge, deploy, release

<!-- PLAN:END -->
