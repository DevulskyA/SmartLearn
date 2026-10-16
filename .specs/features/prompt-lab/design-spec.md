# Prompt Lab — desenho (T-F5-01) — RASCUNHO PARA APROVAÇÃO

Status: RASCUNHO. Depende de HG-06, HG-07 e HG-08 confirmados pelo usuário. Nada aqui autoriza execução: nenhuma geração (Codex, variante ou modelo externo) roda sem ordem explícita da pessoa para aquela execução (decisão 2026-10-04, ver `spec.md`).

Nota de nomes: `spec.md` neste diretório já existe e descreve o harness e o baseline v1 (entregues, congelados). Este arquivo (`design-spec.md`) é o desenho da próxima fase (T-F5-01); ao ser aprovado, vale como seção/sucessor do `spec.md`. Os demais entregáveis (`rubric.md`, `dataset.md`, `budget.md`) ficam ao lado.

## Objetivo
Transformar "parece bom" em medida (R-05, AC-05.1): rodar unidades reais FORA do produto, comparar variantes de prompt/contrato com rubrica fixa e métricas, com custo controlado, e decidir com evidência se algo muda. Resultado NÃO é conectado ao produto sem decisão humana. Pertence a VALID-4/5 (fidelidade, já PASS com escopo limitado) e alimenta VALID-8 (decisão humana HG-06, hoje NOT_PROVEN).

## Escopo
- Desenho de rodadas comparativas entre variantes (H1..H5 em `variants.md`) sobre a MESMA unidade e a MESMA entrada.
- Rubrica fixa de 9 critérios (`rubric.md`), avaliação cega entre variantes.
- Conjunto de unidades reais referenciadas por caminho externo (`dataset.md`).
- Orçamento por rodada e por dia e teto de tempo (`budget.md`).
- Registro de reprodutibilidade: sementes (quando o provedor aceitar), versões (prompt, esquema, modelo, harness), `CODEX_CALL_COUNT` por rodada.

## Fora de escopo
- Alterar `draft-prompt`, provedor, esquema ou qualquer código do produto; ligar variante ao app.
- Execução de qualquer rodada nesta tarefa (T-F5-01 entrega só desenho; execução = T-F5-02 em diante, com HG-07).
- Benchmark grande; substituir a revisão humana ou clínica; pedir outro PDF (HG-08).

## Regras obrigatórias
1. Avaliação CEGA entre variantes: saídas rotuladas por código aleatório (A/B/C...), mapeamento guardado à parte e só aberto depois da nota; quem pontua não vê o nome da variante.
2. Mesma unidade e mesma entrada em todas as variantes (hash da entrada registrado e igual).
3. Sementes e versões registradas por execução (prompt, esquema, modelo/provedor, commit do harness).
4. Saídas e fontes ficam FORA do repositório (`C:\Users\Ariel\SmartLearn-PromptLab\`); no Git só números, página/questão, nunca trechos do livro.
5. Nenhum acoplamento ao produto: o laboratório usa cópia sob `SmartLearn-PromptLab`, recusa `SmartLearn-DevData` (salvaguarda já testada em `test/prompt-lab-runner.test.js`).
6. `CODEX_CALL_COUNT` registrado em cada rodada e somado por dia; passar do teto interrompe a rodada.
7. Uma variante só vira candidata se, na mesma entrada, reduzir defeitos MATERIAIS sem introduzir CRÍTICOS e sem piorar fidelidade; adotar é decisão humana, tarefa própria.

## Aprovações necessárias (usuário)
HG-06 (quem avalia, 1 unidade por rodada com rubrica fixa), HG-07 (números de `budget.md`), HG-08 (local de armazenamento externo em `dataset.md`).
