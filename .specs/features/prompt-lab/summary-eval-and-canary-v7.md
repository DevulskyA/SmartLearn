# Resumo Mestre — baseline reavaliado e canário v7 (preparado, NÃO executado)

Data: 2026-10-08. Nenhum modelo foi chamado para produzir este arquivo. Rubrica: `rubric.md` (seção "Resumo Mestre — falhas duras e qualidade"). Nenhum trecho do livro aqui: só páginas e números.

## BASELINE (3 gerações reais de 04/10, prompt v5, Costanzo "Glomerular Filtration", PDF 267–273)

```
BASELINE_HARD_FAILURES    = H1 0 · H2 0 · H3 0 · H4 0 · H5 0 · H6 0 (spans na página certa) · H7 0 · H8 em 2 de 3 (run 1 e run 2: último parágrafo do resumo sobre PAH/fração de filtração, de outra seção)
BASELINE_COVERAGE         = 12/12 conceitos da seção nas 3 rodadas (camadas da barreira, carga negativa, Starling e valores, mudanças nas pressões, TFG 180 L/dia, inulina, outros marcadores, fração de filtração, reabsorção/secreção); run 1 e 2 somam o tema vizinho (PAH) por contaminação
BASELINE_DIDACTIC_DEFECTS = Q7 concisão 0 (paráfrase quase integral); Q10 utilidade 1 (12–14 parágrafos corridos, 0–1 título, 0 lista: não há onde localizar um ponto); Q2 e Q9 2 (mecanismo e causalidade presentes); Q8 1 (lamina/lâmina e clearance/depuração variam entre rodadas); Q6 não medida
BASELINE_LENGTH           = resumo 8.913 / 8.343 / 8.304 caracteres (0,36 / 0,34 / 0,34 da fonte)
BASELINE_QUESTION_COUNT   = 38 / 37 / 33 questões (1,54 / 1,50 / 1,34 por 1.000 caracteres)
CODEX_CALLS (fase)        = 8 (3 gerações + 3 auditorias + 2 reparos); 308–579 s por rodada
```

Os sensores de hoje sobre as 3 rodadas, sem modelo: `risk-checks.js` com 0 achados nas 3 (0 falsos positivos medidos).

### Defeitos históricos D1–D9: o que já foi tratado e o que continua

| ID | Estado em 2026-10-08 |
|----|----------------------|
| D1 vizinho contamina o escopo (extração de duas colunas) | **Corrigido de fato hoje.** T-F5-08 (`21aedd1`) reordenou as colunas, mas na página 267 real a última linha da coluna esquerda não tinha marcador de fim de linha e colava no título "GLOMERULAR FILTRATION"; o título deixava de ser localizável, e o escopo da seção passava a começar no fragmento do vizinho e a perder a abertura da seção (pior que antes). Corrigido em `column-order.js` (fronteira de bloco = fronteira de linha, teste novo). Prova no PDF real: o escopo começa no título, 0 ocorrências do fragmento, 23.009 caracteres (antes 23.335). A fonte já gravada no banco DEV continua com a extração antiga (OPEN-07: reextrair exige backup e decisão sua). |
| D2 resumo grande demais | Continua. Sem teto além de 12.000 caracteres e do "proporcional" do prompt. Alvo natural de uma hipótese de prompt (H1), só depois do canário. |
| D3 dica entrega o raciocínio | Continua (o sensor lexical só pega a resposta literal). |
| D4 explicação sem o "porquê" | Continua, mais leve que no legado; a v6 já exige explicação com causa. |
| D5 tipo da questão incoerente | Continua. |
| D6 linguagem de meta ("segundo o texto") | Continua, sem sensor. |
| D7 volume | Continua; só aviso (T-F2-06), não muda a geração. |
| D8 dica nula | Continua, menor. |
| D9 terminologia instável | Continua, menor; a diretiva de idioma da v6 não fixa glossário. |

Resolvido por estrutura desde 04/10: idioma (v6 + contrato), escopo/reuso/crédito antes do provedor (F10), aceite bloqueado por achado HIGH, unidade trocada e qualificador (sensores), apontamento frase → trecho (v7).

## CANÁRIO V7 — PREPARADO

