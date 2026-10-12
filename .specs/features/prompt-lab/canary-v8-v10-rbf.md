# Canário v8 × v10 — "Renal Blood Flow" (PROPOSTA: nenhuma chamada real feita)

Estado: preparado em 2026-10-12; **aguarda autorização específica do usuário** para até 3 chamadas ao Codex. Sem ela, nada abaixo é executado.

```
OBJECTIVE         = decidir KEEP_V8 / PROMOTE_V10 / NOT_PROVEN para o prompt interno 10 (MED-SUM V2.7.5) contra o padrão v8
UNIT              = "Renal Blood Flow", Costanzo Physiology, PDF 263–267 (payloadChars 12.544, 11 spans, igual aos canários v7/v8/v9)
BASELINE_v8       = scripts/prompt-lab/run-generation.mjs já medido em runs/v8-challenger-rbf-20261008-193316: resumo 5.315 car., 0,49 do texto útil, cobertura 19/19, 8 títulos, 0 falhas duras
CANDIDATE         = promptVersion 10, provedor CODEX, mesma fonte e mesmo mapa de conceitos
LAB_DB            = C:/Users/Ariel/SmartLearn-PromptLab/work/lab-v10.db (cópia do lab-v9.db sem rascunho; o proposal do escopo existe; dados humanos intocados)
EXPECTED_CALLS    = 2 (geração + auditoria do modelo); MAX_CALLS = 3 (no máximo 1 reparo)
PREFLIGHT_DONE    = rodada com provedor FAKE em cópia descartável: promptVersion=10, payloadPages 263–267, payloadChars 12.544, 0 chamadas reais
RUBRIC            = rubric.md (H1–H8 falhas duras, Q1–Q10 qualidade) + coverage.mjs
```

Comando (só após a autorização):

```bash
node scripts/prompt-lab/run-generation.mjs --db C:/Users/Ariel/SmartLearn-PromptLab/work/lab-v10.db --section "Renal Blood Flow" --prompt-version 10 --runs 1 --out C:/Users/Ariel/SmartLearn-PromptLab/runs/v10-challenger-rbf-<carimbo>
node scripts/prompt-lab/coverage.mjs .specs/features/prompt-lab/source-maps/renal-blood-flow.json <run-1.json> <texto-fonte>
```

HARD gates (qualquer um reprova a v10): payload fora de 263–267 ou título vizinho no payload; mais de 3 chamadas ou 2ª geração sem pedido; idioma errado persistido; falha dura H1–H8 na leitura contra a fonte; evidência falsa aceita ou nenhuma entrada de `summaryEvidence` confirmada; achado HIGH aceito sem conferência humana; summary sem títulos `## ` ou fora do formato JSON.

Decisão: PROMOTE_V10 só se passar todos os HARD gates E não perder na cobertura (≥ 19/19) nem na fração de frases com trecho (≥ 78%) frente à v8, com resumo não maior que o da v8 (5.315 car.) ou ganho de concisão sem perda de conceito; qualquer HARD gate → KEEP_V8; resultado intermediário ou amostra única sem diferença clara → NOT_PROVEN (a v10 continua padrão de DESENVOLVIMENTO, ativação ampla segue condicionada à validação científica).
Limite: uma geração por versão não mede variabilidade; qualidade médica real exige a revisão humana de amostra (pendência humana já registrada).
