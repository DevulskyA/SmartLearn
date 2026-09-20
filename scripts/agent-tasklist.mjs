#!/usr/bin/env node
// Consolidated two-lane tasklist for the two parallel agents (CLI and GUI).
//   GUI lane = the macro plan.md of the active track (structured tasks, full detail);
//   CLI lane = what the CLI agent publishes in its own coordination file (CLI.md).
// Read-only over both sources; the ONLY file it writes is the HTML board (owned by the GUI agent).
// One ACTIVE task per agent is valid (and expected), not "one global active".
//
// Usage: node scripts/agent-tasklist.mjs [--plan plan.md] [--coord <dir>] [--out tasklist.html]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parsePlan, detailHtml, LABEL, esc } from './tasklist.mjs';

/** KEY=value / KEY: value lines; indented (or non-key) lines continue the previous key. */
export function parseCoordFile(text) {
  const out = {};
  let last = null;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = raw.match(/^([A-Z][A-Z0-9_]*)(?:\s*\([^)]*\))?\s*[=:]\s*(.*)$/);
    if (m && !raw.startsWith(' ')) { last = m[1]; out[last] = m[2].trim(); continue; }
    if (last && raw.trim()) out[last] = `${out[last]} ${raw.trim()}`.trim();
  }
  return out;
}

const STATUS_TO_STATE = { RUNNING: '>', TESTING: '>', COMMITTING: '>', DONE: '✓', BLOCKED: '!' };

/** The CLI agent publishes a status file, not a plan: derive its current card and its declared NEXT. */
export function cliLane(coord) {
  const status = (coord.STATUS ?? '').split(/\s/)[0];
  // "STATUS=DONE" means "this slice is done"; a lane whose ACTIVE_TASK says PAUSED is stopped, not finished.
  const paused = /^PAUSED(?![A-Za-z])/i.test(coord.ACTIVE_TASK ?? '');
  const state = paused ? '-' : (STATUS_TO_STATE[status] ?? ' ');
  const fields = {};
  if (coord.GOAL) fields.SPRINT_GOAL = coord.GOAL;
  if (coord.SCOPE) fields.SCOPE = coord.SCOPE;
  if (coord.FILES_IN_FLIGHT) fields.FILES_IN_FLIGHT = coord.FILES_IN_FLIGHT;
  if (coord.CONTRACTS_CHANGED) fields.DETAILS = coord.CONTRACTS_CHANGED;
  if (coord.LAST_COMMIT) fields.COMMIT = coord.LAST_COMMIT;
  if (coord.STATUS) fields.EVIDENCE = coord.STATUS;
  const tasks = [{ state, id: 'CLI', title: coord.ACTIVE_TASK ?? '(sem tarefa publicada)', fields, free: '', detail: '', owner: 'CLI' }];
  if (coord.NEXT) tasks.push({ state: ' ', id: 'CLI-NEXT', title: 'Próximo declarado pelo CLI', fields: { DETAILS: coord.NEXT }, free: '', detail: '', owner: 'CLI' });
  return { title: 'AGENT_CLI', branch: coord.BRANCH ?? '', head: coord.HEAD ?? '', updated: coord.UPDATED_AT ?? '', status, tasks };
}

function taskCard(t) {
  const cls = t.state === '✓' ? 'done' : t.state === '>' ? 'active' : t.state === '!' ? 'blocked' : t.state === '-' ? 'deferred' : 'todo';
  return `
    <li class="task s-${cls}">
      <span class="mark" aria-hidden="true">${t.state === ' ' ? '' : esc(t.state)}</span>
      <div class="body">
        <div class="head"><span class="id">${esc(t.id)}</span><span class="title">${esc(t.title)}</span><span class="badge">${LABEL[t.state]}</span></div>
        ${detailHtml(t)}
      </div>
    </li>`;
}

function group(label, tasks, empty) {
  return `<h3 class="group">${esc(label)} <span class="count">${tasks.length}</span></h3>${tasks.length ? `<ul>${tasks.map(taskCard).join('')}</ul>` : `<p class="meta">${esc(empty)}</p>`}`;
}

function laneHtml(name, lane, note) {
  const done = lane.tasks.filter((t) => t.state === '✓').length;
  const active = lane.tasks.filter((t) => t.state === '>');
  return `
  <section class="lane" aria-label="${esc(name)}">
    <h2>${esc(name)}</h2>
    <p class="meta">${esc(note)}${lane.branch ? ` · branch <code>${esc(lane.branch)}</code>` : ''}${lane.head ? ` · <code>${esc(lane.head)}</code>` : ''}${lane.updated ? ` · atualizado ${esc(lane.updated)}` : ''}</p>
    <p class="meta">${done}/${lane.tasks.length} concluídas · ${active.length === 1 ? `ativa: <strong>${esc(active[0].id)}</strong>` : active.length === 0 ? 'nenhuma ativa' : `<strong class="warn">${active.length} ativas (esperado: no máximo 1 por agente)</strong>`}</p>
    ${group('Em andamento', lane.tasks.filter((t) => t.state === '>' || t.state === '!'), 'nada em andamento')}
    ${group('Próximas', lane.tasks.filter((t) => t.state === ' ' || t.state === '-'), 'nada planejado')}
    <details class="done-group"><summary>Concluídas (${done})</summary><ul>${lane.tasks.filter((t) => t.state === '✓').reverse().map(taskCard).join('')}</ul></details>
  </section>`;
}

