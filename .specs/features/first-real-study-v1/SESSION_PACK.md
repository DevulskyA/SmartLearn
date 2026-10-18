# Pacote da primeira sessão real de estudo (T-F4-01)

```
DATA=2026-10-17 · BASE=HEAD 85c2dea (branch claude/smartlearn-v1-complete) · NATUREZA=roteiro; nada foi executado, nenhum app aberto, nenhum banco lido
QUEM EXECUTA=somente você (T-F4-01 é [H]: ninguém simula o primeiro estudo real)
FATOS CONHECIDOS=banco de uso (~/SmartLearn-DevData) é seed SINTÉTICO de 10 unidades; não existe aula real revisada; o Desktop está FECHADO agora
FONTES DOS CAMINHOS=index.html, src/i18n/locales/pt-BR/*.js (rótulos), src/materials-ui.js, src/lesson-editor-ui.js, e2e/*.spec.js, scripts/desktop-study-journey.mjs, scripts/launch-desktop-dev.ps1, uat-visual.md
LEGENDA=LIDO (conferido em arquivo) · INFERIDO (dedução, marcada) · NÃO VERIFICADO
REGRA=tempo de resposta por questão NUNCA mede conhecimento nem penaliza. Nada neste roteiro cronometra respostas. O tempo de estudo é anotado por você, à parte.
```

Decisões a responder antes (ver `DECISIONS_BRIEF.md`, seção 0): R1 qual PDF e seção, R2 autorizar UMA geração real, R3 quem aprova o conteúdo, R4 onde ficam os dados, R5 código congelado.

**CAMINHO A DECIDIDO (2026-10-18, pelo usuário): aceitar o rascunho Costanzo que já existe, sem modelo.** Substitui A5 (conta nova) e B1–B4 (upload, busca, geração): não há PDF a enviar nem geração. Ensaio mecânico em CÓPIA do banco, duas execuções, 10/10 passos (não é T-F4-01 nem validação médica), mais um estudo completo das 35 questões com reinício no meio (evidência 35/23, retomada oferecida):
1. Entre na conta existente (`dev@smartlearn.local`; credenciais em `scripts/seed-dev.mjs`). **Não clique em "Gerar rascunho com IA"**: o launcher liga o provedor CODEX e o clique chama o modelo real na hora.
2. Materiais > documento "Costanzo Physiology, 7th edition PDF.pdf" > "Abrir" > caixa "Rascunhos em andamento" > "Glomerular Filtration - páginas 267–272" > "Abrir rascunho" (35 questões, resumo de 7.171 caracteres, gerado com prompt v5, não aceito).
3. A aba Revisão mostra 67 pontos de regras antigas (⚠ 67). "Reauditar" (sem IA) os troca por "1 ponto novo, 67 removidos" (✓); recomendado clicar. PASS da auditoria é filtro, não validação médica: confira na fonte (seção B, B6–B9) antes de aceitar.
4. Rodapé "Aceitar a aula": disciplina (existente ou "Criar nova disciplina", no ensaio "Fisiologia Renal"), data da aula (B10), "Ver o que será criado" (35 exercícios, 16 revisões), marcar a caixa de conferência só se conferiu, "Aceitar e criar aula", "Estudar agora".
5. Cuidados: (a) a Hoje continua mostrando as 34 revisões sintéticas vencidas e o "Começar agora" aponta para uma unidade sintética; estude pelo "Estudar agora" do aceite ou pelo Plano. (b) Existe a unidade sintética "Fisiologia renal: filtração glomerular": não confunda com a "Glomerular Filtration" real. (c) O passe de Estudar agora vai até a questão 35; se fechar o app no meio, o reinício oferece continuar de onde parou.
6. Aceitar muda o banco humano: é ato SEU, no app, e só depois de R3 (quem aprova o conteúdo) e R5 (código congelado) estarem respondidos. Nenhum agente aceita nem abre o banco vivo.

---

## A. Antes de abrir (5 minutos)

