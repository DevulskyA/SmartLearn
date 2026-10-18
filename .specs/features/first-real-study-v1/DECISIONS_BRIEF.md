# Decisões humanas abertas: o que responder, o que cada resposta causa

```
DATA=2026-10-17 · BASE=HEAD 85c2dea (branch claude/smartlearn-v1-complete) · NATUREZA=somente documentação; nenhum código, banco, app ou modelo foi tocado
LEGENDA=LIDO (conferido no arquivo citado) · INFERIDO (conclusão minha, não fato) · NÃO VERIFICADO (dito sem prova)
REGRA DO USUÁRIO (vigente, 2026-10-17)=o tempo de resposta por questão NUNCA mede conhecimento nem penaliza o aluno; o tempo de ESTUDO é medido à parte
```

## Nota sobre as fontes

O texto integral de D-T1..D-T8 não existe como bloco único. `REPORT.md` §3 dá uma linha por decisão; o desenho vive em `telemetry-audit.md` (TG-01..TG-12), `comparison-plan.md` (§3 a §6, §9) e `ledger.md` (AC-M/AC-X). Como nunca houve um texto-fonte único, a pergunta COMPLETA de cada item abaixo (pergunta, consequência, alternativas, recomendação, fatos que mudam o risco) é, a partir de agora, o texto integral de referência da decisão: foi reconstruída desses documentos; o que for dedução minha está marcado INFERIDO. D-T7 já foi respondida (fuso do cliente/salvo, `America/Sao_Paulo`; commit 760491c) e não aparece como pergunta.

---

> **VERIFICADO em 2026-10-17 (cópia somente leitura do banco vivo, nada alterado):** o banco já tem o PDF "Costanzo Physiology, 7th edition" (496 páginas, extração concluída em 03/10) e **1 rascunho real do Codex** (prompt v5, 03/10, status DRAFT, não aceito) na conta do seed (`user_id` 1). Logo o primeiro estudo pode usar esse rascunho **sem nenhuma chamada nova ao modelo** (R2 passa a "não precisa autorizar geração" se você escolher esse caminho), ao custo de ser de um prompt antigo (v5; o atual é o 10) e estar na conta do seed (ver D-T1: aceitar nessa conta, ou gerar de novo na conta nova). A dúvida "o rascunho ainda existe?" da seção 4 está resolvida por esta nota.
>
> **Ensaio em CÓPIA do banco (2026-10-17, sem modelo, nada gravado no banco vivo):** o rascunho é o trecho Costanzo pp. 267-272 "Glomerular Filtration" (proposta 84): resumo de 7.171 caracteres e 35 questões (6 CONCEITO, 4 RECORDAÇÃO, 5 DISCRIMINAÇÃO, 12 MECANISMO, 5 APLICAÇÃO, 3 RACIOCÍNIO CLÍNICO), todas com dica e citação de página, 0 em quarentena, auditado por regras determinísticas e por modelo (`modelAudit OK`, com 1 reparo). Os 67 achados MEDIUM gravados vêm de regras antigas que comparavam palavras entre inglês e português; com o `reauditDraft` atual (`audit-rules-4`) o resultado é **PASS** com 1 aviso LOW (comparação lexical dispensada entre idiomas). PASS é filtro, não validação médica. Aceitar o rascunho na cópia funcionou sem bloqueio: +1 unidade, +35 exercícios (22→57) e +16 revisões (160→176). Para estudar, o rascunho só existe na conta do seed (`user_id` 1); levá-lo a outra conta exigiria mexer em dado, o que não foi feito.

> **RESPONDIDO em 2026-10-18 (usuário): caminho A.** Aceitar o rascunho Costanzo pp. 267-272 que já existe, sem modelo. Efeitos: R1 = esse rascunho; R2 = NÃO há geração, nenhuma autorização de modelo; R4 = mesma conta `dev@smartlearn.local` (D-T1 opção A, com as 34 vencidas sintéticas na Hoje). **Seguem SEM resposta: R3** (quem aprova o conteúdo; recomendado: o próprio usuário, com a caixa "Conferi na fonte") **e R5** (congelar código de produto; recomendado: sim). Roteiro do caminho A: `SESSION_PACK.md`, bloco "CAMINHO A DECIDIDO". Pré-voo do lançamento (2026-10-18): desde o último lançamento do usuário (`5174b28`) não entrou migração de esquema nova (só uma guarda em `server/src/migrations.js` e a porta lembrada em `src-tauri/src/lib.rs`); `9d4ccf6` cria `smartlearn-dev.port` na pasta do banco humano no 1º lançamento.

