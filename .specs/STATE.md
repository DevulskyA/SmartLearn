# STATE.md — fase atual (curto; um único STATE ativo)

Autoridades: Git/código/testes = realidade · `.specs/features/hardening-roadmap-v1/` (`PROGRAM.md` ordem, `tasks.md` tarefas/estados/SHAs, `spec.md` requisitos e portões humanos, `validation.md` evidência, `uat-visual.md`) · `conductor/tracks/hardening-roadmap-v1/plan.md` macro · `.specs/ARTIFACTS.md` externos.
Este arquivo NÃO copia lista de tarefas nem evidência. Para a posição exata: `npm run context:resume`.

EXECUTION_MODEL=OUTCOME_DRIVEN_LEAN (2026-10-05; política em `.specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md`, seção "Outcome-Driven Lean Execution"; o roadmap legado T-F* segue como está e é reclassificado só quando tocado).
CURRENT_PHASE=hardening-roadmap-v1 · sprint S3 (verdade do runner e2e). Fechadas: S0, S1, S2, S2G-a/b (geração segura), S2b.
ACTIVE_TASK=resolvida por `npm run context:resume` (a tarefa `[>]` em `tasks.md`); não é repetida aqui para não envelhecer.
LAST_PROVEN_MILESTONE=S2b / T-F2-05 (pré-visualização do aceite) e S2G (idiomas, reuso, créditos): evidência em `validation.md`; servidor 901/901, e2e materiais 38/38.
NEXT_MILESTONE=S3 fechada: T-F6-08 (causa do sintoma `#account-show-register`) → T-F6-03 (3 e2e consecutivos, ≤ 8 min, 2 workers) → T-F6-09 (uma autoridade de runner); depois S4 (jobs, T-F3-01..05).
CRITICAL_BLOCKER=nenhum técnico. Portões humanos abertos não bloqueiam o trabalho local: ver `spec.md` §8 (HG-01..HG-13).
V1_STATUS=ENGINEERING_LOCAL em andamento; V1_VALIDATED exige VALID-8 (HG-06) e REALMODEL_CONTENT_QUALITY_PROVEN: definição em `spec.md` §10.

PROIBIDO sem ordem explícita: Codex/Prompt Lab, chamada real a modelo, push, merge, deploy, release, rebase, squash, force-push; tocar o banco DEV humano (usar cópia). Ver `tasks.md` regras 8–9 e `PROGRAM.md` §1.

DECISÕES E INVARIANTES HERDADOS (texto integral preservado, não duplicado): `.specs/archive/STATE-ate-2026-10-05.md` (STATE anterior), `.specs/archive/STATE-ate-2026-10-04.md` (STATE de 2.815 linhas) e `.specs/project/INVARIANTS.md`. Decisões de produto de 2026-10-04: `spec.md` R-12, R-13, INV-13/14 e §12.
Esse STATE substitui `.specs/project/STATE.md` (arquivado em `.specs/archive/project-STATE-ate-2026-09-04.md`).
