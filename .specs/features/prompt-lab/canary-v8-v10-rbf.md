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

## RESULTADO (2026-10-12) — executado com autorização do usuário (até 3 chamadas, só este canário)

Execução: `runs/v10-challenger-rbf-20261012-224436` (fora do Git), 240 s, 3 de 3 chamadas (1 geração + 1 auditoria do modelo + 1 reparo; o mesmo perfil da v8). Nenhuma chamada resta. Leitura contra a fonte feita pela IA (assistida), NÃO revisão médica humana.

| Medida (mesma fonte, 12.544 car.) | v8 | v10 |
|---|---|---|
| Escopo (páginas / payload) | 263–267 / 12.544 | 263–267 / 12.544 |
| Auditoria / HIGH / bloqueio de aceite | PASS / 0 / 0 | PASS / 0 / 0 (só LOW: comparação léxica entre idiomas dispensada) |
| Idioma gerado | pt-BR (VERIFIED) | pt-BR (VERIFIED) |
| Resumo (car.; razão sobre o texto útil) | 5.315; 0,47 | 5.656; 0,50 |
| Cobertura de conceitos (`coverage.mjs`) | 19/19 | 18/19 automático; 19/19 por leitura* |
| Frases SOURCE_LINKED (substantivas) | 21/27 = 78% | 24/40 = 60% |
| Títulos no formato do leitor (`## `) | 0 (títulos em texto simples) | 5 |
| Questões / quase duplicadas / sem explicação | 26 / 0 / 0 | 23 / 0 / 0 |
| Dica vazando resposta / valor sem apoio | 0 / 0 | 0 / 0 |

*A única "perda" (C18, RBF = RPF/(1 − Hct)) era falso negativo da métrica: a v10 escreve FSR/FPR/TFG (siglas em português) e o mapa procurava RBF/RPF; a fórmula, a definição de Hct e o exemplo (600 mL/min → 1091 mL/min) estão no resumo. Corrigido em 2026-10-16 com sinônimos no mapa (`renal-blood-flow.json`, C18): recomputado sem nova chamada, v8 19/19 e v10 19/19. O parecer NOT_PROVEN não muda (ele se apoia em ligação à fonte 60% × 78% e tamanho +6%).

Fidelidade (leitura): 0 falha dura H1–H8 em ambas; valores, unidades, qualificadores ("acredita-se", "aproximadamente 10%", "apenas abaixo de 80 mmHg", "em níveis baixos") e as duas incertezas do feedback tubuloglomerular preservados na v10. Defeitos da v10: (a) omite a aplicação clínica da dopamina em baixa dose na hemorragia e "precursora da norepinefrina" (a v8 mantém) — seleção, não erro; (b) "inicialmente" no feedback tubuloglomerular não está na fonte (a v8 também o tem); (c) menos frases com trecho confirmado (14 NOT_LINKED, a maioria fatos presentes na fonte, mas sem entrada de evidência; fórmulas com "U_PAH" em vez de "UPAH" prejudicam o ponteiro); (d) sublinhados nas fórmulas ficam feios no leitor de texto simples; (e) questão 20 rotulada DISCRIMINATION sendo recuperação/aplicação; Q12 compara mecanismos que a fonte não contrasta explicitamente.
Pontos fortes da v10: estrutura causal mais clara ("Autorregulação: manter o fluxo apesar da pressão"), títulos `## ` que o leitor renderiza, referência a Tabela 6.5/Fig. 6.7 sem inventar, exemplo resolvido completo, 24% mais rápida (240 s × 315 s).

HARD gates: todos passaram (escopo exato; 3 chamadas; idioma; 0 falha dura; 0 evidência falsa aceita, 29 entradas confirmadas; 0 HIGH; títulos `## ` e JSON válidos).
Regra de decisão registrada acima: PROMOTE_V10 exigia cobertura 19/19, ≥ 78% de frases com trecho e resumo não maior que o da v8 — a v10 NÃO cumpre as duas últimas (60%; +6%). Nenhum HARD gate falhou, portanto não é KEEP_V8.
PARECER: **NOT_PROVEN**. A v10 não regrediu em fidelidade nem em cobertura e melhora a estrutura e o tempo, mas não melhora a compressão (0,50 contra 0,47; o alvo MED-SUM de ~10% do texto didático segue longe) e liga menos frases à fonte. Uma geração por versão não mede variabilidade. A v10 permanece o padrão de DESENVOLVIMENTO; a v8 segue reproduzível; sem promoção. Qualquer nova geração ou ajuste de prompt exige NOVA autorização.
