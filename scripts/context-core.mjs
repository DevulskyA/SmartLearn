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
      // human gates the task itself waits for, as written in its Dependências (the spec §8 table has no per-gate state: all are pending)
      hgDeps: [...new Set(segment('Dependências').split(/NÃO depende|Contrato adicional/)[0].match(/HG-\d+/g) ?? [])],
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
    else eff.set(b.id, b.hgDeps?.length ? 'B' : ' ');
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

/**
 * Is there work an agent may safely do without a human? True while a task is active or pending-and-runnable (class ' ').
 * False when every remaining task is a human decision, blocked by one, or done: the program then legitimately has NO active task.
 */
export function safeWorkRemaining(blocks, eff = classifyTasks(blocks)) {
  return blocks.some((b) => eff.get(b.id) === '>' || eff.get(b.id) === ' ');
}

/**
 * Why a task is blocked, when the cause is a human decision: [{hg:[HG-xx], task, via}] — own HG ids in its Dependências, and the
 * decisions its open dependencies are (or chain to). Empty when it only waits for ordinary tasks.
 */
export function humanRoots(b, blocks, eff, seen = new Set()) {
  const byId = new Map(blocks.map((x) => [x.id, x]));
  const open = (id) => byId.get(id)?.status !== '✓' && byId.get(id)?.status !== '=';
  if (seen.has(b.id)) return [];
  seen.add(b.id);
  const roots = [];
  if (b.hgDeps?.length) roots.push({ hg: b.hgDeps, task: null, via: null });
  for (const d of b.deps.filter(open)) {
    const dep = byId.get(d);
    if (!dep) continue;
    if (eff.get(d) === 'D') roots.push({ hg: [...new Set(dep.statusLine.match(/HG-\d+/g) ?? [])], task: d, via: d });
    else if (eff.get(d) === 'B') for (const r of humanRoots(dep, blocks, eff, seen)) roots.push({ ...r, via: d });
  }
  return roots.filter((r, i) => roots.findIndex((x) => x.hg.join() === r.hg.join() && x.task === r.task && x.via === r.via) === i);
}

/** "aguarda decisão humana: HG-02 (via T-F2-03)" / "aguarda decisão humana: T-F5-03" / "aguarda T-F6-06a, T-F6-06b" (every open dependency, ranges expanded). */
export function blockNote(b, blocks, eff) {
  const byId = new Map(blocks.map((x) => [x.id, x]));
  const roots = humanRoots(b, blocks, eff);
  if (roots.length) {
    const parts = roots.map((r) => (r.hg.length ? `${r.hg.join(' + ')}${r.via ? ` (via ${r.via})` : ''}` : r.task));
    return `aguarda decisão humana: ${[...new Set(parts)].join('; ')}`;
  }
  const waits = b.deps.filter((d) => byId.get(d)?.status !== '✓' && byId.get(d)?.status !== '=');
  return waits.length ? `aguarda ${waits.join(', ')}` : 'marcada bloqueada';
}

// PROGRESSIVE ROADMAP: detail just in time, visibility all the time. Only the active task and the ONE next ready task carry a
// subtask list; a task may be worked only when it is EXECUTION_READY (a "Subtarefas:" list with at least one verifiable leaf).
const GENERIC_SUBTASKS = [
  'trabalhar na implementação', 'trabalhar na tarefa', 'revisar código', 'revisar o código', 'testar tudo', 'testar', 'revisar', 'implementar',
  'implementação', 'fazer a tarefa', 'fazer', 'concluir', 'terminar', 'ajustes finais', 'finalizar', 'desenvolver',
];
export const isGenericSubtask = (text) => GENERIC_SUBTASKS.includes(String(text).toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ').trim());
/** EXECUTION_READY: at least one leaf subtask. */
export const executionReady = (b) => !!b?.subtasks?.some((r) => r.leaf);
/** Leaf subtasks too generic to verify (small denylist). */
export const genericSubtasks = (b) => (b?.subtasks ?? []).filter((r) => r.leaf && isGenericSubtask(r.text));

/**
 * The next outcome(s), in PROGRAM.md order, that the plan shows as PRÓXIMO: runnable (class ' '), not the active one, and predictable: every
 * open dependency is the active task or an earlier task of this same list. Only ONE is prepared by default (progressive roadmap).
 */
export function nextReady(blocks, programText, limit = 1) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const eff = classifyTasks(blocks);
  const active = blocks.find((b) => b.status === '>') ?? null;
  const open = (id) => byId.get(id)?.status !== '✓' && byId.get(id)?.status !== '=';
  const ordered = [...programOrder(programText ?? '').map((id) => byId.get(id)).filter(Boolean), ...blocks].filter((b, n, all) => all.indexOf(b) === n);
  const shown = [];
  for (const b of ordered) {
    if (shown.length >= limit) break;
    if (b === active || eff.get(b.id) !== ' ') continue;
    if (b.deps.every((d) => !open(d) || d === active?.id)) shown.push(b);
  }
  return shown;
}

