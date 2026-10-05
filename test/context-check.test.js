import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CANONICAL, checkContext, gitIo, contextReport, preservationProblems } from '../scripts/context-check.mjs';
import { resumeCockpit, taskBlocks, programOrder, boundaryCut } from '../scripts/context-core.mjs';
import { renderPlanFile } from '../scripts/plan-sync.mjs';

// PERSISTENCE GATE + COLD-START COCKPIT. After /clear a new session must find position, active task, next command and blockers
// from TRACKED files only, in a few dozen lines, and the structural gate must refuse every way that memory could leak out of Git.

const FEATURE = '.specs/features/hardening-roadmap-v1';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function fixture() {
  const files = {
    'CLAUDE.md': '# rules\n',
    '.specs/EXECUTION.md': '# map\nHANDOFF.md nunca é autoridade.\n1. `npm run context:resume`\n2. `.specs/ARTIFACTS.md` e `.specs/STATE.md`\n',
    '.specs/STATE.md': 'CURRENT_PHASE=S1\nACTIVE_TASK=ver context:resume\nLAST_PROVEN_MILESTONE=S0\nNEXT_MILESTONE=S2\nCRITICAL_BLOCKER=none\n',
    '.specs/ARTIFACTS.md': '# artifacts\n\n## A-01 — Big book\n- NAME: book\n- PURPOSE: real PDF\n- CANONICAL_LOCATION: C:/Users/Someone/Data/book.pdf ; D:/Other/place\n- SHA256: abc\n- REQUIRED_FOR: T-F1-02\n- AVAILABILITY: EXISTS\n- SENSITIVITY: DO_NOT_COMMIT\n',
    [`${FEATURE}/PROGRAM.md`]: '| Sprint | Outcome | Tarefas |\n|---|---|---|\n| **S1** First | does a thing | T-F1-02 → T-F1-03 |\n| **S2** Second | does another | T-F1-04 |\n',
    [`${FEATURE}/tasks.md`]: [
      '# Ledger', '', '## Regras de execução', '8. `CODEX_CALL_COUNT=0` em tudo. Nenhuma chamada ao Codex sem ordem.', '9. Proibido sem ordem explícita: push, merge, deploy.', '',
      '### T-F1-01 — Foundation · S', '- Status: `[✓]` 2026-10-04 · BASE_SHA `aaa1111` · IMPLEMENTATION_SHA `bbb2222` (evidência em `validation.md`) · Requisitos: R-01 · Dependências: nenhuma', '',
      '### T-F1-02 — Active work · M', '- Status: `[>]` · Requisitos: R-01 · Dependências: T-F1-01', '- Subtarefas:', '  - [>] RED: o teste da coisa falha pelo motivo certo', '  - [ ] GREEN: a coisa funciona', '- Outcome: the thing works', '- Gate: test passes', '- Próximo passo: run the thing', '- Comando: `npm test`', '',
      '### T-F1-03 — Follow-up · S', '- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-02', '- Subtarefas:', '  - [ ] RED: o teste do follow-up', '- Outcome: follow-up works', '- Gate: follow-up test passes', '',
      '### T-F1-04 — Independent · S', '- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-01 (anotação T-F1-03 só mencionada)', '- Subtarefas:', '  - [ ] RED: o teste independente', '- Outcome: independent works', '- Gate: independent test passes', '',
      '### T-F1-05 — Needs a human · S', '- Status: `[H]` · Requisitos: R-01 · Dependências: HG-01', '',
    ].join('\n'),
    [`${FEATURE}/spec.md`]: '### R-01 — Req\n\n| ID | Decisão |\n| HG-01 | Humano decide |\n| F-01 | achado |\n',
    [`${FEATURE}/validation.md`]: '# Validation\n\n### T-F1-01 — Foundation: PASS\n- proved\n',
    [`${FEATURE}/uat-visual.md`]: '# uat\n',
    'conductor/tracks.md': '# tracks\n',
  };
  // the plan is GENERATED from tasks.md (scripts/plan-sync.mjs), exactly as in the repository
  const inputs = { tasksText: files[`${FEATURE}/tasks.md`], programText: files[`${FEATURE}/PROGRAM.md`], specText: files[`${FEATURE}/spec.md`] };
  files['conductor/tracks/hardening-roadmap-v1/plan.md'] = renderPlanFile(inputs);
  return files;
}

