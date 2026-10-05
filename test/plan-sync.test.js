import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlanRegion, applyRegion, planDrift, orderProblems, BEGIN, END } from '../scripts/plan-sync.mjs';
import { programOrder } from '../scripts/context-core.mjs';
import { parsePlan, checkInvariants } from '../scripts/tasklist.mjs';

// plan.md is the human-readable executable VIEW of tasks.md: generated, never hand-kept, and impossible to diverge silently.

const tasksText = [
  '### T-F1-01 — Foundation · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc1234` · Dependências: nenhuma', '',
  '### T-F1-02 — Active work · M', '- Status: `[>]` · Dependências: T-F1-01', '',
  '### T-F1-03 — Follow-up · S', '- Status: `[ ]` · Dependências: T-F1-01', '',
  '### T-F1-04 — Needs a human · S', '- Status: `[H]` · Dependências: HG-01', '',
  '### T-F1-05 — After the human · S', '- Status: `[ ]` · Dependências: T-F1-04', '',
  '### T-F6-06 — Split parent · L', '- Status: `[=]` SPLIT em T-F6-06a, T-F6-06b · Dependências: nenhuma', '',
  '### T-F6-06a — Child A · S', '- Status: `[ ]` · Dependências: nenhuma', '',
  '### T-F6-06b — Child B · S', '- Status: `[✓]` IMPLEMENTATION_SHA `def5678` · Dependências: nenhuma', '',
].join('\n');
const programText = '| Sprint | Outcome | Tarefas |\n|---|---|---|\n| **S1** First | x | T-F1-02 → T-F1-03 → T-F6-06a → T-F6-06b |\n';
const specText = '| HG-01 | Humano decide algo |\n';
const inputs = { tasksText, programText, specText };

test('the generated view has the required sections, one active item, checkboxes and subtasks', () => {
  const region = renderPlanRegion(inputs);
  for (const h of ['## EM EXECUÇÃO', '## PRÓXIMA', '## BLOQUEADO', '## HUMAN GATE', '## FASES']) assert.ok(region.includes(h), h);
  assert.match(region, /^ATIVA AGORA: T-F1-02 \(S1\) · PRÓXIMA: T-F1-03/m);
  assert.match(region, /^- \[x\] \*\*T-F1-01\*\*/m);
  assert.match(region, /^- \[ \] \*\*T-F1-04\*\* — Needs a human — HG-01 Humano decide algo/m);
  assert.match(region, /^- \[ \] \*\*T-F1-05\*\* — After the human — aguarda T-F1-04/m);
  assert.match(region, /^  - \[ \] \*\*T-F6-06a\*\*/m);
  assert.match(region, /^  - \[x\] \*\*T-F6-06b\*\*/m);
  assert.ok(!/^- \[.\] \*\*T-F6-06[ab]\*\*/m.test(region), 'children appear only nested under their parent');
});

test('the panel still gets exactly one active item: the phase that holds the active task', () => {
  const plan = parsePlan(`# TRACK: T\n\nStatus: ACTIVE\n\n${renderPlanRegion(inputs)}\n`);
  assert.deepEqual(plan.tasks.map((t) => `${t.state}${t.id}`), ['✓BASE', '>S1', '!SEM-SPRINT']);
  assert.deepEqual(checkInvariants(plan), []);
});

test('drift is detected in either direction and the region replacement is idempotent', () => {
  const plan = `header\n${renderPlanRegion(inputs)}\n`;
  assert.equal(planDrift(plan, inputs).drift, false);
  assert.equal(planDrift(plan.replace('- [x] **T-F1-01**', '- [ ] **T-F1-01**'), inputs).drift, true);
  assert.equal(planDrift(plan, { ...inputs, tasksText: tasksText.replace('`[ ]` · Dependências: T-F1-01', '`[!]` · Dependências: T-F1-01') }).drift, true);
  assert.equal(planDrift('no markers', inputs).drift, true);
  const again = applyRegion(plan, renderPlanRegion(inputs));
  assert.equal(again, plan);
  assert.ok(plan.includes(BEGIN) && plan.includes(END));
});

test('phases follow the sprint order of PROGRAM.md, tasks keep the order it gives, and done items stay where they are', () => {
  const two = programText + '| **S2** Second | y | T-F1-05 |\n';
  const region = renderPlanRegion({ ...inputs, programText: two });
  const heads = [...region.matchAll(/^### \[.\] (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['BASE', 'S1', 'S2', 'SEM-SPRINT']);
  const from = region.indexOf('## FASES');
  assert.ok(region.indexOf('**T-F1-02**', from) < region.indexOf('**T-F1-03**', from));
  // reordering PROGRAM.md reorders the plan: a stale plan is drift
  const swapped = two.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-02');
  assert.equal(planDrift(`h\n${region}\n`, { ...inputs, programText: swapped }).drift, true);
});

test('mutation: PROGRAM.md sequencing a task before its own dependency is refused', () => {
  const bad = programText.replace('T-F1-02 → T-F1-03', 'T-F1-02 → T-F1-01');
  const r = planDrift(`h\n${renderPlanRegion(inputs)}\n`, { ...inputs, programText: bad });
  assert.equal(r.drift, true);
  assert.match(r.reason, /sequences T-F1-02 before its dependency T-F1-01/);
  assert.deepEqual(orderProblems(inputs), []);
});

test('ranges in PROGRAM.md ("T-F3-01..03") expand to every id in order', () => {
  assert.deepEqual(programOrder('| **S4** J | o | T-F3-01..03 | P1 | T-F1-01 |\n'), ['T-F3-01', 'T-F3-02', 'T-F3-03']);
});
