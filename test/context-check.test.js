import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CANONICAL, checkContext, gitIo } from '../scripts/context-check.mjs';
import { resumeCockpit, taskBlocks, programOrder } from '../scripts/context-core.mjs';
import { renderPlanRegion } from '../scripts/plan-sync.mjs';

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
      '### T-F1-02 — Active work · M', '- Status: `[>]` · Requisitos: R-01 · Dependências: T-F1-01', '- Outcome: the thing works', '- Gate: test passes', '- Próximo passo: run the thing', '- Comando: `npm test`', '',
      '### T-F1-03 — Follow-up · S', '- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-02', '',
      '### T-F1-04 — Independent · S', '- Status: `[ ]` · Requisitos: R-01 · Dependências: T-F1-01 (anotação T-F1-03 só mencionada)', '',
      '### T-F1-05 — Needs a human · S', '- Status: `[H]` · Requisitos: R-01 · Dependências: HG-01', '',
    ].join('\n'),
    [`${FEATURE}/spec.md`]: '### R-01 — Req\n\n| ID | Decisão |\n| HG-01 | Humano decide |\n| F-01 | achado |\n',
    [`${FEATURE}/validation.md`]: '# Validation\n\n### T-F1-01 — Foundation: PASS\n- proved\n',
    [`${FEATURE}/uat-visual.md`]: '# uat\n',
    'conductor/tracks.md': '# tracks\n',
  };
  // the plan is GENERATED from tasks.md (scripts/plan-sync.mjs), exactly as in the repository
  const inputs = { tasksText: files[`${FEATURE}/tasks.md`], programText: files[`${FEATURE}/PROGRAM.md`], specText: files[`${FEATURE}/spec.md`] };
  files['conductor/tracks/hardening-roadmap-v1/plan.md'] = `MARCO ATUAL: S1\n\n${renderPlanRegion(inputs)}\n`;
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
  assert.match(text, /^PHASE=S1$/m);
  assert.match(text, /^ACTIVE_TASK=T-F1-02 — Active work$/m);
  assert.match(text, /^ACTIVE_STATUS=IN_PROGRESS$/m);
  assert.match(text, /DONE_COUNT=1 {2}OPEN_COUNT=3 {2}BLOCKED_COUNT=0 {2}HUMAN_GATE_COUNT=1/);
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
  assert.doesNotMatch(next, /T-F1-03/, 'T-F1-03 depends on the active task');
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
  must('active task without a command', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('- Comando: `npm test`\n', ''); }), {}, /no "Comando:" line/);
  must('active task without a next step', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('- Próximo passo: run the thing\n', ''); }), {}, /no "Próximo passo:" line/);
  must('dependency on an unknown task', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('Dependências: T-F1-01\n- Outcome', 'Dependências: T-F9-99\n- Outcome'); }), {}, /unknown task T-F9-99/);
  must('unknown human gate', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('Dependências: HG-01', 'Dependências: HG-77'); }), {}, /unknown gate HG-77/);
  must('unknown requirement', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('Requisitos: R-01 · Dependências: nenhuma', 'Requisitos: R-77 · Dependências: nenhuma'); }), {}, /unknown requirement R-77/);
  must('done without an implementation sha', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('IMPLEMENTATION_SHA `bbb2222` ', ''); }), {}, /done without IMPLEMENTATION_SHA/);
  must('done without evidence', mutate((f) => { f[`${FEATURE}/validation.md`] = '# Validation\n'; }), {}, /no section "### T-F1-01"/);
  must('plan does not name the active task', mutate((f) => { f['conductor/tracks/hardening-roadmap-v1/plan.md'] = f['conductor/tracks/hardening-roadmap-v1/plan.md'].replace('ATIVA AGORA: T-F1-02', 'ATIVA AGORA: T-F9-99'); }), {}, /does not name the active task T-F1-02/);
  must('plan checkbox hand-edited away from tasks.md', mutate((f) => { f['conductor/tracks/hardening-roadmap-v1/plan.md'] = f['conductor/tracks/hardening-roadmap-v1/plan.md'].replace('- [x] **T-F1-01**', '- [ ] **T-F1-01**'); }), {}, /plan diverges from tasks\.md/);
  must('tasks.md status changed without syncing the plan', mutate((f) => { f[`${FEATURE}/tasks.md`] = f[`${FEATURE}/tasks.md`].replace('### T-F1-03 — Follow-up · S\n- Status: `[ ]`', '### T-F1-03 — Follow-up · S\n- Status: `[!]`'); }), {}, /plan diverges from tasks\.md/);
  must('plan lists a task twice (duplication)', mutate((f) => { const k = 'conductor/tracks/hardening-roadmap-v1/plan.md'; f[k] = f[k].replace('## HUMAN GATE', '- [ ] **T-F1-03** — duplicate\n\n## HUMAN GATE'); }), {}, /more than once/);
  must('plan has a second active task row', mutate((f) => { const k = 'conductor/tracks/hardening-roadmap-v1/plan.md'; f[k] = f[k].replace('- [ ] **T-F1-03**', '- [>] **T-F1-03**'); }), {}, /exactly ONE active task row/);
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
  assert.match(lines.join('\n'), /^ACTIVE_TASK=T-[A-Z0-9]+-\d+[a-z]? — /m);
  assert.match(lines.join('\n'), /^NEXT_COMMAND=\S/m);
  assert.ok(CANONICAL.includes('.specs/ARTIFACTS.md') && CANONICAL.includes('.specs/STATE.md'));
});
