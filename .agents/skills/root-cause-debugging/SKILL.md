---
name: root-cause-debugging
description: Use for local, reproducible bugs, failing tests, and straightforward build or runtime failures in one main component. Find the root cause, test one hypothesis at a time, apply one minimal fix, and verify with fresh evidence before declaring success. Do not use for intermittent, multi-layer, environment-sensitive, or ambiguous incidents; use complex-incident-debugging instead.
---

# Root Cause Debugging

## Visao geral

Use este skill para bugs locais e reproduziveis.
Ele existe para impedir patch por intuicao.

Se o caso envolver intermitencia, multiplas camadas, ambiente, timing, estado compartilhado ou causa ainda muito vaga, troque para `complex-incident-debugging`.

## Contrato

Duas regras valem sempre:

1. Nao corrigir antes de entender a causa raiz.
2. Nao declarar "resolvido" sem verificacao fresca.

## Quando usar

Use quando o problema for principalmente:

- falha de teste com reproducao clara
- bug local em um modulo ou componente principal
- erro de runtime com stack trace util
- falha de build direta
- regressao com escopo pequeno e evidencias proximas da origem

## Quando escalar

Escalone para `complex-incident-debugging` se houver:

- erro que aparece longe da origem
- bug intermitente
- suspeita forte de ambiente ou configuracao
- fluxo entre varias camadas
- timing, concorrencia, cache ou estado compartilhado
- tentativas anteriores fracassadas
- definicao de "corrigido" ainda ambigua

## Fluxo

### 1. Definir sintoma e prova

Antes de mexer no codigo, responda:

- qual e o sintoma observavel
- como reproduzir
- qual comando ou cenario prova a correcao

### 2. Investigar a causa raiz

Faca o minimo necessario para localizar a origem:

1. Leia o erro inteiro.
2. Reproduza de forma consistente.
3. Verifique mudancas recentes, diff e configuracoes obvias.
4. Ache onde o valor, estado ou chamada errada nasceu.

Se voce so encontrou o ponto onde explodiu, ainda nao terminou.

### 3. Comparar com um exemplo que funciona

Antes do patch:

1. Ache codigo semelhante e funcional.
2. Liste as diferencas concretas.
3. Converta a diferenca principal em uma hipotese.

### 4. Testar uma hipotese por vez

Use este formato:

```text
Acredito que X e a causa raiz porque Y.
O experimento minimo para provar isso e Z.
```

Nao empilhe varias correcoes no mesmo teste.

### 5. Aplicar a menor correcao suficiente

A correcao deve:

- atacar a origem
- preservar comportamento valido
- evitar refatoracao oportunista

### 6. Verificar antes de encerrar

Execute a prova apropriada nesta mesma sessao:

- teste que falhava
- comando de build
- reproducao manual objetiva
- outra verificacao direta do criterio de aceite

Sem isso, nao escreva "corrigido", "pronto", "seguro para commit" ou equivalente.

## Saida minima

Antes de encerrar, informe:

1. Sintoma observado
2. Como reproduzir
3. Hipotese principal
4. Causa raiz confirmada ou o ponto de incerteza
5. Correcao aplicada
6. Comando de verificacao executado
7. Resultado factual

## Limite de tentativas

Se menos de 3 tentativas falharem, volte para a investigacao com a nova evidencia.
Se 3 ou mais falharem, pare de insistir localmente e trate como caso para `complex-incident-debugging` ou discussao arquitetural.

## Sinais vermelhos

Pare e volte para a investigacao se pensar:

- "vou fazer uma correcao rapida primeiro"
- "vou mudar varias coisas de uma vez"
- "provavelmente e isso"
- "o diff parece certo, entao deve ter resolvido"

