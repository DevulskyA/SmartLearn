# Fechamento da V1, etapa 1: ledger por nível e critérios de aceite

```
DATA=2026-10-17 · BASE=worktree smartlearn-v1-complete, HEAD 0980d48 (árvore limpa exceto os 3 itens não rastreados de sempre)
NATUREZA=ANÁLISE E REGISTRO. Nenhum código, teste, banco ou dado do produto foi alterado. O banco vivo (~/SmartLearn-DevData) e o app em execução não foram tocados.
INTERFACE=CONGELADA nesta fase (só correções funcionais).
```

## 0. Como ler

Os três níveis são independentes. Evidência de um nível NÃO sustenta outro: teste verde (engenharia) não prova que o conteúdo médico está certo (qualidade), e nenhum dos dois prova que o aluno aprende melhor (eficácia).

Escala de status (usada em todas as tabelas):

| Status | Significa |
|---|---|
| DECLARED | está escrito em spec, nota ou relato de agente; nesta etapa não foi observado |
| EXECUTED | um comando foi rodado e o resultado observado (nesta etapa, ou registrado em documento com comando, HEAD e resultado); sem prova de que falharia se a afirmação fosse falsa |
| VERIFIED | EXECUTED e discriminante: o teste fica vermelho sob uma falha plausível (mutante) ou houve observação independente |
| PROVEN | VERIFIED no HEAD nomeado, para o escopo exato afirmado, com a evidência reproduzível apontada; vale só para aquele HEAD e escopo |

Onde não há evidência nenhuma, o item é DECLARED e fica marcado NOT_PROVEN. NOT_PROVEN nunca é promovido por inferência (INV-11).

Ponteiro de evidência: `P-x` = sondagem desta etapa (seção 5), `M-x` = mutante desta etapa (seção 5), caminhos de arquivo são relativos à worktree.

## 1. Nível (a): ENGENHARIA

| ID | Requisito | Status | Evidência / observação |
|---|---|---|---|
| E-01 | Lint sem erro nem aviso | EXECUTED | `npm run lint` (`eslint . --max-warnings 0`) rodado nesta etapa em 0980d48, sem saída de erro |
| E-02 | Guardas de contexto do repositório | EXECUTED | nesta etapa em 0980d48: `npm run context:check` PASS (73 tarefas, plano = projeção de `tasks.md`), `npm run test:inventory` PASS (239 arquivos: 69 raiz, 112 servidor, 58 E2E), `node --test test/codemap.test.js` 3/3 |
| E-03 | Núcleo de telemetria do servidor: 130 testes (attempts, reviews, evidence, evidence-origin, evidence-profile, result-reconciliation, learning-events-schema, exams x4, backup-contract, logical-restore, idempotency) | EXECUTED | nesta etapa em 0980d48: 130 passaram, 0 falharam, 24 s |
| E-04 | Esses testes DISCRIMINAM as falhas que importam para a telemetria | VERIFIED | M-A..M-I (seção 5): 9 mutantes plausíveis aplicados numa cópia descartável, 9 mortos. Fora do `scripts/mutation-check.mjs` (que cobre outras 5 áreas, nenhuma de telemetria): ver TG-12 |
| E-05 | Telemetria no servidor é append-only na prática (nenhum `UPDATE`/`DELETE` em `learning_events`/`learning_evidence`) | EXECUTED (busca estática), SEM sensor | `grep` em `server/src` não acha nenhum; não há gatilho de banco nem teste que fixe isso (TG-09) |
| E-06 | Export lógico e restauração levam tentativas, eventos e provas sem perda | VERIFIED | `server/test/backup-contract.test.js:190`, `server/test/logical-restore.test.js` (IMPORT-1, ida e volta A→B→C equivalente); colunas em `shared/logical-import.js:99-181` |
| E-07 | Escrita offline não perde nem duplica dado | DECLARED (teste existe, não rodado aqui) | `e2e/offline-writes.spec.js:110`: mutação offline falha visível, zero linhas no servidor, sem fila persistente |
| E-08 | Testes unitários da raiz 717/717 | EXECUTED (relatado pelo coordenador, não reexecutado aqui) | nota de retomada 2026-10-17; reexecutar no HEAD final |
| E-09 | Servidor completo | EXECUTED, ABERTO | relatado 1049/1051. Falha 1 `dev-lock`: causa provada = backend órfão de `npm test` antigo na porta 13907. Falha 2 `process-smoke`: SEM causa provada (não rotular como flake) |
| E-10 | E2E completo | EXECUTED (relatado: 259 passaram, 2 ignorados, 0 falhas, inclui `production-build.spec`; não reexecutado aqui) | reexecutar no HEAD final |
| E-11 | Jornada nativa Windows isolada 18/18 | VERIFIED nos SHAs `f55da10`/`9de5e9d` (duas execuções, autor + Haiku independente); NÃO provada em 0980d48 | `f55da10` e `9de5e9d` NÃO são ancestrais de 0980d48 (estão na branch `split-fatia2`); o branch de uso tem commits equivalentes (`d8e2443`, `6aa6198`, `7591c59`). A repetição nativa pós-integração precisa rodar no HEAD final |
| E-12 | CI remoto do PR #6 | ABERTO | falhou em `practice.spec.js:54`; correção local `dece8a6`/`f7b3d6b` (corrida revelar→julgar); só o push prova (HG-10) |
| E-13 | Plataformas: WEB, ANDROID, WINDOWS contadas separadas (INV-26) | DECLARED | telemetria de estudo só existe com servidor (Web e Windows com backend local). Armazenamento local legado não tem tentativas (`src/db.js:981-987`). Android: Companion somente leitura (`spec.md` §12), sem telemetria de estudo. Nenhuma prova de Android neste ledger |
| E-14 | Integridade temporal da evidência | ABERTO (defeitos provados) | TG-01 (data UTC), TG-02 (duplicação após reabrir), TG-04 (data inválida aceita): ver `telemetry-audit.md` |

