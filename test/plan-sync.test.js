import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { renderPlanRegion, renderPlanFile, applyRegion, planDrift, syncPlanFile, orderProblems, phaseState, cut, firstSentence, BEGIN, END } from '../scripts/plan-sync.mjs';
import { programOrder, taskBlocks, parseSubtasks, subtaskCounts, classifyTasks, progressCounts, buildModel, resumeCockpit, FILES } from '../scripts/context-core.mjs';
import { parsePlan, checkInvariants, renderChecklistHtml } from '../scripts/tasklist.mjs';

// plan.md is a PURE PROJECTION of the normalized execution model (tasks.md + PROGRAM.md + spec.md): generated, byte-identical when
// regenerated, impossible to diverge silently. Progressive elaboration: AGORA (active, full tree) · PRÓXIMO (READY with subtasks) ·
// ROADMAP (every task, one line) · BLOQUEADAS · DECISÕES HUMANAS PENDENTES · VALIDAÇÃO. Global progress is tasks only.

const tasksText = [
  '### T-F1-01 — Foundation · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc1234` · Dependências: nenhuma', '',
  '### T-F1-02 — Active work · M', '- Status: `[>]` · Dependências: T-F1-01', '- Estado: execução concluída; nada em execução agora.', '- Resultado: causa NOT_PROVEN; nenhuma correção feita. Depois segue.', '- Subtarefas:',
  '  - [x] Group A', '    - [x] step a1', '    - [x] step a2', '  - [>] Step B (current)', '  - [ ] Step C', '- Gate: o gate da ativa passa; mais detalhes aqui.', '- Próximo passo: decidir o fechamento (subtarefa `[>]`); nada além disso.', '',
  '### T-F1-03 — Follow-up with subtasks · S', '- Status: `[ ]` · Dependências: T-F1-01', '- Subtarefas:', '  - [x] one', '  - [ ] two', '',
  '### T-F1-04 — Needs a human · S', '- Status: `[H]` · Dependências: HG-01', '',
  '### T-F1-05 — After the human · S', '- Status: `[ ]` · Dependências: T-F1-04', '',
  '### T-F1-06 — Marked H but only waits for a task · S', '- Status: `[H]` · Dependências: T-F1-03', '- Fazer: medir tudo automaticamente.', '',
  '### T-F1-07 — Waits for a gate id · S', '- Status: `[ ]` · Dependências: T-F1-01, HG-02', '',
  '### T-F6-06 — Split parent · L', '- Status: `[=]` SPLIT em T-F6-06a, T-F6-06b · Dependências: nenhuma', '',
  '### T-F6-06a — Child A · S', '- Status: `[ ]` · Dependências: nenhuma', '',
  '### T-F6-06b — Child B · S', '- Status: `[✓]` IMPLEMENTATION_SHA `def5678` · Dependências: nenhuma', '',
  '### T-F7-01 — Only a gate left · S', '- Status: `[H]` · Dependências: HG-01', '',
  '### T-F7-02 — Decision after the gate · S', '- Status: `[H]` · Dependências: T-F7-01', '- Fazer: decisão humana registrada.', '',
  '### T-F8-01 — Done · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc9999` · Dependências: nenhuma', '',
].join('\n');
const programText = '| Sprint | Outcome | Tarefas |\n|---|---|---|\n| **S1** First | x | T-F1-02 → T-F1-03 → T-F6-06a → T-F6-06b |\n| **S7** Late | y | T-F7-01 → T-F7-02 |\n| **S8** Done | z | T-F8-01 |\n';
const specText = '| HG-01 | Humano decide algo que tem uma frase bem longa para cortar numa fronteira de palavra? | T-F1-04 | x |\n| HG-02 | Outro | T-F1-07 | x |\n';
const inputs = { tasksText, programText, specText };
const taskRows = (md) => [...md.matchAll(/^( *)- \[(.)\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\*/gm)].map((m) => ({ sub: m[1].length > 0, mark: m[2], id: m[3] }));
const section = (md, name) => new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |<!-- PLAN:END)`, 'm').exec(md)?.[1] ?? '';

test('subtasks: parsed from the compact checkbox list inside the task block, leaves counted, malformed lists reported', () => {
  const b = taskBlocks(tasksText).find((t) => t.id === 'T-F1-02');
  assert.deepEqual(b.subtasks.map((r) => `${r.depth}${r.mark}${r.leaf ? 'L' : 'G'}`), ['0xG', '1xL', '1xL', '0>L', '0 L']);
  assert.deepEqual(subtaskCounts(b.subtasks), { done: 2, total: 4 });
  assert.deepEqual(b.subtaskProblems, []);
  const bad = parseSubtasks('- Subtarefas:\n  - [x] group\n    - [ ] child\n   - [ ] odd indent\n      - [ ] jump\n');
  assert.ok(bad.subtaskProblems.some((m) => /group "group" is \[x\] but a child is not done/.test(m)));
  assert.ok(bad.subtaskProblems.some((m) => /multiple of 2/.test(m)));
  assert.ok(parseSubtasks('- Subtarefas:\n  - [ ] g\n    - [x] a\n').subtaskProblems.some((m) => /every child done but is not \[x\]/.test(m)));
  assert.ok(parseSubtasks('- Subtarefas:\n  - [ ] g\n    - [>] a\n').subtaskProblems.some((m) => /holds the current step but is not \[>\]/.test(m)));
  assert.deepEqual(parseSubtasks('- Status: x\n- Fazer: y\n'), { subtasks: [], subtaskProblems: [] });
});

test('the file has the contract order and titles: H1, AGORA, PRÓXIMO, ROADMAP, BLOQUEADAS, DECISÕES HUMANAS PENDENTES, VALIDAÇÃO', () => {
  const md = renderPlanFile(inputs);
  assert.match(md, /^# SMARTLEARN — DESENVOLVIMENTO\n/);
  const h2 = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(h2, ['AGORA', 'PRÓXIMO', 'ROADMAP', 'BLOQUEADAS', 'DECISÕES HUMANAS PENDENTES', 'VALIDAÇÃO']);
  assert.match(md, /^Track: .*Status: ACTIVE$/m);
  assert.match(md, /^MARCO ATUAL: S1 — First$/m);
});

test('three densities: AGORA = active task (Estado/Resultado atual/Próximo passo/Gate + tree, current subtask marked); PRÓXIMO = READY blocks; ROADMAP = every task on one line', () => {
  const region = renderPlanRegion(inputs);
  const agora = section(region, 'AGORA');
  assert.match(agora, /^- T-F1-02 · Active work · S1 · subtarefas 2\/4$/m);
  assert.match(agora, /^ {2}Estado: Execução concluída; nada em execução agora$/m);
  assert.match(agora, /^ {2}Resultado atual: Causa NOT_PROVEN; nenhuma correção feita$/m);
  assert.match(agora, /^ {2}Próximo passo: Decidir o fechamento$/m);
  assert.match(agora, /^ {2}Gate: O gate da ativa passa; mais detalhes aqui$/m, 'one full sentence of the Gate line');
  assert.match(agora, /^ {2}- \[x\] Group A$/m);
  assert.match(agora, /^ {4}- \[x\] step a1$/m);
  assert.match(agora, /^ {2}- \[>\] Step B \(current\)  ← EM EXECUÇÃO$/m);
  assert.equal((region.match(/^ +- \[.\] .*← EM EXECUÇÃO$/gm) ?? []).length, 1, 'only the current subtask line carries the marker');
  assert.ok(agora.indexOf('Estado:') < agora.indexOf('- [x] Group A'), 'facts come before the tree');
  const prox = section(region, 'PRÓXIMO');
  assert.match(prox, /^### T-F1-03 — READY — Follow-up with subtasks$/m);
  assert.match(prox, /^ {2}Subtarefas 1\/2:\n {2}- \[x\] one\n {2}- \[ \] two$/m);
  assert.doesNotMatch(prox, /T-F6-06a/, 'ONE next outcome only: the following ready task stays in ROADMAP, one line');
  const bare = section(renderPlanRegion({ ...inputs, tasksText: tasksText.replace('- Subtarefas:\n  - [x] one\n  - [ ] two\n', '') }), 'PRÓXIMO');
  assert.match(bare, /^### T-F1-03 — SEM SUBTAREFAS \(não pronta\) — Follow-up with subtasks$/m, 'a next task without subtasks is visible and labelled, never hidden');
  const roadmap = region.slice(region.indexOf('## ROADMAP'), region.indexOf('## BLOQUEADAS'));
  assert.equal(taskRows(roadmap).length, taskBlocks(tasksText).length, 'every task is one ROADMAP line');
  assert.doesNotMatch(roadmap, /step a1|\[ \] two|\[x\] one/, 'ROADMAP never expands subtasks');
  assert.equal((region.match(/step a1/g) ?? []).length, 1, 'the active tree exists once');
  assert.equal(taskRows(region.slice(0, region.indexOf('## ROADMAP'))).length, 0, 'no full task rows before ROADMAP');
  assert.doesNotMatch(roadmap, /subtarefas/);
});

test('metrics: global TAREFAS only; subtasks only for the active task and the READY ones; no global subtask total anywhere', () => {
  const region = renderPlanRegion(inputs);
  assert.match(region, /^ATIVA AGORA: T-F1-02 \(S1\) · PRÓXIMA: T-F1-03 · TAREFAS: \d+\/\d+ · SUBTAREFAS DA ATIVA: T-F1-02 2\/4 · BLOQUEADAS: /m);
  assert.doesNotMatch(region, /HORIZONTE/);
  assert.doesNotMatch(region, /SUBTAREFAS: \d/);
  const model = buildModel(inputs);
  assert.deepEqual(model.ready.map((r) => r.id), ['T-F1-03'], 'PRÓXIMO is ONE prepared outcome');
  assert.equal('subDone' in progressCounts(model.blocks), false);
  const files = { [FILES.tasks]: tasksText, [FILES.program]: programText, [FILES.spec]: specText };
  const cockpit = resumeCockpit((p) => files[p] ?? null, { head: 'h' }).join('\n');
  assert.doesNotMatch(cockpit, /SUBTASKS=\d/);
  assert.match(cockpit, /^CURRENT_STEP=Step B \(current\) · /m);
  assert.match(cockpit, /^NEXT_OUTCOME=T-F1-03 — Follow-up with subtasks$/m);
});

test('ONE projection: plan.md, the HTML board and the cockpit show the same numbers because they render the same model', () => {
  const model = buildModel(inputs);
  const md = renderPlanFile(inputs);
  const html = renderChecklistHtml({ tasks: [], view: model, title: 'T' });
  const files = { [FILES.tasks]: tasksText, [FILES.program]: programText, [FILES.spec]: specText };
  const cockpit = resumeCockpit((p) => files[p] ?? null, { head: 'h' }).join('\n');
  const { tasksDone: d, tasksTotal: t } = model.progress;
  assert.match(md, new RegExp(`TAREFAS: ${d}/${t} `));
  assert.match(html, new RegExp(`tarefas ${d}/${t} · subtarefas da ativa T-F1-02 2/4`));
  assert.match(cockpit, new RegExp(`^TASKS=${d}/${t} `, 'm'));
  assert.match(cockpit, /^TASKS=\d+\/\d+ · PHASE=S1 — First · /m);
  assert.deepEqual(parsePlan(md).tasks.map((x) => x.id), model.phases.map((p) => p.id), 'the legacy phase list also comes out of the same plan');
});

test('every task appears exactly once as a full row, subtasks of a split parent nested; exactly one [>] task row', () => {
  const rows = taskRows(renderPlanRegion(inputs));
  const ids = taskBlocks(tasksText).map((b) => b.id);
  assert.deepEqual([...rows.map((r) => r.id)].sort(), [...ids].sort());
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.deepEqual(rows.filter((r) => r.sub).map((r) => r.id), ['T-F6-06a', 'T-F6-06b']);
  assert.deepEqual(rows.filter((r) => r.mark === '>').map((r) => r.id), ['T-F1-02']);
});

test('gate classification: a human decision is a task that itself needs the user; one that only waits is BLOQUEADA with its causal chain', () => {
  const blocks = taskBlocks(tasksText);
  const eff = classifyTasks(blocks);
  assert.equal(eff.get('T-F1-04'), 'D', 'own HG id');
  assert.equal(eff.get('T-F7-01'), 'D');
  assert.equal(eff.get('T-F7-02'), 'D', 'its own text declares a human decision, even though it waits for T-F7-01');
  assert.equal(eff.get('T-F1-06'), 'B', 'marked [H] but only waits for T-F1-03: NOT a human decision');
  assert.equal(eff.get('T-F1-05'), 'B', 'pending behind a human decision');
  assert.equal(eff.get('T-F1-07'), 'B', 'unmet HG id in Dependências: blocked until the human decision');
  const pc = progressCounts(blocks);
  assert.deepEqual([pc.decisions, pc.blockedByDep], [3, 3]);
  const region = renderPlanRegion(inputs);
  const decisions = section(region, 'DECISÕES HUMANAS PENDENTES');
  assert.match(decisions, /^- T-F1-04 · Needs a human · HG-01 Humano decide algo que tem uma frase bem longa para cortar numa fronteira de palavra\?$/m, 'the whole title, not cut by characters');
  assert.match(decisions, /^- T-F7-02 · Decision after the gate · Decisão humana registrada \(após T-F7-01\)$/m);
  assert.doesNotMatch(decisions, /T-F1-06/);
  const blocked = section(region, 'BLOQUEADAS');
  assert.match(blocked, /^- T-F1-05 BLOQUEADA → T-F1-04 → HG-01$/m, 'task → decision task → gate');
  assert.match(blocked, /^- T-F1-07 BLOQUEADA → HG-02$/m, 'own gate');
  assert.match(blocked, /^- T-F1-06 BLOQUEADA → T-F1-03$/m, 'ordinary dependency: the chain ends at the task, never at a human decision');
  assert.match(region, /BLOQUEADAS: 3 · DECISÕES HUMANAS: 3/);
  const rows = Object.fromEntries(taskRows(region).map((r) => [r.id, r.mark]));
  assert.deepEqual([rows['T-F1-04'], rows['T-F1-06'], rows['T-F1-05'], rows['T-F1-07']], ['H', '!', '!', '!']);
  assert.match(region, /^- \[!\] \*\*T-F1-07\*\* — .* — BLOQUEADA → HG-02$/m);
  assert.doesNotMatch(region, /…/);
  assert.equal(cut('Uma frase comprida demais para caber aqui dentro, de verdade', 30), 'Uma frase comprida demais para');
});

test('phase markers and per-phase counts: never [✓] with pending work; [H] only when decisions remain; per phase only "tarefas X/Y"', () => {
  const region = renderPlanRegion(inputs);
  const heads = Object.fromEntries([...region.matchAll(/^### \[(.)\] (\S+) · (.*)$/gm)].map((m) => [m[2], { mark: m[1], rest: m[3] }]));
  assert.equal(heads.S8.mark, '✓');
  assert.equal(heads.S7.mark, 'H');
  assert.equal(heads.S1.mark, '>');
  assert.match(heads.S1.rest, / — tarefas 1\/4$/, 'S1: T-F1-02, -03, 06a, 06b; the split parent is not counted; no subtask total per phase');
  assert.match(heads.S7.rest, / — tarefas 0\/2$/);
  const blocks = taskBlocks(tasksText);
  const eff = classifyTasks(blocks);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const group of [['T-F1-01', 'T-F1-03'], ['T-F1-01', 'T-F1-04'], ['T-F1-04', 'T-F1-05'], ['T-F6-06a', 'T-F6-06b']]) {
    if (group.some((id) => byId.get(id).status !== '✓')) assert.notEqual(phaseState(group.map((id) => byId.get(id)), eff), '✓', group.join('+'));
  }
});

test('the panel gets exactly one active item and the one-line goal of the active TASK', () => {
  const plan = parsePlan(renderPlanFile(inputs));
  assert.deepEqual(plan.tasks.map((t) => `${t.state}${t.id}`), ['✓BASE', '>S1', 'HS7', '✓S8', '!SEM-SPRINT']);
  assert.deepEqual(checkInvariants(plan), []);
  assert.match(plan.tasks.find((t) => t.state === '>').fields.SPRINT_GOAL, /^T-F1-02 — Active work/);
});

test('the HTML renders the same model in the same order: AGORA tree once, READY blocks with their own progress, ROADMAP one line per task', () => {
  const md = renderPlanFile(inputs);
  const model = buildModel(inputs);
  const html = renderChecklistHtml({ tasks: [], view: model, title: 'T', validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO' });
  const rows = taskRows(md);
  const lis = [...html.matchAll(/<li class="t((?: sub)?(?: now)?)"><span class="m">\[(.)\]<\/span><span class="x">(T-[A-Z0-9]+-\d+[a-z]?) —/g)];
  assert.deepEqual(lis.map((m) => [m[3], m[2]]), rows.map((r) => [r.id, r.mark]), 'ROADMAP rows = plan rows, same ids and marks');
  assert.equal(lis.filter((m) => m[2] === '>').length, 1);
  assert.equal((html.match(/step a1/g) ?? []).length, 1);
  assert.match(html, /<li class="t s0 now"><span class="m">\[>\]<\/span><span class="x">Step B \(current\) <span class="muted">← em execução<\/span>/);
  assert.match(html, /<h3>T-F1-03 — READY · subtarefas 1\/2 — Follow-up with subtasks<\/h3>/);
  assert.match(html, /PROGRESSO:<\/strong> tarefas \d+\/\d+ · subtarefas da ativa T-F1-02 2\/4<\/p>/);
  assert.match(html, /<h3>\[>\] S1 — First · tarefas 1\/4<\/h3>/);
  assert.match(html, /<p class="hdr val">VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \/ DESATUALIZADA/);
  assert.match(html, /class="muted legend"/);
  const at = (h) => html.indexOf(h);
  const order = ['<h2>AGORA', '<h2>PRÓXIMO', '<h2>ROADMAP', '<h2>BLOQUEADAS', '<h2>DECISÕES HUMANAS PENDENTES', '<h2>VALIDAÇÃO'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((n) => n > 0));
  assert.match(html, /T-F1-05 — BLOQUEADA → T-F1-04 → HG-01/);
  assert.match(html, /TAREFA ATIVA AGORA:/);
  assert.doesNotMatch(html, /EXECUTANDO AGORA|subtarefas \d+\/\d+<\/h3><ul><li class="t"/);
});

test('drift is detected for any change: a task mark, a subtask mark in tasks.md, a hand edit of the tree, the gate class', () => {
  const plan = renderPlanFile(inputs);
  assert.equal(planDrift(plan, inputs).drift, false);
  assert.equal(planDrift(plan.replace('- [x] **T-F1-01**', '- [ ] **T-F1-01**'), inputs).drift, true);
  assert.equal(planDrift(plan, { ...inputs, tasksText: tasksText.replace('  - [ ] Step C', '  - [x] Step C') }).drift, true, 'subtask changed in tasks.md');
  assert.equal(planDrift(plan.replace('  - [ ] Step C', '  - [x] Step C'), inputs).drift, true, 'subtask hand-edited in plan.md');
  assert.equal(planDrift(plan, { ...inputs, tasksText: tasksText.replace('- Fazer: medir tudo automaticamente.', '- Fazer: decisão humana.') }).drift, true, 'gate class changed');
  assert.equal(planDrift(plan.replace('# SMARTLEARN — DESENVOLVIMENTO', '# outro título'), inputs).drift, true, 'even the header is generated and checked');
  assert.equal(planDrift('no markers', inputs).drift, true);
  assert.equal(applyRegion(plan, renderPlanRegion(inputs)), plan);
  assert.ok(plan.includes(BEGIN) && plan.includes(END));
});

test('DURABILITY: deleting plan.md and regenerating restores it byte-identical, from tasks.md + PROGRAM.md + spec.md alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'plan-durable-'));
  try {
    for (const [rel, text] of [[FILES.tasks, tasksText], [FILES.program, programText], [FILES.spec, specText]]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const planPath = join(root, FILES.plan);
    assert.equal(existsSync(planPath), false);
    assert.equal(syncPlanFile(root), true, 'created from nothing');
    const first = readFileSync(planPath, 'utf8');
    rmSync(planPath);
    assert.equal(syncPlanFile(root), true);
    assert.equal(readFileSync(planPath, 'utf8'), first, 'byte-identical after delete + regenerate');
    assert.equal(syncPlanFile(root), false, 'idempotent');
    assert.equal(first, renderPlanFile(inputs));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phases follow the sprint order of PROGRAM.md; mutation: a task sequenced before its own dependency is refused', () => {
  const plan = renderPlanFile(inputs);
  assert.deepEqual([...plan.matchAll(/^### \[.\] (\S+) · /gm)].map((m) => m[1]), ['BASE', 'S1', 'S7', 'S8', 'SEM-SPRINT']);
  assert.equal(planDrift(plan, { ...inputs, programText: programText.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-02') }).drift, true);
  const r = planDrift(plan, { ...inputs, programText: programText.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-01') });
  assert.equal(r.drift, true);
  assert.deepEqual(orderProblems(inputs), []);
  assert.deepEqual(programOrder('| **S4** J | o | T-F3-01..03 | P1 | T-F1-01 |\n'), ['T-F3-01', 'T-F3-02', 'T-F3-03']);
});

test('plan.md carries the validation line in VALIDAÇÃO (derived one-liner); drift is by class: an old PASS in the plan is stale once the head is not proven', () => {
  const stale = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO (testado aaaaaaa)';
  const pass = 'VALIDAÇÃO DO HEAD ATUAL: ✓ PASS (unit, server) no HEAD atual';
  const plan = renderPlanFile({ ...inputs, validationLine: stale });
  assert.match(section(plan, 'VALIDAÇÃO'), /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \/ DESATUALIZADA/m);
  assert.match(renderPlanRegion(inputs), /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \(nenhuma validação/m, 'default: nothing recorded');
  assert.equal(planDrift(plan, { ...inputs, validationLine: stale }).drift, false);
  assert.equal(planDrift(plan, { ...inputs, validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — server DESATUALIZADO' }).drift, false, 'detail of a not-proven state may change without drift');
  assert.equal(planDrift(plan, { ...inputs, validationLine: pass }).drift, true, 'head became proven but the plan still says not proven');
  assert.equal(planDrift(renderPlanFile({ ...inputs, validationLine: pass }), { ...inputs, validationLine: stale }).drift, true, 'an old PASS must not stay in the plan');
  assert.equal(planDrift(plan.replace(/^VALIDAÇÃO DO HEAD ATUAL:.*$/m, ''), { ...inputs, validationLine: stale }).drift, true, 'line deleted');
});

test('a task waiting for an HG id (or chained to one) is BLOCKED with the chain named; the phase marker follows; dependency ranges are fully listed', () => {
  const t = [
    '### T-F1-01 — Decision · S', '- Status: `[H]` · Dependências: HG-05', '',
    '### T-F1-02 — Chained · S', '- Status: `[ ]` · Dependências: T-F1-01', '',
    '### T-F1-03 — Own HG while pending · S', '- Status: `[ ]` · Dependências: HG-13', '',
    '### T-F1-04 — Range a · S', '- Status: `[ ]` · Dependências: nenhuma', '',
    '### T-F1-05 — Range b · S', '- Status: `[ ]` · Dependências: nenhuma', '',
    '### T-F1-06 — Waits for a range · S', '- Status: `[ ]` · Dependências: T-F1-04..05', '',
  ].join('\n');
  const prog = '| Sprint | Outcome | Tarefas |\n|---|---|---|\n| **S1** One | x | T-F1-01 → T-F1-02 → T-F1-03 |\n| **S2** Two | y | T-F1-04 → T-F1-05 → T-F1-06 |\n';
  const spec = '| HG-05 | Estratégia de integração (merge ou série de PRs). Segunda frase que não entra | F9 | x |\n| HG-13 | Autorizar a diretiva de idioma | T-F1-03 | x |\n';
  const region = renderPlanRegion({ tasksText: t, programText: prog, specText: spec });
  const blocked = section(region, 'BLOQUEADAS');
  assert.match(blocked, /^- T-F1-02 BLOQUEADA → T-F1-01 → HG-05$/m);
  assert.match(blocked, /^- T-F1-03 BLOQUEADA → HG-13$/m);
  assert.doesNotMatch(blocked, /T-F1-06/, 'ordinary pending tasks are not blocked');
  assert.match(region, /^### \[!\] S1 · One/m, 'nothing runnable in S1: every task is a decision or blocked');
  assert.match(region, /^### \[ \] S2 · Two/m);
  assert.match(section(region, 'DECISÕES HUMANAS PENDENTES'), /^- T-F1-01 · Decision · HG-05 Estratégia de integração$/m, 'full first sentence of the spec title, parentheses dropped, no truncation');
  assert.match(region, /^- \[ \] \*\*T-F1-06\*\* — Waits for a range$/m);
  const blocks = taskBlocks(t);
  assert.deepEqual(blocks.find((b) => b.id === 'T-F1-06').deps, ['T-F1-04', 'T-F1-05'], 'T-F1-04..05 expands to every id');
  assert.deepEqual(blocks.find((b) => b.id === 'T-F1-03').hgDeps, ['HG-13']);
  assert.equal(classifyTasks(blocks).get('T-F1-06'), ' ');
  const t2 = t.replace('### T-F1-06 — Waits for a range · S\n- Status: `[ ]`', '### T-F1-06 — Waits for a range · S\n- Status: `[!]`');
  assert.match(section(renderPlanRegion({ tasksText: t2, programText: prog, specText: spec }), 'BLOQUEADAS'), /^- T-F1-06 BLOQUEADA → T-F1-04, T-F1-05$/m, 'every open dependency of the range is printed');
});

test('DECISÕES HUMANAS text is a complete sentence, never character-truncated; a [H] task without an HG id states what the user decides', () => {
  const t = [
    '### T-F1-01 — Roteiro visual · S', '- Status: `[H]` · Dependências: nenhuma · A execução é UAT humano; os passos mecânicos podem ser provados sem humano', '- Fazer: preparar roteiro.', '',
    '### T-F1-02 — Retirar o legado · S', '- Status: `[H]` · Dependências: nenhuma · Decisão de produto/arquitetura sobre remover o adaptador legado; sem remoção de código.', '',
    '### T-F1-03 — Avaliar · S', '- Status: `[H]` · Dependências: nenhuma', '- Outcome: o humano avalia a unidade com a rubrica fixa e registra PASS ou FAIL. Depois disso segue.', '',
  ].join('\n');
  const decisions = section(renderPlanRegion({ tasksText: t, programText: '', specText: '' }), 'DECISÕES HUMANAS PENDENTES');
  assert.match(decisions, /^- T-F1-01 · Roteiro visual · A execução é UAT humano$/m);
  assert.match(decisions, /^- T-F1-02 · Retirar o legado · Decisão de produto\/arquitetura sobre remover o adaptador legado$/m);
  assert.match(decisions, /^- T-F1-03 · Avaliar · O humano avalia a unidade com a rubrica fixa e registra PASS ou FAIL$/m);
  assert.doesNotMatch(decisions, /…/);
  assert.equal(firstSentence('Texto (com parênteses). Segunda frase.'), 'Texto');
  assert.equal(firstSentence('Pergunta aceitável? Resto'), 'Pergunta aceitável?');
});

test('the tracked plan never embeds the current HEAD sha (no churn per commit); recorded "testado" shas stay', () => {
  const a = renderPlanRegion({ ...inputs, validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO (testado aaaaaaa); HEAD atual 1111111' });
  const b = renderPlanRegion({ ...inputs, validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO (testado aaaaaaa); HEAD atual 2222222' });
  assert.equal(a, b);
  assert.match(a, /unit DESATUALIZADO \(testado aaaaaaa\)$/m);
  assert.doesNotMatch(a, /HEAD atual \d/);
  assert.doesNotMatch(renderPlanRegion({ ...inputs, validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ✓ PASS (unit) em bbbbbbb2' }), /bbbbbbb/);
});

test('a split task says what its children are; the legend says subtarefas are checklist items, children count as tarefas', () => {
  const region = renderPlanRegion(inputs);
  assert.match(region, /^- \[=\] \*\*T-F6-06\*\* — Split parent — dividida em T-F6-06a\/b \(tarefas\)$/m);
  assert.match(region, /subtarefas = itens de checklist dentro de um bloco de tarefa; as filhas de uma tarefa dividida contam como tarefas/);
  assert.match(renderChecklistHtml({ tasks: [], view: buildModel(inputs), title: 'T' }), /as filhas contam como tarefas/);
});

test('PRÓXIMO is ONE outcome and says why it is ready (Por quê); a task behind an unfinished task is never offered; it explains a task that passes ahead', () => {
  const t = [
    '### T-F1-01 — Foundation · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc1234` · Dependências: nenhuma', '',
    '### T-F1-02 — Active · S', '- Status: `[>]` · Dependências: T-F1-01', '- Subtarefas:', '  - [>] only step', '',
    '### T-F2-01 — Jobs base · S', '- Status: `[ ]` · Dependências: T-F1-01', '- Subtarefas:', '  - [ ] RED: a primeira transição', '',
    '### T-F2-02 — Needs the base · S', '- Status: `[ ]` · Dependências: T-F2-01', '- Subtarefas:', '  - [ ] RED: a segunda transição', '',
    '### T-F2-03 — Independent explanation · S', '- Status: `[ ]` · Dependências: nenhuma', '- Subtarefas:', '  - [ ] RED: a explicação obrigatória', '',
    '### T-F1-09 — After the active one · S', '- Status: `[ ]` · Dependências: T-F1-02', '- Subtarefas:', '  - [ ] RED: depois da ativa', '',
  ].join('\n');
  const prog = '| Sprint | Outcome | Tarefas |\n|---|---|---|\n| **S1** One | x | T-F1-02 → T-F1-09 |\n| **S4** Jobs | y | T-F2-01 → T-F2-02 → T-F2-03 |\n';
  const prox = section(renderPlanRegion({ tasksText: t, programText: prog, specText: '' }), 'PRÓXIMO');
  assert.deepEqual([...prox.matchAll(/^### (T-\S+) — READY/gm)].map((m) => m[1]), ['T-F1-09'], 'ONE next outcome; T-F2-02 waits for an unfinished task that is not the active one');
  assert.match(prox, /### T-F1-09 — READY — After the active one\n {2}Por quê: S1 · sem dependência pendente · depois de T-F1-02/);
  // the first sprint has nothing runnable: the independent task passes ahead of the ones that wait, and says so
  const ahead = section(renderPlanRegion({ tasksText: t.replace('### T-F1-09', '### T-F1-09x').replace('- Status: `[ ]` · Dependências: T-F1-02\n- Subtarefas:\n  - [ ] RED: depois da ativa', '- Status: `[!]` · Dependências: T-F1-02\n- Subtarefas:\n  - [ ] RED: depois da ativa').replace('### T-F2-01 — Jobs base · S\n- Status: `[ ]`', '### T-F2-01 — Jobs base · S\n- Status: `[!]`'), programText: prog, specText: '' }), 'PRÓXIMO');
  assert.match(ahead, /### T-F2-03 — READY — Independent explanation\n {2}Por quê: S4 · independente de S1 · sem dependência pendente · passa à frente de T-F2-01, T-F2-02 /);
});
