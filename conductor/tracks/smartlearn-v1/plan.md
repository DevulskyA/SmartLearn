# plan.md — smartlearn-v1

Fonte de status: `.specs/STATE.md` (narrativa + gates) reconciliada com
`.specs/features/smartlearn-v1-consolidated-v2/tasks.md` (títulos/dependências/IDs).
Em divergência entre os dois, ver nota de reconciliação no fim de cada sprint.

Legenda: ✅ PROVEN · 🔄 IN_PROGRESS · ⬜ TODO · ⛔ BLOCKED · ⚠️ UNVERIFIED · ➖ SUPERSEDED

---

## Sprint S00 — Authority & Baseline ✅ PROVEN (6/6)

- [x] T01 — Reconcile continuation and preserve existing work
- [x] T02 — Reconcile product authority and adopt proportionate learning principles
- [x] T03 — Prove the existing one-save path and correct the E2E harness
- [x] T04 — Unify safe Unicode validation without changing valid medical content
- [x] T05 — Make all test families discoverable and establish CI
- [x] T06 — Prove clean-install and native lifecycle stability

Gate no fechamento: root 231/231, server 21/21 (x3), rust 13/13, build PASS, e2e 12/12, test:inventory PASS.

---

## Sprint S01 — Identity & Security ✅ PROVEN (6/6)

- [x] T07 — Create a strict domain HTTP envelope
- [x] T08 — Add owned accounts and session persistence
- [x] T09 — Implement bounded password authentication
- [x] T10 — Implement sessions, CSRF and revocation
- [x] T11 — Add the minimal account experience and recovery boundary
- [x] T12 — Enforce authentication abuse limits and security review

Nota: Fresh Verifier round 1 achou defeito real (scrypt antes do rate-limit
em login malformado; /auth/register sem rate limit; fila sem cap) →
corrigido → round 2 confirmou com exploit real. `/auth/password` também
recebeu rate limit pelo mesmo padrão.

---

## Sprint S02 — Learning Domain Server ✅ PROVEN (7/7)

- [x] T13 — Create the current owned learning-domain schema
- [x] T14 — Implement subject management with shared normalization
- [x] T15 — Move unit creation and fixed scheduling into one transaction
- [x] T16 — Implement agenda and both review completion modes
- [x] T17 — Implement exercises with immutable versions and provenance
- [x] T18 — Implement aggregate evidence and actual settings contracts
- [x] T19 — Deliver owned logical export and server backup contracts

✅ **Reconciliado 2026-09-07**: `tasks.md` tinha `[ ]` em T13-T15 apesar de
STATE.md confirmar DONE. Reinspecionado (não re-suposto): rodados
`server/test/domain-schema.test.js` + `subjects.test.js` + `create-unit.test.js`
isolados — 35/35 PASS no HEAD atual. Checkboxes canônicos corrigidos para `[x]`
em `tasks.md`. Nenhum ID/wording/dependência alterado.

⚠️ **Discrepância remanescente, fora de escopo desta reconciliação**: `tasks.md`
também mostra T01-T12 com `[ ]` apesar de STATE.md/verificador independente
confirmarem PROVEN. Não corrigido aqui — usuário pediu reconciliação
específica de T13-T15 apenas. Mesma classe de problema, ação futura.

Gate no fechamento: server 165/165, root 240/240, rust 13/13, build PASS, e2e 17/17, test:inventory PASS (35 arquivos).

---

## Sprint S03 — Web Authority Cutover 🔄 IN_PROGRESS (3/5)

- [x] T20 — Map every existing DB caller and implement RemoteStore
- [x] T21 — Connect the Web to real server-owned reads and writes
- [x] T22 — Complete screen and settings parity without losing old data
- [ ] 🔄 T23 — Prove one-intention UX, retries and recoverable errors on server
  - [x] Plano `operationKey` wired (`createOperationKeyTracker()` em `src/app.js`, `planUnitSaveBtn`)
  - [ ] Cadastro `operationKey` wiring (mesmo padrão, `studyForm`/`generateReviewTasks()`)
  - [ ] `e2e/atomic-save.spec.js` (double-click, response-lost-after-commit via
        interceptação de rota Playwright, falha mid-transaction, falha de
        render pós-save bem-sucedido)
  - [ ] gate completo rodado contra este edit (hoje UNVERIFIED)
  - [ ] evidência registrada em validation.md
  - [ ] commit atômico
- [ ] T24 — Close the server-authoritative Web slice (Fresh Verifier independente da fatia inteira; não antes)

Decisão de design do T23 (ainda não escrita em design.md/tasks.md): renovar
`operationKey` em sucesso/cancelamento explícito e em `ApiError` definitivo;
**não** renovar em `NetworkError` — retry deve reusar a key para o guard de
idempotência do T15 (não T23) devolver o resultado original em vez de duplicar.

Gate no fechamento do T22: server 174/174, root 259/259, rust 13/13, build PASS, e2e 26/26, test:inventory PASS (39 arquivos).

---

