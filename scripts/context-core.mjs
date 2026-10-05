// CONTEXT CORE: the small parsers that turn the tracked authorities into a compact "where am I" cockpit.
// Authorities (nothing here is a source of truth, everything is derived and recomputed from them):
//   tasks.md = task ids, status, dependencies, BASE/IMPLEMENTATION_SHA, the active task's next step and command
//   PROGRAM.md = the order of the work · spec.md = requirements and human gates · validation.md = evidence
//   the conductor plan = macro phase
// Used by scripts/agent-tasklist.mjs --resume (the cockpit) and scripts/context-check.mjs (the persistence gate).
export const FEATURE = '.specs/features/hardening-roadmap-v1';
export const FILES = {
  tasks: `${FEATURE}/tasks.md`,
  program: `${FEATURE}/PROGRAM.md`,
  spec: `${FEATURE}/spec.md`,
  validation: `${FEATURE}/validation.md`,
  plan: 'conductor/tracks/hardening-roadmap-v1/plan.md',
};

/** Every task has exactly one unambiguous state. `[=]` is a container task split into subtasks (it is never worked itself). */
export const STATE_NAME = { '✓': 'DONE', '>': 'IN_PROGRESS', ' ': 'PENDING', '!': 'BLOCKED', H: 'HUMAN_GATE', '=': 'SPLIT' };

const ID = /T-[A-Z0-9]+-\d+[a-z]?/;

export const norm = (text) => (text ?? '').split('\r\n').join('\n');

export function taskBlocks(tasksText) {
  return norm(tasksText).split(/^### (?=T-)/m).slice(1).map((body) => {
    const id = new RegExp(`^(${ID.source})`).exec(body)?.[1] ?? null;
    const heading = /^[^\n]*/.exec(body)[0].replace(new RegExp(`^${ID.source}\\s*—\\s*`), '').replace(/\s*·\s*[SML]\b.*$/, '');
    const statusLine = /^- Status:.*$/m.exec(body)?.[0] ?? '';
    const status = /^- Status: `\[(.)\]`/m.exec(body)?.[1] ?? null;
    const segment = (name) => new RegExp(`${name}:([^·\\n]*)`).exec(statusLine)?.[1] ?? '';
    return {
      id, heading, body, status, statusLine,
      // "NÃO depende de ..." / notes after the list are not dependencies
      // only ids OUTSIDE parentheses are dependencies; parenthesised ids are annotations
      deps: expandRanges(segment('Dependências').split(/NÃO depende|Contrato adicional/)[0].replace(/\([^)]*\)/g, '')).match(new RegExp(ID.source, 'g')) ?? [],
      gates: [...new Set(body.match(/HG-\d+/g) ?? [])],
      requirements: [...new Set(segment('Requisitos').match(/\bR-\d+/g) ?? [])],
      ...parseSubtasks(body),
    };
  });
}


/**
 * Subtasks live INSIDE the task block of tasks.md (the single source), as a compact checkbox list:
 *   - Subtarefas:
 *     - [x] group or step            (marks: x done, > current, space pending, ! blocked)
 *       - [>] nested step            (nesting = 2 more spaces; the deepest rows are the executable steps)
 * The list ends at the first line that is not such a checkbox row. Returns {subtasks, subtaskProblems}.
 */
export function parseSubtasks(body) {
  const lines = norm(body).split('\n');
  const at = lines.findIndex((l) => /^- Subtarefas:\s*$/.test(l));
  if (at < 0) return { subtasks: [], subtaskProblems: [] };
  const rows = [];
  const problems = [];
  let prev = -1;
  for (let i = at + 1; i < lines.length; i++) {
    const m = /^( +)- \[(x| |>|!)\] (.+)$/.exec(lines[i]);
    if (!m) break;
    const indent = m[1].length;
    if (indent % 2 !== 0) problems.push(`subtask "${m[3].slice(0, 40)}": indentation must be a multiple of 2`);
    const depth = Math.max(0, Math.floor((indent - 2) / 2));
    if (depth > prev + 1) problems.push(`subtask "${m[3].slice(0, 40)}": nesting jumps more than one level`);
    prev = depth;
    rows.push({ depth, mark: m[2], text: m[3].trim() });
  }
  rows.forEach((r, i) => { r.leaf = !(rows[i + 1] && rows[i + 1].depth > r.depth); });
  // a group is derived from its children: done iff every child is done, current if any descendant is current
  rows.forEach((r, i) => {
    if (r.leaf) return;
    const kids = [];
    for (let j = i + 1; j < rows.length && rows[j].depth > r.depth; j++) if (rows[j].depth === r.depth + 1) kids.push(rows[j]);
    const sub = [];
    for (let j = i + 1; j < rows.length && rows[j].depth > r.depth; j++) sub.push(rows[j]);
    if (r.mark === 'x' && !kids.every((k) => k.mark === 'x')) problems.push(`subtask group "${r.text.slice(0, 40)}" is [x] but a child is not done`);
    if (r.mark !== 'x' && kids.length && kids.every((k) => k.mark === 'x')) problems.push(`subtask group "${r.text.slice(0, 40)}" has every child done but is not [x]`);
    if (sub.some((k) => k.mark === '>') && r.mark !== '>') problems.push(`subtask group "${r.text.slice(0, 40)}" holds the current step but is not [>]`);
  });
  return { subtasks: rows, subtaskProblems: problems };
}

