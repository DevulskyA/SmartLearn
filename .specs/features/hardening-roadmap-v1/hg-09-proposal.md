# HG-09 — Proposta: recuperação de revisões atrasadas (conhecimento, não dívida de datas)

Data: 2026-10-17 · Natureza: ANÁLISE E PLANO. Nenhum código, migração ou dado foi alterado. O banco humano (`SmartLearn-DevData`) não foi aberto.
Base lida: worktree `smartlearn-v1-complete` (HEAD `80627a4`) e worktree `smartlearn-v1-split-fatia2` (commits `7b44104`, `f55da10`).
Requisitos relacionados: R-11 / AC-11.1, AC-11.3 · tarefas `T-F7-01`, `T-F7-03` · dívida DEBT-003.

Legenda de prova: `LIDO` = confirmado lendo o código/documento; `FONTE` = confirmado em fonte primária na web nesta sessão (via WebFetch, com a ressalva da seção 9); `NÃO VERIFICADO` = dito sem prova; `ESCOLHA DE PRODUTO` = decisão do aluno, sem prova científica que a determine.

---

## 1. Direção aprovada e recomendação objetiva

Direção (aprovada pelo aluno): recuperar o CONHECIMENTO, não a dívida administrativa de datas; manter a obrigação de revisão espaçada, a aprendizagem e a integridade da evidência.

**Recomendação.** Em três passos, nesta ordem:

1. **Parar de cobrar o que não pode mais ser feito, sem falsificar o histórico.** Quando o aluno realiza de verdade a revisão mais antiga atrasada de uma unidade e a evidência dessa revisão existe, as demais etapas já vencidas dessa mesma unidade passam ao estado `SUPERSEDED` ("não realizada"), nunca a "concluída". As etapas futuras são reagendadas a partir da data real da revisão, com a regra de classe de resultado da seção 4. Tudo registrado num log reversível. Isso entrega "uma obrigação por unidade" como propriedade da operação, sem mexer nos 16 `review_tasks` de unidades novas.
2. **Não implementar a corrente preguiçosa (uma linha por vez) para todas as unidades agora.** É a arquitetura certa se a corrente provar valor, mas contradiz literalmente a Constituição §21 e a Evolução V3 H5 (adaptativo, "evidence-gated, not authorized"), e não há dado medido (T-F7-03 está PARCIAL, recomendação provisória "ADIAR"). Fica como Fase 5, condicionada a dados.
3. **"Retomar unidade" como transição: só vale como porta de entrada da Fase 3, e com trava anti-empilhamento.** Sozinha (sem a mudança de calendário) ela quase não alivia nada: derruba o contador em 1 e a unidade continua `ATRASADO`. Se o aluno quiser alívio visual antes do HG-09 completo, a única versão que recomendo é a da seção 6 (com trava); caso contrário, esperar é aceitável, porque o agrupamento (Fase 0) já resolve a poluição visual.

Princípio unificador, derivado da Constituição §16 e §I.12: **dívida só é encerrada por evidência, nunca por clique ou por passagem do tempo.** Sem evidência (revisão "só leitura", unidade sem exercícios, nenhum item julgado) nada é substituído e o acompanhamento continua.

---

## 2. Estado real do código (o que a proposta enfrenta)

| Fato | Onde (LIDO) |
|---|---|
| Cada unidade nasce com 16 linhas em `review_tasks`, offsets `1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390` contados a partir da data de estudo; datas por aritmética UTC | `shared/review-schedule.js`; criação em `server/src/services/learning-units.js:121-125` e `accept-draft.js:52,158` |
| `review_tasks` só tem `offset_days`, `due_date`, `completed_at`, `created_at`. Não existe estado "não realizada", nem data planejada original, nem vínculo com a revisão anterior | `server/migrations/004-learning-domain.sql:45-55` |
| `review_tasks` é declarada "projeção de agenda, recalculável, nunca o registro histórico"; a história é `learning_evidence` + `exercise_attempts` + `learning_events` | comentário em 004; Constituição §16; heritage H-06 |
| Concluir: `reviews.complete()` grava `completed_at=agora` e, se houver q/c, UMA linha `REVIEW` em `learning_evidence`, numa transação, com idempotência por `operationKey`; concluir de novo dá `ALREADY_COMPLETED`; `reopen()` zera `completed_at` sem apagar evidência | `server/src/services/reviews.js:104-169` |
| `evidence_date` da revisão usa `nowIso.slice(0,10)` (data UTC), enquanto a agenda usa o dia LOCAL por `Intl` | `reviews.js:128` × `reviews.js:15-18,61` |
| Agenda: `overdue = completed_at IS NULL AND due_date < hoje`; contadores de Hoje, Estatísticas (`reviewsOverdue`) e estado `ATRASADO` (`tracking-state.js`) leem exatamente esse predicado no cliente | `reviews.js:63`; `src/stats.js:109-113`; `src/tracking-state.js:9` |
| O número "R1…R16" do cliente é DERIVADO: `REVIEW_DAY_OFFSETS.indexOf(offsetDays)+1` | `src/remote-store.js:130` |
| Cada tentativa é um registro do servidor: `exercise_attempts` (`review_task_id` opcional, `max_assistance` monotônico NONE→HINT→PARTIAL_SOLUTION→SOLUTION) e UM evento `ATTEMPT` imutável em `learning_events` (CORRECT/INCORRECT/UNKNOWN, `assistance_used` lido da tentativa, nunca do cliente, `confidence` opcional); correções só por evento `CORRECTION` novo | `server/src/services/attempts.js`; `server/src/domain/learning-event.js`; `review-results.js` |
| Refazer erros ("reteste") cria tentativa NOVA sem `review_task_id` e NÃO grava `learning_evidence`; a revisão original permanece intacta | `attempts.listForReviewTask` (comentário "a redo can never look like part of the original review"); `src/app.js:3074-3080`, `5268-5290`; memória do projeto "learning loop shipped" |
| Revisão sem questões é válida e não inventa nota | `reviews.complete` (omitir `questionsCount`); Constituição §21 |
| Não existe campo de data de prova. "Prova" no produto é o Modo Prova (`exams`, `exam_items`), um simulado, não uma data de calendário | `server/migrations/024-exams.sql`; busca em `server/`, `shared/`, `src/`, `.specs/` sem resultado para `exam_date`/"data da prova" |
| Não existe marcação de "conhecimento essencial" em exercícios; `competencies` existe mas nada a preenche | busca de `essential/essencial/criticality` em migrações sem resultado; `learning-loop-v2/review.md` R6 "AUSENTE" |
| Segundo conjunto de implementação do agendador no cliente local: `src/db.js` (46 menções a `review_tasks`), `src/scheduler.js` (`generateInitialTasks`), `src-tauri/src/lib.rs` (34 menções), coluna `review_number` | Windows usa REMOTE_MODE com backend local (memória ARCH-01, não relido aqui); se o Android usa esse caminho local: NÃO VERIFICADO |

