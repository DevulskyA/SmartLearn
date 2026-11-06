# T-F7-04: análise de impacto do calendário "uma obrigação exigível por unidade"

```
DATA=2026-10-17 · BASE=HEAD 85c2dea (branch claude/smartlearn-v1-complete) · NATUREZA=ANÁLISE; nenhum código, migração, teste ou dado alterado; banco vivo e app não tocados
TAREFA=T-F7-04 em .specs/features/hardening-roadmap-v1/tasks.md ("Frentes A e B", frente B). Dependências: nenhuma. Decisão: nenhuma (a decisão vem depois: T-F7-07, HG-09, D-1 e D-12..D-16)
RESULTADO PEDIDO=cada consumidor listado com comando de busca reproduzível; nenhuma afirmação sem arquivo
NOTA=a tarefa pedia "nova seção de hg-09-proposal.md"; por instrução desta rodada a análise fica neste arquivo e hg-09-proposal.md não foi editado
LEGENDA=LIDO (arquivo:linha conferido neste HEAD) · INFERIDO (conclusão minha) · NÃO VERIFICADO
```

## 1. Escopo e candidatos

Direção CANÔNICA (Constituição I.19; `hg-09-proposal.md` §0.1): uma obrigação de revisão exigível por unidade, próxima agendada a partir da revisão realmente feita; dívida = conhecimento a recuperar; nenhuma etapa perdida declarada concluída; histórico íntegro; reteste nunca substitui a evidência original.

| Candidato | O que é (`hg-09-proposal.md` §5, §0.2) |
|---|---|
| Opção 0 (referência) | só agrupamento visual. Já integrado ao branch de uso (`d8e2443`, `6aa6198`). Sem mudança de dado |
| Opção 2 | recuperação por unidade: ao concluir a etapa vencida mais antiga com evidência, as etapas irmãs já vencidas viram `SUPERSEDED`; futuras reagendadas a partir da data real; as 16 linhas ficam |
| Opção 2 depois 3 (D-12 b) | Opção 2 como etapa 1, com o esquema já prevendo `stage_index` / `derived_from`; alvo: Opção 3 |
| Opção 3 | corrente preguiçosa: uma linha exigível por vez; a próxima nasce ao concluir |

O que esta análise NÃO faz: escolher entre elas, medir carga (isso é T-F7-05), definir cobertura de conteúdo (T-F7-06).

## 2. Comandos de busca reproduzíveis

Todos a partir da raiz da worktree, com `git grep` (rastreia só arquivos versionados e não depende de instalar nada).

```
C1  git grep -n "completed_at" -- server/src shared
C2  git grep -n "review_tasks" -- server/src shared server/migrations
C3  git grep -n -E "reviewDone|reviewsOverdue|completedAt" -- src shared server/src ":!src/i18n"
C4  git grep -n -E "dueDate|due_date" -- server/src/services server/src/domain src/app.js src/stats.js src/tracking-state.js src/upcoming-reviews.js src/overdue-groups.js src/today-priority.js
C5  git grep -n -E "getSnapshotPage|computeDataRevision|PENDING_SELECT|syncSnapshot|loadSnapshot" -- server/src src
C6  git grep -n -E "reopen" -- server/src src
C7  git grep -c "review_tasks" -- src/db.js src-tauri/src/lib.rs
C8  git grep -n "review_task_id" -- server/src server/migrations
C9  git grep -n -E "reviewTasks|review_tasks" -- shared/logical-import.js shared/import-normalization.js server/src/backup.js server/src/services/logical-restore.js server/src/services/imports.js server/src/dev-restore.js server/src/dev-diagnostics.js
C10 git grep -n -E "reviewTask|review-task|reviewsOverdue" -- test server/test e2e
```

## 3. Inventário de consumidores do predicado "etapa aberta" (`completed_at IS NULL` ou `!reviewDone`)

Impacto por opção: **P** = o predicado precisa ser trocado por "aberta e não fechada"; **D** = DTO ou contrato muda; **-** = não muda; **R** = revisão de regra de negócio.

