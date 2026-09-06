# SmartLearn Heritage Contract

## Purpose

SmartLearn nasceu de uma planilha de controle de estudos que evoluiu
organicamente para um sistema completo.

A planilha é PRODUCT DISCOVERY EVIDENCE.

Ela NÃO é a arquitetura alvo e NÃO é um contrato de compatibilidade
célula-a-célula para SmartLearn V1.

A obrigação é:

PRESERVAR A FUNÇÃO ÚTIL
+
REMOVER A COMPLEXIDADE ACIDENTAL DA PLANILHA.

Historical implementation bugs, fixed ranges, obsolete formulas,
spreadsheet-specific interactions and legacy review offsets are evidence
of history, not product invariants.

Current Product Constitution and current approved SmartLearn architecture
have higher authority when they explicitly supersede historical mechanics.

======================================================================
A. ORIGINAL PRODUCT LOOP
======================================================================

Historical conceptual flow:

Disciplinas
    ↓
RP / cadastro mestre
    ↓
calendário automático de revisões
    ↓
Resumo / decisão do dia
    ↓
Detalhe / execução + resultado
    ↓
Estatísticas / evolução
    ↓
Acompanhamento / estado longitudinal

The modern SmartLearn must preserve this user-level loop in improved form:

subject
→ learning unit
→ automatic review schedule
→ agenda / what matters now
→ active practice / review
→ learning evidence
→ analytics / weak areas
→ longitudinal learning state.

======================================================================
B. HERITAGE PRINCIPLES TO PRESERVE
======================================================================

H-01 — STUDY ONCE, SYSTEM ORGANIZES THE REST

The learner records a study unit once.
Review opportunities are generated automatically.

The learner does NOT manually construct a review calendar.

Current approved SmartLearn fixed schedule = 16 reviews.

The historical spreadsheet's 13-review sequence is historical evidence,
NOT the current schedule contract.

------------------------------------------------------------

H-02 — LOW ADMINISTRATIVE BURDEN

If the system can infer, calculate, schedule, persist or derive something
reliably, the learner should not have to enter it manually.

Preserve:

automatic review creation
automatic percentages
automatic status
automatic next-review projection
automatic derived tracking
automatic counts from internal exercises

Avoid:

duplicate forms
manual checkboxes for facts already known
repeated administrative ratings
unnecessary confirmations.

------------------------------------------------------------

H-03 — TODAY IS A DECISION SURFACE

The historical Resumo existed to answer:

"What needs my attention now?"

Modern Hoje must preserve that decision function.

Priority order must remain explicit and useful:

overdue
→ due now/today
→ relevant near-term preview
→ completed/context as appropriate.

Hoje is not a database browser and not an administrative dashboard.

------------------------------------------------------------

H-04 — PLAN IS THE LEARNING INVENTORY

Historical RP was the master study inventory.

Modern Plano represents learning units and their useful state.

Do NOT expose the scheduler as 16 spreadsheet-like date columns.

Show the learner what is useful:

discipline
title
study date
source
summary state
exercise/evidence state
next review
current status
relevant history on demand.

------------------------------------------------------------

H-05 — RESULT = VOLUME + OUTCOME

Historical Detalhe preserved:

questions
correct answers
derived percentage.

Modern evidence must preserve the factual substrate.

Do NOT store or reason only from a percentage when numerator/denominator
are available.

For internal SmartLearn exercises:
the system calculates result automatically.

For external practice:
allow a simple aggregate record:
questions_count + correct_count.

Percentage is derived.

------------------------------------------------------------

H-06 — HISTORY IS DISTINCT FROM SCHEDULE

Historical spreadsheet mixed agenda and result in the same workbook.

Modern SmartLearn improves this separation:

review_tasks = future/current scheduling projection

learning_evidence = historical observed learning facts

Changing a scheduler must never erase or rewrite historical evidence.

------------------------------------------------------------

H-07 — ANALYTICS MUST SUPPORT A DECISION

Historical Estatística 1 answered approximately:
"How am I doing by discipline?"

Historical Estatística 2 answered approximately:
"How is this content evolving?"

Modern analytics preserve these questions while correcting spreadsheet
statistical limitations.

When counts are available:

weighted_accuracy =
SUM(correct_count) / SUM(questions_count)

Do NOT use simple mean of session percentages as the main performance
metric when session volumes differ.

Always distinguish:

no evidence
from
0% after actual attempts.

