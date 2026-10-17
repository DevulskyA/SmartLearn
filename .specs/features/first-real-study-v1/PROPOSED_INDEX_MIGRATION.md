# Proposta (NÃO aplicada): índices para uso prolongado

Origem: auditoria de longo uso em banco descartável (2026-10-17): 40 unidades, 12.240 tentativas, 1.602 evidências; e 200 unidades, 60.240 tentativas. Nenhum dado seu foi usado. Reprodução: scripts `perf/*.mjs` no diretório de rascunho da sessão (`seed.mjs 40 big40.db 12000`, `latency.mjs`, `fixcheck.mjs`).

## Problema (P1, aparece com meses de uso, não hoje)

Consultas correlacionadas sem índice varrem todas as tentativas por exercício:
`server/src/services/attempts.js:322` (`reinforcementByUnit`), `:298` (`priorWrongExercises`) e `server/src/services/evidence.js:32` (`IS_CURRENT_SQL`). Hoje, com 10 unidades, é imperceptível; no ritmo medido (cerca de 12 mil tentativas) chega a 1 segundo por tela, e a 24 segundos em 60 mil tentativas.

| Rota | 40 unid. antes → depois | 200 unid. antes → depois |
|---|---|---|
| `/reinforcement` | 945 ms → 7 ms | 14,5 s → 25 ms |
| `/priorities` | 1,2 s → 15 ms | 22 s → 67 ms |
| `/learning-evidence` | 296 ms → 9 ms | 7,8 s → 42 ms |
| `/review-task-attempts` (120 ids) | 1,0 s → 108 ms | 9,4 s → 149 ms |

## Correção proposta (migração aditiva, sem alterar linhas)

```sql
CREATE INDEX IF NOT EXISTS idx_exercise_versions_user_exercise ON exercise_versions(user_id, exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_user_version ON exercise_attempts(user_id, exercise_version_id, id);
CREATE INDEX IF NOT EXISTS idx_learning_evidence_user_review_task ON learning_evidence(user_id, review_task_id, id);
```

## Por que não apliquei

É uma migração e o launcher aplica migrações pendentes ao banco vivo na próxima abertura (com snapshot `pre-migrate`). Migração no banco humano exige a sua autorização. O número também está em disputa (034 reservado a telemetria, HG-09 e frente A; ver `DECISIONS_BRIEF.md` D-T2): recomendo numerar esta como a próxima livre e renumerar as demais.

## Decisão pedida

Autoriza a migração aditiva de 3 índices? Recomendação: sim, **depois** do primeiro estudo real (não há ganho perceptível com 10 unidades e o código fica congelado durante a sessão, R5). Alternativa sem migração: reescrever as consultas, mais invasivo e sem o mesmo ganho.