```
UNIT              = "Renal Blood Flow" (Costanzo, Physiology), ordinal 505, seção e não página
SOURCE            = o mesmo PDF já local; para o laboratório, uma CÓPIA reextraída com o extrator atual em um banco novo sob SmartLearn-PromptLab\work (nunca o banco DEV humano; o lab.db do baseline fica intacto como referência)
PAGES             = PDF 263–267 (a seção termina na coluna esquerda da 267, antes de "Glomerular Filtration"); escopo medido: 263:769 · 264:4.570 · 265:2.312 · 266:3.401 · 267:1.492 caracteres
SOURCE_CHARS      = 12.548 (inglês; 55% da unidade do baseline; sem o título nem o texto de "Glomerular Filtration"). Resíduo conhecido: o rodapé "Www.Medicalstudyzone.com" entra no fim do payload (marca d'água da fonte; ruído, não bloqueia)
WHY_THIS_UNIT     = discrimina o que o baseline não exercita: mecanismo em cadeia (autorregulação e feedback tubuloglomerular; 39 marcadores causais), qualificadores (15: "only", "may", "can", "about"), números com unidade (10, incluindo os 25% do débito cardíaco e a conta de fluxo plasmático/sanguíneo renal), um cálculo (depuração de PAH → RPF → RBF), fronteira real com a seção vizinha (testa a correção D1 na prática) e EN → PT. Mais barata que o baseline
PROMPT_VERSION    = 7 (nenhuma alteração antes da leitura do canário)
MODEL             = provedor CODEX (a conta ChatGPT/Codex CLI já logada, o mesmo de 04/10); modelo = o padrão do CLI (SMARTLEARN_CODEX_MODEL não definido); registrar o modelVersion devolvido
EXPECTED_CALLS    = 2 (geração + auditoria do modelo)
MAX_CALLS         = 3 (no máximo 1 reparo); qualquer outra chamada reprova o experimento
EXPECTED_COST     = sem preço por chamada nesta conta (assinatura). Estimativa do próprio produto: 48.549 unidades para 3 chamadas (o baseline estimava 59.010); ~5–10 min de relógio (04/10: 308–579 s)
MAX_COST_PROPOSAL = 3 chamadas Codex, 45 min de relógio (teto de budget.md), no máximo 48.549 unidades estimadas. Teto monetário não se aplica a assinatura; os valores de franquia seguem pendentes (HG-11)
RUNNER            = scripts/prompt-lab/run-generation.mjs --db <cópia sob SmartLearn-PromptLab> --section "Renal Blood Flow" --runs 1
RUBRIC            = rubric.md (falhas duras H1–H8, qualidade Q1–Q10); baseline = os números acima
```

**HARD_FAIL_CONDITIONS (qualquer uma reprova o canário):**
1. o provedor recebeu texto fora do escopo aprovado (payloadPages ≠ 263–267, payloadChars ≠ 12.548, ou o título "Glomerular Filtration" no payload);
2. mais de 3 chamadas, ou uma 2ª geração sem pedido explícito;
3. idioma errado persistido (LANGUAGE_MISMATCH engolido);
4. conteúdo com falha dura H1–H8 (leitura contra a fonte);
5. apontamento de fonte falso aceito (trecho que não está na página) ou nenhuma entrada de `summaryEvidence` confirmada (o modelo não cumpre o contrato v7);
6. conteúdo com achado HIGH aceito sem a ação humana de conferência.

**WHAT_THIS_CANARY_PROVES:** o contrato v7 com o Codex real (quantas entradas de evidência o modelo envia, quantas o servidor confirma e a fração de frases com trecho confirmado); a correção D1 de ponta a ponta numa fronteira de seção real; o escopo e a contagem de chamadas em produção; os sensores de unidade/qualificador e o bloqueio de aceite sobre saída real; a posição do resumo contra o baseline (tamanho, estrutura, cobertura) numa segunda unidade, com mecanismo e qualificadores.

**WHAT_IT_DOES_NOT_PROVE:** qualidade geral do Resumo Mestre (1 unidade, 1 geração: não há variabilidade); que "trecho confirmado" implica a frase; a qualidade das questões em escala; o estudo ponta a ponta com conteúdo gerado (aceite → Estudar agora com esse rascunho é outro passo); outros idiomas e fontes; benchmark humano (VALID-8).

**HUMAN_REVIEW_NEEDED:** sim. Leitura do resumo contra a fonte para H1–H7 por uma pessoa (a avaliação da IA assistente é a pré-leitura, não substitui); no mínimo todas as frases sem trecho confirmado e uma amostra de 5 frases com trecho confirmado.

