# Auditoria V2 — Checkpoint 2c: procedência, original preservado e aprovação humana (2026-10-27)

Base: `75e27ab` (2b). Sem mudança de regras de auditoria (`audit-rules-11`).

## Verificado no código e nos testes existentes (sem alteração)
| Requisito | Onde | Prova |
|---|---|---|
| Original preservado após reparo automático e dito o que foi reescrito | `generated-drafts.js` `auditAndRepair` (`audit.original`, `repairChanges`) | `draft-audit-model.test.js` "the repair keeps the ORIGINAL text…" e guard "EVERY human edit route and the reaudit keep audit.original" |
| Reparo rejeitado mantém o rascunho original | idem | teste "a repair that cites a page that was never sent… is rejected" |
| Procedência por pergunta (GENERATED / HUMAN_EDITED / HUMAN_ADDED, `generatedBy` nunca apagado) | `normalizeContent` | `lesson-provenance.test.js` (8 testes) |
| Auditoria da IA ≠ aprovação humana: achado HIGH de conteúdo exige aceite/rejeição da pergunta ou ciência explícita no resumo; reparo nunca bloqueia | `acceptanceBlockers`, `acceptDraft` (`FINDINGS_UNRESOLVED`) | `accept-blocking.test.js`; `NEGATION_*` é HIGH e fora de `PEDAGOGY_ONLY`, logo exige decisão humana |
| Aceite exige a revisão exata revisada | `expectedRevision` | `accept-draft.test.js` C3 |

## Defeito encontrado e corrigido
`acceptDraft` gravava `provenance='AI_GENERATED'` em **toda** pergunta, inclusive a escrita pelo estudante (`HUMAN_ADDED`): texto humano rotulado como IA no material de estudo.
Correção: `HUMAN_ADDED` → `MANUAL`; `GENERATED` e `HUMAN_EDITED` seguem `AI_GENERATED` (texto de IA editado continua derivado de IA). Nenhum valor novo no contrato (`MANUAL|SOURCE|AI_GENERATED`).

## Prova (dirigida)
Servidor 58/58 (lesson-provenance, accept-draft, accept-blocking, accept-preview, draft-audit-model); eslint limpo. Teste ampliado: pergunta humana = `MANUAL`, demais = `AI_GENERATED`.

## Limites (NÃO VERIFICADO)
- Pergunta `HUMAN_EDITED` fica `AI_GENERATED`: não distingue "IA revisada por humano" no exercício aceito (a distinção existe só no rascunho `ACCEPTED`, que preserva `origin`).
- Exercícios já aceitos antes desta correção não são reclassificados (dado do usuário, não alterado).
- Sem E2E do fluxo de aceite no editor nesta fatia.