1. **Código congelado.** No terminal da worktree, `git status -sb` e `git log -1 --oneline`. Anote o hash curto (ele é o "commit" da build). Não pode haver commit de produto até o fim da sessão: o launcher recompila do HEAD e o backend migra o banco vivo ao subir (LIDO: `scripts/launch-desktop-dev.ps1`, `server/src/main.js:69`).
2. **Desktop fechado.** `Get-Process smartlearn` deve retornar vazio. O launcher encerra à força qualquer `smartlearn.exe` da worktree (`Stop-Process -Force`, LIDO no script): NUNCA rode `npm run dev:desktop` com o app aberto.
3. **Abrir pelo único caminho oficial:** `npm run dev:desktop`. Ele confere a branch, recompila se o conteúdo mudou, exige que o banco `smartlearn-dev.db` exista, tira o snapshot verificado do dia (se houver migração pendente, um `pre-migrate` antes) e abre a janela DEV.
4. **Conferir a janela.** O título deve ser `SmartLearn DEV - v0.1.0 - <hash>` com o hash do passo 1 (INFERIDO do formato montado no launcher e na jornada). Configurações > "Sobre o SmartLearn": versão, canal DEV, commit, servidor com o provedor `CODEX`. Se o hash ou o provedor não bate, PARE (defeito P0, ver seção E).
5. **Conta (decisão R4, recomendada: conta nova).** Menu "Conta" > "Sair" (`#account-logout-btn`) > "Ainda não tem conta? Criar uma" > e-mail e senha de no mínimo 15 caracteres > "Criar conta" > "Entrar" com a conta nova. A conta sintética não é apagada. A sessão fica persistente (flag DEV).
6. **Relato da sessão** (preencha à mão, seção F): data, hash, provedor, PDF, páginas, hora de início e de fim do estudo.

---

## B. Do PDF à aula revisada (caminho de preparo)

O menu "Materiais" só aparece no Desktop (LIDO: `src/app.js:103`, exige modo remoto e LOCAL_AUTHORITY).

| # | Onde | Ação | Resultado esperado |
|---|---|---|---|
| B1 | Materiais > "Fontes em PDF" | "Selecionar PDF" e escolher o arquivo | Mensagens "Enviando PDF…", "Extraindo texto do PDF…", "Gerando trechos propostos…" e por fim "N trecho(s) proposto(s). Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso." Livro grande: a extração do Costanzo levou cerca de 10 s numa cópia (`validation.md`). Nada de IA foi chamado |
| B2 | "O que você quer estudar?" | Digite parte do título da seção como está no livro (mínimo duas letras), "Buscar" | "N seção(ões) encontrada(s). Confira as páginas antes de gerar." Cada resultado mostra o título, "PDF páginas a–b · N caracteres" e um trecho. Resultado que não é conteúdo de estudo (prefácio, referências etc.) mostra "não gera rascunho". Alternativa: "Índice do documento" (lista fechada) |
| B3 | Resultado escolhido | Conferir as páginas e o tamanho. **Parar aqui até ter autorização R2** | Seção de 3 a 7 páginas. Limite de entrada: 50.000 caracteres (LIDO, `config.js`) |
| B4 | **PONTO SEM RETORNO** | Antes: Sobre mostra CODEX e você autorizou UMA geração. Depois: botão "Gerar rascunho com IA" do resultado | Chama o modelo real NA HORA, sem janela de confirmação (LIDO: `materials-ui.js:619-634`). Não clique duas vezes. O painel "Gerando rascunho com IA" passa por: "Na fila para começar", "Preparando o trecho aprovado", "Gerando resumo e questões", "Conferindo com a fonte", "Corrigindo o que a conferência encontrou", "Salvando o rascunho". Pode escolher "Continuar em segundo plano" ou "Cancelar geração" (pede confirmação; nada é salvo). Teto do launcher: 20 minutos. Se aparecer "O serviço de IA está em silêncio há algum tempo", é um aviso, não falha |
| B5 | Editor da aula | Abre sozinho ao fim ("Rascunho gerado. Revise antes de aceitar.") ou em Materiais > "Rascunhos em andamento" > "Abrir rascunho". Cabeçalho: "Rascunho gerado por IA — não verificado" | Quatro abas: Resumo, Questões, Fonte, Revisão |
| B6 | Aba **Fonte** | Ler | "Documento", "Páginas aprovadas", "Enviado ao modelo: N caracteres — exatamente a fonte aprovada". Se disser "O texto da fonte mudou depois que este rascunho foi gerado", não aceite sem entender por quê |
| B7 | Aba **Revisão** | Ler de cima para baixo | Aviso fixo: a conferência automática "mostra onde olhar; ausência de pontos não é validação médica". Pontos ordenados por gravidade (por exemplo "Valor que a fonte não traz", "A dica entrega a resposta", "Resposta copiada da fonte"). "Abrir <nome>" leva ao item |
| B8 | Aba **Resumo** | "Ler como aula" e comparar com a fonte | Conferir TODO número, unidade e faixa (doses, mL/min, mmHg) com a página citada. "Trecho da fonte confirmado em X de Y frases": cada frase fora dessa conta precisa de conferência sua. Corrigir no texto e "Salvar resumo" (hoje o botão aparece como "Salvar resumoX", P3 conhecido). Mensagem: "Resumo salvo. As questões não foram alteradas." |
| B9 | Aba **Questões** | Abrir questão por questão | Para cada uma: pergunta, resposta e "Explicação (por quê)" batem com a fonte? A dica entrega a resposta? Corrigir e "Salvar questão" ("Questão salva."), "Aceitar questão", "Rejeitar questão" ("não vira exercício") ou "Excluir questão" (pede confirmação). Na dúvida que não resolver na fonte, rejeite e registre (formulário da seção E) |
| B10 | Rodapé "Aceitar a aula" | Disciplina (existente, ou "Criar nova disciplina" e o nome), "Data da aula" (use a data REAL do seu primeiro estudo do capítulo; o padrão é hoje), "Ver o que será criado" | Prévia: "Disciplina: …", "Aula: título, estudo em AAAA-MM-DD", "N exercícios e 16 revisões agendadas", "Ficam de fora (rejeitadas): n". A prévia não grava nada. Se houver alterações não salvas, a tela pede para salvar antes |
| B11 | Rodapé | Se aparecer a caixa "Conferi na fonte os pontos críticos do resumo", marcar SÓ se conferiu de verdade. Depois "Aceitar e criar aula" | "Aula criada: N exercício(s), 16 revisões agendadas." Aparece o botão "Estudar agora" |

