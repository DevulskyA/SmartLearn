---
name: complex-incident-debugging
description: Use for ambiguous, intermittent, environment-sensitive, timing-sensitive, stateful, or multi-layer failures, especially when the bug appears far from the origin or previous fixes failed. Frame the problem, choose the right investigation mode, gather cross-layer evidence, and require fresh verification before declaring success.
---

# Complex Incident Debugging

## Visao geral

Use este skill para incidentes que nao cabem em um bug local simples.
Ele existe para casos em que o sintoma, a origem e a prova de correcao ainda nao estao bem definidos.

Se o problema for local, reproduzivel e concentrado em um componente principal, prefira `root-cause-debugging`.

## Contrato

Estas regras sao obrigatorias:

1. Sem investigacao de causa raiz, nao ha correcao.
2. Sem verificacao fresca, nao ha "resolvido".
3. Sem definicao clara de "done", nao ha encerramento limpo.

## Quando usar

Use quando houver qualquer um destes sinais:

- relato vago ou incidente ambiguo
- bug intermitente
- falha so em CI, staging ou ambiente especifico
- erro explodindo longe da origem
- fluxo entre varias camadas ou servicos
- suspeita de timing, concorrencia, cache, fila, retry ou estado compartilhado
- configuracao, secrets, flags ou diferencas de ambiente podem estar envolvidas
- varias tentativas anteriores falharam

## Fluxo

### Fase 0 - Framing

Se o relato estiver mal definido, pare e enquadre o problema:

- qual e o sintoma observavel
- qual e o impacto real
- em qual ambiente ocorre
- qual comportamento esperado foi violado
- o que exatamente prova que esta corrigido

Produza:

- uma definicao curta do problema
- uma definicao curta de "done"
- uma lista das incertezas abertas

### Fase 1 - Triagem e escolha de modo

Classifique o caso:

- build ou sintaxe
- runtime
- logica
- integracao
- ambiente
- concorrencia ou timing
- performance

Depois escolha um modo principal:

- `causal-tracing`
- `multi-layer`
- `intermittent`
- `environment-triage`

Nao misture modos sem motivo claro.

### Fase 1A - Causal tracing

Use quando o erro aparece longe da origem.

Processo:

1. Observe o sintoma.
2. Ache a causa imediata.
3. Pergunte quem chamou isso.
4. Suba um nivel.
5. Pergunte de onde veio o valor ou estado ruim.
6. Continue ate achar o gatilho original.

Corrija na origem, nao no ponto final da explosao.

### Fase 1B - Multi-layer

Use quando ha fronteiras entre componentes.

Processo:

1. Enumere as camadas.
2. Instrumente entrada e saida em cada fronteira.
3. Execute uma vez para coletar evidencia.
4. Marque a primeira fronteira em que a expectativa deixa de valer.
5. Restrinja a investigacao a essa fronteira.

### Fase 1C - Intermittent

Use quando a falha nao e 100 por cento reproduzivel.

Processo:

1. Pare de usar sleep arbitrario como "solucao".
2. Procure condicao observavel em vez de timeout cego.
3. Registre ordem, tempo, ambiente e contexto.
4. Reduza variaveis: paralelismo, cache, clock, I/O, ordem de testes.
5. Se precisar, use bisecao para achar contaminacao de estado.

### Fase 1D - Environment triage

Use quando ambiente ou configuracao podem explicar o problema.

Confirme o que puder:

- runtime e dependencias
- env vars, flags e secrets
- cwd e paths
- permissoes
- conectividade externa
- diferenca entre local, CI, staging e producao
- estado residual de execucoes anteriores

### Fase 2 - Comparar com referencias

Antes do patch:

1. Ache exemplos que funcionam no mesmo fluxo.
2. Compare contratos, setup, teardown, invariantes e configuracao.
3. Liste diferencas concretas.
4. Transforme a diferenca principal em hipotese verificavel.

### Fase 3 - Hipotese e experimento minimo

Use este formato:

```text
Acredito que X e a causa raiz porque Y.
A evidencia a favor e A.
A principal evidencia contra e B.
O experimento discriminatorio e C.
```

Depois:

- mude uma variavel por vez
- nao empilhe patches
- nao aproveite para refatorar sem necessidade
- aplique a menor correcao suficiente

### Fase 4 - Gate obrigatorio de verificacao

Antes de declarar sucesso:

1. Identifique qual comando realmente prova a alegacao.
2. Execute o comando completo agora.
3. Leia exit code e saida relevante.
4. Verifique se a prova sustenta exatamente o que esta sendo afirmado.

Mudanca em codigo nao e prova.
Execucao antiga nao e prova.
Verificacao parcial nao autoriza alegacao total.

### Fase 5 - Encerramento disciplinado

So encerre quando puder responder:

- qual era o sintoma
- qual era a causa raiz
- como ela foi confirmada
- qual foi a correcao minima aplicada
- o que foi verificado
- o que nao foi verificado
- qual risco residual permanece

Se algo relevante continuar incerto, o encerramento correto e "estado atual + evidencia + proxima incerteza", nao "resolvido".

## Saida minima

Antes de encerrar, informe:

1. Sintoma observado
2. Como reproduzir
3. Modo de investigacao escolhido
4. Hipotese principal atual
5. Evidencia a favor e contra
6. Causa raiz confirmada ou status de incerteza
7. Correcao aplicada
8. Riscos e o que nao foi verificado
9. Comando de verificacao executado
10. Resultado factual da verificacao

## Sinais vermelhos

Pare e reoriente se acontecer qualquer um destes:

- vontade de fazer "so uma correcao rapida"
- varias mudancas simultaneas
- stack trace ignorada
- ambiente nao checado apesar de indicios fortes
- patch no ponto da explosao sem rastrear a origem
- bug intermitente "resolvido" com delay arbitrario
- declaracao de pronto sem verificacao fresca

