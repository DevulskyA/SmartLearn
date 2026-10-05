# Validation — Roadmap de endurecimento V1 (evidência-ou-zero por tarefa/fase)

Estados: `PASS` evidência suficiente · `FAIL` · `NOT_PROVEN`. Nenhuma exclusão foi feita por este documento.

## F0 — Reconciliação e higiene de estado

### T-F0-01 — Baseline congelado (reproduzido por execução em 2026-10-04)
Gate completo reproduzido por execução em 2026-10-04 (HEAD `d562dc8`; executor Haiku mecânico; sem mudança de código de produto desde `169ec2d`; as 12 rotas/arquivos novos não rastreados entraram no gate só como arquivos novos):
- servidor `npm --prefix server test`: 775/775 · cargo `cargo test --lib`: 30/30 · lint: 0 erros, 23 avisos · inventário de testes: PASS (174 arquivos) · e2e `npx playwright test` (runner LEGADO; ver autoridade provisória em `tasks.md`): 203 passaram, 2 skipped (opt-in Codex/PDF real), ~19,6 min.
- frontend `npm test`: 465 passaram, **1 FALHOU** — `test/test-db-isolation.test.js`: `test/prompt-lab-runner.test.js` (commit `8fb8e9f`, sessão anterior) nomeia os caminhos protegidos para provar a recusa e o sensor o listava como infrator. O handoff anterior dizia "verdes"; NÃO estava. Correção (decisão técnica local): o arquivo entra na allowlist do sensor com justificativa (só passa os caminhos a um guarda puro que lança antes de abrir; nunca resolve o datastore real). Reexecução: `npm test` 466/466 (inclui 5 testes novos desta sessão).
- Estado "vermelho antes, verde depois" registrado: o baseline real de frontend em `8fb8e9f` era 461 passando + 1 falha (= 462 testes).
- `CODEX_CALL_COUNT` deste gate: 0.

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

## F2 — Contrato da aula

### T-F2-01 — Edição por entidade; substituição integral removida: PASS (2026-10-04, BASE `3608048`, IMPL `532aa39`)
- A rota removida era `PATCH /drafts/:id` (o desenho original dizia `PUT`). Agora responde 410 `ENDPOINT_REMOVED` orientando para `PATCH /drafts/:id/summary` e `PATCH|DELETE /drafts/:id/questions/:questionId`. `reviseDraft` → `replaceDraftContent` (só fixtures); `reviseDraft` do cliente (`src/draft-review-ui.js`) era morto e foi removido; a migração 019 não foi tocada (checksum).
- Sensor `server/test/draft-whole-list-replace.test.js`: RED 3/3 antes (410 ausente, nome ausente, rota usava a função), GREEN 3/3 depois (410 com mensagem, nome novo, nenhuma rota referencia a função).
- Limite da evidência: o 810/810 foi OBSERVADO numa worktree que continha o WIP NÃO commitado de T-F5-08 (`server/test/column-order.test.js`, 8 testes, no glob `test/*.test.js`). Portanto NÃO é uma execução pura do snapshot `532aa39`, e nenhum número "só do comitado" foi observado (não há execução de 802). O que discrimina T-F2-01 e foi observado diretamente: o sensor novo RED→GREEN, os 6 arquivos de teste de draft tocados (67/67) e as 2 specs e2e (19/19); nenhum deles depende do WIP.
- Gate: `npm --prefix server test` 810/810; 6 arquivos de teste tocados 67/67; lint 0 erros (23 avisos); e2e `lesson-editor` + `draft-acceptance` 19/19 (1,4 min). E2E completo NÃO foi rodado para esta tarefa.
- Raiz `npm test` 478/479: a falha é `test/test-live.test.js:99` (ver abaixo), fora do diff de T-F2-01.

## F6 — Plataforma de teste

### T-F6-03 — Medição 2026-10-04 @`3608048`: gate NÃO atingido (FAIL)
Comando `npm run test:e2e` (2 workers), 3 execuções consecutivas:

| Execução | Resultado | Duração |
|---|---|---|
| 1 | PASS 203 passed / 0 failed / 2 skipped | 9m27s (meta ≤ 8 min não atendida) |
| 2 | FAIL 202 / 1 / 2: `e2e/product-value.spec.js:86` (`LOCAL_DESKTOP_AUTHORITY: PDF -> unit -> …`), `#account-show-register` oculto (timeout 2000 ms dentro de um retry de 20 s) | 9m12s |
| 3 | INTERROMPIDA: workers saíram com 3221225794 (`0xC0000142`) após ~20 testes | não medida |

- Fatos: (1) a execução 1 passou funcionalmente, acima da meta; (2) a falha da execução 2 é funcional e a causa é DESCONHECIDA; (3) o `0xC0000142` é compatível com pressão de recursos do Windows, mas a causa ambiental NÃO foi provada. A falha da execução 2 NÃO foi classificada como ambiental.
- Contexto da máquina no momento da checagem posterior (não durante as execuções): 16 GB, ~6,4 GB livres, 26 `msedge` + 20 `msedgewebview2` de outras aplicações.
- Nenhum código foi alterado por causa disso. Causa: T-F6-08.

### Achado — runner "ao vivo" diverge do runner e2e (herdado de T-F6-02, fora de T-F2-01)
`test/test-live.test.js:99` espera `root['test:e2e'] === 'playwright test'` e `SUITES.e2e.args` iniciando por `node_modules/@playwright/test/cli.js`; o `package.json` tem `test:e2e = node scripts/e2e.mjs`. O runner ao vivo chama o Playwright direto e portanto contorna as portas por execução e as lanes de T-F6-02. Decisão sobre qual caminho é o canônico: sprint S3 (`PROGRAM.md`), por reconstrução T-F6-02 → `package.json` → `scripts/e2e.mjs` → `scripts/test-live-core.mjs`.

## Estado de VALID (fonte: `conductor/tracks/v1-validation/plan.md`; reproduzido aqui só como referência)
VALID-4 PASS (escopo limitado, 2026-10-04) · VALID-5 PASS de fidelidade, gate parcial (2026-10-04) · VALID-8 `NOT_PROVEN` aguardando decisão humana HG-06 (`REALMODEL_CONTENT_QUALITY_PROVEN=NOT_PROVEN`).
