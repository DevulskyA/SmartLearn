# Product — SmartLearn (pointer)

Autoridade real: `.specs/project/PROJECT.md`, `.specs/project/INVARIANTS.md`,
`.specs/features/smartlearn-v1-consolidated-v2/spec.md`.

Resumo (não substitui os documentos acima):

SmartLearn é um app de estudo para estudante de Medicina. Ciclo alvo:
material → unidade de aprendizagem → resumo source-grounded → exercícios →
estudo ativo → evidência → revisão → analytics/weak areas → próxima ação.

North Star (ver memória `learning-engine-v1-north-star`):
> Maximizar conhecimento médico corretamente aprendido, retido e utilizável
> por minuto de estudo — com o mínimo de administração exigida do aluno.

Correção de prioridade registrada 2026-09-07: o produto hoje entrega
principalmente o mecanismo de **controle do estudo** (scheduler, tracking).
O mecanismo que transforma **material bruto em aprendizagem** (Document
Learning Core, sprint S06/T34-T38) foi planejado tarde demais e deve ser
antecipado sem descartar T01-T54. Ver Sprint Gate P1 em `tracks.md`.
