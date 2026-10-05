# Prompt Lab — rubrica (T-F5-01) — RASCUNHO PARA APROVAÇÃO (HG-06)

Escala por critério, por questão ou por resumo: `0` = falha, `1` = defeito parcial/material, `2` = sem defeito. Sem nota agregada única: registram-se defeitos concretos por item (página/questão). Gravidade do achado: CRÍTICO / MATERIAL / MENOR. Um único `0` em critério 1 ou 2 (CRÍTICO) bloqueia a prova de qualidade da variante, independentemente das demais notas.

| # | Critério | 0 | 1 | 2 | Conta como defeito (exemplos) |
|---|----------|---|---|---|-------------------------------|
| 1 | Erro clínico crítico | afirmação que, se estudada, levaria a conduta/entendimento errado (CRÍTICO) | afirmação imprecisa sem risco de conduta | nenhuma | direção de efeito invertida; valor ou unidade trocados; contraindicação virou indicação |
| 2 | Fato sem suporte | fato relevante ausente da fonte (CRÍTICO se clínico) | detalhe periférico ausente da fonte | tudo rastreável a página da fonte | número inventado; mecanismo de outro tópico; span que cita página onde o fato não está |
| 3 | Qualificador perdido | qualificador que muda o sentido some | qualificador enfraquecido | preservado | "aproximadamente", "apenas se", "em níveis baixos" viram afirmação absoluta |
| 4 | Explicação circular | explicação só repete pergunta+resposta | explicação reorganiza a fonte sem dar o "por quê" | dá o "por quê" real, sem fato novo | "Porque é isso que ocorre"; responde outra coisa (ex.: explica a classe de drogas em vez do efeito perguntado) |
| 5 | Dica que entrega a resposta | dica contém a resposta ou o raciocínio completo | dica estreita demais a resposta | orienta sem entregar | dica com o termo-resposta; dica que resolve o passo-chave |
| 6 | Cópia literal | trecho extenso da fonte colado | frase inteira copiada onde parafrasear caberia | reformulação própria fiel | pergunta/resposta idênticas a uma sentença da fonte; resumo em sequência de frases copiadas |
| 7 | Volume | explosão ou escassez fora da faixa-alvo da unidade | fora da faixa em uma dimensão (questões OU resumo) | dentro da faixa | questões/1.000 caracteres de fonte acima/abaixo da faixa; resumo > ~25-30% ou < ~10% da fonte (faixa a fixar com o usuário) |
| 8 | Cobertura | conceito central da seção ausente | cobertura parcial / material de escopo vizinho dominante | cobre o central, só o escopo aprovado | página/seção do tópico sem nenhuma questão; questões sobre material fora do escopo aprovado |
| 9 | Idioma | idioma errado ou mistura que atrapalha | termos técnicos sem consistência | idioma da preferência do aluno, terminologia consistente | pergunta em inglês com preferência pt-BR; metalinguagem ("segundo o texto") |

## Medidas determinísticas (apoio, não veredito)
As de `scripts/prompt-lab/metrics.mjs` (volume, razão do resumo, dicas que repetem a resposta, explicações ecoadas/ausentes, números fora da fonte, escopo, duplicatas, cobertura por página) sinalizam candidatos; a nota 0/1/2 é de leitura humana ou assistida e identificada como tal. Vazamento conceitual de dica e explicação circular exigem leitura.

## Procedimento
Cego (variante oculta), mesma unidade e mesma entrada, uma unidade por rodada, avaliador identificado (humano, IA assistida ou ambos) em cada nota; divergência entre avaliadores é registrada, não média. Faixas numéricas do critério 7 são PROPOSED (HG-06) até o usuário fixá-las.