## 0. Responder primeiro (só o que destrava o primeiro estudo médico real)

Cinco respostas. As demais decisões (D-T2 a D-T6, D-T8, migração 034) NÃO bloqueiam o primeiro estudo; ficam na seção 2.

| # | Pergunta | Recomendação | Por que destrava |
|---|---|---|---|
| R1 | **Qual PDF, capítulo e páginas?** | O capítulo que você está estudando esta semana, UMA seção de 3 a 7 páginas. Se quiser o caminho de menor novidade, o Costanzo (já existe localmente; HG-08 diz para não pedir de novo) nas pp. 267-273 "Glomerular Filtration", que já tem 3 gerações reais avaliadas por IA | Sem fonte escolhida não há geração. O limite de entrada do modelo é 50.000 caracteres (`aiMaxInputChars`, `server/src/config.js`); uma seção de 7 páginas ficou perto de 12.500 caracteres no canário |
| R2 | **Autoriza UMA geração real com o modelo (provedor CODEX)?** Detalhes na seção 1 | Sim, uma só, sobre a seção escolhida em R1, e só depois de conferir que Configurações > Sobre mostra o provedor CODEX | Clicar em "Gerar rascunho com IA" chama o modelo real na hora, sem janela de confirmação (LIDO: `src/materials-ui.js:328-346`, `:619-634`). A regra do projeto é nenhuma chamada real sem autorização nova |
| R3 | **Quem aprova o conteúdo da aula antes de você estudar por ela?** | Você mesmo, usando a aba Revisão e a caixa "Conferi na fonte os pontos críticos do resumo", com a aula rotulada NÃO VALIDADA CLINICAMENTE. Revisor clínico nomeado fica para depois (D-T6) e não bloqueia | O aceite exige a caixa marcada (`editor.accept.ack`). Estudar por conteúdo de IA sem decisão registrada de quem aprova viola "IA = rascunho até aceite humano" |
| R4 | **Onde ficam os dados do estudo real: no banco sintético atual (D-T1)?** | Conta nova (e-mail seu) dentro do mesmo banco, sem apagar nada. Alternativa: manter a conta `dev@smartlearn.local` e aceitar o ruído | Hoje o banco de uso é o seed sintético de 19/09: 10 unidades, 160 revisões, 34 vencidas. Na conta antiga, o Hoje e as Estatísticas do estudo real nascem misturados com 34 vencidas falsas |
| R5 | **Congelo o código de produto até o fim da sessão?** | Sim: nenhum commit de código/migração entre agora e o fim do primeiro estudo | O launcher recompila a partir do HEAD e o backend migra o banco vivo ao subir (LIDO: `scripts/launch-desktop-dev.ps1`, `server/src/main.js:69`). Um commit de produto antes da sessão entra na sua build e pode migrar o seu banco |

Você NÃO precisa responder agora: D-T2 (migração 034), D-T3 (compromisso antes da revelação), D-T4 (sorteio e itens retidos), D-T5 (tempo de estudo), D-T6 (revisor médico), D-T8 (HG-09).

---

## 1. Autorização de geração real com modelo (item pedido; destrava R2)

**Pergunta completa.** Você autoriza que o aplicativo envie o texto de UMA seção aprovada de um PDF ao modelo real (Codex CLI, conta ChatGPT em que você já está logado) para gerar resumo e questões em rascunho?

**O que acontece quando você clica (LIDO).**
- O launcher oficial (`npm run dev:desktop`) define `SMARTLEARN_AI_PROVIDER=CODEX` (padrão do script), `SMARTLEARN_AI_CONSENT=true` e `SMARTLEARN_CODEX_TIMEOUT_MS=1200000` (20 min) (`scripts/launch-desktop-dev.ps1:10`, `:99-101`). Ou seja, o consentimento já está ligado no ambiente: nada mais pergunta.
- Dois botões "Gerar rascunho com IA" disparam o modelo imediatamente: o do trecho no índice e o de cada resultado da busca "O que você quer estudar?" (o segundo aprova a seção e gera no mesmo clique; `src/materials-ui.js:619-634`). "Buscar" não chama o modelo.
- Só o texto da seção aprovada vai ao provedor (dica na tela: "Só o texto dessa seção — com as páginas que você vê — será enviado à IA"). A aba Fonte do rascunho mostra "Enviado ao modelo: N caracteres, exatamente a fonte aprovada".
- Sem teto em dólar para CODEX (`config.js:72-73`). Limites de crédito por job/semana/mês estão SEM VALOR (HG-11): sem limite. O custo real não está medido.
- Dá para cancelar: "Cancelar geração" pede confirmação e nada é salvo (`materials.progress.cancelConfirm`). Pode sair da tela; a geração continua no servidor e o trecho mostra "Pronto" na lista.
- Resultado é RASCUNHO ("Rascunho gerado por IA, não verificado"). Só vira aula quando você aceita.

