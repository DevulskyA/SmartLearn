# SMARTLEARN V1 — MASTER TRACK

## ACTIVE TRACK (ler primeiro)

<!-- ACTIVE-TRACK:BEGIN (gerado por node scripts/agent-tasklist.mjs; não edite à mão) -->
**`conductor/tracks/content-quality/plan.md`** — CONTENT-QUALITY — Conteúdo médico confiável e didático · Status: IN_PROGRESS · ATIVA (GUI): TRACKUX-1 · bloqueadas: VERDICT-1, REALMODEL-1 · concluídas (29): CQ-1, CQ-2, CQ-3, CQ-4, CQ-5, CQ-6, CQ-7, EXAM-1, EXAM-2, EXAM-3, NEXT, GUI-05, AUTHOR-1, EXAM-4, EXAM-5, UX-1, ATTEMPT-1, INTEGRATE-1, LARGEPDF-1, FIRSTRUN-1, MOBILENAV-1, EXAM-6, ACCESS-1, STUDYRESUME-1, RESILIENCE-1, INTEGRATE-2, EXAM-7, STUDYSTATE-1, TODAYUX-1 · branch `claude/content-quality`@f150fe9 · sincronizado 2026-09-20
<!-- ACTIVE-TRACK:END -->
Este plan.md é o ledger MACRO de marcos que alimenta a tasklist visual; execução de tarefa segue a skill `tlc-spec-driven-strict`
(GOV-2 = opção A, sem segunda governança). Track anterior (Analytics + governança): `tracks/ops-dev-data-and-tasklist/` — DONE.
A tasklist mostrada ao usuário é uma projeção do plan.md.

> PAINEL MESTRE ABAIXO DEFASADO: snapshot de 2026-09-07 (T28). Os 143 commits seguintes
> (T29–T44, PV1, LOCAL, CI, TEST SHIELD, produto de erro→reteste) estão registrados em
> `.specs/STATE.md`, que é a referência de continuidade até a reconciliação deste painel
> (tarefa adiada no plan ativo).

> Reconciliar contra Git + `.specs/STATE.md` antes de confiar neste arquivo
> (regra 12, `workflow.md`). Snapshot gerado em 2026-09-07 a partir de HEAD
> `a51725f`, branch `claude/smartlearn-v1-complete`.

```
Overall: 22 / 54 PROVEN
Status: IN PROGRESS
Current Sprint: S03 — Web Authority Cutover
```

---

```
✅ S00 — Authority & Baseline               6/6   T01-T06
✅ S01 — Identity & Security                6/6   T07-T12
✅ S02 — Learning Domain Server             7/7   T13-T19
✅ S03 — Web Authority Cutover              5/5   T20-T24
⛔ GATE_P1 — Product Priority Decision      0/1   (ver abaixo)
✅ S04 — Data Migration / NO_DATA_LOSS      4/4   T25-T28
⬜ S05 — Learning Evidence                  0/5   T29-T33
⬜ S06 — Document Learning Core             0/5   T34-T38
⬜ S07 — PWA / Windows / Android            0/6   T39-T44
⬜ S08 — Analytics / UX / Student Journey   0/5   T45-T49
⬜ S09 — Release & Adversarial Closure      0/5   T50-T54
```

---

## CURRENT

**T28 — DONE. PHASE 04 CLOSED.**

