#!/usr/bin/env node
// PLAN SYNC. conductor/tracks/hardening-roadmap-v1/plan.md is the HUMAN-READABLE EXECUTABLE VIEW of tasks.md: phases -> tasks ->
// subtasks, checkboxes, the one task in execution, the next task, blockers and human gates. Nothing else (no evidence, no logs,
// no requirements: those stay in spec.md / validation.md / uat-visual.md). Everything between the PLAN markers is GENERATED from
// tasks.md (+ PROGRAM.md for the order, spec.md for gate names), so the two cannot diverge: `context:check` fails on any drift and
// `npm run plan:sync` (also run by agent-tasklist) rewrites the region. Only the header above the markers is hand-written.
//   node scripts/plan-sync.mjs           rewrites the generated region if it is stale
//   node scripts/plan-sync.mjs --check   exits 1 when plan.md differs from what tasks.md implies
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, taskBlocks, programOrder, expandRanges, norm } from './context-core.mjs';

export const BEGIN = '<!-- PLAN:BEGIN (gerado de tasks.md por node scripts/plan-sync.mjs; não edite à mão) -->';
export const END = '<!-- PLAN:END -->';
const REGION = /<!-- PLAN:BEGIN[^\n]*-->[\s\S]*?<!-- PLAN:END -->/;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** [{id, title, ids}] from the sprint table of PROGRAM.md, in file order; ids = the "Tarefas" column (ranges expanded). */
export function programSprints(programText) {
  const out = [];
  for (const line of norm(programText).split('\n')) {
    const m = /^\| \*\*(S[\w-]+)\*\* ([^|]*)\|/.exec(line);
    if (!m) continue;
    const cells = line.split('|');
    const col = expandRanges(cells[3] ?? '');
    out.push({ id: m[1], title: m[2].trim(), ids: [...new Set(col.match(/T-[A-Z0-9]+-\d+[a-z]?/g) ?? [])] });
  }
  return out;
}

/** Order problems: a task that PROGRAM.md sequences before one of its own dependencies (that is also sequenced). */
export function orderProblems({ tasksText, programText = '' }) {
  const order = programOrder(programText);
  const pos = new Map(order.map((id, n) => [id, n]));
  const problems = [];
  for (const b of taskBlocks(tasksText).filter((t) => t.id && pos.has(t.id))) {
    for (const d of b.deps) if (pos.has(d) && pos.get(d) > pos.get(b.id)) problems.push(`PROGRAM.md sequences ${b.id} before its dependency ${d}`);
  }
  return problems;
}

/** The panel state of a phase, derived (never hand-set): one active task -> '>', all done -> '✓', nothing runnable -> '!', else ' '. */
function phaseState(blocks, byId) {
  const real = blocks.filter((b) => b.status !== '=');
  if (real.some((b) => b.status === '>')) return '>';
  const pending = real.filter((b) => b.status === ' ' || b.status === '!');
  if (pending.length === 0) return real.some((b) => b.status === '✓') ? '✓' : '!';
  const runnable = pending.some((b) => b.status === ' ' && b.deps.every((d) => byId.get(d)?.status === '✓' || byId.get(d)?.status === '='));
  return runnable ? ' ' : '!';
}

