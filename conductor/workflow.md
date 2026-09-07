# CONDUCTOR + TLC EXECUTION CONTRACT

Conductor is the persistent project cockpit.
TLC Strict + ECC Engineering is the execution and verification authority.

1. Existing governed `.specs` requirements outrank Conductor summaries.
2. Never regenerate or overwrite approved architecture merely to conform to Conductor.
3. `conductor/tracks.md` shows project-level status.
4. `conductor/tracks/smartlearn-v1/plan.md` shows sprints/tasks/subtasks.
5. Every formal Txx retains its stable ID (T01-T54, `.specs/features/smartlearn-v1-consolidated-v2/tasks.md`).
6. A task becomes **PROVEN** only after its TLC gate and evidence pass.
7. Partial implementation stays **IN_PROGRESS**.
8. **BLOCKED** is distinct from failed and **UNVERIFIED**.
9. After every formal task: record evidence; local atomic commit; update plan status.
10. At sprint closure: run proportional closure gate; synchronize Conductor + STATE.
11. Before session termination: persist exact active sprint/task/subtask/HEAD/dirty/blocker/next action.
12. Resume always reconciles Git before trusting status files.
13. Never weaken a test to obtain green.
14. Verifier must not fix what it judges.
15. No push/merge/deploy/destructive real-data operation without explicit authorization.
16. One controller writes the main worktree (`smartlearn-v1-complete`, branch `claude/smartlearn-v1-complete`). Sibling worktrees are read-only unless specifically assigned (ver `SIBLING_WORKTREE_DIRTY` em STATE.md).

## Regra fundamental

```
.specs      = o que deve ser verdadeiro
Git         = o que realmente existe
TLC         = como provar
Conductor   = onde estamos
```

Conductor nunca substitui `.specs`. É projeção operacional e visual.

## Estados universais

```
✅ PROVEN        — gate TLC + evidência passaram
🔄 IN_PROGRESS   — implementação parcial, não gateada
⬜ TODO          — não iniciada
⛔ BLOCKED       — dependência ou HUMAN_GATE impede início
⚠️ UNVERIFIED    — implementado mas sem gate/evidência rodado
➖ SUPERSEDED    — substituída por decisão posterior (ver STATE.md DEC-xxx)
```

`DONE` não existe como estado — apenas `PROVEN`.

## Checkpoint de tarefa (Txx)

```
TASK START → mark IN_PROGRESS → capture HEAD → inspect → sensor →
implement → tests → narrow gate → regression gate → discrimination (se material) →
record evidence → atomic local commit → mark PROVEN →
update conductor/tracks.md + tracks/smartlearn-v1/plan.md →
update .specs/STATE.md se continuidade mudou → next task
```

## Checkpoint de sprint

```
SPRINT_CHECKPOINT
Sprint: / Tasks: / PROVEN: / BLOCKED: / UNVERIFIED:
HEAD: / Working tree: / Tests: / Closure gate:
Product capability gained: / Regression risk:
Next sprint: / Next task:
STATE synchronized: YES/NO / Conductor synchronized: YES/NO
```

## Resume (sempre nesta ordem)

```
Git → conductor/tracks.md → .specs/STATE.md → tasks.md (status formal) →
evidence → working tree → reconcile discrepâncias → continuar primeira
tarefa não-provada com dependências satisfeitas
```