```
✅ src/migration-ui.js (pure, DOM-free) + "Importar de um backup antigo"
   card on Configuracoes (REMOTE_MODE-only)
✅ select file -> preview (counts/warnings/conflicts, confirm disabled
   while unresolved) -> confirm dialog -> commit -> result + downloadable
   JSON report
✅ e2e/migration.spec.js: 3/3 (happy path + real /v1/export round trip
   proof + byte-identical source file; cancelled-preview rehearsal;
   name-conflict-blocks-commit rehearsal)
✅ migration-runbook.md: HUMAN_GATE REAL_USER_MIGRATION_APPROVAL —
   "Live approval status: NOT GRANTED" (fixture rehearsal != real cutover)
✅ independent data-integrity review, 2 rounds (fresh subagents, T24
   fresh-verifier pattern):
   round 1 found 2 real bugs in imports.js (both NO_DATA_LOSS-safe,
   clean rollback, but real contract breaks): (a) commit-after-expiry
   idempotency broke AC-12's retry guarantee, (b) archived-subject-name
   conflicts invisible at preview time -> unclassified 500 at commit
   round 1 fixes applied + 2 new discriminating tests
   round 2 (different subagent) confirmed both fixes correct/complete,
   zero remaining defects: VERIFIER_RESULT=PASS
✅ full gate: server 208/208 (was 195 pre-T27), root 259/259, build PASS,
   test:inventory PASS 45 files, full e2e 34/34 (31+3, no regressions)
✅ evidence recorded (validation.md)
✅ tasks.md T28 done-when boxes all [x]
✅ 2 atomic commits (T28 feature; independent-review fixes)
```

```
LAST_PROVEN = T28 — PHASE 04 (T25-T28) CLOSED, exit gate satisfied
NEXT_TASK   = Phase 05 (T29-T33, "Reconstructed learning evidence") —
              dependency-ready (T24 was its only dependency, already
              closed). NOT started.
BLOCKERS    = none
DIRTY       = none — working tree clean
```

---

## MILESTONES

```
M0 — BASELINE TRUSTWORTHY                 ✅
M1 — SECURE USER OWNERSHIP                ✅
M2 — SERVER LEARNING DOMAIN               ✅
M3 — WEB USES CENTRAL AUTHORITY            🔄
M4 — DOCUMENT → SUMMARY                    ⬜
M5 — DOCUMENT → ACTIVE STUDY               ⬜
M6 — STUDY → EVIDENCE → REVIEW             ⬜
M7 — EVIDENCE → ANALYTICS → NEXT ACTION    ⬜
M8 — WEB/WINDOWS/ANDROID CONSISTENT        ⬜
M9 — V1 VALIDATED                          ⬜
```

---

## Sprint Gate P1 — Decisão de prioridade de produto

Registrado 2026-09-07 (ver `.specs/features/smartlearn-v1-consolidated-v2/document-learning-backlog-DOC-01-72.md`).
Ponto crítico: SmartLearn hoje entrega principalmente o mecanismo de
**controle do estudo**; o mecanismo que transforma material bruto em
**aprendizagem** (S06/T34-T38) ficou tarde demais no plano.

