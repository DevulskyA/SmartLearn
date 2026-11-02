# Auditoria crítica das telas restantes (2026-11-02)

Base auditada: `integration/v1-recover-20261102` @ `09e0ac2` (rodapé do app: "SmartLearn DEV · v0.1.0 · 09e0ac2"). Branch do trabalho: `integration/auditoria-telas-restantes`. Nenhum código do produto foi alterado; só este relatório, capturas e o script de captura dentro de `.specs/evidence/`.

Formato e IDs seguem `analise-telas-2026-11-02/ANALISE-CRITICA-TELAS.md` (o "kit"), citado como `kit/`. Os achados abaixo são NOVOS ou aprofundam o kit. Legenda: P1 engana ou impede o objetivo de estudo; P2 atrito claro; P3 polimento. `OBSERVADO` = visto em captura ou medido; `DECLARADO` = inferido do código, sem execução que o prove. "Reproduz" diz se refiz a observação.

## 0. Estado da auditoria (parada antecipada a pedido do coordenador)

| Família | Situação |
|---|---|
| Plano | Auditado (captura na base 1280 e 390 + leitura do kit). Comportamento (filtro de estado, validação do formulário) NÃO auditado. |
| Estatísticas | Auditado na base (1280 e 390). Ver A-01: o kit descreve outra interface. |
| Editor de rascunho | Auditado (base 1280 e 390). Ações por questão: só leitura de captura. |
| Materiais | Auditado (base 1280 e 390). Reenvio do mesmo PDF e estado "gerando" NÃO auditados. |
| Configurações | Auditado (captura 1280 e 390). Persistência/feedback de idioma e experimento NÃO auditados. |
| Conta | Auditado (captura). Navegação sem sessão e conteúdo de "Copiar diagnóstico" NÃO auditados. |
| Hoje, região final, 390 px | Auditado com medição (seção 2). |
| Temas / Noite nessas telas | NÃO auditado (instrução: não tocar em Tema). |
| 320 px, 768 px, ordem de Tab em Plano/Estatísticas, leitor de tela, app nativo (WebView2) | NÃO auditado. |

O modo `comportamento` do script (`ferramenta/audit-live.mjs`) está escrito mas NÃO foi executado; tudo que dependia dele aparece como NÃO PROVADO.

Instrumento: servidor + Vite descartáveis, banco temporário, `seed-dev`, Chromium sem janela. O banco humano não foi tocado. Smoke do instrumento: modo `build` (51 s) devolveu o rodapé `09e0ac2`. Erros do instrumento que achei e corrigi: (1) a primeira rolagem da Hoje usou a janela, mas o app rola dentro de `main.app-main`; o sinal foi `wheelSteps: 1` e `scrollTop: 0`, refeito; (2) o modo `telas` a 390 px reenviou o mesmo PDF numa conta que já o tinha e a espera por "trechos propostos" estourou (15 s), então não há captura 390 de Materiais/Editor no modo `telas`; essas saíram do modo `varredura390`; (3) a varredura conta 1 select de 1x1 px (`visually-hidden`) como controle; descontei dos exemplos, os totais podem ter +1 por tela.

## 1. Achados ranqueados

