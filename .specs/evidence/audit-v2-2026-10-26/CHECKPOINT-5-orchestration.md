# Orquestração nativa do Claude Code — configuração e prova (2026-10-27)

Base `83db007`. Claude Code 2.1.310. Campos de subagente conferidos na documentação oficial (code.claude.com/docs/en/sub-agents): `model`, `effort`, `tools`, `disallowedTools`, `isolation: worktree`, `maxTurns`. Resolução do modelo: parâmetro da invocação > frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > modelo da sessão.

## Configuração efetiva (antes → depois)
| Item | Antes | Depois |
|---|---|---|
| `~/.claude/settings.json` `model` | `sonnet` | igual |
| `effortLevel` global e `modelSettings` de `claude-sonnet-5`/`claude-sonnet-5-5` | `high` | `medium` (só essas 3 linhas; backup `settings.json.bak-20261027`) |
| `CLAUDE_CODE_EFFORT_LEVEL`, `CLAUDE_CODE_SUBAGENT_MODEL` | não definidos | igual (nada sobrepõe o frontmatter) |
| Regras (política de modelos/esforço) | Haiku para testes em geral | itens 1, 6 e 7 do `~/.claude/AGENTS.md` (backup `.bak-20261027`) |

## Subagentes (reuso do mecanismo `agents/*.md`; sem sistema novo)
| Papel | Arquivo | model | effort | ferramentas / limites |
|---|---|---|---|---|
| Investigador | `~/.claude/agents/investigador-leitura.md` | sonnet | medium | Read, Grep, Glob, Bash; sem Edit/Write/Agent; 25 turnos |
| Implementador | `~/.claude/agents/implementador-isolado.md` | sonnet | high | `isolation: worktree`; sem Agent; 60 turnos; commit local, sem push |
| Verificador | `~/.claude/agents/verificador-independente.md` | sonnet | high | Read, Grep, Glob, Bash; sem Edit/Write/Agent; 30 turnos |
| Executor de testes longos | `.claude/agents/test-runner.md` (projeto) | haiku | medium | Bash, Read; sem Edit/Write/Agent; 40 turnos |
Os globais valem para qualquer projeto (a política é global); o `test-runner` é do SmartLearn e já existia.

## Provas executadas (sessões `claude -p` independentes, pois agentes novos só carregam no início de uma sessão)
| Verificação | Resultado |
|---|---|
| `--agent investigador-leitura` | modelo observado `claude-sonnet-5-5` (`modelUsage`, único modelo cobrado); Write ausente e arquivo não criado; custo US$ 0,11 |
| Orquestrador → `implementador-isolado` → `verificador-independente` | delegação realizada; implementador em worktree própria (`agent-a591f0fcfe048d48f`), commit `f1124f29…` com pai `83db007`; verificador PASSOU (diff = só `probe-impl.txt`); worktree principal intacta (HEAD `83db007`, sem o arquivo); modelo cobrado só `claude-sonnet-5-5`; custo total US$ 0,54 |
| `--agent test-runner` | modelo cobrado `claude-haiku-5-5`; `node --version` PASSOU; custo US$ 0,005 |
Probe removida (worktree e branch temporários apagados).

## Achado e correção
`isolation: worktree` cria a worktree a partir da branch padrão, não do HEAD do orquestrador (doc oficial). Corrigido no prompt do implementador: primeiro `git switch --detach <SHA>`; comprovado (pai do commit = `83db007`).

## Limites (NÃO VERIFICADO)
- **Esforço efetivo por subagente** não é observável em runtime nesta versão: comprovado só o campo no frontmatter (aceito e documentado), não o nível aplicado.
- Nesta sessão interativa os agentes novos não aparecem na lista (carregam ao reiniciar); a prova foi por sessões headless equivalentes.
- Modelo informado pelo agente e por `modelUsage` concordam; custo vem do JSON da CLI.

## Validar o candidato Desktop com a trava intacta (somente análise; nada executado)
A trava `scripts/require-work-branch.mjs` roda como `predev/prebuild/prepreview` e exige `branch == claude/smartlearn-v1-complete`; só `CI`/`GITHUB_ACTIONS` a pulam.
| Alternativa | Viável? |
|---|---|
| `CI=1` em HEAD destacado no SHA candidato | Tecnicamente funciona, mas é CI falso: **descartada** |
| Chamar vite/cargo direto sem os hooks `pre*` | Contorna o propósito da trava: **descartada** |
| Levar o candidato para `claude/smartlearn-v1-complete` (fast-forward ou merge) numa worktree dela e rodar os 4 comandos | **Legítima e recomendada.** É integração em linha protegida: decisão do dono (a branch está 116 commits atrás do candidato e tem 3 commits próprios; ver `git merge-tree` do checkpoint 3-4) |
| Trava aceitar nome de branch declarado (ex.: `SMARTLEARN_WORK_BRANCH`) e imprimir a raiz | Viável, mas altera uma salvaguarda: só com aprovação do dono |
Nenhuma janela nativa foi aberta.