**Consequência por resposta.**
- Sim, uma geração: primeiro conteúdo médico real no banco; destrava T-F4-01 e o único dado real de uso. Risco: conteúdo de IA com erro; mitigado pelas auditorias automáticas (filtro, não validação) e pela sua conferência na fonte.
- Não: o primeiro estudo só pode usar conteúdo sintético ou escrito por você (Plano > "+ Nova aula", exercícios manuais). T-F4-01 fica sem prova de conteúdo real (nível b do ledger segue NOT_PROVEN).

**Alternativas.**
1. UMA geração agora (recomendada).
2. Reaproveitar rascunho existente sem chamar o modelo: `uat-visual.md` passo 8 supõe o rascunho "Glomerular Filtration" do Costanzo na lista "Rascunhos em andamento", mas `ledger.md` M-08 diz que não há conteúdo real aceito. NÃO VERIFICADO se esse rascunho ainda está no banco vivo (não abri o banco). Se estiver na conta antiga e você escolher conta nova em R4, ele não aparece lá.
3. Provedor `FAKE` do servidor (o que a jornada nativa usa): produz conteúdo sintético determinístico, serve para testar o fluxo, não para estudar.

**Recomendação (INFERIDA).** Alternativa 1, com três salvaguardas: (a) uma seção só, escolhida em R1; (b) antes de clicar, confira em Configurações > Sobre que o provedor mostrado é CODEX e que a build é a esperada; (c) após o rascunho aparecer, não gere de novo sem nova autorização (a segunda chamada é outra decisão). Registrar a data, o trecho e o número de chamadas.

**Evidência de que funciona.** 3 gerações reais em 04/10 (Costanzo pp. 267-273) e canário v8 x v10 (3 chamadas, 12/10): `ledger.md` M-02, M-03. Avaliação foi só por IA, sem clínico: o veredito de qualidade segue NOT_PROVEN.

---

## 2. Decisões que não bloqueiam o primeiro estudo

### D-T1. Manter o banco sintético ou começar limpo

**Pergunta.** O banco de uso (`~/SmartLearn-DevData`) contém o seed sintético de 19/09 (conta `dev@smartlearn.local`, texto "Apostila DEV", 10 unidades, 160 revisões, 34 vencidas, zero duplicatas). O estudo real entra nele, ou vai para um espaço novo?

**Fatos (LIDO).**
- Dado sintético e real não têm marca no esquema; o que os separa é a conta, o texto e `created_at` (`telemetry-audit.md` TG-10; `scripts/seed-dev.mjs` usa a API pública, sem flag).
- Todas as tabelas de estudo filtram por `user_id` (ex.: `reviews.js` `TASK_SELECT ... WHERE rt.user_id = ?`). Duas contas no mesmo banco não veem os dados uma da outra. Isolamento no banco vivo: NÃO testado por mim.
- O cadastro de conta está aberto na tela Conta ("Ainda não tem conta? Criar uma"; senha com no mínimo 15 caracteres).
- O launcher se recusa a abrir se `smartlearn-dev.db` não existir ("não cria banco vazio no lugar dele"; `launch-desktop-dev.ps1`). Criar um datastore novo não tem comando documentado: exigiria script novo (mudança de código, proibida agora).
- O launcher tira snapshot verificado diário e, se houver migração pendente, um snapshot `pre-migrate` antes (LIDO: `server/src/main.js:55-69`, `dev-snapshot.js:116`).