| # | ID | Tela | Defeito | Gr. | Evidência | Reproduz |
|---|---|---|---|---|---|---|
| 1 | A-01 | Estatísticas / processo | As capturas de Estatísticas do kit são de outra interface (build `2e9135c`: cartões Vencidas / Não feitas hoje / Revisões feitas, "Prática", "Caindo", gráfico por disciplina em zigue-zague). A base `09e0ac2` mostra a versão AAA (Média geral, Questões, Disciplinas; coluna "Evidência"; "−12 p.p."; "Evolução geral"; "Distribuição do desempenho"; padrão "Últimos 90 dias"). Consequência: E-02 e E-04 do kit estão resolvidos na base; E-01, E-03 e E-06 persistem em forma diferente (ver A-02, A-18, A-19). | P1 (decisão baseada em tela velha) | `capturas/1280-estatisticas-p1.png` vs `kit/1280-stats-p1.png`; `_auditoria-build.json`; `git log 2e9135c..09e0ac2` (f71e1b7, 5d3ef46, d7c86dc, c34b7bf) | Sim |
| 2 | A-02 | Estatísticas, 390 px | A tabela "Desempenho por disciplina" fica ilegível: os 6 nomes viram "Farm…", "Fisiol…", "Neur…", "Anat…", "Semi…", "Patol…"; cabeçalhos "DESEMPENH", colunas "43 que…" / "Última: …" cortadas; a coluna Tendência quebra "−12 / p.p." em 3 linhas e "Amostra insuficiente" é cortada na borda do cartão. O contêiner `.table-scroll` tem `overflow-x:auto` mas `scrollWidth = clientWidth = 308`: não há o que rolar, o conteúdo é só cortado. O aluno não distingue Fisiologia de Farmacologia pelo nome. | P1 | `capturas/390-estatisticas-p1.png`; `_auditoria-varredura390.json` (`statsTableScroll`, `stats.clippedExamples`: `subject-cell` 131 em 93) | Sim (2 execuções) |
| 3 | A-03 | Estatísticas | **Data um dia antes.** Disciplina: "Última: 01/11/26"; Por conteúdo, o mesmo dado: "02 de nov. de 2026". Causa no código: `src/app.js:2286` chama `formatIntlDate(r.lastEvidence.evidenceDate, …)` direto na string `2026-11-02` (o `new Date()` interpreta como UTC e, em fuso -03, mostra 01/11); `formatDate` (`src/app.js:372`) usa `T12:00:00` e acerta. A data na coluna "Evidência" fica errada para qualquer aluno a oeste de UTC (todo o Brasil). | P2 | `capturas/1280-estatisticas-p1.png` (01/11/26) vs `capturas/1280-estatisticas-por-conteudo-p1.png` (02 de nov.); `src/app.js:372-380,2286`; `src/i18n/format.js:8` | Imagens: sim. Causa: DECLARADA (não rodei com `timezoneId` UTC vs São Paulo) |
| 4 | A-04 | Hoje, 390 px | **Foco de teclado escondido sob a navegação inferior fixa.** Com Tab real pelos 6 últimos controles: "Ver conteúdo" ficou em y 787–818 com a navegação começando em 768 (100% coberto, 50 px sob a barra); "Desfazer conclusão" 5 px sob a barra. `main.app-main` rola até 844 por baixo da barra (clientHeight 780 + padding-bottom 96) e `scroll-padding-bottom` é `auto`. | P2 | `capturas/390-hoje-foco-por-tab-passo-4.png`, `-passo-3.png`; `_auditoria-hoje390.json` (`focusTail`) | Sim (3 execuções, mesmos números) |
| 5 | A-05 | Plano x Estatísticas | **Mesma faixa de nota, cores diferentes.** Plano usa `.performance-badge[data-perf]` (`src/styles.css:3735-3738`): forte verde, adequado amarelo, atenção laranja, crítico vermelho. Estatísticas usa `.performance-badge--*` (`styles.css:1468-1490`): forte azul, adequado verde, atenção e crítico em tons quase iguais de âmbar (crítico não é vermelho; o kit X-03 disse "vermelho"). Resultado visível: 66,7% amarelo no Plano e verde em Estatísticas; "Adequado" ainda aparece em azul-petróleo na barra de "Distribuição". Quatro cores para "adequado" em duas telas. | P2 | `kit/1280-plan-p1.png` (66,7% amarelo) vs `capturas/1280-estatisticas-p2.png` (66,7% verde); `capturas/1280-estatisticas-p1.png` (barra) | Sim (código e imagem) |
| 6 | A-06 | Estatísticas, 390 px | Cabeçalho desalinhado: "Estatísticas" e a frase abaixo começam em x≈48 e o seletor de período fica centralizado, enquanto os cartões começam em x≈21. Causa provável `.stats-heading { align-items:center }` (`styles.css:5736`), DECLARADA. | P2 | `capturas/390-estatisticas-p1.png` | Sim (captura) |
| 7 | A-07 | Hoje/Plano/Estatísticas/Config., 390 px | Alvos de toque pequenos (medido): Hoje 92 de 118 controles abaixo de 44 px e 32 abaixo de 24 px (caixa "Revisão feita" 18x18); Plano 16 de 25 abaixo de 44; cabeçalhos ordenáveis da tabela de Estatísticas têm 14 px de altura; Configurações 5 abaixo de 24 (descontando o select oculto). | P2 | `_auditoria-varredura390.json` (`small24Examples`, `small44Examples`) | Sim |
| 8 | A-08 | Plano | O botão de expandir tem o mesmo nome acessível em todas as linhas: texto fixo "Expandir detalhes" (`src/i18n/locales/pt-BR/appPlan.js:23`), 10 vezes na lista (`kit/_dados-captura.json`, campo `plan`). Leitor de tela não distingue as aulas, a menos que haja `aria-labelledby`/`describedby` (não verifiquei: modo `comportamento` não rodou). | P2 | `kit/_dados-captura.json`; `appPlan.js:23` | Texto: sim. Efeito no leitor: NÃO PROVADO |
| 9 | A-09 | Estatísticas | Chip de tendência "↓ −12 p.p.": seta e sinal dizem a mesma coisa, "p.p." (pontos percentuais) não é explicado e a janela de comparação não aparece no chip. No código a comparação é 30 dias recentes contra 30 anteriores (`src/analytics.js:380-385`), mas a nota logo abaixo diz "todo o histórico, não segue o filtro de período". Não consegui reconciliar qual vale para o chip. | P2 | `capturas/1280-estatisticas-p1.png` | Imagem: sim. Janela: DECLARADA |
| 10 | A-10 | Editor, aceite | A disciplina padrão do rodapé é "Criar nova disciplina" mesmo com 6 disciplinas existentes; a cor padrão da nova é azul (`DEFAULT_SUBJECT_COLOR = 'DISC-BLUE'`, `src/performance-thresholds.js:43`). Quem não escolhe cor terá todas azuis: a ressalva do kit (seção 0, "artefato do seed") vale só para o seed, o padrão real produz o mesmo. | P2 | `capturas/1280-editor-questoes-p2.png`; `kit/1280-rascunho-questoes-p2.png` | Sim |
| 11 | A-11 | Editor, questão | Quatro ações por questão: "Salvar questão" (primário), "Aceitar questão", "Rejeitar questão" e "Excluir questão" (link marrom). A diferença entre Rejeitar e Excluir não é dita na tela. Em 390 px "Excluir questão" é um link de ~20 px de altura. | P2 | `kit/1280-rascunho-questoes-p2.png`, `kit/390-rascunho-questoes-p2.png` | Imagem: sim. Semântica: NÃO PROVADA |
| 12 | A-12 | Conta | O formulário "Alterar senha" aberto não mostra a dica de tamanho mínimo (o cadastro mostra "Mínimo de 15 caracteres", `index.html:809`); o campo tem `minlength="15"` (`index.html:830`). Também: o botão que abre e o botão que envia têm o mesmo rótulo "Alterar senha", lado a lado na mesma caixa. O Entrar não tem "mostrar senha" nem "esqueci a senha" (`index.html:783-797`). | P2 | `capturas/1280-conta-alterar-senha.png` | Sim |
| 13 | A-13 | Materiais | Só existe "Abrir" por documento enviado; não há remover. O texto promete que apagar o original não afeta nada, mas o aluno não tem como tirar o PDF do app. Pode haver afordância fora da vista; não conferi o DOM. | P2 | `kit/1280-materiais-propostas-p1.png` | Imagem: sim. Ausência real: NÃO PROVADA |
| 14 | A-14 | Estatísticas | O histórico "Exercícios resolvidos" continua sem data e com linhas idênticas (as duas primeiras de Anatomia: 20 / 15 / 75,0%). O aviso "o filtro de período não se aplica a esta lista" (c34b7bf) resolve o equívoco do filtro, não o da data. Cabeçalhos "Q" e "A" alinhados à esquerda sobre números alinhados à direita. A 390 px cada linha vira cartão de ~94 px (27 cartões, ~2.500 px) e a nota perde a forma de pílula (texto pequeno). | P2 | `capturas/1280-estatisticas-p2.png`, `capturas/390-estatisticas-p3.png` | Sim |
| 15 | A-15 | Estatísticas | "2 exercícios para reforçar" fecha a frase de atenção e parece total; no código é só da unidade em atenção (`analytics.js:125-142`), enquanto o Plano soma 5 itens em 4 aulas e a Hoje mostra 1. Em ambos os tamanhos o "2" fica sozinho no fim da linha ("…56%. 2 / exercícios…"). | P3 | `capturas/1280-estatisticas-p2.png`, `capturas/390-estatisticas-p2.png` | Sim |
| 16 | A-16 | Estatísticas | "Distribuição do desempenho": 4 de 5 linhas valem 0% e ocupam o espaço; os textos do gráfico "Evolução geral" (eixos) parecem ~7–8 px na captura (não medi). Cartões da coluna direita terminam em x=1237, 9 px além dos demais (x=1228). | P3 | `capturas/1280-estatisticas-p1.png`, `-p2.png` | Sim (visual) |
| 17 | A-17 | Estatísticas, Por conteúdo | Com uma disciplina escolhida, cada linha repete o chip da disciplina truncado ("Fa…") ao lado do título truncado ("Farmaco…"); a linha separadora da primeira célula fica em altura diferente das demais; o painel direito só tem uma instrução (E-06 do kit persiste). | P3 | `capturas/1280-estatisticas-por-conteudo-p1.png` | Sim |
| 18 | A-18 | Todas, 390 px | Rótulos da navegação inferior com 9,4 px; 85 elementos de texto abaixo de 12 px na Hoje, 47 em Estatísticas, 39 em Plano. | P3 | `_auditoria-varredura390.json` (`tinyCount`, `tinyExamples`) | Sim |
| 19 | A-19 | Plano | Ao abrir "Nova aula" o anel de foco aparece em "Conteúdo estudado" e não em "Disciplina" (primeiro campo); o select tem 34 px e os campos 46 px; a barra de filtros encosta no cartão do formulário (1 px). Cartões de disciplina têm ~40 px de espaço vazio abaixo dos botões. A "média" por disciplina é por questões (Fisiologia 40/60 = 66,7%; Neurologia 11/15 = 73,3%, conferi na tela), correta, mas a tela não diz que não é média das aulas. | P3 | `capturas/1280-plano-nova-aula-p1.png`, `capturas/1280-plano-disciplinas-p1.png` | Foco: DECLARADO (vi só o anel) |
| 20 | A-20 | Editor, aceite | Resto de R-01 na base: "Ver o que será criado" e "Aceitar e criar aula" empilhados a 4 px; ~77 px vazios embaixo; grade de cores em 5/5/2; sem nome acessível verificado nas cores. A 390 px, "Voltar à lista de questões" aparece com a lista logo acima. | P3 | `capturas/1280-editor-resumo-p2.png`, `kit/390-rascunho-questoes-p1.png` | Sim (visual) |
| 21 | A-21 | Configurações | "Backup" e "Restaurar ou migrar backup" ficam separados pelo cartão "Apagar base local"; dois modelos de salvar na mesma página (tema vale na hora; idioma exige "Salvar idioma", sempre habilitado); o parágrafo sob o idioma está em texto escuro e a descrição acima em cinza; "conteúdo médico" fixo no texto; cartões de 670 px enquanto Materiais usa a largura toda (Conta também 670). | P3 | `capturas/1280-configuracoes-p1.png`, `-p2.png`, `kit/1280-settings-p2.png` | Sim (visual) |
| 22 | A-22 | Materiais | O rótulo "FONTES" aparece duas vezes (cabeçalho da página e do cartão) junto de "Materiais" e "Fontes em PDF". Na captura 390 do kit só havia o estado base; agora existe `390-materiais-propostas.png` e `390-editor-*.png`. | P3 | `capturas/1280-materiais-propostas-p1.png` | Sim |
| 23 | A-23 | Hoje, 390 px (tamanho) | O conteúdo rola 9.906 px (`main.app-main`, 11,7 telas de 844 px). O kit parou em 5.000 px (limite do instrumento `maxHeight: 5000`), então metade da tela nunca foi vista: as 12 revisões concluídas continuam como cartões cheios (~280 px cada) e só depois vêm "Vale reforçar" e "Amanhã: 2 revisões". Corrobora H-01. | P2 | `_auditoria-hoje390.json` (`geo.innerScrollers`); `capturas/390-hoje-fim-da-rolagem.png` | Sim |
| 24 | A-24 | Plano (instrumento) | `kit/1280-plan-filtro-estado*.png` não mostra filtro de estado: o script usou `select.nth(1)` com os painéis abertos e filtrou por disciplina (Anatomia). O filtro de estado nunca foi capturado nem testado. | P3 | `kit/1280-plan-filtro-estado-p3.png` (seletor mostra "Anatomia" e "Todos os estados") | Sim |