Prefer:
percentage + sample size
over
percentage alone.

------------------------------------------------------------

H-08 — UNIT-LEVEL EVOLUTION MATTERS

Preserve longitudinal evidence by learning unit/content.

The learner should be able to identify:

weak units
improving units
declining units
insufficient-evidence units
recent activity
next required action.

A graph is useful only when it improves that decision.

A compact table/sparkline can be superior to decorative visualization.

------------------------------------------------------------

H-09 — TRACKING IS STATE, NOT EXTRA DATA ENTRY

Historical Acompanhamento was valuable because it showed the state of each
study item across several dimensions.

Modern Acompanhamento must derive state whenever possible from existing data:

summary present?
exercises available?
evidence recorded?
reviews completed/pending?
last activity?
current tracking state?

Do NOT recreate historical manual checkbox administration for facts that
SmartLearn already knows.

------------------------------------------------------------

H-10 — DISCIPLINE IS STABLE IDENTITY

Historical Disciplinas was a small reusable catalog.

Modern subject/discipline remains a reusable entity.

Its color is stable identity, NOT performance status.

Creating a new discipline inside a learning-unit flow must not force the
learner into a separate administrative ritual.

------------------------------------------------------------

H-11 — MOBILE PRESERVES THE DECISION, NOT THE SPREADSHEET

The spreadsheet was difficult on mobile because its layout was column-based.

Modern UI must preserve the underlying decision and information while using
mobile-appropriate cards/compact layouts.

Desktop may use denser tables when they improve scanning.

Do NOT recreate spreadsheet geometry merely for visual fidelity.

------------------------------------------------------------

H-12 — BACKUP / PORTABILITY REMAINS A PRODUCT PROPERTY

The original SmartLearn design treated export/import as mandatory because
the learner's study history is valuable.

The server-central architecture supersedes local-file authority, but:

ownership
recoverability
exportability
NO_DATA_LOSS

remain protected product properties.

------------------------------------------------------------

H-13 — TIME IS A FIRST-CLASS INPUT

The original system was dominated by TODAY()/dates.

Modern tests for agenda, tracking, analytics and migration must use explicit
or controllable time where practical.

Timezone/date-boundary behavior must not depend accidentally on the machine
running the test.

------------------------------------------------------------

H-14 — ORIGINAL SECONDARY MODULES DO NOT ENTER V1 AUTOMATICALLY

The historical workbook also contained:

simulados
peso de matérias
resolvidos
links
dicas
edital
legacy copies
experiments
Apps Script-dependent behavior.

Their existence proves historical experimentation.

It does NOT automatically make them SmartLearn V1 requirements.

They enter only through an explicit current product decision.

House Simulator remains a separate product.

======================================================================
C. HISTORICAL BEHAVIOR THAT MUST NOT BE COPIED AS CURRENT CONTRACT
======================================================================

Do NOT restore merely because the spreadsheet had it:

- historical 13-review offsets;
- fixed spreadsheet row/range limits;
- incomplete review counters;
- simple AVG(percent) when weighted data exist;
- manual checkboxes for derivable facts;
- spreadsheet cell editing as primary UX;
- 38-tab information architecture;
- broken defined names;
- historical #REF behavior;
- old Apps Script functions without source;
- duplicate legacy sheets;
- arbitrary historical limits such as 12 visible result slots;
- local-first/no-server constraints that were later explicitly superseded.

Preserve such items only as historical evidence when useful for migration,
audit or explaining a prior design.

======================================================================
D. HERITAGE COVERAGE MATRIX
======================================================================

During T02 create and maintain this table in heritage.md:

