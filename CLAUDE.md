# SmartLearn — project instructions

Before executing SmartLearn work, read `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` and
`.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` in full.
Together they are the canonical inherited quality-and-evolution contract for all SmartLearn tasks.
Task-local requirements add to them; they do not silently weaken either.

For everything else — active feature location, current checkpoint, dependency-ready task — reconcile from Git plus `.specs/STATE.md`, not from this file.

## Recuperação de sessão/contexto perdido

Ao iniciar uma sessão SmartLearn, ou após perder contexto: (1) localizar o
worktree de `claude/smartlearn-v1-complete` (`git worktree list`); (2)
confirmar branch/HEAD/status nesse worktree; (3) ler `.specs/EXECUTION.md`;
(4) só então executar. Se o diretório atual estiver em `main`: não
desenvolver — `main` é base de integração, somente leitura para o agente.
