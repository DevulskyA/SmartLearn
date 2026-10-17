# Plano do dia com orçamento de tempo — v1 (frente A, primeiro incremento)

```
STATUS=PROPOSED  (precisa da aprovação do aluno: HG-14. Nada neste documento autoriza implementação)
DATA=2026-10-17
CLASSIFICAÇÃO=direção CANÔNICA (Constituição I.19, spec do roadmap R-14, INV-15, INV-16) · desenho DERIVADO (agente) · números de duração = ESCOLHA DE PRODUTO provisória, sem fonte
BASE_LIDA=worktree smartlearn-v1-complete, HEAD 85636c2 (código somente lido; nenhum arquivo de código, teste, banco ou dado foi tocado)
REQUISITOS=R-14 (AC-14.1, AC-14.2, AC-14.3, AC-14.8) · INVARIANTES=INV-15, INV-16, INV-05 do roadmap (abrir não grava)
TAREFAS=tasks.md desta pasta (T-F12-01..06); o ESTADO de cada uma vive no registro de `hardening-roadmap-v1/tasks.md` (seção "Frentes A e B")
```

Legenda de classificação: CANÔNICO = decisão humana vigente · DERIVADO = análise ou recomendação de agente, não é decisão · HISTÓRICO = preservado e não ativo · CONFLITO = incompatibilidade a decidir por humano. Provas: LIDO = confirmado lendo código ou documento nesta sessão; NÃO VERIFICADO = dito sem prova.

---

## 1. Problema e papéis (CANÔNICO)

A escola define a carga acadêmica (aulas, materiais, conteúdo, provas). O SmartLearn não controla essa entrada: não bloqueia aulas novas, não presume que o conteúdo é pequeno e não descarta conhecimento obrigatório para caber no tempo. O aluno tem um tempo real por dia. O SmartLearn gerencia a APRENDIZAGEM: organiza o que precisa ser feito, considera o tempo real, entrega um plano executável e, quando o tempo não basta, MOSTRA o déficit e suas consequências observáveis, sem esconder tarefas nem declarar conhecimento dominado de forma artificial (Constituição I.19; INV-15, INV-16).

Esta spec cobre SOMENTE o problema A (prevenir sobrecarga) e SOMENTE o primeiro incremento candidato: orçamento de tempo + plano do dia. O problema B (dívida artificial de revisões, HG-09) é outra frente, com decisões próprias; este incremento lê o calendário vigente e NÃO o altera.

## 2. Resultado observável

Ao abrir Hoje no modo com servidor, o aluno que informou quanto tempo tem vê: (1) um plano do dia, uma sessão curta e ordenada de unidades, cada uma com duração estimada e a primeira marcada "Comece por aqui"; (2) quanto do que está vencido NÃO cabe hoje, em minutos e em unidades; (3) o que isso significa de forma factual (o que continua vencido amanhã), sem juízo de valor. O aluno que não informou o tempo continua vendo Hoje como hoje, com o tempo estimado total, e NENHUMA afirmação de déficit.

Prova de valor de uso (alvo, não medido): com o banco sintético atual (34 etapas vencidas em 10 unidades; informado pelo coordenador, não reconferido aqui), o aluno consegue dizer em menos de 10 segundos "o que faço agora, quanto tempo leva e quanto fica de fora".

## 2b. Por que este é o menor incremento (avaliação das seis capacidades; DERIVADO)

| Capacidade | Dados novos que exige | Custo relativo | Valor para o problema | Depende de | Veredito |
|---|---|---|---|---|---|
| 1. Orçamento de tempo | uma entrada (disponibilidade) | baixo (uma coluna aditiva em `user_settings`, uma tela de campo) | alto: sem tempo não existe déficit mensurável | nada | INCREMENTO 1 |
| 2. Plano do dia | estimativa de duração por item (função pura) | baixo-médio (lógica pura + um bloco em Hoje) | alto: transforma fila longa em sessão executável | 1 e estimativa | INCREMENTO 1 |
| 3. Previsão de carga | estimativa; calendário futuro (já existe); efeito de aulas novas (hipótese) | médio | alto, mas depende do calendário que a frente B pode mudar | 1, estimativa, contrato de calendário (B) | depois (T-F12-09) |
| 4. Priorização acadêmica | data de prova, relevância clínica, entidade de conhecimento: nenhum existe | alto (campos novos e critérios que exigem decisão) | alto, mas sem dado hoje | decisões do aluno (D-6), mapa de conhecimento (F2) | depois (T-F12-10, T-F12-11) |
| 5. Rastreio de comportamento | modelo de sessão e instrumentação | médio-alto | médio: calibra estimativas e detecta atraso cedo | 1 e 2 em uso | depois (T-F12-12) |
| 6. Pausas e retomadas | regra de retomada (liga com a frente B) | alto | médio, futuro | 3, 5 e decisão HG-09 | futuro (T-F12-13) |

