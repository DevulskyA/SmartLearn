# CONDUCTOR + TLC EXECUTION CONTRACT

`EXECUTION_MODEL=OUTCOME_DRIVEN_LEAN`. Policy canônica: `.specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md#outcome-driven-lean-execution`.
Este arquivo guarda só o que é específico do Conductor: onde vive a autoridade, como o trabalho é mostrado, estados e sincronização.
Conductor é o cockpit persistente; TLC Strict + ECC Engineering é a autoridade de execução e verificação.

1. Os requisitos governados em `.specs` vencem qualquer resumo do Conductor; nunca regenerar nem sobrescrever arquitetura aprovada só para caber no Conductor.
2. Cada fato vive em UM lugar: `tasks.md` da feature ativa = IDs, estados, dependências, SHAs e subtarefas; `PROGRAM.md` = ordem; `spec.md` = requisitos e portões humanos; `validation.md` = evidência; `.specs/STATE.md` = fase atual; Git/testes = realidade.
3. `conductor/tracks/<track>/plan.md`, o bloco ACTIVE TRACK de `conductor/tracks.md`, o painel HTML e o cockpit (`npm run context:resume`) são PROJEÇÕES GERADAS de `tasks.md` (`npm run plan:sync`, `node scripts/agent-tasklist.mjs`): nunca editar à mão; `context:check` falha se divergirem. Os IDs formais (T-F*, T-*) são estáveis e nunca renumerados.
4. Roadmap progressivo: AGORA = o outcome ativo (exatamente UMA tarefa `[>]`, com árvore de subtarefas) · PRÓXIMO = SÓ o próximo outcome pronto · ROADMAP = o resto, uma linha cada.
5. Estados (um só por tarefa): `[✓]` PROVEN (prova em `validation.md` + `IMPLEMENTATION_SHA`) · `[>]` IN_PROGRESS (implementação parcial fica aqui) · `[ ]` PENDING · `[!]` BLOCKED por dependência (diferente de falha e de não verificado) · `[H]` HUMAN_GATE (decisão do usuário, não bloqueia trabalho independente) · `[=]` SPLIT (contêiner, nunca executado). `DONE` não existe; só PROVEN.
6. Retomada sempre reconcilia o Git antes de confiar em qualquer arquivo de status: Git → `context:resume` → bloco da tarefa ativa → evidência → working tree → continuar o primeiro outcome não provado com dependências satisfeitas.
7. Um controlador escreve a worktree principal (`smartlearn-v1-complete`, branch `claude/smartlearn-v1-complete`); worktrees irmãs são só leitura salvo atribuição explícita (ver `SIBLING_WORKTREE_DIRTY` em STATE.md).
8. Nunca enfraquecer um teste para obter verde; o verificador não corrige o que julga; push/merge/deploy/operação destrutiva em dado real só com autorização explícita.

```
.specs      = o que deve ser verdadeiro      Git       = o que realmente existe
TLC         = como provar                    Conductor = onde estamos
```

## Tasklist visível (DECISÃO HUMANA 2026-09-19, preservada)

A capacidade "tasklist visual persistente" (`scripts/tasklist.mjs`, `tasklist.html`, painel, estados, tarefa ativa inequívoca) é CANÔNICA e não pode ser removida, mesmo que a fonte mude: adapta-se o GERADOR, a UI permanece. Não autoriza expandir o Conductor nem criar segunda governança (GOV-2: execução de tarefa = mecanismo da skill `tlc-spec-driven-strict`; o plan.md é só o ledger macro projetado).
- Projeção: `node scripts/tasklist.mjs` (texto compacto) e `node scripts/tasklist.mjs --html conductor/.view/tasklist.html` (painel; exige EXATAMENTE UMA `[>]`, ou nenhuma quando o programa está ocioso). Painel velho é bug; `--watch` o mantém fresco.
- Sem UI nativa de checklist no runtime: usar o painel HTML + a lista compacta quando o usuário precisar ver a posição.

## Autonomia contínua (regra canônica humana, 2026-09-19)

`CONTINUOUS_AUTONOMY=REQUIRED` · `USER_IS_NOT_AGENT_MANAGER=TRUE` · `CONCURRENT_WRITER_ACTION=ISOLATE_AND_CONTINUE` · `CURRENT_GOAL_OVERRIDES_STALE_PLAN=TRUE`.
Outro agente/branch/worktree/arquivo inesperado NÃO é motivo para parar: isolar em worktree/branch próprio, preservar o trabalho alheio (sem reset/stash/overwrite), continuar o GOAL vigente e reconciliar depois. Só interromper pelos critérios de escalonamento da regra 10 da policy canônica (ou contexto no limite, após o estado persistido).
