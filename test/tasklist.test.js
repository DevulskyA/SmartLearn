import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePlan, checkInvariants, renderCompact, renderChecklistHtml } from '../scripts/tasklist.mjs';

const SAMPLE = `# TRACK: Exemplo

\`\`\`
Track: x            Status: IN_PROGRESS
\`\`\`

## Tarefas

- [✓] **OPS-1 Primeira** — feita
- [>] **OPS-2 Segunda** — em andamento
      continua na linha seguinte
- [ ] **OPS-3 Terceira**
- [!] **GOV-1 Bloqueada** — espera decisão
- [-] Adiado sem id: ignorado
`;

test('parsePlan reads state, id, title and multi-line detail; ignores non-task bullets', () => {
  const plan = parsePlan(SAMPLE);
  assert.equal(plan.title, 'Exemplo');
  assert.equal(plan.status, 'IN_PROGRESS');
  assert.deepEqual(plan.tasks.map((t) => [t.state, t.id, t.title]), [['✓', 'OPS-1', 'Primeira'], ['>', 'OPS-2', 'Segunda'], [' ', 'OPS-3', 'Terceira'], ['!', 'GOV-1', 'Bloqueada']]);
  assert.match(plan.tasks[1].detail, /em andamento continua na linha seguinte/);
});

test('exactly ONE active task is enforced (zero or two both fail)', () => {
  const plan = parsePlan(SAMPLE);
  assert.deepEqual(checkInvariants(plan), []);
  assert.match(checkInvariants(parsePlan(SAMPLE.replace('[>]', '[ ]')))[0], /found 0/);
  assert.match(checkInvariants(parsePlan(SAMPLE.replace('- [ ] **OPS-3', '- [>] **OPS-3')))[0], /found 2/);
});

test('a DONE (closed) track has zero active tasks; an open track with zero still fails', () => {
  const done = SAMPLE.replace('Status: IN_PROGRESS', 'Status: DONE').replace('[>]', '[✓]');
  assert.deepEqual(checkInvariants(parsePlan(done)), []);
  assert.match(checkInvariants(parsePlan(SAMPLE.replace('Status: IN_PROGRESS', 'Status: DONE')))[0], /DONE track must have no active/);
  assert.match(checkInvariants(parsePlan(SAMPLE.replace('[>]', '[ ]')))[0], /exactly ONE/);
});

test('the compact projection marks the single active task; the HTML board escapes content and shows progress', () => {
  const compact = renderCompact(parsePlan(SAMPLE));
  assert.match(compact, /\[>\] OPS-2 — Segunda {3}← ATIVA/);
  assert.equal((compact.match(/← ATIVA/g) ?? []).length, 1);
  const html = renderChecklistHtml({ tasks: parsePlan(SAMPLE.replace('Primeira', '<b>x</b> & y')).tasks });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt; &amp; y'), 'task text is escaped');
  assert.match(html, /\[✓\]/);
  assert.match(html, /\[>\]/);
});

test('the REAL active track plan.md parses and keeps exactly one active task', () => {
  const real = readFileSync(fileURLToPath(new URL('../conductor/tracks/ops-dev-data-and-tasklist/plan.md', import.meta.url)), 'utf8');
  const plan = parsePlan(real);
  assert.ok(plan.tasks.length >= 6, 'real plan has its tasks');
  assert.deepEqual(checkInvariants(plan), []);
});