Sequência mínima que entrega valor real: 1+2 (este spec) → calibrar a estimativa com tempo medido → previsão de carga → prova e priorização → rastreio → pausas. As seis NÃO são construídas juntas.

## 3. Estado real do código (LIDO em 2026-10-17, HEAD 85636c2)

| Fato | Evidência |
|---|---|
| Hoje carrega vencidas, de hoje, de amanhã e concluídas de hoje por `DB.reviewTasks.getOverdue/getForToday/getTomorrow/getCompletedToday` e, por unidade visível, os exercícios (`DB.exercises.getAll`, que exclui arquivados) | `src/app.js` `renderToday` (linhas ~1174-1285); `server/src/services/exercises.js` (lista sem arquivados por padrão) |
| A "ação primária" escolhe uma etapa por camada: 0 tem item errado ainda não respondido, 1 tem exercício ainda não respondido, 2 tudo respondido, 3 sem exercícios; vencidas antes das de hoje | `src/today-priority.js` (`reviewTier`, `pickPrimaryReview`) |
| O resumo de carga de Hoje só conta itens ("N atrasadas · N hoje · N amanhã · N feitas"); não há duração | `src/app.js` (~1320-1330), chaves `today.load.*` |
| NÃO existe: estimativa de duração por tarefa, disponibilidade diária, data de prova, rastreio de sessão de estudo | busca por `duration`, `estimat`, `availab`, `exam_date`, `study_session`, `minutes`, `elapsed` em `src/`, `server/src/`, `shared/` e `server/migrations/`: só `elapsedLabel` do cronômetro de GERAÇÃO de rascunho (não é estudo) |
| Existem timestamps reais por exercício: `exercise_attempts.started_at/submitted_at` (status STARTED, SUBMITTED, ABANDONED) e `exams.started_at/submitted_at` | `server/migrations/009-learning-events.sql`, `024-exams.sql`. Quando a tentativa é iniciada na tela e se o intervalo mede esforço (e não tempo ocioso): NÃO VERIFICADO |
| `user_settings` guarda timezone, calendário fixo, `ui_locale`, `generation_locale`; a migração 031 provou `ALTER TABLE … ADD COLUMN` nulável; GET de `/settings` nunca grava | `server/migrations/031-language-preferences.sql`; `server/src/services/settings.js`; `server/src/routes/settings.js` |
| O backup operacional copia a tabela `user_settings` inteira; o export/import LÓGICO só carrega `timezone` e `updatedAt` | `server/src/backup.js:63`; `shared/logical-import.js` (~372-381); `server/src/services/logical-restore.js` (~145-151). Observação: as preferências de idioma tampouco constam do restore lógico (lido, não testado): lacuna existente, fora deste escopo |
| `GET /v1/review-tasks` devolve TODAS as etapas, também as futuras (Plano já as usa); a agenda do servidor separa vencidas, hoje e amanhã | `server/src/services/reviews.js` (`agenda`, `list`); `src/remote-store.js` |
| Recursos só do servidor já degradam em silêncio no modo local (`REMOTE_MODE && DB.priorities?.get`) | `src/app.js` `renderWeakPractice` |
| Hoje, no HEAD de uso, é uma lista PLANA por etapa; o agrupamento por unidade existe só na branch `claude/smartlearn-v1-split-fatia2` (`7b44104`, `f55da10`), não integrado | `git log` da branch conferido; integração depende de HG-05/HG-10 |
| Estatísticas é a única superfície formalmente protegida (ADR-0001); Hoje não é, mas mudança de aparência exige aprovação do aluno | `.specs/adr/ADR-0001-protected-surfaces-design-non-regression.md` |

## 4. Requisitos (DERIVADO; cada um com critério de aceitação verificável)

