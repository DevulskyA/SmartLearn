# Ledger de tarefas — Roadmap de endurecimento V1

Spec: `spec.md` (mesma pasta). Ordem de sprints e critérios de fechamento: `PROGRAM.md`. Posição corrente: `.specs/HANDOFF.md`. Evidência: `validation.md`.
**O campo `Status:` de cada tarefa é a ÚNICA fonte autoritativa de estado** (tarefas nascem `[ ]`; várias já estão `[✓]`/`[H]`). O ledger executa-se tarefa a tarefa; não há "status inicial" a presumir.
Baseline de referência histórico (partida, não estado atual): HEAD `620307d`; servidor 773/773; frontend 453/453; cargo 30/30; e2e 201 passaram / 2 skipped; lint 0 erros; `CODEX_CALL_COUNT=0`. Medições atuais ficam em `validation.md`.

Legenda do status (UM estado inequívoco por tarefa): `[✓]` DONE (feita com evidência em `validation.md`) · `[>]` IN_PROGRESS (exatamente UMA em todo o ledger; é a tarefa ativa e carrega `Próximo passo:` e `Comando:`) · `[ ]` PENDING · `[!]` BLOCKED (por dependência técnica) · `[H]` HUMAN_GATE (depende de decisão humana) · `[=]` SPLIT (tarefa-contêiner dividida em subtarefas; nunca é executada em si).
Ao concluir uma tarefa: (1) `Status` aqui; (2) prova em `validation.md` com seção `### <ID>`; (3) `BASE_SHA`/`IMPLEMENTATION_SHA`; (4) `npm run context:resume` passa a apontar a próxima tarefa sozinho. Nenhum cockpit é atualizado à mão.
Tamanho: S (≤ meio dia) · M (≤ 2 dias) · L (> 2 dias; dividir antes de iniciar).
Cada tarefa é uma unidade causal: um entregável, verificável de forma independente, commitável sozinha (`1 tarefa = 1 commit causal`, trailer `Co-Authored-By` conforme política do repositório). Registrar `BASE_SHA` e `IMPLEMENTATION_SHA` ao fechar.

## Regras de execução (valem para todas as tarefas)

1. Reconciliar antes de agir: Git, HEAD, estado sujo, worktree, banco em uso (caminho real). Em retomada, Git/evidência vencem handoff.
2. Escrever a pergunta do escudo antes de editar: "se esta mudança destruir o comportamento bom, qual sensor fica vermelho?". Sem resposta, criar o sensor primeiro.
3. Novo comportamento: RED → GREEN → REFACTOR. Comportamento legado: caracterizar o verde, mudar, manter o antigo verde.
4. Superfície autorizada declarada na tarefa; qualquer arquivo fora dela exige nova tarefa. Defeitos alheios viram achado, não "aproveitar que estou aqui".
5. Nunca mutar dado humano para testar. Testes usam banco temporário; scripts que tocam o banco humano só rodam com backup verificado e por tarefa explícita.
6. Dois remendos seguidos na mesma região que geram nova regressão ⇒ parar, voltar ao último estado bom e remodelar.
7. Gate = comando exato listado na tarefa + regressão relevante + diff sem mudança não autorizada. Sem gate verde, a tarefa não fecha.
8. `CODEX_CALL_COUNT=0` em tudo. Nenhuma chamada ao Codex, ao Prompt Lab ou a qualquer geração/modelo externo sem ORDEM EXPLÍCITA da pessoa para aquela execução; HG-07 aprovado não basta, e nenhuma tarefa deste ledger (inclusive F5) autoriza gerar. Modelos: Sonnet 5.5 High para todo trabalho intelectual; Haiku só para executar testes.
9. Proibido sem ordem explícita: push, merge, deploy, release, force-push, apagar backups.

Comando-base do gate completo (usado nos checkpoints de fase):
```
npm --prefix server test ; npm test ; npm run lint ; npm run test:inventory ; (cd src-tauri && cargo test --lib) ; npm run test:e2e
```
Autoridade do runner e2e (PROVISÓRIA até S2/T-F6-03 declarar uma só):
- **CANDIDATO canônico:** `npm run test:e2e` = `node scripts/e2e.mjs` (portas livres por execução, reserva atômica, saída própria por execução; T-F6-02). Não exige o Desktop DEV fechado.
- **LEGADO:** `npx playwright test` direto (mantém os padrões históricos de porta; exige portas livres e Desktop DEV fechado). Aparece em `validation.md` como o comando das medições antigas e em `test/test-live.test.js`/`scripts/test-live-core.mjs`.
- S2 deve deixar uma única autoridade e remover a outra deste arquivo, de `validation.md` (como comando vigente) e do runner "ao vivo".

---

## Visão geral das fases e dependências

```
F0 Reconciliação e higiene de estado
 └─ F1 Integridade do datastore e ciclo de vida de processos
     ├─ F2 Contrato da aula (identidade, proveniência, auditoria versionada)
     │   └─ F3 Jobs de geração observáveis
     │       └─ F5 Qualidade de conteúdo médico + Prompt Lab   (HG-06/07/08)
     ├─ F10 Geração segura: escopo, reuso, créditos e idiomas (R-12/R-13) — ANTES de estabilizar F3
     ├─ F4 UI/UX da aula, Materiais e acessibilidade           (validação humana)
     └─ F6 Plataforma de teste (pode andar em paralelo com F2–F4)
F7 Produto de estudo (HG-09) — após F4
F8 Segurança e empacotamento — após F1; antes de F9
F9 Integração e entrega (HG-05/10) — por último
```
As dependências POR ID em cada tarefa prevalecem sobre este diagrama de fases (ex.: F3 não espera "F2 fechada", espera as tarefas nomeadas). Ordem de execução vigente: `PROGRAM.md`.
Caminho crítico (histórico): F0 → F1 → F2 → F3 → F5 → F9. F4, F6 e F8 são paralelizáveis com ressalva de não mexer nas mesmas superfícies ao mesmo tempo (ver "conflitos de superfície" no fim).

Ordem recomendada original (superada por `PROGRAM.md`): F0, F1, F6(T-F6-01..03), F2, F4, F3, F8, F5, F7, F9.

---

## F0 — Reconciliação e higiene de estado (fecha achados F-50..F-54, F-51)

Objetivo: partir de um estado em que Git, documentação e árvores de trabalho dizem a mesma coisa; sem isso, medir o resto não tem valor.

### T-F0-01 — Congelar o baseline e registrar o Memento · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `6aef8f3` · IMPLEMENTATION_SHA `11372c1` (baseline reproduzido por execução e registrado em `validation.md`; Memento = `.specs/STATE.md` de 36+ linhas; achado: 1 teste de isolamento vermelho desde `8fb8e9f`, corrigido em `11372c1`) · Requisitos: R-08 · Dependências: nenhuma
- Superfície: `.specs/STATE.md` (seção Handoff), `.specs/features/hardening-roadmap-v1/validation.md` (novo, só baseline).
- Fazer: registrar HEAD, contagens de teste, banco canônico, esquema v30, versão `0.1.0`, hashes de backup (`SmartLearn-db-backups\p0-*`), `NOT_PROVEN` vigentes.
- Sensores: nenhum de código; verificação cruzada manual contra Git (`git rev-parse`, `git status`) e `last-launch.json`.
- Gate: `git diff --stat` só em `.specs/`; números do baseline reproduzidos por execução (não copiados).
- Done quando: Memento cabe em ≤ 60 linhas e um leitor novo reconstrói o estado sem o chat.

### T-F0-02 — Compactar `STATE.md` (~2,8 mil linhas) sem perder decisões canônicas · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `ff83d20` · IMPLEMENTATION_SHA `33d67d2` (STATE 2815 → 36 linhas; arquivo morto `.specs/archive/STATE-ate-2026-10-04.md`, ASCII no nome, byte a byte igual ao HEAD anterior, sha256 f99b806e…; PREMISSA CORRIGIDA: não existem IDs `DEC-/AD-/INV-` no STATE, então o sensor compara TODOS os tokens `MAIÚSCULAS_COM-SEPARADOR`: `node scripts/check-state-ids.mjs <rev>` = 364 antigos, 0 ausentes em STATE+arquivo; teste `test/check-state-ids.test.js`) · Requisitos: R-08 · Dependências: T-F0-01
- Superfície: `.specs/STATE.md`; histórico antigo movido para `.specs/archive/STATE-até-2026-10-04.md` (cópia íntegra, nada apagado).
- Fazer: manter no STATE só decisões `CANONICAL` (AD/DEC), invariantes e o handoff; o restante vira arquivo morto referenciado.
- Sensor: script que lista IDs de decisão (`DEC-*`, `AD-*`, `INV-*`) antes/depois e falha se algum sumir.
- Gate: diff de IDs vazio; `grep` dos IDs no arquivo morto confirma preservação.
- Risco: perda de decisão. Mitigação: arquivo morto íntegro e comparação por ID.

### T-F0-03 — Reconciliar painel mestre e planos de track · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `33d67d2` · IMPLEMENTATION_SHA `b82e9c9` (track `conductor/tracks/hardening-roadmap-v1/plan.md` criado e ativo; painel mestre de 07/09 marcado como histórico; `agent-tasklist.mjs` regenerou o bloco ACTIVE-TRACK e os painéis; EXECUTION.md reconciliado: provedor ativo CODEX, track ativo, VALID-4/5) · Requisitos: R-08 · Dependências: T-F0-01
- Superfície: `conductor/tracks.md` (bloco não gerado), `conductor/tracks/v1-validation/plan.md`, criação de `conductor/tracks/hardening-roadmap-v1/plan.md` apontando para esta pasta.
- Fazer: marcar o painel de 07/09 como histórico apontando para o STATE; incluir VALID-4/5/8 como `NOT_PROVEN` com ponteiro para F5; gerar o bloco ACTIVE-TRACK com `node scripts/agent-tasklist.mjs`.
- Gate: `node scripts/agent-tasklist.mjs` termina sem erro e o bloco gerado reflete o track novo.

### T-F0-04 — Regra de ignore para artefatos regeneráveis e decisão sobre não rastreados · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `7c6ee21`/`d562dc8` · IMPLEMENTATION_SHA `ff83d20` · Requisitos: R-08 · Dependências: nenhuma
- CORREÇÃO DA PREMISSA (evidência): `.gitignore` já ignora o conteúdo gerado de `src-tauri/resources/*` com exceção dos `.gitkeep`, mas os 4 `.gitkeep` NÃO estavam rastreados — o commit `ae81f67` os removeu do índice por engano, o que deixava `src-tauri/resources/` como não rastreado e um checkout limpo sem os diretórios que `tauri.conf.json` exige (invariante LOCAL-01B). Correção: restaurar o rastreamento dos 4 `.gitkeep` (sem mudar `.gitignore`) + sensor `test/resources-placeholders.test.js` (RED antes: `git ls-files` vazio; GREEN depois). Decisão sobre `.impeccable/` e `.specs/benchmarks/`: proposta registrada no STATE, não aplicada.
- Superfície: `.gitignore`, `src-tauri/.gitignore`.
- Fazer: ignorar `src-tauri/resources/` (artefato de `package:standalone`, ~208 MB) com exceção dos `.gitkeep` já rastreados; propor, sem aplicar, destino para `.impeccable/` e `.specs/benchmarks/` (rastrear ou ignorar) — decisão registrada no STATE.
- Sensor: teste que roda `git check-ignore` nos caminhos esperados e `git ls-files src-tauri/resources` só com `.gitkeep`.
- Gate: `git status --short` sem `src-tauri/resources/` após `npm run package:standalone`.
- Cuidado: não ignorar nada que o empacotador precise ver em checkout limpo (provar com `package:standalone` em worktree descartável).

