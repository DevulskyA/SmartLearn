# Validation — Roadmap de endurecimento V1 (evidência-ou-zero por tarefa/fase)

Estados: `PASS` evidência suficiente · `FAIL` · `NOT_PROVEN`. Nenhuma exclusão foi feita por este documento.

## F0 — Reconciliação e higiene de estado

### T-F0-01 — Baseline congelado (reproduzido por execução em 2026-10-04)
BASELINE_PENDING — preenchido ao fim do gate completo desta sessão (HEAD `ff83d20` + docs; sem mudança de código de produto desde `169ec2d`). Números do handoff anterior (NÃO copiados como prova): servidor 775, frontend 453, cargo 30, e2e 203 + 2 skipped, lint 0 erros.

### T-F0-02 — STATE compactado: PASS
`.specs/STATE.md` 2815 → 36 linhas; `.specs/archive/STATE-ate-2026-10-04.md` é byte a byte igual ao STATE anterior (sha256 `f99b806e8f4dfb390be4591d82f83b660237adfe9c8f21832b8d8c84d384420e`). Sensor `node scripts/check-state-ids.mjs <rev>`: 364 tokens de decisão/invariante no STATE antigo, 0 ausentes em STATE novo + arquivo (e teste `test/check-state-ids.test.js` prova que o sensor falha quando um token some).

### T-F0-03 — Painel e tracks reconciliados: PASS
Track `conductor/tracks/hardening-roadmap-v1/plan.md` ativo (`node scripts/agent-tasklist.mjs` sem erro; bloco ACTIVE-TRACK gerado); painel mestre de 07/09 marcado como histórico; EXECUTION.md aponta o provedor ativo (CODEX), o track ativo e VALID-4/5.

### T-F0-04 — Placeholders de `src-tauri/resources`: PASS
`.gitkeep` x4 voltaram a ser rastreados (commit `ff83d20`; `ae81f67` os removera do índice). RED→GREEN em `test/resources-placeholders.test.js`. `.impeccable/` e `.specs/benchmarks/`: decisão proposta (STATE), não aplicada.

### T-F0-05 — Relatório somente-leitura de higiene (nada foi alterado ou apagado) · `[H]` HG-05 para os destinos
Worktrees (`git worktree list`): `main` (`C:\Projetos\SmartLearn`, `f645a07`, = `origin/main`) · `claude/content-quality` (`01c67f7`) · `tmp/integrate-cq-into-v1` (`6f2e816`, merge temporário "não enviar") · `claude/smartlearn-v1-complete` (esta; 63 commits à frente de `origin/claude/smartlearn-v1-complete`) · `C:\Users\Ariel\.codex\worktrees\0603\SmartLearn` (HEAD solto `f645a07`, worktree do app do Codex, não é deste projeto).

| Item | Onde | Evidência | Classificação | Comando proposto (NÃO executado) |
|---|---|---|---|---|
| 19 arquivos deletados `.claude/skills/tlc-spec-driven/**` | checkout `main` | todos rastreados e deletados no disco; a skill global ativa é `tlc-spec-driven-strict` e existe `tlc-spec-driven.superseded-20260915-011011` | pertence a outra ferramenta (skill TLC substituída) — INCERTO se a deleção é intencional | decidir com o humano; se intencional: commit da remoção em outra branch (nunca em `main` por agente); se não: `git -C C:\Projetos\SmartLearn checkout -- .claude/skills/tlc-spec-driven` |
| `.agents/skills/tlc-ecc-engineering-v4-candidate/` e `.claude/skills/tlc-ecc-engineering-v4-candidate/` | `main` | 400 KB, 45 arquivos cada, mais recente 2026-09-30 | pertence a outra ferramenta (skill candidata, duplicada em dois diretórios) | nenhuma ação; humano decide rastrear/arquivar |
| `.codex-temp/` | `main` | 12 MB, 17 arquivos, 2026-09-13 | descartável provável (temporário do Codex), INCERTO conteúdo | revisar e, com ordem, `Remove-Item -Recurse` |
| `.codex/` | `main` | 1 arquivo, 2026-09-13 | pertence a outra ferramenta | nenhuma |
| `.skill-backups/` | `main` | 161 KB, 19 arquivos, 2026-06-22 | backup de skills — NÃO apagar | nenhuma |
| `stats-prototype/` | `main` | 3 arquivos, 36 KB, 2026-09-13 | INCERTO: a autoridade visual vive em `C:\Projetos\SmartLearn-Stats-Prototype` (EXECUTION.md) | comparar com o diretório autoritativo antes de qualquer decisão |
| `test-results/` | `main` | 1 arquivo, 2026-09-19; ignorado nas worktrees, não no `main` | regenerável | `.gitignore` do `main` (via branch própria) |
| `conductor/tracks.md` modificado | worktree `content-quality` | diff = linha gerada ACTIVE-TRACK (mtime 2026-09-20) | gerado, regenerável | `node scripts/agent-tasklist.mjs` naquela worktree ou `git checkout` |
| worktrees `content-quality`, `integrate-tmp` | ver acima | `integrate-tmp` limpo; fast-forward de `content-quality` já integrado em `6f2e816` (EXECUTION.md) | candidatas a retirada após HG-05 | `git worktree remove` + `git branch -d` (só após decisão de integração) |
| 63 commits sem push | esta branch | `git branch -vv` | INV-10: nada enviado | decisão HG-05/HG-10 |

Nenhuma exclusão feita nesta tarefa. Gate: relatório presente; `git status` das worktrees descrito (esta tem só `.impeccable/` e `.specs/benchmarks/` não rastreados).