## RESULTADO DO CANÁRIO V7 (executado em 2026-10-08, autorizado; 1 rodada, Codex, banco de laboratório `work\lab-v7.db`, saídas em `runs\v7-canary-rbf-*`)
```
CANARY_STATUS      = CONCLUÍDO, nenhuma condição de falha dura disparada
CALLS              = 3 (geração + auditoria do modelo + 1 reparo) = o máximo; nenhuma geração extra
DURATION           = 350 s (teto 45 min)
SOURCE_SCOPE_OK    = sim: páginas 263–267, payloadChars 12.544 = sourceChars (a medição prévia deu 12.548: diferença de 4 de espaço em branco, mesmo escopo), sem o título "GLOMERULAR FILTRATION"
LANGUAGE           = VERIFIED, pt-BR (fonte en)
EVIDENCE           = 32 entradas confirmadas pelo servidor, 0 em quarentena; frases com trecho confirmado 28 de 34 (82%); 1 entrada órfã (a frase foi reescrita no reparo). O total proposto pelo modelo não é gravado (limite de instrumentação)
NOT_LINKED (6)     = 1 frase que funde duas da fonte + 5 de fórmula (a extração do PDF desfigura as fórmulas, então o modelo não consegue citar literalmente); lidas contra a fonte: todas fiéis
SUMMARY_LENGTH     = 5.692 caracteres, 9 parágrafos, 0 títulos, 0 listas; razão 0,45 da fonte (baseline 0,34–0,36)
QUESTIONS          = 31 (2,47 por 1.000 caracteres; baseline 1,34–1,54); 6 com linguagem de meta
GATES              = achados finais: 2 HIGH `QUESTION_ANSWER_LEAKED` (só pedagógicos, não bloqueiam; na leitura, os enunciados não entregam a resposta: sensor lexical exagerado) e 1 MEDIUM `QUALIFIER_ADDED` do sensor novo
```
Leitura contra a fonte (IA assistida; a revisão humana continua pendente): H1–H8 = 0 encontradas. Valores conferidos (25%, 5 L/min → 1,25 L/min → 1800 L/dia, 80–200 mm Hg, ~10%, 1 mL/min, 1 mg%, 600 mg%, Hct 0,45, 600 e 1091 mL/min); mecanismos conferidos (miogênico, feedback tubuloglomerular com mácula densa, candidatos Na+/Cl− e adenosina/ATP/tromboxano, dieta rica em proteínas, Fick, PAH, hematócrito); a frase "somente abaixo de 80 mm Hg" é fiel (a própria fonte diz "Only when…"). Cobertura 3 de 3 subseções (regulação, autorregulação, medida de RPF/RBF); omissão menor: o uso clínico da dopamina em baixa dose na hemorragia. 5 frases com trecho confirmado conferidas: o trecho existe e sustenta a frase.

Defeito achado e corrigido (servidor, sem mexer no prompt): o `QUALIFIER_ADDED` era falso positivo: a frase do rascunho funde duas frases da fonte e o "only" está na vizinha. A comparação agora considera a frase pareada e suas vizinhas (teste novo, vermelho sem a janela). Sobre as 3 rodadas de 04/10 e o canário: 0 achados do `risk-checks`. `audit-rules-3`. Também: uma frase só fica `SOURCE_LINKED` se todo valor que ela afirma estiver nos trechos que a sustentam (`PARTLY_LINKED` caso contrário; no canário nenhuma ficou parcial).

Veredito do prompt v7: **KEEP o contrato de evidência** (o modelo real cumpre o formato e as citações são reais). A qualidade do resumo continua **NOT_PROVEN** além de 1 unidade e 1 geração, e os defeitos de concisão (0,45 da fonte), estrutura (sem títulos) e volume de questões (2,47/1.000) persistem: a v7 não os trata, como desenhado.

## CICLO v7 → v8 (2026-10-08; 6 chamadas reais neste ciclo; envelope do programa: 9 de 12 usadas, ~16 de 180 min)
Hipótese única (v8): o resumo da v7 é paráfrase quase integral em prosa sem estrutura. O challenger muda SÓ as regras do resumo (mapa de estudo por conceito com título curto, cadeia causa → mecanismo → efeito, sem referir o documento, ~1/4 a 1/3 da fonte sem perder mecanismo, número, qualificador ou conceito central); fidelidade, evidência e questões idênticas (teste garante que o prompt só difere nessas linhas).