/** done/total over the LEAF subtasks only (groups are derived, never counted twice). */
export function subtaskCounts(subtasks) {
  const leaves = (subtasks ?? []).filter((r) => r.leaf);
  return { done: leaves.filter((r) => r.mark === 'x').length, total: leaves.length };
}

// A [H] task is a HUMAN DECISION when it itself needs the user: it carries its own HG id, or nothing it waits for is still open,
// or its text declares a human decision/evaluation. Otherwise it only waits for another task: BLOCKED BY DEPENDENCY.
const HUMAN_TEXT = /decisão humana|decisão de produto|humano avalia|avaliação humana|UAT humano|validação visual humana/i;

/**
 * Effective class of every task, derived from tasks.md alone (never stored):
 *   '✓' done · '>' active · '=' split parent · ' ' pending and runnable
 *   'D' human decision (shown [H])  · 'B' blocked by dependency (shown [!]; proceeds by itself when the dependency closes)
 */
export function classifyTasks(blocks) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const open = (id) => { const st = byId.get(id)?.status; return st !== '✓' && st !== '='; };
  const eff = new Map();
  for (const b of blocks) {
    if (b.status === '✓' || b.status === '>' || b.status === '=') eff.set(b.id, b.status);
    else if (b.status === 'H') {
      const own = /HG-\d+/.test(b.statusLine);
      eff.set(b.id, own || !b.deps.some(open) || HUMAN_TEXT.test(`${b.heading}\n${b.body}`) ? 'D' : 'B');
    } else if (b.status === '!') eff.set(b.id, 'B');
    else eff.set(b.id, ' ');
  }
  // a pending task whose open dependency is itself a decision or blocked cannot run: blocked by dependency (to a fixpoint)
  for (let changed = true; changed;) {
    changed = false;
    for (const b of blocks) {
      if (eff.get(b.id) === ' ' && b.deps.some((d) => open(d) && ['D', 'B'].includes(eff.get(d)))) { eff.set(b.id, 'B'); changed = true; }
    }
  }
  return eff;
}

/** The numbers shown everywhere (plan, panel, cockpit): tasks exclude split parents; subtasks are leaves of the checkbox lists. */
export function progressCounts(blocks) {
  const eff = classifyTasks(blocks);
  const real = blocks.filter((b) => b.status !== '=');
  const sub = subtaskCounts(blocks.flatMap((b) => b.subtasks ?? []));
  return {
    tasksDone: real.filter((b) => b.status === '✓').length, tasksTotal: real.length,
    subDone: sub.done, subTotal: sub.total,
    decisions: real.filter((b) => eff.get(b.id) === 'D').length,
    blockedByDep: real.filter((b) => eff.get(b.id) === 'B').length,
  };
}

const field = (block, name) => new RegExp(`^- ${name}:\\s*(.+)$`, 'm').exec(block?.body ?? '')?.[1]?.trim() ?? null;
export const taskField = field;
const clip = (s, n = 230) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "T-F3-01..05" -> "T-F3-01 T-F3-02 ... T-F3-05" (a range in PROGRAM.md means every id in it, in order). */
export function expandRanges(text) {
  return text.replace(/(T-[A-Z0-9]+-)(\d+)\.\.(\d+)/g, (_m, pre, a, b) => {
    const out = [];
    for (let n = Number(a); n <= Number(b); n++) out.push(`${pre}${String(n).padStart(a.length, '0')}`);
    return out.join(' ');
  });
}

/** Task ids in the order PROGRAM.md says the work happens (first appearance across the sprint table). */
export function programOrder(programText) {
  const order = [];
  for (const line of norm(programText).split('\n')) {
    if (!/^\| \*\*S/.test(line)) continue;
    // only the "Tarefas" column (4th cell) sequences work; ids in the dependency column are annotations
    const cells = line.split('|');
    for (const id of expandRanges(cells.length > 4 ? cells[3] : line).match(new RegExp(ID.source, 'g')) ?? []) if (!order.includes(id)) order.push(id);
  }
  return order;
}

