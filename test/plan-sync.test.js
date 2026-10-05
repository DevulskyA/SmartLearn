import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlanRegion, applyRegion, planDrift, orderProblems, phaseState, cut, BEGIN, END } from '../scripts/plan-sync.mjs';
import { programOrder, taskBlocks } from '../scripts/context-core.mjs';
import { parsePlan, checkInvariants, renderChecklistHtml } from '../scripts/tasklist.mjs';

// plan.md is the human-readable executable VIEW of tasks.md: generated, never hand-kept, impossible to diverge silently,
// every task exactly once (FASES), one [>] task row, distinct marks, honest phase markers.

const tasksText = [
  '### T-F1-01 — Foundation · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc1234` · Dependências: nenhuma', '',
  '### T-F1-02 — Active work · M', '- Status: `[>]` · Dependências: T-F1-01', '',
  '### T-F1-03 — Follow-up · S', '- Status: `[ ]` · Dependências: T-F1-01', '',
  '### T-F1-04 — Needs a human · S', '- Status: `[H]` · Dependências: HG-01', '',
  '### T-F1-05 — After the human · S', '- Status: `[ ]` · Dependências: T-F1-04', '',
  '### T-F1-06 — Gate without an HG id · S', '- Status: `[H]` · Dependências: T-F1-03', '',
  '### T-F1-07 — Waits for a gate that is not a task state · S', '- Status: `[ ]` · Dependências: T-F1-01, HG-02', '',
  '### T-F6-06 — Split parent · L', '- Status: `[=]` SPLIT em T-F6-06a, T-F6-06b · Dependências: nenhuma', '',
  '### T-F6-06a — Child A · S', '- Status: `[ ]` · Dependências: nenhuma', '',
  '### T-F6-06b — Child B · S', '- Status: `[✓]` IMPLEMENTATION_SHA `def5678` · Dependências: nenhuma', '',
  '### T-F7-01 — Only a gate left · S', '- Status: `[H]` · Dependências: HG-01', '',
  '### T-F8-01 — Done · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc9999` · Dependências: nenhuma', '',
].join('\n');
const programText = '| Sprint | Outcome | Tarefas |\n|---|---|---|\n| **S1** First | x | T-F1-02 → T-F1-03 → T-F6-06a → T-F6-06b |\n| **S7** Late | y | T-F7-01 |\n| **S8** Done | z | T-F8-01 |\n';
const specText = '| HG-01 | Humano decide algo que tem uma frase bem longa para cortar numa fronteira de palavra? | T-F1-04 | x |\n| HG-02 | Outro | T-F1-07 | x |\n';
const inputs = { tasksText, programText, specText };
const taskRows = (md) => [...md.matchAll(/^( *)- \[(.)\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\*/gm)].map((m) => ({ sub: m[1].length > 0, mark: m[2], id: m[3] }));

test('the generated view has the required sections; pointers are compact and carry no task rows', () => {
  const region = renderPlanRegion(inputs);
  for (const h of ['## EM EXECUÇÃO', '## PRÓXIMA', '## BLOQUEADO', '## FASES', '## HUMAN GATE']) assert.ok(region.includes(h), h);
  assert.match(region, /^ATIVA AGORA: T-F1-02 \(S1\) · PRÓXIMA: T-F1-03 · PROGRESSO: \d+\/\d+/m);
  const before = region.slice(0, region.indexOf('## FASES'));
  const after = region.slice(region.indexOf('## HUMAN GATE'));
  assert.equal(taskRows(before).length, 0, 'no checkbox task rows above FASES');
  assert.equal(taskRows(after).length, 0, 'no checkbox task rows in HUMAN GATE');
  assert.match(before, /^- T-F1-02 · Active work$/m);
  assert.ok(region.indexOf('## FASES') < region.indexOf('## HUMAN GATE'), 'the ordered roadmap comes before the gate list');
});

test('every task appears exactly once as a full row (FASES), subtasks nested under their split parent', () => {
  const rows = taskRows(renderPlanRegion(inputs));
  const ids = taskBlocks(tasksText).map((b) => b.id);
  assert.deepEqual([...rows.map((r) => r.id)].sort(), [...ids].sort());
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.deepEqual(rows.filter((r) => r.sub).map((r) => r.id), ['T-F6-06a', 'T-F6-06b']);
});

test('exactly one [>] task row, and the marks are distinct and consistent: x > space ! H =', () => {
  const rows = taskRows(renderPlanRegion(inputs));
  assert.equal(rows.filter((r) => r.mark === '>').length, 1);
  assert.equal(rows.find((r) => r.mark === '>').id, 'T-F1-02');
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.mark]));
  assert.deepEqual([byId['T-F1-01'], byId['T-F1-03'], byId['T-F1-04'], byId['T-F6-06']], ['x', ' ', 'H', '=']);
  assert.equal(taskRows(renderPlanRegion({ ...inputs, tasksText: tasksText.replace('- Status: `[ ]` · Dependências: T-F1-01\n', '- Status: `[!]` · Dependências: T-F1-01\n') })).find((r) => r.id === 'T-F1-03').mark, '!');
});

