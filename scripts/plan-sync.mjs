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
import { FILES, taskBlocks, programOrder, expandRanges, norm, classifyTasks, progressCounts, subtaskCounts } from './context-core.mjs';

export const BEGIN = '<!-- PLAN:BEGIN (gerado de tasks.md por node scripts/plan-sync.mjs; não edite à mão) -->';
export const END = '<!-- PLAN:END -->';
const REGION = /<!-- PLAN:BEGIN[^\n]*-->[\s\S]*?<!-- PLAN:END -->/;

/** Cuts at a word boundary (never mid-word, no ellipsis), after the first clause marker when there is one. */
export function cut(text, n) {
  let t = String(text).trim();
  const clause = /[?:]|\s—\s|\.\s/.exec(t);
  if (clause && clause.index >= 12) t = t.slice(0, clause.index);
  if (t.length > n) { t = t.slice(0, n + 1); t = t.slice(0, Math.max(t.lastIndexOf(' '), 1)); }
  return t.replace(/[\s,;:.(—-]+$/, '');
}

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

/**
 * The panel marker of a phase, derived (never hand-set), and NEVER [✓] while anything is still pending:
 *   '>' holds the active task · '✓' everything done · 'H' only human decisions remain · '!' nothing runnable · ' ' pending and runnable.
 * `eff` is the class map of classifyTasks().
 */
export function phaseState(blocks, eff) {
  const real = blocks.filter((b) => b.status !== '=');
  if (real.some((b) => b.status === '>')) return '>';
  const remaining = real.filter((b) => b.status !== '✓');
  if (remaining.length === 0) return '✓';
  if (remaining.every((b) => eff.get(b.id) === 'D')) return 'H';
  return remaining.some((b) => eff.get(b.id) === ' ') ? ' ' : '!';
}

/** @returns {string} the generated region, markers included. Pure: depends only on the three authority texts. */
export function renderPlanRegion({ tasksText, programText = '', specText = '' }) {
  const blocks = taskBlocks(tasksText).filter((b) => b.id);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const eff = classifyTasks(blocks);
  const spec = norm(specText);
  const gateName = (hg) => cut((new RegExp(`^\\| ${hg} \\| ([^|]+)`, 'm').exec(spec)?.[1] ?? '').replace(/\s*\(.*$/, ''), 56);
  const gatesOf = (b) => [...new Set(b.statusLine.match(/HG-\d+/g) ?? [])];
  const open = (id) => byId.get(id)?.status !== '✓' && byId.get(id)?.status !== '=';
  const active = blocks.find((b) => b.status === '>') ?? null;
  const order = programOrder(programText);
  const eligible = (b) => b !== active && eff.get(b.id) === ' ' && b.deps.every((d) => !open(d));
  const queue = [...order.map((id) => byId.get(id)).filter(Boolean), ...blocks].filter((b, n, all) => all.indexOf(b) === n).filter(eligible);
  const next = queue[0] ?? null;
  const title = (b) => cut(b.heading.replace(/\s*·\s*[—-]?\s*$/, ''), 80);
  const MARK = { '✓': 'x', '>': '>', ' ': ' ', B: '!', D: 'H', '=': '=' };
  const chain = (b) => b.deps.filter(open).slice(0, 3);
  const waitsOn = (b) => [...new Set([...gatesOf(b), ...chain(b)])];
  const sc = (b) => subtaskCounts(b.subtasks);
  const subNote = (b) => (b.subtasks.length ? ` — subtarefas ${sc(b).done}/${sc(b).total}` : '');
  const row = (b, indent = '') => {
    const cls = eff.get(b.id);
    const w = cls === 'B' || cls === ' ' ? waitsOn(b).filter((x) => /^HG-/.test(x) || ['D', 'B'].includes(eff.get(x))) : cls === 'D' ? gatesOf(b) : [];
    const note = b.status === '=' ? ' — dividida em subtarefas' : w.length ? ` — ${cls === 'D' ? '' : 'aguarda '}${w.join(', ')}` : '';
    return `${indent}- [${MARK[cls]}] **${b.id}** — ${title(b)}${note}${subNote(b)}`;
  };
  const pointer = (b, why = '') => `- ${b.id} · ${title(b)}${why ? ` · ${why}` : ''}`;
  const subLines = (b, base) => b.subtasks.map((r) => `${' '.repeat(base + r.depth * 2)}- [${r.mark}] ${r.text}`);

  // PHASES = the sprints of PROGRAM.md in their canonical order; tasks keep the order PROGRAM.md gives.
  // Tasks no sprint lists: finished ones form "BASE" (delivered before the sprint plan), the rest "SEM-SPRINT".
  const sprints = programSprints(programText);
  const placed = new Set();
  const groups = [];
  const childOf = (b) => blocks.find((p) => p.status === '=' && b.id !== p.id && b.id.startsWith(p.id) && /^[a-z]$/.test(b.id.slice(p.id.length))) ?? null;
  const addGroup = (id, gtitle, ids) => {
    const members = [];
    for (const tid of ids) {
      const b = byId.get(tid);
      if (!b || placed.has(tid)) continue;
      placed.add(tid);
      const parent = childOf(b);
      if (parent && !placed.has(parent.id)) { members.push(parent); placed.add(parent.id); } // a split parent appears once, before its first child
      members.push(b);
    }
    if (members.length) groups.push({ id, title: gtitle, members });
  };
  for (const sp of sprints) addGroup(sp.id, sp.title, sp.ids.filter((tid) => byId.has(tid)));
  const rest = blocks.filter((b) => !placed.has(b.id) && b.status !== '=');
  addGroup('BASE', 'Entregue antes das sprints (F0/F1)', rest.filter((b) => b.status === '✓').map((b) => b.id));
  const base = groups.pop();
  if (base?.id === 'BASE') groups.unshift(base); else if (base) groups.push(base);
  addGroup('SEM-SPRINT', 'Fora da sequência de sprints (decisões humanas ou ainda não sequenciadas)', rest.filter((b) => b.status !== '✓').map((b) => b.id));
  const activeGroup = active ? groups.find((g) => g.members.includes(active))?.id ?? '-' : null;
  const rank = new Map();
  groups.forEach((g) => g.members.forEach((b) => rank.set(b.id, rank.size)));
  const byRank = (a, b) => rank.get(a.id) - rank.get(b.id);

  const blockedDep = blocks.filter((b) => eff.get(b.id) === 'B').sort(byRank);
  const decisions = blocks.filter((b) => eff.get(b.id) === 'D').sort(byRank);
  const pc = progressCounts(blocks);

  const out = [BEGIN, ''];
  out.push(`ATIVA AGORA: ${active ? `${active.id} (${activeGroup})` : 'nenhuma'}`
    + ` · PRÓXIMA: ${next ? next.id : 'nenhuma elegível'} · TAREFAS: ${pc.tasksDone}/${pc.tasksTotal} · SUBTAREFAS: ${pc.subDone}/${pc.subTotal}`
    + ` · BLOQUEADAS POR DEPENDÊNCIA: ${pc.blockedByDep} · DECISÕES HUMANAS: ${pc.decisions}`, '');
  out.push('Legenda das tarefas: [x] feita · [>] ativa · [ ] pendente · [!] bloqueada por dependência (segue sozinha quando a dependência fechar) · [H] decisão humana · [=] dividida. Subtarefas: [x] feita · [>] atual · [ ] pendente. Fase: [✓] concluída · [>] contém a ativa · [H] só decisões humanas restantes · [!] nada executável. AGORA é o único lugar com a árvore completa da tarefa ativa; cada linha de tarefa existe uma única vez, em FASES.', '');
  out.push('## AGORA — EM EXECUÇÃO', '');
  if (active) out.push(pointer(active, `${activeGroup} · subtarefas ${sc(active).done}/${sc(active).total}`), ...subLines(active, 2));
  else out.push('- (nenhuma tarefa em execução: tasks.md deve marcar exatamente uma `[>]`)');
  out.push('', '## PRÓXIMO', '');
  if (queue.length === 0) out.push('- (nenhuma elegível pela ordem de PROGRAM.md)');
  for (const b of queue.slice(0, 3)) out.push(pointer(b));
  out.push('', '## BLOQUEADAS POR DEPENDÊNCIA', '');
  if (blockedDep.length === 0) out.push('- (nenhuma)');
  for (const b of blockedDep) out.push(pointer(b, `aguarda ${chain(b).join(', ') || 'dependência'}`));
  out.push('', '## FASES', '');
  for (const g of groups) {
    const real = g.members.filter((b) => b.status !== '=');
    const td = real.filter((b) => b.status === '✓').length;
    const subs = subtaskCounts(real.flatMap((b) => b.subtasks));
    out.push(`### [${phaseState(g.members, eff)}] ${g.id} · ${g.title} — tarefas ${td}/${real.length}${subs.total ? ` · subtarefas ${subs.done}/${subs.total}` : ''}`, '');
    const parents = new Set(g.members.filter((b) => b.status === '=').map((b) => b.id));
    for (const b of g.members) {
      const indent = childOf(b) && parents.has(childOf(b).id) ? '  ' : '';
      out.push(row(b, indent));
      // the active task is expanded ONLY in AGORA; any other task with subtasks is expanded here
      if (b.status !== '>' && b.subtasks.length) out.push(...subLines(b, indent.length + 2));
    }
    out.push('');
  }
  out.push('## DECISÕES HUMANAS', '');
  if (decisions.length === 0) out.push('- (nenhuma)');
  for (const b of decisions) {
    const ids = gatesOf(b);
    const own = ids.length > 1 ? ids.join(' + ') : ids.map((g) => `${g} ${gateName(g)}`.trim())[0];
    const after = chain(b);
    out.push(pointer(b, own ?? `decisão humana${after.length ? ` · após ${after.join(', ')}` : ''}`));
  }
  out.push('', END);
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
