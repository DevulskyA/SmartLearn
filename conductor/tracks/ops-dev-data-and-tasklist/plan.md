# TRACK: Persistência de dados e governança de execução

> Fonte persistente ÚNICA da tasklist deste track (`conductor/tracks/ops-dev-data-and-tasklist/plan.md`).
> Chat/UI = PROJEÇÕES; nenhuma lista independente. Hierarquia: Constitution = intenção · GOAL = resultado
> atual · Git/testes = estado · Conductor (este plan) = plano/rastreamento · `.specs/STATE.md` = retomada mínima.
> Não é autoridade de produto. Reconciliar Git antes de confiar (workflow.md regra 12).

```
Track:    ops-dev-data-and-tasklist            Status: IN_PROGRESS
Iniciado: 2026-09-19 (prioridade humana; interrompe o marco de analytics)
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: GOV-2
```

## Tarefas

- [✓] **OPS-1 Inventariar bancos, backups e caminhos destrutivos** — ver "Evidência OPS-1".
- [✓] **OPS-2 Isolar testes e proteger o banco de uso contra wipe** — DB de dev em `~/SmartLearn-DevData` (fora de
      qualquer worktree); servidor `NODE_ENV=test` recusa DB fora de `os.tmpdir()`; snapshot diário db+wal (7 dias);
      servidor imprime qual DB usa e se é NOVO. Prova: `db-safety` (unit+processo real, falha sem o guard) e `dev-data`.
- [✓] **OPS-3 Reconstruir dataset representativo pelos fluxos reais** — `npm run seed:dev` (opt-in, loopback, idempotente,
      nunca no startup; só usa a API pública) criou em `~/SmartLearn-DevData`: 6 disciplinas, 10 aulas, 22 exercícios,
      160 revisões (12 concluídas), 27 evidências (EXTERNAL/INITIAL_PRACTICE/REVIEW em datas distintas), blocos com erro,
      bloco pela metade, reteste misto, "última tentativa errada". Login: `dev@smartlearn.local`. Prova:
      `server/test/seed-dev.test.js` (servidor real: cobertura de estados, idempotência, recusa não-loopback).
- [✓] **OPS-4 Provar persistência após restart + suíte completa** — contagens idênticas (6/10/22/160/12/27) após:
      `kill -9` do servidor + reinício; e unit 331 + server 391 + e2e 107/107 COM o servidor de dev ativo. TRAVA de
      escritor único (`dev.lock`): 2ª instância de `dev:remote` recusada, lock velho é retomado (unit + prova real).
      `atomic-save` decidido em "Evidência OPS-4/9" (sensor de persistência, mas a falha intermitente é independente de dados).
- [✓] **OPS-5 Determinar causa histórica da perda ou registrar UNKNOWN** — **ROOT_CAUSE_DATA_LOSS = UNKNOWN**
      (hipóteses ranqueadas e o que cada evidência exclui em "Evidência OPS-5").
- [✓] **GOV-1 Reconciliar TLC × Conductor e registrar o track corretamente** — auditoria em "Evidência OPS-6"; reparo LOCAL:
      `conductor/workflow.md` (relação Conductor envolve TLC, projetor, uma ativa), `tracks.md` (ACTIVE TRACK + IN_PROGRESS),
      `index.md`, `CLAUDE.md`. Skill global NÃO alterada. Painel mestre (22/54) segue adiado.
- [>] **GOV-2 Provar tasklist persistente + projeção visível ao usuário** — retomada em nova sessão reconstrói a mesma lista.
- [ ] **ANALYTICS Retomar "Meu estudo está funcionando?"**
- [-] Adiado: reconciliar o painel mestre `conductor/tracks.md` (22/54 de 07/09) com T29+ do STATE; campo de explicação
      por exercício; seed no backend local do desktop (porta em runtime).

## Os 3 tipos de banco (nunca misturar)

```
PERSISTENTE (uso manual)  ~/SmartLearn-DevData/smartlearn-dev.db  — criado/usado por `npm run dev:remote`.
                          Fora de worktrees. Snapshot diário. NUNCA apagado por teste, seed ou startup.
TEMPORÁRIO (unit/server/e2e)  os.tmpdir()/sl-*/…  — mkdtemp por suíte; servidor com NODE_ENV=test RECUSA outro caminho.
DATASET reproduzível      `npm run seed:dev` — só escreve na conta dev@smartlearn.local quando ela está VAZIA; não substitui.
                          Para uma base descartável separada: SMARTLEARN_DEV_DATA_DIR=<outro diretório>.
```

## Evidência OPS-1 — perda de dados (fatos, sem inventar causa)