Contagem (por script de leitura desta tabela): 24 achados = 2 P1 + 13 P2 + 9 P3.

## 2. Região final de Hoje no celular (390x844, ~18 vencidas)

Método: contexto Chromium 390x844 com toque, conta descartável com o seed (18 vencidas), rolagem real com a roda do mouse sobre `main.app-main` até `scrollTop + clientHeight = scrollHeight` (14 passos), depois Tab real.

- **O último controle fica visível? Sim, na rolagem.** No fim (`scrollTop` 9126 de 9906), "Ver no Plano" (44 px de altura, w 101) ocupa y 643–687, acima da navegação (topo em 768); o último texto, "Amanhã: 2 revisões.", termina em y 748 (20 px acima da barra). O teste de clique (`elementFromPoint`) nos 6 últimos controles devolve o próprio controle. Imagem: `capturas/390-hoje-fim-da-rolagem.png`.
- **Com teclado, não.** Ver A-04: o foco pode parar totalmente sob a barra (`capturas/390-hoje-foco-por-tab-passo-4.png`).
- A captura 1F-04 do kit termina em 5.000 px por limite do instrumento, não porque a tela acaba ali (A-23).
- Mesma regra do commit `d186db3` (teste de que o fim não fica sob a navegação): a rolagem confere com ele; ele não cobre o foco.

