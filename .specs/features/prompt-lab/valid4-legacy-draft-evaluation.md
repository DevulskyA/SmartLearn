# VALID-4 — avaliação fonte × rascunho do canário Costanzo (rascunho legado, página-limitado)

Data: 2026-10-04 · Avaliador: Claude (Sonnet 5.5, leitura integral da fonte e do rascunho, sem chamar nenhum modelo) · Rascunho: `generated_drafts.id=1` do datastore DEV (`provider=CODEX`, `prompt=5`, gerado em 2026-10-03)
Fonte: Costanzo, *Physiology*, 7ª ed., PDF páginas 267–272 (6 páginas, 20.138 caracteres extraídos) — unidade "Glomerular Filtration" do modelo ANTIGO de unidade (limitada por páginas inteiras).
Regra de cópia: nenhum trecho do livro é reproduzido aqui; referências por página e por número de questão.

## Veredito (sem nota agregada)

- **Fidelidade médica: sem erro crítico encontrado.** Todas as 35 questões e o resumo foram conferidos contra o texto da fonte; valores (45, 10, 19, 35, +16, 0 mm Hg; 70–100 nm; 25–60 nm; 5000 Da; 180 L/dia; 0,45; 600; 1091 mL/min), direção dos efeitos da Tabela 6.6, e o raciocínio da angiotensina II e da inulina batem com a fonte.
- **Contaminação de escopo: DEFEITO MATERIAL (D1).** O rascunho mistura conteúdo de outro tópico (medida do fluxo sanguíneo renal com PAH) por causa do modelo antigo de unidade. É a causa-raiz já corrigida no produto (unidades por seção), mas ESTE rascunho continua contaminado.
- **Conclusão sobre `VALID_4`:** o canário no pipeline ATUAL não está provado por este rascunho (gerado antes da correção de escopo). O que falta é gerar a mesma seção sob o escopo por seção e avaliá-la com a mesma rubrica (feito na rodada do Prompt Lab; ver `valid4-span-rerun.md`). Este documento fica como evidência do estado anterior e do método.

## Defeitos concretos

| ID | Sev | Onde | Defeito | Evidência |
|---|---|---|---|---|
| D1 | P1 | Resumo (parágrafo final), Q9, Q10, Q11, Q12 | Conteúdo de fora do tópico "filtração glomerular": cálculo do fluxo sanguíneo renal (FSR/hematócrito) e PAH. 4 de 35 questões (11%) e 1 de 8 parágrafos do resumo | A página 267 contém a cauda do tópico anterior intercalada no meio de uma frase sobre podócitos (ordem do fluxo de conteúdo do PDF); a unidade por páginas inteiras a enviou ao modelo |
| D2 | P2 | Resumo | Não é resumo: 7.171 caracteres, 36% do tamanho da fonte (≈ paráfrase do capítulo); 8 parágrafos sem estrutura | `summaryToSourceRatio=0,36` |
| D3 | P2 | Q24, Q34 (e Q7, leve) | Dica entrega a resposta ou o raciocínio ("proteção relativa", "outra parte do quociente pode permanecer constante", "cargas de mesmo sinal") | leitura; a heurística de sobreposição NÃO detecta vazamento conceitual (limitação registrada) |
| D4 | P2 | Q1, Q2 (parcial), Q35 | Explicação que reorganiza ou não responde à pergunta (Q1 explica "o que a filtração faz", não por que o ultrafiltrado tem aquela composição) | leitura; item já conhecido de VALID-2 |
| D5 | P3 | Q8, Q16, Q24 | Tipo de questão incoerente com o conteúdo (rotuladas APPLICATION/DISCRIMINATION/CLINICAL_REASONING, mas são recordação do texto) | leitura |
| D6 | P3 | Q16 | Explicação acrescenta inferência não escrita na fonte ("lados diferentes da barreira... sinais opostos"); correta fisicamente, porém não suportada pelo texto | leitura |
| D7 | P2 | conjunto | Volume e redundância: 35 questões para 6 páginas (1,74 por 1.000 caracteres); três questões sobre a mesma figura (Q17–Q19) e seis sobre a inulina (Q30–Q35) | `questionCount=35` |

Sem defeito encontrado em: qualificadores ("mais de 100 vezes", "aproximadamente", "em níveis baixos/altos"), unidades, rastreabilidade (spans de cada questão apontam para a página onde o conteúdo está; única observação: Q35 cita a página 269 sem necessidade), uso de terminologia pt-BR (TFG, FPR, FSR) e hedges clínicos (Q27 limita-se explicitamente ao "mecanismo" da perda proteica).

## Auditoria do produto sobre este rascunho

- Auditoria GRAVADA: 67 pontos, todos determinísticos (`SUMMARY_UNSUPPORTED_TERM` 1, `QUESTION_UNSUPPORTED_TERM` 35, `QUESTION_LOW_SOURCE_SUPPORT` 31) — falsos alarmes de comparar texto PT com fonte EN.
- Auditoria com as regras ATUAIS (somente leitura, sem gravar): `PASS`, 1 aviso informativo (`LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE`). Confirma o 67 → 0 acionáveis.
- A auditoria determinística NÃO detecta D1 (contaminação de escopo) nem D3 (vazamento conceitual de dica): é uma lacuna dos sensores, a tratar em F5 do plano (T-F5-05) e na rubrica do Prompt Lab.

## Medidas determinísticas (scripts/prompt-lab/measure.mjs, somente leitura)

questões 35 · por 1.000 caracteres 1,74 · resumo 7.171 caracteres (razão 0,36) · dicas vazando (heurística) 0 · explicações que só ecoam 0 · sem explicação 0 · números não presentes na fonte 0 · fora de escopo: 4 questões + 4 termos no resumo · quase-duplicadas 0 · páginas sem questões 0.
Leitura: a heurística confirma D1 e D2 e a ausência de números inventados; subestima D3 (limite conhecido).

## Estado de `VALID_4` após este documento

`NOT_PROVEN` até a reavaliação do mesmo conteúdo sob o escopo por seção (próximo documento). Nenhum erro médico crítico não detectado foi encontrado neste rascunho, o que não bloqueia a prova de qualidade.