```
BANCOS_DE_USO_ENCONTRADOS (cópias intactas preservadas em C:\Users\Ariel\SmartLearn-recovery-2026-09-19\)
  1  C:\Projetos\SmartLearn\data\smartlearn-before-clean-20260624-212713.db   167 936 B  (23/06)
     esquema ANTIGO (study_records; 18 disciplinas de concursos) — outra era, NÃO médico. Integrity ok.
  2  %APPDATA%\com.devulsky.smartlearn\smartlearn.db   69 632 B  (05/09; wal 14/09)
     Tauri desktop antigo: 4 disciplinas, 4 aulas, 3 exercícios, 64 revisões. INTACTO, não modificado. Integrity ok.
  3  <worktree>\server\data\smartlearn.db   274 432 B  (12/09)
     servidor de dev deste worktree: 3 usuários UAT, 1 aula, 16 revisões. Integrity ok.
NÃO EXISTE: %APPDATA%\com.devulsky.smartlearn\smartlearn-server\ (DB do backend local do desktop novo):
     o app desktop com backend local nunca gravou dados nesta máquina (ou foi removido).

AMBIENTES → BANCO
  dev:remote        server cwd=server/, default './data/smartlearn.db'  => POR WORKTREE (ignorado pelo Git)
  npm run dev       BrowserStore = localStorage do navegador, por ORIGEM (porta) e perfil
  unit (test/*.js)  sem arquivo (BrowserStore em memória)
  server tests      mkdtemp(os.tmpdir()) em todos (persistence, process-smoke, ...)
  e2e (18 specs)    mkdtemp(os.tmpdir()) + porta própria; browser context novo por teste
  Tauri (Rust)      testes usam std::env::temp_dir(); app usa app_data_dir()
PROVA EMPÍRICA: DBs 2 e 3 têm mtime de 05/09 e 12/09 e NÃO mudaram após ~15 execuções completas
  de e2e/server/unit nesta sessão => a suíte automatizada não toca nos bancos de uso.

CAMINHOS DESTRUTIVOS (produto)
  DB.clearAll()  botão "Apagar banco todo" (confirmação; oculto em REMOTE_MODE)
  DB.importAll() importar backup (substitui) e window.__seedUatMedical('DESTROY_EXISTING_DATA') (só DEV, confirmação literal)
  servidor: NENHUM endpoint/rotina que apague o banco; mas openDb() cria silenciosamente um banco VAZIO
            no caminho configurado (default relativo ao cwd).
  repo/Git:  `git worktree remove --force` / rm -rf de worktree apaga TUDO nele, inclusive server/data
            (ignorado pelo Git, invisível em `git status`).

CAUSAS PROVÁVEIS (estruturais, provadas por mecanismo) — evento exato de perda: UNKNOWN
  C1  DB de dev por worktree + default relativo: mudar/criar/remover worktree = "banco vazio" sem aviso.
  C2  remoção de worktree apaga o DB ignorado. Nesta sessão (2026-09-19) foram removidos 5 worktrees com
      `worktree remove --force`/rm -rf; se algum tinha server/data, foi perdido e NÃO é recuperável.
      Não havia como verificar antes (ignorado pelo Git) — falha de processo, registrada aqui.
  C3  BrowserStore é por origem/porta/perfil; o dataset rico de 9 disciplinas foi criado só na sessão do
      navegador (EXECUTION.md SEED_DATA_NOTE) => some ao trocar porta/perfil/reiniciar.
  Nenhum log/snapshot permite afirmar qual delas apagou os dados anteriores.
RECUPERADO: nada além das cópias acima. Nenhum dado "apagado" foi recuperado.
```

## Evidência OPS-4/9 — o teste intermitente `atomic-save` :159 (ROOT_CAUSE PROVADA POR MECANISMO)