function ioOf(files, { untracked = [], ignored = [] } = {}) {
  return {
    read: (p) => {
      assert.notEqual(p, '.specs/HANDOFF.md', 'the gate and the cockpit must never read HANDOFF.md');
      return files[p] ?? null;
    },
    tracked: (p) => p in files && !untracked.includes(p),
    ignored: (p) => ignored.includes(p),
  };
}
const run = (files, opts) => checkContext(ioOf(files, opts));
const mutate = (fn) => { const f = fixture(); fn(f); return f; };

test('a consistent set of tracked files passes the gate and names the active task', () => {
  const r = run(fixture());
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.active, 'T-F1-02');
});

test('the cockpit answers where am I from tracked files only, in a few lines, and never reads HANDOFF.md', () => {
  const lines = resumeCockpit(ioOf(fixture()).read, { head: 'abc1234 on branch' });
  const text = lines.join('\n');
  assert.ok(lines.length <= 40, `${lines.length} lines`);
  assert.match(text, /^HEAD=abc1234 on branch$/m);
  assert.match(text, /^PHASE=S1 — First$/m);
  assert.match(text, /^ACTIVE_TASK=T-F1-02 — Active work$/m);
  assert.match(text, /^ACTIVE_STATUS=IN_PROGRESS$/m);
  assert.match(text, /DONE_COUNT=1 {2}OPEN_COUNT=3 {2}BLOCKED_COUNT=0 {2}HUMAN_GATE_COUNT=1/);
  assert.match(text, /^TASKS=1\/5 /m);
  assert.doesNotMatch(text, /SUBTASKS=\d/, 'no global subtask total in the cockpit');
  assert.match(text, /^ACTIVE_SUBTASKS=T-F1-02 0\/2$/m);
  assert.match(text, /^NEXT_READY=T-F1-03 READY 0\/1 \| T-F1-04 READY 0\/1 {2}HORIZONTE_PREPARADO=2\/2$/m);
  assert.match(text, /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA/m, 'default: nothing recorded means not proven');
  const stale = resumeCockpit(ioOf(fixture()).read, { head: 'h', validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO' }).join('\n');
  assert.match(stale, /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \/ DESATUALIZADA/m);
  assert.match(text, /^CURRENT_GOAL=the thing works$/m);
  assert.match(text, /^CURRENT_PROOF_REQUIRED=test passes$/m);
  assert.match(text, /^NEXT_COMMAND=`npm test`$/m);
  assert.match(text, /^BLOCKERS_FOR_CURRENT=none$/m);
  assert.match(text, /grep -n "T-F1-02"/);
  assert.match(text, /DO_NOT_READ_NOW/);
});

test('the next tasks come from PROGRAM order and only when their dependencies are DONE: a task behind the active one is not offered; a parenthesised id is an annotation, not a dependency', () => {
  const files = fixture();
  const text = resumeCockpit(ioOf(files).read).join('\n');
  const next = /^NEXT_3_TASKS=(.*)$/m.exec(text)[1];
  assert.match(next, /T-F1-04/);
  assert.match(next, /T-F1-03/, 'T-F1-03 waits only for the ACTIVE task: it is the predictable NEXT 1');
  assert.doesNotMatch(next, /T-F1-05/, 'a HUMAN_GATE task is never offered as the next work');
  assert.deepEqual(programOrder(files[`${FEATURE}/PROGRAM.md`]), ['T-F1-02', 'T-F1-03', 'T-F1-04']);
  assert.deepEqual(taskBlocks(files[`${FEATURE}/tasks.md`]).find((b) => b.id === 'T-F1-04').deps, ['T-F1-01']);
});

test('finishing the active task moves the cockpit by itself: mark it DONE and the next eligible task becomes the candidate (no manual cockpit edit)', () => {
  const files = mutate((f) => {
    f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('- Status: `[>]` · Requisitos: R-01 · Dependências: T-F1-01', '- Status: `[✓]` · BASE_SHA `a` · IMPLEMENTATION_SHA `b` · Requisitos: R-01 · Dependências: T-F1-01');
  });
  const text = resumeCockpit(ioOf(files).read).join('\n');
  assert.match(text, /^ACTIVE_TASK=\(none/m, 'nothing is in progress until the next task is marked [>]');
  assert.match(/^NEXT_3_TASKS=(.*)$/m.exec(text)[1], /T-F1-03/, 'the follow-up is now eligible');
});

test('every way memory can leak out of Git fails the gate', () => {
  const must = (label, files, opts, pattern) => {
    const r = run(files, opts);
    assert.equal(r.ok, false, `${label}: should fail`);
    assert.ok(r.problems.some((p) => pattern.test(p)), `${label}: expected ${pattern} in ${JSON.stringify(r.problems)}`);
  };
  must('missing canonical file', mutate((f) => { delete f[`${FEATURE}/uat-visual.md`]; }), {}, /MISSING canonical file: .*uat-visual/);
  must('untracked canonical file', fixture(), { untracked: [`${FEATURE}/tasks.md`] }, /NOT TRACKED by Git: .*tasks\.md/);
  must('gitignored canonical file', fixture(), { ignored: ['.specs/STATE.md'] }, /GITIGNORED canonical file: \.specs\/STATE\.md/);
  must('no active task', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('`[>]`', '`[ ]`'); }), {}, /exactly ONE task must be in progress/);
  must('two active tasks', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-02', '- Status: `[>]` · Requisitos: R-01 · Dependências: T-F1-02'); }), {}, /exactly ONE task must be in progress/);
  must('active task without a next step', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('- Próximo passo: run the thing\n', ''); }), {}, /no "Próximo passo:" line/);
  must('dependency on an unknown task', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('Dependências: T-F1-01\n- Subtarefas:\n  - [>] RED: o teste da coisa', 'Dependências: T-F9-99\n- Subtarefas:\n  - [>] RED: o teste da coisa'); }), {}, /unknown task T-F9-99/);
  must('unknown human gate', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('Dependências: HG-01', 'Dependências: HG-77'); }), {}, /unknown gate HG-77/);
  must('unknown requirement', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('Requisitos: R-01 · Dependências: nenhuma', 'Requisitos: R-77 · Dependências: nenhuma'); }), {}, /unknown requirement R-77/);
  must('done without an implementation sha', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('IMPLEMENTATION_SHA `bbb2222` ', ''); }), {}, /done without IMPLEMENTATION_SHA/);
  must('done without evidence', mutate((f) => { f[`${FEATURE}/validation.md`] = '# Validation\n'; }), {}, /no section "### T-F1-01"/);
  must('plan does not name the active task', mutate((f) => { f['conductor/tracks/hardening-roadmap-v1/plan.md'] = f['conductor/tracks/hardening-roadmap-v1/plan.md'].replace('ATIVA AGORA: T-F1-02', 'ATIVA AGORA: T-F9-99'); }), {}, /does not name the active task T-F1-02/);
  must('plan checkbox hand-edited away from tasks.md', mutate((f) => { f['conductor/tracks/hardening-roadmap-v1/plan.md'] = f['conductor/tracks/hardening-roadmap-v1/plan.md'].replace('- [x] **T-F1-01**', '- [ ] **T-F1-01**'); }), {}, /plan diverges from tasks\.md/);
  must('tasks.md status changed without syncing the plan', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('### T-F1-03 — Follow-up · S\n- Status: `[ ]`', '### T-F1-03 — Follow-up · S\n- Status: `[!]`'); }), {}, /plan diverges from tasks\.md/);
  must('plan lists a task twice (duplication)', mutate((f) => { const k = 'conductor/tracks/hardening-roadmap-v1/plan.md'; f[k] = f[k].replace('## DECISÕES HUMANAS', '- [ ] **T-F1-03** — duplicate\n\n## DECISÕES HUMANAS'); }), {}, /more than once/);
  must('plan has a second active task row', mutate((f) => { const k = 'conductor/tracks/hardening-roadmap-v1/plan.md'; f[k] = f[k].replace('- [ ] **T-F1-03**', '- [>] **T-F1-03**'); }), {}, /exactly ONE active task row/);
  const withSubtasks = (list, task = 'T-F1-02') => (f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace(`### ${task} — `, `### ${task} — `).replace(/(### T-F1-02 — Active work · M\n- Status:[^\n]*\n)/, `$1- Subtarefas:\n${list}\n`); const k = 'conductor/tracks/hardening-roadmap-v1/plan.md'; f[k] = 'MARCO ATUAL: S1\n'; };
  must('active task with subtasks has no current subtask', mutate(withSubtasks('  - [x] a\n  - [ ] b')), {}, /exactly ONE current subtask/);
  must('active task has two current subtasks', mutate(withSubtasks('  - [>] a\n  - [>] b')), {}, /exactly ONE current subtask/);
  must('subtask group marked done with an undone child', mutate(withSubtasks('  - [x] g\n    - [x] a\n    - [>] b')), {}, /is \[x\] but a child is not done/);
  must('subtask indentation jumps a level', mutate(withSubtasks('  - [>] a\n      - [ ] deep')), {}, /nesting jumps/);
  must('done task with an unfinished subtask', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace(/(### T-F1-01 — Foundation · S\n- Status:[^\n]*\n)/, '$1- Subtarefas:\n  - [ ] left behind\n'); }), {}, /done but a subtask is not \[x\]/);
  must('only the active task may have a current subtask', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace(/(### T-F1-03 — Follow-up · S\n- Status:[^\n]*\n)/, '$1- Subtarefas:\n  - [>] a\n'); }), {}, /only the active task may have a current subtask/);
  must('plan lost its generated region', mutate((f) => { f['conductor/tracks/hardening-roadmap-v1/plan.md'] = 'MARCO ATUAL: S1\n'; }), {}, /plan diverges from tasks\.md: plan\.md has no PLAN/);
  must('external path with no manifest entry', mutate((f) => { f[`${FEATURE}/validation.md`] += '\nUses E:/Secret/place/data.db\n'; }), {}, /external path without an ARTIFACTS\.md entry: E:\/Secret/);
  must('manifest entry missing a field', mutate((f) => { f['.specs/ARTIFACTS.md'] = f['.specs/ARTIFACTS.md'].replace('- SHA256: abc\n', ''); }), {}, /ARTIFACTS A-01: missing field SHA256/);
  must('resume map does not disown the handoff', mutate((f) => { f['.specs/EXECUTION.md'] = f['.specs/EXECUTION.md'].replace('nunca é autoridade', 'é a posição'); }), {}, /never authority/);
  must('resume map points at a missing file', mutate((f) => { f['.specs/EXECUTION.md'] += 'veja `.specs/gone.md`\n'; }), {}, /points to a missing file: \.specs\/gone\.md/);
  must('resume map grows into memory', mutate((f) => { f['.specs/EXECUTION.md'] += 'x\n'.repeat(45); }), {}, /EXECUTION\.md has \d+ lines/);
  must('state grows into memory', mutate((f) => { f['.specs/STATE.md'] += 'x\n'.repeat(45); }), {}, /STATE\.md has \d+ lines/);
  must('state lost a field', mutate((f) => { f['.specs/STATE.md'] = f['.specs/STATE.md'].replace('CRITICAL_BLOCKER=none\n', ''); }), {}, /STATE\.md is missing CRITICAL_BLOCKER=/);
});

test('a manifest entry may list several locations, and a path inside the repository worktree needs none', () => {
  const files = mutate((f) => { f[`${FEATURE}/validation.md`] += '\nSee D:/Other/place/x and C:/Projetos/SmartLearn/.claude/worktrees/smartlearn-v1-complete/src/app.js\n'; });
  assert.deepEqual(run(files).problems, []);
});

test('deleting HANDOFF.md cannot matter: the gate and the cockpit never read it (the injected reader throws if they try)', () => {
  assert.doesNotThrow(() => run(fixture()));
  assert.doesNotThrow(() => resumeCockpit(ioOf(fixture()).read));
});

test('THIS repository passes its own persistence gate and its cockpit names an active task within 40 lines', () => {
  const io = gitIo(ROOT);
  const result = checkContext(io);
  assert.deepEqual(result.problems, []);
  const lines = resumeCockpit(io.read, { head: 'test' });
  assert.ok(lines.length <= 40);
  const cockpit = lines.join('\n');
  if (result.idle) {
    // only human decisions remain: no active task is legitimate
    assert.match(cockpit, /^ACTIVE_TASK=\(none\)$/m);
    assert.match(cockpit, /^SAFE_WORK_REMAINING=NO$/m);
  } else {
    assert.match(cockpit, /^ACTIVE_TASK=T-[A-Z0-9]+-\d+[a-z]? — /m);
    assert.match(cockpit, /^NEXT_COMMAND=\S/m);
  }
  assert.ok(CANONICAL.includes('.specs/ARTIFACTS.md') && CANONICAL.includes('.specs/STATE.md'));
});

test('the plan validation line is part of the gate: an old PASS in plan.md fails once the head is not proven; the same not-proven state passes', () => {
  const PLAN = 'conductor/tracks/hardening-roadmap-v1/plan.md';
  const stale = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO (testado aaaaaaa)';
  const pass = 'VALIDAÇÃO DO HEAD ATUAL: ✓ PASS (unit) em bbbbbbb';
  const withLine = (line) => {
    const files = fixture();
    files[PLAN] = renderPlanFile({ tasksText: files[`${FEATURE}/tasks.md`], programText: files[`${FEATURE}/PROGRAM.md`], specText: files[`${FEATURE}/spec.md`], validationLine: line });
    return files;
  };
  const check = (files, line) => checkContext({ ...ioOf(files), validationLine: () => line });
  assert.deepEqual(check(withLine(stale), stale).problems, []);
  assert.deepEqual(check(withLine(stale), 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA (nenhuma validação registrada para este HEAD)').problems, [], 'not proven stays not proven');
  assert.ok(check(withLine(pass), stale).problems.some((m) => /validation line is stale/.test(m)), 'old PASS in the plan, head no longer proven');
  assert.ok(check(withLine(stale), pass).problems.some((m) => /validation line is stale/.test(m)), 'head proven but the plan still says not proven');
});

test('the cockpit never cuts a sentence mid-way with an ellipsis: long values end at a boundary and point to the tasks.md block', () => {
  const files = fixture();
  const longGoal = 'o primeiro resultado esperado é claro e completo; o segundo resultado esperado também é descrito com bastante detalhe para ultrapassar o limite do cockpit, e continua ainda mais, descrevendo condições, exceções, provas e riscos até passar de duzentos e trinta caracteres no total.';
  files[`${FEATURE}/tasks.md`] = files[`${FEATURE}/tasks.md`].replace('- Outcome: the thing works', `- Outcome: ${longGoal}`).replace('- Comando: `npm test`', '- Comando: `node scripts/a.mjs` (resultado final conhecido); só reexecutar `bash scripts/muito-longo-nome-de-script-para-forçar-o-corte.sh --com --varios --argumentos --que --passam --do --limite --de --duzentos --e --trinta --caracteres --no --total --da --linha` com hipótese nova');
  const text = resumeCockpit(ioOf(files).read).join('\n');
  assert.doesNotMatch(text, /…/);
  const goal = /^CURRENT_GOAL=(.*)$/m.exec(text)[1];
  assert.match(goal, /\[completo: tasks\.md, bloco T-F1-02\]$/);
  assert.match(goal, /o primeiro resultado esperado é claro e completo; o segundo/);
  const cmd = /^NEXT_COMMAND=(.*)$/m.exec(text)[1];
  assert.equal((cmd.match(/`/g) ?? []).length % 2, 0, 'backticks stay balanced');
  assert.match(cmd, /\[completo: tasks\.md, bloco T-F1-02\]$/);
  assert.equal(boundaryCut('abc def ghi', 100), 'abc def ghi');
  assert.equal(boundaryCut('primeira frase inteira. segunda frase que passa do limite', 30), 'primeira frase inteira');
  assert.equal(boundaryCut('texto (com parêntese que não fecha antes do limite aqui', 30), 'texto');
});

test('EXECUTION_READY and PROMOTION: the active task and the next ready task must carry verifiable subtasks; Comando is optional', () => {
  const T = `${FEATURE}/tasks.md`;
  const strip = (f, id) => { f[T] = f[T].replace(new RegExp(`(### ${id} — [^\\n]*\\n- Status:[^\\n]*\\n)- Subtarefas:\\n(?:  - \\[.\\] [^\\n]*\\n)+`), '$1'); };
  assert.deepEqual(run(fixture()).problems, [], 'the consistent fixture passes (no Comando needed)');
  assert.deepEqual(run(mutate((f) => { f[T] = f[T].replace('- Comando: `npm test`\n', ''); })).problems, [], 'Comando is optional');
  const noActiveSubs = run(mutate((f) => strip(f, 'T-F1-02'))).problems;
  assert.ok(noActiveSubs.some((m) => /EXECUTION_READY: the active task T-F1-02 has no "Subtarefas:"/.test(m)), noActiveSubs.join('|'));
  const noNextSubs = run(mutate((f) => strip(f, 'T-F1-03'))).problems;
  assert.ok(noNextSubs.some((m) => /EXECUTION_READY: T-F1-03 is the next ready task but has no "Subtarefas:"/.test(m)), noNextSubs.join('|'));
  // closing the active task while the next ready task has no subtasks
  const closed = run(mutate((f) => { strip(f, 'T-F1-03'); f[T] = f[T].replace('- Status: `[>]` · Requisitos: R-01 · Dependências: T-F1-01', '- Status: `[✓]` · BASE_SHA aaa · IMPLEMENTATION_SHA bbb · Requisitos: R-01 · Dependências: T-F1-01'); })).problems;
  assert.ok(closed.some((m) => /PROMOTION: the active task was closed but the next ready task T-F1-03 has no "Subtarefas:"/.test(m)), closed.join('|'));
});

test('generic subtasks are refused on the active/READY tasks and only reported elsewhere; premature lists on distant tasks are reported, not hidden', () => {
  const T = `${FEATURE}/tasks.md`;
  const generic = run(mutate((f) => { f[T] = f[T].replace('  - [ ] GREEN: a coisa funciona', '  - [ ] Testar tudo'); })).problems;
  assert.ok(generic.some((m) => /T-F1-02: generic subtask\(s\) cannot be verified: "Testar tudo"/.test(m)), generic.join('|'));
  assert.ok(run(mutate((f) => { f[T] = f[T].replace('  - [ ] RED: o teste do follow-up', '  - [ ] trabalhar na implementação'); })).problems.some((m) => /T-F1-03: generic subtask/.test(m)));
  const far = mutate((f) => { f[T] = f[T].replace(/(### T-F1-05 — Needs a human · S\n- Status:[^\n]*\n)/, '$1- Subtarefas:\n  - [ ] Revisar código\n'); });
  const r = run(far);
  assert.deepEqual(r.problems, [], 'a distant task: only a warning');
  assert.ok(r.warnings.some((m) => /T-F1-05: generic subtask/.test(m)));
  assert.ok(r.warnings.some((m) => /premature subtask lists.*T-F1-05/.test(m)));
});

test('tasks.md minimum (Outcome/Fazer and Gate): fails only for the active and READY tasks, the rest is a count with the ids', () => {
  const T = `${FEATURE}/tasks.md`;
  const noGate = run(mutate((f) => { f[T] = f[T].replace('- Gate: follow-up test passes\n', ''); })).problems;
  assert.ok(noGate.some((m) => /T-F1-03: no Gate line/.test(m)), noGate.join('|'));
  const noOutcome = run(mutate((f) => { f[T] = f[T].replace('- Outcome: the thing works\n', ''); })).problems;
  assert.ok(noOutcome.some((m) => /T-F1-02: no Outcome\/Fazer line/.test(m)));
  const base = run(fixture());
  assert.deepEqual(base.minimum.noOutcome.sort(), ['T-F1-01', 'T-F1-05']);
  assert.ok(base.warnings.some((m) => /task blocks below the minimum: 2 without Outcome\/Fazer, 2 without Gate/.test(m)));
  assert.deepEqual(base.problems, [], 'tasks outside the active/READY set never fail the check');
});

// ---- the named properties of the progressive-elaboration contract, each with a mutation that must flip it to FAIL
const PLANP = 'conductor/tracks/hardening-roadmap-v1/plan.md';
const TASKSP = `${FEATURE}/tasks.md`;
const report = (files, extra = {}) => contextReport({ ...ioOf(files), validationLine: () => 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA (nenhuma validação registrada para este HEAD)', ...extra });
const get = (r, name) => r.results.find((x) => x.name === name);

test('NAMED PROPERTIES: the consistent fixture passes all of them', () => {
  const r = report(fixture());
  assert.deepEqual(r.results.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail}`), []);
  assert.deepEqual(r.results.map((x) => x.name), ['ALL_TASKS_VISIBLE', 'ACTIVE_TASK_FULLY_DECOMPOSED', 'ACTIVE_SUBTASK_VISIBLE', 'NEXT_TASK_IDENTIFIED', 'NEXT_TASK_EXECUTION_READY', 'NEAR_HORIZON_PREPARED', 'DISTANT_TASKS_NOT_PREMATURELY_EXPANDED', 'COMPLETED_TASKS_PRESERVED', 'SUBTASK_STATE_DURABLE', 'DEPENDENCY_VS_HUMAN_GATE', 'GLOBAL_TASK_PROGRESS_VALID', 'NO_FAKE_GLOBAL_SUBTASK_PROGRESS', 'PLAN_SYNC', 'CONTEXT_CHECK']);
  assert.equal(r.ok, true);
});

test('NAMED PROPERTIES: one mutation per property flips exactly that property to FAIL', () => {
  const plan = (f, fn) => { f[PLANP] = fn(f[PLANP]); return f; };
  const tasks = (f, fn) => { f[TASKSP] = fn(f[TASKSP]); return f; };
  const fails = (files, name, extra) => { const r = report(files, extra); assert.equal(get(r, name).pass, false, `${name} should FAIL: ${get(r, name).detail}`); return r; };

  fails(plan(fixture(), (p) => p.replace(/^- \[ \] \*\*T-F1-04\*\*.*\n/m, '')), 'ALL_TASKS_VISIBLE');
  fails(plan(fixture(), (p) => p + '\n  - [ ] **T-F1-03** — duplicated'), 'ALL_TASKS_VISIBLE');
  fails(tasks(fixture(), (t) => t.replace('  - [>] RED: o teste da coisa falha pelo motivo certo\n  - [ ] GREEN: a coisa funciona', '  - [ ] RED: o teste da coisa falha pelo motivo certo\n  - [ ] GREEN: a coisa funciona')), 'ACTIVE_TASK_FULLY_DECOMPOSED');
  fails(tasks(fixture(), (t) => t.replace('  - [ ] GREEN: a coisa funciona', '  - [ ] Testar tudo')), 'ACTIVE_TASK_FULLY_DECOMPOSED');
  fails(plan(fixture(), (p) => p.replace('  ← EM EXECUÇÃO', '')), 'ACTIVE_SUBTASK_VISIBLE');
  // NEXT: nothing ready while open work remains
  fails(tasks(fixture(), (t) => t.replace('- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-02', '- Status: `[✓]` · Requisitos: R-01 · Dependências: T-F1-02').replace('- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-01 (anotação', '- Status: `[✓]` · Requisitos: R-01 · Dependências: T-F1-01 (anotação')), 'NEXT_TASK_IDENTIFIED');
  const gate = fails(tasks(fixture(), (t) => t.replace('- Gate: follow-up test passes\n', '')), 'NEXT_TASK_EXECUTION_READY');
  assert.match(get(gate, 'NEXT_TASK_EXECUTION_READY').detail, /T-F1-03 lacks: Gate/, 'names the task and what it lacks');
  fails(tasks(fixture(), (t) => t.replace('- Subtarefas:\n  - [ ] RED: o teste independente\n', '')), 'NEAR_HORIZON_PREPARED');
  assert.equal(get(report(tasks(fixture(), (t) => t.replace('- Subtarefas:\n  - [ ] RED: o teste independente\n', ''))), 'NEAR_HORIZON_PREPARED').gating, false, 'the horizon is reported, never blocking');
  fails(tasks(fixture(), (t) => t.replace(/(### T-F1-05 — Needs a human · S\n- Status:[^\n]*\n)/, '$1- Subtarefas:\n  - [ ] RED: premature detail\n')), 'DISTANT_TASKS_NOT_PREMATURELY_EXPANDED');
  // PRESERVED: a done task regresses / a done subtask vanishes (compared with the previous committed tasks.md)
  const before = fixture()[TASKSP];
  const regressed = before.replace('- Status: `[✓]` 2026-10-04', '- Status: `[>]` 2026-10-04');
  fails(tasks(fixture(), () => regressed), 'COMPLETED_TASKS_PRESERVED', { previousTasks: () => before });
  // an explicit, documented reopen (a wrong close) is allowed; silently un-doing a task is not
  assert.deepEqual(preservationProblems(before, regressed.replace('- Status: `[>]` 2026-10-04', '- Status: `[>]` REABERTA 2026-10-04')), []);
  assert.equal(preservationProblems(before, regressed).length > 0, true);
  const withDone = before.replace(/(### T-F1-04 — Independent · S\n- Status:[^\n]*\n- Subtarefas:\n)/, '$1  - [x] já feito antes\n');
  fails(tasks(fixture(), () => before), 'COMPLETED_TASKS_PRESERVED', { previousTasks: () => withDone });
  assert.deepEqual(preservationProblems(before, before), []);
  assert.deepEqual(preservationProblems(withDone, withDone.replace('  - [x] já feito antes\n', '  - [x] já feito antes\n')), []);
  // a distant not-done list may be removed (premature elaboration undone): not a loss
  const distant = before.replace(/(### T-F1-05 — Needs a human · S\n- Status:[^\n]*\n)/, '$1- Subtarefas:\n  - [ ] cedo demais\n');
  assert.deepEqual(preservationProblems(distant, before), []);
  fails(plan(fixture(), (p) => p.replace('  - [>] RED: o teste da coisa falha pelo motivo certo  ← EM EXECUÇÃO', '  - [>] RED: o teste mudou só no plano  ← EM EXECUÇÃO')), 'SUBTASK_STATE_DURABLE');
  fails(plan(fixture(), (p) => p.replace(/(## DECISÕES HUMANAS PENDENTES\n\n)/, '$1- T-F1-03 · Follow-up · aguarda só uma dependência\n')), 'DEPENDENCY_VS_HUMAN_GATE');
  fails(plan(fixture(), (p) => p.replace(/TAREFAS: \d+\/\d+/, 'TAREFAS: 9/5')), 'GLOBAL_TASK_PROGRESS_VALID');
  fails(plan(fixture(), (p) => p.replace('SUBTAREFAS DA ATIVA:', 'SUBTAREFAS: 3/6 · SUBTAREFAS DA ATIVA:')), 'NO_FAKE_GLOBAL_SUBTASK_PROGRESS');
  fails(plan(fixture(), (p) => p.replace(/^### \[(.)\] (S1 · First — tarefas \d+\/\d+)$/m, '### [$1] $2 · subtarefas 3/6')), 'NO_FAKE_GLOBAL_SUBTASK_PROGRESS');
  fails(plan(fixture(), (p) => p.replace('## ROADMAP', '## ROADMAP\n\ntexto solto')), 'PLAN_SYNC');
  fails(tasks(fixture(), (t) => t.replace('Dependências: T-F1-01\n- Subtarefas:', 'Dependências: T-F9-99\n- Subtarefas:')), 'CONTEXT_CHECK');
});

test('NAMED PROPERTIES: a gating FAIL fails the report; the two advisory properties never do', () => {
  const advisoryOnly = report(mutate((f) => { f[TASKSP] = f[TASKSP].replace('- Subtarefas:\n  - [ ] RED: o teste independente\n', ''); }));
  assert.equal(get(advisoryOnly, 'NEAR_HORIZON_PREPARED').pass, false);
  assert.equal(advisoryOnly.results.filter((x) => x.gating && !x.pass).length > 0, true, 'T-F1-04 is also checked by the gating minimum, so this report fails for that reason');
  const premature = report(mutate((f) => { f[TASKSP] = f[TASKSP].replace(/(### T-F1-05 — Needs a human · S\n- Status:[^\n]*\n)/, '$1- Subtarefas:\n  - [ ] RED: premature detail\n'); }));
  assert.equal(get(premature, 'DISTANT_TASKS_NOT_PREMATURELY_EXPANDED').pass, false);
});

// IDLE PROGRAM: when every remaining task is a human decision (or waits for one), there is legitimately NO active task. The gate must
// pass with ACTIVE_TASK=NONE and SAFE_WORK_REMAINING=NO; it must still refuse "no active task" while runnable work remains.
function idleFixture() {
  const files = fixture();
  const k = `${FEATURE}/tasks.md`;
  files[k] = files[k]
    .replace('- Status: `[>]` · Requisitos: R-01 · Dependências: T-F1-01', '- Status: `[✓]` · BASE_SHA `a` · IMPLEMENTATION_SHA `b` · Requisitos: R-01 · Dependências: T-F1-01')
    .replace('  - [>] RED: o teste da coisa falha pelo motivo certo\n  - [ ] GREEN: a coisa funciona', '  - [x] RED: o teste da coisa falha pelo motivo certo\n  - [x] GREEN: a coisa funciona')
    .replace('- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-02', '- Status: `[H]` · Requisitos: R-01 · Dependências: HG-01')
    .replace('- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-01 (anotação', '- Status: `[H]` · Requisitos: R-01 · Dependências: HG-01 (anotação');
  files[`${FEATURE}/validation.md`] += '\n### T-F1-02 — Active work: PASS\n- proved\n';
  files['conductor/tracks/hardening-roadmap-v1/plan.md'] = renderPlanFile({ tasksText: files[k], programText: files[`${FEATURE}/PROGRAM.md`], specText: files[`${FEATURE}/spec.md`] });
  return files;
}

test('an idle program (only human decisions left) passes with ACTIVE_TASK=NONE and SAFE_WORK_REMAINING=NO', () => {
  const files = idleFixture();
  const r = run(files);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.active, null);
  assert.equal(r.idle, true);
  const rep = report(files);
  assert.equal(rep.ok, true, JSON.stringify(rep.results.filter((x) => !x.pass)));
  const text = resumeCockpit(ioOf(files).read).join('\n');
  assert.match(text, /^ACTIVE_TASK=\(none\)$/m);
  assert.match(text, /^SAFE_WORK_REMAINING=NO$/m);
});

test('with runnable work left, "no active task" is still refused and the cockpit says SAFE_WORK_REMAINING=YES', () => {
  const files = mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('`[>]`', '`[ ]`'); });
  const r = run(files);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /exactly ONE task must be in progress/.test(p)));
  assert.match(resumeCockpit(ioOf(files).read).join('\n'), /^SAFE_WORK_REMAINING=YES$/m);
});

test('an idle program with a stray active row in the plan is refused', () => {
  const files = idleFixture();
  const k = 'conductor/tracks/hardening-roadmap-v1/plan.md';
  files[k] = files[k].replace('- [x] **T-F1-02**', '- [>] **T-F1-02**');
  const r = run(files);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /NO active (phase|task row)/.test(p)), JSON.stringify(r.problems));
});