**Defeito latente encontrado (independe do HG-09).** No Hoje, cada etapa atrasada da mesma unidade tem seu próprio bloco de exercícios e seu próprio "Revisão feita". Os julgamentos são por `review_task_id` (`src/app.js:1292-1300`). Logo, o aluno pode responder os MESMOS exercícios em R1, R2, R3… no mesmo dia: cada rodada vira uma tentativa nova e uma linha `REVIEW` em `learning_evidence` (volume e acertos somados em `src/stats.js`). A partir da segunda, o gabarito já foi visto, então não é recuperação independente. Pelo código isto é possível; NÃO foi reproduzido nem medido (não toquei no banco). O agrupamento por unidade (Fase 0) não o cria, mas também não o impede.

---

## 3. Conflitos com arquitetura, invariantes e decisões

| # | Conflito | Fonte | Tratamento proposto |
|---|---|---|---|
| C1 | "Na V1 o scheduler vencedor é FIXO. Cada learning unit gera 16 review_tasks… Não implementar na V1: FSRS; scheduler adaptativo" | Constituição §21; §91-C ("não reabrir sem nova evidência"); Master Build Plan linha 73; V1-09; heritage H-01 | A Fase 3 mantém as 16 linhas por unidade e muda só datas e fechamento. Mesmo assim é adaptação por resultado: exige emenda explícita do aluno (D-1). "Nova evidência" para reabrir §91-C: uso real com 27 a 34 revisões vencidas e a mais antiga com 104 dias (T-F7-01; LOOP_BACKLOG), não medida por mim |
| C2 | "O sistema gera todas as revisões automaticamente no cadastro" | INV-04, INV-05 (`.specs/project/INVARIANTS.md`) | A Fase 3 preserva a letra (16 linhas no cadastro). Só a Fase 5 (corrente preguiçosa) a violaria; exigiria emenda |
| C3 | INV-20 proíbe "redistribuição avançada de revisões" no MVP | `INVARIANTS.md` INV-20 | Documento do MVP; risco de estar obsoleto para a V1, NÃO VERIFICADO qual vigora. Registrar na emenda (D-1) |
| C4 | Memória adaptativa (FSRS, HLR) é "EVIDENCE_GATED, not authorized"; o campeão é o fixo até ser batido | `SMARTLEARN_PRODUCT_EVOLUTION_V3.md` H5 | A proposta NÃO usa FSRS nem coeficientes de modelo. Usa só os intervalos canônicos já existentes. Fase 5 fica gated |
| C5 | AC-11.3: decidir FSRS com dados do uso real antes de implementar; a medição não foi feita (sem snapshot do produto com manifesto) | `reports/T-F7-03-fsrs-data-report.md` | Consistente: nada de FSRS agora. A medição somente leitura vira tarefa HG9-S3, sujeita a D-10 |
| C6 | INV-22 "um clique por ação; confirmações desnecessárias são proibidas" × `T-F7-01(c)` "prévia do efeito e confirmação" | `INVARIANTS.md` INV-22; `tasks.md` T-F7-01 | Proposta: um clique com desfazer imediato (D-7) |
| C7 | INV-05 do roadmap: "abrir uma aula não recalcula nem grava estado" | `spec.md` INV-05 | Recuperação só ocorre por ação explícita ao concluir uma revisão, nunca por leitura/abertura ou job |
| C8 | INV-07 do roadmap: migrações só para frente, com backup; nenhuma destrutiva sem decisão humana | `spec.md` INV-07; `migrations/manifest.json` com checksum | Migração 034 aditiva, nulável. Reversão de código tem hazard, ver seção 8 |
| C9 | ADR-0001: Estatísticas é superfície protegida; necessidade funcional ≠ autorização de redesenho | `.specs/adr/ADR-0001-…` | Mudar o predicado de `reviewsOverdue` é mudança funcional de dado, não de composição. Ainda assim sinalizo como gate (D-8). Se Hoje for `KNOWN_GOOD`, as mudanças de cartão também: NÃO VERIFICADO se Hoje foi formalmente designada |
| C10 | `review_tasks ≠ learning_evidence`; "nunca reescrever fatos históricos porque o algoritmo mudou" | Constituição §16, §I.5 | Respeitado: reagendar mexe só em datas de projeção. O fechamento `SUPERSEDED` é projeção, não evidência. A classe de resultado é DERIVADA do livro de evidência e recalculável |
| C11 | Rollback de código após existirem etapas `SUPERSEDED`: o código antigo as tratará como pendentes (`completed_at IS NULL`) e a dívida "ressuscita" | análise de `reviews.js:63` | Procedimento da seção 8 (HG9-C7) |