## 2. Nível (b): QUALIDADE MÉDICA / DE CONTEÚDO

Este nível trata de o conteúdo ensinado estar correto, fiel à fonte e sem erro clínico. Nenhum item abaixo é prova de correção médica; os controles mecânicos só reduzem o risco.

| ID | Requisito | Status | Evidência / observação |
|---|---|---|---|
| M-01 | Controles mecânicos de fidelidade existem: auditoria determinística (`audit-rules-4`), sensores de unidade/qualificador (`risk-checks.js`), vínculo frase→trecho da fonte (`claim-evidence.js`), aceite bloqueado por achado HIGH | VERIFIED como MECANISMO (não como correção do conteúdo) | `validation.md` seções "CONTENT TRUST": `accept-blocking.test.js` (8, mutação vermelha), `risk-checks.test.js` + robustez (16), `claim-evidence.test.js` (11), 0 falso positivo em 3 rodadas reais. Limite declarado: silêncio = "não verificado" |
| M-02 | Geração real com PDF médico: fidelidade medida | EXECUTED, escopo limitado | VALID-4/5 (2026-10-04): 3 gerações reais, 1 unidade (Costanzo, pp. 267-273), avaliador = IA, sem especialista clínico; 0 erro crítico, defeitos materiais D1-D7 registrados. `prompt-lab/valid4-span-rerun.md` |
| M-03 | Prompt interno 10 (MED-SUM V2.7.5) é melhor que o 8 | EXECUTED, veredito NOT_PROVEN | canário v8 × v10 (2026-10-12, 3 chamadas): gates duros ok, ligação frase→trecho 60% contra 78%; v10 segue como padrão de DESENVOLVIMENTO. `prompt-lab/canary-v8-v10-rbf.md` |
| M-04 | Cobertura de conceitos essenciais na geração | EXECUTED sobre mapa feito por IA | `scripts/prompt-lab/coverage.mjs` (metodologia v2): essenciais 11/11 em v8 e v10; formulações 7/11 (v8) e 8/11 (v10), sem diferença demonstrada. Os níveis do mapa (`tierDisputed`) são propostas de IA PENDENTES de revisão médica: DECLARED |
| M-05 | Revisão por humano com competência clínica | DECLARED, NOT_PROVEN | nenhuma revisão humana de conteúdo médico foi registrada (HG-06, VALID-8). Bloqueia `REALMODEL_CONTENT_QUALITY_PROVEN` |
| M-06 | Variabilidade entre gerações e entre fontes | NOT_PROVEN | máximo 3 gerações de uma unidade; 2 unidades avaliadas no total; uma única fonte (Costanzo) |
| M-07 | Qualidade das QUESTÕES geradas (corretude do gabarito, dica que não entrega a resposta, rótulo de tipo) | NOT_PROVEN | gate não detecta dica que entrega raciocínio (D3) nem rótulo de tipo errado (D5) (`validation.md` VALID-5); sem revisão humana; corpus de questões reais: nenhuma ingerida |
| M-08 | O conteúdo que o aluno vai estudar hoje é o que foi avaliado | NOT_PROVEN | o banco de uso é o conjunto SINTÉTICO do seed-dev (19/09, "conteúdo sintético para desenvolvimento"); o conteúdo médico real aceito ainda não existe no banco de uso (fato do coordenador; o banco não foi aberto aqui) |

Afirmação permitida hoje: "existem controles mecânicos de fidelidade, com limites conhecidos". Afirmação NÃO permitida: "o conteúdo é medicamente correto" ou "a qualidade foi validada".