### 3.1 Servidor, leitura

| # | Local (arquivo:linha) | O que faz hoje | Opção 2 | Opção 3 |
|---|---|---|---|---|
| S1 | `server/src/services/reviews.js:63` | `agenda`: vencidas (`completed_at IS NULL AND due_date < hoje`) | P | P (só existe 1 linha aberta por unidade; o predicado simplifica mas ainda precisa excluir fechadas) |
| S2 | `reviews.js:64` | `agenda`: vencem hoje | P | P |
| S3 | `reviews.js:65` | `agenda`: vencem amanhã | P | P: amanhã deixa de listar etapas futuras que ainda não existem (muda o que o aluno vê em Hoje) |
| S4 | `reviews.js:70-72` | `agenda`: concluídas hoje (`completed_at IS NOT NULL`, dia local em JS) | - (SUPERSEDED não tem `completed_at`) | - |
| S5 | `reviews.js:84-92` (`list`) | lista TODAS as linhas da conta; alimenta `GET /v1/review-tasks` e `priorities` | D: devolver `status` e `closed_reason`; consumidores decidem | D |
| S6 | `reviews.js:30-40` (`taskDto`) | DTO: `id`, `unitId`, `dueDate`, `completedAt`, `offsetDays` | D aditivo: `status`, `closedReason`, `plannedDueDate` | D: `stageIndex`, `derivedFrom` |
| S7 | `server/src/services/agenda-snapshot.js:28` (`PENDING_SELECT`) | pendentes para o cache offline | P (excluir fechadas) | P |
| S8 | `agenda-snapshot.js:62` (`computeDataRevision`) | hash de `id:due_date` dos pendentes | R: se uma linha fechada continuar na consulta, mudar o status não muda o hash e o cliente mistura gerações (ver 6); basta excluir as fechadas da consulta | idem |
| S9 | `server/src/services/priorities.js:33` + `server/src/domain/priorities.js:94` | `reviews: listReviews(...)`, filtra `!r.completedAt && r.dueDate <= today` | P (sem isso uma SUPERSEDED vira prioridade OVERDUE) | P |
| S10 | `server/src/services/attempts.js:301` (`priorWrongExercises`) | junta `review_tasks rt` por `rt.id` para achar o último resultado ignorando a própria revisão | - (usa o id; funciona com linha fechada) | R: a linha derivada precisa existir antes de abrir a revisão, senão o id não existe |
| S11 | `attempts.js:74` | confere que a revisão é da conta e da mesma unidade ao iniciar tentativa | - | - |
| S12 | `attempts.js:232` (`listForReviewTask`) | confere a revisão antes de listar tentativas | - | - |
| S13 | `server/src/services/review-results.js:12,58,68` | `reconcile`: eventos efetivos de uma revisão | - | - |
| S14 | `server/src/services/exercise-review.js:100` | detalhe de tentativas por evidência/`review_task_id` | - | - |
| S15 | `server/src/services/evidence.js:30-35` (`IS_CURRENT_SQL`) | evidência é "atual" se não há linha posterior da mesma revisão | - (fechamento não cria evidência) | R: se a linha derivada for anulada ao reabrir, nenhuma evidência aponta para ela |

### 3.2 Servidor, escrita

| # | Local | O que faz hoje | Opção 2 | Opção 3 |
|---|---|---|---|---|
| W1 | `reviews.js:104-153` (`complete`) | transação: grava `completed_at`, 1 linha REVIEW em `learning_evidence` (`:136`), idempotência | R: passa a classificar o resultado e a aplicar o plano na MESMA transação | R: passa também a criar a próxima linha |
| W2 | `reviews.js:122-124` | `ALREADY_COMPLETED` se já concluída | - | - |
| W3 | `reviews.js:163-170` (`reopen`) | zera `completed_at`, não apaga evidência | R: precisa desfazer as SUPERSEDED e as datas (`undoRecovery`) | R: precisa anular a linha derivada (ver 7) |
| W4 | `server/src/services/learning-units.js:121-125` | cria as 16 linhas no cadastro | - | R: cria 1 |
| W5 | `server/src/services/accept-draft.js:157` | idem ao aceitar rascunho | - | R: cria 1 |
| W6 | `server/src/services/imports.js:280-287` | importa linhas com `completed_at`; recalcula `offset_days` | D (colunas novas viram NULL) | R: importar histórico antigo (16 linhas) para um modelo de 1 linha |

