# Auditoria da telemetria de estudo coletada pelo código (HEAD 0980d48)

```
ESCOPO=o que o código REALMENTE grava sobre o estudo do aluno por tentativa/revisão/prova; onde; se há teste de integridade; lacunas
FONTE=leitura do código + sondagens em banco temporário (P-1..P-5, M-A..M-I de ledger.md §5). O banco vivo NÃO foi aberto.
LEGENDA=PROVEN (sondagem/teste reproduz) · SUSPECTED (leitura sem reprodução)
```

## 1. Estado: o que é coletado, onde é escrito, o que o protege

Caminhos relativos à worktree. Linhas conferidas em 0980d48.

### 1.1 `exercise_attempts` (migrações 009, 010, 021)

| Campo | Escrito em | Observação | Teste de integridade |
|---|---|---|---|
| `unit_id`, `exercise_version_id` | `server/src/services/attempts.js:79-82` (`start`) | versão fixada no início; edição posterior não muda a tentativa | `attempts.test.js:41,168` |
| `review_task_id` | `attempts.js:69-76,82`; cliente só em `src/app.js:5041` | mesma aula verificada no serviço (sem FK no banco) | `attempts.test.js:279` |
| `competency_id` | `attempts.js:65-68` | sempre NULL na prática (nenhuma competência é criada; exportação exige nulo) | `learning-events-schema.test.js:166` |
| `status` | `STARTED` em `attempts.js:81`; `SUBMITTED` em `:186` | `ABANDONED` existe no esquema e NUNCA é escrito (TG-08) | `attempts.test.js:205` |
| `max_assistance` | `NONE` em `:81`; sobe em `:105` (`bumpAssistance`), por `useHint` `:112` e `revealSolution` `:124` | monótono; nos fluxos de interface termina sempre `SOLUTION` (TG-06) | `attempts.test.js:69,92`; mutantes M-A, M-B mortos |
| `started_at` | `attempts.js:82` (agora do servidor) | marca a REVELAÇÃO da resposta em todos os fluxos (`src/app.js:3883,3917,5041,5116`), não a exibição da pergunta (TG-05) | sem teste do significado |
| `submitted_at` | `attempts.js:186` | agora do servidor | `attempts.test.js:220` |
| `evidence_id` | `server/src/services/evidence.js:98-99` | vínculo de prática; rejeita tentativa de outra aula/usuário, já vinculada, ainda aberta | `evidence.test.js:77-173`; M-I morto |

### 1.2 `learning_events` (009, 011), imutável por convenção

| Campo | Escrito em | Observação | Teste |
|---|---|---|---|
| `kind=ATTEMPT`, `sequence=1`, `outcome`, `assessment_method`, `provenance=APP`, `schema_version`, `occurred_at=recorded_at` | `attempts.js:188-199` (`submit`) | 1 evento por tentativa; cliente sempre manda `SELF_REPORT`; `AUTOMATIC` é aceito pela API e nada o produz | `learning-events-schema.test.js:121,136,183`; `attempts.test.js:126,144` |
| `assistance_available` | `attempts.js:171` | teto do item (SOLUTION/HINT/NONE) | `attempts.test.js:41` |
| `assistance_used` | `attempts.js:176` | lido da tentativa, nunca do corpo; omissão = `UNKNOWN`, nunca `NONE` | `attempts.test.js:92,126`; M-A, M-E mortos |
| `confidence` | `attempts.js:179` | a API aceita 0..1; o cliente NUNCA envia (`src/remote-store.js:291-294`, `src/app.js` não passa) | `attempts.test.js:110` |
| `kind=CORRECTION` | `server/src/services/review-results.js:157-168` | NENHUMA rota chama `correctItemEvent`; o produto não produz correção | `result-reconciliation.test.js:150`; M-F morto |

Idempotência: `idempotency_keys` (`services/idempotency.js:66`) existe, mas o cliente não manda `operationKey` em `submit` nem em `complete` (`src/remote-store.js:200,291-294`); a proteção real contra repetição é o estado (`ALREADY_SUBMITTED`, `ALREADY_COMPLETED`), com teste (`attempts.test.js:144`, `reviews.test.js:118,134`).

### 1.3 `learning_evidence` (004) e `review_tasks`