/** The numbers shown everywhere (plan, panel, cockpit): tasks exclude split parents. There is NO global subtask total (subtasks exist only for the active and READY tasks). */
export function progressCounts(blocks) {
  const eff = classifyTasks(blocks);
  const real = blocks.filter((b) => b.status !== '=');
  return {
    tasksDone: real.filter((b) => b.status === '✓').length, tasksTotal: real.length,
    decisions: real.filter((b) => eff.get(b.id) === 'D').length,
    blockedByDep: real.filter((b) => eff.get(b.id) === 'B').length,
  };
}

const field = (block, name) => new RegExp(`^- ${name}:\\s*(.+)$`, 'm').exec(block?.body ?? '')?.[1]?.trim() ?? null;
export const taskField = field;
/** Cuts at a sentence or word boundary (never mid-word, no ellipsis); backticks and parentheses are left balanced. */
export function boundaryCut(text, n) {
  const t = String(text ?? '');
  if (t.length <= n) return t;
  const head = t.slice(0, n + 1);
  let at = Math.max(head.lastIndexOf('; '), head.lastIndexOf('. '), head.lastIndexOf('? '));
  if (at < n * 0.4) at = head.lastIndexOf(' ');
  let out = t.slice(0, at > 0 ? at : n).trimEnd();
  for (let guard = 0; guard < 8; guard++) {
    const ticks = (out.match(/`/g) ?? []).length % 2;
    const parens = (out.match(/\(/g) ?? []).length > (out.match(/\)/g) ?? []).length;
    if (!ticks && !parens) break;
    out = out.slice(0, Math.max(ticks ? out.lastIndexOf('`') : -1, parens ? out.lastIndexOf('(') : -1)).trimEnd();
  }
  return out.replace(/[\s,;:(—-]+$/, '');
}

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

export const EXECUTION_MODEL = 'OUTCOME_DRIVEN_LEAN';
export const POLICY = '.specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md#outcome-driven-lean-execution';

/** @param read (path) => string|null   @returns {string[]} the cockpit lines (derived, never authority) */
export function resumeCockpit(read, { head = '(unknown)', validationLine = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA (nenhuma validação registrada)' } = {}) {
  const tasksText = read(FILES.tasks) ?? '';
  const blocks = taskBlocks(tasksText);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const active = blocks.find((b) => b.status === '>') ?? null;
  const pc = progressCounts(blocks);
  const model = buildModel({ tasksText, programText: read(FILES.program) ?? '', specText: read(FILES.spec) ?? '' });
  // the standing prohibitions are rules 8 and 9 of tasks.md "Regras de execução" (derived here, never restated by hand)
  const ruleText = (n) => new RegExp(`^${n}\\. (.+)$`, 'm').exec(norm(tasksText))?.[1] ?? '';
  // long values are cut at a sentence/word boundary and point to where the whole text lives
  const where = active ? ` [completo: tasks.md, bloco ${active.id}]` : '';
  const fit = (v, n = 230) => (v == null ? null : v.length > n ? `${boundaryCut(v, n)}${where}` : v);
  const prohibitions = [ruleText(8), ruleText(9)].filter(Boolean).map((r) => r.replace(/`/g, '')).join(' | '); // whole rules: a cut prohibition is worse than a long line
  const safe = safeWorkRemaining(blocks);
  const current = active?.subtasks.find((r) => r.leaf && r.mark === '>')?.text;
  const step = active ? [current, field(active, 'Próximo passo'), field(active, 'Comando') && `cmd: ${field(active, 'Comando')}`].filter(Boolean).join(' · ') : '';
  const unmet = active ? active.deps.filter((d) => byId.get(d)?.status !== '✓').map((d) => `${d}[${STATE_NAME[byId.get(d)?.status] ?? 'MISSING'}]`) : model.blocked.slice(0, 3).map((b) => `${b.id} → ${b.chain}`);
  const next = model.ready[0];
  const decisions = model.decisions.map((d) => d.id);
  const id = active?.id ?? '<ACTIVE_TASK>';
  return [
    `EXECUTION_MODEL=${EXECUTION_MODEL}`,
    `POLICY=${POLICY}`,
    `HEAD=${head}`,
    `CURRENT_OUTCOME=${active ? `${active.id} — ${active.heading}${field(active, 'Outcome') ?? field(active, 'Fazer') ? ` — ${fit(field(active, 'Outcome') ?? field(active, 'Fazer'))}` : ''}` : `(none${safe ? ': tasks.md must mark exactly one task [>]' : ': SAFE_WORK_REMAINING=NO'})`}`,
    `ACCEPTANCE=${fit(field(active, 'Gate')) ?? '(none)'}`,
    `CURRENT_STEP=${fit(step || null, 300) ?? '(none)'}`,
    `NEXT_OUTCOME=${next ? `${next.id} — ${next.title}${next.ready ? '' : ' (SEM SUBTAREFAS: elaborar antes de promover)'}` : '(none ready)'}`,
    `BLOCKERS=${unmet.length ? unmet.join(', ') : 'none'}`,
    `HUMAN_DECISIONS=${decisions.length}${decisions.length ? ` (${decisions.slice(0, 8).join(' ')}${decisions.length > 8 ? ' …' : ''}; detalhe: spec.md §8 / plan.md)` : ''}`,
    `TASKS=${pc.tasksDone}/${pc.tasksTotal} · PHASE=${model.marco} · BLOCKED=${pc.blockedByDep} (waits for a task) · HUMAN_GATES=${pc.decisions} (needs the user)`,
    validationLine,
    `PROHIBITIONS=${prohibitions || '(see tasks.md "Regras de execução" 8-9)'}`,
    `READ_NOW: ${FILES.tasks} grep -n "${id}" (that block only) · ${FILES.validation} grep -n "${id}"${active?.requirements.length ? ` · ${FILES.spec} ${active.requirements.map((r) => `"### ${r}"`).join(', ')}` : ''} · the code the task names`,
    'DO_NOT_READ_NOW: whole PROGRAM/tasks/spec/validation, .specs/archive/**, .specs/benchmarks, .specs/HANDOFF.md (derived, may not exist)',
    '(cockpit is DERIVED from tasks.md/PROGRAM.md/spec.md and recomputed on every run; it is never authority)',
  ];
}

// ======================================================================================================================
// NORMALIZED EXECUTION MODEL. ONE projection: plan.md, the HTML board and the cockpit all render THIS object, which is derived from
// tasks.md (+ PROGRAM.md for order, spec.md for gate titles) alone. Nothing about subtasks, state, dependencies or gates lives anywhere
// else, so deleting every generated view and regenerating restores the same plan.
// ======================================================================================================================

/** Cuts at a word boundary (never mid-word, no ellipsis), after the first clause marker when there is one. */
export function cut(text, n) {
  let t = String(text).trim();
  const clause = /[?:]|\s—\s|\.\s/.exec(t);
  if (clause && clause.index >= 12) t = t.slice(0, clause.index);
  if (t.length > n) { t = t.slice(0, n + 1); t = t.slice(0, Math.max(t.lastIndexOf(' '), 1)); }
  return t.replace(/[\s,;:.(—-]+$/, '');
}

/** The first COMPLETE sentence of a text (parentheticals and backticks dropped); never cut by character count. */
export function firstSentence(text, { clauses = true } = {}) {
  const t = String(text ?? '').replace(/`/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.?!])(?:\s|$)/.exec(t);
  let out = (m ? m[1] : t);
  if (clauses) out = out.split(/[;:]\s/)[0];
  out = out.trim().replace(/[.,;:]+$/, '');
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
 * The marker of a phase, derived (never hand-set), and NEVER [✓] while anything is still pending:
 *   '>' holds the active task · '✓' everything done · 'H' only human decisions remain · '!' nothing runnable · ' ' pending and runnable.
 */
export function phaseState(blocks, eff) {
  const real = blocks.filter((b) => b.status !== '=');
  if (real.some((b) => b.status === '>')) return '>';
  const remaining = real.filter((b) => b.status !== '✓');
  if (remaining.length === 0) return '✓';
  if (remaining.every((b) => eff.get(b.id) === 'D')) return 'H';
  return remaining.some((b) => eff.get(b.id) === ' ') ? ' ' : '!';
}

/** What a task needs to be worked, as a list of missing things (empty = EXECUTION_READY): Outcome/Fazer, Gate, known deps, subtasks, no open human gate. */
export function readinessGaps(b, blocks) {
  const known = new Set(blocks.map((x) => x.id));
  const eff = classifyTasks(blocks);
  const gaps = [];
  if (!/^- (Outcome|Objetivo|Fazer|Contrato adicional)\b/m.test(b.body)) gaps.push('Outcome/Fazer');
  if (!/^- Gate\b/m.test(b.body)) gaps.push('Gate');
  if (b.deps.some((d) => !known.has(d))) gaps.push('dependências conhecidas');
  if (!executionReady(b)) gaps.push('Subtarefas (≥ 1 folha verificável)');
  if (b.hgDeps?.length || eff.get(b.id) === 'D') gaps.push('decisão humana pendente');
  return gaps;
}

/** @returns the normalized execution model (see the banner above). Pure: depends only on the three authority texts. */
export function buildModel({ tasksText, programText = '', specText = '' }) {
  const blocks = taskBlocks(tasksText).filter((b) => b.id);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const eff = classifyTasks(blocks);
  const spec = norm(specText);
  const gateTitle = (hg) => firstSentence(new RegExp(`^\\| ${hg} \\| ([^|]+)`, 'm').exec(spec)?.[1] ?? '');
  const gatesOf = (b) => [...new Set(b.statusLine.match(/HG-\d+/g) ?? [])];
  const open = (id) => byId.get(id)?.status !== '✓' && byId.get(id)?.status !== '=';
  const active = blocks.find((b) => b.status === '>') ?? null;
  const shown = nextReady(blocks, programText);
  const title = (b) => b.heading.replace(/\s*·\s*[—-]?\s*$/, '').trim();
  const MARK = { '✓': 'x', '>': '>', ' ': ' ', B: '!', D: 'H', '=': '=' };
  const capital = (t) => (t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}` : t);
  const sc = (b) => subtaskCounts(b.subtasks);
  const chain = (b) => b.deps.filter(open);

  // PHASES = the sprints of PROGRAM.md in their canonical order; tasks keep the order PROGRAM.md gives.
  // Tasks no sprint lists: finished ones form "BASE" (delivered before the sprint plan), the rest "SEM-SPRINT".
  const childOf = (b) => blocks.find((p) => p.status === '=' && b.id !== p.id && b.id.startsWith(p.id) && /^[a-z]$/.test(b.id.slice(p.id.length))) ?? null;
  const placed = new Set();
  const groups = [];
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
  for (const sp of programSprints(programText)) addGroup(sp.id, sp.title, sp.ids.filter((tid) => byId.has(tid)));
  const rest = blocks.filter((b) => !placed.has(b.id) && b.status !== '=');
  addGroup('BASE', 'Entregue antes das sprints (F0/F1)', rest.filter((b) => b.status === '✓').map((b) => b.id));
  const base = groups.pop();
  if (base?.id === 'BASE') groups.unshift(base); else if (base) groups.push(base);
  addGroup('SEM-SPRINT', 'Fora da sequência de sprints (decisões humanas ou ainda não sequenciadas)', rest.filter((b) => b.status !== '✓').map((b) => b.id));
  const groupOf = (b) => groups.find((g) => g.members.includes(b));
  const rank = new Map();
  groups.forEach((g) => g.members.forEach((b) => rank.set(b.id, rank.size)));
  const byRank = (a, b) => rank.get(a.id) - rank.get(b.id);
  const activeGroup = active ? groupOf(active) : null;

  // causal chain of a blocked task: T-x BLOQUEADA → dependency → ... → HG-xx (a dependency is never a human decision itself)
  const chainText = (b) => {
    const roots = humanRoots(b, blocks, eff);
    if (!roots.length) return chain(b).join(', ') || 'dependência';
    const paths = roots.map((r) => [r.via, r.task && r.task !== r.via ? r.task : null, r.hg.length ? r.hg.join('+') : null].filter(Boolean).join(' → '));
    return [...new Set(paths)].join(' ; ');
  };

  const rowOf = (b, indent = '') => {
    const cls = eff.get(b.id);
    const kids = b.status === '=' ? blocks.filter((c) => childOf(c)?.id === b.id) : [];
    const note = b.status === '=' ? ` — dividida em ${b.id}${kids.map((c) => c.id.slice(b.id.length)).join('/')} (tarefas)` : cls === 'B' ? ` — BLOQUEADA → ${chainText(b)}` : cls === 'D' && gatesOf(b).length ? ` — ${gatesOf(b).join(', ')}` : '';
    return { id: b.id, title: title(b), mark: MARK[cls], note, indent };
  };
  const phases = groups.map((g) => {
    const real = g.members.filter((b) => b.status !== '=');
    const parents = new Set(g.members.filter((b) => b.status === '=').map((b) => b.id));
    return {
      id: g.id, title: g.title, state: phaseState(g.members, eff),
      done: real.filter((b) => b.status === '✓').length, total: real.length,
      rows: g.members.map((b) => rowOf(b, childOf(b) && parents.has(childOf(b).id) ? '  ' : '')),
    };
  });

  const why = (b, at) => {
    const g = groupOf(b)?.id ?? '-';
    const closed = b.deps.filter((d) => !open(d));
    const waiting = b.deps.filter(open);
    const skipped = (groupOf(b)?.members ?? []).filter((m) => m !== b && m !== active && m.status !== '✓' && m.status !== '=' && rank.get(m.id) < rank.get(b.id) && !shown.slice(0, at).includes(m));
    const parts = [g, active && g !== activeGroup?.id && !waiting.length ? `independente de ${activeGroup.id}` : '', closed.length ? `dependências concluídas: ${closed.join(', ')}` : 'sem dependência pendente', waiting.length ? `depois de ${waiting.join(', ')}` : ''];
    if (skipped.length) parts.push(`passa à frente de ${skipped.map((m) => m.id).join(', ')} (aguardam ${[...new Set(skipped.flatMap((m) => m.deps.filter((d) => open(d) && !skipped.some((k) => k.id === d))))].join(', ') || 'dependência'})`);
    return parts.filter(Boolean).join(' · ');
  };

  const decisionText = (b) => {
    const ids = gatesOf(b);
    if (ids.length) return ids.map((g) => `${g} ${gateTitle(g)}`.trim()).join('; ');
    // what the user must decide: the human sentence of the Status line when there is one, else the task's own Outcome/Fazer, else its title
    const human = /(?:^|[·.;]\s*)([^·.;]*(?:UAT humano|[Dd]ecisão)[^·.;]*)/.exec(b.statusLine.replace(/\([^)]*\)/g, ''))?.[1];
    return capital(firstSentence(human ?? field(b, 'Outcome') ?? field(b, 'Fazer') ?? '') || title(b));
  };

  const activeModel = active ? (() => {
    const estado = firstSentence(field(active, 'Estado') ?? '', { clauses: false }) || firstSentence(field(active, 'Execução') ?? '');
    const resultado = firstSentence(field(active, 'Resultado') ?? '', { clauses: false });
    const objetivo = resultado ? '' : firstSentence(field(active, 'Outcome') ?? field(active, 'Fazer') ?? '', { clauses: false });
    const proximo = firstSentence(field(active, 'Próximo passo') ?? '');
    const gate = firstSentence(field(active, 'Gate') ?? '', { clauses: false });
    const facts = [['Estado', estado], ['Resultado atual', resultado], ['Objetivo', objetivo], ['Próximo passo', proximo], ['Gate', gate]].filter(([, t]) => t).map(([label, t]) => ({ label, text: capital(t) }));
    return { id: active.id, title: title(active), group: activeGroup?.id ?? '-', facts, subtasks: active.subtasks, counts: sc(active) };
  })() : null;

  const ready = shown.map((b, at) => ({
    id: b.id, title: title(b), ready: executionReady(b), label: executionReady(b) ? 'READY' : 'SEM SUBTAREFAS (não pronta)',
    group: groupOf(b)?.id ?? '-', why: why(b, at), subtasks: b.subtasks, counts: sc(b),
  }));
  const blocked = blocks.filter((b) => eff.get(b.id) === 'B').sort(byRank).map((b) => ({ id: b.id, title: title(b), chain: chainText(b) }));
  const decisions = blocks.filter((b) => eff.get(b.id) === 'D').sort(byRank).map((b) => ({ id: b.id, title: title(b), text: decisionText(b), after: chain(b) }));
  const realBlocks = blocks.filter((b) => b.status !== '=');
  const progress = {
    tasksDone: realBlocks.filter((b) => b.status === '✓').length,
    tasksTotal: realBlocks.length,
    active: active ? { id: active.id, ...sc(active) } : null,
  };
  return {
    blocks, eff, byId, active: activeModel, ready, blocked, decisions, phases, progress,
    next: ready[0]?.id ?? null,
    marco: activeGroup ? `${activeGroup.id} — ${activeGroup.title}` : '—',
    status: active ? 'ACTIVE' : (realBlocks.every((b) => b.status === '✓') ? 'DONE' : 'IDLE'),
  };
}
