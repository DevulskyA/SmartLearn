# TRACK ATIVO — OPS: dados de desenvolvimento duráveis + tasklist persistente

> Fonte persistente ÚNICA da tasklist. O chat/UI mostram uma PROJEÇÃO deste arquivo.
> Hierarquia: Constitution = intenção · GOAL = resultado atual · Git/testes = estado ·
> Conductor (este plan) = plano/rastreamento · `.specs/STATE.md` = posição mínima de retomada.
> Não é autoridade de produto. Reconciliar Git antes de confiar (workflow.md regra 12).

```
Track:      ops-dev-data-and-tasklist
Iniciado:   2026-09-19   (prioridade humana: interrompe o marco de analytics)
Legenda:    [✓] PROVEN   [>] ativa (exatamente UMA)   [ ] pendente   [!] bloqueada   [-] adiada
Próximo marco após este track: "MEU ESTUDO ESTÁ FUNCIONANDO?" (analytics longitudinal)
```

## Tarefas

- [✓] **OPS-0 Fechar a rodada anterior** — HEAD 5157aa3; e2e 106/107 (1 falha intermitente em
      `atomic-save` "response lost", ~22% no atual vs 0/5 na base — NÃO corrigida, ver OPS-9); server 385/385; unit 328/328.
- [✓] **OPS-1 Auditoria de perda de dados (somente leitura)** — resultado abaixo em "Evidência OPS-1".
- [>] **OPS-2 Impedir novas perdas** — (a) DB de dev `dev:remote` em caminho estável FORA do worktree;
      (b) servidor recusa `NODE_ENV=test` com DB fora de `os.tmpdir()`; (c) snapshot diário do DB de dev ao iniciar.
      Prova: teste que falha sem a proteção.
- [ ] **OPS-3 Base representativa via API real** — "paciente vivo" sintético (disciplinas, aulas, resumos,
      exercícios, acertos/erros, retestes, evidência datada, revisões vencidas/abertas/futuras, tendências).
- [ ] **OPS-4 Seed DEV opt-in** — `npm run seed:dev`; determinístico, idempotente, nunca no startup,
      recusa host não-loopback e banco já povoado.
- [ ] **OPS-5 Provar persistência** — reiniciar servidor preserva; `unit` + `server` + `e2e` completos NÃO alteram o DB de dev.
- [✓] **OPS-6 Auditoria TLC × Conductor** — resultado abaixo em "Evidência OPS-6".
- [ ] **OPS-7 Reparar governança de tarefas** — CLAUDE.md aponta este track; tasklist visível nos checkpoints;
      `conductor/tracks.md` marca o painel mestre como defasado (T29+ vivem no STATE) até reconciliação própria.
- [ ] **OPS-8 Retomar marco "Meu estudo está funcionando?"** — analytics longitudinal sobre a base viva.
- [ ] **OPS-9 Investigar flake `atomic-save` :159** — só após OPS-2..5; comparar com base 126e343 (0/5).
- [-] Adiado deliberadamente: ver "Adiados" abaixo.

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
