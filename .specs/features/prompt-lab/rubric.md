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

## Resumo Mestre — falhas duras e qualidade (extensão do critério 11; sem nota única)
Duas camadas, avaliadas separadamente. Uma FALHA DURA em qualquer item reprova a unidade para estudo; qualidade nunca compensa falha dura.

**Falhas duras (sim/não, com página):** (H1) contradiz a fonte; (H2) fato, valor ou mecanismo sem suporte na fonte; (H3) número, dose ou unidade incorretos; (H4) qualificador material perdido ou absoluto acrescentado; (H5) causalidade ou direção de efeito invertida; (H6) apontamento de fonte falso (trecho inexistente ou que não trata da frase); (H7) conceito central omitido a ponto de impedir a compreensão; (H8) conteúdo de outra seção (fora do escopo aprovado).
Detecção: H3 e parte de H4 por `risk-checks.js`; valor sem suporte (H2) por `draft-audit.js`; existência do trecho (H6) por `claim-evidence.js`; H8 por escopo e `payloadPages`; o restante é leitura contra a fonte (humana ou IA assistida, identificada).

**Qualidade (0 falha, 1 defeito parcial, 2 sem defeito; cada dimensão sozinha):** Q1 cobertura (conceitos da seção, contados contra os títulos e subseções da própria fonte); Q2 estrutura causal (a cadeia "porque, então" está visível); Q3 clareza; Q4 didática (organiza, separa o que se confunde, explica o jargão na primeira vez); Q5 profundidade adequada à unidade; Q6 redundância; Q7 concisão (razão resumo/fonte; paráfrase quase integral é 0); Q8 precisão e estabilidade da terminologia; Q9 explicação de mecanismos; Q10 utilidade para recuperação posterior (dá para revisar em minutos; há estrutura para localizar o ponto).
Medidas de apoio (determinísticas, não veredito): razão resumo/fonte, parágrafos/títulos/listas, conceitos cobertos, frases com trecho da fonte confirmado (`summaryGrounding`).