### DP-R1 Disponibilidade declarada, opcional e sem valor padrão
O aluno informa minutos disponíveis por dia da semana (7 posições, domingo a sábado). Cada posição é inteiro de 0 a 1440 ou vazia. Vazia = "não informado" (diferente de 0 = "neste dia não estudo"). Nenhum valor padrão é inventado.
- AC-1.1 `GET /v1/settings` devolve `studyAvailability: null` enquanto o aluno nunca informou, e a leitura NÃO grava (como as demais preferências).
- AC-1.2 `PATCH /v1/settings` com `studyAvailability` valida: inteiros 0 a 1440 ou `null` por posição, exatamente 7 posições; recusa negativo, decimal, texto, NaN, posição a mais ou a menos com `VALIDATION_FAILED` e o campo; não altera timezone nem idioma; repetir o mesmo corpo não muda nada além de `updatedAt`.
- AC-1.3 O dia da semana de "hoje" sai da data LOCAL do aluno (`YYYY-MM-DD` já usada por Hoje) lida como data de calendário, sem segunda conversão de fuso. Teste nas fronteiras: virada de ano, 29/02, e 23h30 em `America/Sao_Paulo` (já é o dia seguinte em UTC).

### DP-R2 Estimativa de duração por item: provisória, rotulada, determinística
Função pura `estimateItemMinutes({ pendingExercises })` em `shared/study-time-estimate.js`, com `ESTIMATE_POLICY_VERSION = 1`. Fórmula inicial: `ceil(BASE + pendingExercises × POR_EXERCICIO)` com `BASE = 3` min e `POR_EXERCICIO = 1,5` min. Esses dois números são ESCOLHA DE PRODUTO PROVISÓRIA, sem fonte (nenhuma fonte sobre tempo por questão foi lida) e ficam em UM módulo, versionados, para troca por valor medido (T-F12-07).
- `pendingExercises` = exercícios ativos da unidade que ainda não foram julgados NESTA etapa (o mesmo `judgedIds` que `reviewTier` usa). Unidade sem exercícios: só `BASE`.
- Sempre exibida como estimativa ("~") e com o rótulo "estimativa inicial" enquanto a política for a provisória.
- AC-2.1 Tabela de casos: 0 pendentes = 3; 4 = 9; 10 = 18; 7 (de 10, 3 já julgados) = 14. Mesmo resultado em chamadas repetidas; sem leitura de relógio.
- AC-2.2 Nenhum item recebe estimativa menor que `BASE`; nunca NaN nem negativo, nem para entrada inválida (entrada inválida é recusada, não coagida).

### DP-R3 O item do plano é a UNIDADE, não a etapa (decisão DP-D5)
Um item por unidade que tenha ao menos uma etapa aberta e vencida (atrasada ou de hoje). Campos: `unitId`, `primaryTaskId` (a etapa aberta mais antiga da unidade, a que a conclusão legítima deve fechar primeiro), `stagesOpen` (nº de etapas abertas e vencidas da unidade), `estimatedMinutes` (UMA passagem pelos exercícios, que são os mesmos em todas as etapas), `group` (`OVERDUE` se alguma etapa está atrasada, senão `TODAY`).
- As etapas adicionais (`stagesOpen − 1`) NÃO somam tempo, mas são CONTADAS e mostradas ("+4 etapas desta unidade seguem vencidas"). Motivo: somar 5× os mesmos exercícios inflaria o tempo e repetiria o defeito latente descrito em `hg-09-proposal.md` §2; não contá-las esconderia dívida (INV-16).
- AC-3.1 Para qualquer entrada, a soma de `stagesOpen` de todos os itens (plano + fora do tempo) é igual ao total de etapas abertas e vencidas que Hoje já exibe (conservação).
- AC-3.2 `primaryTaskId` é a etapa aberta e vencida de menor `dueDate` da unidade (desempate por id).

### DP-R4 Ordem = protocolo vigente, nenhuma fórmula nova
1. O primeiro item é a unidade da etapa que `pickPrimaryReview` já escolhe (a mesma "ação primária" de Hoje; o plano nunca contradiz o botão principal).
2. Os demais: itens com etapa atrasada antes dos que só vencem hoje (Constituição §22); dentro do grupo, o de etapa mais antiga primeiro (ordem do servidor); desempate por camada de `reviewTier` (menor primeiro) e depois `unitId`.
3. Nenhum critério novo (prova, importância, dificuldade) entra neste incremento (Constituição §35; DECISION_CONFLICT-5).
- AC-4.1 `plan[0]` pertence à unidade da ação primária; a ordem é estável e determinística.
- AC-4.2 Mutação "ordenar por menor duração" deixa um teste vermelho (INV-16: item longo e antigo não é rebaixado por ser longo).