### 3.3 Cliente (REMOTE_MODE; é o que o Desktop usa)

| # | Local | O que faz | Opção 2 | Opção 3 |
|---|---|---|---|---|
| C-1 | `src/remote-store.js:117-130` (`mapReviewTask`) | `reviewDone = completedAt != null`, `reviewNumber = REVIEW_DAY_OFFSETS.indexOf(offsetDays)+1` | D + P: `reviewDone` passa a ser falso para SUPERSEDED, então este mapeamento não basta; precisa de `status` | D: `reviewNumber` deriva de `offset_days`, deixa de valer (precisa `stageIndex`) |
| C-2 | `remote-store.js:168-181` (`update`) | `reviewDone:false` vira `reopen`, `true` vira `complete` | R (reopen) | R |
| C-3 | `remote-store.js:199-207` (`complete`, `reopen`) | POST nos endpoints | - | - |
| C-4 | `src/stats.js:109-113` | `reviewsDone`, `reviewsOverdue = !reviewDone && dueDate < today` | P: SUPERSEDED não pode contar como vencida; D-8 pergunta se haverá `reviewsMissed`. Superfície protegida (ADR-0001) | idem |
| C-5 | `src/tracking-state.js:9,15,19` | ATRASADO, EM_REVISAO, EM_ESTUDO a partir de `!reviewDone` | P: sem isso a unidade fica ATRASADO para sempre | P: sem linhas futuras, `hasFuturePending` (regra 4) é falso após concluir a última aberta; é preciso garantir que sempre exista a linha derivada |
| C-6 | `src/app.js:1232-1235` | Hoje: pede 4 listas da agenda (hoje, vencidas, concluídas hoje, amanhã) | - (vêm filtradas do servidor, S1-S4) | R: "amanhã" muda |
| C-7 | `src/app.js:1317` (`pickPrimaryReview`), `src/today-priority.js:14-31` | escolhe a ação primária entre as listas já filtradas | - | - |
| C-8 | `src/app.js:1346` (`groupOverdueByUnit`), `src/overdue-groups.js:18-29` | agrupa vencidas por unidade | - (continua válido; com a Opção 2 o cartão passa a ter no máximo 1 etapa vencida depois da recuperação) | cartão agrupado perde sentido (1 linha por unidade) |
| C-9 | `src/app.js:1472,1587,2187` (`getAll`) + `:1643,2229-2230,2261,2320` | Plano: "próxima revisão", contagem feitas/pendentes, botão "Ir para revisão" | P (três usos de `reviewDone`; `:1643` e `:2261` escolhem a menor `dueDate` das não feitas e pegariam uma SUPERSEDED) | P + R: "Próx." deixa de mostrar calendário futuro (só 1 data) |
| C-10 | `src/app.js:1130-1131,1154`, `src/upcoming-reviews.js:14` | modo offline: vencidas e do dia a partir dos itens do snapshot por `dueDate`; próximas = `dueDate > today` | P: o snapshot só pode conter abertas (S7); o cliente não tem como saber o status | R: sem linhas futuras, "Próximas revisões" offline desaparece |
| C-11 | `src/app.js:5298-5300` | marca "Revisão feita" (`DB.reviewTasks.update`) | R | R |
| C-12 | `src/offline-store.js:115-139` | sincroniza as páginas do snapshot e troca a geração inteira | - (depende de S8) | - |

### 3.4 Documentos e módulos que AINDA NÃO existem

- `shared/day-plan.js` (frente A, T-F12-04): `git ls-files shared` não o lista. Quando existir, entra na tabela 3 como consumidor do predicado.
- Data de prova: nenhum campo (`git grep -n -i "exam_date"` sem resultado); pertence a T-F12-10.