### T-F0-05 — Higiene do checkout principal e das worktrees auxiliares · S
- Status: `[H]` relatório somente-leitura ENTREGUE em `validation.md` (2026-10-04); execução de qualquer limpeza aguarda HG-05 · Requisitos: R-08 · Dependências: HG-05 (para destino das branches)
- Superfície: nenhuma automática. Gerar relatório somente-leitura: 19 arquivos de skill rastreados deletados no checkout principal, diretórios não rastreados (`.codex`, `.codex-temp`, `.skill-backups`, `stats-prototype`, `test-results`), worktrees `content-quality` e `integrate-tmp`.
- Fazer: classificar cada item (descartável regenerável / pertence a outra ferramenta / incerto) com evidência; propor comandos, sem executar.
- Gate: relatório no `validation.md`; nenhuma exclusão feita nesta tarefa.

### Checkpoint F0
- FECHADO 2026-10-04: baseline reproduzido (`validation.md`), `git status` das três worktrees explicado, STATE 36 linhas sem token perdido (364/364), painel reconciliado, gate completo reproduzido (server 775, frontend 466, cargo 30, e2e 203+2 skipped, lint 0 erros) — sem mudança de código de produto.
Checklist: baseline reproduzido; `git status` das três worktrees explicado; STATE ≤ meta de tamanho; nenhum ID de decisão perdido; painel reconciliado. Gate completo verde (sem mudança de código, deve ser idêntico ao baseline).

---

## F1 — Integridade do datastore e ciclo de vida de processos (F-01..F-08)

Objetivo: tornar impossível perder ou corromper o banco humano e impossível acumular processos órfãos sem ver.

### T-F1-01 — Lock de escritor único também para o Desktop · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `b57ebf9` · IMPLEMENTATION_SHA `833762f` (evidência em `validation.md`, seção T-F1-01) · Requisitos: R-01 (AC-01.1) · Dependências: T-F0-01
- Superfície: `scripts/dev-data.mjs` (reuso de `acquireDevLock`), `scripts/launch-desktop-dev.ps1`, `server/src/main.js` (aquisição quando `SMARTLEARN_DB_PATH` aponta para o datastore DEV), testes.
- Decisão de desenho: o backend Node (processo filho do Desktop) adquire o lock com o PID do próprio backend e a raiz da worktree; o launcher continua apenas conferindo. Assim o lock vive exatamente enquanto o escritor vive, mesmo com fechamento forçado do Rust.
- RED: teste que sobe dois backends no mesmo banco temporário e exige recusa do segundo com mensagem contendo pid e raiz do detentor.
- Sensores: lock de processo morto é retomado; lock liberado no fechamento gracioso; teste do launcher confirma que a mensagem de recusa existe.
- Gate: `node --test test/dev-data.test.js server/test/...` + `test/desktop-entrypoint.test.js`; prova manual: abrir Desktop, tentar `npm run dev:remote` → recusado com nome do detentor.
- Risco: lock órfão impedindo abrir. Mitigação: verificação de vida do PID e mensagem com instrução de recuperação.

### T-F1-02 — Snapshot diário e antes de migração no caminho do Desktop · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `833762f` · IMPLEMENTATION_SHA `2d356df` (evidência em `validation.md`, seção T-F1-02) · Requisitos: R-01 (AC-01.2, AC-01.3) · Dependências: T-F1-01
- Superfície: `scripts/launch-desktop-dev.ps1` (chamada), `scripts/dev-data.mjs` (`snapshotDevDbIfNeeded` já existe), CLI pequeno `scripts/dev-snapshot.mjs`, retenção.
- Fazer: antes de abrir o app, snapshot do dia de banco+WAL+SHM em `SmartLearn-DevData\snapshots\<data>`; antes de qualquer migração pendente (comparar `max(version)` com migrações no disco), snapshot nomeado `pre-migrate-v<N>` com checksum e verificação de leitura; retenção: 7 dias + último `pre-migrate` de cada versão.
- RED: teste com banco temporário em v29 e migrações até v30: o snapshot `pre-migrate-v29` existe, tem checksum igual e `integrity_check ok` ANTES de a migração rodar; falha de snapshot aborta a migração.
- Sensores: retenção nunca apaga o último snapshot válido; snapshot não roda se não há dado real (tamanho 0).
- Gate: testes novos + `test/dev-data.test.js`; verificação manual de que o launcher mostra `Snapshot: <caminho>`.

### T-F1-03 — Ensaio de restauração (restore drill) documentado e automatizado · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `2d356df` · IMPLEMENTATION_SHA `30d5c9c` (evidência em `validation.md`, seção T-F1-03) · Requisitos: R-01 (AC-01.4) · Dependências: T-F1-02
- Superfície: `scripts/dev-restore.mjs` (novo, sempre para um DESTINO diferente do banco vivo), teste.
- Fazer: restaurar um snapshot em diretório temporário, abrir com o servidor, rodar `integrity_check`, `foreign_key_check` e comparar contagens com o manifesto do snapshot.
- Regra: o script nunca sobrescreve o banco canônico; trocar o canônico exige comando separado, confirmação e backup do atual (fora do escopo automático).
- Gate: teste de ponta a ponta com banco sintético; ensaio real sobre `SmartLearn-db-backups\p0-devdata-*` registrado no `validation.md`.

