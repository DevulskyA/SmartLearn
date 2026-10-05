# TRACK: HARDENING-ROADMAP-V1 — endurecimento da V1 (correções e melhorias)

> Ledger MACRO que alimenta a tasklist visual (GOV-2 opção A). Spec e ledger causal de tarefas: `.specs/features/hardening-roadmap-v1/{spec.md,tasks.md}` (uma tarefa = um commit causal, gate exato, BASE_SHA/IMPLEMENTATION_SHA). Execução = skill `tlc-spec-driven-strict`.
> NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE. Tarefas `[H]` do ledger dependem de decisão humana (HG-xx em `spec.md` §8): parar e perguntar. VALID-8 segue no track `v1-validation` (aguarda humano).
> Mapa: HR-n = fase do ledger (HR-0=F0, HR-1=F1, HR-2=F6 T-F6-01..03, HR-3=F2, HR-4=F4, HR-5=F3, HR-6=F8, HR-7=F5, HR-8=F7, HR-9=F9). A numeração HR-n identifica fases; NÃO define a ordem de execução. A sequência operacional das sprints é autoridade de `.specs/features/hardening-roadmap-v1/PROGRAM.md` (S0..S9); este plano continua sendo o estado macro do track.

```
Track:    hardening-roadmap-v1                 Status: ACTIVE
MARCO ATUAL: S3 — verdade do runner e2e (T-F6-08 → T-F6-03 + contrato do test-live)
Iniciado: 2026-10-04
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: HR-2 (F6a; T-F6-08 em andamento, depois T-F6-03 e o contrato do test-live). PRÓXIMA: HR-5 (F3 jobs, S4). BLOQUEIO: HR-1 aguarda HG-03 e provas manuais do Desktop (S8)
```

## Tarefas

- [✓] **HR-0 F0 Reconciliação e higiene de estado** — OWNER: GUI
      DETAILS: T-F0-01 baseline/Memento, T-F0-02 STATE compactado (arquivo morto íntegro + sensor de tokens), T-F0-03 painel/track, T-F0-04 placeholders de `src-tauri/resources` (feito, ff83d20). T-F0-05 é [H] (HG-05), relatório somente-leitura.
- [!] **HR-1 F1 Integridade do datastore e ciclo de vida de processos** — OWNER: GUI
      DETAILS: código COMPLETO (T-F1-01..04, 06..08 feitas). Bloqueada por: T-F1-05 [H] (HG-03) e provas manuais do Desktop no checkpoint F1 (Job Object sem órfãos, segundo escritor recusado, título real, snapshot do dia), planejadas na S8 junto com T-F1-09.
- [>] **HR-2 F6a Plataforma de teste (T-F6-01..03, T-F6-08)** — OWNER: GUI
      DETAILS: T-F6-01 e T-F6-02 feitas. EM ANDAMENTO: T-F6-08 (causa do sintoma `#account-show-register` oculto; sonda feita, causa NÃO provada). ABERTA: T-F6-03 (3 execuções e2e consecutivas sem falha, ≤ 8 min com 2 workers) e o contrato do `test-live` (raiz 478/479). Demais de F6 (T-F6-04..07) depois, em S6A/B/C.
- [✓] **HR-3 F2 Contrato da aula: identidade, proveniência, auditoria versionada** — OWNER: GUI
      DETAILS: parte local FEITA: T-F2-01, 02, 04, 05 (edição por entidade, adicionar/reordenar por id, proveniência, pré-visualização do aceite). Pendentes só [H]: T-F2-03 (reauditoria, HG-02) e T-F2-06 (volume, HG-01).
- [ ] **HR-4 F4 UI/UX da aula, Materiais e acessibilidade** — OWNER: GUI
      DETAILS: Revisão, "Rascunhos em andamento", editor estreito, acessibilidade do editor, i18n. T-F4-01 (validação visual humana) e T-F4-06 são [H].
- [ ] **HR-5 F3 Jobs de geração observáveis e controláveis** — OWNER: GUI
      DETAILS: DESBLOQUEADA (dependências em F10 satisfeitas). Tabela/máquina de estados (próxima migração livre: 033, aditiva com backup), execução em segundo plano com cancelamento, sinal de vida, UI, explicação obrigatória; o job carrega escopo, idiomas e reserva e usa o caminho único de geração.
- [ ] **HR-6 F8 Segurança e empacotamento** — OWNER: GUI
      DETAILS: inspeção do artefato empacotado, PDFs adversariais, segredos e consentimento, auditoria de dependências. T-F8-04 é [H] (HG-04).
- [ ] **HR-7 F5 Qualidade de conteúdo médico e Prompt Lab** — OWNER: GUI
      DETAILS: VALID-4/5 fechados com evidência já existente (valid4-span-rerun.md). T-F5-08 (ordem de leitura por colunas) feita em 2026-10-04 (21aedd1). Pendente determinística: nenhuma autônoma; T-F5-05 depende de T-F5-03 (HG). Tudo que envolve gerar com Codex/Prompt Lab (T-F5-01..04, 06, 07, VALID-8) está [H] e NÃO AUTORIZADO sem ordem explícita.
- [ ] **HR-8 F7 Produto de estudo** — OWNER: GUI
      DETAILS: recuperação de atraso reversível, onboarding, decisão FSRS por dados; todas [H] (HG-09).
- [✓] **HR-10 F10 Geração segura: escopo, reuso, créditos e idiomas (R-12/R-13)** — OWNER: GUI
      DETAILS: FEITO (T-F10-01, 02a, 03, 04a, 04b, 05): importar ≠ gerar; JIT/reuso; reserva atômica de crédito; `uiLocale`/`generationLocale`/`sourceLanguage` independentes; entra antes de estabilizar F3 (jobs). Valores de franquia (HG-11), prefetch (HG-12) e diretiva de prompt/alcance es-en (HG-13) são [H]. Sequência: `PROGRAM.md` (S2G-a/b).
- [ ] **HR-9 F9 Integração e entrega** — OWNER: GUI
      DETAILS: mapa de integração (HG-05), validation.md por fase, entrega só por ordem explícita (HG-10).