---

## 4. As sete regras, uma a uma

### Fontes verificadas nesta sessão

- Anki, página de opções de baralho (`https://docs.ankiweb.net/deck-options.html`): intervalo mínimo 1 dia; "Hard interval" padrão 1,20 sobre o intervalo anterior; "Easy bonus" padrão 1,30; "Starting ease" 2,50; "New interval" padrão 0,00 para cartão errado (vai a 1 dia pelo mínimo). A página NÃO descreve a fórmula de atraso.
- Anki, FAQ do algoritmo (`https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm`): Good multiplica o intervalo pela facilidade; Hard reduz a facilidade em 15 pontos e multiplica por 1,2; Easy multiplica pela facilidade e pelo bônus; Again reduz a facilidade em 20 pontos e entra em reaprendizado; e "Answering cards later than scheduled will be factored into the next interval calculation".
- Anki, código-fonte do agendador (`https://raw.githubusercontent.com/ankitects/anki/main/rslib/src/scheduler/states/review.rs`, ramo `main`, lido em 2026-10-17): cartão atrasado: `days_late = max(0, …)`; **Hard** = `intervalo × hard_factor`, atraso ignorado; **Good** = `(intervalo + days_late/2) × facilidade`; **Easy** = `(intervalo + days_late) × facilidade × easy_multiplier`; mínimos para manter Hard < Good < Easy. Com FSRS ligado o atraso não entra diretamente.
- FSRS (`https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm`, seção v4): `R(t,S) = (1 + t/(9S))^-1`; `I(r,S) = 9S(1/r − 1)`; sucesso: `S'r = S·(e^w8·(11−D)·S^−w9·(e^(w10(1−R))−1)·w15[G=2]·w16[G=4] + 1)`; falha: `S'f = w11·D^−w12·((S+1)^w13 − 1)·e^(w14(1−R))`. O atraso entra por `t` em `R`: quanto menor `R` no momento do acerto, maior o ganho de estabilidade. Os parâmetros padrão dependem da versão (v4, 4.5, 5, 6) e foram ajustados em dados de cartões de memorização; adequação a "revisão de uma unidade com vários exercícios, autojulgada" NÃO VERIFICADO.
- Espaçamento: Cepeda et al., 2006, Psychological Bulletin 132(3):354-380 (`https://pubmed.ncbi.nlm.nih.gov/16719566/`): o intervalo entre estudos que dá melhor retenção cresce com o intervalo de retenção. Cepeda et al., 2008, Psychological Science 19(11):1095-1102 (`https://pubmed.ncbi.nlm.nih.gov/19076480/`): o intervalo ótimo cai de cerca de 20 a 40% de um atraso de 1 semana para 5 a 10% de um atraso de 1 ano; o desempenho sobe e depois cai com o aumento do intervalo. Lidos só no nível de resumo.

### Consequência comum às fontes (e a ambiguidade central)

Anki e FSRS tratam "acertou mesmo atrasado" como sinal de memória MAIS forte e alongam o intervalo. Esse raciocínio pressupõe um item bem observado (cartão de uma pergunta, muitas revisões prévias, resposta julgada com rigor). No SmartLearn, um acerto numa unidade que nunca teve a R1 realizada vem de poucos itens, autojulgados (`SELF_REPORT`), às vezes assistidos. A Constituição §I.12 e §20 proíbem inferir domínio sem base. Por isso a regra 1 abaixo é deliberadamente MAIS conservadora que a ciência verificada: é decisão de produto sobre suficiência de evidência, não resultado científico.