## 4. Contratos e DTOs

| Contrato | Hoje (LIDO) | Mudança mínima |
|---|---|---|
| `GET /v1/review-tasks` e `/v1/agenda` | `taskDto` (S6): sem estado | acrescentar `status` (`PENDING`, `DONE`, `SUPERSEDED`), `closedReason`, `plannedDueDate`. Aditivo; clientes antigos ignoram |
| `GET /v1/agenda-snapshot` | `itemDto` de `agenda-snapshot.js:36-46`: sem estado, sem flag | nada, SE a consulta excluir as fechadas |
| Cliente `mapReviewTask` | C-1 | mapear `status`; `reviewDone` continua para compatibilidade |
| `POST /v1/review-tasks/:id/complete` | resposta atual da transação | devolver o efeito (próxima data e motivo) para o texto de resultado (AC-9.15) |
| Idempotência | `operationKey` no servidor; o cliente NÃO envia (`telemetry-audit.md` §1.2) | para o plano de recuperação a chave precisa ser enviada pelo cliente ou derivada no servidor |

## 5. Backup, restauração lógica e importação

| Local | Fato (LIDO) | Impacto |
|---|---|---|
| `server/src/backup.js:49` | exporta `SELECT * FROM review_tasks` (todas as colunas) | colunas novas saem no export sem mudança |
| `shared/logical-import.js:66-75` | `reviewTasks.cols` lista só `unit_id, offset_days, due_date, completed_at, created_at` | **coluna nova não listada é descartada em silêncio na restauração** (`telemetry-audit.md` §1.6). Toda coluna nova (`closed_at`, `closed_reason`, `planned_due_date`; ou `stage_index`, `derived_from`) precisa entrar aqui |
| `server/src/services/logical-restore.js:25` | restaura as tabelas por conjunto | tabela nova de log (`review_schedule_log`) precisa entrar nos conjuntos e na ordem de dependência |
| `server/src/backup.js:63` | `BACKUP_TABLES` | idem |
| `server/src/services/imports.js:280-287`, `shared/import-normalization.js:219,269-290,352` | importa backup antigo: `completedAt`, evidência derivada de tarefa concluída; recalcula `offset_days` | backups antigos não têm as colunas novas: ficam NULL (válido). Opção 3: ver 9 |
| `server/src/dev-restore.js:50`, `server/src/dev-diagnostics.js:5` | contagens por tabela | só se a tabela nova entrar nas contagens |
| Sensores | `server/test/backup-contract.test.js`, `logical-restore.test.js`, `logical-import.test.js`, `import-commit.test.js`, `import-normalization.test.js`, `dev-restore.test.js` | ida e volta com etapas fechadas (AC-9.12); sem isso a perda é silenciosa |

## 6. Snapshot offline: o ponto mais frágil

LIDO: `PENDING_SELECT` seleciona `completed_at IS NULL` (S7) e `computeDataRevision` faz hash de `id:due_date` (S8). O cliente classifica vencida/hoje/próxima pela PRÓPRIA data (`app.js:1130-1131`), "porque um dispositivo offline não confia no 'hoje' do servidor".

Consequências (INFERIDO, a partir dessas linhas):
1. Se uma etapa SUPERSEDED continuasse com `completed_at NULL` e entrasse na consulta, o modo offline a mostraria como vencida: a dívida "ressuscitaria" só offline. A correção é excluir fechadas em `PENDING_SELECT`, não mexer no cliente.
2. Se a decisão de manter a linha na consulta com um sinalizador fosse tomada, o hash precisaria incluir o status; do contrário, fechar uma etapa sem mudar a data deixaria o `dataRevision` igual e o cliente poderia misturar páginas de gerações diferentes.
3. Reagendar muda `due_date`, logo muda o hash: já é seguro.
4. Teste que protege: `server/test/agenda-snapshot.test.js`, `test/upcoming-reviews.test.js`, `e2e/offline.spec.js`, `e2e/offline-writes.spec.js`.