export function renderAgentBoard({ gui, cli, now = new Date() }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="15"><title>SmartLearn — tasklist dos agentes</title>
<style>
:root{--bg:#f6f7fb;--card:#fff;--text:#1d2433;--muted:#5b6478;--line:#e2e6f0;--accent:#3a5fc8;--done:#1f7a4a;--warn:#b45309;--block:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--card:#1b2029;--text:#e8ebf2;--muted:#a3adc0;--line:#2b3342;--accent:#8ea8ff;--done:#5fd39a;--warn:#f0b35a;--block:#ff8a8a}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:88rem;margin:0 auto;padding:1.25rem 1rem 3rem}
h1{font-size:1.2rem;margin:0 0 .25rem}h2{font-size:1.05rem;margin:0 0 .25rem}.meta{color:var(--muted);font-size:.85rem;margin:.1rem 0}
.warn{color:var(--warn)}code{font-size:.8rem}
h3.group{font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:1rem 0 0}.count{font-weight:400}
.done-group{margin-top:1rem}.done-group>summary{font-weight:700;color:var(--muted)}
.lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,34rem),1fr));gap:1.25rem;margin-top:1rem}
.lane{min-width:0}ul{list-style:none;margin:.75rem 0 0;padding:0;display:grid;gap:.6rem}
.task{display:flex;gap:.75rem;background:var(--card);border:1px solid var(--line);border-radius:.75rem;padding:.75rem .9rem}
.mark{flex:0 0 1.6rem;height:1.6rem;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;font-weight:800;font-size:.85rem}
.s-done .mark{background:var(--done);border-color:var(--done);color:#fff}.s-active{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 30%,transparent)}
.s-active .mark{border-color:var(--accent);color:var(--accent)}.s-blocked .mark{border-color:var(--block);color:var(--block)}.s-deferred{opacity:.65}
.body{min-width:0;flex:1}.head{display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline}.id{font-weight:800;color:var(--muted);font-size:.8rem}.title{font-weight:650}
.badge{margin-left:auto;font-size:.72rem;font-weight:700;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:.05rem .55rem}
.s-active .badge{color:var(--accent);border-color:var(--accent)}
details{margin-top:.35rem;color:var(--muted);font-size:.85rem}summary{cursor:pointer}
dl{margin:.4rem 0 0;display:grid;grid-template-columns:max-content 1fr;gap:.25rem .75rem}dt{font-weight:700;color:var(--text)}dd{margin:0;overflow-wrap:anywhere}
@media (max-width:40rem){dl{grid-template-columns:1fr}}
</style></head><body><main>
<h1>SmartLearn — tasklist dos agentes</h1>
<p class="meta">Gerado em ${esc(now.toLocaleString('pt-BR'))} a partir de <code>plan.md</code> (GUI) e <code>CLI.md</code> (CLI). Projeção somente leitura — não edite aqui. Uma tarefa ativa por agente.</p>
<div class="lanes">${laneHtml('GUI', gui, 'plan.md do track ativo')}${laneHtml('CLI', cli, 'publicado pelo agente em CLI.md')}
</div></main></body></html>`;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const coordDir = arg('--coord', join(homedir(), 'SmartLearn-AgentCoord'));
  const tracksMd = readFileSync(join(root, 'conductor', 'tracks.md'), 'utf8');
  const rel = (tracksMd.match(/conductor\/tracks\/([\w-]+)\/plan\.md/) ?? [])[1];
  const planPath = arg('--plan', rel ? join(root, 'conductor', 'tracks', rel, 'plan.md') : null);
  const plan = parsePlan(readFileSync(planPath, 'utf8'));
  const guiCoord = existsSync(join(coordDir, 'GUI.md')) ? parseCoordFile(readFileSync(join(coordDir, 'GUI.md'), 'utf8')) : {};
  const cliCoord = existsSync(join(coordDir, 'CLI.md')) ? parseCoordFile(readFileSync(join(coordDir, 'CLI.md'), 'utf8')) : {};
  const gui = { title: 'AGENT_GUI', branch: guiCoord.BRANCH ?? '', head: guiCoord.HEAD ?? '', updated: guiCoord.UPDATED_AT ?? '', tasks: plan.tasks.map((t) => ({ ...t, owner: t.owner ?? 'GUI' })) };
  const out = arg('--out', join(coordDir, 'tasklist.html'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderAgentBoard({ gui, cli: cliLane(cliCoord) }));
  console.log(`[agent-tasklist] ${out} — GUI ${gui.tasks.length} tarefas (${gui.tasks.filter((t) => t.state === '>').map((t) => t.id).join(',') || 'nenhuma ativa'}), CLI ${cliLane(cliCoord).tasks[0].title.slice(0, 60)}`);
}