| Regra | Natureza | Proposta | Fonte / verificação |
|---|---|---|---|
| **R1. Acerto sem ajuda: avançar conservadoramente contando o atraso real** | CIÊNCIA (o sentido do efeito) + ESCOLHA DE PRODUTO (o quanto) | Classe `CLEAN` (ver abaixo). O atraso real é INFORMAÇÃO, não bônus: a âncora do reagendamento passa a ser a data REAL da revisão (hoje local), e o próximo intervalo é o intervalo nominal da etapa seguinte, `offset[k+1] − offset[k]` da escada existente. Nenhum coeficiente novo e nenhum crédito por atraso. Crédito de atraso estilo Anki (metade do atraso, com teto) fica adiado para a Fase 5 | Sentido do efeito: FONTE (Anki `review.rs`; FSRS `R(t,S)`). Ausência de crédito: escolha de produto, ver seção 7 A1. Os valores de FSRS/Anki NÃO são adotados |
| **R2. Parcial ou assistida: reforçar, revisão mais próxima, sem crédito indevido** | CIÊNCIA (direção: Hard/FSRS crescem pouco) + ESCOLHA | Classe `MIXED`: a próxima etapa repete o intervalo da etapa atual (`offset[k] − offset[k−1]`, e `1` se k=1) em vez de avançar. Itens errados ou assistidos entram no mecanismo existente de reforço (`priorWrongExercises`, `reinforcementByUnit`, "Refazer erros"). A ajuda usada nunca promove: `assistance_used != NONE` desqualifica o item de `CLEAN` | Anki Hard (intervalo × 1,2, sem bônus de atraso): FONTE. Escolha do "repetir o intervalo da etapa": produto |
| **R3. Erro em conhecimento essencial: reaprendizagem direcionada e revisões curtas espaçadas** | CIÊNCIA (lapso → estabilidade cai) + ESCOLHA | Classe `FAILED`: reentrada com os primeiros intervalos da escada: próxima revisão em `offset[1]` (1 dia), depois `offset[2]−offset[1]` (6 dias), depois retoma os intervalos nominais. Reaproveita os valores canônicos; zero número novo. Reaprendizagem direcionada = "Refazer erros" + abrir fonte (já existe). **"Essencial" não existe como dado**; ver A3 | Lapso → novo intervalo curto (Anki "New interval" 0 → mínimo 1 dia): FONTE. FSRS `S'f` derruba a estabilidade: FONTE. Número de passos curtos: escolha de produto |
| **R4. Unidade sem exercícios: nunca presumir domínio, sinalizar evidência insuficiente, manter acompanhamento** | PRODUTO (Constituição §19, §21, §I.12) | Classe `NO_EVIDENCE` (revisão "só leitura", ou nenhum item julgado). Conclui apenas a etapa realizada. NÃO substitui etapas irmãs e NÃO reagenda. O estado de acompanhamento continua `SEM_EVIDENCIA` (já existe) e Hoje mostra a pendência de "gerar/adicionar exercícios para comprovar". A dívida segue visível | Produto; coerente com `reviews.complete` (sem q/c = sem nota) |
| **R5. Data de prova: planejar para que a recuperação ocorra antes** | CIÊNCIA (intervalo ótimo depende do horizonte) + ESCOLHA | **O campo NÃO existe.** Exige migração (`subjects.exam_date` nulável, proposta) e UI opcional (INV-21/23). Regra proposta: nenhuma revisão agendada pelo plano de recuperação cai depois de `exam_date − margem`; revisões vencidas de disciplinas com prova próxima sobem na ordem de Hoje. Margem e nível (disciplina × unidade) são decisões D-6 | Direção: Cepeda 2006/2008 (resumo): FONTE. Margem e fórmula: sem fonte, escolha |
| **R6. Evidência: manter primeira tentativa, ajuda e reteste distintos** | INVARIANTE | A classe de resultado é calculada SÓ com tentativas ligadas à própria revisão (`listForReviewTask`/`reconcile`), que já exclui reteste. Reteste e "Refazer erros" continuam sem gerar evidência e sem alterar o original. Nenhum evento é reescrito. Regra nova contra o defeito da seção 2: um item cuja tentativa anterior no MESMO dia local já mostrou o gabarito não conta como independente para `CLEAN` (D-3) | LIDO (invariantes em `attempts.js`, `review-results.js`, `src/app.js:3074`) |
| **R7. Histórico: manter revisões perdidas, nunca registrá-las como concluídas** | INVARIANTE | Etapas substituídas ganham `closed_at` + `closed_reason='SUPERSEDED'` e mantêm `due_date`, `completed_at IS NULL`. Nenhuma recebe `completed_at`. Aparecem no histórico da unidade como "não realizada" | LIDO (Constituição §16; heritage H-06) |

### Classes de resultado de uma revisão (função pura, derivada do livro de evidência)

Entrada: itens julgados DESTA revisão (resultado efetivo = evento de maior `sequence`, como em `review-results.js`), nível de ajuda de cada um, cobertura. `UNKNOWN` não conta como julgado.

| Classe | Condição (padrão proposto, ESCOLHA DE PRODUTO, sem fonte, a validar com T-F7-03) |
|---|---|
| `NO_EVIDENCE` | nenhum item julgado (inclui revisão sem exercícios) |
| `CLEAN` | cobertura mínima atendida (julgados ≥ min(3, nº de exercícios ativos da unidade)), todos CORRECT, todos com `assistance_used = NONE`, e nenhum contaminado pelo mesmo dia |
| `FAILED` | cobertura mínima atendida e ao menos metade dos julgados INCORRECT |
| `MIXED` | com evidência, e nenhuma das anteriores (inclui cobertura insuficiente, acertos assistidos, poucos erros) |

A política é versionada (`policyVersion`) e recalculável: a classe e o motivo vão para o log; o livro de evidência continua sendo a verdade (Constituição §16).

### Plano de reagendamento (só quando há empilhamento, para não alterar quem está em dia)

Gatilho: a revisão realizada é a etapa pendente mais antiga `k` da unidade E a etapa seguinte `k+1` já venceu (`due_date(k+1) ≤ hoje`). Se `k+1` ainda está no futuro, o calendário fica EXATAMENTE como hoje (compatível com o fixo; sem regressão para quem estuda em dia). Sem esse gatilho nada muda.

Com o gatilho e classe ≠ `NO_EVIDENCE`, numa transação:
1. Etapa `k`: `completed_at` normal (a revisão foi realizada).
2. Etapas pendentes da unidade com `due_date ≤ hoje` e índice > k: `SUPERSEDED`.
3. Etapas futuras restantes: nova `due_date` a partir de `hoje` local pelos intervalos das regras R1 a R3; `planned_due_date` guarda a data original na primeira alteração.
4. Uma linha em `review_schedule_log` por etapa alterada: data antes/depois, classe, `policyVersion`, motivo.
5. Mesma `operationKey` repetida devolve o resultado original sem reaplicar.

Efeito de horizonte (a decidir, D-9): com 16 linhas fixas, `FAILED` consome dois dos espaços restantes com intervalos curtos, então o horizonte total encurta em relação ao nominal; alternativa é acrescentar linhas, o que viola mais a "16 linhas" da §21.

Propriedade resultante: depois da recuperação, a unidade tem NO MÁXIMO uma etapa aberta com `due_date ≤ hoje` (hoje já concluída). Isto é "uma obrigação vencida por unidade", sem criar a corrente preguiçosa.

---

## 5. Alternativas de arquitetura (para a decisão D-1)