## 7. Estados, transições e `reopen`

Estados do `getTrackingState` (`src/tracking-state.js`): ATRASADO > SEM_EVIDENCIA > EM_REVISAO > EM_ESTUDO > EM_DIA, todos derivados de `reviewDone` e `dueDate` (C-5).

| Cenário | Opção 2 | Opção 3 |
|---|---|---|
| Unidade empilhada depois da recuperação | etapa realizada + SUPERSEDED + futuras reagendadas; só funciona se C-5 ignorar SUPERSEDED | uma linha; as outras nunca existiram |
| Reabrir uma revisão que disparou a recuperação | `reviews.reopen` (S/W3) só zera `completed_at`; sem desfazer, sobram etapas SUPERSEDED irmãs e datas já mexidas: `undoRecovery(operationKey)` (proposta §8) precisa ser chamado dentro do reopen, e recusa se alguma derivada foi concluída | a linha derivada precisa ser anulada. **Restrição verificada:** `learning_evidence.review_task_id` tem chave estrangeira composta para `review_tasks(user_id,id)` (`server/migrations/004-learning-domain.sql:105`), então linha com evidência não pode ser apagada. `exercise_attempts.review_task_id` não tem FK no banco (o vínculo é conferido no serviço, `attempts.js:74`), mas apagar a linha deixaria tentativas órfãs. Na prática a linha só pode ser marcada (`VOIDED`) |
| Reabrir uma revisão que NÃO disparou recuperação | caminho de hoje | idem hoje |
| Concluir de novo (TG-02) | a evidência anterior vira "não atual" (`IS_CURRENT_SQL`); o plano de recuperação não deve reaplicar (chave de idempotência) | idem |
| "Revisão só leitura" (sem questões) | `NO_EVIDENCE`: conclui só a etapa, nada substituído (R4 da proposta) | cria a próxima linha? decisão de D-12/D-13 |

## 8. Calendário das unidades em dia (D-14)

LIDO: a âncora das datas é o estudo (`shared/review-schedule.js`, `generateReviewDates(studyDate)` usado em `learning-units.js:121` e `accept-draft.js:157`); concluir com atraso não move as seguintes.

- Opção 2: nada muda para unidade em dia. A âncora só muda no gatilho de empilhamento (etapa seguinte também vencida). Cumpre a direção só para unidades já empilhadas (`hg-09-proposal.md` §0.2).
- Opção 3: a âncora passa a ser SEMPRE a data real da revisão. Muda `due_date` futura de TODAS as unidades, inclusive as em dia: afeta "Próx." no Plano (C-9), "Amanhã" (S3), `upcoming-reviews`, `priorities`, e a previsão de carga da frente A (T-F12-09).
- Pergunta aberta para D-14: a âncora real vale também para quem estuda em dia? Mudar isso altera o calendário que o aluno já tem.

## 9. Migração das 16 linhas por unidade

Fato de partida: o seed sintético tem 10 unidades x 16 = 160 linhas, 34 vencidas, a mais antiga com 104 dias (INFORMADO por `hg-09-proposal.md` §0.7 e memória do projeto; não medido por mim; o banco vivo não foi aberto).

| Opção | O que acontece com as linhas existentes |
|---|---|
| 2 | nenhuma linha é alterada pela migração (colunas novas nulas). A recuperação só age ao concluir uma revisão elegível |
| 3, caminho (a): apagar as futuras | **destrutivo e bloqueado**: INV-07 (migração só para frente, nenhuma destrutiva sem decisão humana) e a FK da evidência (`004-learning-domain.sql:105`); só as sem referência poderiam sair |
| 3, caminho (b): manter e esconder | marcar as futuras como dormentes e gerar `stage_index` por `indexOf(offset_days)+1`. Mantém os predicados de 3.1 a 3.3, só que com mais um estado: perde o ganho de simplicidade |
| 3, caminho (c): converter sob demanda | só a linha aberta mais antiga fica ativa; o resto dormente até a vez de cada uma. Mesma complexidade que (b) |