```
O QUE O TESTE É    sensor de persistência/idempotência (perda de resposta -> retry com a mesma chave não duplica a aula).
                   Por assunto, PERTENCE a este track como sensor.
O QUE FALHA        NÃO é dado. Falha em `expect(#plan-unit-form-message).toContainText(/aula salva/)` (recebe "").
                   Rede no artefato de falha: POST abortado, POST real 201 (route.fetch), retry 201 — o servidor gravou e
                   respondeu corretamente; as asserções de contagem (1 aula / 16 revisões) vêm DEPOIS e não foram atingidas.
CAUSA              src/app.js:5211 mostra "Aula salva…", faz `await renderPlan()` (dezenas de ms) e em :5221 APAGA a
                   mensagem (`setPlanFormMessage()`). A mensagem só existe durante o re-render; o teste consulta por polling e,
                   quando a máquina/servidor está rápido, perde a janela. Dependente de tempo, não de durabilidade.
FREQUÊNCIA         base 126e343: 0/5 · atual: ~1 em 8–20 · 25/25 verdes e suíte 107/107 depois de remover um vite estranho;
                   1/20 e a falha capturada quando um 2º vite rodava no mesmo worktree (carga/cache compartilhado).
IMPLICAÇÃO PRODUTO o aluno quase não vê "Aula salva" (some em ms) — confirmação visual efêmera.
DECISÃO            independente de perda de dados; NÃO corrigido aqui (ordem humana). Fix candidato (menor): o teste
                   assertar o desfecho (linha na lista / contagem via API) OU o produto manter a confirmação visível.
```

## Evidência OPS-5 — causa histórica da perda (sem inventar)

```
ROOT_CAUSE_DATA_LOSS = UNKNOWN
HIPÓTESE CONCORRENTE (a sua): os dados podem ter ficado em OUTRO banco/worktree.
  - Varredura completa do disco (C:\Projetos, AppData, .codex, Documents/Desktop/Downloads): NÃO existe nenhum outro
    smartlearn*.db além dos 3 preservados. Se existiram bancos em outros worktrees, esses worktrees NÃO existem mais.
  - Worktrees que existiram (por sessões em ~/.claude/projects): com-tlc-replanning (atividade até 06/09),
    fix-complete-review-sqlite (até 06/09), server-first-v1 (até 05/09), dual-claude-SMOKE1 (10/09, do teste dual-lane).
    Nenhum teve atividade depois de 10/09; portanto NÃO explicam sumiço de dados criados em 12–18/09.
  - O único DB de servidor dos últimos dias (este worktree, escrita final 12/09 17:12) está ÍNTEGRO, mas é pequeno (UAT).
CONSISTENTE COM: o dataset "rico" de 9 disciplinas dos últimos dias vivia no BrowserStore (localStorage por origem/porta/perfil,
  EXECUTION.md SEED_DATA_NOTE) — volátil por construção e impossível de auditar aqui (leveldb do navegador bloqueado/comprimido).
NÃO PROVADO/NÃO EXCLUÍDO: remoção de worktree (inclusive a minha de hoje, 5 worktrees) só apagaria DBs de 05–10/09.
AÇÃO CORRETIVA JÁ APLICADA (independe da causa): DB persistente fora de worktrees + snapshot diário + trava de escritor único
  + guard de teste + servidor que anuncia o DB em uso. Para dados que precisam persistir: `npm run dev:remote` (NÃO `npm run dev`).
```

## Evidência OPS-6 — TLC × Conductor (lido do disco, não pelo nome)

```
SKILL_REALMENTE_USADA = tlc-spec-driven-strict
VERSAO                = não declarada (sem campo version); instalada em ~/.claude/skills em 2026-09-15 01:10;
                        substituiu tlc-spec-driven (backup .superseded-20260915-011011)
ORIGEM                = "integração original" (ATTRIBUTION.md): conceitos do Tech Lead's Club tlc-spec-driven
                        + gemini-cli-extensions/conductor (checklists persistentes de tarefas/fases)
"TLC-ECC Engineering V3"= NÃO EXISTE no disco (nem em ~/.claude nem em ~/.codex). "TLC Strict + ECC Engineering"
                        aparece só como rótulo de governança no STATE.md do repo. Causa: UNKNOWN (nunca instalada,
                        ou nunca versionada como skill).
CONDUCTOR_INTEGRADO   = PARCIAL. Skills conductor-* instaladas desde 2026-05-26 (independentes). No repo:
                        conductor/workflow.md = contrato "Conductor + TLC" (2026-09-07). A skill TLC NÃO cita Conductor.
TASK_PLANNING_EXISTE  = YES  (TLC: .specs/features/<f>/tasks.md; Conductor: tracks.md + tracks/<t>/plan.md)
TASK_PLANNING_AUTOMATICO = NO (nada dispara sozinho; depende do agente)
POR QUE "SUMIU": não foi removido — foi ABANDONADO NA PRÁTICA. conductor/ não recebe commit desde 20406b2
  (2026-09-07, T28); há 143 commits depois, e as sessões 14-19 só atualizaram .specs/STATE.md. Nesta sessão eu
  também não consultei nem atualizei o Conductor (violação do workflow.md regras 9 e 11).
SKILL_CONFLICT
  EXPECTED=skill TLC+ECC v3 com TASK_PLANNING permanentemente ativo e Conductor envolvendo o TLC
  ACTUAL=skill strict sem vínculo com Conductor; vínculo existe só como documento do repo, sem manutenção
  CAUSE=UNKNOWN (integração nunca esteve na skill; o repo teve o contrato mas ele não foi seguido)
  IMPACT=execução longa sem painel de tarefas; retomada dependia do STATE em texto corrido
  MINIMUM_FIX=correção LOCAL e reversível (este track): plan.md ativo + ponteiro no CLAUDE.md. Skill global NÃO alterada.
```

## Adiados

- Reconciliar `conductor/tracks.md` painel mestre (22/54 em 2026-09-07) com T29–T44/PV1/LOCAL do STATE: track próprio, depois deste.
- Campo de explicação por exercício (schema) — ver Constitution I.14; DEFER.
- Backend local do desktop (`smartlearn-server/`): semear base de dev nele exige descobrir a porta em runtime; fora deste track.
