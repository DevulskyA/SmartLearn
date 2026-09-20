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
export const LABEL = { '✓': 'concluída', '>': 'ativa', ' ': 'pendente', '!': 'bloqueada', '-': 'adiada' };

// Structured fields a task may carry (one per line, `KEY: text`, continuation lines append to the last key).
// Legacy free-text tasks simply have none and keep showing their plain detail.
export const FIELD_ORDER = [
  'SPRINT_GOAL', 'BEFORE', 'AFTER', 'WHY', 'SCOPE', 'DETAILS', 'PROOF', 'DONE_WHEN', 'FILES_IN_FLIGHT', 'DEPENDENCIES',
  'EVIDENCE', 'PRODUCT_DELTA', 'PROOF_OBSERVED', 'USER_VALUE', 'NOT_PROVEN', 'PERGUNTA', 'COMMIT',
];
const FIELD_LABEL = {
  SPRINT_GOAL: 'Objetivo', BEFORE: 'Antes', AFTER: 'Depois', WHY: 'Por quê', SCOPE: 'Escopo', DETAILS: 'Detalhes', PROOF: 'Prova prevista',
  DONE_WHEN: 'Pronto quando', FILES_IN_FLIGHT: 'Arquivos em andamento', DEPENDENCIES: 'Dependências', EVIDENCE: 'Evidência',
  PRODUCT_DELTA: 'O que melhorou', PROOF_OBSERVED: 'Prova observada', USER_VALUE: 'Valor para o aluno', NOT_PROVEN: 'Não provado',
  PERGUNTA: 'Pergunta de fechamento', COMMIT: 'Commit',
};
const FIELD_KEYS = new Set([...FIELD_ORDER, 'OWNER']);

export function parseFields(lines) {
  const fields = {};
  const free = [];
  let last = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (m && FIELD_KEYS.has(m[1])) { last = m[1]; fields[last] = m[2]; continue; }
    if (last) fields[last] = `${fields[last]} ${line}`.trim();
    else free.push(line);
  }
  return { fields, free };
}

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
    const { fields, free } = parseFields(detail);
    tasks.push({ state: m[1], id: m[2], title: m[3].trim(), detail: detail.join(' ').trim(), fields, free: free.join(' ').trim(), owner: fields.OWNER ?? null });
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


export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Expandable detail block: structured fields when the task has them, otherwise its plain text. */

/**
 * The board is a SIMPLE CHECKLIST, nothing else (Conductor model): finished, doing NOW, next, blocked.
 * Details stay in plan.md. `nowGoal` is the one-line goal of the active task; `extraLines` are plain lines
 * (e.g. the other agent's one-line state).
 */
export function renderChecklistHtml({ title = 'SMARTLEARN — DESENVOLVIMENTO', tasks, extraLines = [], keepDone = 6 }) {
  const mark = (t) => (t.state === '-' ? '!' : t.state === '✓' ? '✓' : t.state === '>' ? '>' : t.state === '!' ? '!' : ' ');
  const line = (t) => `<li class="t${mark(t) === '>' ? ' now' : ''}"><span class="m">[${mark(t)}]</span> ${esc(t.id)} — ${esc(t.title)}</li>`;
  const done = tasks.filter((t) => t.state === '✓');
  const shownDone = done.slice(-keepDone);
  const rest = tasks.filter((t) => t.state !== '✓');
  const order = { '>': 0, '!': 2, '-': 2, ' ': 1 };
  const upcoming = [...rest].sort((a, b) => order[a.state] - order[b.state]);
  const active = tasks.find((t) => t.state === '>');
  const goal = active ? (active.fields?.SPRINT_GOAL || active.title) : null;
  const older = done.length - shownDone.length;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>SmartLearn — tasklist</title>
<style>
:root{--bg:#fff;--text:#1d2433;--muted:#5b6478;--now:#3a5fc8}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--text:#e8ebf2;--muted:#a3adc0;--now:#8ea8ff}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace}
main{max-width:52rem;margin:0 auto;padding:1.25rem 1rem 2rem}
h1{font-size:1rem;margin:0 0 1rem;letter-spacing:.02em}
ul{list-style:none;margin:0;padding:0}.t{padding:.05rem 0}.m{display:inline-block;width:2.2rem}
.now{font-weight:700;color:var(--now)}.muted{color:var(--muted)}
.goal{margin-top:1.25rem}.goal p{margin:.25rem 0 0}
</style></head><body><main>
<h1>${esc(title)}</h1>
<ul>${older > 0 ? `<li class="t muted">… +${older} concluídas antes</li>` : ''}${shownDone.map(line).join('')}${upcoming.map(line).join('')}</ul>
${goal ? `<div class="goal"><strong>EXECUTANDO AGORA:</strong><p>${esc(active.id)} — ${esc(goal)}</p></div>` : '<div class="goal"><strong>EXECUTANDO AGORA:</strong><p>nada em execução</p></div>'}
${extraLines.map((l) => `<p class="muted">${esc(l)}</p>`).join('')}
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
