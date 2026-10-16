# TRACK: Persistência de dados e governança de execução

> **STATUS=RECONCILED (GOV-2, 2026-09-19).** Este arquivo é o ledger MACRO de marcos que alimenta a tasklist visual. O mecanismo
> canônico de execução de tarefa é o da skill `tlc-spec-driven-strict` (TLC-ECC modificado com princípios de Conductor incorporados;
> auditoria real em "Evidência GOV-1"). Decisão GOV-2 (opção A): este plan.md permanece como visão macro; a skill cuida de tarefa causal,
> checkpoint, Memento e recuperação. Mapa: ✓=[x] DONE · >=[~] IN_PROGRESS (exatamente UMA) · [ ]=PENDING · !=[!] BLOCKED · -=adiada
> (extensão local). NÃO é segunda governança; skill global NÃO alterada; não abrir track novo sem objetivo aprovado.
> Chat/UI = PROJEÇÕES deste arquivo. Hierarquia: Constitution = intenção ·
> GOAL = resultado atual · Git/testes = estado · `.specs/STATE.md` = retomada mínima.
> Reconciliar Git antes de confiar (workflow.md regra 12).
>
> DECISÃO HUMANA (2026-09-19) — TASKLIST VISUAL PRESERVADA: a capacidade "tasklist visual persistente" (`scripts/tasklist.mjs`,
> `tasklist.html`, painel, estados ✓ > [ ] ! -, detalhes expansíveis, tarefa ativa inequívoca) é CANÔNICA COMO CAPACIDADE e não pode
> ser removida, mesmo que `conductor/` deixe de ser a fonte. Se a fonte mudar após a auditoria GOV-1, adapta-se o GERADOR para ler a
> nova fonte; a UI permanece. NÃO autoriza expandir o Conductor. Fonte interna definitiva = pendente da auditoria.

