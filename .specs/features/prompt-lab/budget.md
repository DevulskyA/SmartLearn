# Prompt Lab — orçamento (T-F5-01) — RASCUNHO PARA APROVAÇÃO (HG-07)

Base: spec §8 HG-07 — "teto por rodada e por dia, configurável". TODOS os números abaixo são `PROPOSED (HG-07)`: nenhum vale sem a sua confirmação, e nenhuma chamada ocorre sem ordem explícita para aquela execução.

Unidade de contagem: uma "chamada Codex" = uma invocação do provedor (geração, auditoria do modelo ou reparo contam cada uma). `CODEX_CALL_COUNT` registrado em cada rodada e acumulado por dia.

| Parâmetro | Valor | Estado |
|-----------|-------|--------|
| Chamadas por rodada (1 variante, 1 unidade: geração + auditoria + no máximo 1 reparo) | 3 | PROPOSED (HG-07) |
| Variantes por rodada comparativa | até 2 (+ controle do prompt atual) | PROPOSED (HG-07) |
| Chamadas por rodada comparativa | 9 (3 variantes x 3) | PROPOSED (HG-07) |
| Rodadas por dia | 1 | PROPOSED (HG-07) |
| Chamadas por dia | 9 | PROPOSED (HG-07) |
| Teto de tempo por chamada | 10 min (observado ~3-4 min no Codex real) | PROPOSED (HG-07) |
| Teto de tempo por rodada | 45 min | PROPOSED (HG-07) |
| Repetições da mesma variante/unidade para variabilidade | 3 (como em VALID-5), só se você pedir | PROPOSED (HG-07) |

## Regras
1. O teto é configurável (arquivo de configuração do laboratório, fora do produto) e o runner interrompe ao atingi-lo; passar do teto exige flag explícita e nova ordem.
2. Salvaguarda existente: no máximo 3 rodadas por invocação, mais exige `--allow-more` (já testado).
3. Cancelamento de job respeita o teto de tempo; chamadas canceladas contam até o ponto consumido.
4. Cada rodada registra: `CODEX_CALL_COUNT`, tempo total, versões, hash da entrada, caminho externo das saídas.
5. Testes automatizados nunca chamam o provedor real (usam FAKE).
6. Sem coupling com o orçamento do produto (R-12/AC-12.4): o orçamento do laboratório é separado.
