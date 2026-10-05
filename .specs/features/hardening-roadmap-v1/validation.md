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

## S0 — Reconciliação do programa (2026-10-04, HEAD de partida `e4c811c`; sem gate de código executado)

Fontes lidas: `conductor/tracks/{v1-validation,product-closure,content-quality}/plan.md`, `.specs/STATE.md`, `.specs/EXECUTION.md`, `e2e/*` (skips). Nenhuma suíte foi executada nesta sprint.

| Item | Estado real | Evidência | Efeito no programa |
|---|---|---|---|
| VERDICT-1 | DONE (decisão humana 2026-10-02, opção B, limiar 25%) | `content-quality/plan.md:162`; `product-closure/plan.md:30` | Nenhuma tarefa. Resta só a fumaça nativa (ver T-F1-09) |
| IMPORT-1 | DONE (decisão humana 2026-10-02, opção B) | `content-quality/plan.md:455` | Idem |
| Fumaça Windows nativa de IMPORT-1/VERDICT-1 | NOT_PROVEN, sem tarefa no ledger | `STATE.md` seção NOT_PROVEN; `product-closure/plan.md:30` | **Trabalho material sem tarefa → T-F1-09** (S8; cópia isolada; mecânica) |
| VALID-4 | PASS, escopo limitado (2026-10-04) | `v1-validation/plan.md:34` | Sem tarefa; não promove V1_VALIDATED |
| VALID-5 | PASS de fidelidade, gate parcial (2026-10-04) | `v1-validation/plan.md:40` | Idem |
| VALID-8 / `REALMODEL_CONTENT_QUALITY_PROVEN` | `NOT_PROVEN`, aguarda decisão humana HG-06 | `v1-validation/plan.md:50`; `STATE.md` | `BLOCKED_HUMAN`; define `V1_VALIDATED` (`spec.md` §10) |
| `product-closure` (A11Y-1, JOURNEY-1) | DONE; track `DONE` | `product-closure/plan.md` | Evidência anterior a `169ec2d`: vale como histórico; S8 revalida só o que mudanças posteriores invalidaram |
| REALMODEL-1, T51 (domínio/TLS/deploy), push do PR #6/merge | dependem de humano/chave/autorização | `product-closure/plan.md:30` | Fora do fechamento local (HG-07/HG-10) |
| T46 catálogo i18n | DEFERIDA por decisão (sem efeito observável) | `product-closure/plan.md` cabeçalho | Não é trabalho aberto; T-F4-07 cobre cópia/guarda de acentuação |
| Skips do e2e (203 + 2 skipped no baseline) | 2 opt-in por custo (`realmodel-codex`, `realpdf-canary`); `smartlearn-plan-flow.spec.js:131` é skip dinâmico registrado como `BLOCKED_EXTERNAL` (sem seam de injeção de falha de escrita sem alterar produto) | `e2e/*.spec.js` | Os 2 opt-in são MANUAL_GATE/Codex; o dinâmico é lacuna conhecida e declarada, não escondida. Nenhuma tarefa nova (mexeria em produto só para teste) |
| Flakes pré-existentes sob carga | `content-quality-flow.spec.js`, `hoje-block-retest.spec.js` | `EXECUTION.md:14`; `content-quality/plan.md:724` | Contexto para T-F6-08; causa do run 2 de T-F6-03 segue NÃO provada |
| Divergência `test-live` × runner e2e | OPEN | ver "Achado" acima | S3 |
| "materiais 45/45" em `STATE.md` | Obsoleto (T-F6-01 substituiu por 36) | `tasks.md` T-F6-01 | `STATE.md` corrigido nesta sprint |
| `IMPLEMENTATION_SHA` das tarefas `[✓]` | Faltava em 12 de 13 | `tasks.md` | Preenchidos via `git log` (pais conferem com os `BASE_SHA` já registrados); T-F6-01/02 compartilham o commit `1328499` |

Resultado S0: classificação completa sem "não sei"; 1 tarefa nova (T-F1-09), justificada por trabalho material sem tarefa; nenhum requisito do `spec.md` ficou sem tarefa por esta leitura.