**Critério de aceite pessoal (INFERIDO, não é regra do produto):** só aceite se (a) todo número do resumo foi conferido na fonte, (b) nenhuma questão aceita tem gabarito que você não confirmou, (c) toda dúvida virou "Rejeitar" ou correção. A aula fica NÃO VALIDADA CLINICAMENTE até existir revisor nomeado (D-T6).

**Se a data da aula for anterior a hoje:** o calendário nasce com revisões já vencidas (R1 em 1 dia, R2 em 7, etc.; offsets 1, 7, 15, 30, 60...). Elas aparecem em Hoje agrupadas por unidade (seção C, passo 6). Isso é correto; não resolva todas as etapas no mesmo dia (defeito latente conhecido: as mesmas questões se repetem; `hg-09-proposal.md` §2). Faça só a ação principal e relate.

---

## C. O roteiro de oito passos

Em cada passo: caminho, valor esperado, e o que anotar. "N" = questões aceitas da aula; "k" = quantas você julgou "Acertei" na primeira passada.

### Passo 1. Abrir a aula
- **Caminho:** menu "Plano" > linha da aula > "Expandir detalhes" (`.plan-expand-btn`).
- **Esperado (LIDO nos rótulos):** linha com "N ex.", "Resumo ✓", "Próx. dd/mm" (primeira revisão futura), estado "Sem prática registrada" (antes de praticar). Detalhe aberto: o resumo, a origem do resumo, a lista de exercícios, botões "Estudar agora" e "Fazer prova".
- **Anotar:** o título identifica a aula sem ambiguidade? Disciplina certa?

### Passo 2. Revisar o Resumo Mestre
- **Caminho:** no detalhe do Plano, ler o resumo; depois "Estudar agora". A tela "Estudar agora" abre com o cartão "Resumo Mestre" ACIMA do cartão "Praticar".
- **Esperado:** o texto que você aceitou/editou (a jornada verifica que o resumo editado chega à aula, passos 8-10). Se quiser mudar: Plano > "Editar resumo".
- **Anotar:** reativa o que você estudou na fonte sem reler o capítulo? O que falta? (O resumo não precisa conter tudo o que as questões podem exigir; ele não substitui a fonte.)

