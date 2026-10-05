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

## Recuperação após /clear ou sessão nova (contexto em camadas)

Objetivo: descobrir posição + tarefa ativa + próximo comando + bloqueios em ~40 linhas, e só então buscar os trechos da tarefa ativa. Nada de ler tudo.

1. `git worktree list`, `git status`, `git log --oneline -5`. O Git vence qualquer texto. Se o diretório atual estiver em `main`: não desenvolver (base de integração, somente leitura para o agente); ir para a worktree de `claude/smartlearn-v1-complete`.
2. `npm run context:resume` (= `node scripts/agent-tasklist.mjs --resume`): cockpit DERIVADO de `tasks.md`/`PROGRAM.md`/`spec.md`/plano. Nunca é autoridade.
3. Ler SOMENTE: o bloco da ACTIVE_TASK em `tasks.md` (busca pelo ID, ex.: `T-F6-08`), a seção do mesmo ID em `validation.md`, os requisitos/invariantes que o bloco cita em `spec.md`, e o código necessário. NÃO ler PROGRAM/tasks/spec/validation inteiros por rotina; ampliar só se surgir dependência ou conflito.
4. Mapa e externos: `.specs/EXECUTION.md` (mapa de leitura) e `.specs/ARTIFACTS.md` (o que vive fora do Git: PDF real, banco DEV, backups, instruções do usuário, skills).
5. `npm run context:check` deve passar (portão de persistência).

`.specs/HANDOFF.md` (local, gitignored) é conveniência DERIVADA: nunca é autoridade e apagá-lo não impede a retomada.

## Autoridades (cada fato vive em UM lugar)

Git/código/testes = realidade · `PROGRAM.md` = ordem e regras do programa · `tasks.md` = IDs, estado (DONE `[✓]`, IN_PROGRESS `[>]`, PENDING `[ ]`, BLOCKED `[!]`, HUMAN_GATE `[H]`, SPLIT `[=]`), dependências, BASE/IMPLEMENTATION_SHA, e na tarefa ativa `Próximo passo:`/`Comando:` · `spec.md` = requisitos, invariantes, portões humanos, decisões · `validation.md` = evidência (uma seção `### <ID>` por tarefa concluída) · `uat-visual.md` = prova visual · plano do conductor = macro · `.specs/STATE.md` = fase atual curta · `.specs/ARTIFACTS.md` = externos. Nenhum outro arquivo duplica essas autoridades. `ROADMAP`/`PROJECT`/`DEBT`/`LESSONS`/`TEST_COVERAGE_MATRIX`/`project/*` são históricos ou de manutenção pontual: só se atualizam quando uma mudança substantiva exigir, nunca por rotina.

## Portão de /clear (antes de /clear, compaction ou troca de sessão)

1. reconciliar o Git; 2. `tasks.md`: exatamente UMA tarefa `[>]`, com `Próximo passo:` e `Comando:`; 3. `validation.md`: prova de cada tarefa concluída; 4. `spec.md`: decisões/portões se mudaram materialmente; 5. `ARTIFACTS.md` se algo externo mudou; 6. `npm run context:check` = PASS; 7. commitar o estado rastreado (arquivos explícitos); 8. só então limpar o contexto. Um handoff gitignored pode existir por conveniência, nunca como autoridade.

## Regra de salvamento (fonte única, sem lost-update, backup antes de destruir, leitura de volta, menor raio de impacto)

- Antes de sobrescrever um arquivo de estado: ler o conteúdo atual, levar adiante o que continua válido ou movê-lo para a autoridade certa, e arquivar o anterior verbatim em `.specs/archive/`. Nada some em silêncio.
- Depois de gravar: ler de volta e conferir (o shell mutila crases e barras; há mistura CRLF/LF; edição multilinha segura = script gravado com a ferramenta Write).
- Estado só existe se está no Git (ou registrado em `ARTIFACTS.md`). Chat, scratchpad e arquivos gitignored não são memória.
- Não duplicar: dado derivável é derivado (`context:resume`), não copiado.
- Commits só com arquivos explícitos (nunca `git add .` nem `git add .specs`); nunca incluir `.impeccable/` nem `.specs/benchmarks/`. Um commit = uma unidade causal.

## Continuidade de contexto (sessão × repositório)

- Sessão = memória de trabalho. Repositório (Git + `.specs/`) = fonte de verdade persistente.
- Decisão durável vai para a fonte autoritativa (`spec.md`, ADR, `tasks.md`); nunca só para o handoff.
- Escolher modelo/effort no começo da fase; não trocar no meio sem evidência de que a escolha não serve.
- Carregar só o que pode mudar a decisão atual (arquivo/símbolo/diff focados); não trazer histórico, specs de outras features nem logs inteiros.
- Subagentes devolvem conclusão + evidência (arquivo:linha, comando e resultado), não logs.
- Caminho errado: voltar ao último checkpoint bom (revert/rewind) em vez de resumir a tentativa falha para dentro do contexto.