### T-F2-02 — Adicionar e reordenar questões por id: PASS (2026-10-04, BASE `ff52c0b`, IMPL `a13bc29`)
- Rotas novas: `POST /v1/drafts/:id/questions` (201; id novo, versão 1, status PROPOSED, `origin=HUMAN_ADDED`, citação validada como qualquer questão) e `PATCH /v1/drafts/:id/questions/order` (`{ order: [ids], expectedRevision? }`; recusa id faltando, sobrando, repetido ou desconhecido com `VALIDATION_FAILED` e não grava nada; `expectedRevision` velho → `REVISION_CONFLICT`). Serviços `addQuestion`/`reorderQuestions` em `generated-drafts.js`.
- Sensor `server/test/lesson-add-reorder.test.js` (10 testes): RED 10/10 antes (funções/rotas inexistentes), GREEN 10/10 depois. Discrimina: REJECTED permanece na MESMA questão após reordenar (comparação byte a byte por id); id removido nunca é reutilizado (sequência persistida); ordem sobrevive a releitura do banco; achados de auditoria acompanham a questão por id ao mover/adicionar; rascunho aceito não é editável; HTTP: sessão obrigatória e 404 para outro usuário.
- Gate: `npm --prefix server test` 822/822 (812 + 10); lint dos 3 arquivos sem problemas; inventário OK; e2e `lesson-editor` + `draft-acceptance` 19/19 (1,3 min, árvore com a mudança, HEAD base `ff52c0b`).
- Limite conhecido: reordenar/adicionar re-roda a triagem DETERMINÍSTICA e regrava a auditoria como as demais edições humanas (`editedByHuman`, sem auditoria por modelo); a auditoria versionada e a reauditoria explícita são T-F2-03 (`[H]`, HG-02). `origin` só existe nas questões adicionadas; a proveniência completa é T-F2-04.

### T-F2-04 — Proveniência por questão e por rascunho: PASS (2026-10-04, BASE `83bfe9a`, IMPL `f0812a1`)
- Modelo: cada questão tem `origin` (`GENERATED` | `HUMAN_EDITED` | `HUMAN_ADDED`), `generatedBy` (`{provider, modelVersion, promptVersion}`; `null` em questão adicionada por humano) e `editedAt`; o resumo tem `summaryOrigin`/`summaryEditedAt`. Edição humana de TEXTO muda `GENERATED`→`HUMAN_EDITED` sem apagar `generatedBy`; mudança só de status ou edição sem alteração NÃO muda a origem; `HUMAN_ADDED` permanece `HUMAN_ADDED`. Rascunho legado: lido como `GENERATED` + `legacy: true` (presumido a partir das colunas do próprio rascunho), derivado na leitura e gravado só quando uma edição posterior persiste o rascunho.
- Sensor `server/test/lesson-provenance.test.js` (9 testes): RED 8/8 antes, GREEN 9/9 depois. Cobre round-trip pelo banco, igualdade de provenância em duas leituras de rascunho legado, linha do banco byte-idêntica após ler, e aceite independente de origem (GENERATED/HUMAN_EDITED/HUMAN_ADDED/legado, REJECTED excluída).
- Prova real, somente leitura, SOBRE CÓPIA (db+wal+shm copiados para fora do repositório; o original não foi aberto e seus tamanhos/horários não mudaram): rascunho do Costanzo (CODEX/codex:default/prompt 5) com 35 questões → todas `GENERATED+legacy`, `generatedBy` presumido {CODEX, codex:default, 5}, iguais em duas leituras, linha inalterada pela leitura, nada gravado com proveniência.
- Gate: `npm --prefix server test` 831/831; lint sem avisos novos nos arquivos tocados; e2e `lesson-editor` + `draft-acceptance` + `product-value` 21/21 (1,4 min; `product-value` passou isolada uma vez, o que NÃO conclui nada sobre T-F6-08).
- Limites: (1) o Prompt Lab futuro mede só `GENERATED` e deve excluir `legacy` se quiser proveniência registrada, não presumida; (2) `replaceDraftContent` (só fixtures) com contagem diferente não casa identidades e marca as novas como `legacy`; (3) o schema de rascunho continua recusando `origin` vindo de fora do servidor (correto: origem não é editável por cliente).

## F5 — Qualidade de conteúdo médico