### Passo 3. Responder antes de revelar
- **Caminho:** em "Praticar": "Questão 1 de N" > leia a pergunta > **responda ANTES** (em voz alta, mentalmente ou em papel) > "Ver resposta" > leia a resposta e o "Por quê" > "Acertei" ou "Errei" > próxima.
- **Honestidade do julgamento (INFERIDO):** decida antes o critério. Resposta correta e completa sem olhar = "Acertei"; incompleta ou com dúvida = "Errei". O próprio app avisa: acertar logo depois de ver a resposta "mostra recuperação, não domínio".
- **Limite do produto (LIDO):** nenhum campo de texto existe nesta tela; o app não sabe se você respondeu antes. O registro de assistência fica SOLUTION em todas as tentativas, por construção (`telemetry-audit.md` TG-06, decisão D-T3). A única resposta digitada antes do gabarito é "Fazer prova" (Plano). Opcional e fora dos oito passos: se fizer prova, faça-a ANTES de "Estudar agora", pois depois o gabarito já foi visto.
- **Se interromper no meio:** ao voltar aparece "Você já respondeu x de N nesta aula (y acertos). Quer continuar de onde parou?" com "Continuar de onde parei" e "Recomeçar".
- **Esperado ao terminar:** cartão "Resultado" com "k/N corretas — P%" e, abaixo, "Próxima revisão: <data>".
- **Anotar:** início e fim em minutos (para o tempo de ESTUDO). Nenhum tempo por questão.

### Passo 4. Feedback e reteste
- **Caminho:** no cartão "Resultado": seção "Questões para revisar (N-k)" com, por erro, "Você marcou: errei" e "Resposta correta". Botão "Refazer erros (N-k)" > "Refazendo seus erros", "Erro 1 de m" > "Ver resposta" > "Acertei"/"Errei" > resultado "x/m erros corrigidos" > "Voltar para Hoje".
- **Esperado:** o reteste NÃO altera o resultado original nem cria nova evidência (a jornada prova isso, passo 15: linhas de evidência antes e depois do reteste iguais). Se k = N não há botão de reteste: é o comportamento certo (a jornada nunca exerce esse caso; relate se o cartão ficar confuso).
- **Anotar:** o feedback ajudou a voltar à fonte? A frase "para fixar" é clara?

### Passo 5. Evidência
- **Caminho (a):** Plano > aula > "Expandir detalhes" > "Histórico de desempenho". **(b):** Estatísticas > aba "Por conteúdo" > linha da aula; e "Exercícios resolvidos" > clicar numa questão > janela com a tentativa ("Acertou" ou "Errou").
- **Esperado:** UMA linha "<data> — Prática inicial: k/N (P%)". Nenhuma linha extra do reteste (a jornada exige `evidence.length` igual antes e depois, passos 13 e 15). Cada tentativa mostra o resultado real que você marcou.
- **Anotar:** os números batem com o que você marcou? Se não, é P0 ou P1.

### Passo 6. Hoje
- **Caminho:** menu "Hoje".
- **Esperado se a data da aula é hoje e a conta é nova (INFERIDO):** sem vencidas desta aula; a primeira revisão é amanhã ("Amanhã: 1 revisão."); sem a ação "Começar agora" para ela.
- **Esperado se a data da aula é anterior (LIDO da jornada, passo 14):** UM cartão por unidade com as etapas vencidas (`details.overdue-unit`), aberto, contador "<n> revisões · 1 conteúdo", resumo "<n> revisões atrasadas · R1 a Rk · a mais antiga há d dias", e o botão "Começar agora" levando à primeira.
- **Se estiver na conta sintética:** 34 vencidas em 10 unidades são dado falso; não trabalhe nelas.
- **Revisão de Hoje (quando existir uma vencida ou do dia):** "Começar agora" > na linha da revisão as QUESTÕES vêm antes do Resumo Mestre (LIDO, `hoje-block-retest.spec.js`) > "Ver resposta" > "Acertei"/"Errei" > "Bloco concluído: k/N corretas" > opcional "Refazer erros" > marcar "Revisão feita" (`review-done`). Gera UMA evidência REVIEW com os números originais, não os do reteste.
- **Anotar:** Hoje mostra uma ação clara? Você entende o que fazer primeiro?