| Heritage function | Modern owner | Status | Evidence | Decision |
| --- | --- | --- | --- | --- |
| Discipline catalog | subjects / Disciplinas | PROVEN | `src/db.js` subjects table (UNIQUE COLLATE NOCASE, sortOrder, isActive); `test/subjects.test.js`; dedup verified interactively (case-insensitive rejection) | preserve as-is; server-side owned table per design.md §3-4 (T13) |
| Master study entry | learning_units / Plano | PROVEN | `src/app.js` `renderPlan()` + `plan-new-unit-form` (subject/source/date/title/summary); `test/learning-units.test.js`; interactively verified atomic subject+unit+16-review creation | preserve UX shape; server-side atomicity per design.md §4 (T13-T14) |
| Automatic schedule | review_tasks/scheduler | PROVEN | `src/scheduler.js` re-exports `REVIEW_DAY_OFFSETS` from `src/review-schedule.js` (single shared pure source, `[1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]`, 16 offsets); `test/review-schedule.test.js`, `test/scheduler.test.js` | preserve exactly; historical 13-offset sequence explicitly NOT restored (heritage.md section C) |
| Daily decision surface | Hoje/agenda | PROVEN | `src/app.js` `renderToday()`; overdue/doneToday/tomorrow sections observed in live DOM; `data-review-list`/`data-count-for` attributes | preserve; becomes `/v1/agenda` server endpoint per design.md §4 (T20+) |
| Execution results | learning_evidence | PARTIAL — aggregate PROVEN, item-level GAP | `test/learning-evidence.test.js`; aggregate questionsCount+correctCount persisted and derived (confirmed via `src/stats.js`, `src/analytics.js`). Item-level `exercise_attempts`/`learning_events`/`competencies` (design.md §7) not yet implemented — planned T29-T33 | preserve aggregate path; build item-level reconstruction per design.md §7 (T29-T33), never fabricate individual attempts from aggregates |
| Discipline performance | analytics | PROVEN | `src/stats.js:40-57` sums `questionsCount`/`correctCount` across evidence before dividing (weighted), not per-session average | preserve; matches H-07 exactly, no change needed |
| Unit evolution | analytics | PROVEN | `src/analytics.js:112-144` `byUnit()`: `weightedAccuracy = totalC/totalQ` as primary metric; `scoresSequence` (per-session %) feeds `trend` only, never the primary ranking | preserve; matches H-07+H-08 exactly |
| Longitudinal tracking | Acompanhamento | PROVEN | `src/tracking-state.js`: exact precedence ATRASADO > SEM_EVIDENCIA > EM_REVISAO > EM_ESTUDO > EM_DIA (comment explicitly says "No arbitrary day-count rule"); `renderTracking()` in app.js; `test/tracking-state.test.js` | preserve exactly; matches design.md §10 canonical definition verbatim |
| Backup/recoverability | export/backup/migration | PARTIAL — client PROVEN, server GAP | `src/app.js` `exportBackup()`/`importBackup()` (client-side JSON export/import) exist and are used interactively. Server-side `/v1/backup/export`, `/v1/imports/preview`+`/commit` with checksum/idempotency (design.md §6) not yet implemented — planned T25-T28 | preserve client UX where useful; build NO_DATA_LOSS server migration pipeline (T25-T28) before any real cutover |

STATUS RULES:

PROVEN =
current product behavior is backed by executable evidence.

GAP =
the useful historical product function is not yet sufficiently represented.

SUPERSEDED =
the historical mechanism was deliberately replaced by a better current
contract.

No useful heritage function may silently disappear.

======================================================================
E. TASK INTEGRATION
======================================================================

Do NOT create T55.

Amend the existing task descriptions only as follows:

T02:
In addition to its current scope, create heritage.md and complete an initial
Heritage Coverage Matrix using CURRENT repo evidence.
Reconcile each historical function as PROVEN, GAP or SUPERSEDED.
Do not implement product features merely to fill the table.

T45:
When delivering priorities/analytics, verify H-05, H-06, H-07 and H-08:
volume+outcome, history/schedule separation, honest denominators and
unit-level evolution.

T49:
Representative student journeys must prove the modern end-to-end descendant
of the original core loop:

create learning unit
→ automatic schedule
→ Hoje decision
→ practice/review
→ evidence
→ analytics/tracking.

The student must not perform spreadsheet-like administration.

T52:
Add Heritage Coverage Matrix reconciliation to final integrated gate.
Every row must be PROVEN or explicitly SUPERSEDED.
A remaining material GAP blocks V1 validation unless the current approved
Product Constitution explicitly places it outside V1.

T54:
Final checkpoint must identify any historical capability deliberately
superseded or deferred so future agents do not accidentally "restore" old
spreadsheet behavior.

======================================================================
F. AUTHORITY
======================================================================

Authority order for this execution:

1. explicit current user/Product Constitution;
2. smartlearn-v1-consolidated-v2 spec/design/tasks;
3. current repo behavior/tests/governed current docs;
4. this Heritage Contract as product-discovery evidence;
5. historical spreadsheet compatibility/reverse-engineering artifacts.

The Heritage Contract protects useful product intent.

It does NOT override explicit current architecture.
