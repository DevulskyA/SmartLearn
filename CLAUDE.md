# SmartLearn — project instructions

EXECUTION_MODEL=OUTCOME_DRIVEN_LEAN
Canonical policy (read it): `.specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md#outcome-driven-lean-execution`
Core rule: one observable outcome → proportional proof → next outcome. Ceremony shrinks; guarantees (data, isolation, auth, migration, provenance, security) do not.
Do NOT create formal tasks for implementation mechanics, tests, documentation or findings that belong to the active outcome.

Before executing SmartLearn work, read `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` and
`.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` in full: the canonical inherited quality-and-evolution contract.
Task-local requirements add to it; they do not silently weaken it.

For product-intent and prioritization doubts, use `.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` §0.1 as the tie-breaker.
It controls DIRECTION; code, tests and Git control STATE. Conductor never becomes a second Constitution.
For everything else (active feature, current checkpoint, dependency-ready task) reconcile from Git plus `.specs/STATE.md`, not from this file.

## Estado e painel

- Fonte única de estado: `tasks.md` da feature ativa (+ `PROGRAM.md` ordem, `spec.md` requisitos e portões, `validation.md` evidência). `plan.md`, o bloco ACTIVE TRACK de `conductor/tracks.md`, o painel HTML e o cockpit são PROJEÇÕES geradas: nunca editar à mão. `npm run plan:sync` / `node scripts/agent-tasklist.mjs` (`--watch` em segundo plano) as regeneram; painel velho é bug.
- DECISÃO HUMANA (2026-09-19, preservada): a tasklist visual (`scripts/tasklist.mjs`, `tasklist.html`, painel, estados, tarefa ativa) é canônica COMO CAPACIDADE; só a fonte interna pode mudar (adaptar o gerador, manter a UI). O painel é uma lista simples (`[✓]` `[>]` `[ ]` `[!]` + "EXECUTANDO AGORA"), sem dashboard. Conductor decide QUAL outcome está ativo; TLC decide a menor implementação correta dele.
- Ao iniciar/retomar, mostrar em uma linha: marco · progresso · outcome ativo · próximo · bloqueio. Só macro-tarefas (outcomes), sem narrar cada passo.

## Recuperação após /clear ou sessão nova

Objetivo: posição + outcome ativo + próximo passo + bloqueios em ~15 linhas, e só então os trechos do outcome ativo.
1. `git worktree list`, `git status`, `git log --oneline -5`. O Git vence qualquer texto. Em `main`: não desenvolver; ir para a worktree de `claude/smartlearn-v1-complete`.
2. `npm run context:resume`: cockpit DERIVADO (nunca autoridade).
3. Ler SOMENTE o bloco da tarefa ativa em `tasks.md` (busca pelo ID), a seção do mesmo ID em `validation.md`, os requisitos que o bloco cita em `spec.md` e o código necessário. Ampliar só se surgir dependência ou conflito.
4. Mapa de leitura: `.specs/EXECUTION.md`; o que vive fora do Git: `.specs/ARTIFACTS.md`. `npm run context:check` deve passar.

`.specs/HANDOFF.md` (local, gitignored) é conveniência derivada: apagá-lo não impede a retomada.

## Salvamento e continuidade

- Estado só existe se está no Git (ou em `ARTIFACTS.md`); chat, scratchpad e arquivos gitignored não são memória. Decisão durável vai para a autoridade (`spec.md`, ADR, `tasks.md`), nunca só para o handoff. Dado derivável é derivado, não copiado.
- Antes de sobrescrever um arquivo de estado: ler, levar adiante o que continua válido, arquivar o anterior em `.specs/archive/`. Depois de gravar: ler de volta (o shell mutila crases e barras; há mistura CRLF/LF; edição multilinha segura = script gravado com a ferramenta Write).
- Antes de /clear, compaction ou troca de sessão: Git reconciliado; `tasks.md` com exatamente UMA tarefa `[>]` (com `Próximo passo:`); `validation.md` com a prova das concluídas; `npm run context:check` PASS; estado rastreado commitado.
- Commits só com arquivos explícitos (nunca `git add .` nem `git add .specs`); nunca `.impeccable/` nem `.specs/benchmarks/`.
- Subagentes devolvem conclusão + evidência (arquivo:linha, comando, resultado), não logs. Caminho errado: voltar ao último checkpoint bom em vez de resumir a tentativa falha para dentro do contexto.