| Opção | O que é | Prós | Contras | Recomendação |
|---|---|---|---|---|
| 0 | Só agrupamento (Fase 0) | Pronto, sem risco | Contadores continuam em 34; dívida perene | Base |
| 1 | "Retomar unidade" sem backend | Sem esquema, reversível | Alivia 1; unidade segue `ATRASADO`; risco de empilhar mesmo dia | Só com trava (seção 6) |
| 2 | Recuperação por unidade (re-datar/encerrar linhas, log) | Cumpre as 7 regras; mantém as 16 linhas; mexe só em datas; reversível por log | Migração aditiva; muitos consumidores do predicado `completed_at IS NULL`; emenda de §21/INV-04 | **Recomendada (Fases 2 e 3)** |
| 3 | Corrente preguiçosa (uma linha por vez, próxima criada ao concluir) | Mais fiel à ideia "uma obrigação" | Contradiz §21/INV-04 literalmente; `reopen` precisa desfazer a linha derivada; Plano deixa de mostrar o calendário futuro; `reviewNumber` derivado de `offset_days` quebra (precisa `stage_index`); sem dado para calibrar | Fase 5, gated por dados |

Nota honesta sobre carga (DEBT-003): a corrente NÃO reduz a carga diária em regime quando o aluno está em dia (cada unidade volta a cada intervalo, como hoje). O ganho é evitar o empilhamento simultâneo de etapas da mesma unidade e a dívida fantasma. A conta "16 × U por dia" de DEBT-003 permanece.

---

## 6. Transição antes do HG-09: "Retomar unidade" mínima

Definição pedida: concluir SOMENTE a etapa atrasada mais antiga da unidade, pelo fluxo legítimo de revisão, deixando as outras pendentes até a decisão de calendário.

**Backend: nenhuma mudança.** É o mesmo `reviews.complete` da etapa mais antiga (o botão apenas abre aquela linha e seus exercícios). Evidência, idempotência e histórico seguem como hoje.

**Efeito no que foi construído (`src/overdue-groups.js`, `createOverdueUnitCard`, `renderToday`), por leitura do código:**

- `groupOverdueByUnit` e `stageRanges` não mudam de comportamento. Depois de concluída a etapa mais antiga a lista tem uma etapa a menos: o intervalo muda (ex.: "R1 a R5" vira "R2 a R5"); se sobra uma só, `group.tasks.length === 1` e o cartão vira linha simples (o `<details>` desaparece; `openUnitIds` deixa de importar).
- Contadores: o cabeçalho `today.overdue.count` cai em 1 etapa e mantém o número de conteúdos até a última etapa da unidade ser concluída; `todayLoadSummary` e o texto de ação primária usam `overdueReviews.length`, então caem em 1; `stats.reviewsOverdue` cai em 1 e `reviewsDone` sobe em 1. `getTrackingState` continua `ATRASADO` enquanto restar qualquer etapa vencida da unidade.
- `pickPrimaryReview` escolhe por camada (`reviewTier`), não pela mais antiga. Depois de concluída a etapa, a próxima etapa da mesma unidade tem exercícios ainda não julgados PARA ESSA etapa (julgamentos são por `review_task_id`) e continua a ação primária: o aluno é conduzido a repetir os mesmos itens no mesmo dia (o defeito da seção 2). Para a transição ser segura, é preciso uma trava: após uma revisão da unidade concluída hoje, as demais etapas dessa unidade ficam recolhidas, rotuladas "aguardando decisão de calendário" e fora de `pickPrimaryReview`.
- Comentário de cabeçalho de `overdue-groups.js` ("the 16-review schedule is untouched… never changes, reschedules or drops a task") permanece verdadeiro na transição e deixa de ser verdadeiro na Fase 3 só para o servidor, não para esse módulo (que continua apenas agrupando).

**Avaliação.** Vale como entrada de UI da Fase 3 (mesmo botão, efeito de servidor diferente). Como entrega isolada: ganho pequeno (−1 por clique), mantém `ATRASADO`, e sem a trava piora a integridade da evidência. Recomendação: construir a transição apenas com a trava e apenas se o aluno quiser alívio antes da Fase 3 (D-2). É mudança de UI de Hoje, então segue o ADR-0001 se Hoje for superfície protegida.

---

## 7. Ambiguidades que mudam a correção pedagógica e como resolvi

| # | Ambiguidade | Resolução proposta | Por que |
|---|---|---|---|
| A1 | "Contar o atraso real" = bônus (Anki/FSRS) ou penalidade? | Informação, sem bônus nem penalidade; ancora na data real. Bônus (metade do atraso, com teto) só na Fase 5 com dados | O raciocínio de bônus pressupõe evidência forte; aqui é fraca (autojulgada, poucos itens, §I.12) |
| A2 | "Acerto sem ajuda" por unidade com vários itens | Classes `CLEAN/MIXED/FAILED/NO_EVIDENCE`, cobertura mínima, ajuda desqualifica, contaminação do mesmo dia desqualifica | Constituição §17: 90% de 10 ≠ 90% de 200; §20: ajuda ≠ independência |
| A3 | "Conhecimento essencial" não é dado | Qualquer item errado conta; a ESCOLHA é tratar por taxa (metade ou mais) para `FAILED` e reforçar itens individuais pelo mecanismo existente. Marcar "essencial" fica para o Mapa de Conhecimento (R6 de learning-loop-v2) | Sem campo, qualquer outra regra seria inventada; `review.md` R5: erro é sinal, não diagnóstico |
| A4 | Revisão "só leitura" fecha dívida? | Não: conclui só a etapa feita | Dívida só se encerra por evidência |
| A5 | Substituir etapas = presumir domínio? | Substituir é admitir que revisões passadas não podem ser refeitas; não afirma domínio. Só ocorre com evidência | Coerente com §I.5 (calendário é protocolo) e §I.12 |
| A6 | Data local × UTC | Todo cálculo de atraso e de nova data usa o dia local do fuso do usuário (`localDateString`), nunca `slice(0,10)` de ISO UTC | `reviews.js:128` já grava `evidence_date` em UTC (inconsistência existente; não corrigida aqui) |
| A7 | Item único × item a item (memória por exercício) | Recuperação é por unidade; agendamento por item fica fora (Learning Engine v1) | Escopo; Constituição §I.14 |
| A8 | Resultado `UNKNOWN` | Não conta como julgado nem como errado | `learning-event.js` (UNKNOWN ≠ NONE/CORRECT/INCORRECT) |
| A9 | Autojulgamento (`SELF_REPORT`) é otimista | Tratado como dado, não como prova; a política é versionada e calibrável; `confidence` (opcional) NÃO é usada na v1 | `learning-event.js` diz que confiança nunca afeta validação de outcome/ajuda |
| A10 | Data de prova passou | Voltar à escada normal; o campo é ignorado depois da data (a confirmar em D-6) | Não há fonte; escolha |

