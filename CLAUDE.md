# SmartLearn — project instructions

Before executing SmartLearn work, read `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` in full.
It is the canonical inherited quality contract for all SmartLearn tasks.
Task-local requirements add to it; they do not silently weaken it.

For everything else — active feature location, current checkpoint, dependency-ready task — reconcile from Git plus `.specs/STATE.md`, not from this file.

## Recuperação de sessão/contexto perdido

Ao iniciar uma sessão SmartLearn, ou após perder contexto: (1) localizar o
worktree de `claude/smartlearn-v1-complete` (`git worktree list`); (2)
confirmar branch/HEAD/status nesse worktree; (3) ler `.specs/EXECUTION.md`;
(4) só então executar. Se o diretório atual estiver em `main`: não
desenvolver — `main` é base de integração, somente leitura para o agente.