| Campo | Escrito em | Observação | Teste |
|---|---|---|---|
| REVIEW: `questions_count`, `correct_count` | `server/src/services/reviews.js:134-137` (`complete`) | contagens VINDAS DO CLIENTE (`src/app.js:5289`: contadores `answered`/`correct` do DOM); não conferidas com as tentativas; grava `answered`, não o total de exercícios (cobertura se perde) (TG-07) | `reviews.test.js:90,108` |
| REVIEW: `evidence_date` | `reviews.js:128` (`nowIso.slice(0,10)`) | dia em UTC; o resto do produto usa o dia local (TG-01, P-1) | nenhum |
| INITIAL_PRACTICE / EXTERNAL | `evidence.js:92-95`; cliente `src/app.js:3348-3354` (fim do estudo), `:4995` (externo), provas `exams.js:269` | `evidence_date` vem do cliente (dia local); validação só de "parseável" (TG-04, P-5) | `evidence.test.js:44,65` |
| `completed_at` | `reviews.js:130`; zera em `:167` (`reopen`) | a hora da 1ª conclusão se perde ao reabrir; sem registro de reabertura (TG-02, P-2) | `reviews.test.js:149` (fixa 2 linhas); M-C, M-D mortos |
| `offset_days`, `due_date` | criação da unidade | etapa R1..R16 derivada de `offset_days` (`src/remote-store.js:130`) | `review-schedule.test.js` |

Consumidores que SOMAM todas as linhas de evidência, sem tratar substituição: `src/stats.js:49-81`, `src/analytics.js:60`, `server/src/domain/priorities.js:52-58`.

### 1.4 Provas (`exams`, `exam_items`, `exam_evidence`; 024, 025)

| Campo | Escrito em | Observação | Teste |
|---|---|---|---|
| `started_at`, `submitted_at`, `corrected_at` | `server/src/services/exams.js:146,200,292,281` | único lugar com tempo real de uma sessão (início → envio → correção) | `exams.test.js:91` |
| `student_answer` | `exams.js:216` | ÚNICA resposta digitada antes do gabarito (limite 5000) | `exams.test.js:69,163` |
| `outcome` | `exams.js:232` | autojulgamento APÓS o gabarito | `exams-judgment.test.js:40` |
| tentativas geradas | `exams.js:265-266` (`finalize`) | criadas e enviadas no MESMO instante (duração 0) com assistência `NONE` (P-3); sem coluna que as marque como de prova | `exams-finalize.test.js:47,73`; M-G morto |

### 1.5 Conteúdo (covariáveis disponíveis por junção)

`exercise_versions.question_type` (027, nulo = não declarado), `provenance` (MANUAL/SOURCE/AI_GENERATED), `explanation` (023), citações da fonte (018); `exercises.archived_at` (006, `reactivate` zera: o histórico de arquivamento não é reconstruível). Testes: `question-type.test.js`, `exercise-explanation.test.js`.

### 1.6 Exportação e restauração

`shared/logical-import.js:99-181` lista todas as colunas acima (inclui `review_task_id`, `evidence_id`, `confidence`, provas). Colunas novas que não entrarem em `LOGICAL_SETS` seriam descartadas em silêncio na restauração: toda fatia que adicionar coluna precisa estender `backup-contract` e `logical-restore`. Teste: `backup-contract.test.js:190`, `logical-restore.test.js` (IMPORT-1).

### 1.7 Leituras que usam a telemetria

Em uso: `attempts.reinforcementByUnit` (`attempts.js:322`), `listForReviewTask(s)` (`:231,277`), `priorWrongExercises` (`:298`), `exercise-review.getAttemptDetails`, `domain/priorities.js`, `src/analytics.js`, `src/stats.js`.
SEM chamador de produto: `review-results.reconcile` (só testes), `correctItemEvent` (só testes), `domain/evidence-profile.buildEvidenceProfile` (só política experimental desligada). Coletado e guardado, nunca consumido: não é defeito, mas é capacidade sem uso.

### 1.8 NÃO coletado (afirmação de ausência, conferida por busca em `src/`, `server/src/`, `server/migrations/`)

Sessão de estudo; tempo de leitura do resumo; tempo entre exibir a pergunta e revelar; confiança; resposta digitada fora da prova; causa do erro; dificuldade percebida; plataforma/dispositivo por linha; versão do app por linha; momento do pedido de dica separado do da revelação.

## 2. Lacunas (TG-01..TG-12)

Classificação: INDEPENDENTE-CORREÇÃO = defeito do comportamento atual, corrigível já (interface congelada permite só correções funcionais, nenhuma depende de HG-09 nem de UI) · INDEPENDENTE-ADITIVA = não depende de HG-09 nem de UI, mas ACRESCENTA captura/esquema/ferramenta (recomenda-se o OK do usuário, pois a fase só autoriza correções) · BLOQUEADA = depende de decisão humana, de UI ou de HG-09.