**Alternativas.**
| Opção | O que faz | Prós | Contras |
|---|---|---|---|
| A. Mesma conta | estudo real na conta `dev@smartlearn.local` | nada a configurar; rascunhos antigos (se existirem) visíveis | Hoje mostra 34 vencidas sintéticas e a ação primária pode apontar para unidade falsa; Estatísticas misturadas; a regra de análise vira filtrar por `created_at` |
| B. Conta nova no mesmo banco (recomendada) | você cria sua conta e estuda nela | Hoje/Plano/Estatísticas limpos; nada apagado (respeita "delete mínimo"); a conta sintética continua como demonstração | rascunhos da conta antiga não aparecem (nova geração se precisar, ver §1 alternativa 2); duas contas para lembrar |
| C. Datastore novo | banco vazio separado | separação total | sem comando; exigiria código |
| D. Apagar o seed | remover as 10 unidades | tudo limpo | destrutivo; não autorizado; Delete exige listar cascatas |

**Recomendação (INFERIDA).** B. É reversível, não exige código e atende ao critério AC-X2 (dados reais separados dos sintéticos). Fazer: sair da conta atual (Conta > Sair), criar a nova, entrar. A sessão persistente do DEV guardará a conta nova.

**Efeito na análise.** Com B, a regra de exclusão 1 do plano de comparação (excluir sintético) é "outra conta", bem mais simples que filtrar por data.

### D-T2. Autorizar a migração 034 (contexto da tentativa)

**Pergunta completa.** Autoriza escrever, e depois rodar no banco vivo, uma migração aditiva 034 que dá contexto à tentativa (REVIEW, STUDY, RETEST, EXAM) e, no mesmo pacote, registra a reabertura de uma revisão?

**Conteúdo previsto (INFERIDO a partir de TG-03, TG-02b, TG-05b).**
- `exercise_attempts.context` (texto, nulável; sem CHECK porque a aceitação de CHECK em `ADD COLUMN` pelo SQLite do projeto é NÃO VERIFICADA, como nota o spec da frente A).
- Registro de auditoria da reabertura (TG-02b); `think_ms` (TG-05b) só se D-T5 permitir.
- Toda coluna nova precisa entrar em `shared/logical-import.js` e nos testes `backup-contract` / `logical-restore`, senão a restauração a descarta em silêncio (`telemetry-audit.md` §1.6).

**Por que importa.** Hoje reteste, "Estudar agora" abandonado e prova são indistinguíveis por coluna (P-3, P-4); o plano de comparação (ME-3, ME-4, exclusão 3) precisa do contexto.

**Fatos que mudam o risco (LIDO).**
- O backend aplica migrações pendentes ao subir (`server/src/main.js:69`) e tira antes um snapshot verificado `pre-migrate`; se o snapshot falhar, recusa migrar. Não existe "down" (INV-07): a coluna fica mesmo se o código voltar.
- Conflito de número: 034 está reservado por três documentos ao mesmo tempo: telemetria (esta), HG-09 (`closed_at`, `closed_reason`, `planned_due_date`, tabela `review_schedule_log`; `hg-09-proposal.md` §8, "034 aditiva, 035 data de prova") e a frente A (`study_availability`; `daily-plan-time-budget-v1/spec.md:111,127` manda coordenar). O manifesto atual termina em 033 (`server/migrations/manifest.json`).

**Alternativas.**
1. Autorizar agora a 034 só da telemetria (contexto + auditoria de reabertura), sem `think_ms`, e renumerar: HG-09 passa a 035 (+ log) e a frente A a 036. Barato, aditivo, destrava a análise.
2. Adiar a 034 até haver 2 ou 3 sessões reais (decisão informada por atrito real).
3. Fundir telemetria + HG-09 numa migração só (não recomendo: acopla uma decisão pronta a uma em conflito com a Constituição §21).

**Recomendação (INFERIDA).** Alternativa 2 para o primeiro estudo (código congelado, R5) e, depois dele, alternativa 1. Motivo: o contexto só importa quando houver dado real para separar, e a sessão não deve ser a primeira a testar uma migração no banco do aluno.

### D-T3. Compromisso de resposta antes da revelação

**Pergunta completa.** Nos fluxos de Hoje e "Estudar agora" o aluno vê o gabarito ("Ver resposta") antes de julgar ("Acertei/Errei"). Quer que o app passe a registrar um compromisso ANTES da revelação (resposta digitada, ou "respondi", com confiança opcional)? É mudança de interação de estudo, hoje congelada.

**Fatos (LIDO).**
- `max_assistance` termina sempre em `SOLUTION` nos fluxos de revisão e estudo; `confidence` nunca é enviada; não há compromisso (TG-06; `e2e/practice.spec.js:117`, `e2e/study-now-reveal-order.spec.js`). Os baldes "independente" do perfil de evidência só se enchem por provas.
- A única resposta digitada antes do gabarito é o Modo Prova (Plano > "Fazer prova": `exam_items.student_answer`, assistência `NONE`).
- `started_at` marca a revelação, não a exibição da pergunta (TG-05).

