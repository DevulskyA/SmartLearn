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

O usuário acompanha o trabalho **só pelo painel**. Um painel velho que diz "tudo concluído" enquanto o agente trabalha o deixa perdido.
Por isso, em TODA mudança de estado (abrir/fechar/mudar de sprint, commit material, bloqueio) e ao trocar de worktree/branch:
1. atualizar o `plan.md` primeiro (uma `[>]` por agente; o que vem depois DEVE existir como `[ ]` — nunca deixar o painel sem "Próximas" enquanto ainda há trabalho previsto);
2. rodar `node scripts/agent-tasklist.mjs` — ele regenera TODAS as cópias (AgentCoord + `conductor/.view/tasklist.html` de cada worktree) **e o bloco ACTIVE TRACK de `conductor/tracks.md`** (gerado do plan.md entre os marcadores ACTIVE-TRACK; nunca edite esse bloco à mão);
3. conferir na cópia que o usuário abre que "Gerado há" e "Em andamento" batem com a realidade; se o painel mostrar 0 em andamento mas o agente está executando, isso é um BUG a corrigir antes de continuar;
4. dizer no chat, em uma linha, qual é a tarefa ativa e qual é a próxima.
O painel exibe a idade do snapshot e avisa em vermelho quando passa de 10 min sem regenerar; nunca ignore esse aviso.

## Recuperação de sessão/contexto perdido

Ao iniciar uma sessão SmartLearn, ou após perder contexto: (1) localizar o
worktree de `claude/smartlearn-v1-complete` (`git worktree list`); (2)
confirmar branch/HEAD/status nesse worktree; (3) ler `.specs/EXECUTION.md`;
(4) só então executar. Se o diretório atual estiver em `main`: não
desenvolver — `main` é base de integração, somente leitura para o agente.