## 3. O que está certo (por tela, preservar)

- **Plano:** a linha-resumo dá muita informação; "Gerenciar disciplinas" e "Nova aula" agora abrem um de cada vez; "Excluir" fica afastado dos outros botões; o cartão expandido mostra "Errou na última tentativa" e histórico.
- **Estatísticas (base):** "Evolução geral" com a nota "Cada ponto reúne as questões de 7 dias. Intervalos sem questões ficam em branco." é honesta; "Sem evidência" / "Amostra insuficiente" evitam nota falsa; o aviso de que o histórico não segue o filtro de período evita o equívoco; os totais fecham (165/233 = 70,8%).
- **Editor:** aba Fonte, aviso de que a conferência automática não é validação médica, resposta oculta nas questões sem pontos.
- **Materiais:** copy que tira medo (cópia do PDF dentro do app; só o texto da seção vai à IA).
- **Configurações:** o texto de Backup diz o que NÃO entra (PDFs e fontes).
- **Conta:** o cadastro mostra o mínimo de senha; mensagem de senha errada curta.
- **Celular:** nenhuma das telas tem rolagem horizontal do documento (`docScrollW = 390` em todas as 16 varreduras).

## 4. O que não dá para provar sem a máquina do usuário

- Renderização no WebView2 do app nativo (tudo aqui é Chromium).
- Fuso horário real do aluno: A-03 só se confirma com `timezoneId` explícito; na máquina do usuário (Brasil) deve aparecer igual.
- Leitor de tela (A-08), tempo real de geração com o provedor de IA verdadeiro (o estado "gerando" não foi capturado), dados reais (o seed tem 9 de 10 aulas atrasadas e 18 vencidas, situação extrema).
- Impressão, animações, modo escuro e temas nessas telas.

## 5. Reprodução

```
node .specs/evidence/auditoria-telas-restantes-2026-11-02/ferramenta/audit-live.mjs <pasta> telas|hoje390|varredura390|build
```
Saídas já geradas em `auditoria-telas-restantes-2026-11-02/capturas/` (100 PNG + 3 JSON) e `_auditoria-build.json`. O modo `comportamento` existe mas não foi rodado; seria o próximo passo para fechar A-03, A-08, A-13, A-19 e as verificações de filtro, validação, diagnóstico copiado e navegação sem sessão.