**Consequência.** Sem compromisso, a recordação independente de estudo e revisão é invisível ao produto; ME-6 (a melhor medida) só existe em provas.

**Alternativas.**
1. Não mudar. Protocolo humano: responder antes (mentalmente, em voz alta ou em papel) e usar o Modo Prova para a medida digitada.
2. Compromisso leve opcional: botão "Respondi" antes de "Ver resposta" e confiança 1 a 3; sem texto.
3. Resposta digitada obrigatória em todo fluxo (como a Prova): sinal mais forte, mais custo por questão.

**Recomendação (INFERIDA).** Alternativa 1 até a primeira sessão real; depois decidir com o atrito observado. REGRA: nenhuma alternativa pode usar o tempo entre exibir e revelar como nota, domínio, agendamento ou veredito.

### D-T4. Sorteio por unidade e itens retidos

**Pergunta completa.** Para um dia afirmar "o ciclo SmartLearn retém mais que o meu método habitual", você aceita sortear UNIDADES entre ciclo SmartLearn (A) e método habitual (B), registrando o sorteio antes de estudar, e reservar itens nunca praticados (ou usar avaliação externa por item)?

**Fatos (LIDO, `comparison-plan.md` §3 a §5).** O produto não tem marca de "item reservado". Um aluno só atinge ganhos grandes: 18 a 25 unidades por braço para +20 pontos, cerca de 36 a 50 unidades. Os números do tamanho mínimo usam hipóteses de agrupamento (ICC 0,10 e 0,20, não medido), atraso D1 = 14 dias e D2 = 45 dias são ESCOLHA.

**Alternativas.** (1) T0 apenas: descritivo, custo zero, rotulado não causal. (2) T2 com sorteio e itens retidos: única forma de sustentar causa, custo alto, exige manter o método B de verdade. (3) T1: controle histórico, só contexto.

**Recomendação (INFERIDA).** T0 sempre; adiar D-T4 até haver pelo menos 6 unidades reais estudadas. Não pré-registre sorteio antes de saber se você vai manter o ritmo. Sem decisão, nenhuma alegação causal é permitida.

### D-T5. Captura de tempo de estudo e privacidade

**Pergunta completa.** O app deve capturar tempo de estudo (sessão, leitura do resumo, tempo até revelar, ausências)? Com que privacidade?

**Fatos (LIDO).** Hoje não existe medida de tempo de estudo; o norte "retido por minuto de estudo" não é mensurável (X-06). A captura de sessão/ausência é a tarefa `T-F12-12`, que exige decisão de produto e de privacidade e a Constituição §54 veda rótulo sobre o aluno. O tempo de prova é o único intervalo real hoje (S-4: se mede esforço ou ociosidade, NÃO verificado).

**Regra do usuário aplicada.** O tempo de resposta por questão não mede conhecimento nem penaliza. `think_ms` (TG-05b, exibição até revelação) só poderia ser dado de tempo de estudo, nunca entrar em domínio, agendamento ou veredito.

**Alternativas.** (1) Nenhuma captura automática; minutos de estudo por unidade registrados à mão (o plano de comparação já prevê, ME-8). (2) `think_ms` aditivo, só como tempo de estudo. (3) Sessões, leitura e ausência (T-F12-12).

**Recomendação (INFERIDA).** Alternativa 1 no primeiro estudo (anote início e fim da sessão fora do app, no relato da sessão). Decidir a 2 depois, junto com D-T2. Alternativa 3 só com decisão de privacidade explícita. Não gravar nada passivo que você não veja.

### D-T6. Revisor médico e amostra

**Pergunta completa.** Quem será o avaliador humano com competência clínica (HG-06), e qual amostra ratifica? O critério proposto: ≥ 5 unidades de ≥ 2 fontes ou disciplinas, 1 geração cada, mais 3 gerações independentes de 1 unidade para variabilidade; rubrica fixa `prompt-lab/rubric.md`; zero erro clínico crítico não corrigido; questões revisadas em gabarito, dica e rótulo de tipo; níveis do mapa de conceitos revisados (`ledger.md` AC-M1..AC-M6). Os números são ESCOLHA a ratificar, nenhuma fonte os determina.

