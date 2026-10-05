import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlanRegion, applyRegion, planDrift, orderProblems, phaseState, cut, firstSentence, BEGIN, END } from '../scripts/plan-sync.mjs';
import { programOrder, taskBlocks, parseSubtasks, subtaskCounts, classifyTasks, progressCounts } from '../scripts/context-core.mjs';
import { parsePlan, checkInvariants, renderChecklistHtml } from '../scripts/tasklist.mjs';

// plan.md is the human-readable executable VIEW of tasks.md: generated, never hand-kept, impossible to diverge silently.
// Subtasks live in tasks.md; the active task is expanded ONLY in AGORA; every task row exists once (FASES); marks are distinct and
// honest; "human decision" means the task itself needs the user, a task that only waits for another task is blocked by dependency.

const tasksText = [
  '### T-F1-01 — Foundation · S', '- Status: `[✓]` IMPLEMENTATION_SHA `abc1234` · Dependências: nenhuma', '',
  '### T-F1-02 — Active work · M', '- Status: `[>]` · Dependências: T-F1-01', '- Subtarefas:',
  '  - [x] Group A', '    - [x] step a1', '    - [x] step a2', '  - [>] Step B (current)', '  - [ ] Step C', '- Próximo passo: x', '',
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

test('AGORA holds the active task with its full nested tree; PRÓXIMO is next; pointers carry no task rows', () => {
  const region = renderPlanRegion(inputs);
  const agora = section(region, 'AGORA');
  assert.match(agora, /^- T-F1-02 · Active work · S1 · subtarefas 2\/4$/m);
  assert.match(agora, /^ {2}- \[x\] Group A$/m);
  assert.match(agora, /^ {4}- \[x\] step a1$/m);
  assert.match(agora, /^ {2}- \[>\] Step B \(current\)$/m);
  assert.match(agora, /^ {2}- \[ \] Step C$/m);
  assert.match(section(region, 'PRÓXIMO'), /^- T-F1-03 · Follow-up with subtasks$/m);
  assert.match(region, /^ATIVA AGORA: T-F1-02 \(S1\) · PRÓXIMA: T-F1-03 · TAREFAS: \d+\/\d+ · SUBTAREFAS: 3\/6/m);
  const before = region.slice(0, region.indexOf('## FASES'));
  assert.equal(taskRows(before).length, 0, 'no checkbox task rows above FASES');
  assert.equal(taskRows(region.slice(region.indexOf('## DECISÕES HUMANAS'))).length, 0);
  assert.ok(region.indexOf('## AGORA') < region.indexOf('## PRÓXIMO') && region.indexOf('## PRÓXIMO') < region.indexOf('## FASES'));
});

test('the active task is a single FASES line with its subtask count (no duplicate tree); other tasks with subtasks are expanded in FASES', () => {
  const region = renderPlanRegion(inputs);
  const fases = region.slice(region.indexOf('## FASES'));
  assert.match(fases, /^- \[>\] \*\*T-F1-02\*\* — Active work — subtarefas 2\/4$/m);
  assert.equal((region.match(/step a1/g) ?? []).length, 1, 'the active tree exists once');
  assert.match(fases, /^- \[ \] \*\*T-F1-03\*\* — Follow-up with subtasks — subtarefas 1\/2\n {2}- \[x\] one\n {2}- \[ \] two$/m);
});

test('every task appears exactly once as a full row, subtasks of a split parent nested; exactly one [>] task row', () => {
  const rows = taskRows(renderPlanRegion(inputs));
  const ids = taskBlocks(tasksText).map((b) => b.id);
  assert.deepEqual([...rows.map((r) => r.id)].sort(), [...ids].sort());
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.deepEqual(rows.filter((r) => r.sub).map((r) => r.id), ['T-F6-06a', 'T-F6-06b']);
  assert.deepEqual(rows.filter((r) => r.mark === '>').map((r) => r.id), ['T-F1-02']);
});

test('gate classification: a human decision is a task that itself needs the user; one that only waits for a task is blocked by dependency', () => {
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
  const decisions = section(region, 'DECISÕES HUMANAS');
  assert.match(decisions, /^- T-F1-04 · Needs a human · HG-01 Humano decide algo que tem uma frase bem longa para cortar numa fronteira de palavra\?$/m, 'the whole title, not cut by characters');
  assert.match(decisions, /^- T-F7-02 · Decision after the gate · Decisão humana registrada \(após T-F7-01\)$/m);
  assert.doesNotMatch(decisions, /T-F1-06/);
  assert.match(section(region, 'BLOQUEADAS POR DEPENDÊNCIA'), /^- T-F1-06 · .* · aguarda T-F1-03$/m);
  assert.match(region, /^BLOQUEADAS POR DEPENDÊNCIA: 3 · DECISÕES HUMANAS: 3|BLOQUEADAS POR DEPENDÊNCIA: 3 · DECISÕES HUMANAS: 3$/m);
  const rows = Object.fromEntries(taskRows(region).map((r) => [r.id, r.mark]));
  assert.deepEqual([rows['T-F1-04'], rows['T-F1-06'], rows['T-F1-05'], rows['T-F1-07']], ['H', '!', '!', '!']);
  assert.match(region, /^- \[!\] \*\*T-F1-07\*\* — .* — aguarda decisão humana: HG-02$/m);
  assert.match(section(region, 'BLOQUEADAS POR DEPENDÊNCIA'), /^- T-F1-07 · .* · aguarda decisão humana: HG-02$/m, 'the HG dependency appears in BLOQUEADAS');
  assert.match(section(region, 'BLOQUEADAS POR DEPENDÊNCIA'), /^- T-F1-05 · .* · aguarda decisão humana: HG-01 \(via T-F1-04\)$/m, 'a task behind a pending decision is not self-starting');
  assert.match(section(region, 'BLOQUEADAS POR DEPENDÊNCIA'), /^- T-F1-06 · .* · aguarda T-F1-03$/m, 'ordinary dependency: plain aguarda');
  assert.doesNotMatch(region, /…/);
  assert.equal(cut('Uma frase comprida demais para caber aqui dentro, de verdade', 30), 'Uma frase comprida demais para');
});

test('phase markers and per-phase counts: never [✓] with pending work; [H] only when decisions remain; tarefas X/Y · subtarefas A/B', () => {
  const region = renderPlanRegion(inputs);
  const heads = Object.fromEntries([...region.matchAll(/^### \[(.)\] (\S+) · (.*)$/gm)].map((m) => [m[2], { mark: m[1], rest: m[3] }]));
  assert.equal(heads.S8.mark, '✓');
  assert.equal(heads.S7.mark, 'H');
  assert.equal(heads.S1.mark, '>');
  assert.match(heads.S1.rest, / — tarefas 1\/4 · subtarefas 3\/6$/, 'S1: T-F1-02, -03, 06a, 06b; the split parent is not counted');
  assert.match(heads.S7.rest, / — tarefas 0\/2$/);
  assert.doesNotMatch(heads.S7.rest, /subtarefas/, 'no subtask total, no subtask clause');
  const blocks = taskBlocks(tasksText);
  const eff = classifyTasks(blocks);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const group of [['T-F1-01', 'T-F1-03'], ['T-F1-01', 'T-F1-04'], ['T-F1-04', 'T-F1-05'], ['T-F6-06a', 'T-F6-06b']]) {
    if (group.some((id) => byId.get(id).status !== '✓')) assert.notEqual(phaseState(group.map((id) => byId.get(id)), eff), '✓', group.join('+'));
  }
});

test('the panel gets exactly one active item and the one-line goal of the active TASK', () => {
  const plan = parsePlan(`# TRACK: T\n\nStatus: ACTIVE\n\n${renderPlanRegion(inputs)}\n`);
  assert.deepEqual(plan.tasks.map((t) => `${t.state}${t.id}`), ['✓BASE', '>S1', 'HS7', '✓S8', '!SEM-SPRINT']);
  assert.deepEqual(plan.tasks.map((t) => t.title).filter((t) => /tarefas \d/.test(t)), [], 'counts are not part of the phase title');
  assert.deepEqual(checkInvariants(plan), []);
  assert.match(plan.tasks.find((t) => t.state === '>').fields.SPRINT_GOAL, /^T-F1-02 — Active work/);
});

test('the HTML: same ids and marks as plan.md, AGORA tree once, per-phase and global counts, validation line, legend, one [>] task row', () => {
  const md = `# TRACK: T\n\nStatus: ACTIVE\nMARCO ATUAL: S1 — x\n\n${renderPlanRegion(inputs)}\n`;
  const plan = parsePlan(md);
  const html = renderChecklistHtml({ tasks: plan.tasks, view: plan.view, validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO' });
  const rows = taskRows(md);
  const lis = [...html.matchAll(/<li class="t((?: sub)?(?: now)?)"><span class="m">\[(.)\]<\/span><span class="x">(T-[A-Z0-9]+-\d+[a-z]?) —/g)];
  assert.deepEqual(lis.map((m) => [m[3], m[2]]), rows.map((r) => [r.id, r.mark]));
  assert.equal(lis.filter((m) => m[2] === '>').length, 1);
  assert.equal((html.match(/step a1/g) ?? []).length, 1, 'the active tree is rendered once');
  assert.match(html, /<li class="t s1"><span class="m">\[x\]<\/span><span class="x">step a1/);
  assert.match(html, /<li class="t s0 now"><span class="m">\[>\]<\/span><span class="x">Step B/);
  assert.match(html, /PROGRESSO:<\/strong> tarefas \d+\/\d+ · subtarefas 3\/6/);
  assert.match(html, /\[>\] S1 — First · tarefas 1\/4 · subtarefas 3\/6/);
  assert.match(html, /VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \/ DESATUALIZADA/);
  assert.match(html, /class="muted legend"/);
  assert.equal(plan.view.progress.subDone + '/' + plan.view.progress.subTotal, '3/6');
  assert.ok(html.indexOf('<h2>FASES') < html.indexOf('<h2>DECISÕES HUMANAS'));
  assert.ok(html.indexOf('<h2>AGORA') < html.indexOf('<h2>PRÓXIMO') && html.indexOf('<h2>PRÓXIMO') < html.indexOf('<h2>FASES'));
});

test('drift is detected for any change: a task mark, a subtask mark in tasks.md, a hand edit of the tree, the gate class', () => {
  const plan = `header\n${renderPlanRegion(inputs)}\n`;
  assert.equal(planDrift(plan, inputs).drift, false);
  assert.equal(planDrift(plan.replace('- [x] **T-F1-01**', '- [ ] **T-F1-01**'), inputs).drift, true);
  assert.equal(planDrift(plan, { ...inputs, tasksText: tasksText.replace('  - [ ] Step C', '  - [x] Step C') }).drift, true, 'subtask changed in tasks.md');
  assert.equal(planDrift(plan.replace('  - [ ] Step C', '  - [x] Step C'), inputs).drift, true, 'subtask hand-edited in plan.md');
  assert.equal(planDrift(plan, { ...inputs, tasksText: tasksText.replace('- Fazer: medir tudo automaticamente.', '- Fazer: decisão humana.') }).drift, true, 'gate class changed');
  assert.equal(planDrift('no markers', inputs).drift, true);
  assert.equal(applyRegion(plan, renderPlanRegion(inputs)), plan);
  assert.ok(plan.includes(BEGIN) && plan.includes(END));
});

test('phases follow the sprint order of PROGRAM.md; mutation: a task sequenced before its own dependency is refused', () => {
  const region = renderPlanRegion(inputs);
  assert.deepEqual([...region.matchAll(/^### \[.\] (\S+)/gm)].map((m) => m[1]), ['BASE', 'S1', 'S7', 'S8', 'SEM-SPRINT']);
  assert.equal(planDrift(`h\n${region}\n`, { ...inputs, programText: programText.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-02') }).drift, true);
  const r = planDrift(`h\n${region}\n`, { ...inputs, programText: programText.replace('T-F1-02 → T-F1-03', 'T-F1-03 → T-F1-01') });
  assert.equal(r.drift, true);
  assert.deepEqual(orderProblems(inputs), []);
  assert.deepEqual(programOrder('| **S4** J | o | T-F3-01..03 | P1 | T-F1-01 |\n'), ['T-F3-01', 'T-F3-02', 'T-F3-03']);
});

test('plan.md carries the validation line (derived one-liner); drift is by class: an old PASS in the plan is stale once the head is not proven', () => {
  const stale = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — unit DESATUALIZADO (testado aaaaaaa)';
  const pass = 'VALIDAÇÃO DO HEAD ATUAL: ✓ PASS (unit, server) em bbbbbbb';
  const region = renderPlanRegion({ ...inputs, validationLine: stale });
  assert.match(region, /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \/ DESATUALIZADA/m);
  assert.match(renderPlanRegion(inputs), /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \(nenhuma validação/m, 'default: nothing recorded');
  const plan = `h\n${region}\n`;
  assert.equal(planDrift(plan, { ...inputs, validationLine: stale }).drift, false);
  assert.equal(planDrift(plan, { ...inputs, validationLine: 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA / DESATUALIZADA — server DESATUALIZADO' }).drift, false, 'detail of a not-proven state may change without drift');
  assert.equal(planDrift(plan, { ...inputs, validationLine: pass }).drift, true, 'head became proven but the plan still says not proven');
  assert.equal(planDrift(`h\n${renderPlanRegion({ ...inputs, validationLine: pass })}\n`, { ...inputs, validationLine: stale }).drift, true, 'an old PASS must not stay in the plan');
  assert.equal(planDrift(plan.replace(/^VALIDAÇÃO DO HEAD ATUAL:.*$/m, ''), { ...inputs, validationLine: stale }).drift, true, 'line deleted');
});

test('a task waiting for an HG id (or chained to one) is BLOCKED with the decision named; the phase marker follows; dependency ranges are fully listed', () => {
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
  const blocked = section(region, 'BLOQUEADAS POR DEPENDÊNCIA');
  assert.match(blocked, /^- T-F1-02 · Chained · aguarda decisão humana: HG-05 \(via T-F1-01\)$/m);
  assert.match(blocked, /^- T-F1-03 · Own HG while pending · aguarda decisão humana: HG-13$/m);
  assert.doesNotMatch(blocked, /T-F1-06/, 'ordinary pending tasks are not blocked');
  assert.match(region, /^### \[!\] S1 · One/m, 'nothing runnable in S1: every task is a decision or blocked');
  assert.match(region, /^### \[ \] S2 · Two/m);
  assert.match(section(region, 'DECISÕES HUMANAS'), /^- T-F1-01 · Decision · HG-05 Estratégia de integração$/m, 'full first sentence of the spec title, parentheses dropped, no truncation');
  assert.match(region, /^- \[ \] \*\*T-F1-06\*\* — Waits for a range$/m);
  const blocks = taskBlocks(t);
  assert.deepEqual(blocks.find((b) => b.id === 'T-F1-06').deps, ['T-F1-04', 'T-F1-05'], 'T-F1-04..05 expands to every id');
  assert.deepEqual(blocks.find((b) => b.id === 'T-F1-03').hgDeps, ['HG-13']);
  assert.equal(classifyTasks(blocks).get('T-F1-06'), ' ');
  const t2 = t.replace('### T-F1-06 — Waits for a range · S\n- Status: `[ ]`', '### T-F1-06 — Waits for a range · S\n- Status: `[!]`');
  assert.match(section(renderPlanRegion({ tasksText: t2, programText: prog, specText: spec }), 'BLOQUEADAS POR DEPENDÊNCIA'), /^- T-F1-06 · Waits for a range · aguarda T-F1-04, T-F1-05$/m, 'every open dependency of the range is printed');
});

test('DECISÕES HUMANAS text is a complete sentence, never character-truncated; a [H] task without an HG id states what the user decides', () => {
  const t = [
    '### T-F1-01 — Roteiro visual · S', '- Status: `[H]` · Dependências: nenhuma · A execução é UAT humano; os passos mecânicos podem ser provados sem humano', '- Fazer: preparar roteiro.', '',
    '### T-F1-02 — Retirar o legado · S', '- Status: `[H]` · Dependências: nenhuma · Decisão de produto/arquitetura sobre remover o adaptador legado; sem remoção de código.', '',
    '### T-F1-03 — Avaliar · S', '- Status: `[H]` · Dependências: nenhuma', '- Outcome: o humano avalia a unidade com a rubrica fixa e registra PASS ou FAIL. Depois disso segue.', '',
  ].join('\n');
  const decisions = section(renderPlanRegion({ tasksText: t, programText: '', specText: '' }), 'DECISÕES HUMANAS');
  assert.match(decisions, /^- T-F1-01 · Roteiro visual · A execução é UAT humano$/m);
  assert.match(decisions, /^- T-F1-02 · Retirar o legado · Decisão de produto\/arquitetura sobre remover o adaptador legado$/m);
  assert.match(decisions, /^- T-F1-03 · Avaliar · O humano avalia a unidade com a rubrica fixa e registra PASS ou FAIL$/m);
  assert.doesNotMatch(decisions, /…/);
  assert.equal(firstSentence('Texto (com parênteses). Segunda frase.'), 'Texto');
  assert.equal(firstSentence('Pergunta aceitável? Resto'), 'Pergunta aceitável?');
});
