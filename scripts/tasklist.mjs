#!/usr/bin/env node
// Tasklist PROJECTION of a Conductor plan.md. The plan is the single source of
// truth; this only reads it (never writes it) and renders:
//   - a compact text list for chat/checkpoints   (default)
//   - a self-contained HTML board for the user    (--html <path>)
// It also enforces the governance invariant: EXACTLY ONE active task ([>]).
//
// Usage: node scripts/tasklist.mjs [plan.md] [--html out.html]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYMBOL = { '✓': '✓', '>': '>', ' ': ' ', '!': '!', '-': '-' };
const LABEL = { '✓': 'concluída', '>': 'ativa', ' ': 'pendente', '!': 'bloqueada', '-': 'adiada' };

export function parsePlan(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const title = (text.match(/^# TRACK:\s*(.+)$/m) ?? [])[1]?.trim() ?? '(track sem título)';
  const status = (text.match(/Status:\s*([A-Z_]+)/) ?? [])[1] ?? 'UNKNOWN';
  const tasks = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[(✓|>| |!|-)\] \*\*([A-Z]+(?:-\d+)?)\s+(.+?)\*\*\s*(?:—\s*(.*))?$/);
    if (!m) continue;
    const detail = [m[4] ?? ''];
    while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) detail.push(lines[++i].trim());
    tasks.push({ state: m[1], id: m[2], title: m[3].trim(), detail: detail.join(' ').trim() });
  }
  return { title, status, tasks };
}

export function checkInvariants({ tasks, status }) {
  const errors = [];
  const active = tasks.filter((t) => t.state === '>');
  // An open track has exactly one active task; a CLOSED (DONE) track has none.
  const expected = status === 'DONE' ? 0 : 1;
  if (active.length !== expected) {
    errors.push(status === 'DONE'
      ? `a DONE track must have no active task ([>]), found ${active.length}`
      : `exactly ONE active task ([>]) is required, found ${active.length}`);
  }
  if (tasks.length === 0) errors.push('no tasks parsed from the plan');
  return errors;
}

export function renderCompact(plan) {
  const idWidth = Math.max(...plan.tasks.map((t) => t.id.length));
  const rows = plan.tasks.map((t) => `[${SYMBOL[t.state]}] ${t.id.padEnd(idWidth)} — ${t.title}${t.state === '>' ? '   ← ATIVA' : ''}`);
  return [`SMARTLEARN — TRACK: ${plan.title}  [${plan.status}]`, '', ...rows].join('\n');
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderHtml(plan, now = new Date()) {
  const done = plan.tasks.filter((t) => t.state === '✓').length;
  const total = plan.tasks.length;
  const items = plan.tasks.map((t) => `
    <li class="task s-${t.state === '✓' ? 'done' : t.state === '>' ? 'active' : t.state === '!' ? 'blocked' : t.state === '-' ? 'deferred' : 'todo'}">
      <span class="mark" aria-hidden="true">${t.state === ' ' ? '' : esc(t.state)}</span>
      <div class="body">
        <div class="head"><span class="id">${esc(t.id)}</span><span class="title">${esc(t.title)}</span><span class="badge">${LABEL[t.state]}</span></div>
        ${t.detail ? `<details><summary>detalhes</summary><p>${esc(t.detail)}</p></details>` : ''}
      </div>
    </li>`).join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>SmartLearn — tasklist</title>
<style>
:root{--bg:#f6f7fb;--card:#fff;--text:#1d2433;--muted:#5b6478;--line:#e2e6f0;--accent:#3a5fc8;--done:#1f7a4a;--warn:#b45309;--block:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--card:#1b2029;--text:#e8ebf2;--muted:#a3adc0;--line:#2b3342;--accent:#8ea8ff;--done:#5fd39a;--warn:#f0b35a;--block:#ff8a8a}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:52rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.15rem;margin:0 0 .25rem}.meta{color:var(--muted);font-size:.85rem;margin:0 0 1rem}
.bar{height:.5rem;background:var(--line);border-radius:99px;overflow:hidden;margin:.5rem 0 1.25rem}.bar>i{display:block;height:100%;background:var(--done);width:${total ? Math.round((done / total) * 100) : 0}%}
ul{list-style:none;margin:0;padding:0;display:grid;gap:.6rem}
.task{display:flex;gap:.75rem;background:var(--card);border:1px solid var(--line);border-radius:.75rem;padding:.75rem .9rem}
.mark{flex:0 0 1.6rem;height:1.6rem;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;font-weight:800;font-size:.85rem}
.s-done .mark{background:var(--done);border-color:var(--done);color:#fff}.s-active{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 30%,transparent)}
.s-active .mark{border-color:var(--accent);color:var(--accent)}.s-blocked .mark{border-color:var(--block);color:var(--block)}.s-deferred{opacity:.65}
.head{display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline}.id{font-weight:800;color:var(--muted);font-size:.8rem}.title{font-weight:650}
.badge{margin-left:auto;font-size:.72rem;font-weight:700;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:.05rem .55rem}
.s-active .badge{color:var(--accent);border-color:var(--accent)}details{margin-top:.35rem;color:var(--muted);font-size:.85rem}summary{cursor:pointer}
</style></head><body><main>
<h1>SMARTLEARN — TRACK: ${esc(plan.title)}</h1>
<p class="meta">Status: ${esc(plan.status)} · ${done}/${total} concluídas · gerado de <code>plan.md</code> em ${esc(now.toLocaleString('pt-BR'))} (projeção — não edite aqui)</p>
<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i></i></div>
<ul>${items}
</ul></main></body></html>`;
}

function defaultPlanPath(root) {
  const tracks = join(root, 'conductor', 'tracks');
  const tracksMd = join(root, 'conductor', 'tracks.md');
  if (existsSync(tracksMd)) {
    const m = readFileSync(tracksMd, 'utf8').match(/conductor\/tracks\/([\w-]+)\/plan\.md/);
    if (m) return join(tracks, m[1], 'plan.md');
  }
  return join(tracks, readdirSync(tracks)[0], 'plan.md');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const htmlIdx = args.indexOf('--html');
  const htmlOut = htmlIdx > -1 ? args[htmlIdx + 1] : null;
  const planPath = args.find((a, i) => !a.startsWith('--') && i !== htmlIdx + 1) ?? defaultPlanPath(root);
  const plan = parsePlan(readFileSync(planPath, 'utf8'));
  const errors = checkInvariants(plan);
  console.log(renderCompact(plan));
  if (htmlOut) {
    mkdirSync(dirname(htmlOut), { recursive: true });
    writeFileSync(htmlOut, renderHtml(plan));
    console.log(`\n[tasklist] HTML: ${htmlOut}`);
  }
  if (errors.length) { console.error(`\n[tasklist] INVARIANT VIOLATED: ${errors.join('; ')}`); process.exit(1); }
}
