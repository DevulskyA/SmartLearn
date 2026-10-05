# EXECUTION.md — mapa de retomada (NÃO é memória do projeto)

PROJECT=SmartLearn · WORK_BRANCH=claude/smartlearn-v1-complete · MAIN_MODE=READ_ONLY_FOR_AGENT (`main` é base de integração; não desenvolver nela)

Depois de /clear ou em sessão nova, nesta ordem:
1. `git worktree list`, `git status`, `git log --oneline -5` (o Git vence qualquer texto).
2. `npm run context:resume` (cockpit derivado, ~25 linhas: fase, tarefa ativa, próximo comando, bloqueios).
3. Ler SOMENTE o bloco da tarefa ativa em `.specs/features/hardening-roadmap-v1/tasks.md` (grep pelo ID), a seção do mesmo ID em `validation.md`, os requisitos que o bloco cita em `spec.md`, e o código necessário. Não ler os documentos inteiros por rotina.
4. Só ampliar a leitura se surgir dependência ou conflito: `PROGRAM.md` (ordem e regras), `uat-visual.md` (prova visual), `conductor/tracks/hardening-roadmap-v1/plan.md` (macro), `.specs/STATE.md` (fase).
5. O que vive fora do Git (PDF real, banco DEV, backups, instruções do usuário, skills): `.specs/ARTIFACTS.md`.
6. `npm run context:check` deve passar (portão de persistência).

`.specs/HANDOFF.md` (local, gitignored) é conveniência DERIVADA e nunca é autoridade: apagá-lo não impede a retomada.
Regras de trabalho, recuperação, portão de /clear e salvamento: `CLAUDE.md`.
Histórico (não ler por rotina): `.specs/archive/` (inclui o EXECUTION anterior, `EXECUTION-ate-2026-10-05.md`).