### T-F1-04 — Ciclo de vida de processos: Job Object e limpeza do launcher · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `a6b9645` · IMPLEMENTATION_SHA `b926b44`: `src-tauri/src/kill_on_close_job.rs` , backend colocado no job logo após o spawn; testes Rust: fechar o job mata o processo e o neto sem `kill()` ; cargo 32/32; launcher encerra e imprime só `node` cujo caminho está na própria worktree (evidência em `validation.md`, seção T-F1-04) · Requisitos: R-02 (AC-02.1, AC-02.2) · Dependências: nenhuma (paralelizável com T-F1-01)
- Superfície: `src-tauri/src/lib.rs` (`LocalBackend`), `scripts/launch-desktop-dev.ps1`.
- Fazer: associar o backend filho a um Job Object do Windows com `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, de modo que morte forçada do Rust leve o `node` e seus filhos (`codex`); launcher passa a listar e encerrar apenas processos cujo caminho pertence à própria worktree (`node` de `server-runtime`, `smartlearn.exe`) e a imprimir o que encerrou.
- RED (Rust): teste que cria o backend, mata o processo pai com `TerminateProcess` e espera a porta livre.
- Sensor manual obrigatório (o teste não prova tudo): `Stop-Process -Force` no `smartlearn.exe` e confirmar ausência de `node`/`codex` órfãos.
- Gate: `cargo test --lib` (novo teste) + prova manual registrada; regressão `LocalBackend Drop`.
- Risco: Job Object aninhado em sessões que já usam job (algumas ferramentas). Mitigação: tratar falha de atribuição como degradação explícita com log, não como erro fatal.

### T-F1-05 — Política dos bancos legados e do AppData (#1, #3, #5) · S
- Status: `[H]` · Requisitos: R-01 · Dependências: HG-03
- Fazer (após decisão): mover cópias (nunca originais) para `SmartLearn-DevData\archive\legacy-<data>\` com `README` (origem, esquema, contagens, checksum), marcar somente-leitura; o banco do AppData deixa de ser candidato a abertura.
- Sensor: o launcher recusa abrir qualquer caminho que não seja o canônico quando `SMARTLEARN_DB_PATH` não está definido pelo próprio launcher (já coberto parcialmente; estender).
- Gate: checksums antes/depois idênticos; teste de launcher.

### T-F1-06 — Purga de sessões expiradas/revogadas · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `30d5c9c` · IMPLEMENTATION_SHA `8bc8ca0` (evidência em `validation.md`, seção T-F1-06) · Requisitos: R-01/INV-08 · Dependências: nenhuma
- Superfície: `server/src/repositories/sessions.js`, rotina na subida do servidor, testes.
- Fazer: remover linhas revogadas há > 30 dias e expiradas há > 30 dias; sessões ativas (inclusive as DEV de ~10 anos) nunca são tocadas; produção mantém as mesmas durações.
- RED: sessão ativa DEV intacta; sessão expirada antiga removida; contagem antes/depois registrada.
- Gate: `server/test/*session*`; `PRODUCTION_AUTH_UNCHANGED` revalidado (testes de auth existentes).

### T-F1-07 — Critério de build por conteúdo, não por commit · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `8bc8ca0` · IMPLEMENTATION_SHA `a6b9645` (evidência em `validation.md`, seção T-F1-07) · Requisitos: R-02 · Dependências: nenhuma
- Superfície: `scripts/build-identity.mjs`, `scripts/launch-desktop-dev.ps1`, `vite.config.js`.
- Fazer: além do SHA, calcular `inputsHash` (hash de `src/`, `index.html`, `shared/`, `server/src`, `server/migrations`, `package.json`) embutido no `build-info.json`; o launcher só rebuilda se `inputsHash` mudar, mas o SHA exibido continua sendo o do HEAD em uso (commit só de documentação não rebuilda e continua identificável).
- Cuidado: a identidade mostrada deve continuar verdadeira — documentar que "build = conteúdo X, aberto no commit Y". Não exibir um SHA que não corresponda ao conteúdo.
- RED: teste que alterna um commit só de `.specs/` e prova que `distIsCurrent` permanece verdadeiro; alterar `src/` o torna falso.
- Gate: `test/version-identity.test.js`, `test/desktop-entrypoint.test.js`.

### T-F1-08 — Versão na barra de título e comando de diagnóstico · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `b926b44` · IMPLEMENTATION_SHA `1bf0604` (evidência em `validation.md`, seção T-F1-08) · Requisitos: R-09/F-08 · Dependências: T-F1-07
- Superfície: `src-tauri/src/lib.rs` (título da janela via env `SMARTLEARN_WINDOW_TITLE` definido pelo launcher), `src/build-identity-ui.js` (botão "Copiar diagnóstico").
- Fazer: título `SmartLearn DEV · v0.1.0 · <commit>` só no DEV; "Copiar diagnóstico" copia versão, canal, build, esquema, caminho do banco e contagens (sem dados pessoais).
- Gate: teste Rust do título; teste de frontend do conteúdo copiado; verificação via CDP do título real.

### T-F1-09 — Fumaça nativa Windows de IMPORT-1 e VERDICT-1 (criada na S0) · M
- Status: `[ ]` · Origem: S0 (`validation.md`): `STATE.md` lista "fumaça Windows nativa de IMPORT-1/VERDICT-1" como NOT_PROVEN e nenhuma tarefa do ledger a cobria · Requisitos: invariante de plataformas (WEB + ANDROID + WINDOWS; PASS em uma não prova outra) · Dependências: T-F1-01, T-F1-07, T-F1-08
- Outcome: no Desktop Windows real, restaurar um backup lógico em conta vazia (IMPORT-1) e ver o veredito de Estatísticas ponderado por volume (VERDICT-1) funcionam; observação mecânica (CDP/computer-use quando o runtime permite), SEM julgamento perceptivo.
- Regra de dados: SOMENTE sobre CÓPIA isolada do banco/dados (nunca o banco DEV humano `C:\Users\Ariel\SmartLearn-DevData`); o backup restaurado é de fixture/cópia.
- Gate: observação registrada em `validation.md` com HEAD/build exibidos no título; se o runtime não permitir a automação, registrar `BLOCKED_TECHNICAL` com o que foi tentado (não vira gate humano por reflexo).

### Checkpoint F1
- Prova composta: abrir Desktop → segundo escritor recusado → fechar forçado → nenhum órfão → reabrir → snapshot do dia existe → restore drill passa → sessões purgadas sem tocar ativas.
- Sensor de não-regressão: `RESTART_PERSISTENCE`, `CANONICAL_DEV_DB_UNCHANGED` (tabelas históricas por hash), `DEV_SESSION_PERSISTS_AFTER_RESTART`.
- Gate completo verde; `validation.md` da fase com evidência por critério.

---

## F2 — Contrato da aula: identidade, proveniência e auditoria versionada (F-10, F-11, F-18, F-19, F-20)

Objetivo: remover as últimas ambiguidades de identidade e preparar a medição sem violar a decisão "abrir não recalcula".

### T-F2-01 — Substituir a edição posicional da lista inteira por operações por id · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `3608048` · IMPLEMENTATION_SHA `532aa39` (rota `PATCH /drafts/:id` → 410 `ENDPOINT_REMOVED`; `reviseDraft` → `replaceDraftContent`, só fixtures; evidência em `validation.md`) · Requisitos: R-03 (AC-03.1) · Dependências: T-F1-01, T-F1-02 (escritor único e snapshot verificado antes de tocar dados do rascunho)
- Superfície: `server/src/services/generated-drafts.js` (`reviseDraft`, `mergeIdentity`), `server/src/routes/generated-drafts.js` (`PUT /drafts/:id`), `src/draft-review-ui.js` (função `reviseDraft` do cliente, hoje sem uso na UI atual), testes.
- DECISÃO DE DESENHO (2026-10-04, verificada: nenhum cliente de produção chama `PUT /drafts/:id` — `src/draft-review-ui.js:reviseDraft` é código morto e nenhum e2e usa a rota): a rota `PUT` é REMOVIDA (responde 410 com orientação para PATCH/DELETE/POST por entidade); o service que substitui a lista inteira deixa de ter nome genérico e vira `replaceDraftContent`, só para fixtures, nunca ligado a rota (teste-guarda).
- Pergunta do escudo: "se reordenar trocar status entre conteúdos, o que fica vermelho?" Hoje: nada. Criar sensor primeiro.
- RED: (a) reordenar 4 questões com Q2 REJECTED preserva REJECTED na MESMA questão de conteúdo; (b) enviar ids desconhecidos é erro; (c) tamanho diferente com REJECTED continua protegido (ver teste atual); (d) o cliente legado sem ids é recusado com orientação.
- Desenho: aceitar `questions[]` com `id` obrigatório para as existentes; novas sem `id` recebem id novo; ausentes nunca são apagadas implicitamente (apagar é `DELETE` explícito). Alternativa mais simples e preferida se nenhum cliente usa a rota: remover `PUT` e manter `PATCH`/`DELETE`/`POST` por entidade. Verificar uso real (busca de chamadas, e2e) antes de decidir.
- Gate: `server/test/lesson-granular-edit.test.js` + novos; e2e `lesson-editor.spec.js`, `draft-acceptance.spec.js`.

### T-F2-02 — Adicionar questão e reordenar como operações próprias · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `ff52c0b` · IMPLEMENTATION_SHA `a13bc29` (evidência em `validation.md`; sem UI de reordenar, por desenho da tarefa) · Requisitos: R-03 · Dependências: T-F2-01
- Fazer: `POST /drafts/:id/questions` (id novo, `origin=HUMAN_ADDED`, versão 1) e `PATCH /drafts/:id/questions/order` (lista de ids; erro se faltar/sobrar id).
- RED: ids nunca reutilizados após DELETE+POST; ordem persiste após recarga; auditoria referencia `entityId`.
- Gate: testes de servidor + e2e de reordenar/adicionar.
- Nota: só implementar a UI de reordenar se o roteiro humano (T-F4-01) pedir; a operação de servidor protege contra o `PUT`.

### T-F2-03 — Auditoria versionada e reauditoria explícita · M
- Status: `[H]` · Requisitos: R-03 (AC-03.3), INV-05 · Dependências: HG-02, T-F2-01
- Superfície: `server/src/ai/draft-audit.js` (exportar `AUDIT_RULES_VERSION`), `generated-drafts.js` (gravar `rulesVersion`, `auditedAt` ao auditar/editar), nova rota `POST /drafts/:id/reaudit`, UI da aba Revisão.
- Fazer: ao abrir, apenas COMPARAR `audit.rulesVersion` com a atual e devolver `auditStale: true/false` (sem recalcular, sem gravar). A UI mostra "auditoria com regras antigas" e o botão "Reauditar" executa a rota, grava com nova versão e exibe quantos achados mudaram.
- RED: abrir rascunho com auditoria antiga NÃO altera `draft_json` nem `revision` (teste byte-a-byte); `reaudit` altera só `audit`, nunca resumo/questões; `rulesVersion` muda quando uma regra muda (teste que falha se alguém altera regra sem bumpar versão — comparar hash do conjunto de regras).
- Gate: `server/test/draft-audit*.test.js`, `lesson-granular-edit.test.js`, e2e do editor.
- Cuidado: reauditar não reexecuta modelo (sem Codex); só regras determinísticas. Reauditoria por modelo é decisão separada.

### T-F2-04 — Proveniência por questão e por rascunho · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `83bfe9a` · IMPLEMENTATION_SHA `f0812a1` (evidência em `validation.md`) · Requisitos: R-03 (AC-03.2) · Dependências: T-F2-01
- Fazer: `origin`, `generatedBy` (`provider`, `modelVersion`, `promptVersion`), `editedAt`; edição humana de campo muda `origin` para `HUMAN_EDITED` sem apagar `generatedBy`; migrar rascunhos antigos por normalização na leitura (sem gravar), com `origin=GENERATED` presumido e marca `legacy`.
- RED: round-trip; rascunho legado lido duas vezes dá a mesma proveniência; aceitar não depende de `origin`.
- Gate: servidor + e2e; verificação no rascunho real do Costanzo (somente leitura).
- Uso futuro: o Prompt Lab mede apenas questões `GENERATED`.

### T-F2-05 — Pré-visualização do aceite · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `418f057` · IMPLEMENTATION_SHA `a271e01` (evidência em `validation.md`) · Requisitos: R-03 (AC-03.4), F-20 · Dependências: T-F2-01
- Fazer: rota somente-leitura `GET /drafts/:id/accept-preview` devolvendo unidade a criar, exercícios (com ids de origem) e questões excluídas; UI mostra antes do botão final.
- Sensor: a pré-visualização coincide com o resultado real de `acceptDraft` (teste de igualdade sobre os mesmos dados).
- Gate: `accept-draft.test.js`, `draft-acceptance.spec.js`.

### T-F2-06 — Política de volume de questões (aplicação) · M
- Status: `[H]` · Requisitos: R-05 (AC-05.4) · Dependências: HG-01
- Fazer (após decisão): validação determinística no esquema do rascunho (`questions.length` dentro do intervalo derivado do tamanho da unidade) que marca `QUESTION_VOLUME_OUT_OF_RANGE` como achado; sem alterar o prompt. Excesso é sinalizado, não cortado silenciosamente.
- RED: unidade pequena com 35 questões gera o achado; unidade grande não.
- Gate: `draft-quality-hardening.test.js` ampliado; sem Codex.

### Checkpoint F2
- Composição: gerar rascunho FIXTURE → editar Q3 → reordenar → adicionar → rejeitar Q2 → reabrir (auditoria antiga NÃO muda) → Reauditar (muda só audit) → aceitar com pré-visualização igual ao resultado.
- INV-02/03/04/05 re-provados; mutação: trocar `mergeIdentity` por versão posicional deve falhar ≥ 2 testes; remover o bump de `rulesVersion` deve falhar o teste de hash.
- Verificador independente (risco alto: persistência/identidade).

---

## F3 — Jobs de geração observáveis e controláveis (F-04, F-05, F-13, F-14, F-15)

Objetivo: o aluno nunca fica sem saber o que acontece; o sistema nunca deixa processo ou rascunho parcial para trás. Sem alterar prompt nem provedor.

### T-F3-01 — Tabela e máquina de estados de jobs · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `0025a8d` · IMPLEMENTATION_SHA `ea8c440` (migração 033 aditiva + gatilho de contrato imutável; serviço, rotas e recuperação de órfãos na subida; 13 testes, 6 mutações vermelhas; servidor 918/918) · Requisitos: R-04 (AC-04.1), R-12, R-13 · Dependências: T-F1-01, T-F1-02 (backup `pre-migrate` verificado), T-F2-04 (formato de proveniência que o job grava), T-F10-02a (idiomas), T-F10-03 (reuso/estado da unidade), T-F10-04a (reserva de crédito). NÃO depende de T-F2-03 nem de T-F2-06 (`[H]`)
- Contrato adicional (decisão 2026-10-04): o job conhece, direta ou por referência coesa, usuário, unidade/`sourceScope` aprovado, `sourceLanguage`, `generationLocale`, estimativa/reserva de consumo, estado/fase e consumo final; um job NUNCA amplia o escopo depois de criado sem nova validação de custo e autorização de domínio (INV-13).
- Superfície: nova migração aditiva (próxima livre: `033-generation-jobs.sql`; 031 e 032 já usadas por F10), `server/src/services/generation-jobs.js`, rotas `POST/GET /v1/generation-jobs`.
- Esquema: `id, user_id, proposal_id, state, phase, provider, started_at, last_activity_at, finished_at, error_code, error_message, draft_id, cancel_requested_at`.
- RED: transições válidas e inválidas; um job por proposta ativa (idempotência: segundo `POST` retorna o job existente); recuperação na subida do servidor marca jobs `CALLING_PROVIDER` órfãos como `FAILED(SERVER_RESTARTED)`.
- Segurança de dados: migração aditiva, backup `pre-migrate` (T-F1-02) obrigatório.
- Subtarefas:
  - [x] RED: transições válidas e inválidas da máquina de estados
  - [x] RED: um job por proposta ativa (segundo `POST` devolve o existente)
  - [x] RED: na subida do servidor, job `CALLING_PROVIDER` órfão vira `FAILED(SERVER_RESTARTED)`
  - [x] Migração aditiva `033-generation-jobs.sql` com backup `pre-migrate` verificado
  - [x] `server/src/services/generation-jobs.js` e rotas `POST/GET /v1/generation-jobs`
  - [x] Job nunca amplia o escopo depois de criado (INV-13), com teste
  - [x] Gate: `migrations*.test.js` + novo, unidade, `schema checksum`; evidência e fechar
- Gate: testes de migração (`migrations*.test.js` + novo), unidade, e `schema checksum` do runner de migrações.
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F3-05, depois T-F3-02.
- Comando: `npm --prefix server test` (918/918 com T-F3-05); só a fiação: `node --test server/test/generation-jobs.test.js`

### T-F3-02 — Execução em segundo plano com limite duro e cancelamento · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `daf5013` · IMPLEMENTATION_SHA `fe0937c` (executor em segundo plano, limite duro configurável 30 min, cancelamento que mata a árvore, QUEUED retomado; 15 testes, 6 mutações vermelhas; servidor 941/941) · Requisitos: R-04 (AC-04.1, AC-04.4) · Dependências: T-F3-01, T-F1-04
- Fazer: o job roda fora do ciclo da requisição; limite duro configurável (padrão acima do atual de 20 min para evitar regressão); `POST /generation-jobs/:id/cancel` encerra a árvore de processos do provedor e marca `CANCELLED`; falha/cancelamento não deixam rascunho parcial aceitável.
- RED (provedor FAKE controlável): cancelar durante a chamada termina o processo filho; timeout vira `FAILED(TIMEOUT)`; nenhum rascunho criado em falha.
- Subtarefas:
  - [x] RED (provedor FAKE controlável): cancelar durante a chamada termina o processo filho
  - [x] RED: timeout vira `FAILED(TIMEOUT)` e nenhum rascunho é criado em falha
  - [x] Job roda fora do ciclo da requisição, com limite duro configurável (padrão acima de 20 min)
  - [x] `POST /generation-jobs/:id/cancel` encerra a árvore de processos e marca `CANCELLED`
  - [x] Gate: `ai-drafts.test.js`, `codex-provider.test.js` inalterado, testes novos, zero chamada real; evidência e fechar
- Gate: `ai-drafts.test.js`, `codex-provider.test.js` (inalterado), testes novos; zero chamada real.
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F3-03 (fechada junto) e então T-F3-04.
- Comando: `node --test server/test/generation-job-runner.test.js`

### T-F3-03 — Sinal de vida do provedor e política de "parada" · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `daf5013` · IMPLEMENTATION_SHA `fe0937c` (amostrador de CPU/handles da árvore + política STALLED só-aviso; 7 testes com relógio injetado, 3 mutações vermelhas; servidor 941/941) · Requisitos: R-04 (AC-04.2) · Dependências: T-F3-02
- Fazer: além dos eventos de `codex exec --json`, amostrar CPU/handles do processo filho; `lastActivityAt` atualiza com qualquer sinal; só marcar `STALLED` (aviso, não falha) após silêncio total generoso; o limite duro continua sendo a única condição de falha por tempo.
- RED (provedor FAKE que fica 5 min em silêncio com CPU ativa): não vira STALLED; FAKE sem CPU e sem saída vira STALLED.
- Subtarefas:
  - [x] RED (relógio injetado): provedor FAKE em silêncio por 5 min com CPU ativa NÃO vira `STALLED`
  - [x] RED: provedor FAKE sem CPU e sem saída vira `STALLED` (aviso, nunca falha)
  - [x] Amostrar CPU/handles do processo filho além dos eventos de `codex exec --json`; `lastActivityAt` atualiza com qualquer sinal
  - [x] `STALLED` só após silêncio total generoso; o limite duro de T-F3-02 segue a única condição de falha por tempo; sinal de vida volta o job a `CALLING_PROVIDER`
  - [x] Gate: testes com relógio injetado, sem Codex; evidência e fechar
- Gate: testes com relógio injetado; sem Codex.
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F3-04.
- Comando: `node --test server/test/generation-job-liveness.test.js`
- Observação de evidência: a premissa "raciocínio longo é silencioso" vem do probe documentado no checkpoint; reconfirmar em T-F5-02 com medição real autorizada, não suposição.

### T-F3-04 — UI de geração: fase real, sair e voltar · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `c76c13b` · IMPLEMENTATION_SHA `169acf5` (a geração da UI vira job em segundo plano: fase real, tempo, sair/voltar/recarregar, cancelar com confirmação, STALLED calmo, falha em português; 4 casos e2e + 6 unitários, 4 mutações vermelhas; e2e completo 209 passed / 0 failed / 403 s; raiz 522/522, servidor 941/941) · Requisitos: R-04 (AC-04.3), F-14 · Dependências: T-F3-02
- Superfície: `src/materials-ui.js`, `src/source-proposals-ui.js`, estilos.
- Fazer: texto "pode levar alguns minutos"; fase atual e tempo; "Continuar em segundo plano" volta à lista; item da lista mostra "Gerando…/Pronto/Falhou" e abre o rascunho quando pronto; "Cancelar" com confirmação.
- RED (e2e com FAKE lento): sair da tela, voltar, ver "Gerando" e depois o rascunho pronto; cancelar libera a unidade.
- Subtarefas:
  - [x] RED (e2e com FAKE lento): sair da tela, voltar, ver "Gerando" e depois o rascunho pronto
  - [x] RED (e2e): cancelar com confirmação libera a unidade
  - [x] Texto "pode levar alguns minutos", fase atual e tempo; "Continuar em segundo plano" volta à lista
  - [x] Item da lista mostra "Gerando…/Pronto/Falhou" e abre o rascunho quando pronto (`src/materials-ui.js`, `src/source-proposals-ui.js`, estilos)
  - [x] Gate: `e2e/lesson-editor.spec.js` + `generation-jobs.spec.js`; axe nas telas novas; evidência e fechar
- Gate: `e2e/lesson-editor.spec.js` + novo `generation-jobs.spec.js`; axe nas telas novas.
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F4-03.
- Comando: `npm run test:e2e -- e2e/generation-jobs.spec.js`

### T-F3-05 — Explicação obrigatória por validação · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `ea8c440` · IMPLEMENTATION_SHA `9a2799f` (EXPLANATION_MISSING substitui QUESTION_NO_EXPLANATION para toda questão sem "Por quê"; 2 mutações vermelhas; servidor 918/918) · Requisitos: F-15 · Dependências: nenhuma de F3
- Fazer: achado determinístico `EXPLANATION_MISSING` para toda questão sem "Por quê" (não só respostas curtas); mostrado na Revisão, não bloqueia aceite.
- RED: questão sem explicação gera o achado; com explicação não.
- Subtarefas:
  - [x] RED: questão sem explicação gera `EXPLANATION_MISSING`; com explicação não gera
  - [x] Achado determinístico para toda questão sem "Por quê" (não só respostas curtas)
  - [x] Mostrado na Revisão sem bloquear o aceite
  - [x] Mutação (remover a regra deve ficar vermelho); gate `draft-audit-questions.test.js`; evidência e fechar
- Gate: `draft-audit-questions.test.js`.
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F3-02.
- Comando: `node --test server/test/draft-audit-questions.test.js server/test/accept-draft.test.js`

### Checkpoint F3
- Prova composta com FAKE: gerar, sair, voltar, cancelar, falhar, reiniciar o servidor no meio (job marcado `FAILED(SERVER_RESTARTED)`), sem órfãos.
- Mutação: remover a recuperação de órfãos na subida deve falhar o teste; remover a morte da árvore no cancelamento deve falhar o teste do processo filho.
- Gate completo + verificador independente (concorrência/processos).

---

## F4 — UI/UX da aula, Materiais e acessibilidade (F-30..F-36)

Objetivo: o produto precisa ser claro e confortável para uma pessoa, não só "funcionar". Esta fase depende de olhos humanos.

### T-F4-01 — Roteiro de validação visual humana e registro · M
- Status: `[H]` · Requisitos: R-06 (AC-06.1) · Dependências: T-F1-01, T-F1-07, T-F1-08 (banco único e identidade/build inequívocos). A execução é UAT humano; os passos MECÂNICOS (ver `uat-visual.md`) podem ser provados sem humano
- Fazer: preparar roteiro curto (≤ 15 min) em `.specs/features/hardening-roadmap-v1/uat-visual.md`: abrir `npm run dev:desktop`; Hoje/Plano/Estatísticas/Disciplinas com o histórico; Materiais → Rascunhos em andamento → editor; editar Q, salvar, recarregar; Revisão; "Sobre". Cada passo com resultado esperado e campo para "claro? confortável? o que incomodou?".
- Resultado: o humano devolve achados; cada um vira F-xx priorizado. `VISUAL_VALIDATION` só vira PASS por declaração humana ou por checagem de instrumento equivalente declarada.
- Gate: arquivo do roteiro revisado; resultado registrado.

### T-F4-02 — Hierarquia da Revisão e ruído de achados · M
- Status: `[ ]` · Requisitos: R-06 (AC-06.4), F-31 · Dependências: T-F2-03
- Fazer: ordenar por severidade, colapsar BAIXA, mostrar contagem por tipo no topo, "Sinalizada" só para severidade ≥ MÉDIA; texto explica o que olhar.
- RED (e2e com fixture de 67 achados): primeiros itens são os mais severos; a tela inicial não excede N linhas visíveis sem rolagem.
- Gate: `lesson-view-model.test.js` ampliado + e2e.

### T-F4-03 — Posição de "Rascunhos em andamento" e confirmação de salvar no índice · S
- Status: `[>]` 2026-10-05 · Requisitos: R-06 (AC-06.3), F-32, F-33 · Dependências: nenhuma
- Superfície: `index.html` (ordem dos blocos de `#sources-proposals-panel`), `src/materials-ui.js` (handler de "Salvar título"), estilos.
- Fazer: mover o bloco para antes da busca quando existir; "Salvar título" mostra "Título salvo" em região `role=status` e mantém foco.
- Subtarefas:
  - [>] RED (e2e): com rascunhos em andamento, o bloco aparece antes da busca; sem eles, a ordem não muda
  - [ ] RED (e2e + a11y): "Salvar título" mostra "Título salvo" em `role=status` e o foco permanece no campo
  - [ ] Mover o bloco "Rascunhos em andamento" para antes da busca quando existir
  - [ ] Região `role=status` com "Título salvo" ao salvar o título no índice, sem mover o foco
  - [ ] Gate: `source-proposals.spec.js`, `materials-a11y.spec.js` + novo caso; evidência e fechar
- Gate: `source-proposals.spec.js`, `materials-a11y.spec.js` + novo caso.
- Próximo passo: o bloco `#sources-drafts` está DEPOIS da busca (`#sources-topic-form`) em `index.html` (~linhas 667-680); o bloco "Rascunhos em andamento" agora também lista gerações em andamento/falhas (T-F3-04, `renderDraftsInProgress` em `src/materials-ui.js`), então o caso e2e pode reaproveitar o stub lento de `e2e/generation-jobs.spec.js` ou um rascunho já existente (`lesson-editor.spec.js:324`). Escrever o RED em `e2e/source-proposals.spec.js` (ordem do DOM com/sem rascunhos) e o de "Título salvo" (`role=status`, foco no campo) antes de tocar em `index.html`. Hoje a confirmação de salvar usa `#sources-message` (`setSourcesMessage("Título atualizado.")`); F-33 pede a região `role=status` mantendo o foco no campo (a subtarefa pede que o foco permaneça no campo; hoje o código devolve o foco ao botão "Salvar título": provar qual elemento deve manter o foco antes de mudar).
- Comando: `npm run test:e2e -- e2e/source-proposals.spec.js e2e/materials-a11y.spec.js`

### T-F4-04 — Editor da aula em telas estreitas · M
- Status: `[ ]` · Requisitos: R-06 (AC-06.2), F-34 · Dependências: nenhuma
- Fazer: abaixo de 720 px, lista e editor empilham com navegação "Voltar à lista"; sem rolagem horizontal; alvos de toque ≥ 44 px.
- RED: e2e em 360×800 e 768×1024 verificando ausência de overflow horizontal e operabilidade completa.
- Subtarefas:
  - [ ] RED (e2e 360×800 e 768×1024): sem overflow horizontal e editor operável por completo
  - [ ] Abaixo de 720 px, lista e editor empilham com navegação "Voltar à lista"
  - [ ] Alvos de toque ≥ 44 px no editor
  - [ ] Gate: `lesson-editor-responsive.spec.js` novo e `stats-responsive-regression.spec.js` verde; evidência e fechar
- Gate: novo `lesson-editor-responsive.spec.js`; `stats-responsive-regression.spec.js` verde.

### T-F4-05 — Acessibilidade do editor (teclado, foco, anúncios) · M
- Status: `[ ]` · Requisitos: R-06 (AC-06.2), F-35 · Dependências: T-F4-04
- Fazer: padrão de abas com setas/Home/End, foco restaurado após salvar/rejeitar/voltar, mensagens de salvar em `aria-live`, nomes acessíveis nos itens ("Questão 3, sinalizada, 2 pontos"); axe nas telas do editor (hoje fora do alcance do axe).
- RED: teste de teclado puro percorre as quatro abas e uma questão; axe sem violações serious/critical.
- Gate: `accessibility.spec.js` ampliado, `keyboard-study-materials.spec.js` verde.

### T-F4-06 — Regenerar UMA questão (contrato) · L (dividir)
- Status: `[H]` · Requisitos: F-17 · Dependências: HG-06 (resultado do Prompt Lab) e F5
- Observação: exige contrato de questão única com o modelo = mudança de prompt/provedor. NÃO executar antes do Prompt Lab aprovar (INV-09). Subtarefas futuras: (a) contrato `regenerateQuestion(question, sourceSpans)`; (b) UI com comparação lado a lado e aceite explícito; (c) proveniência `generatedBy` da nova versão.

### T-F4-07 — Cópia de estados e i18n (T46/T47) com guarda de acentuação · M
- Status: `[ ]` · Requisitos: F-36 · Dependências: nenhuma · Nota (2026-10-04): i18n de INTERFACE e idioma PEDAGÓGICO são problemas diferentes; `uiLocale`/`generationLocale` pertencem a R-13/F10, não a esta tarefa
- Fazer: varredura de textos visíveis fora dos arquivos de locale; teste que falha com padrões de mojibake (`Ã§`, `Ã£`, `�`); mensagens de vazio/erro/carregando padronizadas. Seguir a skill `codex-portuguese-i18n-repair` se aparecer corrupção.
- Subtarefas:
  - [ ] Varredura de textos visíveis fora dos arquivos de locale (lista do que existe)
  - [ ] RED: teste de guarda que falha com padrões de mojibake (`Ã§`, `Ã£`, `�`) em texto visível
  - [ ] Padronizar mensagens de vazio/erro/carregando
  - [ ] Gate: teste de guarda + `npm test`; evidência e fechar
- Gate: teste de guarda + `npm test`.

### Checkpoint F4
- Humano executa o roteiro (T-F4-01) com a build do checkpoint; achados P0/P1 corrigidos ou aceitos explicitamente.
- Gate completo + axe + e2e responsivo. `VISUAL_VALIDATION` registrado com autoria (humano) e data.

---

## F5 — Qualidade de conteúdo médico e Prompt Lab (F-12, F-16, F-17; VALID-4/5/8)

Objetivo: transformar "parece bom" em medida. Única fase que pode chamar o Codex, só com HG-07 e por rodada autorizada. Resultado NÃO é conectado ao produto automaticamente.

### T-F5-01 — Desenho do Prompt Lab (spec e rubrica) · M
- Status: `[H]` · Requisitos: R-05 (AC-05.1) · Dependências: HG-06, HG-07, HG-08
- Entregáveis em `.specs/features/prompt-lab/`: `spec.md` (objetivo, escopo, fora de escopo), `rubric.md` (critérios: erro clínico crítico, fato sem suporte, qualificador perdido, explicação circular, dica que entrega resposta, cópia literal, volume, cobertura, idioma), `dataset.md` (unidades reais referenciadas por caminho externo, nunca no repositório), `budget.md` (teto de chamadas e tempo).
- Regras: avaliação cega entre variantes; mesma unidade e mesma entrada em todas as variantes; sementes e versões registradas; saídas guardadas fora do repositório; nenhum acoplamento ao produto.

### T-F5-02 — Medir comportamento real do provedor (sem otimizar nada) · M
- Status: `[H]` · Requisitos: R-04/R-05 · Dependências: T-F5-01, HG-07
- Fazer: 3 gerações da mesma unidade (Glomerular Filtration, banco real) registrando tempo por fase, eventos `codex exec --json`, silêncio máximo, CPU; checar a premissa do T-F3-03.
- Gate: relatório com números; `CODEX_CALL_COUNT` registrado e dentro do teto.

### T-F5-03 — VALID-4 completo: canário com PDF real e avaliação humana · M
- Status: `[H]` · Dependências: T-F5-01, F2, F3
- Fazer: gerar a unidade selecionada (escopo provado pelo `sourceScope`), humano avalia com a rubrica, achados classificados; resultado `PASS|FAIL` registrado em `v1-validation/plan.md`. O estado anterior `INTERRUPTED_BY_USER / NOT_PROVEN` só muda com esta evidência.

### T-F5-04 — VALID-5: consistência entre gerações · M
- Status: `[H]` · Dependências: T-F5-03
- Fazer: repetir a mesma unidade 3 vezes; medir erros críticos, fatos sem suporte, qualificadores perdidos, achados e reparos por geração. Erro médico sério não detectado em qualquer geração bloqueia `REALMODEL_CONTENT_QUALITY_PROVEN`.

### T-F5-05 — Sensores determinísticos de qualificadores entre idiomas · L (dividir)
- Status: `[ ]` · Requisitos: R-05 (AC-05.3) · Dependências: T-F5-03 (`[H]`, para exemplos reais de falha) — por isso fica BLOCKED_HUMAN, fora de qualquer sprint autônoma de extração
- Subtarefas: (a) extrair do texto-fonte qualificadores numéricos/temporais/condicionais ("in 80% of", "within 24 h", "only if") e doses; (b) verificar presença/equivalência no rascunho PT por dicionário curto controlado (não tradução geral); (c) novo achado `QUALIFIER_LOST` com severidade; (d) o que não é determinístico fica rotulado na UI como "exige conferência humana".
- RED: corpora pequenos sintéticos (EN→PT) com perda de qualificador injetada; falso positivo medido contra o rascunho real (alvo: o 67→0 já obtido para sobreposição não regride).
- Gate: `draft-audit-cross-language.test.js` ampliado; revisão humana de amostra de achados reais.
- Cuidado: aumentar sensibilidade sem medir falso positivo recria a "parede de alertas". Medir ambos.

### T-F5-06 — Execução do Prompt Lab e relatório comparativo · L (dividir)
- Status: `[H]` · Dependências: T-F5-01..05
- Fazer: rodadas pré-registradas (baseline = prompt v5), variantes propostas; relatório com intervalos e exemplos; recomendação. Qualquer mudança de prompt para o produto vira tarefa própria com HG explícito.

### T-F5-07 — VALID-8: decisão de validação do V1 · S
- Status: `[H]` · Dependências: T-F5-03, T-F5-04
- Fazer: decisão humana registrada com evidência: `REALMODEL_CONTENT_QUALITY_PROVEN` sim/não/condicional e riscos aceitos.

### T-F5-08 — Ordem de leitura por colunas na extração de PDF (achado D1 de VALID-4/5) · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `5dc75b7` · IMPLEMENTATION_SHA `21aedd1` (`server/src/pdf/column-order.js` ligado em `extract-worker.js`; evidência em `validation.md`; fontes JÁ gravadas no banco DEV NÃO foram reextraídas) · Requisitos: R-05 (fidelidade de escopo) · Dependências: nenhuma (sem Codex, sem HG). Fechada isolada na sprint S1 (`PROGRAM.md`)
- Causa CONFIRMADA (2026-10-04, `getTextContent` do Costanzo, pág. 267, somente leitura): a página tem duas colunas (esquerda x≈60, direita x≈318) e o PDF emite o texto na ordem de fluxo do conteúdo, que nem sempre é a ordem de leitura. Na pág. 267 a coluna DIREITA (início de "Glomerular Filtration") é emitida antes da ESQUERDA (cauda do tópico anterior: FSR/PAH); `pageTextFromItems` (`server/src/pdf/page-text.js`) preserva a ordem do fluxo, então a cauda cai no meio de uma frase de podócitos e entra no escopo por seção → D1 (2 de 3 gerações). Varredura das 496 páginas: em ~390 de 488 páginas de duas colunas o primeiro item da coluna direita precede o da esquerda no fluxo (heurística grosseira; só dimensiona o problema, não é o critério de aceite).
- Fazer: ordenar os itens por geometria (colunas detectadas por vão estável entre blocos; esquerda → direita; dentro da coluna, por y decrescente), SÓ quando a página é de duas colunas com vão claro; página de coluna única, tabelas e figuras mantêm o comportamento atual. Cabeçalho/rodapé correntes (y fora do corpo) continuam tratados por `stripRunningHeaders`.
- Escudo (antes de editar): `pdf-extraction.test.js`, `extraction-text-fidelity.test.js` e a suíte de unidades/headings (`headings.js`, `outline.js`) devem continuar verdes; a pergunta "se isto destruir o texto bom, qual sensor fica vermelho?" exige um fixture sintético de duas colunas com ordem de fluxo invertida (RED) e outro de coluna única (não regressão).
- RED: fixture sintético de 2 colunas com fluxo direita→esquerda: o texto extraído hoje mistura a cauda da coluna esquerda no meio da direita; após a mudança, a esquerda precede a direita e nenhuma frase é partida. Não usar o livro no repositório; só medir no PDF real fora do Git.
- Gate: `npm --prefix server test` (extração, unidades, headings) + `npm test`; prova real SOMENTE LEITURA: reextrair as págs. 267–273 do Costanzo e confirmar que o termo "PAH" não aparece dentro do span "Glomerular Filtration" (sem gerar com o Codex; sem tocar o banco DEV).
- Risco: reordenação errada em páginas com figuras/tabelas largas ou colunas desiguais. Mitigação: detecção conservadora, medir em uma amostra de páginas (texto antes × depois), reverter se o número de frases partidas aumentar.
- Fora de escopo: reextrair fontes já gravadas no banco DEV (decisão separada, exige backup e reupload; INV-06/07).

### Checkpoint F5
- Todas as chamadas ao Codex contadas e dentro do orçamento; nenhuma saída do lab no repositório; produto inalterado (diff vazio em prompt/provedor até decisão); `VALID_4/5/8` com estado justificado por evidência.

---

## F6 — Plataforma de teste que discrimina (F-40..F-46)

Objetivo: suíte rápida, determinística e que de fato fica vermelha quando algo importante quebra. Pode andar em paralelo com F2–F4 (superfície: `playwright.config.js`, `scripts/`, `e2e/` metadados).

### T-F6-01 — Definir e etiquetar a suíte "materiais" · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `d603aba` · IMPLEMENTATION_SHA `1328499` (evidência em `validation.md`, seção T-F6-01) · Requisitos: R-07 (AC-07.1) · Dependências: nenhuma
- Fazer: tag `@materials` nos testes de Materiais/Fonte/Rascunho/Editor (`lesson-editor`, `draft-acceptance`, `source-proposals`, `source-reupload`, `large-pdf`, `large-draft-review`, `materials-a11y`, `keyboard-study-materials`, ...); `npm run test:e2e:materials`; contagem registrada em `TEST_COVERAGE_MATRIX.md`; o "45/45" histórico passa a ser reproduzível ou formalmente substituído.
- Gate: comando roda e a contagem coincide com a matriz; inventário de testes PASS.

### T-F6-02 — Portas dinâmicas e saída única por execução · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `d603aba` · IMPLEMENTATION_SHA `1328499` (evidência em `validation.md`, seção T-F6-02) · Requisitos: R-02 (AC-02.3), F-41 · Dependências: nenhuma
- Fazer: Playwright escolhe porta livre (config com função), `outputDir` com sufixo por execução; specs que fixam portas de servidor (`139xx`) passam a alocar livre; falha limpa quando faltar porta.
- RED: duas execuções simultâneas da mesma suíte não colidem.
- Gate: duas execuções paralelas curtas verdes; e2e completo verde.

### T-F6-03 — Partição e tempo-alvo do e2e completo · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `fe3398e` · IMPLEMENTATION_SHA `51da2d1` (prelúdio de login por HTTP + UI; gate 3 execuções 453/448/450 s, 0 falhas; evidência em `validation.md`) · Requisitos: R-07 (AC-07.2), F-42 · Dependências: T-F6-02
- Resultado: medição 2026-10-05: 205 passed em 8,9 min com 2 workers; os workers já estão equilibrados (491 s × 490 s), então partição não reduz o tempo; a meta de 8 min exige cortar ≥ ~11 % do tempo de teste ou mais workers (evidência em `validation.md`, T-F6-03).
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F6-09.
- Fazer: separar specs independentes em grupos (`--shard` ou projetos), mantendo a ordem onde há dependência; meta ≤ 8 min com 2 workers sem aumentar flakes (medir 3 execuções consecutivas).
- Gate: 3 execuções consecutivas sem falha; relatório de tempos.
- Subtarefas:
  - [x] Medir o baseline (534 s, 205 passed, 2 workers)
  - [x] Provar que reparticionar não resolve (workers 491 s × 490 s)
  - [x] Perfilar o caminho crítico (achado: ~156 de 207 testes repetem um prelúdio de login pela UI de ~3,5 s: goto 0,4 + networkidle 0,9 + registrar 1,2 + entrar 1,0; ≈ 530 s de trabalho de worker)
  - [x] Eliminar desperdício sem perder cobertura nem asserções (registro por HTTP em paralelo ao carregamento da página; login continua pela UI; formulário de registro segue coberto em auth/first-run/student-journey/product-value)
  - [x] Full run de confirmação ≤ 460 s (454 s, 205 passed, 0 falhas, 2 workers)
  - [x] Gate #1 ≤ 480 s (453 s)
  - [x] Gate #2 ≤ 480 s (448 s)
  - [x] Gate #3 ≤ 480 s (450 s)
  - [x] Registrar a evidência em `validation.md`
  - [x] Fechar T-F6-03
- Medição 2026-10-04 @`3608048` em `validation.md` (gate NÃO atingido; a causa da falha do run 2 e a do `0xC0000142` NÃO estão provadas — ver T-F6-08).

### T-F6-08 — Causa da falha funcional do run 2 do e2e completo · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `414eb83` · IMPLEMENTATION_SHA nenhum (só evidência, sem código; registro em `23bbb98`) · Requisitos: R-07 (AC-07.2), F-42 · Dependências: T-F6-02 (independente de T-F6-03, que depende do resultado)
- Outcome: a causa de `product-value.spec.js:86` (`#account-show-register` oculto após o retry de 20 s) está DISCRIMINADA com evidência; correção SOMENTE se houver defeito demonstrado (produto ou teste); se for carga do ambiente, isso fica provado, não presumido. Proibido subir timeout/retry antes da causa.
- Hipóteses concorrentes (nenhuma assumida): (a) corrida de inicialização do app: o clique em `[data-screen="account"]` chega antes de a navegação estar ligada; (b) colisão de estado/porta/lane entre workers; (c) backend do worker ainda não pronto; (d) pressão de memória/handles da máquina (compatível com o `0xC0000142` do run 3, que é fato distinto).
- Evidência anterior (NÃO é prova desta falha): `conductor/tracks/content-quality/plan.md` (~l.724) registra falha com o MESMO sintoma (`#account-show-register` invisível por 30 s, `content-quality-flow.spec.js:143`) classificada como "sensível a carga" por reprodução sob CPU saturada (2/24 no merge e 2/24 no baseline; isolado 6/6), com a causa exata da falha original NÃO reproduzida; `EXECUTION.md` lista também `hoje-block-retest.spec.js` como flake pré-existente. Serve para ordenar as hipóteses, não para concluir a do run 2.
- Menor discriminador: reexecutar só esse spec N vezes com 1 worker e com 2, com o ambiente descrito (processos alheios contados antes), guardando trace/console/rede da falha; comparar taxa de falha entre as condições.
- Gate: causa registrada em `validation.md` com contagens; se defeito: RED → GREEN → mesma repetição sem falha.
- Estado: concluída; fechada como "sintoma não reproduzido, causa NOT_PROVEN, sem defeito demonstrado".
- Resultado: sintoma `#account-show-register` oculto não reproduzido em 10 rodadas (0/10); causa NOT_PROVEN; nenhuma correção feita.
- Subtarefas:
  - [x] Rodadas com workers=1 (5): 4 PASS, 1 FAIL
    - [x] w1-r1 — PASS 38/38 (208 s)
    - [x] w1-r2 — PASS 38/38 (207 s)
    - [x] w1-r3 — PASS 38/38 (208 s)
    - [x] w1-r4 — PASS 38/38 (199 s)
    - [x] w1-r5 — FAIL 7 passaram / 8 falharam (50 s): `Target crashed`, não é o sintoma
  - [x] Rodadas com workers=2 (5): 5 PASS
    - [x] w2-r1 — PASS 38/38 (131 s)
    - [x] w2-r2 — PASS 38/38 (127 s)
    - [x] w2-r3 — PASS 38/38 (132 s)
    - [x] w2-r4 — PASS 38/38 (126 s)
    - [x] w2-r5 — PASS 38/38 (126 s)
  - [x] Coletar os traces das falhas (`trace.zip` do run da w1-r5)
  - [x] Analisar a taxa de falha por workers (1 × 2)
  - [x] Registrar contagens e causa em `validation.md` (seção T-F6-08)
  - [x] Decidir o fechamento ou a próxima ação (fechada sem correção; reabrir só se o sintoma reaparecer com trace)
- Execução: CONCLUÍDA em 2026-10-05; o driver terminou (`DONE` em `summary.txt`) e NADA está em execução agora. Driver: `.specs/features/hardening-roadmap-v1/probes/t-f6-08-materials-runs.sh` (rodou sequencialmente `npm run test:e2e:materials` com `E2E_WORKERS` 1 e depois 2). Fatos de `summary.txt`: 10 rodadas, 38 testes cada; workers=1: w1-r1..r4 PASS, w1-r5 FAIL (`Target crashed`, 7 passaram / 8 falharam em 50 s); workers=2: w2-r1..r5 PASS. Análise já registrada em `validation.md` (seção T-F6-08): sintoma `#account-show-register` 0/10, causa NOT_PROVEN, nenhuma correção feita.
- Resultados em ARQUIVO (não só no terminal): `test-results/t-f6-08/` na worktree (gitignored, mas em disco; espelho a cada 10 s do scratchpad por `test-results/t-f6-08/mirror.sh`): `summary.txt` = uma linha por rodada (exit, segundos, processos antes, id do run, passed/failed) + linhas `FAIL` com o teste + `DONE` no fim; `<tag>.log` = log completo da rodada. Traces de falha: `test-results/<run-id>/**/trace.zip` (o id do run está na linha da rodada em `summary.txt`).
- Andamento: 10/10 rodadas concluídas (`grep -c "^w[12]-r" test-results/t-f6-08/summary.txt` = 10; última linha `DONE`). Resta só a decisão de fechamento ou de próxima ação (última subtarefa).
- Próximo passo: nenhum; tarefa fechada. Reabrir só se o sintoma reaparecer com trace; qualquer correção só com defeito demonstrado (proibido subir timeout, retry ou sleep antes da causa). Não reexecutar as 10 rodadas sem hipótese nova.
- Comando: `cat test-results/t-f6-08/summary.txt` (RESULTADO FINAL: 10 rodadas, última linha `DONE`); só reexecutar `bash .specs/features/hardening-roadmap-v1/probes/t-f6-08-materials-runs.sh` com HIPÓTESE NOVA (grava em `test-results/t-f6-08/`).

### T-F6-09 — Contrato do runner e2e: uma única autoridade (`test-live` × `e2e.mjs`) · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `8385999` · IMPLEMENTATION_SHA `a967f57` (SUITES.e2e = scripts/e2e.mjs; sensor deriva o caminho de package.json; mutação vermelha; raiz 516/516) · Requisitos: R-07 (AC-07.2) · Dependências: T-F6-02, T-F6-03
- Outcome: existe UMA autoridade de execução do e2e completo; `test/test-live.test.js:99` e `scripts/test-live-core.mjs` (`SUITES.e2e`) expressam o contrato atual (portas por execução, workers, saída própria) em vez de contorná-lo, e `tasks.md`/`validation.md` deixam de citar o caminho legado como vigente.
- Fazer: reconstruir T-F6-02 → `package.json` (`test:e2e` = `node scripts/e2e.mjs`) → `scripts/e2e.mjs` → `scripts/test-live-core.mjs` → comportamento pretendido; decidir por esse contrato, NÃO por deixar o teste verde.
- Subtarefas:
  - [x] Reconstruir o contrato atual (T-F6-02 → `package.json` → `scripts/e2e.mjs` → `scripts/test-live-core.mjs`)
  - [x] Decidir a autoridade única de execução do e2e completo (por intenção, não por teste verde)
  - [x] Alinhar `SUITES.e2e` e `test/test-live.test.js:99` ao contrato (portas por execução, workers, saída própria)
  - [x] Sensor que fica vermelho quando o runner canônico é contornado (mutação)
  - [x] Suíte raiz 479/479 e e2e iniciável pelo caminho governado
  - [x] Evidência em `validation.md` e fechar
- Gate: sensor que fica vermelho quando o runner canônico é substituído por um caminho semanticamente errado; suíte raiz 479/479; e2e continua iniciável pelo caminho governado.
- Próximo passo: nenhum; tarefa fechada. Próxima: T-F3-01.
- Comando: `node --test "test/test-live.test.js"`

### T-F6-04 — Comando de discriminação (mutação) repetível · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `8832df7` · IMPLEMENTATION_SHA `29cab11 + 751ca69` (npm run test:mutation: 7/7 mutantes mortos em worktree descartável; evidência em `validation.md`) · Requisitos: R-07 (AC-07.3), F-45 · Dependências: nenhuma
- Fazer: `scripts/mutation-check.mjs` que, em worktree temporária (nunca na árvore real), aplica mutações de comportamento listadas (posicional em `mergeIdentity`; ignorar `devPersistent`; remover filtro de REJECTED no aceite; permitir apagar fora da allowlist no sanitizador; não verificar checksum no import) e confirma que o conjunto relevante de testes falha.
- Gate: cada mutação mata ≥ 1 teste; relatório gerado; script recusa rodar fora de worktree descartável.

### T-F6-05 — Avisos de lint e do Rust · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `8b6a887` · IMPLEMENTATION_SHA `685cfee + e6d1ec1` (lint 0 avisos e falha em qualquer aviso; Rust sem avisos; evidência em `validation.md`) · Requisitos: R-07 (AC-07.4), F-43 · Dependências: nenhuma
- Fazer: corrigir ou justificar os 23 avisos (variáveis não usadas, diretiva eslint-disable sem efeito) e o aviso de linker; `npm run lint` passa a falhar com avisos NOVOS (`--max-warnings` fixado no valor corrigido).
- Gate: lint com limite; sem mudança de comportamento (diff revisado por tipo).

### T-F6-06 — Contrato de persistência entre adaptadores (DEBT-006, parte 1) · L → DIVIDIDA em 06a/06b/06c (cada uma ≤ M, fecha sozinha)
- Status: `[=]` SPLIT em T-F6-06a, T-F6-06b, T-F6-06c · Requisitos: R-07 · Dependências: nenhuma
- Subtarefas originais: (a) levantar adaptadores vivos hoje (servidor SQLite é a autoridade; legado local/BrowserStore); (b) suíte de contrato executável contra o que ainda for suportado; (c) decisão de aposentadoria do legado. IndexedDB e sincronização ficam fora (spec, seção 7).

### T-F6-06a — Levantamento dos adaptadores de persistência vivos · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `24631c7` · IMPLEMENTATION_SHA nenhum (só levantamento) (2 adaptadores vivos, 1 morto; evidência em `validation.md`) · Dependências: nenhuma · Fazer: lista verificada por código/uso (quem chama, em que modo: Web, REMOTE_MODE, legado) em `validation.md`; sem alterar código. Gate: cada adaptador listado tem referência `arquivo:linha` de uso real e marcação VIVO/MORTO.

### T-F6-06b — Suíte de contrato executável contra os adaptadores vivos · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `24631c7` · IMPLEMENTATION_SHA `1cc51b4` (47 testes de contrato contra BrowserStore e RemoteDB; 2 mutantes vermelhos; evidência em `validation.md`) · Dependências: T-F6-06a · Fazer: testes de contrato idênticos rodados contra cada adaptador VIVO (criar/ler/atualizar/apagar, ordem, ids estáveis). Gate: suíte nova verde; mutação simples (trocar a ordem num adaptador) deixa ≥ 1 teste vermelho.

### T-F6-06c — Decisão de aposentadoria do legado · S
- Status: `[H]` · Dependências: T-F6-06a, T-F6-06b · Decisão de produto/arquitetura sobre remover o adaptador legado; sem remoção de código sem ordem.

### T-F6-07 — Matriz de cobertura reconciliada · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `751ca69` · IMPLEMENTATION_SHA `8b6a887` (matriz reconciliada: 31 TESTED / 1 MUTATION-KILLED / 6 HUMAN / 12 NOT_PROVEN; evidência em `validation.md`) · Dependências: T-F6-01
- Fazer: atualizar `TEST_COVERAGE_MATRIX.md` com os sensores desta fase e o mapa requisito→teste; marcar lacunas como `NOT_PROVEN`.

### Checkpoint F6
- Três execuções completas consecutivas sem falha; tempo registrado; `@materials` reproduz a contagem; mutação mata todas as mutações listadas; lint sem avisos novos.

---

## F7 — Produto de estudo (F-37; DEBT-003, DEBT-007) — após F4

Objetivo: melhorias que o uso real do banco DEV já pede, sem mexer no algoritmo antes de haver dados.

### T-F7-01 — Recuperação de atraso ("reagendar atrasadas") reversível · L (dividir)
- Status: `[H]` · Requisitos: R-11 (AC-11.1) · Dependências: HG-09, F4
- Evidência de necessidade: 27 revisões vencidas, a mais antiga com 104 dias de atraso no banco DEV.
- Subtarefas: (a) spec de comportamento (o que acontece com o histórico, com a data de origem, com `review_tasks`); (b) operação de servidor com `undo` (snapshot lógico das datas alteradas); (c) UI com pré-visualização do efeito e confirmação; (d) testes de que o histórico (`learning_evidence`, tentativas) não é alterado.
- Sensor crítico: tabelas históricas idênticas por hash antes/depois, exceto datas de vencimento declaradas.

### T-F7-02 — Onboarding e estado vazio de produção (DEBT-007) · M
- Status: `[H]` · Requisitos: R-11 (AC-11.2) · Dependências: HG-09
- Fazer: primeira abertura sem dados orienta o primeiro passo (disciplina → fonte → rascunho); testes e2e com banco vazio; fixture DEV nunca semeia produção.

### T-F7-03 — Decisão sobre FSRS baseada em dados · M
- Status: `[H]` · Requisitos: R-11 (AC-11.3), DEBT-003 · Dependências: uso real acumulado
- Fazer: relatório (somente leitura) com carga diária projetada, taxa de atraso e acertos por intervalo a partir do banco DEV/real; recomendação "implementar / adiar / parâmetros". Sem código de algoritmo nesta tarefa.

### Checkpoint F7
- Histórico do aluno intacto (hash por tabela) após cada operação nova; desfazer testado; decisões humanas registradas.

---

## F8 — Segurança e empacotamento (F-60..F-63)

### T-F8-01 — Inspeção do artefato empacotado · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `c089311` · IMPLEMENTATION_SHA `8832df7` (inspeção do pacote real com injeção RED; evidência em `validation.md`) · Requisitos: R-09 (AC-09.1, AC-09.2) · Dependências: T-F1-01 (variáveis/caminhos DEV que não podem vazar), T-F1-08 (identidade de build)
- Fazer: `npm run package:standalone` em diretório temporário e teste que varre `server-runtime`, `dist-runtime` e configuração Tauri: nenhuma ocorrência de `SMARTLEARN_DEV_PERSISTENT_SESSION`, da senha de fixture, de caminhos `SmartLearn-DevData`; confirma `NODE_ENV` não-produção só no que já é decidido (cookie sem `Secure` em loopback — registrar como decisão existente, não alterar).
- RED: injetar a variável num arquivo empacotado e ver o teste falhar.
- Gate: teste novo + `desktop-entrypoint.test.js`.

### T-F8-02 — Testes adversariais de upload de PDF · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `8b6a887` · IMPLEMENTATION_SHA `db1a59d` (21 testes adversariais de upload; bidi removido do nome; evidência em `validation.md`) · Requisitos: R-09 (AC-09.3) · Dependências: nenhuma
- Casos: PDF truncado, cabeçalho falso com tipo correto, páginas gigantes, extração lenta (timeout), texto com instruções injetadas (tratado como inerte pelo provedor FAKE), nome de arquivo hostil, duplicata entre usuários (já coberto), cota estourada (já coberto).
- Gate: `server/test/source-*.test.js` ampliado; nenhum caso exige Codex.

### T-F8-03 — Segredos e consentimento de IA · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `685cfee` · IMPLEMENTATION_SHA `af74fb5` (12 testes de segredos/consentimento; erro do provedor não vaza; evidência em `validation.md`) · Dependências: nenhuma
- Fazer: confirmar por teste que consentimento de IA e provedor só chegam por configuração explícita; que logs não imprimem texto de fonte nem credenciais; revisar `SMARTLEARN_AI_CONSENT=true` do launcher como exclusivo do DEV.

### T-F8-04 — Caminho único de abertura e retirada do release antigo · S
- Status: `[H]` · Requisitos: R-09 (AC-09.4) · Dependências: HG-04, T-F1-07, T-F1-08
- Fazer (após decisão): desinstalar `AppData\Local\SmartLearn` pelo desinstalador; atalhos já aposentados permanecem em `retired-shortcuts`; documentar `npm run dev:desktop` como a única entrada.
- Sensor: `desktop-entrypoint.test.js` confirma que o atalho "SmartLearn DEV" aponta para o launcher.

### T-F8-05 — Dependências e auditoria · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `e6d1ec1` · IMPLEMENTATION_SHA `24631c7` (npm audit 0 vulnerabilidades e gates travados; cargo audit NOT_PROVEN (decisão do usuário registrada); evidência em `validation.md`) · Dependências: nenhuma
- Fazer: `npm audit`/`cargo audit` conforme gates já existentes (`P2-3`), registrar achados e decisões; sem atualizar versões por reflexo.

### Checkpoint F8
- Inspeção do pacote verde com mutação; testes adversariais verdes; decisão do release antigo executada ou registrada.

---

## F10 — Geração segura: escopo, reuso, créditos e idiomas (R-12, R-13; decisão de produto 2026-10-04)

Objetivo: importar um livro nunca gera um livro; gerar só o que o aluno está estudando, uma unidade por vez, dentro de limites de consumo que o servidor garante; conteúdo pedagógico no idioma escolhido pelo aluno, sem perder a fonte original. Entra ANTES de estabilizar F3 (jobs). Zero chamada real a modelo em qualquer teste (INV-09); provedor simulado/espiões.

### T-F10-01 — Preferências de idioma: `uiLocale` e `generationLocale` independentes · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `860ff60` · IMPLEMENTATION_SHA `29e050c` (evidência em `validation.md`) · Requisitos: R-13 (AC-13.1, 13.2, 13.6) · Dependências: nenhuma
- Superfície: migração aditiva em `user_settings` (colunas `ui_locale`, `generation_locale`, ambas `NULL` = ainda não inicializadas; backup `pre-migrate` conforme T-F1-02), `shared/locales.js` (lista extensível BCP 47: `pt-BR`, `es`, `en`), `server/src/services/settings.js`, `server/src/routes/settings.js`.
- Fazer: ler devolve `uiLocale`/`generationLocale` efetivos SEM gravar (GET nunca escreve); `ensureGenerationLocale(db, userId, hint)` inicializa UMA vez a partir de `hint` (`uiLocale` suportado ou locale do sistema; senão `pt-BR`) e daí em diante ignora `hint`; alteração só por ação explícita (`PATCH` de cada campo separado); locale não suportado → `VALIDATION_FAILED`.
- Proof targets (RED): trocar `uiLocale` não altera `generationLocale`; o segundo `ensure` com outro `hint` não muda nada; ler não grava; locale desconhecido é recusado; dado histórico (usuário sem linha) continua válido. Sensor sobrevive à mutação "gravar `generationLocale` junto com `uiLocale`".
- Gate: `server/test/language-preferences.test.js` + `settings*.test.js` + inventário.

### T-F10-02a — Contrato de idioma na geração (domínio, sem mudar o texto do prompt) · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `099ece8` · IMPLEMENTATION_SHA `f21d691` (evidência em `validation.md`; o texto do prompt NÃO foi alterado: T-F10-02b `[H]`) · Requisitos: R-13 (AC-13.1, 13.3, 13.4, 13.5) · Dependências: T-F10-01
- Fazer: `sourceLanguage` da unidade por detecção determinística conservadora sobre o payload aprovado (`language-detect.js`; `unknown` permanece `unknown`); a geração resolve `generationLocale` das preferências (nunca da fonte nem do `uiLocale` do momento), passa `{sourceLanguage, generationLocale}` ao provedor e persiste ambos no rascunho; validação `validateDraftLanguage`: idioma detectado do conteúdo (resumo + questões) conhecido e diferente do alvo, ou `language` declarado diferente → `LANGUAGE_MISMATCH` (o rascunho NÃO é gravado como válido); detecção `unknown` sem declaração = não verificável, registrado (não promovido como verificado); o provedor simulado produz conteúdo por locale; mudar `generationLocale` não toca rascunhos/aulas existentes.
- Proof targets (RED): saída em idioma errado é recusada e nada é gravado; fonte `es` + `generationLocale=pt-BR` pede pt-BR (um inferidor "alvo = idioma da fonte" fica vermelho); mudar `uiLocale` não muda o alvo; aula aceita permanece byte-idêntica ao mudar `generationLocale`; citações continuam apontando para páginas da fonte original.
- Gate: `server/test/generation-language.test.js` + `draft-audit*.test.js` + `ai-drafts.test.js`.

### T-F10-02b — Diretiva mínima de idioma no prompt e campo `language` no contrato do modelo · S
- Status: `[H]` · Requisitos: R-13 (AC-13.3) · Dependências: T-F10-02a, HG-13
- Fazer (após autorização): bloco OUTPUT LANGUAGE no `draft-prompt.js` + campo `language` no esquema do modelo + bump de `promptVersion`, para os adaptadores Codex/Anthropic/OpenAI; SEM Prompt Lab e SEM chamada real. A prova com modelo real fica `NOT_PROVEN` até execução manual.

### T-F10-03 — Reuso, estado da unidade e política de prefetch (JIT) · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `06cf40c` · IMPLEMENTATION_SHA `91a8092` (evidência em `validation.md`; falta só a UI "Gerar de novo" em T-F10-06) · Requisitos: R-12 (AC-12.1, 12.2, 12.3) · Dependências: nenhuma
- Fazer: `createDraft` torna-se idempotente por unidade: rascunho válido e não obsoleto existente (ou aula já aceita) é devolvido SEM chamada ao provedor; nova geração exige `regenerate: true` explícito (e o mesmo caminho de limites); estado derivado da unidade (`NOT_GENERATED` | `DRAFT` | `ACCEPTED` | `STALE`; `GENERATING` entra com os jobs) exposto na lista de propostas; `planPrefetch(...)` função pura: dado a lista ordenada de unidades, a atual, estados, orçamento restante e política, devolve no máximo `policy.depth` unidades seguintes `NOT_GENERATED`, nunca a atual, nunca já geradas, vazio sem orçamento confortável; padrão `depth = 0` (JIT puro) até HG-12.
- Proof targets (RED): repetir/navegar = zero chamadas (espião de provedor); `regenerate` = exatamente uma; livro de 100+ unidades, atual = 1 → o plano tem ≤ `depth` e o resto permanece `NOT_GENERATED`; plano vazio com orçamento insuficiente; plano nunca contém unidade gerada/aceita. Um prefetch que "gera a fila toda" deixa o sensor vermelho.
- Gate: `server/test/generation-reuse.test.js`, `ai-drafts.test.js`, e2e `draft-acceptance`/`materials` (o botão "gerar" não pode regenerar sem querer).

### T-F10-04a — Livro-razão de crédito, estimativa e reserva atômica (domínio) · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `b347859` · IMPLEMENTATION_SHA `70f7e45` (estrutura; VALORES continuam HG-11; evidência em `validation.md`) · Requisitos: R-12 (AC-12.4, 12.5, 12.6) · Dependências: T-F1-02 (backup pre-migrate), HG-11 (VALORES; a estrutura não espera)
- Superfície: migração aditiva (reservas/consumo por usuário e período), `server/src/services/generation-budget.js`, configuração dos limites (`null` = sem limite NAQUELA dimensão, registrado como decisão pendente; nunca um número inventado).
- Fazer: unidade de custo provider-agnóstica (tokens estimados a partir dos caracteres do payload aprovado + teto de saída); `reserve` atômico em transação (verifica máximo por job, restante semanal e mensal contando reservas ativas + consumo; grava a reserva); `settle` reconcilia com o consumo medido (ou marca `ESTIMATED` quando o provedor não mede); `release` devolve sem débito quando falha antes de qualquer chamada externa.
- Proof targets (RED): N pedidos concorrentes com saldo para 1 → exatamente 1 reserva e N−1 `BUDGET_EXCEEDED` (a corrida passa por `await`; um check-then-write fora da transação fica vermelho); saldo insuficiente semanal/mensal/por job → recusa ANTES da chamada, zero chamadas, nenhuma reserva residual; falha pré-chamada não debita; reconciliação sobe/desce o consumo; batch de 20 pedidos sequenciais continua limitado pelo período.
- Gate: `server/test/generation-budget.test.js` + inventário + migração (`migrations*.test.js`).

### T-F10-04b — Integrar escopo + orçamento + idioma no caminho de geração · M
- Status: `[✓]` 2026-10-05 · BASE_SHA `40255d6` · IMPLEMENTATION_SHA `e4e482c` (evidência em `validation.md`) · Requisitos: R-12, R-13 · Dependências: T-F10-02a, T-F10-03, T-F10-04a
- Fazer: `createDraft` percorre, nesta ordem: reuso (T-F10-03) → escopo aprovado e tamanho (já existente: `SCOPE_VIOLATION`/`INPUT_TOO_LARGE`) → `generationLocale` → estimativa → reserva → provedor → validação de idioma/esquema → `settle`/`release`; erro após o envio debita a estimativa (conservador) e fica registrado; nenhum caminho chama o provedor sem passar por todos os passos.
- Proof targets (RED): espião de provedor prova a ordem e a contagem de chamadas em cada recusa; falha de idioma/esquema não deixa reserva ativa; "caminho que pula a reserva" fica vermelho (teste de inventário de chamadas ao provedor).
- Gate: `server/test/generation-pipeline-guards.test.js` + `ai-drafts.test.js` + `draft-input-binding.test.js`.

### T-F10-05 — "Importar ≠ gerar": guardas de escopo na fronteira · S
- Status: `[✓]` 2026-10-05 · BASE_SHA `742ceb8` · IMPLEMENTATION_SHA `8b09e24` (só testes: as guardas já existiam; evidência em `validation.md`) · Requisitos: R-12 (AC-12.1, 12.6), INV-13 · Dependências: nenhuma
- Fazer: testes de domínio/HTTP: (a) importar e estruturar um livro de ~300 páginas (fixture) = zero chamadas ao provedor e zero reservas; (b) unidade acima do limite → `INPUT_TOO_LARGE` com orientação, sem chamada nem débito; (c) o corpo de `POST /proposals/:id/drafts` aceita só campos conhecidos (um campo "gere tudo"/lista de propostas é recusado); (d) inventário de rotas: o único caminho até o provedor é a geração por UMA proposta (futuro job herda a mesma guarda).
- Gate: `server/test/generation-scope-guards.test.js`.

### T-F10-06 — UI: idioma da interface × idioma do conteúdo, estado da unidade e consumo · M
- Status: `[ ]` · Requisitos: R-13 (AC-13.6), R-12 · Dependências: T-F10-01, T-F10-03, T-F10-04b, HG-13 (alcance de `uiLocale` es/en)
- Fazer: em Configurações, dois controles separados e rotulados ("Idioma da interface", "Idioma do conteúdo gerado") e texto que explica a diferença; catálogos es/en para as chaves existentes com fallback pt-BR; no fluxo de gerar: mostrar idioma alvo, estado da unidade (`NOT_GENERATED`/`DRAFT`/`ACCEPTED`) e recusa clara com orientação quando o limite impede; "Gerar de novo" passa `regenerate` e mostra o custo; nenhuma ação em massa.
- Gate: e2e responsivo + axe; mudar `uiLocale` muda a interface e mantém o idioma do conteúdo (cenário 5).

## F9 — Integração e entrega (F-50) — por último, sempre com decisão humana

### T-F9-01 — Mapa de integração e ensaio sem publicar · M
- Status: `[H]` · Requisitos: R-10 (AC-10.1) · Dependências: HG-05; cada fase F0..F8 com checkpoint `[✓]` ou com seus `[H]` registrados em `validation.md`
- Fazer: inventário dos 53+ commits locais agrupados por fase; relação com `claude/content-quality` e `tmp/integrate-cq-into-v1` (merge temporário marcado "not for push"); ensaio de integração em worktree descartável com gate completo; lista de conflitos previstos.
- Saída: proposta de série de PRs (um por fase), com descrição e evidência por PR. Nada é enviado.

### T-F9-02 — `validation.md` por fase e validador de estado · S
- Status: `[ ]` · Requisitos: R-10 (AC-10.2) · Dependências: ao menos uma tarefa `[✓]` na fase que a seção de `validation.md` descreve (executa-se por fase, não no fim)
- Fazer: `validation.md` com evidência-ou-zero por critério; rodar `scripts/validate_state.py` da skill quando aplicável.

### T-F9-03 — Entrega (push/merge/deploy) · —
- Status: `[H]` · HG-10
- Só por ordem explícita, uma ação por vez, com checklist de pré-implantação (CI, aprovações, plano de reversão, janela). Fora do alcance autônomo.

---

## Conflitos de superfície (evitar trabalho paralelo na mesma região)

| Superfície | Tarefas que a tocam | Regra |
|---|---|---|
| `server/src/services/generated-drafts.js` | T-F2-01..06, T-F3-02 | sequenciar F2 antes de F3; um autor por vez |
| `src/materials-ui.js`, `src/source-proposals-ui.js`, `src/lesson-editor-ui.js` | T-F3-04, T-F4-02..05 | F4 antes de T-F3-04 ou combinar em uma branch |
| `scripts/launch-desktop-dev.ps1` | T-F1-01/02/04/07/08, T-F8-04 | uma tarefa por vez; teste de entrypoint sempre verde |
| `src-tauri/src/lib.rs` | T-F1-04, T-F1-08 | rodar `cargo test --lib` a cada tarefa |
| `playwright.config.js` | T-F6-02/03 | antes de F2 se possível, para reduzir o custo de gate |
| `server/migrations/` | T-F3-01 (e futuras) | só adição; backup pre-migrate obrigatório |

## Registro de riscos (probabilidade × impacto, mitigação, sinal de alarme)

| ID | Risco | P | I | Mitigação | Sinal de alarme |
|---|---|---|---|---|---|
| RK-01 | Migração 031 corrompe/altera banco humano | B | A | backup `pre-migrate` verificado (T-F1-02), migração aditiva, teste em cópia | `integrity_check` ≠ ok ou contagens históricas mudam |
| RK-02 | Job Object quebra em ambiente que já roda dentro de job | M | M | degradação com log, teste manual, fallback de limpeza do launcher | órfãos após fechamento forçado |
| RK-03 | Remoção do `PUT` quebra cliente desconhecido | B | M | busca de uso real + e2e; deprecar com erro orientador antes de remover | falha em e2e de edição |
| RK-04 | Sensor de qualificadores gera parede de falsos positivos | M | M | medir falso positivo no rascunho real; limite de severidade; humano revisa amostra | Revisão volta a exceder o limite visual |
| RK-05 | Custo/tempo do Codex no lab | M | M | HG-07, tetos, jobs canceláveis | chamadas acima do orçamento |
| RK-06 | e2e flaky após partição | M | M | 3 execuções consecutivas, classificar flakes, sem retry silencioso | falha intermitente |
| RK-07 | Documentação volta a divergir do Git | A | M | reconciliar a cada checkpoint de fase, validador de estado | STATE cita HEAD/contagens que o Git desmente |
| RK-08 | Integração (53 commits + content-quality) gera conflito pesado | M | A | ensaio em worktree descartável (T-F9-01) cedo, PRs por fase | conflitos em `app.js`/`styles.css` |
| RK-09 | Operação de limpeza apaga algo útil | B | A | allowlist fixa, dry-run, testes de proteção, relatório | item inesperado no dry-run |
| RK-10 | Falso verde por teste que não discrimina | M | A | mutação (T-F6-04), verificador independente, validação humana | mutação sobrevive |

## Métricas de acompanhamento

- Testes: contagem por camada (servidor/frontend/cargo/e2e) nunca cai sem justificativa registrada; tempo do e2e completo; flakes classificados por causa.
- Dados: `integrity_check`, `foreign_key_check`, hashes de tabelas históricas por checkpoint; idade do último snapshot.
- Operação: processos órfãos encontrados após fechamento (meta 0); incidentes de "build errada aberta" (meta 0).
- Conteúdo (F5): erros críticos por 100 questões avaliadas por humano; fatos sem suporte; qualificadores perdidos; taxa de falso positivo dos sensores; questões por página.
- Produto: tempo até o primeiro rascunho útil; atrasos médios; rascunhos abandonados.
- Processo: desvios de escopo detectados em revisão de diff; retrabalho por tarefa (reaberturas).

## Definição de pronto por fase (resumo)

Uma fase só fecha com: todas as tarefas `[✓]` com `IMPLEMENTATION_SHA`; gate completo verde reproduzido; sensores de não-regressão do baseline verdes; mutação aplicável executada; `validation.md` da fase com evidência por critério (ou `NOT_PROVEN` explícito); verificador independente quando marcado; documentação reconciliada; decisões humanas necessárias registradas. Contradição entre requisito, implementação, comportamento real, dados, testes e estado registrado ⇒ `NOT_DONE`.

## Próxima ação exata

1. Humano responde HG-02, HG-03 e HG-05 (destravam F0-05, F1-05, F2-03) — as demais decisões podem esperar suas fases.
2. Executar T-F0-01 (Memento do baseline) e T-F0-04 (ignore de artefatos), as duas de menor risco, e fechar o checkpoint F0.
3. Iniciar T-F1-01 (lock do Desktop) e T-F1-04 (Job Object) em paralelo controlado; em seguida T-F1-02.
4. Em paralelo, T-F6-01..03 para a infraestrutura de teste antes de abrir F2.

## Achados abertos (registro vivo; a causa/estado de cada um está em `validation.md`)

- OPEN-01 · sintoma intermitente `#account-show-register` oculto (3 ocorrências, causa NÃO provada) · tarefa: T-F6-08 · evidência: `validation.md` "T-F6-08"
- OPEN-02 · `test/test-live.test.js:99` espera `playwright test`, o runner é `node scripts/e2e.mjs` (raiz 478/479) · tarefa: T-F6-09
- OPEN-03 · 1 falha de servidor em 1 de 5 execuções de `npm --prefix server test`, nome não capturado, não reproduziu em 4 repetições · sem tarefa: reabrir só se reaparecer · evidência: `validation.md` "T-F5-08"
- OPEN-04 · `reconcileOrphans` ligado em `server/src/main.js` sem teste da ligação · sem tarefa (risco baixo) · evidência: `validation.md` "T-F10-04b"
- OPEN-05 · consumo de crédito sempre `ESTIMATED` (nenhum provedor reporta custo) · depende de HG-11
- OPEN-06 · prévia do aceite (T-F2-05) sem avaliação humana e sem axe do painel aberto · UAT em T-F4-01 · evidência: `validation.md` "T-F2-05"
- OPEN-07 · fonte Costanzo já gravada no banco DEV NÃO foi reextraída após T-F5-08 (ordem antiga de colunas) · decisão separada com backup (INV-06/07) · evidência: `validation.md` "T-F5-08"
- OPEN-08 · `T-F1-05` (HG-03) e provas manuais do Desktop do checkpoint F1 · S8/T-F1-09