## 3. Nível (c): EFICÁCIA EDUCACIONAL

Este nível trata de o aluno aprender, reter e usar mais do que aprenderia sem o produto. Só dado de uso real, comparado com uma base, sustenta isso.

| ID | Requisito | Status | Evidência / observação |
|---|---|---|---|
| X-01 | O produto coleta sinal por tentativa (acerto, ajuda, momento, etapa de revisão) | VERIFIED (mecanismo) | seção "Estado" de `telemetry-audit.md`; testes do núcleo (E-03, E-04) |
| X-02 | O sinal coletado distingue recordação independente de recordação assistida | NOT_PROVEN, e na prática AUSENTE nos fluxos de revisão e "Estudar agora" | em todos os fluxos de revisão/estudo o aluno revela o gabarito ANTES de julgar, e `max_assistance` termina sempre em `SOLUTION` (`e2e/practice.spec.js:117`, `e2e/product-value.spec.js:154`, `e2e/study-now-reveal-order.spec.js:102`). Só o Modo Prova guarda resposta digitada antes do gabarito e grava assistência `NONE` (P-3). Ver TG-06 |
| X-03 | Tendência descritiva de acertos ("o estudo está funcionando?") | VERIFIED (contrato) | `test/longitudinal-trend.test.js`, `test/study-verdict.test.js`: acerto agrupado por período, mínimo de 10 questões, "não sei" abaixo disso. É estatística DESCRITIVA de autoavaliação; não é eficácia |
| X-04 | O aluno aprende mais do que sem o produto | DECLARED, NOT_PROVEN | zero dado real de estudo (banco sintético; `T-F4-01` só do usuário); nenhuma base definida antes deste ledger; nenhum controle |
| X-05 | Retenção tardia e transferência | DECLARED, NOT_PROVEN | sem dado real; transferência só existiria com item marcado `TRANSFER` (`question_type`), nunca inferida |
| X-06 | Norte do produto: conhecimento corretamente aprendido, retido e utilizável POR MINUTO de estudo | DECLARED, NÃO MENSURÁVEL hoje | não existe medida de tempo de estudo (TG-05); `started_at` das tentativas marca a REVELAÇÃO, não o início (P-3, `src/app.js:3883`, `5041`, `5116`) |
| X-07 | Decisão de FSRS/agendamento adaptativo baseada em dados | DECLARED | `T-F7-03` PARCIAL, zero número empírico; recomendação provisória ADIAR |
| X-08 | Uso real confortável (primeira sessão de estudo, atritos) | DECLARED, pendente do usuário | `T-F4-01` `[H]`; roteiro `uat-visual.md` |

Afirmação permitida hoje: "o produto registra e mostra a evidência de estudo do próprio aluno". Afirmação NÃO permitida: "o aluno aprende melhor", "dominou o conteúdo", "retém mais".

## 4. Critérios de aceite por nível (verificáveis)

### 4.1 Engenharia (todos no MESMO HEAD final, comandos reais de `package.json`)

| ID | Critério | Como se verifica |
|---|---|---|
| AC-E1 | Lint: 0 erros e 0 avisos | `npm run lint` |
| AC-E2 | Unitários da raiz: 0 falhas | `npm test` |
| AC-E3 | Servidor: 0 falhas. As 2 falhas relatadas resolvidas OU com causa provada e decisão registrada; `process-smoke` não pode ficar rotulado "flake" sem causa | `npm --prefix server test` |
| AC-E4 | E2E completo: 0 falhas (ignorados listados) | `npm run test:e2e` |
| AC-E5 | Jornada nativa 18/18 no build do HEAD final, 2 execuções independentes | `scripts/desktop-study-journey.mjs` em instância isolada, banco descartável |
| AC-E6 | Guardas | `npm run context:check`, `npm run test:inventory`, `node --test test/codemap.test.js` PASS |
| AC-E7 | Telemetria: cada lacuna independente corrigida tem teste vermelho antes e verde depois, e o mutante correspondente morre | por fatia (REPORT.md §3) |
| AC-E8 | Integridade temporal: a evidência REVIEW leva o dia local; reabrir e concluir de novo não duplica contagem; datas impossíveis ou futuras são recusadas | TG-01, TG-02, TG-04 verdes |
| AC-E9 | Ida e volta do export lógico inclui toda coluna nova de telemetria | `backup-contract` + `logical-restore` com a coluna |
| AC-E10 | Nenhum teste toca o banco humano | `test/test-db-isolation.test.js`; hashes do banco inalterados antes/depois quando houver cópia |
| AC-E11 | Plataformas separadas: o relatório final declara Web, Windows e Android cada uma como PASS, NOT_PROVEN ou N/A, sem herdar | tabela no relatório final |

