# Auditoria V2 — Checkpoint 2a: negação em fatos médicos (2026-10-26)

Base: `e91d761` (candidato `5cf864f`). Branch `claude/audit-v2-5cf864f`.

## Achado (FALHA provada)
`risk-checks.js` prometia "a negation lost or invented" no cabeçalho, mas `auditPairs` só emitia achados de qualificador. Repro (metformina "não deve ser iniciada" → "deve ser iniciada" no resumo): **nenhum achado** no escopo do resumo. Uma contraindicação lida como indicação passava sem aviso.

## Correção (menor mudança)
- `risk-checks.js`: `NEGATION_LOST` (a frase da fonte nega e a janela do rascunho não) e `NEGATION_ADDED` (o rascunho nega e a janela da fonte não), ambos **HIGH**; "nunca/never" continua com `QUALIFIER_ADDED`. Mesma regra de pareamento estrito: frase sem par confiável não é julgada.
- Mensagens `REPAIR_NEGATION_LOST/ADDED` (servidor + catálogo `lesson.audit.*`), agrupadas em "contradição" (`lesson-view-model.js`).
- `AUDIT_RULES_VERSION` `audit-rules-9` → `audit-rules-10` (pin do hash atualizado). Rascunhos auditados antes ficam `auditStale` e podem ser reauditados.

## Prova
- Teste novo (`risk-checks.test.js`): fiel = 0 achados; negação perdida = `NEGATION_LOST` HIGH; inventada = `NEGATION_ADDED` HIGH; `auditDraft` → `REPAIR`.
- `audit-messages.test.js` ganhou 2 cenários (todo código da tabela precisa ser levantado por algum achado).
- Dirigidos: servidor 71/71 (audit-messages, rules-version, risk-checks, draft-audit, draft-quality-hardening, draft-audit-medical); 117/119 numa rodada anterior mais ampla (11 arquivos de auditoria) com as 2 falhas sendo consequência esperada, corrigidas; raiz 24/24 e 27/27; eslint limpo.

## Limites (NÃO VERIFICADO)
- Falsos positivos em texto real: só fixtures sintéticas e a suíte de auditoria existente; sem medição nas gerações reais.
- Antônimos sem partícula ("contraindicado" ↔ "indicado") não são negação lexical: seguem dependendo da auditoria do modelo e da leitura humana.
- E2E do editor (exibição do novo achado) não rodado nesta fatia.
