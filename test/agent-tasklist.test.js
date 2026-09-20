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

test('the board shows two lanes, one active per agent is fine, two active in one lane is warned, content is escaped', () => {
  const gui = { title: 'AGENT_GUI', branch: 'gb', head: 'h1', updated: '', tasks: parsePlan(PLAN).tasks };
  const cli = cliLane(parseCoordFile('ACTIVE_TASK=<b>x</b>\nSTATUS=RUNNING\nGOAL=g'));
  const html = renderAgentBoard({ gui, cli, now: new Date('2026-09-19T12:00:00Z') });
  assert.match(html, /aria-label="GUI"/);
  assert.match(html, /aria-label="CLI"/);
  assert.match(html, /ativa: <strong>EXAM-1<\/strong>/);
  assert.match(html, /ativa: <strong>CLI<\/strong>/);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'), 'escaped');
  assert.match(html, /<dt>Objetivo<\/dt><dd>fazer prova completa/);
  const twoActive = renderAgentBoard({ gui: { ...gui, tasks: gui.tasks.map((t) => ({ ...t, state: '>' })) }, cli });
  assert.match(twoActive, /2 ativas|3 ativas/);
});