---

## 8. Esquema, contratos, dados existentes e reversão

### Mudanças de esquema (Fase 3, migração 034 aditiva e nulável; Fase 4, migração 035)

- `review_tasks.closed_at TEXT NULL`, `review_tasks.closed_reason TEXT NULL` (valores `SUPERSEDED` | `VOIDED`), `review_tasks.planned_due_date TEXT NULL`.
- `review_schedule_log` (append-only): `id`, `user_id`, `unit_id`, `review_task_id`, `operation_key`, `kind`, `due_before`, `due_after`, `closed_reason`, `result_class`, `policy_version`, `created_at`, FK composta `(user_id, …)` como nas demais tabelas.
- Fase 4: `subjects.exam_date TEXT NULL`.
- `offset_days` NÃO muda: `reviewNumber` derivado continua válido nesta fase.
- Migração exige: entrada em `migrations/manifest.json` com checksum, teste em `migrations.test.js`/`domain-schema.test.js`, backup verificado antes de rodar em qualquer banco humano (INV-07). A aceitação de `ALTER TABLE … ADD COLUMN … CHECK` pelo SQLite da versão usada: NÃO VERIFICADO.

### Contratos que mudam

- DTO de revisão (`reviews.js taskDto`, `agenda-snapshot.js itemDto`, `remote-store.js mapReviewTask`): campos aditivos `status` (`PENDING|DONE|SUPERSEDED`), `closedReason`, `plannedDueDate`. Todos os consumidores de "aberta" passam a usar `status`, não `completed_at IS NULL`.
- Predicados a ajustar (`completed_at IS NULL` vira "aberta e não fechada"): `reviews.agenda` (3 consultas), `reviews.list`, `agenda-snapshot.js PENDING_SELECT` (e o hash `computeDataRevision`), entrada de `priorities.js`, `src/stats.js`, `src/tracking-state.js`, `src/today-priority.js`.
- Backup e restauração lógica: `shared/logical-import.js` (`reviewTasks.cols`), `server/src/backup.js`, `logical-restore.js`, `imports.js` (inferência de offset), `dev-restore.js`; teste de ida e volta em `backup-contract.test.js`.
- Cliente local legado (`src/db.js`, `src/scheduler.js`, `src-tauri/src/lib.rs`): paridade de plataforma exige decisão (INV-26): replicar ou declarar fora do escopo. Depende de confirmar se o Android usa esse caminho (NÃO VERIFICADO).
- Estatísticas: `reviewsOverdue` deixa de contar `SUPERSEDED`; proposta de contador informativo `reviewsMissed` (D-8; superfície protegida).

### Dados existentes

- Migração não altera nenhuma linha existente (colunas nulas = comportamento atual). Nenhuma recuperação roda sozinha: só ao concluir uma revisão elegível. `learning_evidence`, `exercise_attempts`, `learning_events` e `exams` não são tocados.
- Os dados reais (27 a 34 vencidas, a mais antiga com 104 dias) vêm de documentos do projeto (`tasks.md` T-F7-01; `LOOP_BACKLOG.md`), não de medição minha.

### Condições de reversão

1. **Antes de liberar:** qualquer critério AC-9.x vermelho, ou diferença de hash nas tabelas históricas fora das colunas de data declaradas, bloqueia a liberação.
2. **Desfazer pontual:** `undoRecovery(operationKey)` restaura `due_date`, `closed_*` pelo log, enquanto nenhuma etapa derivada tiver sido concluída; se tiver, recusa e diz por quê (não apaga fato).
3. **Reversão de código depois de uso real:** o código antigo trataria `SUPERSEDED` como pendente e a dívida reapareceria. Procedimento obrigatório (HG9-C7): script "desfazer todas" a partir do log, ANTES do downgrade. Migração não tem "down" (INV-07); as colunas ficam, ignoradas.
4. **Gatilho para desligar a regra sem reverter código:** parâmetro de política que força `NO_EVIDENCE` para todas as classes (comportamento da Opção 1).

---

## 9. Critérios de aceitação verificáveis

Cada critério precisa de teste automático nomeado e, onde indicado, prova real (`REAL_USE`) fora do alcance de testes.

