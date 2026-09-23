import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from '../scripts/tasklist.mjs';
import { parseCoordFile, cliLane, renderAgentBoard } from '../scripts/agent-tasklist.mjs';

const PLAN = `# TRACK: T

Status: IN_PROGRESS

- [✓] **CQ-1 Feita** — texto livre
- [>] **EXAM-1 Prova sem feedback** — OWNER: GUI
      SPRINT_GOAL: fazer prova completa sem feedback antes de submeter.
      BEFORE: só existe estudo com feedback imediato.
      PROOF: e2e discriminante
      que continua na linha seguinte.
      DONE_WHEN: prova submetida sem vazamento.
- [ ] **EXAM-2 Resultado** — OWNER: GUI
`;

test('structured task fields are parsed (multi-line values, owner) and legacy free text keeps working', () => {
  const plan = parsePlan(PLAN);
  const [legacy, exam] = plan.tasks;
  assert.deepEqual(legacy.fields, {});
  assert.match(legacy.detail, /texto livre/);
  assert.equal(exam.owner, 'GUI');
  assert.equal(exam.fields.SPRINT_GOAL, 'fazer prova completa sem feedback antes de submeter.');
  assert.equal(exam.fields.PROOF, 'e2e discriminante que continua na linha seguinte.');
  assert.equal(exam.fields.DONE_WHEN, 'prova submetida sem vazamento.');
});

test('the CLI coordination file becomes a lane: status maps to a state, NEXT becomes a pending card', () => {
  const cli = parseCoordFile(`AGENT=AGENT_CLI
BRANCH=b
GOAL=Master plan
ACTIVE_TASK=T51 em andamento
STATUS=TESTING
FILES_IN_FLIGHT=a.js, b.js
NEXT (for the next cycle):
  1. terminar T51
  2. integrar
UPDATED_AT=hoje
`);
  const lane = cliLane(cli);
  assert.equal(lane.tasks[0].state, '>');
  assert.equal(lane.tasks[0].title, 'T51 em andamento');
  assert.equal(lane.tasks[0].fields.FILES_IN_FLIGHT, 'a.js, b.js');
  assert.match(lane.tasks[1].fields.DETAILS, /terminar T51 2\. integrar/);
  assert.equal(cliLane(parseCoordFile('STATUS=DONE\nACTIVE_TASK=x')).tasks[0].state, '✓');
  assert.equal(cliLane(parseCoordFile('STATUS=BLOCKED\nACTIVE_TASK=x')).tasks[0].state, '!');
});

test('the board is a SIMPLE checklist: [✓] finished, [>] doing now, [ ] next, [!] blocked; the active goal is one line; content is escaped', () => {
  const plan = parsePlan(PLAN + '- [!] **BLK-1 Depende de chave** — OWNER: GUI\n');
  const gui = { title: 'AGENT_GUI', tasks: plan.tasks.map((t) => ({ ...t, owner: 'GUI' })) };
  const cli = cliLane(parseCoordFile('ACTIVE_TASK=<b>x</b>\nSTATUS=RUNNING\nGOAL=g'));
  const html = renderAgentBoard({ gui, cli });
  assert.match(html, /\[✓\]<\/span> CQ-1 — Feita/);
  assert.match(html, /class="t now"><span class="m">\[>\]<\/span> EXAM-1 — Prova sem feedback/);
  assert.match(html, /\[ \]<\/span> EXAM-2 — Resultado/);
  assert.match(html, /\[!\]<\/span> BLK-1 — Depende de chave/);
  assert.match(html, /EXECUTANDO AGORA:<\/strong><p>EXAM-1 — fazer prova completa sem feedback antes de submeter\./);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'), 'CLI line escaped');
  // no dashboard furniture
  for (const forbidden of ['<details', 'class="badge"', '<dl>', 'aria-label="GUI"', 'pode estar desatualizado']) assert.ok(!html.includes(forbidden), forbidden);
});

test('order is finished (last 6), then the active one, then next, then blocked; older finished collapse into a count; a PAUSED CLI is one plain line', () => {
  const many = Array.from({ length: 9 }, (_, n) => `- [✓] **DONE-${n + 1} Feita ${n + 1}** — x`).join('\n');
  const plan = parsePlan(`# TRACK: T\n\nStatus: IN_PROGRESS\n\n${many}\n- [ ] **NEXT-1 Depois** — x\n- [>] **NOW-1 Agora** — x\n- [!] **BLK-1 Travada** — x\n`);
  const cli = cliLane(parseCoordFile('AGENT=AGENT_CLI\nACTIVE_TASK=PAUSED (token budget)\nSTATUS=DONE   (slice)\n'));
  assert.equal(cli.tasks[0].state, '-');
  const html = renderAgentBoard({ gui: { title: 'G', tasks: plan.tasks }, cli });
  assert.match(html, /… \+3 concluídas antes/);
  assert.ok(!html.includes('DONE-3 ') && html.includes('DONE-4 —') && html.includes('DONE-9 —'));
  const at = (id) => html.indexOf(id);
  assert.ok(at('DONE-9') < at('NOW-1') && at('NOW-1') < at('NEXT-1') && at('NEXT-1') < at('BLK-1'), 'done, now, next, blocked');
  assert.match(html, /CLI \(outro agente\): pausado — PAUSED \(token budget\)/);
});

test('Conductor ACTIVE TRACK block is derived from the plan and replaces only the marked block', async () => {
  const { activeTrackBlock, syncActiveTrack } = await import('../scripts/agent-tasklist.mjs');
  const plan = parsePlan(PLAN);
  const block = activeTrackBlock(plan, { planPath: 'conductor/tracks/t/plan.md', branch: 'b', head: 'abc123', date: '2026-09-19' });
  assert.match(block, /ATIVA \(GUI\): EXAM-1/);
  assert.match(block, /próximas: EXAM-2/);
  assert.match(block, /concluídas \(1\): CQ-1/);
  const md = 'antes\n<!-- ACTIVE-TRACK:BEGIN velho -->\nvelho\n<!-- ACTIVE-TRACK:END -->\ndepois\n';
  const out = syncActiveTrack(md, block);
  assert.ok(out.startsWith('antes\n') && out.endsWith('\ndepois\n') && !out.includes('velho'));
  assert.equal(syncActiveTrack('sem marcadores', block), null);
});

test('one command targets every worktree copy of the board', async () => {
  const { worktreeBoards } = await import('../scripts/agent-tasklist.mjs');
  const boards = worktreeBoards(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.ok(boards.length >= 1 && boards.every((p) => /conductor[\\/]\.view[\\/]tasklist\.html$/.test(p)));
});