**Fatos (LIDO).** Hoje: 2 unidades avaliadas no total, 1 fonte (Costanzo), avaliador = IA; nenhuma revisão humana registrada; `REALMODEL_CONTENT_QUALITY_PROVEN` bloqueado; `V1_VALIDATED` exige VALID-8 (spec §10).

**Consequência.** Sem revisor nomeado, o produto não pode afirmar "o conteúdo é medicamente correto", só "existem controles mecânicos com limites conhecidos". Isso NÃO impede você de estudar com conferência própria na fonte (R3).

**Alternativas.** (1) Nomear agora um professor, preceptor ou residente e ratificar a amostra. (2) Adiar nomeação; você revisa só as unidades que estudar, e cada erro achado vira registro (página, trecho). (3) Reduzir a amostra proposta (reduz a força da conclusão, não a regra).

**Recomendação (INFERIDA).** Alternativa 2 agora, com o formulário de achado de conteúdo da `SESSION_PACK.md`; nomear o revisor antes de afirmar qualquer qualidade. Registrar o nome e a data quando existir.

### D-T8. Interação da telemetria com HG-09 (recuperação de revisões atrasadas)

**Pergunta completa.** HG-09 pode mudar o calendário (etapas `SUPERSEDED`, reagendamento a partir da data real, uma obrigação por unidade). Como a telemetria e o plano de comparação convivem com isso?

**Fatos (LIDO).**
- HG-09 tem direção aceita, decisão formal pendente (D-1 e D-12 a D-16) e CONFLITO com a Constituição §21/§91-C (scheduler fixo na V1).
- As medidas ME-2 (curva por etapa), ME-5 (retenção tardia), ME-7 (adesão) e a regra "revisão feita no vencimento" dependem do calendário e de `completed_at`.
- O comparador T2 (`comparison-plan.md` §4) supõe o ciclo A estável durante o experimento; mudar o calendário no meio contamina.

**Alternativas.** (1) Telemetria independente: não esperar HG-09; migração própria; qualquer reagendamento futuro gravado com `policyVersion` (o desenho de HG-09 já prevê `review_schedule_log`) e a análise estratificada por versão de política. (2) Esperar HG-09. (3) Fundir.

**Recomendação (INFERIDA).** Alternativa 1, mais duas regras: (a) congelar o calendário (sem ativar nada de HG-09) durante qualquer janela de comparação T2 pré-registrada; (b) nenhum ajuste de calendário usa tempo de resposta. Numeração de migração: ver D-T2.

---

## 3. O que você precisa saber antes de responder

| Item | Fato | Fonte |
|---|---|---|
| Estado de engenharia | lint, unitários 717/717, servidor 1066/1066, E2E 259/0, jornada nativa 18/18 no código final. Qualidade médica NOT_PROVEN; eficácia NOT_PROVEN; Android NOT_PROVEN | `v1-closure-telemetry/REPORT.md` §9-§13 |
| Defeitos de telemetria corrigidos | TG-01 (dia local), TG-02 (reabertura não duplica), TG-04 (datas), TG-09, TG-12 | `REPORT.md` §5 |
| Ainda sem correção | TG-03 (contexto), TG-05b (tempo), TG-06 (compromisso), TG-07 (conferência), TG-08 (`ABANDONED`), TG-10, TG-11 | `telemetry-audit.md` §2 |
| Defeito de texto achado ao escrever o pacote | o botão "Salvar resumo" do editor de aula aparece como "Salvar resumoX" (`src/i18n/locales/pt-BR/editor.js:25`, introduzido no commit 9d2ac40). Testes não pegam porque localizam por `data-action`. É P3 (cosmético); não corrigido (somente documentação) | LIDO |
| Regra de ouro | "Acertar logo depois de ver a resposta mostra recuperação, não domínio" (texto do próprio app, `appStudyNow.note.someWrong`) | LIDO |

## 4. Fatos que não pude verificar

- (RESOLVIDO em 2026-10-17, ver nota no topo da seção 0.) Se o rascunho "Glomerular Filtration" do Costanzo ainda existe no banco vivo e em qual conta.
- Se o isolamento por conta se comporta como esperado no banco vivo (só li as consultas).
- Se a conta ChatGPT/Codex está logada e a CLI `codex` responde no momento (não executei nada).
- Se a janela do Desktop mostra o provedor CODEX em Sobre na build que vai abrir (li o código que monta a linha, não a tela).
- O custo real de uma geração (HG-11 sem medição) e o tempo típico (só se conhece o teto de 20 minutos do launcher).