| Medida (mesma unidade "Renal Blood Flow", 12.544 car., 3 chamadas cada) | v7 (baseline) | v8 (challenger) |
|---|---|---|
| Falhas duras H1–H8 (leitura contra a fonte, IA assistida) | 0 | 0 |
| Cobertura (mapa de 19 conceitos) | 19/19 | 19/19 (inclui o uso clínico da dopamina, que a v7 omitiu) |
| Resumo | 5.692 car., 9 parágrafos, 0 títulos (0,45 da fonte) | 5.315 car., 8 títulos + parágrafos (0,42) |
| Linguagem de meta (resumo / questões) | presente / 6 de 31 | 0 / 0 de 26 |
| Questões (por 1.000 car.) | 31 (2,47) | 26 (2,07) |
| Frases com trecho confirmado (cabeçalhos fora da conta) | 28/34 (82%) | 21/27 (78%) + 2 parciais |
| Tempo | 350 s | 315 s |

Validação em 2ª unidade (só v8, sem baseline): "Free-Water Clearance", PDF 313–315, 7.396 car., cálculo e caso clínico: 3 chamadas, 291 s, escopo exato, pt-BR verificado, 0 falhas duras de conteúdo, títulos por conceito, 0 linguagem de meta, 16/21 frases com trecho confirmado, 21 questões. O caso do livro tem dois valores discordantes (7 e 70 mOsm/L) e o resumo os apontou.

**Veredito: PROMOVER a v8 como padrão** (`promptVersion` 8; a 7 continua reproduzível). Ganho em estrutura, linguagem de meta e volume sem perda de fidelidade ou cobertura; concisão continua fraca (0,42 e 0,53 da fonte): o modelo prioriza fidelidade, e parte do texto-fonte é fórmula/figura desfigurada que não comprime. Não persegui mais o prompt por tamanho (ganho marginal, regra do programa).

Achados de produto desta rodada (não são do prompt):
- D10 (P2) segmentação: o escopo de "Free-Water Clearance" levou ~1,3 mil caracteres do início da página 315 (bullets de resumo de capítulo) porque o texto antes do primeiro título de uma página pertence à última seção anterior; o resumo ganhou um parágrafo de Na+/K+ que não é do tema (H8 de segmentação, não de escopo: o payload respeitou o escopo aprovado).
- D11 (P2) extração: decimais de equações tipografadas saem partidos ("3 45", "6 55"); os valores corretos 3,45 e 6,55 do resumo foram marcados HIGH `SUMMARY_UNSUPPORTED_VALUE` e bloquearam o aceite até a conferência humana (o bloqueio funcionou como projetado; o falso positivo vem da extração).

## EXPERIMENTO DE COMPRESSÃO v9 (2026-10-09; últimas 3 chamadas do envelope: 12 de 12 usadas, ~20 de 180 min)
Hipótese única (v9): v8 estrutura mas ainda percorre a fonte inteira; escolher primeiro o essencial (reter mecanismos, causalidade, condições, números que importam; deixar de fora repetição, exemplos só ilustrativos, listas de baixo valor, transições do livro). Mesma unidade e MESMO texto-fonte da v8 (hash da extração idêntico após D10/D11).

Métrica corrigida (`scripts/prompt-lab/coverage.mjs`): fonte bruta 12.307 car., fonte significativa 10.897 (sem marca d'água e resíduo de equação/figura).

| | v7 | v8 | v9 |
|---|---|---|---|
| Resumo (car.) | 5.692 | 5.315 | 4.854 |
| razão bruta / SIGNIFICATIVA | 0,46 / 0,52 | 0,43 / 0,49 | 0,39 / **0,45** |
| Cobertura (19 conceitos) | 19 | 19 | **17** (perdeu a lista de vasoconstritores/vasodilatadores e o exemplo numérico 600/1091) |
| Falhas duras (leitura contra a fonte) | 0 | 0 | 0 |
| Títulos / linguagem de meta | 0 / sim | 8 / 0 | 8 / 0 |
| Questões | 31 | 26 | 23 |
| Frases com trecho confirmado | 82% | 78% | 74% |
| Tempo | 350 s | 315 s | 258 s |

**Veredito: COMPRESSION_NOT_SOLVED; KEEP_V8.** A v9 só baixou a razão significativa de 0,49 para 0,45 (alvo do experimento: 0,25; "claramente melhor": ~0,30) e ainda perdeu 2 conceitos: mesmo trade-off ruim da regra do envelope, então REJEITADA como padrão (continua selecionável com `promptVersion` 9). Instruções de seleção não fazem o modelo abstrair mais: ele troca omissão por frases mais densas. Hipótese para o próximo envelope (não executada): resumo em DUAS CAMADAS, um núcleo de 1 a 2 linhas por conceito (gancho de memória, meta ≤ 0,2) e o detalhe causal por baixo, em vez de pedir um texto único mais curto. Padrão v8 permanece o melhor atual.