**Evidência e histórico (R6, R7)**
- AC-9.1 Antes/depois de qualquer recuperação, o hash das tabelas `learning_evidence`, `exercise_attempts`, `exercise_versions`, `learning_events` é idêntico; em `review_tasks` só diferem `due_date`, `closed_*`, `planned_due_date`, e `completed_at` somente da etapa realizada. (teste de propriedade com banco temporário)
- AC-9.2 Nenhuma etapa `SUPERSEDED` tem `completed_at`; nenhuma linha de evidência é criada por substituição ou por reagendamento.
- AC-9.3 Reteste e "Refazer erros" continuam sem criar `learning_evidence` e sem alterar a classe da revisão original.

**Classe e calendário (R1 a R4)**
- AC-9.4 Tabela de casos da função pura: `NO_EVIDENCE` (0 julgados, só leitura, exercícios sem julgamento), `CLEAN`, `MIXED` (um assistido; cobertura insuficiente; um errado entre dez), `FAILED` (metade errada); cada caso com datas esperadas calculadas só com `REVIEW_DAY_OFFSETS`.
- AC-9.5 `NO_EVIDENCE`: nenhuma etapa irmã substituída, nenhuma data alterada; o acompanhamento permanece `SEM_EVIDENCIA`.
- AC-9.6 Sem empilhamento (`k+1` ainda futura): calendário idêntico ao de hoje, byte a byte, para qualquer classe.
- AC-9.7 Com empilhamento: no máximo uma etapa aberta vencida por unidade ao final; as demais `SUPERSEDED`; datas futuras ancoradas no dia LOCAL.
- AC-9.8 Fronteiras de data: fuso `America/Sao_Paulo`, 23:30 local (já é o dia seguinte em UTC), virada de ano e 29/02: a mesma data local é usada em atraso e reagendamento.
- AC-9.9 Idempotência: repetir a mesma `operationKey` não reaplica; `ALREADY_COMPLETED` preservado.
- AC-9.10 Trava do mesmo dia: itens já mostrados hoje não contam como independentes para `CLEAN`.

**Reversão**
- AC-9.11 `undoRecovery` restaura datas e `closed_*` e deixa as tabelas históricas intactas; recusa quando já há etapa derivada concluída.
- AC-9.12 Ida e volta de backup/restauração lógica com etapas `SUPERSEDED`.

**Contadores e UI**
- AC-9.13 `reviewsOverdue`, cabeçalho de Hoje, resumo de carga e ação primária ignoram `SUPERSEDED`; `reviewsMissed` (se aprovado) as conta separadamente.
- AC-9.14 Hoje, Plano, Estatísticas e modo offline (snapshot) concordam sobre quais etapas estão abertas.
- AC-9.15 Texto de resultado diz a próxima data e o motivo em linguagem clara (`REAL_USE`: o aluno lê e entende; julgamento humano).
- AC-9.16 Transição (seção 6): após revisão concluída hoje, a unidade não oferece as mesmas etapas como ação primária (e2e).

**Plataformas e dados**
- AC-9.17 Web, Windows e Android: PASS em uma não prova as outras (INV-26). Android: definir caminho (servidor ou local) antes de declarar paridade.
- AC-9.18 Nenhum teste toca `SmartLearn-DevData`; a medição T-F7-03 usa snapshot verificado do produto (D-10).

**Prova (Fase 4)**
- AC-9.19 Disciplina com prova: nenhuma revisão do plano após `exam_date − margem`; disciplina sem data: comportamento idêntico ao da Fase 3.

---

## 10. Plano em fases, tarefas e dependências

Legenda: `[H]` exige decisão humana antes. IDs `HG9-*` são desta proposta; as tarefas já existentes `T-F7-01` e `T-F7-03` são cobertas pelas fases 3 e 2 respectivamente. `T-F7-02` (onboarding) é independente.

### Fase 0 — Agrupamento (FEITO, não integrado)
- HG9-00 Cartão por unidade, recolhido acima de 6 etapas, cartão da "Começar agora" aberto (`7b44104`, `f55da10`, branch `claude/smartlearn-v1-split-fatia2`). Integração depende de HG-05/HG-10. Nenhuma mudança de dado.

### Fase 1 — Transição opcional "Retomar unidade" (somente UI) `[H: D-2]`
- HG9-T1 Botão no cartão (`createOverdueUnitCard`) que abre a etapa mais antiga e seus exercícios. Dep: HG9-00, D-2.
- HG9-T2 Trava anti-empilhamento (`today-priority.js`, cartão "aguardando decisão"). Dep: T1.
- HG9-T3 Textos i18n e cabeçalho por conteúdo (pt-BR e chaves do catálogo). Dep: T1.
- HG9-T4 Testes: `overdue-groups.test.js`, `today-priority.test.js`, `e2e/hoje-overdue-groups.spec.js`, contadores. Dep: T1 a T3.

### Fase 2 — Especificação e decisões `[H]`
- HG9-S1 ADR + emendas registradas: Constituição §21/§91-C, INV-04/INV-20, V1-09, heritage H-01. Dep: D-1.
- HG9-S2 Política v1 (classes, limiares, contaminação do mesmo dia) com tabela de casos-limite. Dep: D-3, D-4, D-5.
- HG9-S3 Medição somente leitura (= `T-F7-03` completo) em snapshot verificado: carga projetada, taxa de atraso, empilhamento, acerto por faixa. Dep: D-10. Informa calibração; não bloqueia S1.