### DP-R5 Corte pelo orçamento do dia, sem remover nada
Orçamento do dia = `minutesByWeekday[weekday(hoje)]`.
- Orçamento informado e > 0: os itens entram na ordem enquanto o acumulado couber; o PRIMEIRO item entra sempre, mesmo que sozinho exceda o orçamento (nunca um plano vazio com tarefa pendente). Itens após o corte vão, na mesma ordem, para "Fora do tempo de hoje" com seus minutos. Um item menor mais adiante NÃO é puxado para dentro (isso seria repriorizar em silêncio; decisão DP-D4).
- Orçamento 0: o plano de hoje fica vazio por escolha do aluno e todos os itens aparecem em "Fora do tempo de hoje".
- Orçamento não informado: sem corte e sem déficit; mostra o tempo total estimado e a oferta de informar a disponibilidade.
- AC-5.1 `plano ∪ fora = todos os itens`, sem repetição e sem perda (propriedade, com entradas aleatórias).
- AC-5.2 Mutação "tratar orçamento ausente como 0" e mutação "descartar os itens após o corte" ficam vermelhas.

### DP-R6 Déficit e consequências visíveis (INV-16)
Quando há itens fora do tempo, o bloco mostra, sempre visível no cabeçalho (o detalhe pode ser expandido, o resumo não): (i) minutos e unidades fora do tempo de hoje; (ii) quantas etapas seguem vencidas por unidade (`stagesOpen`); (iii) a idade, em dias, da etapa vencida mais antiga que ficou de fora (fato); (iv) uma frase de consequência só com fatos do calendário: o que sobrar continua vencido amanhã, mais N etapas que vencem amanhã (contagem, SEM minutos: os exercícios das unidades de amanhã não são carregados por Hoje, e estimar só com `BASE` seria falso).
- Proibido (texto, rótulo, cor ou ícone): dizer que o aluno "esqueceu" ou "perdeu" algo, sugerir pular, remover, adiar sem fim ou "não precisa", classificar qualquer item como dispensável, ou exibir domínio/nota. Linguagem declarativa e neutra (Constituição §36, §54).
- AC-6.1 Teste de texto: as chaves do déficit não contêm verbos de juízo da lista proibida (lista no teste).
- AC-6.2 Com a base sintética, o déficit exibido é exatamente `Σ minutos(fora) = Σ minutos(todos) − Σ minutos(plano)` e as contagens batem com a lista "Atrasadas" de Hoje.

### DP-R7 O plano é somente leitura e aditivo
Nenhuma escrita em `review_tasks`, `learning_evidence`, `exercise_attempts`, `learning_events`; nenhuma mudança no calendário de 16 etapas, no botão principal, nos contadores existentes ou nas listas "Atrasadas" e "Para hoje" (continuam mostrando TODAS as revisões). Abrir Hoje continua sem gravar (INV-05 do roadmap). A única escrita nova é o `PATCH` da disponibilidade.
- AC-7.1 Hash das tabelas históricas idêntico antes e depois de renderizar Hoje com o plano (teste de servidor/e2e com banco temporário).
- AC-7.2 Os testes e2e existentes de Hoje seguem verdes sem editar expectativas.

### DP-R8 Plataformas e modos (INV-26; decisão DP-D7)
O bloco existe no modo com servidor (Web e Windows com backend local, ARCH-01). No modo local legado e no Hoje offline (snapshot somente leitura) o bloco NÃO aparece e a lista atual permanece como está; isso é uma limitação REGISTRADA, não omissão silenciosa. Android/Companion: o Companion é Web/PWA somente leitura (ARCH-01); o caminho de dados do Android é NÃO VERIFICADO; declarar `SPEC_DEVIATION` até decisão. PASS em uma plataforma não prova as outras.

### DP-R9 Interface, texto e acessibilidade (portão de design)
Bloco "Plano de hoje" em Hoje; resumo "~X min de Y min" quando há orçamento; lista de itens (unidade, disciplina, ~min, "Comece por aqui" no primeiro, "+N etapas" quando houver); "Fora do tempo de hoje" com cabeçalho sempre visível (contagem e minutos) e lista expansível; campo de disponibilidade (7 dias) em Configurações, com explicação curta de que é opcional e para quê. Aparência e posição só após mockup aprovado pelo aluno (DP-D9; não há redesenho sem aprovação). Todo texto via `t()` no catálogo pt-BR (scanner de i18n continua em 0, `e2e/i18n-pseudo-flows.spec.js` sem texto fora do catálogo), 375 px sem rolagem horizontal, axe sem violações, alvos de toque ≥ 44 px.