/** @param read (path) => string|null   @returns {string[]} the cockpit lines (derived, never authority) */
export function resumeCockpit(read, { head = '(unknown)', validationLine = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA (nenhuma validação registrada)' } = {}) {
  const tasksText = read(FILES.tasks) ?? '';
  const blocks = taskBlocks(tasksText);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const active = blocks.find((b) => b.status === '>') ?? null;
  const count = (s) => blocks.filter((b) => b.status === s).length;
  const pc = progressCounts(blocks);
  const spec = norm(read(FILES.spec));
  const gateName = (hg) => (new RegExp(`^\\| ${hg} \\| ([^|]+)`, 'm').exec(spec)?.[1] ?? '').trim().replace(/\s*\(.*$/, '');
  const plan = norm(read(FILES.plan));
  const order = programOrder(read(FILES.program) ?? '');
  const eligible = (b) => b && b !== active && b.status === ' ' && b.deps.every((d) => byId.get(d)?.status === '✓' || byId.get(d)?.status === '=');
  const next3 = order.map((id) => byId.get(id)).filter(eligible).slice(0, 3);
  const blockers = active ? active.deps.filter((d) => byId.get(d)?.status !== '✓').map((d) => `${d}[${STATE_NAME[byId.get(d)?.status] ?? 'MISSING'}]`) : [];
  const relevantGates = [...new Set([...(active?.gates ?? []), ...next3.flatMap((b) => b.gates)])];
  // the standing prohibitions are rules 8 and 9 of tasks.md "Regras de execução" (derived here, never restated by hand)
  const ruleText = (n) => new RegExp(`^${n}\\. (.+)$`, 'm').exec(norm(tasksText))?.[1] ?? '';
  const prohibitions = [ruleText(8), ruleText(9)].filter(Boolean).map((r) => clip(r.replace(/`/g, ''), 120)).join(' | ');
  const lines = [
    `HEAD=${head}`,
    `PHASE=${/^MARCO ATUAL:\s*(.+)$/m.exec(plan)?.[1] ?? '(none)'}`,
    `ACTIVE_TASK=${active ? `${active.id} — ${active.heading}` : '(none: tasks.md must mark exactly one task [>])'}`,
    `ACTIVE_STATUS=${active ? STATE_NAME[active.status] : 'NONE'}`,
    `DONE_COUNT=${count('✓')}  OPEN_COUNT=${count(' ') + count('>')}  BLOCKED_COUNT=${pc.blockedByDep}  HUMAN_GATE_COUNT=${pc.decisions}`,
    `TASKS=${pc.tasksDone}/${pc.tasksTotal}  SUBTASKS=${pc.subDone}/${pc.subTotal}  (BLOCKED_COUNT = waits for a dependency; HUMAN_GATE_COUNT = needs the user's decision)`,
    validationLine,
    '',
    `CURRENT_GOAL=${clip(field(active, 'Outcome') ?? field(active, 'Fazer')) ?? '(none)'}`,
    `CURRENT_PROOF_REQUIRED=${clip(field(active, 'Gate')) ?? '(none)'}`,
    `NEXT_STEP=${clip(field(active, 'Próximo passo')) ?? '(none)'}`,
    `NEXT_COMMAND=${clip(field(active, 'Comando')) ?? '(none)'}`,
    '',
    `NEXT_3_TASKS=${next3.length ? next3.map((b) => `${b.id} (${clip(b.heading, 60)})`).join(' | ') : '(none eligible)'}`,
    `BLOCKERS_FOR_CURRENT=${blockers.length ? blockers.join(', ') : 'none'}`,
    `OPEN_HUMAN_GATES_RELEVANT=${relevantGates.length ? relevantGates.map((g) => `${g} ${gateName(g)}`.trim()).join(' | ') : 'none for the current and next tasks'}`,
    `PROHIBITIONS=${prohibitions || '(see tasks.md "Regras de execução" 8-9)'}`,
    '',
    'READ_NOW:',
    `  ${FILES.tasks}: grep -n "${active?.id ?? '<ACTIVE_TASK>'}" (read that block only)`,
    `  ${FILES.validation}: grep -n "${active?.id ?? '<ACTIVE_TASK>'}"`,
    ...(active?.requirements.length ? [`  ${FILES.spec}: ${active.requirements.map((r) => `"### ${r}"`).join(', ')} (only those)`] : []),
    '  the code the task names',
    'DO_NOT_READ_NOW: whole PROGRAM/tasks/spec/validation, .specs/archive/**, .specs/benchmarks, .specs/HANDOFF.md (derived, may not exist)',
    '(cockpit is DERIVED from tasks.md/PROGRAM.md/spec.md/plan.md and recomputed on every run; it is never authority)',
  ];
  return lines;
}