INFERIDO: a Opção 3 NÃO elimina o trabalho de 3.1 a 3.3; ela acrescenta `stage_index`/`derived_from` e a regra de criação por conclusão. Só a Opção 2 deixa a migração dos dados antigos como no-op.

## 10. Esquema e numeração de migrações

Esquema previsto por `hg-09-proposal.md` §8, aditivo e nulável: `review_tasks.closed_at`, `closed_reason` (`SUPERSEDED` | `VOIDED`), `planned_due_date`; tabela `review_schedule_log` (append-only); e `subjects.exam_date` na fase 4.

Fatos novos:
- O manifesto termina em 033 (`server/migrations/manifest.json`). **034 está pedida por três frentes:** HG-09 (aqui), telemetria (contexto da tentativa, `v1-closure-telemetry`, D-T2) e a frente A (disponibilidade; `daily-plan-time-budget-v1/spec.md:127`). Ver `DECISIONS_BRIEF.md` D-T2: proposta de ordem 034 telemetria, 035 HG-09, 036 frente A.
- O backend roda `runMigrations(db)` ao subir (`server/src/main.js:69`) e antes tira snapshot verificado `pre-migrate-v<N>` (`main.js:55-69`, `dev-snapshot.js:116`); se o snapshot falhar, recusa migrar. Não há "down".
- A aceitação de `ALTER TABLE ... ADD COLUMN ... CHECK` pelo SQLite do projeto continua NÃO VERIFICADA. O precedente existente é `ADD COLUMN` sem CHECK (`021-practice-evidence-attempt-link.sql`).
- O ledger é protegido por `server/test/ledger-immutability.test.js` (TG-09): nenhum `UPDATE`/`DELETE` em `learning_events` e `learning_evidence`. Fechar etapas toca só `review_tasks`; uma tabela de log nova deve ser append-only e ganhar guarda equivalente.

## 11. Reversão

| Situação | Opção 2 | Opção 3 |
|---|---|---|
| Antes de liberar | testes AC-9.1..9.19 vermelhos bloqueiam | idem + invariantes novas |
| Desfazer uma operação | `undoRecovery(operationKey)` pelo log, se nenhuma derivada foi concluída | anular a linha derivada, só se não houver evidência nem tentativa apontando para ela |
| Voltar o código depois de uso real | o código antigo trata SUPERSEDED como pendente e a dívida reaparece. Procedimento obrigatório: script "desfazer todas" a partir do log ANTES do downgrade (HG9-C7) | idem, mais linhas derivadas que o código antigo ignora ou mostra |
| Salvaguarda de dados | snapshot `pre-migrate` automático (LIDO) | idem |
| Gatilho de desligar sem reverter código | política que força `NO_EVIDENCE` para tudo (proposta §8.4) | não há equivalente simples |

## 12. Plataformas (INV-26: PASS em uma não prova as outras)

- **Web e Windows** usam o caminho do servidor (Windows = modo remoto com backend local; memória do projeto ARCH-01). Os pontos 3.1 a 3.3 cobrem esse caminho.
- **Cliente local legado:** `src/db.js` tem 31 linhas que citam `review_tasks` (`git grep -c`, C7), `src-tauri/src/lib.rs` 25, e `src/db.js` mantém `reviewDone`/`review_done` (`db.js:92,404,453,813-830`). A proposta registrou 46 e 34 menções com outro critério de contagem; as duas contagens não são comparáveis. Memória do projeto diz que esse caminho é código morto no Windows (NÃO REVERIFICADO aqui).
- **Android:** Companion somente leitura segundo o ledger (E-13); como ele lê o calendário não foi verificado. Declarar Android como NOT_PROVEN até D-11.

## 13. Sensores que protegem e os que faltam