### 4.2 Qualidade médica (PROPOSTO; o humano ratifica, HG-06)

| ID | Critério | Observação |
|---|---|---|
| AC-M1 | Avaliador humano nomeado, com competência clínica na área, datado | requisito: M-05 |
| AC-M2 | Amostra mínima PROPOSTA: ≥ 5 unidades de ≥ 2 fontes/disciplinas, 1 geração cada, mais 3 gerações independentes de 1 unidade para variabilidade | os números são ESCOLHA a ratificar; nenhuma fonte os determina |
| AC-M3 | Rubrica fixa (`prompt-lab/rubric.md`): zero erro clínico crítico não corrigido em qualquer geração avaliada; defeitos materiais classificados | erro sério não detectado em qualquer geração bloqueia `REALMODEL_CONTENT_QUALITY_PROVEN` (R-05, AC-05.2) |
| AC-M4 | Questões revisadas por humano: corretude do gabarito, dica que não entrega a resposta, rótulo de tipo | cobre D3 e D5 |
| AC-M5 | Os níveis do mapa de conceitos (`tierDisputed`) revisados por humano | M-04 |
| AC-M6 | Relatório separa "avaliado por IA" de "avaliado por humano" | evita promover M-02 |

### 4.3 Eficácia educacional

| ID | Critério | Observação |
|---|---|---|
| AC-X1 | Plano de comparação aceito pelo usuário ANTES de coletar (`comparison-plan.md`): base, desfecho primário, tamanho mínimo, regra de parada, regras de exclusão | pré-registro |
| AC-X2 | Dados de estudo REAIS, separados dos sintéticos (TG-10) | decisão D-T1 |
| AC-X3 | Tamanho mínimo atingido (unidades por braço, não só itens) ou o resultado sai como "estimativa com intervalo, sem alegação de significância" | `comparison-plan.md` §5 |
| AC-X4 | Desfecho primário medido em itens NÃO praticados, resposta digitada antes do gabarito, atraso fixo | `comparison-plan.md` §3 |
| AC-X5 | Alegação limitada ao escopo observado (um aluno, N unidades); nenhuma generalização | `comparison-plan.md` §7 |
| AC-X6 | Medidas com defeito conhecido (TG-01, TG-02) corrigidas ou excluídas na análise | `telemetry-audit.md` |

## 5. Evidência produzida nesta etapa (reprodutível)

| ID | O que | Resultado |
|---|---|---|
| P-1 | Dia da evidência de REVIEW: conclusão às 02:30 UTC de 2026-10-09 (23:30 de 2026-10-08 em `America/Sao_Paulo`) | dia local = 2026-10-08; `evidence_date` gravado = **2026-10-09** (`server/src/services/reviews.js:128`) |
| P-2 | Concluir, reabrir, concluir de novo a mesma revisão de 4 questões | 2 linhas REVIEW para a mesma tarefa; `Stats.calculate` do cliente soma **8 questões / 7 acertos** (real: 4); `completed_at` fica nulo após reabrir (a hora da 1ª conclusão se perde); única tabela com "log/audit/session" no esquema é `sessions` (login) |
| P-3 | Tentativa nascida de uma prova finalizada | `started_at == submitted_at` (duração 0), `max_assistance NONE`, `review_task_id NULL`; o tempo real fica só em `exams` (10:00 → 10:20 → 10:25) |
| P-4 | Tentativa de "Estudar agora" abandonada × reteste | colunas idênticas (`review_task_id NULL`, `evidence_id NULL`, `max_assistance NONE`): nada distingue as duas; `exercise_attempts` não tem coluna de contexto |
| P-5 | `evidence.create` com datas | `2099-01-01`, `1900-01-01` e `2026-02-31` ACEITAS e gravadas como estão |
| M-A..M-I | 9 mutantes em cópia descartável (A assistência sempre NONE; B assistência pode regredir; C concluir 2x; D reabrir apaga evidência; E padrão NONE no lugar de UNKNOWN; F reconcile pega o evento mais antigo; G prova não idempotente; H reteste contado como da revisão; I vincular tentativa de outra aula) | **9/9 mortos**; testes que matam: `attempts.test.js`, `reviews.test.js`, `learning-events-schema.test.js`, `result-reconciliation.test.js`, `exams-finalize.test.js`, `evidence.test.js` |

Como reproduzir: as sondagens rodam sobre banco TEMPORÁRIO (módulos reais do servidor, `runMigrations`), nunca sobre dado humano. Os scripts ficaram no diretório de rascunho da sessão (não versionados); P-1..P-5 são pequenos o bastante para virar os testes vermelhos das fatias de `REPORT.md` §3.
