# Prompt Lab — variantes propostas (NÃO executadas; produto inalterado)

Origem: defeitos D2–D7 de `valid4-span-rerun.md` (baseline prompt v5, escopo por seção, 3 gerações). Cada variante é um ADENDO ao prompt v5 (nunca substitui o prompt do produto), medida sobre a MESMA unidade e a mesma entrada, com ≥ 2 gerações por variante e comparação cega por defeito (rubrica de `spec.md`). Uma variante só vira candidata se reduzir defeitos materiais sem introduzir erro crítico e sem piorar fidelidade; adotar é decisão humana e vira tarefa própria (T-F5-06).

| ID | Defeito-alvo | Adendo (essência) | Medida de sucesso | Risco a vigiar |
|---|---|---|---|---|
| H1 | D2 resumo grande (34–38% da fonte) | Resumo estruturado em seções curtas, teto proporcional (p.ex. ≤ 20% da fonte), só definições/mecanismos/valores/condições | `summaryToSourceRatio` ≤ 0,20; nenhum valor/qualificador perdido (revisão) | perder qualificadores ao comprimir |
| H2 | D7 volume (33–38 q / 7 págs) | Escala de questões por tamanho (HG-01), prioridade a conceito central, sem duas questões sobre o mesmo mecanismo | questões por 1.000 car. dentro da política; cobertura por página sem buracos; redundância ↓ | buracos de cobertura |
| H3 | D3 dica que entrega o raciocínio | Dica aponta a categoria/relação sem nomear o mecanismo, a estrutura ou a direção; `hint=null` quando não houver cue honesto | releitura cega das dicas (taxa de vazamento conceitual); taxa de `hint=null` | dicas vazias/inúteis |
| H4 | D5 tipo mal rotulado | Rótulo derivado da operação cognitiva exigida (recordar × explicar × aplicar), com definição curta por tipo | concordância do tipo com a leitura humana em amostra | tipos todos "RECALL" |
| H5 | D6 linguagem de meta | Proibir "segundo o texto/tabela/figura/modelo" em pergunta e resposta; pergunta autocontida | `meta em P/R` (regex) → ~0, sem perder fidelidade | perda de contexto da pergunta |

Fora do Prompt Lab (tarefas de produto, deterministas): D1 → T-F5-08 (ordem de leitura por colunas na extração); sensores de escopo, de vazamento conceitual e de tipo → T-F5-05.

## Como executar (pendências antes de gastar chamadas ao Codex)

1. **Ponto de injeção do adendo.** `createDraft` seleciona o provedor por dentro (`selectProvider`) e `buildDraftPrompt` não aceita adendo; um adendo exige OU um gancho opcional (default sem efeito) no produto OU um caminho de geração próprio do laboratório que chame o Codex com o prompt da variante e valide com os mesmos `validateDraft`/auditoria do produto. Escolher o menor desvio e provar que o produto não muda sem o adendo. Decisão técnica reversível; só vira gate humano se tocar o produto.
2. **Orçamento (HG-07).** Cada geração custa ≈ 5–10 min e ≈ 3 chamadas (geração + auditoria do modelo + reparo). Proposta: 2 gerações por variante × 5 variantes = 10 gerações; requer o teto de chamadas aprovado pelo humano.
3. **Medidas.** Reusar `metrics.mjs`; acrescentar o contador de linguagem de meta e a taxa de `hint=null`; manter a leitura humana/assistida como juiz do vazamento conceitual e do rótulo de tipo.
