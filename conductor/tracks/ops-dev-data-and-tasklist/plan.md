# TRACK: Persistência de dados e governança de execução

> **STATUS=PROVISIONAL · AUTHORITY=NOT_PROVEN** (correção humana 2026-09-19).
> Este arquivo é um artefato PROVISÓRIO do Conductor, mantido só para não perder o trabalho e a tasklist. NÃO é a fonte
> canônica definitiva. O workflow histórico do projeto era TLC-ECC MODIFICADO com princípios úteis de Conductor incorporados,
> depois compactado/importado como `tlc-spec-driven-strict`. O mecanismo canônico de tasklist/checkpoint/smart recovery
> está PENDENTE de auditoria da skill real (GOV-1). Não expandir o Conductor nem criar governança nova antes dessa auditoria.
> Tudo já feito em `conductor/...` permanece (nada apagado); só está classificado como provisório.
> Chat/UI = PROJEÇÕES deste arquivo enquanto a auditoria não decidir outra coisa. Hierarquia: Constitution = intenção ·
> GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Reconciliar Git antes de confiar (workflow.md regra 12).
>
> DECISÃO HUMANA (2026-09-19) — TASKLIST VISUAL PRESERVADA: a capacidade "tasklist visual persistente" (`scripts/tasklist.mjs`,
> `tasklist.html`, painel, estados ✓ > [ ] ! -, detalhes expansíveis, tarefa ativa inequívoca) é CANÔNICA COMO CAPACIDADE e não pode
> ser removida, mesmo que `conductor/` deixe de ser a fonte. Se a fonte mudar após a auditoria GOV-1, adapta-se o GERADOR para ler a
> nova fonte; a UI permanece. NÃO autoriza expandir o Conductor. Fonte interna definitiva = pendente da auditoria.

