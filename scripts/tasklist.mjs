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

const SYMBOL = { '✓': '✓', '>': '>', ' ': ' ', '!': '!', '-': '-', H: 'H' };
const LABEL = { '✓': 'concluída', '>': 'ativa', ' ': 'pendente', '!': 'bloqueada', '-': 'adiada' };

// Structured fields a task may carry (one per line, `KEY: text`, continuation lines append to the last key).
// Legacy free-text tasks simply have none and keep showing their plain detail.
const FIELD_ORDER = [
  'SPRINT_GOAL', 'BEFORE', 'AFTER', 'WHY', 'SCOPE', 'DETAILS', 'PROOF', 'DONE_WHEN', 'FILES_IN_FLIGHT', 'DEPENDENCIES',
  'EVIDENCE', 'PRODUCT_DELTA', 'PROOF_OBSERVED', 'USER_VALUE', 'NOT_PROVEN', 'PERGUNTA', 'COMMIT',
];
const FIELD_KEYS = new Set([...FIELD_ORDER, 'OWNER']);

function parseFields(lines) {
  const fields = {};
  const free = [];
  let last = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^([A-Z_]+):(.*)$/);
    if (m && FIELD_KEYS.has(m[1])) { last = m[1]; fields[last] = m[2].trimStart(); continue; }
    if (last) fields[last] = `${fields[last]} ${line}`.trim();
    else free.push(line);
  }
  return { fields, free };
}