| Existem (arquivos listados por `ls`) | Cobrem |
|---|---|
| `server/test/reviews.test.js`, `evidence-current.test.js`, `evidence.test.js` | concluir, reabrir, evidência atual |
| `server/test/agenda-snapshot.test.js`, `test/upcoming-reviews.test.js` | geração do snapshot, próximas |
| `server/test/priorities.test.js`, `priorities-service.test.js` | filtro de abertas em prioridades |
| `test/tracking-state.test.js`, `test/stats.test.js`, `test/overdue-groups.test.js`, `test/today-priority.test.js`, `test/remote-store.test.js` | estados, contadores, agrupamento, escolha primária, mapeamento |
| `server/test/backup-contract.test.js`, `logical-restore.test.js`, `logical-import.test.js`, `import-commit.test.js` | ida e volta |
| `server/test/ledger-immutability.test.js` | ledger imutável |
| `e2e/hoje-overdue-groups.spec.js`, `hoje-block-retest.spec.js`, `today-primary-action.spec.js`, `offline.spec.js`, `plan-study-now.spec.js`, `stats-*.spec.js` | fluxos de tela |

Faltam (INFERIDO, derivados de `hg-09-proposal.md` §9): teste de propriedade com hash das tabelas históricas antes/depois (AC-9.1), tabela de casos da função pura de classe (AC-9.4), ida e volta com etapas fechadas (AC-9.12), concordância Hoje/Plano/Estatísticas/offline sobre "aberta" (AC-9.14), mutante que remova o filtro de fechadas em `agenda`, `PENDING_SELECT` e `priorities`.

## 14. O que mudou desde o texto de `hg-09-proposal.md` (HEAD 80627a4)

| Afirmação da proposta | Estado neste HEAD |
|---|---|
| `reviews.js:128` grava `evidence_date` em UTC (§2, A6) | corrigido por `760491c` (TG-01): dia local do fuso salvo (`reviews.js:128-129`) |
| reabrir e concluir de novo duplica evidência | corrigido por `f0aae39` (TG-02): `evidence.list` devolve só a atual (`evidence.js:30-35`) |
| `reviews.js:63` etc. | linhas conferidas hoje: 63, 64, 65, 70-72, 84, 104, 163 |
| ledger sem sensor | agora há `ledger-immutability.test.js` (TG-09) |
| agrupamento "não integrado" | integrado ao branch de uso (`d8e2443`, `6aa6198`, `7591c59`) |
| defeito latente de repetir as mesmas questões em etapas empilhadas | continua NÃO reproduzido; `hoje-overdue-groups.spec.js` prova o cartão, não o defeito |

## 15. Esforço relativo e riscos por opção (INFERIDO)

| | Opção 2 | Opção 2 e depois 3 | Opção 3 |
|---|---|---|---|
| Arquivos de produto tocados | cerca de 12 a 15 (S1-S9, W1, W3, C-1, C-4, C-5, C-9, C-10, restore/backup) | os mesmos + `stage_index` em C-1, W4, W5, W6 | os da segunda coluna + C-6 e C-8 reescritos |
| Migrações | 1 aditiva (+ log) | 2 | 2 ou mais, com tratamento das 16 linhas |
| Risco principal | esquecer um consumidor do predicado (dívida ressuscita, 3.1 a 3.3) | esquema mal previsto | reabrir, FK e perda do calendário futuro no Plano |
| Conflito com a Constituição §21/§91-C e INV-04 | moderado | moderado, depois forte | forte (viola INV-04 de fato) |
| Reversível por log | sim | parcial | difícil |

Esta tabela é estimativa por contagem de arquivos; NÃO foi medida em carga nem em tempo de trabalho.

## 16. Não verificado

- Como o Android consome o calendário e se algum cliente fora da lista 3.3 lê `review_tasks`.
- Se a versão do SQLite embarcada aceita `ADD COLUMN ... CHECK`.
- O defeito de repetição de questões em etapas empilhadas (nunca reproduzido).
- Qualquer consumidor em `src-tauri/src/lib.rs` no caminho remoto (a contagem 25 é só de menções).
- O estado real do banco vivo (34 vencidas, 104 dias): dado de documentos, não medido.
- Este documento não roda nenhum comando de busca por você; os comandos C1 a C10 são os que reproduzem as tabelas.