### Fase 3 — Mudança de calendário: recuperação por unidade (= `T-F7-01` a a d)
- HG9-C1 `server/src/domain/review-recovery.js` puro (`classifyReviewResult`, `planRecovery`), relógio e fuso explícitos, `policyVersion`. Dep: S2.
- HG9-C2 Migração 034, `manifest.json`, testes de esquema, backup verificado. Dep: S1.
- HG9-C3 `reviews.complete` estendido na MESMA transação (classifica a partir das tentativas da revisão, aplica o plano, grava log, idempotência) + `reviews.undoRecovery`. Dep: C1, C2.
- HG9-C4 Consumidores do predicado "aberta" e contratos (lista da seção 8), `taskDto`/snapshot/remote-store, backup/restore/imports. Dep: C2.
- HG9-C5 UI: efeito imediato com desfazer (ou prévia, D-7), histórico "não realizada" no Plano, texto de resultado, contador. Dep: C3, C4, D-7, D-8.
- HG9-C6 Testes: propriedade (hash), contrato HTTP, ida e volta de backup, e2e Hoje/Plano/offline. Dep: C3 a C5.
- HG9-C7 Procedimento e script "desfazer todas" para downgrade. Dep: C3.
- HG9-C8 Paridade de plataforma: confirmar caminho do Android e do cliente local (`src/db.js`, `lib.rs`); replicar ou declarar fora. Dep: S1.
- HG9-C9 Verificação real em banco temporário com dados sintéticos de 104 dias de atraso (sem tocar `SmartLearn-DevData`); aceite humano do texto e do efeito (AC-9.15). Dep: C6.

### Fase 4 — Data de prova (opcional) `[H: D-6]`
- HG9-E1 Decisão de nível e margem. E2 Migração 035 `subjects.exam_date`. E3 Campo opcional na edição de disciplina. E4 Teto no `planRecovery` e ordenação em `priorities`. E5 Testes (AC-9.19). Dep: C3, D-6 (E2 depende de E1, E3 a E5 de E2).

### Fase 5 — Agendamento adaptativo geral (gated por dados)
- HG9-A1 Reavaliar com dados reais acumulados (regra do próprio T-F7-03: n por faixa < ~30 ou < 4 semanas de uso ⇒ nenhuma conclusão): ladder fixo × crédito de atraso × FSRS. Dep: C em uso, S3.
- HG9-A2 Se aprovado: corrente preguiçosa (linha derivada, `stage_index`, `derived_from`, `reopen` que anula a derivada); emenda de §21/INV-04. Dep: A1, novo gate.
- HG9-A3 Espalhar excesso de carga em dias seguintes (limite diário) `[H]`. Dep: A1.
- HG9-A4 Crédito de atraso com teto, só com evidência medida. Dep: A1.

Caminho crítico: D-1, S1/S2, C1, C2, C3, C4, C5, C6, C9. A Fase 1 e a Fase 4 saem do caminho crítico.

---

## 11. Decisões que ainda dependem do aluno

| ID | Decisão | Recomendação |
|---|---|---|
| D-1 | Autorizar a recuperação por unidade (Fase 3) e a emenda registrada de Constituição §21/INV-04/INV-20; adiar a corrente para todas as unidades (Fase 5) | Sim para a Fase 3; não para a Fase 5 até haver dado |
| D-2 | Construir "Retomar unidade" antes da Fase 3 | Só com a trava; se não houver urgência, esperar |
| D-3 | Classes e limiares: cobertura mínima (3 ou todos), "metade errada" para `FAILED`, contaminação do mesmo dia | Aceitar os padrões da seção 4 como política v1, a recalibrar com dados |
| D-4 | Atraso sem bônus nem penalidade, âncora na data real; gatilho só quando a etapa seguinte também venceu | Aceitar |
| D-5 | Revisão só leitura/sem itens: não substitui, não reagenda, mantém `SEM_EVIDENCIA` | Aceitar |
| D-6 | Data de prova: nível (disciplina), margem antes da prova, o que fazer depois dela | Disciplina, margem escolhida por você; opcional |
| D-7 | Um clique com desfazer imediato (INV-22) ou prévia com confirmação (T-F7-01c) | Um clique com desfazer |
| D-8 | Estatísticas: `reviewsOverdue` ignora `SUPERSEDED`; novo contador `reviewsMissed` (superfície protegida, ADR-0001) | Autorizar só a mudança de dado, sem alterar composição |
| D-9 | Após `FAILED`: aceitar horizonte menor ou acrescentar linhas | Aceitar horizonte menor na v1 |
| D-10 | Autorizar o produto a gerar um snapshot verificado para medir (T-F7-03); eu não abro o banco humano | Sim, quando houver janela |
| D-11 | Paridade com Android e cliente local: replicar ou declarar fora do escopo | Verificar primeiro como o Android guarda dados |

---

## 12. O que não pude verificar

- Fórmulas de Anki e FSRS foram lidas por WebFetch (extração por modelo pequeno); os trechos de código e fórmulas estão consistentes entre fontes, mas não os conferi linha a linha contra uma release fixa. O ramo `main` do Anki pode mudar. A página do FSRS traz `S'r` e a fórmula de intervalo só na seção v4; não vi `S'r` do FSRS-6 na página.
- SM-2 original (SuperMemo) não foi lido; só a descrição do Anki sobre ele.
- Cepeda 2006 e 2008: só resumo. Efeito do teste (recuperação) e "massa < espaçamento" como conclusão geral: não reverificados nesta sessão; a frase de `LOOP_BACKLOG.md` sobre isso não foi reconferida.
- Aplicabilidade de parâmetros de FSRS/Anki a unidade com vários exercícios autojulgados: sem fonte.
- Dados reais: nada foi medido (banco humano intocado). Os números 27/34 vencidas e 104 dias vêm de documentos do projeto e divergem entre si por data.
- O defeito do empilhamento (seção 2) é inferência de leitura de código; não foi reproduzido.
- Testes e e2e não foram executados.
- `ALTER TABLE ADD COLUMN … CHECK` no SQLite do projeto; se o Android usa o caminho local; se Hoje é superfície protegida (`KNOWN_GOOD`); se INV-20 do MVP ainda vige.
