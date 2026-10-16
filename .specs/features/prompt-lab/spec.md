# Prompt Lab — especificação (v1, harness + baseline)

Status: HARNESS E BASELINE ENTREGUES; CONGELADO. Nova execução só por ordem explícita (ver abaixo).

> **SEM AUTORIZAÇÃO PARA EXECUTAR (decisão humana 2026-10-04).** O Prompt Lab NÃO é próxima tarefa, nem etapa implícita de nenhum plano, /goal ou /loop. Nenhuma geração (Codex, Prompt Lab, variante ou modelo externo) roda sem ordem explícita da pessoa, dada para aquela execução. "Próxima etapa possível" != "etapa autorizada".

Status: ATIVO desde 2026-10-04 (autorizado pelo usuário: "avance para o Prompt Lab"). Estado do produto: INALTERADO (prompt v5, provedor Codex). Este laboratório NÃO conecta nenhum resultado ao produto.

## Objetivo
Medir a qualidade do conteúdo gerado por IA a partir de unidades reais, de forma repetível, com rubrica fixa e medidas determinísticas, para decidir com evidência se e como o prompt/contrato deve mudar. Entregáveis desta fase: (1) harness que gera rascunhos pelo pipeline REAL numa cópia de laboratório; (2) medidas determinísticas; (3) rubrica de avaliação; (4) rodada de baseline do prompt atual com a unidade por seção; (5) relatório comparativo e lista priorizada de hipóteses de melhoria (não aplicadas).

## Fora de escopo
Alterar `draft-prompt`, provedor ou esquema do produto; ligar variantes ao app; avaliar mais de uma unidade; benchmark grande; substituir a revisão humana.

## Salvaguardas (testadas)
- O laboratório só abre uma CÓPIA sob um diretório `SmartLearn-PromptLab`; recusa o datastore DEV humano (`SmartLearn-DevData`), o banco do AppData e qualquer caminho fora do padrão (`test/prompt-lab-runner.test.js`).
- Orçamento: no máximo 3 rodadas por invocação (cada rodada = 1 geração + auditoria do modelo + no máximo 1 reparo); mais exige `--allow-more` explícito.
- Saídas ficam em `C:\Users\Ariel\SmartLearn-PromptLab\runs\` (fora do repositório). Nenhum texto do livro entra no Git; relatórios citam página/questão, não trechos.
- Provedor real só pelo runner, nunca por testes automatizados (os testes usam FAKE).

## Medidas determinísticas (`scripts/prompt-lab/metrics.mjs`)
Volume por 1.000 caracteres de fonte; tamanho e razão do resumo; distribuição de tipos; dicas que repetem a resposta (sobreposição); explicações que só ecoam pergunta+resposta; explicações ausentes; NÚMEROS que não aparecem na fonte (sensor barato de valor inventado); contaminação de escopo (termos de fora do tópico, em questões e no resumo); questões quase duplicadas; cobertura por página. São SINAIS: nenhuma é veredito médico. Limite conhecido: vazamento CONCEITUAL de dica e explicação circular exigem leitura.

## Rubrica humana/assistida (sem nota agregada; defeitos concretos por questão)
1. Fidelidade (o conteúdo está na fonte? valores, unidades, direção de efeitos).
2. Suporte e rastreabilidade (o span cita a página onde o conteúdo está).
3. Qualificadores preservados (aproximadamente, mais de, em níveis baixos/altos, apenas se).
4. Escopo (só o tópico aprovado; sem material vizinho).
5. Pergunta (responde-se com a fonte; sem ambiguidade; uma ideia por pergunta).
6. Resposta (correta e completa no nível pedido).
7. Explicação ("por quê" que realmente responde, não reorganiza a fonte; sem fato novo).
8. Dica (orienta sem entregar resposta nem raciocínio).
9. Tipo da questão coerente com o conteúdo.
10. Volume e redundância (cobre o conceito central sem inflar).
11. Resumo (é resumo: tamanho e estrutura úteis para revisão).
Gravidade: CRÍTICO (erro médico/fato crítico sem suporte) bloqueia a prova de qualidade; MATERIAL; MENOR.

## Critérios de decisão
Uma variante só vira candidata a produto se, sobre a mesma unidade e a mesma entrada, reduzir os defeitos MATERIAIS sem introduzir CRÍTICOS e sem piorar fidelidade; a decisão de adotar é humana e vira tarefa própria (HG explícito).

## Primeira hipótese a testar (não aplicada)
H1 resumo estruturado e limitado em tamanho; H2 limite/escala de questões por tamanho da unidade; H3 instrução explícita para dicas que não nomeiam o mecanismo; H4 rótulo de tipo derivado do conteúdo. Cada uma só vira variante depois do baseline.

## Comandos
```
node scripts/prompt-lab/measure.mjs --db <db> [--draft N] [--terms a,b] [--audit] [--json out]    # somente leitura
node scripts/prompt-lab/run-generation.mjs --db <cópia sob SmartLearn-PromptLab> --section "<título>" --runs 3 --terms a,b
node --test test/prompt-lab-metrics.test.js test/prompt-lab-runner.test.js
```
