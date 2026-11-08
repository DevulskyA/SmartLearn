# V-01: Estatísticas a 390 px (proposta para decisão do dono)

Status: PROPOSTA. Nada foi aplicado ao produto. Estatísticas é superfície protegida (ADR-0001): aplicar exige autorização expressa do dono.

## Defeito (reproduzido, não só visto)
Em "Por disciplina", a 390 e 360 px, o texto fica cortado e invade a coluna vizinha: "Sem evidência" vira "Sem evi…", "Sem questões" vira "Sem que…", o rótulo de ordenação "Desempenho" é cortado no meio da letra e os rótulos "Desempenho", "Evidência" (e "Tendência" a 360 px) ficam mais largos que a própria célula.
Antes: `.specs/evidence/v01-candidate-2026-11-08/v01-390-before.png` (e 360).

## Causa
`src/styles.css`, bloco "Por disciplina at phone width": a linha vira um cartão (grade), mas as células continuam com as regras da tabela de desktop:
1. `.matrix-table .practice-compact/.practice-recent/.subject-compare-value/.trend-badge { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }` (duas vezes, linhas ~1962 e ~2748).
2. Grade `1fr 1fr auto`: a 3a coluna `auto` toma a largura de "Amostra insuficiente" e espreme as outras.
3. Cabeçalhos com largura em % herdada de `#view-stats-subject .matrix-table th:nth-child(n)` (34/22/21/23%), pequena demais para rótulo + seta.

## Correção candidata (menor)
`.specs/proposals/V-01-stats-390.css`: um único bloco `@media (max-width: 47.999rem)` com escopo em `.matrix-table--cards`: texto quebra em vez de cortar, duas colunas iguais, tendência em linha própria, cabeçalhos com largura do conteúdo. Desktop (>= 48rem) não é tocado.

## Prova (isolada: o CSS é injetado na página, o produto não muda)
`V01_OUT=<pasta> node scripts/e2e.mjs e2e/visual-v01-candidate.spec.js` — PASSA:
- sem o candidato: defeito reproduzido a 390 e a 360 px (verificação do instrumento);
- com o candidato: 0 texto cortado, 0 colisão de cabeçalhos ou células a 390 e 360 px;
- 1280 px: imagem idêntica byte a byte com e sem o candidato.
Depois: `v01-390-after.png`, `v01-360-after.png`.

## Se aprovado
Colar o bloco no fim da seção de celular de `src/styles.css`, rodar `e2e/stats*.spec.js` e `e2e/accessibility.spec.js`, e substituir a injeção do spec por asserção direta (o spec vira teste de regressão sem `V01_OUT`).
Limite: medido com os dados do spec (2 disciplinas, 1 com evidência). Nomes de disciplina muito longos e 3+ disciplinas não foram cobertos.