export function parsePlan(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const trackTitle = text.match(/^# TRACK:\s*(\S.*)$/m);
  const fallbackTitle = text.match(/^# (.+)$/m);
  const title = trackTitle?.[1]?.trim() ?? fallbackTitle?.[1]?.trim() ?? '(track sem título)';
  const status = (text.match(/Status:\s*([A-Z_]+)/) ?? [])[1] ?? 'UNKNOWN';
  const tasks = [];
  const skipped = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // generated plan (scripts/plan-sync.mjs): one panel item per PHASE heading "### [state] HR-n · title"
    const ph = lines[i].match(/^### \[([✓> !H])\] (\S+) · (.+)$/);
    if (ph) { tasks.push({ state: ph[1], id: ph[2], title: splitPhaseTitle(ph[3]).title, detail: '', fields: {}, free: '', owner: null }); continue; }
    const m = parseTaskLine(lines[i]);
    if (!m) {
      // a task-shaped line the id pattern rejected (e.g. "A11Y-1", "LARGE-PDF-1") would silently vanish from the board
      const bad = lines[i].match(/^- \[([✓> !-])\] \*\*(\S+)/);
      if (bad && !/^T-/.test(bad[2])) skipped.push(bad[2]); // T-… lines are the generated plan's task rows (not panel items)
      continue;
    }
    const detail = [m[4] ?? ''];
    while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) detail.push(lines[++i].trim());
    const { fields, free } = parseFields(detail);
    tasks.push({ state: m[1], id: m[2], title: m[3].trim(), detail: detail.join(' ').trim(), fields, free: free.join(' ').trim(), owner: fields.OWNER ?? null });
  }
  // generated plan: the single [>] task row names the active TASK; the panel shows it as the goal of the active phase
  const running = lines.map((line) => line.trimStart()).map((line) => line.match(/^- \[>\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\* — (.+)$/)).find(Boolean);
  const activePhase = tasks.find((t) => t.state === '>');
  if (running && activePhase) activePhase.fields = { ...activePhase.fields, SPRINT_GOAL: `${running[1]} — ${running[2]}` };
  return { title, status, tasks, skipped };
}

/** Splits "S3 · Verdade do runner — tarefas 0/3 · subtarefas 13/14" into the title and its counts (counts are generated, never typed). */
function splitPhaseTitle(raw) {
  const countsMatch = findPhaseCounts(raw);
  if (!countsMatch) return { title: raw.trim(), tasks: null, subs: null };
  return countsMatch;
}

function parseTaskLine(line) {
  const prefix = line.match(/^- \[([✓> !-])\] \*\*([A-Z]+(?:-\d+)?)/);
  if (!prefix) return null;
  const remainder = line.slice(prefix[0].length);
  const separator = remainder.match(/^\s+/);
  if (!separator) return null;
  let titleAndSuffix = remainder.slice(separator[0].length);
  if (titleAndSuffix.startsWith('**') && separator[0].length > 0) titleAndSuffix = ` ${titleAndSuffix}`;
  let marker = titleAndSuffix.indexOf('**');
  while (marker !== -1) {
    const suffix = titleAndSuffix.slice(marker + 2);
    const afterWhitespace = suffix.trimStart();
    const validSuffix = afterWhitespace === '' || afterWhitespace.startsWith('—');
    if (validSuffix) {
      const detail = afterWhitespace.startsWith('—') ? afterWhitespace.slice(1).trimStart() : '';
      return [line, prefix[1], prefix[2], titleAndSuffix.slice(0, marker), detail];
    }
    marker = titleAndSuffix.indexOf('**', marker + 2);
  }
  return null;
}

function findPhaseCounts(raw) {
  let marker = raw.indexOf('—');
  while (marker !== -1) {
    const title = raw.slice(0, marker);
    const counts = raw.slice(marker + 1).match(/^\s+tarefas (\d+)\/(\d+)(?: · subtarefas (\d+)\/(\d+))?$/);
    if (/\s$/.test(title) && counts) {
      return {
        title: title.trim(),
        tasks: { done: +counts[1], total: +counts[2] },
        subs: counts[3] === undefined ? null : { done: +counts[3], total: +counts[4] },
      };
    }
    marker = raw.indexOf('—', marker + 1);
  }
  return null;
}

/**
 * The board of the hardening track, rendered from the SAME normalized execution model as plan.md and the cockpit (context-core buildModel):
 * AGORA (the active task, full tree) · PRÓXIMO (READY blocks with their subtasks) · ROADMAP (one line per task, by phase) · BLOQUEADAS ·
 * DECISÕES HUMANAS PENDENTES. No plan.md parsing here: there is one projection, not two.
 */
function viewHtml(model, { title = '', marco = '', validationLine = '' } = {}) {
  const sub = (r) => `<li class="t s${Math.min(r.depth, 4)}${r.mark === '>' ? ' now' : ''}"><span class="m">[${r.mark}]</span><span class="x">${esc(r.text)}${r.mark === '>' ? ' <span class="muted">← em execução</span>' : ''}</span></li>`;
  const row = (r) => `<li class="t${r.indent ? ' sub' : ''}${r.mark === '>' ? ' now' : ''}"><span class="m">[${r.mark}]</span><span class="x">${esc(r.id)} — ${esc(r.title + r.note)}</span></li>`;
  const fact = (f) => `<li class="t f"><span class="m"></span><span class="x"><strong>${esc(f.label)}:</strong> ${esc(f.text)}</span></li>`;
  const ptr = (id, text) => `<li class="t p"><span class="m">·</span><span class="x">${esc(id)} — ${esc(text)}</span></li>`;
  const none = '<li class="t muted"><span class="m"></span><span class="x">—</span></li>';
  const a = model.active;
  const activeDetails = a
    ? ptr(a.id, `${a.title} · ${a.group} · subtarefas ${a.counts.done}/${a.counts.total}`) + a.facts.map(fact).join('') + a.subtasks.map(sub).join('')
    : none;
  const agora = `<h2>AGORA</h2><ul>${activeDetails}</ul>`;
  const readyItem = (item) => {
    const count = item.ready ? ` · subtarefas ${item.counts.done}/${item.counts.total}` : '';
    const why = fact({ label: 'Por quê', text: item.why });
    const subtasks = item.subtasks.map(sub).join('');
    return `<h3>${esc(item.id)} — ${esc(item.label)}${count} — ${esc(item.title)}</h3><ul>${why}${subtasks}</ul>`;
  };
  const readyItems = model.ready.map(readyItem).join('');
  const readyBody = readyItems || `<ul>${none}</ul>`;
  const proximo = `<h2>PRÓXIMO (${model.ready.length})</h2>${readyBody}`;
  const phases = model.phases.map((p) => `<h3>[${p.state}] ${esc(p.id)} — ${esc(p.title)} · tarefas ${p.done}/${p.total}</h3><ul>${p.rows.map(row).join('')}</ul>`).join('');
  const blockedItems = model.blocked.map((item) => ptr(item.id, 'BLOQUEADA → ' + String(item.chain))).join('');
  const blockedBody = blockedItems || none;
  const bloqueadas = `<h2>BLOQUEADAS (${model.blocked.length})</h2><ul>${blockedBody}</ul>`;
  const decisionItems = model.decisions.map((item) => {
    const after = item.after.length ? ' (após ' + item.after.join(', ') + ')' : '';
    return ptr(item.id, `${item.title} · ${item.text}${after}`);
  }).join('');
  const decisionBody = decisionItems || none;
  const decisoes = `<h2>DECISÕES HUMANAS PENDENTES (${model.decisions.length})</h2><ul>${decisionBody}</ul>`;
  const g = model.progress;
  const activeSub = g.active ? ` · subtarefas da ativa ${esc(g.active.id)} ${g.active.done}/${g.active.total}` : '';
  return `<p class="hdr"><strong>TRACK:</strong> ${esc(title)}<br><strong>MARCO ATUAL:</strong> ${esc(marco || model.marco)}<br><strong>PROGRESSO:</strong> tarefas ${g.tasksDone}/${g.tasksTotal}${activeSub}</p>
<p class="muted legend">Tarefa: [x] feita · [>] ativa · [ ] pendente · [!] bloqueada · [H] decisão humana · [=] dividida (as filhas contam como tarefas) — Subtarefa (só da ativa e da próxima): [x] feita · [>] atual · [ ] pendente (itens de checklist dentro de um bloco de tarefa) — Fase: [✓] concluída · [>] contém a ativa · [H] só decisões humanas · [!] nada executável</p>
${agora}${proximo}<h2>ROADMAP</h2>${phases}${bloqueadas}${decisoes}<h2>VALIDAÇÃO</h2><p class="hdr val">${esc(validationLine || '—')}</p>`;
}

export function checkInvariants({ tasks, status, skipped = [] }) {
  const errors = [];
  const active = tasks.filter((t) => t.state === '>');
  // An open track has exactly one active task; a CLOSED (DONE) track has none, and so has an IDLE one (every remaining task waits for a human).
  const expected = status === 'DONE' || status === 'IDLE' ? 0 : 1;
  if (active.length !== expected) {
    errors.push(status === 'DONE' || status === 'IDLE'
      ? `a ${status} track must have no active task ([>]), found ${active.length}`
      : `exactly ONE active task ([>]) is required, found ${active.length}`);
  }
  if (tasks.length === 0) errors.push('no tasks parsed from the plan');
  if (skipped?.length) errors.push(`task id(s) not parsed (use LETTERS-NUMBER, e.g. ACCESS-1): ${skipped.join(', ')}`);
  return errors;
}

export function renderCompact(plan) {
  const idWidth = Math.max(...plan.tasks.map((t) => t.id.length));
  const rows = plan.tasks.map((t) => `[${SYMBOL[t.state]}] ${t.id.padEnd(idWidth)} — ${t.title}${t.state === '>' ? '   ← ATIVA' : ''}`);
  return [`SMARTLEARN — TRACK: ${plan.title}  [${plan.status}]`, '', ...rows].join('\n');
}


export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Expandable detail block: structured fields when the task has them, otherwise its plain text. */

/**
 * The board is a SIMPLE CHECKLIST, nothing else (Conductor model): finished, doing NOW, next, blocked.
 * Details stay in plan.md. `nowGoal` is the one-line goal of the active task; `extraLines` are plain lines
 * (e.g. the other agent's one-line state).
 */
export function renderChecklistHtml({ title = 'SMARTLEARN — DESENVOLVIMENTO', tasks, extraLines = [], keepDone = 6, testsHtml = '', view = null, validationLine = '' }) {
  const stateMarks = { '-': '!', '✓': '✓', '>': '>', '!': '!', H: 'H' };
  const mark = (t) => Object.hasOwn(stateMarks, t.state) ? stateMarks[t.state] : ' ';
  const line = (t) => `<li class="t${mark(t) === '>' ? ' now' : ''}"><span class="m">[${mark(t)}]</span> ${esc(t.id)} — ${esc(t.title)}</li>`;
  const done = tasks.filter((t) => t.state === '✓');
  const shownDone = done.slice(-keepDone);
  const rest = tasks.filter((t) => t.state !== '✓');
  const order = { '>': 0, '!': 2, '-': 2, ' ': 1 };
  const upcoming = [...rest].sort((a, b) => order[a.state] - order[b.state]);
  const active = tasks.find((t) => t.state === '>');
  const goal = active ? (active.fields?.SPRINT_GOAL || active.title) : null;
  const older = done.length - shownDone.length;
  const activeGoal = goal
    ? `<div class="goal"><strong>TAREFA ATIVA AGORA:</strong><p>${esc(active.id)} — ${esc(goal)}</p></div>`
    : '<div class="goal"><strong>TAREFA ATIVA AGORA:</strong><p>nenhuma</p></div>';
  const olderLine = older > 0 ? `<li class="t muted">… +${older} concluídas antes</li>` : '';
  const renderedTasks = olderLine + shownDone.map(line).join('') + upcoming.map(line).join('');
  const taskListBody = view
    ? viewHtml(view, { title, validationLine })
    : `<ul>${renderedTasks}</ul>`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>SmartLearn — tasklist</title>
<style>
:root{--bg:#fff;--text:#1d2433;--muted:#5b6478;--now:#3a5fc8;--warn:#9a5b00}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--text:#e8ebf2;--muted:#a3adc0;--now:#8ea8ff;--warn:#f0b35a}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace}
main{max-width:52rem;margin:0 auto;padding:1.25rem 1rem 2rem}
h1{font-size:1rem;margin:0 0 1rem;letter-spacing:.02em}
ul{list-style:none;margin:0;padding:0}.t{padding:.05rem 0;display:flex;gap:.4rem}.m{flex:none;width:2.2rem;white-space:pre}.x{flex:1;min-width:0;overflow-wrap:anywhere}.hdr{margin:0 0 .5rem}.legend{font-size:.8rem;line-height:1.5;margin:0 0 .5rem}
.now{font-weight:700;color:var(--now)}h2{font-size:.95rem;margin:1.1rem 0 .2rem}h3{font-size:.9rem;margin:.9rem 0 .1rem}.sub{margin-left:2.6rem}.s0{margin-left:2.6rem}.s1{margin-left:4rem}.s2{margin-left:5.4rem}.s3{margin-left:6.8rem}.s4{margin-left:8.2rem}.val{font-weight:700;color:var(--warn)}.f{color:var(--muted)}details.tl-box{margin-top:1rem;font-size:.85rem}details.tl-box summary{cursor:pointer}.muted{color:var(--muted)}
.goal{margin-top:1.25rem}.goal p{margin:.25rem 0 0}
.tl{margin:.5rem 0;font-size:.85rem;line-height:1.5}.tl .st{font-weight:700}.tl.pass .st{color:#1f8a4c}.tl.fail .st,.tl.aborted .st{color:#c0392b}.tl.stale .st{color:#b7791f}.tl.running .st{color:var(--now)}
</style></head><body><main>
<h1>${esc(title)}</h1>
${taskListBody}
${activeGoal}
${extraLines.map((l) => `<p class="muted">${esc(l)}</p>`).join('')}
${testsHtml}
</main></body></html>`;
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
    writeFileSync(htmlOut, renderChecklistHtml({ tasks: plan.tasks }));
    console.log(`\n[tasklist] HTML: ${htmlOut}`);
  }
  if (errors.length) { console.error(`\n[tasklist] INVARIANT VIOLATED: ${errors.join('; ')}`); process.exit(1); }
}
