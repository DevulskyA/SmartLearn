# Ledger de tarefas — Roadmap de endurecimento V1

Spec: `spec.md` (mesma pasta). Status inicial de todas as tarefas: `[ ]` PLANEJADA. Nada aqui foi executado; este arquivo é um plano.
Baseline de referência: HEAD `620307d`; servidor 773/773; frontend 453/453; cargo 30/30; e2e 201 passaram / 2 skipped; lint 0 erros; `CODEX_CALL_COUNT=0`.

Legenda do status: `[ ]` planejada · `[>]` em andamento · `[✓]` feita com evidência · `[!]` bloqueada · `[H]` depende de decisão humana.
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
npm --prefix server test ; npm test ; npm run lint ; npm run test:inventory ; (cd src-tauri && cargo test --lib) ; npx playwright test
```
(e2e exige as portas livres e o Desktop DEV fechado até T-F6-02 tornar isso desnecessário.)

---

## Visão geral das fases e dependências

```
F0 Reconciliação e higiene de estado
 └─ F1 Integridade do datastore e ciclo de vida de processos
     ├─ F2 Contrato da aula (identidade, proveniência, auditoria versionada)
     │   └─ F3 Jobs de geração observáveis
     │       └─ F5 Qualidade de conteúdo médico + Prompt Lab   (HG-06/07/08)
     ├─ F4 UI/UX da aula, Materiais e acessibilidade           (validação humana)
     └─ F6 Plataforma de teste (pode andar em paralelo com F2–F4)