| ID | Lacuna | Prova | Classificação | Prioridade |
|---|---|---|---|---|
| TG-01 | `evidence_date` de REVIEW usa o dia UTC (`reviews.js:128`); 23:30 em São Paulo grava o dia seguinte. Prova P-1. `exams.js:259` tem o mesmo padrão, mas o cliente sempre envia o dia local | PROVEN | INDEPENDENTE-CORREÇÃO | 1 |
| TG-02 | Reabrir e concluir de novo duplica a evidência nos agregados (P-2: 8/7 por uma revisão de 4); a hora da 1ª conclusão se perde; não há registro da reabertura. O caminho pela interface (desmarcar e marcar "Revisão feita") é SUSPECTED, o mecanismo é PROVEN. Subitem TG-02b (registro da reabertura) exige esquema | PROVEN (mecanismo) | INDEPENDENTE-CORREÇÃO (contagem); TG-02b INDEPENDENTE-ADITIVA | 2 |
| TG-03 | `exercise_attempts` não tem contexto (REVIEW / STUDY / RETEST / EXAM). Reteste, "Estudar agora" abandonado e prova são indistinguíveis por coluna (P-4, P-3); o "reteste" mostrado na revisão é heurística (`attempts.js:248-257`) | PROVEN | INDEPENDENTE-ADITIVA | 4 (necessária ao plano de comparação) |
| TG-04 | `evidence.create` aceita data futura, 1900 e impossível (`2026-02-31`). Prova P-5. Risco baixo (o cliente calcula a data), mas a API aceita | PROVEN | INDEPENDENTE-CORREÇÃO | 3 |
| TG-05 | Tempo: `started_at` = revelação, não exibição; tentativas de prova têm duração 0; não há sessão nem tempo de leitura. O norte "por minuto de estudo" e `T-F12-07` não têm base. 05a (prova): resolvida por TG-03 + regra de análise. 05b (`think_ms`: exibição → revelação): captura aditiva sem mudança visual. 05c (sessão, leitura, ausência): `T-F12-12`, privacidade | PROVEN | 05b INDEPENDENTE-ADITIVA; 05c BLOQUEADA | 6 |
| TG-06 | `max_assistance` termina sempre em `SOLUTION` nos fluxos de revisão e estudo (e2e fixam); `confidence` nunca é enviada; não há compromisso antes da revelação. Resultado: os baldes INDEPENDENTE do perfil de evidência só se enchem por provas | PROVEN | BLOQUEADA (muda a interação de estudo: UI/produto, D-T3) | n/a |
| TG-07 | 07a: a contagem agregada de REVIEW vem do cliente e não é conferida com as tentativas; `reconcile` não tem chamador, divergência é invisível. 07b: grava-se `answered`, não o total de exercícios (cobertura) | PROVEN (leitura + busca de chamadores) | 07a INDEPENDENTE-ADITIVA (ferramenta somente leitura); 07b BLOQUEADA (cobertura = D-13 de HG-09) | 5 (07a) |
| TG-08 | `ABANDONED` nunca é escrito; tentativas `STARTED` (revelou e não julgou) ficam para sempre. Mudar estado exige decisão; medir não | PROVEN (busca) | INDEPENDENTE-ADITIVA (métrica na ferramenta 07a, sem mudar estado) | 5 |
| TG-09 | Imutabilidade das tabelas-razão só por convenção: nenhum `UPDATE`/`DELETE` no código, nenhum gatilho, nenhum teste que fixe isso | PROVEN (busca) | INDEPENDENTE-ADITIVA (teste estático; gatilho NÃO recomendado, atrapalharia a restauração) | 8 |
| TG-10 | Dado sintético e real sem marca: o seed-dev usa a API pública (`scripts/seed-dev.mjs`), sem coluna ou flag; só a conta `dev@smartlearn.local`, o texto "Apostila DEV" e `created_at` de 2026-09-19 os separam. O banco vivo não foi aberto | PROVEN pelo script; conteúdo do banco vivo NÃO verificado | BLOQUEADA (D-T1: manter ou recriar o banco). Regra de análise provisória: usar `created_at` ≥ início do uso real | n/a |
| TG-11 | Cobertura de plataforma: telemetria só com servidor (Web e Windows com backend local); o armazenamento local legado não tem tentativas (`src/db.js:981-987`); Android é Companion somente leitura | PROVEN (código) | BLOQUEADA (ARCH-01, fora de escopo) | n/a |
| TG-12 | O `scripts/mutation-check.mjs` cobre 5 áreas (identidade de questão, sessão, rejeição, sanitizador, importação) e NENHUMA de telemetria. M-A..M-I provaram os testes uma vez, numa cópia descartável, sem registro permanente | PROVEN | INDEPENDENTE-ADITIVA (ferramenta) | 7 |

## 3. Pendências de verificação (SUSPECTED / não medido)

- S-1 O caminho pela interface de TG-02 não foi exercitado por mim.
- S-2 Quantas linhas do banco vivo já sofrem TG-01 ou têm tentativas `STARTED` presas: NÃO medido (banco vivo não aberto; mediria por cópia somente leitura do snapshot).
- S-3 O viés do autojulgamento (acerto declarado depois de ver o gabarito) não tem magnitude medida.
- S-4 `started_at` na prova: o intervalo do exame é o único tempo de sessão; se mede esforço ou ociosidade, NÃO verificado.