test('a phase is never [✓] while anything is pending; only gates left is [H]', () => {
  const heads = Object.fromEntries([...renderPlanRegion(inputs).matchAll(/^### \[(.)\] (\S+)/gm)].map((m) => [m[2], m[1]]));
  assert.equal(heads.S8, '✓');
  assert.equal(heads.S7, 'H');
  assert.equal(heads.S1, '>');
  const blocks = taskBlocks(tasksText);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const group of [['T-F1-01', 'T-F1-03'], ['T-F1-01', 'T-F1-04'], ['T-F1-04', 'T-F1-05'], ['T-F6-06a', 'T-F6-06b']]) {
    const state = phaseState(group.map((id) => byId.get(id)), byId);
    const pending = group.some((id) => byId.get(id).status !== '✓');
    if (pending) assert.notEqual(state, '✓', group.join('+'));
  }
});

test('gate labels: HG id + short title cut at a word boundary; a gate without an HG id shows its dependency chain; a row waiting for an HG is annotated', () => {
  const region = renderPlanRegion(inputs);
  assert.match(region, /^- T-F1-04 · Needs a human · HG-01 Humano decide algo que tem uma frase bem longa para$/m);
  assert.doesNotMatch(region, /…/);
  assert.match(region, /^- T-F1-06 · Gate without an HG id · aguarda T-F1-03$/m);
  assert.match(region, /^- \[ \] \*\*T-F1-07\*\* — .* — aguarda HG-02$/m);
  assert.ok(!/^- T-F1-07 /m.test(region.slice(region.indexOf('## BLOQUEADO'), region.indexOf('## FASES'))), 'tasks.md stays the authority: not [H]/[!] there, so not in BLOQUEADO');
  assert.equal(cut('Uma frase comprida demais para caber aqui dentro, de verdade', 30), 'Uma frase comprida demais para');
});

test('the panel gets exactly one active item, the generated phase list, and the one-line goal of the active TASK', () => {
  const plan = parsePlan(`# TRACK: T\n\nStatus: ACTIVE\n\n${renderPlanRegion(inputs)}\n`);
  assert.deepEqual(plan.tasks.map((t) => `${t.state}${t.id}`), ['✓BASE', '>S1', 'HS7', '✓S8', ' SEM-SPRINT']);
  assert.equal(plan.tasks.filter((t) => t.state === '>').length, 1);
  assert.deepEqual(checkInvariants(plan), []);
  assert.match(plan.tasks.find((t) => t.state === '>').fields.SPRINT_GOAL, /^T-F1-02 — Active work/);
});

test('the HTML shows each task once with the same ids and marks as plan.md, one [>] row, header, legend, and no mid-sentence ellipsis', () => {
  const md = `# TRACK: T\n\nStatus: ACTIVE\nMARCO ATUAL: S1 — x\n\n${renderPlanRegion(inputs)}\n`;
  const plan = parsePlan(md);
  const html = renderChecklistHtml({ tasks: plan.tasks, view: plan.view });
  const rows = taskRows(md);
  const lis = [...html.matchAll(/<li class="t((?: sub)?(?: now)?)"><span class="m">\[(.)\]<\/span><span class="x">(T-[A-Z0-9]+-\d+[a-z]?) —/g)];
  assert.deepEqual(lis.map((m) => [m[3], m[2]]), rows.map((r) => [r.id, r.mark]));
  assert.equal(lis.filter((m) => m[2] === '>').length, 1);
  assert.equal(lis.filter((m) => m[1].includes('now')).length, 1);
  assert.match(html, /TRACK:<\/strong> T/);
  assert.match(html, /MARCO ATUAL:<\/strong> S1/);
  assert.match(html, /PROGRESSO:<\/strong> 3\/\d+ tarefas/);
  assert.match(html, /class="muted legend"/);
  assert.ok(html.indexOf('<h2>FASES') < html.indexOf('<h2>HUMAN GATE'));
  assert.equal((html.match(/EXECUTANDO AGORA/g) ?? []).length, 1);
});

test('drift is detected in either direction and the region replacement is idempotent', () => {
  const plan = `header\n${renderPlanRegion(inputs)}\n`;
  assert.equal(planDrift(plan, inputs).drift, false);
  assert.equal(planDrift(plan.replace('- [x] **T-F1-01**', '- [ ] **T-F1-01**'), inputs).drift, true);
  assert.equal(planDrift(plan, { ...inputs, tasksText: tasksText.replace('`[ ]` · Dependências: T-F1-01', '`[!]` · Dependências: T-F1-01') }).drift, true);
  assert.equal(planDrift('no markers', inputs).drift, true);
  assert.equal(applyRegion(plan, renderPlanRegion(inputs)), plan);
  assert.ok(plan.includes(BEGIN) && plan.includes(END));
});

test('phases follow the sprint order of PROGRAM.md, tasks keep the order it gives, and done items stay where they are', () => {
  const heads = [...renderPlanRegion(inputs).matchAll(/^### \[.\] (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['BASE', 'S1', 'S7', 'S8', 'SEM-SPRINT']);
  const region = renderPlanRegion(inputs);
  const from = region.indexOf('## FASES');
  assert.ok(region.indexOf('**T-F1-02**', from) < region.indexOf('**T-F1-03**', from));
  const swapped = programText.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-02');
  assert.equal(planDrift(`h\n${region}\n`, { ...inputs, programText: swapped }).drift, true);
});

test('mutation: PROGRAM.md sequencing a task before its own dependency is refused', () => {
  const bad = programText.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-01');
  const r = planDrift(`h\n${renderPlanRegion(inputs)}\n`, { ...inputs, programText: bad });
  assert.equal(r.drift, true);
  assert.match(r.reason, /sequences T-F1-01 before its dependency|sequences T-F1-03/);
  assert.deepEqual(orderProblems(inputs), []);
});

test('ranges in PROGRAM.md ("T-F3-01..03") expand to every id in order', () => {
  assert.deepEqual(programOrder('| **S4** J | o | T-F3-01..03 | P1 | T-F1-01 |\n'), ['T-F3-01', 'T-F3-02', 'T-F3-03']);
});