```
Track:    ops-dev-data-and-tasklist            Status: IN_PROGRESS
MARCO ATUAL: Analytics longitudinal
Iniciado: 2026-09-19 (prioridade humana; interrompe o marco de analytics)
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: ANALYTICS-2
TASKLIST_AUTHORITY: PROVISIONAL (canônico = mecanismo do tlc-spec-driven-strict, auditoria GOV-1 pendente)
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
- [✓] **ANALYTICS-1 Mostrar sinal "para reforçar" no Plano usando o reinforcement já existente no servidor** — cliente feito:
      `DB.attempts.reinforcement()` (`src/remote-store.js`), chip "N para reforçar" na linha do Plano e "Errou na última tentativa"
      por exercício no detalhe (`renderPlan`); só em REMOTE_MODE, falha do endpoint = sem chip (sinal auxiliar, `console.warn`).
      Prova: e2e "Retention cue" estendido (vermelho antes do código; chip = 1 de 2 exercícios, some após reteste correto);
      render real na base viva em 1280 e 375 (pior caso Atrasada+nota+"2 para reforçar" cabe, sem overflow horizontal);
      contraste do chip 6,59 (claro) / 10,45 (escuro). SUÍTES NO SNAPSHOT FINAL (HEAD de35bf9; `src/` inalterado desde 16:00:40 e
      a rodada começou depois): e2e COMPLETO 108/108 (7,3 min, `--reporter=line` com progresso [n/108]), unit 344/344, server 392/392.
      O 108/108 anterior era STALE (antes do refactor de paralelização do fetch) e foi substituído por este. O e2e
      `hoje-block-retest.spec.js` não commitado do handoff anterior foi reescrito do zero (não existia mais no disco).
- [>] **ANALYTICS-2 Provar tendência longitudinal** — sobre a base viva `dev@smartlearn.local`; sem inventar dado.
      DONE-WHEN: cada disciplina/aula com histórico observável é classificada em exatamente uma de MELHORANDO / PIORANDO /
      ESTÁVEL / EVIDÊNCIA INSUFICIENTE, e a classificação é PROVADA (não só exibida). Regras: (1) usar SOMENTE histórico
      observável (evidência/attempts datados no servidor) — sem mastery, sem estado inferido; (2) reteste imediato
      (tentativas sem `reviewTaskId`, sem evidência agregada) NUNCA conta como evidência agregada de desempenho;
      (3) sem média simples de percentuais com volumes diferentes: agregar por numeradores/denominadores (ou ponderar por n)
      e provar com um caso em que a média simples inverteria a classe; (4) UNKNOWN/sem dado = EVIDÊNCIA INSUFICIENTE, nunca 0%.
      ORDEM: testes DISCRIMINANTES primeiro (vermelhos contra o código atual onde a regra for violada, verdes depois) cobrindo
      as 4 classes, a fronteira do mínimo de volume, a exclusão do reteste e o caso da média simples; SÓ DEPOIS qualquer UI.
      PONTO DE PARTIDA: `subjectTrend`/`unitTrend` já existem em `src/analytics.js` (INSUFFICIENT/IMPROVING/DECLINING/STABLE) —
      AUDITAR contra estas regras antes de assumir que estão corretas. Estatísticas é superfície protegida (ADR-0001): só bug
      fix/dados/testes, sem redesign.
- [ ] **ANALYTICS-3 Responder "Meu estudo está funcionando?"** — Estatísticas é superfície protegida (ADR-0001): "o que fazer
      agora" nela é HUMAN GATE (redesign); só bug fix/dados/a11y/testes sem autorização.
- [ ] **GOV-1 Auditar a skill `tlc-spec-driven-strict` real e identificar o mecanismo original de tasklist/checkpoint/smart recovery** —
      REABERTA (2026-09-19, correção humana). Ler a skill importada e seus arquivos (não pelo nome); descobrir onde ficam
      tasklist, checkpoint e recuperação; separar o que é TLC-ECC original do que é Conductor incorporado. A leitura parcial em
      "Evidência OPS-6" NÃO conta como auditoria. Sem alterar a skill global.
- [ ] **GOV-2 Reconciliar a tasklist atual com esse mecanismo sem criar uma segunda governança** — depende de GOV-1. Só então
      decidir se este plan.md vira o mecanismo canônico, é migrado ou é aposentado. Até lá: `conductor/...` intacto e provisório.
- [-] Adiado: reconciliar o painel mestre `conductor/tracks.md` (22/54 de 07/09) com T29+ do STATE; campo de explicação
      por exercício; seed no backend local do desktop (porta em runtime).

## Notas do marco ANALYTICS (histórico das passadas já feitas; a tarefa ativa é ANALYTICS-2)

```
1ª passada (Hoje/Plano/Estatísticas, 1280 e 375): a base conta a história (tendências, "Sem evidência" neutro, bloco com erro
  restaurado na Hoje). Defeito real só com dados realistas: gráfico de evolução com eixo por ÍNDICE e rótulos repetidos —
  corrigido (eixo por data, rótulos únicos; commit 5e465cc; bug fix em superfície protegida). Achados registrados: Estatísticas
  não diz "o que fazer agora" (protegida → human gate); "Nota %" cortada a 768px; caminho SVG morto do gráfico.
2ª passada (próxima ação na Hoje): "Começar agora" apontava para a revisão vencida mais antiga mesmo sem conteúdo. Agora
  `src/today-priority.js` escolhe: itens a reforçar > exercícios pendentes > já respondida > sem conteúdo (vencidas antes de
  hoje). Prova: 5 unitários + e2e com servidor real (commit 5370ada).
3ª passada: SERVIDOR FEITO (5ef3b75); CLIENTE FEITO (ANALYTICS-1, Plano: chip na linha + cue por exercício).
Escopo original da fatia: o Plano lista aulas com estado e nota mas NÃO mostra quais têm itens errados pendentes (o "para
  reforçar" só existe na Hoje).
```


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

## Evidência OPS-6 — TLC × Conductor (leitura PARCIAL do disco; NÃO é a auditoria GOV-1)

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
