# Auditoria V2 — Checkpoint 2b: robustez da regra de negação (2026-10-27)

Base: `e8c1449` (2a). Regras: `audit-rules-10` → `audit-rules-11`. Origem: avaliação externa do 2a, com 4 fragilidades; todas confirmadas antes de corrigir.

| Fragilidade | Evidência | Correção |
|---|---|---|
| Negação em frase vizinha escondia a perda | repro: resumo sem "não" + vizinha com "não" → 0 achados | `NEGATION_LOST`/`ADDED` julgados só na frase pareada |
| Paráfrase legítima era contradição | repro: "bloqueia"→"inibe" → `NEGATION_LOST` HIGH | verbos/adjetivos negativos (`WEAK_NEGATION`: bloqueia, evita, impede, falha, falta, prevents, fails, lack…) não provam inversão; só negadores explícitos (não, sem, ausência, not, without…) |
| Reparo automático por heurística lexical | `triggersRepair`: HIGH sem `blocksRepair:false` aciona o modelo | achados de negação com `blocksRepair:false`: ficam HIGH (o estudante precisa decidir antes de aceitar), mas **não** disparam reparo sozinhos |
| Código técnico na tela | `ISSUE_LABELS` sem entradas; `issueLabel` devolvia o código | títulos em `lesson.issue.*` para `NEGATION_*` e também `UNIT_MISMATCH`, `QUALIFIER_LOST/ADDED` (mesmo defeito, já existente) |

## Prova (dirigida)
Servidor 86/86 (risk-checks, risk-checks-robustness, audit-messages, rules-version, draft-audit, -medical, -cross-language, draft-quality-hardening); raiz 28/28 (lesson-view-model, finding-messages, api-error-messages); eslint limpo.
Testes novos: vizinha não esconde a perda; bloqueia→inibe e evita→previne sem achado; achado HIGH + `blocksRepair:false` + resultado PASS; títulos legíveis para os 5 códigos.

## Limites (NÃO VERIFICADO)
- A regra não sabe a qual afirmação clínica a negação se aplica: continua sendo sinal lexical para conferência humana, nunca prova de erro.
- Falsos positivos/negativos em texto médico real: sem medição (só fixtures sintéticas).
- Exibição do achado no editor (título + trecho + orientação) coberta por teste de rótulo, não por E2E do editor.
- Inversões sem partícula ("contraindicado"↔"indicado") continuam fora do alcance lexical.