**Status: TODO, explicitamente adiado pelo usuário** ("A execução vai ser
depois"). Não executar antes de fechar T23 (e provavelmente T24).

Pergunta que este gate resolve quando ativado:
> Podemos entregar o primeiro vertical slice de documentos (S06) agora sem
> violar dependências críticas de T25-T33?

Se sim → antecipar S06 antes de S04/S05. Se não → executar apenas os
pré-requisitos indispensáveis. DOC-01 (auditoria do backlog DOC-01..72
contra spec/design/heritage/tasks/acceptance atuais) ainda **não foi
executado** — é o primeiro passo deste gate, não uma tarefa nova solta.

---

## Sprints — detalhe

### ✅ S00 — Authority & Baseline (T01-T06) — PROVEN
Reconciliação da continuação, Heritage Contract, E2E correto, Unicode médico,
descoberta de testes + CI, baseline nativo reproduzível.
Exit gate: sem false PASS conhecido; baseline reproduzível.

### ✅ S01 — Identity & Security (T07-T12) — PROVEN
Envelope HTTP /v1, schema users/sessions, scrypt limitado, sessão+CSRF+revogação,
UI mínima de conta, rate-limit + revisão de segurança independente (2 rounds,
achou e corrigiu falha real de rate-limit antes do check).
Exit gate: user A não acessa user B; revogação funciona; sensores de abuso passam.

### ✅ S02 — Learning Domain Server (T13-T19) — PROVEN
subjects → learning_units → exercises → learning_evidence; review_tasks;
scheduler fixo 16; agenda; conclusão; export/backup.
Exit gate: servidor é autoridade real do domínio.
Nota: checkboxes de T13-T15 em `tasks.md` estão desatualizados (mostram `[ ]`
apesar de DONE confirmado em STATE.md) — reconciliar ao tocar nesses arquivos.

### ✅ S03 — Web Authority Cutover (T20-T24) — PROVEN
✅ T20 RemoteStore + inventário DB.*, ✅ T21 cutover autenticado single-origin,
✅ T22 paridade de telas sem perda de dados, ✅ T23 one-intention UX no servidor,
✅ T24 fecha a fatia: Fresh Verifier independente PASS + production-build E2E.
Exit: Web deixa de ter autoridade paralela (BrowserStore) significativa. FECHADO.

### 🔄 S04 — NO_DATA_LOSS Migration (T25-T28) — IN PROGRESS
✅ T25 normalização de snapshots legados sem invenção de dados,
✅ T26 preview/mapping (zero side-effect, conflitos, expiry, tamper),
⬜ T27 commit atômico idempotente, ⬜ T28 UI de migração + ensaio de recuperação.
Nenhum dado real migra automaticamente.

### ⬜ S05 — Learning Evidence (T29-T33)
Separar definitivamente "o que aconteceu" de "o que o scheduler pretende".
Eventos atribuíveis, assistência UNKNOWN preservada, reconciliação com
agregados, perfil de evidência transparente, challenger experimental isolado
(sem promoção automática).

### ⬜ S06 — Document Learning Core (T34-T38) — sprint de maior valor de produto
Subtarefas propostas (mapeamento **não auditado** contra DOC-01..72 — pendente
do Sprint Gate P1; IDs T34-T38 não mudam):

```
S06.1 Materiais       — área, upload drag/drop, biblioteca, disciplina inline
S06.2 Source ingestion — upload autenticado, storage server-side, checksum,
                         dedup, ownership, validação, retry idempotente (T34)
S06.3 PDF understanding — extração, páginas, PDF escaneado, OCR boundary,
                          estrutura/seções, provenance (T35)
S06.4 Learning-unit generation — seções semânticas, proposta de unidades,
                                  ~10 páginas só como heurística, ajuste
                                  manual, vínculo a disciplina (T36)
S06.5 Summary engine — provider abstraction, provider determinístico de
                        teste, resumo source-grounded, DRAFT, edit/accept/
                        reject/regenerate (T37)
S06.6 Questions / active study — perguntas, respostas, explicações
                                  source-grounded, exercícios de recuperação,
                                  edit/reject/accept, Estudar agora (T38)
```

🏁 **PM-01 DOCUMENT → LEARNING**: fica PROVEN quando o fluxo completo
PDF → Materiais → extração → unidades → resumo → fonte/página → aceitar →
ESTUDAR AGORA funcionar de ponta a ponta. Mais importante que fechar mais
tasks numeradas — é o que faz o SmartLearn justificar o nome.

### ⬜ S07 — PWA / Windows / Android (T39-T44)
Snapshot de agenda offline versionado, shell PWA, escrita offline
permanece proibida (READ ✅ / WRITE ❌), wrappers Windows/Android sem UI
paralela, lembretes com consentimento.

### ⬜ S08 — Analytics / UX / Student Journeys (T45-T49)
Prioridades explicáveis, i18n completo, estados autoexplicativos,
acessibilidade/responsividade/renderização segura, jornadas completas do
aluno (prova o Heritage Contract fim a fim).

### ⬜ S09 — Release & Adversarial Closure (T50-T54)
Backup/restore, config de deploy, matriz de gates integrada (todas as 28
ACs re-derivadas, não somadas), Verifier independente, checkpoint final
honesto (IMPLEMENTATION_COMPLETE / V1_VALIDATED / PRODUCTION_RELEASED
declarados separadamente).
