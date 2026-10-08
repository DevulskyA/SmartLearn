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