## ⛔ GATE_P1 — Product Priority Decision (TODO, deferred)

Não é uma sprint numerada T-xx. Ver `../../tracks.md` seção "Sprint Gate P1"
para o texto completo. Resumo: decidir se o vertical slice de documentos
(S06) deve ser antecipado antes de S04/S05, usando o backlog
`document-learning-backlog-DOC-01-72.md` como material de auditoria (DOC-01),
sem descartar T01-T54. Explicitamente adiado pelo usuário em 2026-09-07.

---

## Sprint S04 — NO_DATA_LOSS Migration ⬜ TODO (0/4)

- [ ] T25 — Normalize supported legacy snapshots without data invention
- [ ] T26 — Implement import preview and explicit ID mapping
- [ ] T27 — Commit imports atomically and idempotently
- [ ] T28 — Deliver migration UI and recovery rehearsal

---

## Sprint S05 — Learning Evidence ⬜ TODO (0/5)

- [ ] T29 — Add attributable item-level event schema
- [ ] T30 — Capture actual practice assistance and item version
- [ ] T31 — Reconcile item observations with aggregate results
- [ ] T32 — Reconstruct a transparent evidence profile
- [ ] T33 — Preserve an experimental challenger without promoting it

---

## Sprint S06 — Document Learning Core ⬜ TODO (0/5)

- [ ] T34 — Secure private PDF upload and source ownership
  - [ ] S06.1 Materiais: área própria, upload drag/drop, seletor de arquivo,
        biblioteca de documentos, disciplina existente/nova inline
  - [ ] S06.2 Source ingestion: storage server-side, metadata, checksum,
        deduplicação, ownership, validação tipo/tamanho/nome, retry idempotente
- [ ] T35 — Extract PDF text with page provenance under limits
  - [ ] S06.3 PDF understanding: extração de texto, mapeamento página↔texto,
        detecção de PDF escaneado, OCR como boundary explícito (não default),
        detecção de estrutura/seções, provenance
- [ ] T36 — Create inspectable source-to-unit proposals (depende também de T15)
  - [ ] S06.4 Learning-unit generation: seções semânticas primeiro, ~10 páginas
        só como heurística de fallback, ajuste manual do usuário antes de
        aceitar, vínculo a disciplina
- [ ] T37 — Implement bounded AI draft generation with verified adapter contracts
  - [ ] S06.5 Summary engine: provider abstraction + provider determinístico de
        teste, contrato de geração, resumo source-grounded, estado DRAFT,
        edit/accept/reject/regenerate — nunca publicação automática
- [ ] T38 — Accept generated material atomically into normal study (depende também de T17)
  - [ ] S06.6 Questions / active study: perguntas+respostas+explicações
        source-grounded, exercícios de recuperação ativa (não só múltipla
        escolha), edit/reject/accept, botão "Estudar agora"

Subtarefas S06.1-S06.6 são **propostas, não auditadas** — mapeamento
pendente do GATE_P1/DOC-01. Não alteram os IDs T34-T38.

🏁 Milestone PM-01 (DOCUMENT → LEARNING) fecha quando o fluxo T34→T38
funcionar ponta a ponta no produto real.

---

## Sprint S07 — PWA / Windows / Android ⬜ TODO (0/6)

- [ ] T39 — Build the versioned owned offline agenda snapshot
- [ ] T40 — Implement PWA shell and private cache lifecycle
- [ ] T41 — Enforce offline read-only actions visibly and technically
- [ ] T42 — Deliver the Windows wrapper using the same application
- [ ] T43 — Deliver the Android wrapper without a second product UI
- [ ] T44 — Add consent-based reminders from the synchronized agenda

Offline: READ ✅ / WRITE ❌ (sem buffer, sem queue, sem sync em background).

---

## Sprint S08 — Analytics / UX / Student Journeys ⬜ TODO (0/5)

- [ ] T45 — Deliver explainable evidence-driven priorities and analytics
- [ ] T46 — Complete presentation internationalization
- [ ] T47 — Make states and actions self-explanatory
- [ ] T48 — Verify accessibility, responsive layout and safe rendering
- [ ] T49 — Run representative student journeys across the complete Web product

T49 é o journey que prova o Heritage Contract fim a fim (create unit →
schedule → Hoje → practice/review → evidence → analytics) sem administração
manual estilo planilha.

---

## Sprint S09 — Release & Adversarial Closure ⬜ TODO (0/5)

- [ ] T50 — Create operational backup and restore rehearsal for all accepted assets
- [ ] T51 — Prepare deployment configuration and release permissions
- [ ] T52 — Execute the final integrated gate matrix (re-derivar as 28 ACs, não somar contagens)
- [ ] T53 — Obtain independent release and pedagogical-claim verification
- [ ] T54 — Deliver an honest final checkpoint and stop this mission cleanly

`IMPLEMENTATION_COMPLETE`, `V1_VALIDATED` e `PRODUCTION_RELEASED` são
declarados separadamente — nenhum implica o outro (ver README.md do pack).