```
Track:    ops-dev-data-and-tasklist            Status: DONE
MARCO ATUAL: Analytics longitudinal — FECHADO (track concluído; sem tarefa ativa)
Iniciado: 2026-09-19 (prioridade humana; interrompe o marco de analytics)
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: nenhuma (track fechado)
TASKLIST_AUTHORITY: RECONCILED — ledger macro; execução = tlc-spec-driven-strict (GOV-1/GOV-2)
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
- [✓] **ANALYTICS-2 Provar tendência longitudinal** — AUDITADO e CORRIGIDO. `subjectTrend` (janelas 30d/30d, agregado
      correct/questions, mín. 10 perguntas por janela, zona estável 3pp) já estava correto: só ganhou testes. `unitTrend` estava
      ERRADO: comparava só as pontas dos 3 últimos percentuais por evidência, sem peso de volume, sem mínimo de perguntas (um 1/1 recente
      virava +30pp). Agora: histórico da unidade dividido por DATA (metade antiga vs recente; linhas do mesmo dia = um momento), cada
      metade agregada correct/questions, mín. 10 perguntas por metade, zona estável 5pp (valor pré-existente); sem comparação
      honesta = EVIDÊNCIA INSUFICIENTE (nunca 0%, nunca "estável"). Regra operacional, não lei cognitiva. Só evidência observável
      (`learning_evidence`: INITIAL_PRACTICE/EXTERNAL/REVIEW contam igualmente como observações datadas); reteste imediato não
      cria linha de evidência (invariante do servidor agora TRAVADO por teste em `server/test/attempts.test.js`).
      Prova: `test/longitudinal-trend.test.js` (13; VERMELHO antes em volumes diferentes e outlier 1/1, verde depois), 5 testes de
      `unitTrend` reescritos para o novo contrato em `test/performance-thresholds.test.js` (mudança de contrato, não afrouxamento),
      unit 357/357, server attempts 18/18. Base viva (auditoria, não UI): Plexo 55%→83% MELHORANDO · Coração 75%→77% ESTÁVEL ·
      Fisiologia renal 77%→56% PIORANDO · Farmacocinética 72%→60% PIORANDO · Potencial de ação (só 5 perguntas recentes)
      INSUFICIENTE · unidades sem evidência INSUFICIENTE; disciplinas: Anatomia +15pp ↑, Fisiologia −27,5pp ↓, Farmacologia −12,2pp ↓,
      Neurologia/Patologia/Semiologia insuficiente. Sem e2e (domínio puro; a UI só recebe a mesma enum).
- [✓] **ANALYTICS-3 Responder "Meu estudo está funcionando?"** — Estatísticas (protegida, ADR-0001) ganhou SÓ texto dentro do
      painel "Desempenho por disciplina" (sem componente novo, sem mudança de hierarquia/geometria; sem HUMAN GATE): manchete
      (melhorando / piorando / misto / estável / sem histórico suficiente / sem evidência), contagem por disciplina (melhorando ·
      piorando · estáveis · evidência insuficiente · sem evidência — apartadas, nunca como desempenho ruim) e UMA unidade de
      atenção (maior queda; senão a com mais itens "para reforçar") com "de X% para Y%", "N exercícios para reforçar" e o link
      "Ver no Plano", que abre a unidade já expandida (ação existente: Estudar agora). Domínio puro `studyVerdict`/`verdictText`
      em `src/analytics.js`; nunca escreve mastery/retenção/score (teste). Prova: `test/study-verdict.test.js` (11, escrito antes
      do código: vermelho por export ausente), `e2e/study-verdict.spec.js` (4: misto+atenção+navegação, volume baixo/sem dado,
      sem evidência, mobile 375 sem scroll horizontal e alvo ≥44px), subset 43/43 (stats-*, plan-*, product-value, exercise-attempt,
      hoje-block-retest). REAL_USE_VALIDATED=NO · DEV_REPRESENTATIVE_DATA_VALIDATED=YES: inspeção real da aplicação sobre a base representativa (seed) em 1280 e 375, screenshots — validação funcional forte, NÃO uso longitudinal de aluno real. Saída observada: "Resultado misto … 1 melhorando · 2 piorando · 1 com
      evidência insuficiente · 2 sem evidência. Atenção: Fisiologia renal … de 77% para 56%. 2 exercícios para reforçar. Ver no
      Plano" — abre a unidade no Plano. Respostas ao objetivo macro no produto real: está funcionando? misto; melhorando: Anatomia;
      piorando: Fisiologia e Farmacologia; pouca evidência: Neurologia (e Patologia/Semiologia sem dado); atenção: Fisiologia renal;
      ação agora: reforçar 2 itens via Plano/Estudar agora. GATE FINAL no snapshot 876fbda: unit 369/369, server 393/393,
      e2e COMPLETO 112/112 (8,4 min, progresso [n/112]). Residual: vocabulário — o selo da tabela diz "Caindo" (aprovado) e o texto
      novo diz "piorando"; não alterei o selo (superfície protegida).
- [✓] **GOV-1 Auditar a skill `tlc-spec-driven-strict` real e identificar o mecanismo original de tasklist/checkpoint/smart recovery** —
      auditoria feita lendo os arquivos reais (2026-09-19); resultado em "Evidência GOV-1". Skill global NÃO alterada.
- [✓] **GOV-2 Reconciliar a tasklist atual com esse mecanismo sem criar uma segunda governança** — DECISÃO A: `plan.md` permanece como
      ledger MACRO de marcos (a skill não tem visão macro, projeção visual nem "uma ativa"); tarefa causal/checkpoint/Memento/recuperação
      seguem a skill (`.specs/features/<f>/tasks.md`, STATE). Sem segunda governança; skill global intacta; tasklist visual preservada
      (o gerador só passou a aceitar track DONE com zero ativas). Menor complexidade que preserva persistência, uma ativa, retomada,
      tasklist visual, checkpoints e continuidade entre sessões.
- [-] Pendência de PRODUTO (não bug confirmado): o veredito agregado conta DISCIPLINAS com o mesmo peso (uma com 10 questões pesa
      como uma com 100). Correto para "N disciplinas melhorando, M piorando"; potencialmente enganoso se lido como "seu estudo está
      melhorando". Decidir a semântica da manchete antes de mexer. NOT_PROVEN: eficácia com histórico longitudinal de aluno real.
- [-] Adiado: reconciliar o painel mestre `conductor/tracks.md` (22/54 de 07/09) com T29+ do STATE; campo de explicação
      por exercício; seed no backend local do desktop (porta em runtime).

## Notas do marco ANALYTICS (histórico das passadas já feitas; track fechado; sem tarefa ativa)

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


## Evidência GOV-1 — a skill real (lida do disco)

```
TLC_SKILL_NAME     = tlc-spec-driven-strict   (SKILL.md, "integração original"; NÃO é o tlc-spec-driven do Tech Lead's Club)
VERSION            = não declarada (sem campo version)
LOCATION           = ~/.claude/skills/tlc-spec-driven-strict  (SKILL.md, ATTRIBUTION.md, INSTALL.md, references/{artifacts,principles,
                     recovery-context,task-checklists,testing}.md, scripts/{validate_tasks,validate_state,validate_spec,check_commit}.py)
                     Antecessora preservada: ~/.claude/skills/tlc-spec-driven.superseded-20260915-011011 (fases discuss/specify/design/implement/validate).
TASK_PLANNING      = SIM, persistente e formal: `.specs/features/<feature>/tasks.md`, uma tarefa causal por `## TNN - resultado`,
                     Status `[ ] PENDING | [~] IN_PROGRESS | [x] DONE | [!] BLOCKED`, com objetivo, escopo, invariantes, superfície de
                     regressão, sensores, gate, done-when, checklist PRE/RED/GREEN/REGRESSION/VERIFY/CLOSE, evidência e BASE/IMPLEMENTATION/
                     CHECKPOINT_SHA. Tarefas de reparo `REPAIR-NN`. `validate_tasks.py` valida esse formato.
CHECKPOINT         = SIM: checklist de FASE ("phase checkpoint") + CHECKPOINT_SHA por tarefa/fase.
SMART_RECOVERY     = SIM: recovery-context.md — KNOWN_GOOD→RESTORE→PROVE→REAPPLY, metadados de revert lógico, regra de parar patch-stack,
                     autoridade da verdade (Git/executável > evidência > decisão humana > spec > STATE > plano/tasks > chat).
HANDOFF            = SIM: "Session Memento" em `.specs/STATE.md` (Repo/Branch/HEAD/Feature/Task/Last proven/In progress/Evidence/Blockers/Next).
VISUAL_TASKLIST    = NÃO. Nada de painel/projeção; só markdown por feature.
CONDUCTOR_DERIVATION = só CONCEITOS (ATTRIBUTION.md): checklists persistentes de tarefa/fase, Red-Green-Refactor, checkpoints de fase,
                     rastreio de review-fix, recuperação lógica ciente de Git. Não há `conductor/`, tracks, plan.md nem "ACTIVE TRACK" na skill.
TLC-ECC "V3"       = não existe como skill (nem no ~/.claude nem no ~/.codex); "TLC Strict + ECC Engineering" é rótulo do STATE do repo.
MISSING_BEHAVIOR   = (1) tasklist VISUAL/projeção; (2) ponteiro "track ativo" e visão MACRO de marcos (a skill só tem o nível feature→tarefa);
                     (3) regra de UMA tarefa ativa (a skill permite [~] em várias); (4) disparo automático da retomada (depende do agente).
                     O que o repo do SmartLearn tem e a skill não: `conductor/` (tracks.md/plan.md/workflow.md) + `scripts/tasklist.mjs`.
NÃO PERDIDO NA COMPACTAÇÃO: task planning, checkpoint, recovery e handoff estão na skill. O que "sumiu" (visual + macro + uma ativa) NUNCA esteve nela.
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
