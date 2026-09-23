# SmartLearn — project instructions

Before executing SmartLearn work, read `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` and
`.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` in full.
Together they are the canonical inherited quality-and-evolution contract for all SmartLearn tasks.
Task-local requirements add to them; they do not silently weaken either.

For product-intent and prioritization doubts (what the product is for, which feature first, whether an
implementation drifts from its purpose), use `.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` §0.1
as the tie-breaker. It controls DIRECTION; code, tests and Git control STATE.

For everything else — active feature location, current checkpoint, dependency-ready task — reconcile from Git plus `.specs/STATE.md`, not from this file.

## Tasklist e track ativo (obrigatório em trabalho relevante)

> **GOV-2 (2026-09-19): RECONCILIADO SEM SEGUNDA GOVERNANÇA (opção A). Execução de tarefa = mecanismo canônico da skill
> `tlc-spec-driven-strict` (tarefa causal por feature em `.specs/features/<f>/tasks.md`, checkpoint de fase, Memento em `.specs/STATE.md`,
> recuperação). O `plan.md` do track é só o LEDGER MACRO de marcos que alimenta a tasklist visual (a skill não tem visão macro nem
> projeção). Mapa de símbolos: ✓=[x] DONE · >=[~] IN_PROGRESS (exatamente UMA) · [ ]=PENDING · !=[!] BLOCKED · -=adiada (extensão local).
> Não criar track novo sem objetivo aprovado; não expandir o Conductor; skill global NÃO alterada.
>
> **DECISÃO HUMANA (2026-09-19): a TASKLIST VISUAL (`scripts/tasklist.mjs`, `tasklist.html`, painel, estados, detalhes, tarefa ativa)
> é canônica COMO CAPACIDADE e deve ser preservada; só a fonte interna pode mudar após a auditoria (adaptar o gerador, manter a UI).**
> Em toda sessão: ao iniciar/retomar reconstruir a lista da fonte persistente, regenerar o painel, abri-lo/expô-lo e mostrar
> TRACK/MARCO · PROGRESSO · TAREFA ATIVA · PRÓXIMA · BLOCKER (o detalhe fica no painel). Só macro-tarefas.

Ao iniciar/retomar trabalho: ler `conductor/tracks.md` (seção ACTIVE TRACK) e o `plan.md` apontado; mostrar a
tasklist compacta ao usuário (`[✓]` concluída, `[>]` ativa — exatamente UMA, `[ ]` pendente, `[!]` bloqueada,
`[-]` adiada) como PROJEÇÃO do plan.md. Ao mudar o estado de uma tarefa: atualizar o plan.md primeiro, depois
refletir no chat. Projete SEMPRE com `node scripts/tasklist.mjs` (e `--html conductor/.view/tasklist.html` para o painel
que o usuário abre; o script exige exatamente uma `[>]`). Conductor decide QUAL tarefa está ativa; TLC decide a menor
implementação correta dela.
Conductor nunca vira segunda Constitution (intenção = Constitution §0.1; estado = Git/testes).

## Painel sempre verdadeiro (regra obrigatória — o usuário precisa saber o que está acontecendo)

O painel é uma LISTA SIMPLES do Conductor, não um dashboard: `[✓]` concluída · `[>]` sendo feita AGORA · `[ ]` próxima · `[!]` bloqueada, mais a linha "EXECUTANDO AGORA". Sem cards, badges, seções expansíveis ou aviso de "pode estar desatualizado": os detalhes ficam no `plan.md`. Painel velho é BUG.
O painel é gerado do `plan.md` por `node scripts/agent-tasklist.mjs`, que também regrava todas as cópias (AgentCoord + `conductor/.view/tasklist.html` de cada worktree) e o bloco ACTIVE TRACK de `conductor/tracks.md` (nunca edite esse bloco à mão). Mantenha `node scripts/agent-tasklist.mjs --watch` rodando em segundo plano: qualquer edição do plan.md/GUI.md/CLI.md atualiza o painel em ~1 s.
Ao iniciar/terminar/trocar tarefa, criar tarefa ou surgir/sumir bloqueio: editar o `plan.md` NA MESMA AÇÃO — `[>]` vira `[✓]` e a próxima `[ ]` vira `[>]` imediatamente; sempre deixar as próximas como `[ ]`; conferir a linha "EXECUTANDO AGORA" e dizer no chat, em uma linha, a tarefa ativa e a próxima.

## Recuperação de sessão/contexto perdido

Ao iniciar uma sessão SmartLearn, ou após perder contexto: (1) localizar o
worktree de `claude/smartlearn-v1-complete` (`git worktree list`); (2)
confirmar branch/HEAD/status nesse worktree; (3) ler `.specs/EXECUTION.md`;
(4) se existir `.specs/HANDOFF.md`, lê-lo como POSIÇÃO e reconciliá-lo com Git,
worktree, arquivos-alvo e o teste decisivo antes de confiar nele (em conflito,
Git/arquivos/testes vencem); (5) só então executar. Se o diretório atual
estiver em `main`: não desenvolver — `main` é base de integração, somente
leitura para o agente.

## Continuidade de contexto (sessão × repositório)

- Sessão = memória de trabalho. Repositório (Git + `.specs/`) = fonte de verdade persistente. `.specs/HANDOFF.md` = somente a posição atual.
- `.specs/HANDOFF.md` é local por worktree (no `.gitignore`) e é SOBRESCRITO, nunca vira diário. Esquema: `OUTCOME= POSITION= REPO_WORKTREE_BRANCH= CHANGED_FILES= DECISIONS= PROOF= BLOCKERS= NEXT=`.
- Decisão durável vai para a fonte autoritativa (`.specs/STATE.md`, ADR, spec da feature); o handoff apenas aponta para ela.
- Atualizar o handoff antes de trocar de fase, de runtime (Claude↔Codex), de pausa longa ou de reset deliberado de contexto. Escolher modelo/effort no começo da fase; não trocar no meio sem evidência de que a escolha não serve.
- Carregar só o que pode mudar a decisão atual (arquivo/símbolo/diff focados); não trazer histórico, specs de outras features nem logs inteiros.
- Subagentes devolvem conclusão + evidência (arquivo:linha, comando e resultado), não logs.
- Caminho errado: voltar ao último checkpoint bom (revert/rewind) em vez de resumir a tentativa falha para dentro do contexto.
