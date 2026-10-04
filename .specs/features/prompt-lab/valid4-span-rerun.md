# VALID-4 / VALID-5 — baseline do prompt v5 sob escopo por seção (3 gerações reais)

Data: 2026-10-04 · Avaliador: Claude (Sonnet 5.5; leitura integral da fonte e dos 3 rascunhos; nenhum modelo chamado pela avaliação) · Método: rubrica de `spec.md` (11 itens, sem nota agregada) + `scripts/prompt-lab/measure.mjs --audit`.
Unidade: Costanzo, *Physiology*, 7ª ed., seção "Glomerular Filtration", PDF páginas 267–273 (escopo por seção, `sourceScope.approvedPages=[267,273]`, 19 spans, ~23,3 mil caracteres). Pipeline REAL (prompt v5, provedor CODEX, auditoria do modelo, ≤ 1 reparo) numa CÓPIA sob `SmartLearn-PromptLab`; produto e banco DEV humano intocados.
Saídas (fora do Git): `C:\Users\Ariel\SmartLearn-PromptLab\runs\baseline-v5-span-20261004-172209\` (`run-1..3.json`, `index.json`); rascunhos 2, 3 e 4 de `work\lab.db`.
Regra de cópia: nenhum trecho do livro aqui; referências por página e por número de questão. Substitui, para o pipeline atual, o estado de `valid4-legacy-draft-evaluation.md` (rascunho legado, escopo por páginas).

## Veredito (sem nota agregada)

- **Erro médico crítico: nenhum nas 3 gerações.** Todas as questões e os resumos foram conferidos contra a fonte: valores (45, 10, 19, 35, +16 e 0 mm Hg; 70–100 nm; 25–60 nm; ~5000 Da; 180 L/dia; 0,20; limiar BUN/creatinina > 20; exemplo 100 mL/min nos dois momentos), direção dos efeitos da Tabela 6.6 (aferente, eferente, proteínas ↑/↓, ureter), ordem de filtrabilidade das dextranas, raciocínio da angiotensina II (baixa × alta) e dos inibidores da ECA, creatinina × inulina. Aritmética das questões numéricas refeita. Qualificadores ("mais de 100 vezes", "aproximadamente", "relativa/preservada", "normalmente") preservados.
- **Defeitos MATERIAIS recorrentes** (mesmas classes nas 3 rodadas): resumo grande demais, dicas que entregam o raciocínio, linguagem de meta, tipo de questão mal rotulado, volume alto. Contaminação de escopo (PAH) em 2 de 3.
- **Estado:** `VALID_4=PASS` (escopo declarado abaixo) · `VALID_5=PASS` para consistência de fidelidade, com lacunas de sensor registradas · `VALID_8` e `REALMODEL_CONTENT_QUALITY_PROVEN` seguem **NOT_PROVEN** (decisão/confirmação humana, HG-06).

Limites do veredito (não promover além disto): 1 unidade, 3 gerações, avaliação por IA (outro modelo que o gerador) e não por pessoa; leitura completa mas sem especialista clínico. Não prova qualidade em outras seções/livros nem estabelece taxa de erro; prova que, nesta unidade, o pipeline atual não produziu erro médico detectável em 3 de 3 tentativas.

## Medidas determinísticas (measure.mjs, somente leitura)

| Medida | Run 1 (draft 2) | Run 2 (draft 3) | Run 3 (draft 4) |
|---|---|---|---|
| Tempo de geração | 579 s | 308 s | 490 s |
| Reparo do modelo | sim | não | sim |
| Auditoria do modelo / determinística gravada | OK / PASS (1 aviso informativo) | OK / PASS (1) | OK / PASS (1) |
| Questões (por 1.000 car. de fonte) | 38 (1,54) | 37 (1,50) | 33 (1,34) |
| Resumo (razão com a fonte) | 8.913 car. (0,36) | 8.343 (0,34) | 8.304 (0,34) |
| Números ausentes da fonte | 0 | 0 | 0 |
| Explicação ausente / eco da pergunta | 0 / 0 | 0 / 0 | 0 / 0 |
| Dica ausente | 0 | 1 (Q2) | 0 |
| Dica vazando (heurística de sobreposição) | 0 | 0 | 0 |
| Fora de escopo: questões / resumo (PAH) | 1 (Q38) / 1 parágrafo | 1 (Q37) / 1 parágrafo | 0 / 0 |
| Quase-duplicadas / páginas sem questão | 0 / 0 | 0 / 0 | 0 / 0 |
| Linguagem de meta em pergunta ou resposta (regex*) | 8 de 38 | 8 de 37 | 8 de 33 |

\* Heurística por regex ("segundo o texto", "na tabela", "descrito", "apresentado", "no exemplo"...): pode incluir falsos positivos (p.ex. "No exemplo, [P]… ") e subconta paráfrases. É sinal, não veredito.
Auditoria determinística com as regras ATUAIS (somente leitura): `PASS` nas 3, único achado `LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE` (informativo) — mantém o 67 → 0 acionáveis.
Nota: o runner e o `measure.mjs` usam denominadores de fonte ligeiramente diferentes (carga enviada ao modelo × texto das páginas); os números acima são do `measure.mjs`.

## Defeitos concretos

| ID | Sev | Run 1 | Run 2 | Run 3 | Defeito |
|---|---|---|---|---|---|
| D1 | P1 | Q38 + último parágrafo do resumo | Q37 + último parágrafo do resumo | ausente | Fragmento do tópico vizinho (PAH/FSR) que a extração intercala numa frase da pág. 267 (ordem do fluxo de conteúdo do PDF) chega ao modelo mesmo com escopo por seção; o modelo o reproduz em 2 de 3 gerações. Causa CONFIRMADA: EXTRAÇÃO, não o prompt (o conteúdo está no payload): a pág. 267 é de duas colunas e o PDF emite a coluna direita (início da seção) antes da esquerda (cauda do tópico anterior); a extração preserva essa ordem de fluxo. Tarefa: T-F5-08 em `hardening-roadmap-v1/tasks.md`. A auditoria não detecta (PASS). |
| D2 | P2 | 36–38% | 34–36% | 34–36% | Resumo grande demais (≈ 8,3–8,9 mil caracteres, paráfrase quase integral); run 2 usa títulos de seção, runs 1 e 3 não (estrutura não determinística). |
| D3 | P2 | ≥ Q7, Q17, Q23, Q28 | ≥ Q13, Q15, Q28 | ≥ Q13, Q14, Q18, Q26 | Dica entrega o raciocínio/mecanismo ("vazamento conceitual"; ex.: dica de Run 3 Q14 aponta a "resistência depois do capilar", que é a resposta). A heurística de sobreposição NÃO pega (0 nas 3). Lista = amostra por leitura, não exaustiva. |
| D4 | P2 | Q1, Q35 (parcial) | Q1, Q35 (parcial) | Q1 (parcial) | Explicação que reorganiza ou não responde "por quê". Menos grave que no rascunho legado. |
| D5 | P3 | maioria "MECHANISM" (15) | Q7 "APPLICATION", Q24 "CLINICAL_REASONING" | Q5 "MECHANISM", Q9 "CONCEPT", Q25 "APPLICATION" | Tipo de questão incoerente com o conteúdo (são recordação de fato/estrutura/fórmula). |
| D6 | P2 | 8/38 | 8/37 | 8/33 | Linguagem de meta nas perguntas/respostas ("segundo o texto", "na tabela", "no modelo apresentado"): em estudo, a pergunta depende do livro. |
| D7 | P2 | 38 | 37 | 33 | Volume para 7 páginas (33–38; 1,34–1,54 por 1.000 car.) com sobreposição entre questões vizinhas (efeito aferente/eferente; PGC constante × equilíbrio de filtração). Run 3 é o menor volume sem perder cobertura. |
| D8 | P3 | — | Q2 sem dica | — | Dica nula numa questão (não detectada pelos sensores). |
| D9 | P3 | "lâmina", "pedicelos", "depuração" | "lamina rara", "processos podais", "clearance" | "lamina/laminae", "processos podais", "depuração" | Terminologia e acentuação pt-BR instáveis entre gerações ("lamina" sem acento em 2 de 3; "clearance" × "depuração"). |

Sem defeito encontrado em: fidelidade de valores/unidades/sinais, qualificadores, rastreabilidade (spans apontam a página onde o conteúdo está; observação menor: spans largos em algumas questões de síntese, p.ex. Run 1 Q36, Run 2 Q16, Run 3 Q33 citam 269–273), coerência do gabarito, hedges clínicos (síndrome nefrótica e ureter tratados como "efeito isolado/segundo a tabela").

## VALID-5 — consistência entre gerações

| Pergunta (plano) | Resposta (evidência) |
|---|---|
| Erros críticos | 0 em 3 gerações. |
| Fatos sem suporte / valores inventados | 0 por sensor e por leitura; inferências leves (p.ex. "as pressões no exemplo") dentro do que a figura mostra. |
| Qualificadores perdidos | Nenhum encontrado. |
| Achados do gate e reparos | Auditoria determinística idêntica nas 3 (PASS, 1 aviso informativo); modelo "OK" nas 3; reparo em 2 de 3 (Run 1 e 3), não em Run 2. O conteúdo reparado não foi comparado antes × depois. |
| Mesmas classes de defeito? | Sim, nas classes D2, D3, D4, D5, D6, D7, D9; D1 (escopo) não estável (2/3). |
| O gate segue eficaz entre gerações? | PARCIAL: eficaz para números, citações, duplicatas e ausência de explicação (0 falsos negativos observados); INEFICAZ para contaminação de escopo (D1), vazamento conceitual de dica (D3) e rótulo de tipo (D5) — nenhuma dessas aparece como achado em nenhuma rodada. Isso alimenta T-F5-05 (sensores) e o Prompt Lab (H1–H4). |

Conclusão VALID-5: **consistência de fidelidade = PASS** (3/3 sem erro crítico; variação entre rodadas é de estrutura, volume e escopo, não de correção médica). Eficácia do gate = lacunas registradas, não bloqueantes para a prova de fidelidade, bloqueantes para qualquer afirmação de "qualidade de conteúdo provada" (VALID-8).

## Hipóteses para o Prompt Lab (não aplicadas; nada muda no produto)

H1 resumo estruturado e limitado (D2) · H2 limite/escala de questões por tamanho (D7, HG-01) · H3 dica sem nomear o mecanismo (D3) · H4 tipo derivado do conteúdo (D5) · H5 (nova) sem referência ao material na pergunta/resposta (D6) · achado D1 vira TAREFA DE PRODUTO separada (ordem de leitura da extração do PDF), fora do Prompt Lab.

## Custo e rastreabilidade

3 gerações reais pelo runner (rodadas de 579, 308 e 490 s), cada uma com auditoria do modelo e, em 2 de 3, 1 reparo (limite do runner: 3 rodadas por invocação). `CODEX_CALL_COUNT` desta fase ≈ 3 gerações + 3 auditorias do modelo + 2 reparos = 8 chamadas (derivado de `audit.modelAudit` e `audit.repaired` gravados; o runner não grava contador explícito). Esta avaliação não chamou nenhum modelo. Dois `codex.exe` de 03/10 (PIDs 19624, 21796) são daemons de outra origem e não foram tocados.