F7 Produto de estudo (HG-09) — após F4
F8 Segurança e empacotamento — após F1; antes de F9
F9 Integração e entrega (HG-05/10) — por último
```
Caminho crítico: F0 → F1 → F2 → F3 → F5 → F9. F4, F6 e F8 são paralelizáveis com ressalva de não mexer nas mesmas superfícies ao mesmo tempo (ver "conflitos de superfície" no fim).

Ordem recomendada de execução: F0, F1, F6(T-F6-01..03), F2, F4, F3, F8, F5, F7, F9.

---

## F0 — Reconciliação e higiene de estado (fecha achados F-50..F-54, F-51)

Objetivo: partir de um estado em que Git, documentação e árvores de trabalho dizem a mesma coisa; sem isso, medir o resto não tem valor.

### T-F0-01 — Congelar o baseline e registrar o Memento · S
- Status: `[✓]` 2026-10-04 (baseline reproduzido por execução e registrado em `validation.md`; Memento = `.specs/STATE.md` de 36+ linhas; achado: 1 teste de isolamento vermelho desde `8fb8e9f`, corrigido em `11372c1`) · Requisitos: R-08 · Dependências: nenhuma
- Superfície: `.specs/STATE.md` (seção Handoff), `.specs/features/hardening-roadmap-v1/validation.md` (novo, só baseline).
- Fazer: registrar HEAD, contagens de teste, banco canônico, esquema v30, versão `0.1.0`, hashes de backup (`SmartLearn-db-backups\p0-*`), `NOT_PROVEN` vigentes.
- Sensores: nenhum de código; verificação cruzada manual contra Git (`git rev-parse`, `git status`) e `last-launch.json`.
- Gate: `git diff --stat` só em `.specs/`; números do baseline reproduzidos por execução (não copiados).
- Done quando: Memento cabe em ≤ 60 linhas e um leitor novo reconstrói o estado sem o chat.

### T-F0-02 — Compactar `STATE.md` (~2,8 mil linhas) sem perder decisões canônicas · M
- Status: `[✓]` 2026-10-04 (STATE 2815 → 36 linhas; arquivo morto `.specs/archive/STATE-ate-2026-10-04.md`, ASCII no nome, byte a byte igual ao HEAD anterior, sha256 f99b806e…; PREMISSA CORRIGIDA: não existem IDs `DEC-/AD-/INV-` no STATE, então o sensor compara TODOS os tokens `MAIÚSCULAS_COM-SEPARADOR`: `node scripts/check-state-ids.mjs <rev>` = 364 antigos, 0 ausentes em STATE+arquivo; teste `test/check-state-ids.test.js`) · Requisitos: R-08 · Dependências: T-F0-01
- Superfície: `.specs/STATE.md`; histórico antigo movido para `.specs/archive/STATE-até-2026-10-04.md` (cópia íntegra, nada apagado).
- Fazer: manter no STATE só decisões `CANONICAL` (AD/DEC), invariantes e o handoff; o restante vira arquivo morto referenciado.
- Sensor: script que lista IDs de decisão (`DEC-*`, `AD-*`, `INV-*`) antes/depois e falha se algum sumir.
- Gate: diff de IDs vazio; `grep` dos IDs no arquivo morto confirma preservação.
- Risco: perda de decisão. Mitigação: arquivo morto íntegro e comparação por ID.

### T-F0-03 — Reconciliar painel mestre e planos de track · S
- Status: `[✓]` 2026-10-04 (track `conductor/tracks/hardening-roadmap-v1/plan.md` criado e ativo; painel mestre de 07/09 marcado como histórico; `agent-tasklist.mjs` regenerou o bloco ACTIVE-TRACK e os painéis; EXECUTION.md reconciliado: provedor ativo CODEX, track ativo, VALID-4/5) · Requisitos: R-08 · Dependências: T-F0-01
- Superfície: `conductor/tracks.md` (bloco não gerado), `conductor/tracks/v1-validation/plan.md`, criação de `conductor/tracks/hardening-roadmap-v1/plan.md` apontando para esta pasta.
- Fazer: marcar o painel de 07/09 como histórico apontando para o STATE; incluir VALID-4/5/8 como `NOT_PROVEN` com ponteiro para F5; gerar o bloco ACTIVE-TRACK com `node scripts/agent-tasklist.mjs`.
- Gate: `node scripts/agent-tasklist.mjs` termina sem erro e o bloco gerado reflete o track novo.

### T-F0-04 — Regra de ignore para artefatos regeneráveis e decisão sobre não rastreados · S
- Status: `[✓]` 2026-10-04 · BASE_SHA `7c6ee21`/`d562dc8` · Requisitos: R-08 · Dependências: nenhuma
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
- Status: `[✓]` 2026-10-04 · BASE_SHA `b57ebf9` (backend real segura o lock via `server/src/dev-datastore.js`, chamado por `server/src/main.js` quando `SMARTLEARN_DB_PATH` é o datastore DEV; `dev-remote` só confere; criação exclusiva `wx`; RED→GREEN em `server/test/dev-lock.test.js` com 2 backends reais; prova manual no Desktop real pendente para o checkpoint F1, pois o Desktop aberto agora roda código anterior) · Requisitos: R-01 (AC-01.1) · Dependências: T-F0-01
- Superfície: `scripts/dev-data.mjs` (reuso de `acquireDevLock`), `scripts/launch-desktop-dev.ps1`, `server/src/main.js` (aquisição quando `SMARTLEARN_DB_PATH` aponta para o datastore DEV), testes.
- Decisão de desenho: o backend Node (processo filho do Desktop) adquire o lock com o PID do próprio backend e a raiz da worktree; o launcher continua apenas conferindo. Assim o lock vive exatamente enquanto o escritor vive, mesmo com fechamento forçado do Rust.
- RED: teste que sobe dois backends no mesmo banco temporário e exige recusa do segundo com mensagem contendo pid e raiz do detentor.
- Sensores: lock de processo morto é retomado; lock liberado no fechamento gracioso; teste do launcher confirma que a mensagem de recusa existe.
- Gate: `node --test test/dev-data.test.js server/test/...` + `test/desktop-entrypoint.test.js`; prova manual: abrir Desktop, tentar `npm run dev:remote` → recusado com nome do detentor.
- Risco: lock órfão impedindo abrir. Mitigação: verificação de vida do PID e mensagem com instrução de recuperação.

### T-F1-02 — Snapshot diário e antes de migração no caminho do Desktop · M
- Status: `[✓]` 2026-10-04 · BASE_SHA `833762f` (snapshot consistente por `VACUUM INTO` — não cópia crua de db+wal+shm —, verificado por `integrity_check`/`foreign_key_check`/contagens/sha256 + manifesto; diário 1x/dia e `pre-migrate-v<N>` ANTES da migração no `server/src/main.js` (falha de backup aborta a migração, banco intacto); launcher imprime `Snapshot: <caminho>` e para se não verificar; retenção 7 dias sem nunca deixar zero snapshot válido, `pre-migrate-*` nunca podados; testes `dev-snapshot`, `dev-datastore-startup` com backend real, `desktop-entrypoint`) · Requisitos: R-01 (AC-01.2, AC-01.3) · Dependências: T-F1-01
- Superfície: `scripts/launch-desktop-dev.ps1` (chamada), `scripts/dev-data.mjs` (`snapshotDevDbIfNeeded` já existe), CLI pequeno `scripts/dev-snapshot.mjs`, retenção.
- Fazer: antes de abrir o app, snapshot do dia de banco+WAL+SHM em `SmartLearn-DevData\snapshots\<data>`; antes de qualquer migração pendente (comparar `max(version)` com migrações no disco), snapshot nomeado `pre-migrate-v<N>` com checksum e verificação de leitura; retenção: 7 dias + último `pre-migrate` de cada versão.
- RED: teste com banco temporário em v29 e migrações até v30: o snapshot `pre-migrate-v29` existe, tem checksum igual e `integrity_check ok` ANTES de a migração rodar; falha de snapshot aborta a migração.
- Sensores: retenção nunca apaga o último snapshot válido; snapshot não roda se não há dado real (tamanho 0).
- Gate: testes novos + `test/dev-data.test.js`; verificação manual de que o launcher mostra `Snapshot: <caminho>`.

### T-F1-03 — Ensaio de restauração (restore drill) documentado e automatizado · M
- Status: `[✓]` 2026-10-04 (`server/src/dev-restore.js` + `scripts/dev-restore.mjs`; nunca escreve no datastore vivo; ensaio REAL em CÓPIA temporária de `SmartLearn-db-backupsp0-devdata-20261004-005048` (v29, 10 unidades, 160 revisões): 7/7 PASS. INCIDENTE: uma tentativa anterior abriu o backup original em somente-leitura e recriou seu `-shm` volátil; `.db` e `-wal` seguem com o hash de `SHA256.txt` — daqui em diante só em cópias) · Requisitos: R-01 (AC-01.4) · Dependências: T-F1-02
- Superfície: `scripts/dev-restore.mjs` (novo, sempre para um DESTINO diferente do banco vivo), teste.
- Fazer: restaurar um snapshot em diretório temporário, abrir com o servidor, rodar `integrity_check`, `foreign_key_check` e comparar contagens com o manifesto do snapshot.
- Regra: o script nunca sobrescreve o banco canônico; trocar o canônico exige comando separado, confirmação e backup do atual (fora do escopo automático).
- Gate: teste de ponta a ponta com banco sintético; ensaio real sobre `SmartLearn-db-backups\p0-devdata-*` registrado no `validation.md`.

### T-F1-04 — Ciclo de vida de processos: Job Object e limpeza do launcher · M
- Status: `[ ]` · Requisitos: R-02 (AC-02.1, AC-02.2) · Dependências: nenhuma (paralelizável com T-F1-01)
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
- Status: `[ ]` · Requisitos: R-01/INV-08 · Dependências: nenhuma
- Superfície: `server/src/repositories/sessions.js`, rotina na subida do servidor, testes.
- Fazer: remover linhas revogadas há > 30 dias e expiradas há > 30 dias; sessões ativas (inclusive as DEV de ~10 anos) nunca são tocadas; produção mantém as mesmas durações.
- RED: sessão ativa DEV intacta; sessão expirada antiga removida; contagem antes/depois registrada.
- Gate: `server/test/*session*`; `PRODUCTION_AUTH_UNCHANGED` revalidado (testes de auth existentes).

### T-F1-07 — Critério de build por conteúdo, não por commit · S
- Status: `[ ]` · Requisitos: R-02 · Dependências: nenhuma
- Superfície: `scripts/build-identity.mjs`, `scripts/launch-desktop-dev.ps1`, `vite.config.js`.
- Fazer: além do SHA, calcular `inputsHash` (hash de `src/`, `index.html`, `shared/`, `server/src`, `server/migrations`, `package.json`) embutido no `build-info.json`; o launcher só rebuilda se `inputsHash` mudar, mas o SHA exibido continua sendo o do HEAD em uso (commit só de documentação não rebuilda e continua identificável).
- Cuidado: a identidade mostrada deve continuar verdadeira — documentar que "build = conteúdo X, aberto no commit Y". Não exibir um SHA que não corresponda ao conteúdo.
- RED: teste que alterna um commit só de `.specs/` e prova que `distIsCurrent` permanece verdadeiro; alterar `src/` o torna falso.
- Gate: `test/version-identity.test.js`, `test/desktop-entrypoint.test.js`.

### T-F1-08 — Versão na barra de título e comando de diagnóstico · S
- Status: `[ ]` · Requisitos: R-09/F-08 · Dependências: T-F1-07
- Superfície: `src-tauri/src/lib.rs` (título da janela via env `SMARTLEARN_WINDOW_TITLE` definido pelo launcher), `src/build-identity-ui.js` (botão "Copiar diagnóstico").
- Fazer: título `SmartLearn DEV · v0.1.0 · <commit>` só no DEV; "Copiar diagnóstico" copia versão, canal, build, esquema, caminho do banco e contagens (sem dados pessoais).
- Gate: teste Rust do título; teste de frontend do conteúdo copiado; verificação via CDP do título real.

### Checkpoint F1
- Prova composta: abrir Desktop → segundo escritor recusado → fechar forçado → nenhum órfão → reabrir → snapshot do dia existe → restore drill passa → sessões purgadas sem tocar ativas.
- Sensor de não-regressão: `RESTART_PERSISTENCE`, `CANONICAL_DEV_DB_UNCHANGED` (tabelas históricas por hash), `DEV_SESSION_PERSISTS_AFTER_RESTART`.
- Gate completo verde; `validation.md` da fase com evidência por critério.

---

## F2 — Contrato da aula: identidade, proveniência e auditoria versionada (F-10, F-11, F-18, F-19, F-20)

Objetivo: remover as últimas ambiguidades de identidade e preparar a medição sem violar a decisão "abrir não recalcula".

### T-F2-01 — Substituir a edição posicional da lista inteira por operações por id · M
- Status: `[ ]` · Requisitos: R-03 (AC-03.1) · Dependências: F1 fechada
- Superfície: `server/src/services/generated-drafts.js` (`reviseDraft`, `mergeIdentity`), `server/src/routes/generated-drafts.js` (`PUT /drafts/:id`), `src/draft-review-ui.js` (função `reviseDraft` do cliente, hoje sem uso na UI atual), testes.
- Pergunta do escudo: "se reordenar trocar status entre conteúdos, o que fica vermelho?" Hoje: nada. Criar sensor primeiro.
- RED: (a) reordenar 4 questões com Q2 REJECTED preserva REJECTED na MESMA questão de conteúdo; (b) enviar ids desconhecidos é erro; (c) tamanho diferente com REJECTED continua protegido (ver teste atual); (d) o cliente legado sem ids é recusado com orientação.
- Desenho: aceitar `questions[]` com `id` obrigatório para as existentes; novas sem `id` recebem id novo; ausentes nunca são apagadas implicitamente (apagar é `DELETE` explícito). Alternativa mais simples e preferida se nenhum cliente usa a rota: remover `PUT` e manter `PATCH`/`DELETE`/`POST` por entidade. Verificar uso real (busca de chamadas, e2e) antes de decidir.
- Gate: `server/test/lesson-granular-edit.test.js` + novos; e2e `lesson-editor.spec.js`, `draft-acceptance.spec.js`.

### T-F2-02 — Adicionar questão e reordenar como operações próprias · M
- Status: `[ ]` · Requisitos: R-03 · Dependências: T-F2-01
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
- Status: `[ ]` · Requisitos: R-03 (AC-03.2) · Dependências: T-F2-01
- Fazer: `origin`, `generatedBy` (`provider`, `modelVersion`, `promptVersion`), `editedAt`; edição humana de campo muda `origin` para `HUMAN_EDITED` sem apagar `generatedBy`; migrar rascunhos antigos por normalização na leitura (sem gravar), com `origin=GENERATED` presumido e marca `legacy`.
- RED: round-trip; rascunho legado lido duas vezes dá a mesma proveniência; aceitar não depende de `origin`.
- Gate: servidor + e2e; verificação no rascunho real do Costanzo (somente leitura).
- Uso futuro: o Prompt Lab mede apenas questões `GENERATED`.

### T-F2-05 — Pré-visualização do aceite · S
- Status: `[ ]` · Requisitos: R-03 (AC-03.4), F-20 · Dependências: T-F2-01
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
- Status: `[ ]` · Requisitos: R-04 (AC-04.1) · Dependências: F2 fechada
- Superfície: nova migração `031-generation-jobs.sql` (somente adição), `server/src/services/generation-jobs.js`, rotas `POST/GET /v1/generation-jobs`.
- Esquema: `id, user_id, proposal_id, state, phase, provider, started_at, last_activity_at, finished_at, error_code, error_message, draft_id, cancel_requested_at`.
- RED: transições válidas e inválidas; um job por proposta ativa (idempotência: segundo `POST` retorna o job existente); recuperação na subida do servidor marca jobs `CALLING_PROVIDER` órfãos como `FAILED(SERVER_RESTARTED)`.
- Segurança de dados: migração aditiva, backup `pre-migrate` (T-F1-02) obrigatório.
- Gate: testes de migração (`migrations*.test.js` + novo), unidade, e `schema checksum` do runner de migrações.

### T-F3-02 — Execução em segundo plano com limite duro e cancelamento · M
- Status: `[ ]` · Requisitos: R-04 (AC-04.1, AC-04.4) · Dependências: T-F3-01, T-F1-04
- Fazer: o job roda fora do ciclo da requisição; limite duro configurável (padrão acima do atual de 20 min para evitar regressão); `POST /generation-jobs/:id/cancel` encerra a árvore de processos do provedor e marca `CANCELLED`; falha/cancelamento não deixam rascunho parcial aceitável.
- RED (provedor FAKE controlável): cancelar durante a chamada termina o processo filho; timeout vira `FAILED(TIMEOUT)`; nenhum rascunho criado em falha.
- Gate: `ai-drafts.test.js`, `codex-provider.test.js` (inalterado), testes novos; zero chamada real.

### T-F3-03 — Sinal de vida do provedor e política de "parada" · M
- Status: `[ ]` · Requisitos: R-04 (AC-04.2) · Dependências: T-F3-02
- Fazer: além dos eventos de `codex exec --json`, amostrar CPU/handles do processo filho; `lastActivityAt` atualiza com qualquer sinal; só marcar `STALLED` (aviso, não falha) após silêncio total generoso; o limite duro continua sendo a única condição de falha por tempo.
- RED (provedor FAKE que fica 5 min em silêncio com CPU ativa): não vira STALLED; FAKE sem CPU e sem saída vira STALLED.
- Gate: testes com relógio injetado; sem Codex.
- Observação de evidência: a premissa "raciocínio longo é silencioso" vem do probe documentado no checkpoint; reconfirmar em T-F5-02 com medição real autorizada, não suposição.

### T-F3-04 — UI de geração: fase real, sair e voltar · M
- Status: `[ ]` · Requisitos: R-04 (AC-04.3), F-14 · Dependências: T-F3-02
- Superfície: `src/materials-ui.js`, `src/source-proposals-ui.js`, estilos.
- Fazer: texto "pode levar alguns minutos"; fase atual e tempo; "Continuar em segundo plano" volta à lista; item da lista mostra "Gerando…/Pronto/Falhou" e abre o rascunho quando pronto; "Cancelar" com confirmação.
- RED (e2e com FAKE lento): sair da tela, voltar, ver "Gerando" e depois o rascunho pronto; cancelar libera a unidade.
- Gate: `e2e/lesson-editor.spec.js` + novo `generation-jobs.spec.js`; axe nas telas novas.

### T-F3-05 — Explicação obrigatória por validação · S
- Status: `[ ]` · Requisitos: F-15 · Dependências: nenhuma de F3
- Fazer: achado determinístico `EXPLANATION_MISSING` para toda questão sem "Por quê" (não só respostas curtas); mostrado na Revisão, não bloqueia aceite.
- RED: questão sem explicação gera o achado; com explicação não.
- Gate: `draft-audit-questions.test.js`.

### Checkpoint F3
- Prova composta com FAKE: gerar, sair, voltar, cancelar, falhar, reiniciar o servidor no meio (job marcado `FAILED(SERVER_RESTARTED)`), sem órfãos.
- Mutação: remover a recuperação de órfãos na subida deve falhar o teste; remover a morte da árvore no cancelamento deve falhar o teste do processo filho.
- Gate completo + verificador independente (concorrência/processos).

---

## F4 — UI/UX da aula, Materiais e acessibilidade (F-30..F-36)

Objetivo: o produto precisa ser claro e confortável para uma pessoa, não só "funcionar". Esta fase depende de olhos humanos.

### T-F4-01 — Roteiro de validação visual humana e registro · M
- Status: `[H]` · Requisitos: R-06 (AC-06.1) · Dependências: F1 fechada (banco/identidade estáveis)
- Fazer: preparar roteiro curto (≤ 15 min) em `.specs/features/hardening-roadmap-v1/uat-visual.md`: abrir `npm run dev:desktop`; Hoje/Plano/Estatísticas/Disciplinas com o histórico; Materiais → Rascunhos em andamento → editor; editar Q, salvar, recarregar; Revisão; "Sobre". Cada passo com resultado esperado e campo para "claro? confortável? o que incomodou?".
- Resultado: o humano devolve achados; cada um vira F-xx priorizado. `VISUAL_VALIDATION` só vira PASS por declaração humana ou por checagem de instrumento equivalente declarada.
- Gate: arquivo do roteiro revisado; resultado registrado.

### T-F4-02 — Hierarquia da Revisão e ruído de achados · M
- Status: `[ ]` · Requisitos: R-06 (AC-06.4), F-31 · Dependências: T-F2-03
- Fazer: ordenar por severidade, colapsar BAIXA, mostrar contagem por tipo no topo, "Sinalizada" só para severidade ≥ MÉDIA; texto explica o que olhar.
- RED (e2e com fixture de 67 achados): primeiros itens são os mais severos; a tela inicial não excede N linhas visíveis sem rolagem.
- Gate: `lesson-view-model.test.js` ampliado + e2e.

### T-F4-03 — Posição de "Rascunhos em andamento" e confirmação de salvar no índice · S
- Status: `[ ]` · Requisitos: R-06 (AC-06.3), F-32, F-33 · Dependências: nenhuma
- Fazer: mover o bloco para antes da busca quando existir; "Salvar título" mostra "Título salvo" em região `role=status` e mantém foco.
- Gate: `source-proposals.spec.js`, `materials-a11y.spec.js` + novo caso.

### T-F4-04 — Editor da aula em telas estreitas · M
- Status: `[ ]` · Requisitos: R-06 (AC-06.2), F-34 · Dependências: nenhuma
- Fazer: abaixo de 720 px, lista e editor empilham com navegação "Voltar à lista"; sem rolagem horizontal; alvos de toque ≥ 44 px.
- RED: e2e em 360×800 e 768×1024 verificando ausência de overflow horizontal e operabilidade completa.
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
- Status: `[ ]` · Requisitos: F-36 · Dependências: nenhuma
- Fazer: varredura de textos visíveis fora dos arquivos de locale; teste que falha com padrões de mojibake (`Ã§`, `Ã£`, `�`); mensagens de vazio/erro/carregando padronizadas. Seguir a skill `codex-portuguese-i18n-repair` se aparecer corrupção.
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
- Status: `[ ]` · Requisitos: R-05 (AC-05.3) · Dependências: T-F5-03 (para exemplos reais de falha)
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
- Status: `[ ]` · Requisitos: R-05 (fidelidade de escopo) · Dependências: nenhuma (sem Codex, sem HG; pode ser antecipada para logo após F6)
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
- Status: `[ ]` · Requisitos: R-07 (AC-07.1) · Dependências: nenhuma
- Fazer: tag `@materials` nos testes de Materiais/Fonte/Rascunho/Editor (`lesson-editor`, `draft-acceptance`, `source-proposals`, `source-reupload`, `large-pdf`, `large-draft-review`, `materials-a11y`, `keyboard-study-materials`, ...); `npm run test:e2e:materials`; contagem registrada em `TEST_COVERAGE_MATRIX.md`; o "45/45" histórico passa a ser reproduzível ou formalmente substituído.
- Gate: comando roda e a contagem coincide com a matriz; inventário de testes PASS.

### T-F6-02 — Portas dinâmicas e saída única por execução · M
- Status: `[ ]` · Requisitos: R-02 (AC-02.3), F-41 · Dependências: nenhuma
- Fazer: Playwright escolhe porta livre (config com função), `outputDir` com sufixo por execução; specs que fixam portas de servidor (`139xx`) passam a alocar livre; falha limpa quando faltar porta.
- RED: duas execuções simultâneas da mesma suíte não colidem.
- Gate: duas execuções paralelas curtas verdes; e2e completo verde.

### T-F6-03 — Partição e tempo-alvo do e2e completo · M
- Status: `[ ]` · Requisitos: R-07 (AC-07.2), F-42 · Dependências: T-F6-02
- Fazer: separar specs independentes em grupos (`--shard` ou projetos), mantendo a ordem onde há dependência; meta ≤ 8 min com 2 workers sem aumentar flakes (medir 3 execuções consecutivas).
- Gate: 3 execuções consecutivas sem falha; relatório de tempos.

### T-F6-04 — Comando de discriminação (mutação) repetível · M
- Status: `[ ]` · Requisitos: R-07 (AC-07.3), F-45 · Dependências: nenhuma
- Fazer: `scripts/mutation-check.mjs` que, em worktree temporária (nunca na árvore real), aplica mutações de comportamento listadas (posicional em `mergeIdentity`; ignorar `devPersistent`; remover filtro de REJECTED no aceite; permitir apagar fora da allowlist no sanitizador; não verificar checksum no import) e confirma que o conjunto relevante de testes falha.
- Gate: cada mutação mata ≥ 1 teste; relatório gerado; script recusa rodar fora de worktree descartável.

### T-F6-05 — Avisos de lint e do Rust · S
- Status: `[ ]` · Requisitos: R-07 (AC-07.4), F-43 · Dependências: nenhuma
- Fazer: corrigir ou justificar os 23 avisos (variáveis não usadas, diretiva eslint-disable sem efeito) e o aviso de linker; `npm run lint` passa a falhar com avisos NOVOS (`--max-warnings` fixado no valor corrigido).
- Gate: lint com limite; sem mudança de comportamento (diff revisado por tipo).

### T-F6-06 — Contrato de persistência entre adaptadores (DEBT-006, parte 1) · L (dividir)
- Status: `[ ]` · Dependências: nenhuma
- Subtarefas: (a) levantar adaptadores vivos hoje (servidor SQLite é a autoridade; legado local/BrowserStore); (b) suíte de contrato executável contra o que ainda for suportado; (c) decisão de aposentadoria do legado. IndexedDB e sincronização ficam fora (spec, seção 7).

### T-F6-07 — Matriz de cobertura reconciliada · S
- Status: `[ ]` · Dependências: T-F6-01
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
- Status: `[ ]` · Requisitos: R-09 (AC-09.1, AC-09.2) · Dependências: F1
- Fazer: `npm run package:standalone` em diretório temporário e teste que varre `server-runtime`, `dist-runtime` e configuração Tauri: nenhuma ocorrência de `SMARTLEARN_DEV_PERSISTENT_SESSION`, da senha de fixture, de caminhos `SmartLearn-DevData`; confirma `NODE_ENV` não-produção só no que já é decidido (cookie sem `Secure` em loopback — registrar como decisão existente, não alterar).
- RED: injetar a variável num arquivo empacotado e ver o teste falhar.
- Gate: teste novo + `desktop-entrypoint.test.js`.

### T-F8-02 — Testes adversariais de upload de PDF · M
- Status: `[ ]` · Requisitos: R-09 (AC-09.3) · Dependências: nenhuma
- Casos: PDF truncado, cabeçalho falso com tipo correto, páginas gigantes, extração lenta (timeout), texto com instruções injetadas (tratado como inerte pelo provedor FAKE), nome de arquivo hostil, duplicata entre usuários (já coberto), cota estourada (já coberto).
- Gate: `server/test/source-*.test.js` ampliado; nenhum caso exige Codex.

### T-F8-03 — Segredos e consentimento de IA · S
- Status: `[ ]` · Dependências: nenhuma
- Fazer: confirmar por teste que consentimento de IA e provedor só chegam por configuração explícita; que logs não imprimem texto de fonte nem credenciais; revisar `SMARTLEARN_AI_CONSENT=true` do launcher como exclusivo do DEV.

### T-F8-04 — Caminho único de abertura e retirada do release antigo · S
- Status: `[H]` · Requisitos: R-09 (AC-09.4) · Dependências: HG-04, F1
- Fazer (após decisão): desinstalar `AppData\Local\SmartLearn` pelo desinstalador; atalhos já aposentados permanecem em `retired-shortcuts`; documentar `npm run dev:desktop` como a única entrada.
- Sensor: `desktop-entrypoint.test.js` confirma que o atalho "SmartLearn DEV" aponta para o launcher.

### T-F8-05 — Dependências e auditoria · S
- Status: `[ ]` · Dependências: nenhuma
- Fazer: `npm audit`/`cargo audit` conforme gates já existentes (`P2-3`), registrar achados e decisões; sem atualizar versões por reflexo.

### Checkpoint F8
- Inspeção do pacote verde com mutação; testes adversariais verdes; decisão do release antigo executada ou registrada.

---

## F9 — Integração e entrega (F-50) — por último, sempre com decisão humana

### T-F9-01 — Mapa de integração e ensaio sem publicar · M
- Status: `[H]` · Requisitos: R-10 (AC-10.1) · Dependências: HG-05, F0..F8
- Fazer: inventário dos 53+ commits locais agrupados por fase; relação com `claude/content-quality` e `tmp/integrate-cq-into-v1` (merge temporário marcado "not for push"); ensaio de integração em worktree descartável com gate completo; lista de conflitos previstos.
- Saída: proposta de série de PRs (um por fase), com descrição e evidência por PR. Nada é enviado.

### T-F9-02 — `validation.md` por fase e validador de estado · S
- Status: `[ ]` · Requisitos: R-10 (AC-10.2) · Dependências: fases fechadas
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
