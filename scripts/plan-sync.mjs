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
import { headValidationFor } from './test-live-core.mjs';
import { FILES, taskBlocks, taskField, programOrder, expandRanges, norm, classifyTasks, progressCounts, subtaskCounts, blockNote } from './context-core.mjs';

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

/** The first COMPLETE sentence of a text (parentheticals and backticks dropped); never cut by character count. */
export function firstSentence(text) {
  const t = String(text ?? '').replace(/`/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.?!])(?:\s|$)/.exec(t);
  let out = (m ? m[1] : t);
  out = out.split(/[;:]\s/)[0].trim().replace(/[.,;:]+$/, '');
  return out;
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
export const NO_VALIDATION_LINE = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA (nenhuma validação registrada para este HEAD)';

export function renderPlanRegion({ tasksText, programText = '', specText = '', validationLine = NO_VALIDATION_LINE }) {
  const blocks = taskBlocks(tasksText).filter((b) => b.id);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const eff = classifyTasks(blocks);
  const spec = norm(specText);
  const gateTitle = (hg) => firstSentence(new RegExp(`^\\| ${hg} \\| ([^|]+)`, 'm').exec(spec)?.[1] ?? '');
  const gatesOf = (b) => [...new Set(b.statusLine.match(/HG-\d+/g) ?? [])];
  const open = (id) => byId.get(id)?.status !== '✓' && byId.get(id)?.status !== '=';
  const active = blocks.find((b) => b.status === '>') ?? null;
  const order = programOrder(programText);
  const eligible = (b) => b !== active && eff.get(b.id) === ' ' && b.deps.every((d) => !open(d));
  const queue = [...order.map((id) => byId.get(id)).filter(Boolean), ...blocks].filter((b, n, all) => all.indexOf(b) === n).filter(eligible);
  const next = queue[0] ?? null;
  const title = (b) => b.heading.replace(/\s*·\s*[—-]?\s*$/, '').trim();
  const MARK = { '✓': 'x', '>': '>', ' ': ' ', B: '!', D: 'H', '=': '=' };
  const chain = (b) => b.deps.filter(open);
  const sc = (b) => subtaskCounts(b.subtasks);
  const subNote = (b) => (b.subtasks.length ? ` — subtarefas ${sc(b).done}/${sc(b).total}` : '');
  const row = (b, indent = '') => {
    const cls = eff.get(b.id);
    const note = b.status === '=' ? ' — dividida em subtarefas' : cls === 'B' ? ` — ${blockNote(b, blocks, eff)}` : cls === 'D' && gatesOf(b).length ? ` — ${gatesOf(b).join(', ')}` : '';
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
  // the current-HEAD sha is NOT written to the tracked plan (it would change on every commit); 'testado <sha>' of recorded results stays
  out.push(validationLine.replace(/;\s*HEAD atual \S+/, '').replace(/ em [0-9a-f]{7,40}$/, ''), '');
  out.push('Legenda das tarefas: [x] feita · [>] ativa · [ ] pendente · [!] bloqueada (aguarda dependência ou decisão humana, dita na linha; só segue sozinha se a causa for tarefa comum) · [H] decisão humana · [=] dividida. Subtarefas: [x] feita · [>] atual · [ ] pendente. Fase: [✓] concluída · [>] contém a ativa · [H] só decisões humanas restantes · [!] nada executável. AGORA é o único lugar com a árvore completa da tarefa ativa; cada linha de tarefa existe uma única vez, em FASES.', '');
  out.push('## AGORA — EM EXECUÇÃO', '');
  if (active) out.push(pointer(active, `${activeGroup} · subtarefas ${sc(active).done}/${sc(active).total}`), ...subLines(active, 2));
  else out.push('- (nenhuma tarefa em execução: tasks.md deve marcar exatamente uma `[>]`)');
  out.push('', '## PRÓXIMO', '');
  if (queue.length === 0) out.push('- (nenhuma elegível pela ordem de PROGRAM.md)');
  for (const b of queue.slice(0, 3)) out.push(pointer(b));
  out.push('', '## BLOQUEADAS POR DEPENDÊNCIA', '');
  if (blockedDep.length === 0) out.push('- (nenhuma)');
  for (const b of blockedDep) out.push(pointer(b, blockNote(b, blocks, eff)));
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
  const decisionText = (b) => {
    const ids = gatesOf(b);
    if (ids.length) return ids.map((g) => `${g} ${gateTitle(g)}`.trim()).join('; ');
    // what the user must decide: the human sentence of the Status line when there is one, else the task's own Outcome/Fazer, else its title
    const human = /(?:^|[·.;]\s*)([^·.;]*(?:UAT humano|[Dd]ecisão)[^·.;]*)/.exec(b.statusLine.replace(/\([^)]*\)/g, ''))?.[1];
    const sentence = firstSentence(human ?? taskField(b, 'Outcome') ?? taskField(b, 'Fazer') ?? '') || title(b);
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
  };
  for (const b of decisions) {
    const after = chain(b);
    out.push(pointer(b, `${decisionText(b)}${after.length ? ` (após ${after.join(', ')})` : ''}`));
  }
  out.push('', END);
  return out.join('\n');
}

/** Replaces the generated region of plan.md text; returns null when the markers are missing. */
export function applyRegion(planText, region) {
  const lf = planText.replace(/\r\n/g, '\n');
  return REGION.test(lf) ? lf.replace(REGION, () => region) : null;
}

const VALIDATION = /^VALIDAÇÃO DO HEAD ATUAL:.*$/m;
const provenClass = (line) => /^VALIDAÇÃO DO HEAD ATUAL: ✓/.test(line ?? '');

/**
 * True when plan.md already equals what tasks.md implies. The validation line is derived from recorded test results, so it is compared
 * by CLASS (proven for this head or not): an old "✓ PASS" in the plan is drift as soon as the head is no longer proven.
 */
export function planDrift(planText, inputs) {
  const lf = planText.replace(/\r\n/g, '\n');
  const have = REGION.exec(lf)?.[0] ?? null;
  if (have === null) return { drift: true, reason: 'plan.md has no PLAN:BEGIN/PLAN:END generated region' };
  const bad = orderProblems(inputs);
  if (bad.length) return { drift: true, reason: `execution order violates dependencies: ${bad.join('; ')}` };
  const want = renderPlanRegion(inputs);
  const haveLine = VALIDATION.exec(have)?.[0];
  const wantLine = VALIDATION.exec(want)?.[0];
  if (!haveLine || provenClass(haveLine) !== provenClass(wantLine)) return { drift: true, reason: 'plan validation line is stale: it does not match the recorded validation of the current head (run: npm run plan:sync)' };
  return have.replace(VALIDATION, '') === want.replace(VALIDATION, '') ? { drift: false } : { drift: true, reason: 'generated region differs from tasks.md (run: npm run plan:sync)' };
}

export function readInputs(read) {
  return { tasksText: read(FILES.tasks) ?? '', programText: read(FILES.program) ?? '', specText: read(FILES.spec) ?? '' };
}

/** Rewrites plan.md on disk when stale (keeps CRLF if the file used it). Returns true when it wrote. */
export function syncPlanFile(root, { validationLine } = {}) {
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  const planPath = join(root, FILES.plan);
  const raw = readFileSync(planPath, 'utf8');
  const next = applyRegion(raw, renderPlanRegion({ ...readInputs(read), ...(validationLine ? { validationLine } : {}) }));
  if (next === null) throw new Error('plan.md has no PLAN:BEGIN/PLAN:END markers');
  if (next === raw.replace(/\r\n/g, '\n')) return false;
  writeFileSync(planPath, raw.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--check')) {
    const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
    const r = planDrift(read(FILES.plan) ?? '', { ...readInputs(read), validationLine: headValidationFor(root).line });
    if (r.drift) { console.error(`PLAN_SYNC=FAIL ${r.reason}`); process.exit(1); }
    console.log('PLAN_SYNC=PASS');
  } else console.log(syncPlanFile(root, { validationLine: headValidationFor(root).line }) ? 'plan.md regenerated from tasks.md' : 'plan.md already in sync');
}