### Passo 7. Estatísticas
- **Caminho:** menu "Estatísticas" (cartões no topo; abas "Por disciplina" e "Por conteúdo"; filtro de período).
- **Esperado (conta nova):** "Questões" = N, "Acertos" = k, "Média geral" = P% no formato brasileiro; "Vencidas" coerente com Hoje; a disciplina e a aula na tabela. Faixa "Meu estudo está funcionando?": com menos de 10 questões a frase é "Ainda não há histórico suficiente para comparar." e "Há N questões registradas, mas cada período precisa de pelo menos 10 para indicar uma tendência." (LIDO, `analytics.verdict.insufficient.*`).
- **O que NÃO concluir:** a média é autojulgamento sobre o gabarito já visto. Não é domínio, retenção nem eficácia (`ledger.md` §3).
- **Conta antiga:** os cartões somam o sintético; confira só a linha da sua aula.

### Passo 8. Persistência depois de fechar e reabrir (exige a sua autorização)
- **Antes:** anote os números dos passos 5 e 7 e o hash do título.
- **Fechar:** feche a janela normalmente (botão X). Nunca pelo Gerenciador de Tarefas. Espere até `Get-Process smartlearn` voltar vazio (a jornada tolera até 20 s).
- **Reabrir:** `npm run dev:desktop` (de novo, só com o app fechado).
- **Esperado:** mesmo título e hash; sessão ainda aberta (sem pedir login); Plano com a aula, o resumo editado, "Prática inicial: k/N"; Estatísticas e Hoje iguais; as 16 revisões intactas. A jornada compara o export lógico e as linhas do banco antes e depois (passos 17 e 18) e exige igualdade total.
- **Se a sessão pedir login:** Conta > e-mail e senha. Anote (a flag de sessão persistente é DEV).
- **Conferência extra pelo agente (opcional):** só em CÓPIA do snapshot verificado, nunca abrindo o banco vivo.

### Registro rápido por passo (formato do `uat-visual.md`)
Para cada passo responda em uma linha: **claro? confortável? o que incomodou?** `VISUAL_VALIDATION` só vira PASS por declaração sua.

---

## D. Ensaio e cobertura (por que isto não substitui você)

`scripts/desktop-study-journey.mjs` repete 18 passos no Desktop real, mas com banco descartável, provedor FAKE e PDF fabricado. **Ensaio mecânico executado em 2026-10-17** em instância isolada (banco temporário, sem tocar `~/SmartLearn-DevData`, sem reiniciar o seu Desktop): 18/18 no HEAD `f3966f9` (EXIT=0), antes 18/18 duas vezes em `9d572d5`. Evidência: `v1-closure-telemetry/REPORT.md` §6 e §13. **Conferência mecânica do próprio roteiro (2026-10-17, leitura do código, sem executar o app):** das 117 cadeias entre aspas da seção A a C, 90 existem literalmente em `index.html`/catálogos `pt-BR`/`src/*.js`; as 27 restantes são modelos com variável (ex.: "Questão {current} de {total}" e "Erro {current} de {total}" em `appStudyNow.js:14-15`, "{count} conteúdo" em `appToday.js:52`) ou trechos de prosa, e os rótulos-base de cada modelo conferidos existem. Mapa dos seus oito passos:

| Seu passo | Passos da jornada | Cobertura |
|---|---|---|
| 1 e 2 (aula, Resumo) | 8, 9, 10 | mecânica sim; leitura de conteúdo médico real, não |
| 3 (responder antes) | 11, 12 | o botão e a ordem revelar-julgar sim; "responder antes" é protocolo seu, o app não mede |
| 4 (reteste) | 15 | caso com erro sim; caso sem erros, não |
| 5 (evidência) | 13, 15, 17 | números e linhas no banco sim |
| 6 (Hoje) | 14 | cartão agrupado e corrida revelar-julgar sim |
| 7 (Estatísticas) | 16, 18 | carrega sem erro; coerência dos números com a tela, só parcial |
| 8 (persistência) | 17, 18 | fechamento e reabertura limpos, export e banco iguais |

