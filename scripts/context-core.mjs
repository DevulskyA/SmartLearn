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
      deps: segment('Dependências').split(/NÃO depende|Contrato adicional/)[0].replace(/\([^)]*\)/g, '').match(new RegExp(ID.source, 'g')) ?? [],
      gates: [...new Set(body.match(/HG-\d+/g) ?? [])],
      requirements: [...new Set(segment('Requisitos').match(/\bR-\d+/g) ?? [])],
    };
  });
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
export function resumeCockpit(read, { head = '(unknown)' } = {}) {
  const tasksText = read(FILES.tasks) ?? '';
  const blocks = taskBlocks(tasksText);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const active = blocks.find((b) => b.status === '>') ?? null;
  const count = (s) => blocks.filter((b) => b.status === s).length;
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
    `DONE_COUNT=${count('✓')}  OPEN_COUNT=${count(' ') + count('>')}  BLOCKED_COUNT=${count('!')}  HUMAN_GATE_COUNT=${count('H')}`,
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