/** @returns {string} the generated region, markers included. Pure: depends only on the three authority texts. */
export function renderPlanRegion({ tasksText, programText = '', specText = '' }) {
  const blocks = taskBlocks(tasksText).filter((b) => b.id);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const spec = norm(specText);
  const gateName = (hg) => (new RegExp(`^\\| ${hg} \\| ([^|]+)`, 'm').exec(spec)?.[1] ?? '').trim().replace(/\s*\(.*$/, '');
  const gatesOf = (b) => [...new Set(b.statusLine.match(/HG-\d+/g) ?? [])];
  const active = blocks.find((b) => b.status === '>') ?? null;
  const order = programOrder(programText);
  const eligible = (b) => b !== active && b.status === ' ' && b.deps.every((d) => byId.get(d)?.status === '✓' || byId.get(d)?.status === '=');
  const next = order.map((id) => byId.get(id)).filter(Boolean).find(eligible) ?? blocks.find(eligible) ?? null;
  const title = (b) => clip(b.heading.replace(/\s*·\s*[—-]?\s*$/, ''), 90);
  const line = (b, tag = '') => `- [${b.status === '✓' ? 'x' : ' '}] **${b.id}** — ${title(b)}${tag}`;

  // PHASES = the sprints of PROGRAM.md in their canonical order (S0, S1, S2, S2G-a, ...); tasks keep the order PROGRAM.md gives.
  // Tasks no sprint lists: finished ones form the "BASE" group (delivered before the sprint plan), the rest "SEM-SPRINT".
  const sprints = programSprints(programText);
  const rank = new Map();
  order.forEach((id, n) => rank.set(id, n));
  blocks.forEach((b, n) => { if (!rank.has(b.id)) rank.set(b.id, 10000 + n); });
  const placed = new Set();
  const groups = [];
  const childOf = (b) => blocks.find((p) => p.status === '=' && b.id !== p.id && b.id.startsWith(p.id) && /^[a-z]$/.test(b.id.slice(p.id.length))) ?? null;
  const addGroup = (id, title, ids) => {
    const members = [];
    for (const tid of ids) {
      const b = byId.get(tid);
      if (!b || placed.has(tid)) continue;
      placed.add(tid);
      const parent = childOf(b);
      if (parent && !placed.has(parent.id)) { members.push(parent); placed.add(parent.id); } // a split parent appears once, in the group of its first child
      members.push(b);
    }
    if (members.length) groups.push({ id, title, members });
  };
  for (const sp of sprints) addGroup(sp.id, sp.title, sp.ids.filter((tid) => byId.has(tid)));
  const rest = blocks.filter((b) => !placed.has(b.id) && b.status !== '=');
  addGroup('BASE', 'Entregue antes das sprints (F0/F1)', rest.filter((b) => b.status === '✓').map((b) => b.id));
  const base = groups.pop();
  if (base?.id === 'BASE') groups.unshift(base); else if (base) groups.push(base);
  addGroup('SEM-SPRINT', 'Fora da sequência de sprints (human gate ou ainda não sequenciadas)', rest.filter((b) => b.status !== '✓').map((b) => b.id));
  const activeGroup = active ? groups.find((g) => g.members.includes(active))?.id ?? '-' : null;
  const byRank = (a, b) => rank.get(a.id) - rank.get(b.id);

  const blocked = blocks.filter((b) => b.status === '!'
    || (b.status === ' ' && b.deps.some((d) => byId.get(d)?.status === 'H' || byId.get(d)?.status === '!'))).sort(byRank);
  const humans = blocks.filter((b) => b.status === 'H').sort(byRank);

  const out = [BEGIN, ''];
  out.push(`ATIVA AGORA: ${active ? `${active.id} (${activeGroup})` : 'nenhuma'}`
    + ` · PRÓXIMA: ${next ? next.id : 'nenhuma elegível'}`
    + ` · BLOQUEADAS: ${blocked.length} · HUMAN GATE: ${humans.length}`, '');
  out.push('## EM EXECUÇÃO', '');
  out.push(active ? `- [ ] **${active.id}** — ${title(active)}  ← ÚNICA ATIVA` : '- (nenhuma tarefa em execução: tasks.md deve marcar exatamente uma `[>]`)', '');
  out.push('## PRÓXIMA', '');
  out.push(next ? line(next) : '- (nenhuma elegível pela ordem de PROGRAM.md)', '');
  out.push('## BLOQUEADO', '');
  if (blocked.length === 0) out.push('- (nada bloqueado)');
  for (const b of blocked) {
    const why = b.status === '!' ? 'marcada bloqueada' : `aguarda ${b.deps.filter((d) => ['H', '!'].includes(byId.get(d)?.status)).join(', ')}`;
    out.push(`- [ ] **${b.id}** — ${title(b)} — ${why}`);
  }
  out.push('', '## HUMAN GATE', '');
  if (humans.length === 0) out.push('- (nenhum)');
  for (const b of humans) {
    const gates = gatesOf(b).map((g) => `${g} ${clip(gateName(g), 60)}`.trim()).join('; ');
    out.push(`- [ ] **${b.id}** — ${title(b)}${gates ? ` — ${gates}` : ''}`);
  }
  out.push('', '## FASES', '');
  for (const g of groups) {
    const parents = new Set(g.members.filter((b) => b.status === '=').map((b) => b.id));
    out.push(`### [${phaseState(g.members, byId)}] ${g.id} · ${g.title}`, '');
    for (const b of g.members) {
      const nested = childOf(b) && parents.has(childOf(b).id);
      const tag = b.status === '>' ? '  ← EM EXECUÇÃO' : b.status === 'H' ? '  — HUMAN GATE' : b.status === '!' ? '  — BLOQUEADA' : b.status === '=' ? '  — DIVIDIDA em subtarefas' : '';
      out.push(`${nested ? '  ' : ''}${line(b, tag)}`);
    }
    out.push('');
  }
  out.push(END);
  return out.join('\n');
}

/** Replaces the generated region of plan.md text; returns null when the markers are missing. */
export function applyRegion(planText, region) {
  const lf = planText.replace(/\r\n/g, '\n');
  return REGION.test(lf) ? lf.replace(REGION, () => region) : null;
}

/** True when plan.md already equals what tasks.md implies. */
export function planDrift(planText, inputs) {
  const lf = planText.replace(/\r\n/g, '\n');
  const have = REGION.exec(lf)?.[0] ?? null;
  if (have === null) return { drift: true, reason: 'plan.md has no PLAN:BEGIN/PLAN:END generated region' };
  const bad = orderProblems(inputs);
  if (bad.length) return { drift: true, reason: `execution order violates dependencies: ${bad.join('; ')}` };
  return have === renderPlanRegion(inputs) ? { drift: false } : { drift: true, reason: 'generated region differs from tasks.md (run: npm run plan:sync)' };
}

export function readInputs(read) {
  return { tasksText: read(FILES.tasks) ?? '', programText: read(FILES.program) ?? '', specText: read(FILES.spec) ?? '' };
}

/** Rewrites plan.md on disk when stale (keeps CRLF if the file used it). Returns true when it wrote. */
export function syncPlanFile(root) {
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  const planPath = join(root, FILES.plan);
  const raw = readFileSync(planPath, 'utf8');
  const next = applyRegion(raw, renderPlanRegion(readInputs(read)));
  if (next === null) throw new Error('plan.md has no PLAN:BEGIN/PLAN:END markers');
  if (next === raw.replace(/\r\n/g, '\n')) return false;
  writeFileSync(planPath, raw.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--check')) {
    const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
    const r = planDrift(read(FILES.plan) ?? '', readInputs(read));
    if (r.drift) { console.error(`PLAN_SYNC=FAIL ${r.reason}`); process.exit(1); }
    console.log('PLAN_SYNC=PASS');
  } else console.log(syncPlanFile(root) ? 'plan.md regenerated from tasks.md' : 'plan.md already in sync');
}