### T-F5-08 — Ordem de leitura por colunas: PASS (2026-10-04, BASE `5dc75b7`, IMPL `21aedd1`)
- **Regra** (`server/src/pdf/column-order.js`): só reordena quando o corpo da página é exatamente "coluna direita inteira, depois esquerda inteira" (um único chaveamento R→L), cada bloco com ≥ 6 linhas e nenhuma linha cruzando a sarjeta; cabeçalho/rodapé ficam no lugar. Qualquer outro formato mantém a ordem pintada. Ligada em `extract-worker.js` só para página sem rotação e com caixa na origem (`page.view[0]=page.view[1]=0`).
- **Sensores (RED→GREEN):** 8 testes da função + 2 testes pelo pipeline real (PDF posicionado novo `server/test/pdf-fixtures/build-positioned-pdf.js`, fixture compartilhada não alterada). Sem a ligação no worker, o teste do pipeline FALHA (observado: 9 passam, 1 falha); com a ligação, 10/10. O controle (esquerda→direita pintada) mantém a ordem.
- **Prova real, somente leitura** (cópia dos bytes do Costanzo em banco temporário; `SmartLearn-DevData` não foi alterado; sem Codex): extração completa em ~10 s. Página 267, ANTES: o título `GLOMERULAR FILTRATION` na posição 0 e 11 ocorrências de "PAH" depois dele (a cauda do tópico anterior dentro da 1ª frase do tópico). DEPOIS: título na posição 1490, **0** "PAH" depois do título; os 11 ficam antes (cauda do tópico anterior, no lugar certo). Páginas 268–273: 1 "PAH" em 271, legítimo ("…measure RPF (i.e., PAH)").
- **Páginas reordenadas além da 267** (266, 269, 274): a ordem nova foi conferida por continuidade de frase com a página vizinha (ex.: p268 termina "…the assumption that the" → p269 passa a começar "oncotic pressure of Bowman's space is zero"; p273 "…an ultrafiltrate of plasma. If" → p274 "this ultrafiltrate were excreted unmodified"; p266 esquerda "…(1) PAH is" → direita "neither metabolized…"). Amostra: 4 páginas, não o livro inteiro.
- **Regressão:** `npm --prefix server test` 812/812 em 4 execuções consecutivas; 1 execução anterior no mesmo estado teve 1 falha NÃO identificada (nome não capturado) e não se reproduziu em 4 repetições: causa NÃO provada, registrada, não classificada. Raiz `npm test` 478/479 (a falha herdada de `test-live`, S3). Lint dos arquivos tocados sem problemas; inventário OK.
- **Limites:** (1) fontes já gravadas no banco DEV NÃO foram reextraídas e mantêm a ordem antiga (decisão separada; exige backup e reupload; INV-06/07); (2) a marca d'água do site (`Www.Medicalstudyzone.com`) continua colada ao título na página 267 (existia antes; fora do escopo); (3) PDF de várias colunas com mais de duas, ou páginas de coluna única intercaladas com figuras, mantêm a ordem pintada por desenho.

## Decisões de produto de 2026-10-04 (geração segura e idiomas): análise de impacto (HEAD `23086ca`, leitura de código, sem gate)

| Decisão | Já existe | Parcial | Falta |
|---|---|---|---|
| Escopo explícito, nada de documento inteiro | `server/src/services/proposal-scope.js` (contrato `SCOPE_VIOLATION`: payload ⊆ escopo aprovado, recalculado das páginas gravadas antes do provedor); `prepareGeneration` recusa acima de `aiMaxInputChars` (50 000) com `INPUT_TOO_LARGE`; só existe `POST /proposals/:id/drafts` (uma proposta por chamada); Codex tem limite 1 chamada por tipo por rascunho (`CODEX_CALL_LIMITS`) | — | testes-guarda "importar ≠ gerar" e inventário de rotas até o provedor (T-F10-05) |
| Geração JIT / reuso | estado `stale` do rascunho (`isDraftStale`) | — | `createDraft` insere um rascunho NOVO a cada chamada (a confirmar por teste RED em T-F10-03); sem estado de unidade nem política de prefetch |
| Limites de crédito | `SMARTLEARN_AI_BUDGET_CAP_USD` só habilita provedor real por API (`selectProvider`); `production-config.js` exige o teto em produção | — | máximo por job, franquia semanal/mensal, saldo, reserva atômica, reconciliação (T-F10-04a/b); Codex não reporta custo mensurável: unidade provider-agnóstica + `ESTIMATED` |
| `sourceLanguage` | `server/src/ai/language-detect.js` (pt/en/es por palavras funcionais; `unknown` conservador) usado pela auditoria entre idiomas | — | persistir por unidade/rascunho |
| `uiLocale` | `src/i18n/index.js` com catálogo `pt-BR` (só módulo de conta usa `t()`) | — | preferência persistente, es/en, UI (DECISION_CONFLICT-1) |
| `generationLocale` | nada: o prompt (`draft-prompt.js`, v5) não tem diretiva de idioma de saída | — | preferência, contrato, validação `LANGUAGE_MISMATCH` (T-F10-01/02a); diretiva no prompt `[H]` (DECISION_CONFLICT-2) |
| Jobs com escopo/idioma/reserva | nenhum job existe (T-F3 não iniciada) | — | contrato incorporado a T-F3-01 antes de estabilizar |

Impacto em tarefas: T-F3-01 ganhou dependências e contrato (T-F10-02a, 03, 04a); T-F4-07 ficou explicitamente separada (i18n de interface ≠ idioma pedagógico); T-F2-06 (volume de questões) permanece independente do orçamento de geração. Persistência: migração aditiva em `user_settings` (T-F10-01) e outra para reservas/consumo (T-F10-04a), com backup `pre-migrate`; `draft_json` (JSON) recebe `sourceLanguage`/`generationLocale` sem migração.