### DP-R10 Contratos e dados (impacto)
- Migração aditiva: `ALTER TABLE user_settings ADD COLUMN study_availability TEXT` (nulável, sem CHECK: a validação fica no serviço, porque a aceitação de CHECK em `ADD COLUMN` pelo SQLite do projeto é NÃO VERIFICADA). Número da migração: o próximo livre no momento da implementação (a proposta HG-09 reserva 034/035 provisoriamente; coordenar para não colidir); entrada em `server/migrations/manifest.json` com checksum e teste em `migrations.test.js`; backup `pre-migrate` verificado antes de qualquer banco humano (INV-07). Nenhuma linha existente muda.
- Serviço e rota: `settings.get` passa a devolver `studyAvailability` (`{version: 1, minutesByWeekday: [7]}` ou `null`); `PATCH` na mesma transação dos demais campos; GET nunca escreve.
- Cliente: mapeamento em `src/remote-store.js`; módulos puros `shared/study-time-estimate.js` e `shared/day-plan.js` (sem DOM, sem relógio: `today` explícito); bloco em `renderToday`.
- Backup e restauração: o backup operacional cobre a coluna por copiar a tabela (a confirmar em teste); o restore lógico só leva `timezone` (decisão DP-D6: estender o contrato lógico com `exportVersion` ou declarar que a disponibilidade não é portada).
- Snapshot offline (`agenda-snapshot.js`), Estatísticas, Acompanhamento e o agendador de revisões: NÃO mudam.

## 5. Fora de escopo explícito (v1)

Previsão de carga de N dias; efeito de aulas novas; prioridade por prova, relevância clínica ou dificuldade; rastreio de tempo efetivo, sessões ou ausências; pausas e retomadas; ajuste "só para hoje"; calibração automática da estimativa; qualquer mudança no calendário de 16 etapas, na evidência ou nas tentativas; recuperação de atraso (frente B); escore de domínio; marcar conteúdo como dispensável; notificações; sincronização entre dispositivos; es/en; Estatísticas; plano offline, local legado ou Android.

## 6. Dependências

- Depende de decisão: HG-14 (esta spec, DP-D1..DP-D9).
- Depende de ordem de marcos: "produto utilizável" demonstrado (T-F4-01, primeira utilização real; PROGRAM §2c) antes de implementar.
- Recomendado antes da UI (T-F12-05): integrar o agrupamento por unidade (HG9-00, depende de HG-05/HG-10), porque o bloco convive com a lista de Hoje. Sem integração, o plano funciona sobre a lista plana atual, com valor menor.
- Independente de HG-09: lê o calendário vigente. Quando a frente B introduzir `SUPERSEDED` ou mudar o calendário, `shared/day-plan.js` entra na lista de consumidores do predicado "etapa aberta" (`hg-09-proposal.md` §0.5).
- Coordenar o número da migração com a frente B (034/035 provisórios).

## 7. Riscos

| ID | Risco | Mitigação |
|---|---|---|
| DR-1 | Estimativa errada cria falsa precisão ou falsa folga | rótulo "estimativa inicial", política versionada, calibração por tempo medido (T-F12-07), o plano NUNCA bloqueia nem remove tarefa |
| DR-2 | O plano vira mais uma fila e aumenta a carga cognitiva (Constituição §39) | mockup aprovado; UAT de 10 segundos; sem campos obrigatórios |
| DR-3 | Etapas empilhadas da mesma unidade ficam invisíveis | `stagesOpen` contado e mostrado (DP-R3); conservação testada (AC-3.1) |
| DR-4 | Fuso e fronteira de data (dia da semana errado perto da meia-noite) | usar o `today` local já existente; testes de fronteira (AC-1.3); Constituição §41 |
| DR-5 | Colisão de número de migração com a frente B | coordenar no momento da implementação; manifest com checksum |
| DR-6 | Restore lógico perde a disponibilidade | decisão DP-D6 antes de fechar T-F12-03 |
| DR-7 | Orçamento baixo mostra déficit grande e desmotiva | texto neutro, mostrar também o que cabe, sem rótulo sobre o aluno (Constituição §36, §54) |
| DR-8 | As constantes provisórias viram "verdade" por inércia | um módulo, versão explícita, rótulo na tela, tarefa de calibração registrada |
| DR-9 | Plataforma sem paridade | limitação registrada (DP-R8, DP-D7); gates separados (INV-26) |

