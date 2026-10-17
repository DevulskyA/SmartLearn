# Tarefas — Plano do dia com orçamento de tempo v1 (PROPOSED)

Spec: `spec.md` (mesma pasta). Classificação: DERIVADO (agente); direção CANÔNICA em Constituição I.19 e spec do roadmap R-14.
ESTADO: PROPOSED. Nada aqui está autorizado. O ESTADO de cada tarefa (e a posição entre as frentes A e B) vive no registro da seção "Frentes A e B" de `.specs/features/hardening-roadmap-v1/tasks.md`; este arquivo guarda só o DETALHE do primeiro incremento (T-F12-01 a T-F12-06). As tarefas T-F12-07 em diante estão no registro e dependem deste incremento ou de decisões próprias.
Antes de promover qualquer uma ao ledger executável: HG-14 respondido (T-F12-01), mockup aprovado (T-F12-05), e a ordem de marcos de `PROGRAM.md` §2c respeitada (produto utilizável antes). Regras de execução do ledger do roadmap valem inteiras (reconciliar antes de agir, RED antes de GREEN, nunca tocar o banco humano, nada de push/merge sem ordem).
Tamanho: S (≤ meio dia) · M (≤ 2 dias).

## T-F12-01 — Aprovar o spec e responder DP-D1..DP-D9 · S
- Status: `[H]` PROPOSTA · Requisitos: R-14 · Dependências: HG-14
- Fazer: o aluno lê `spec.md`, responde cada DP-D (ou aceita a recomendação) e aprova ou pede ajuste; o agente registra as respostas no próprio `spec.md` (seção 8) e em `validation.md`.
- Gate: respostas registradas com data; sem elas nenhuma tarefa abaixo inicia.

## T-F12-02 — Estimativa de duração por item (função pura, provisória e rotulada) · S
- Status: `[ ]` PROPOSTA · Requisitos: R-14 (AC-14.2, AC-14.8) · Dependências: T-F12-01
- Superfície: `shared/study-time-estimate.js` (novo), `test/study-time-estimate.test.js` (novo). Nenhum outro arquivo.
- Fazer: `estimateItemMinutes({ pendingExercises })` com `ESTIMATE_POLICY_VERSION = 1`, constantes `BASE` e `POR_EXERCICIO` em um só lugar, `ceil`, entrada inválida recusada (não coagida).
- Proof targets (RED): tabela 0→3, 4→9, 10→18, 7→14; nunca menor que `BASE`, nunca NaN; sem relógio. Sensor sobrevive à mutação "trocar ceil por floor" e "multiplicar por etapas".
- Gate: `node --test test/study-time-estimate.test.js` + `npm run test:inventory`.

## T-F12-03 — Orçamento de tempo: disponibilidade por dia da semana · M
- Status: `[ ]` PROPOSTA · Requisitos: R-14 (AC-14.1) · Dependências: T-F12-01 (DP-D1, DP-D3, DP-D6)
- Superfície: migração aditiva (`user_settings.study_availability`, número livre no momento), `server/migrations/manifest.json`, `server/src/services/settings.js`, `server/src/routes/settings.js`, `src/remote-store.js`, campo em Configurações (`src/app.js`/`index.html`, após mockup), catálogo i18n; export/import lógico conforme DP-D6.
- Fazer: `studyAvailability` `{version:1, minutesByWeekday:[7]}` ou `null`; validação no serviço (inteiros 0..1440 ou `null`, 7 posições); `PATCH` na mesma transação dos demais campos; GET nunca grava; backup pre-migrate verificado antes de banco humano.
- Proof targets (RED): GET sem linha devolve `null` e não cria linha; valores inválidos recusados com o campo; coexiste com timezone e idioma na mesma requisição (recusa de um deixa o outro intacto); dado histórico de usuário sem linha segue válido; ida e volta de backup preserva a coluna; restore lógico conforme a decisão.
- Gate: `server/test/settings-availability.test.js` + `settings*.test.js` + `migrations*.test.js` + `backup-contract.test.js` + inventário.

## T-F12-04 — Plano do dia: função pura (itens por unidade, ordem do protocolo, corte, déficit) · M
- Status: `[ ]` PROPOSTA · Requisitos: R-14 (AC-14.2, AC-14.3) · Dependências: T-F12-02
- Superfície: `shared/day-plan.js` (novo), `test/day-plan.test.js` (novo); reusa `src/today-priority.js` (`reviewTier`, `pickPrimaryReview`) sem alterá-lo.
- Fazer: `buildDayPlan({ today, overdue, dueToday, tomorrowCount, exercisesByUnit, judgedByTask, priorWrongByTask, availability })` sem DOM e sem relógio: agrupa por unidade (DP-R3), ordena (DP-R4), corta (DP-R5), calcula déficit, idade da etapa mais antiga fora, contagem de amanhã (DP-R6).
- Proof targets (RED): conservação de itens e de etapas (propriedade com entradas aleatórias); `plan[0]` = unidade da ação primária; orçamento ausente ≠ 0; primeiro item entra mesmo estourando; item pequeno posterior NÃO é puxado; mutações "ordenar por duração", "descartar após o corte", "somar por etapa" e "tratar ausente como 0" ficam vermelhas; fronteiras de data do dia da semana.
- Gate: `node --test test/day-plan.test.js` + `npm test` (unitários) + inventário.

## T-F12-05 — UI "Plano de hoje" em Hoje, com déficit visível · M
- Status: `[ ]` PROPOSTA · Requisitos: R-14 (AC-14.2, AC-14.3) · Dependências: T-F12-03, T-F12-04, T-F12-01 (DP-D9: mockup aprovado)
- Superfície: `src/app.js` (`renderToday`), `index.html`, `src/styles.css`, `src/i18n/locales/pt-BR/*.js`, `e2e/hoje-day-plan.spec.js` (novo). Não toca Estatísticas, Plano, Acompanhamento, agendador nem snapshot offline. Convive com o agrupamento por unidade (HG9-00) se integrado.
- Fazer: bloco conforme DP-R9 e DP-R6; modo local e offline sem o bloco (limitação registrada); lista "Atrasadas"/"Para hoje" e botão principal intactos.
- Proof targets (RED): com a base sintética (34 etapas, 10 unidades) o déficit exibido bate com a soma e com a lista "Atrasadas"; sem orçamento, nenhuma frase de déficit; chaves de texto sem verbos de juízo proibidos; hash das tabelas históricas idêntico; 375 px sem rolagem horizontal; axe sem violações; scanner de i18n em 0; e2e existentes de Hoje verdes sem editar expectativas.
- Gate: `node scripts/e2e.mjs e2e/hoje-day-plan.spec.js` + specs de Hoje existentes + `npm run lint` + `node scripts/scan-portuguese-i18n.mjs`; regressão completa só no fechamento (executada por Haiku conforme a divisão de modelos).

## T-F12-06 — Prova de uso: o aluno lê o déficit e decide · S
- Status: `[H]` PROPOSTA · Requisitos: R-14 (AC-14.3) · Dependências: T-F12-05 (UAT humano; gates por plataforma conforme INV-26)
- Fazer: o aluno abre Hoje com a base de uso, informa a disponibilidade e responde, sem ajuda: o que faço agora, quanto leva, quanto fica de fora e o que acontece amanhã. Registrar o julgamento perceptivo (claro? confortável?) e as limitações: uma plataforma por vez (Web, Windows; Android/Companion = SPEC_DEVIATION até decisão).
- Gate: registro humano com autoria e data em `uat-visual.md` ou `validation.md`; NÃO PROVADO enquanto não existir.