Não coberto por nenhuma automação: qualidade do conteúdo gerado, clareza, conforto, e o que o uso real revelar.

---

## E. Defeitos: classificação e como relatar

Escala do `uat-visual.md`: **P0** perda ou risco · **P1** invalida o trabalho · **P2** fricção · **P3** melhoria.

| Classe | Exemplos neste fluxo | O que fazer |
|---|---|---|
| P0 | build ou hash errado, provedor diferente de CODEX, banco ou conta errados, geração disparada sem você pedir, dado sumiu depois de reabrir, evidência com número diferente do que você marcou, travou no meio de uma gravação | PARE a sessão, não repita, feche normalmente se possível, relate já |
| P1 | não consegue aceitar a aula, "Ver resposta" ou "Acertei/Errei" não grava, reteste altera o resultado original, Hoje/Estatísticas contradizem o Plano, sessão perdida a cada reabertura | relate; o fluxo para até corrigir |
| P2 | texto confuso, passo a mais, tela difícil de ler, aviso de "silêncio da IA" assusta | anote e siga |
| P3 | cosmético, ortografia ("Salvar resumoX"), alinhamento | anote e siga |
| C (conteúdo) | erro médico, valor ou unidade errada, gabarito errado, dica que entrega a resposta, citação de página errada | NÃO é defeito de software. Registre no formulário abaixo; rejeite ou corrija a questão |

**Como relatar (cole no chat, um bloco por defeito):**

```
PASSO: <1..8, ou B1..B11>        CLASSE: <P0|P1|P2|P3|C>
O QUE ESPERAVA: <uma frase>
O QUE ACONTECEU: <uma frase; texto exato da tela entre aspas>
COMO REPETIR: <cliques, em ordem>
EVIDÊNCIA: <captura de tela> + <Configurações > Sobre > "Copiar diagnóstico" colado aqui>
HORA E HASH DA BUILD: <hh:mm> <hash>
```

Para a classe C: **página do PDF** + trecho da fonte + o que o rascunho disse + o que está certo.

Regras para o relato: não tente "consertar" abrindo o banco; não apague nada para refazer; um defeito por bloco. P0 e P1 vão ao agente na hora; P2 e P3 podem ir todos juntos no fim.

---

## F. Folha de registro (preencha à mão)

```
DATA: ______   HASH DA BUILD: ______   PROVEDOR (Sobre): ______   CONTA: nova / sintética
PDF: ______________________   PÁGINAS: ____ a ____   CARACTERES enviados (aba Fonte): ______
GERAÇÃO: nº de cliques em "Gerar rascunho com IA" = ___ (autorizado: 1)   TEMPO ATÉ O RASCUNHO: ____ min
REVISÃO: questões propostas ___ · aceitas ___ · rejeitadas ___ · editadas ___ · excluídas ___
ESTUDO (tempo medido à parte; NÃO cronometrar respostas): início ___:___  fim ___:___  = ___ min
RESULTADO PASSO 3/5/7: N = ___  k = ___  P = ___%   reteste: ___/___ corrigidos
PERSISTÊNCIA (passo 8): fechou normal? ___  reabriu no mesmo hash? ___  números iguais? ___
DEFEITOS ABERTOS: P0 ___  P1 ___  P2 ___  P3 ___  C ___
```

**Fecha T-F4-01:** a tabela do `uat-visual.md` preenchida por você, com autoria e data, e os P0/P1 corrigidos ou aceitos por você. Sem isso o estado continua "primeiro estudo real: NÃO PROVADO".

---

## G. O que não verifiquei

- Nada foi aberto nem executado: o app, o launcher, o banco vivo e o modelo estão como estavam.
- O título exato da janela e a linha do provedor em "Sobre" foram deduzidos do código, não vistos na tela.
- Se a lista "Rascunhos em andamento" já contém um rascunho do Costanzo na sua conta.
- O texto exato do estado "Tudo em dia!" de Hoje quando só existem revisões futuras (esperado por leitura do HTML, `index.html`, não por execução).
- O aviso da janela ao fechar com gravação em andamento.