## 8. Decisões do aluno (HG-14; dono: o aluno; preparo: agente)

| ID | Decisão | Opções | Recomendação (DERIVADA) | Depende de |
|---|---|---|---|---|
| DP-D1 | Aceitar UMA entrada nova, opcional, sem valor padrão (disponibilidade) | (A) sim; (B) não: plano só mostra tempo total | A (resolve DECISION_CONFLICT-4 com a menor entrada possível) | nada |
| DP-D2 | Origem da estimativa | (A) constantes provisórias fixas e rotuladas (3 min + 1,5 min por exercício) e calibrar depois; (B) o aluno ajusta os dois números; (C) esperar medição | A (menor custo; B e C entram depois se a prática mostrar necessidade) | DP-D1 |
| DP-D3 | Granularidade da disponibilidade | (A) por dia da semana; (B) um único valor; (C) por data | A | DP-D1 |
| DP-D4 | Regra de corte | (A) prefixo na ordem do protocolo, sem pular item longo; (B) menor duração primeiro | A (B rebaixa o item antigo por ser longo: viola INV-16) | nada |
| DP-D5 | O item do plano | (A) unidade, tempo de uma passagem, etapas extras contadas à parte; (B) uma linha por etapa, tempo somado por etapa | A (B infla o tempo com os mesmos exercícios) | HG-09 pode redefinir |
| DP-D6 | Restore lógico | (A) estender o export/import (`exportVersion`); (B) declarar que não é portado | A | nada |
| DP-D7 | Plataformas | (A) servidor (Web e Windows) agora; modo local, offline e Android/Companion sem plano, registrado como SPEC_DEVIATION; (B) exigir paridade antes | A | confirmar o caminho de dados do Android |
| DP-D8 | Texto da consequência | (A) só fatos do calendário; (B) incluir projeção de tempo de amanhã | A (B exigiria carregar exercícios de amanhã ou estimar sem dado) | nada |
| DP-D9 | Aparência e posição do bloco; "fora do tempo" recolhido com cabeçalho sempre visível | mockup a aprovar | só após mockup aprovado | DP-D1..D8 |

## 9. Prova e critérios de pronto (DONE_WHEN)

Provas planejadas (nomes propostos): `test/study-time-estimate.test.js`, `test/day-plan.test.js` (conservação, ordem, `plan[0]` = ação primária, orçamento ausente × 0, mutações listadas), `server/test/settings-availability.test.js` (GET não grava, validação, coexistência com timezone e idioma), `server/test/migrations.test.js` e `manifest.json`, teste de ida e volta de backup, `e2e/hoje-day-plan.spec.js` (base sintética de 34 etapas em 10 unidades, 375 px, axe, hash das tabelas históricas), scanner de i18n em 0.
Pronto quando: (1) DP-R1..DP-R10 com critérios verdes; (2) mutações vermelhas como previsto; (3) e2e existentes de Hoje verdes sem editar expectativas; (4) o aluno leu o texto do déficit e disse, com as próprias palavras, o que fica de fora (UAT humano, T-F12-06); (5) limitações de plataforma registradas; (6) nenhum dado histórico alterado. Evidência em `validation.md` (`### T-F12-0x`), SHAs em `tasks.md`.

## 10. Fundamentação: provado × inferência × não verificado

- PROVADO (código lido): tudo da seção 3.
- ESCOLHA DE PRODUTO (sem fonte): `BASE = 3`, `POR_EXERCICIO = 1,5`, o corte por prefixo, a regra de um item por unidade.
- INFERÊNCIA (sem evidência coletada): que mostrar o déficit ajuda o aluno a decidir; que uma estimativa grosseira e rotulada é útil. A UAT mede compreensão do texto, não resultado de aprendizagem.
- NÃO VERIFICADO: se os timestamps das tentativas calibram a duração; o caminho de dados do Android; a vigência de INV-20 do MVP; `ALTER TABLE ADD COLUMN … CHECK` no SQLite do projeto.
- Nenhuma fonte científica sobre duração ideal de sessão, carga cognitiva ou planejamento de estudo foi lida nem citada: este desenho se apoia em restrições de produto (Constituição I.19, §22, §35, §39), não em alegações de ciência da aprendizagem.
