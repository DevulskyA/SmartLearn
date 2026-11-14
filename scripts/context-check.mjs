#!/usr/bin/env node
// PERSISTENCE GATE. A new Claude session (or a person) must be able to resume SmartLearn from the repository alone, without chat
// history, scratchpads or gitignored files. This script proves the structural half of that: the canonical state files exist, are
// tracked and not ignored, the active task resolves to exactly one task with a next step and a test command, every reference
// between them resolves, and every absolute path outside the repository named in a canonical document has an entry in
// .specs/ARTIFACTS.md. It never reads .specs/HANDOFF.md: that file is derived convenience, never authority.
//   node scripts/context-check.mjs            checks and exits 1 on any problem
//   node scripts/context-check.mjs --resume   also prints the cold-start answers resolved from tracked files only
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE, FILES, STATE_NAME, taskBlocks, resumeCockpit, nextReady, genericSubtasks, buildModel, readinessGaps, safeWorkRemaining, norm as normText } from './context-core.mjs';
import { planDrift, readInputs } from './plan-sync.mjs';
import { headValidationFor } from './test-live-core.mjs';
export const CANONICAL = [
  'CLAUDE.md',
  '.specs/EXECUTION.md',
  '.specs/STATE.md',
  '.specs/ARTIFACTS.md',
  `${FEATURE}/PROGRAM.md`,
  `${FEATURE}/tasks.md`,
  `${FEATURE}/spec.md`,
  `${FEATURE}/validation.md`,
  `${FEATURE}/uat-visual.md`,
  'conductor/tracks/hardening-roadmap-v1/plan.md',
  'conductor/tracks.md',
];
// documents scanned for references and for absolute paths outside the repository
const SCANNED = CANONICAL.filter((f) => f !== '.specs/ARTIFACTS.md');
// layering budgets: the first read after /clear must stay small
const MAX_MAP_LINES = 40;
const STATE_KEYS = ['CURRENT_PHASE', 'ACTIVE_TASK', 'LAST_PROVEN_MILESTONE', 'NEXT_MILESTONE', 'CRITICAL_BLOCKER'];
const ARTIFACT_KEYS = ['PURPOSE', 'CANONICAL_LOCATION', 'SHA256', 'REQUIRED_FOR', 'AVAILABILITY', 'SENSITIVITY'];
const WORKTREE_PREFIX = 'c:/projetos/smartlearn/.claude/worktrees/smartlearn-v1-complete';

const norm = (p) => p.replace(/\\/g, '/').toLowerCase();

function readCanonical(io, fail) {
  const text = {};
  for (const file of CANONICAL) {
    const content = io.read(file);
    if (content === null) {
      fail(`MISSING canonical file: ${file}`);
      continue;
    }
    text[file] = content;
    if (!io.tracked(file)) fail(`NOT TRACKED by Git: ${file}`);
    if (io.ignored(file)) fail(`GITIGNORED canonical file: ${file}`);
  }
  return text;
}

function countLines(text) {
  const lines = text.split('\n');
  while (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines.length;
}

function validateLayering(exec, state, io, fail) {
  if (exec && countLines(exec) > MAX_MAP_LINES) fail(`EXECUTION.md has ${countLines(exec)} lines (max ${MAX_MAP_LINES}): it is a map, not memory`);
  if (state) {
    if (countLines(state) > MAX_MAP_LINES) fail(`STATE.md has ${countLines(state)} lines (max ${MAX_MAP_LINES})`);
    for (const key of STATE_KEYS) if (!new RegExp(`^${key}=`, 'm').test(state)) fail(`STATE.md is missing ${key}=`);
  }
  const cockpit = resumeCockpit(io.read, { head: 'check' });
  if (cockpit.length > MAX_MAP_LINES) fail(`the context:resume cockpit has ${cockpit.length} lines (max ${MAX_MAP_LINES})`);
}

function validateExecutionReferences(exec, io, fail) {
  if (!exec) return;
  if (!/nunca é autoridade|NEVER authority/i.test(exec)) fail('EXECUTION.md must say HANDOFF.md is never authority');
  for (const match of exec.matchAll(/`((?:\.specs|conductor|scripts)\/[^`*\s]+|CLAUDE\.md)`/g)) {
    const ref = match[1];
    if (ref === '.specs/HANDOFF.md' || ref.endsWith('/')) continue;
    if (io.read(ref) === null) fail(`EXECUTION.md points to a missing file: ${ref}`);
    else if (!io.tracked(ref)) fail(`EXECUTION.md points to an untracked file: ${ref}`);
    else if (io.ignored(ref)) fail(`EXECUTION.md points to a gitignored file: ${ref}`);
  }
}

function specificationIds(spec) {
  const source = spec ?? '';
  return {
    requirements: new Set([...source.matchAll(/^### (R-\d+)/gm)].map((match) => match[1])),
    gates: new Set([...source.matchAll(/^\| (HG-\d+) \|/gm)].map((match) => match[1])),
    findings: new Set([...source.matchAll(/^\| (F-\d+) \|/gm)].map((match) => match[1])),
  };
}

function validateTaskReferences(block, ids, specIds, line, fail) {
  const segment = (name) => new RegExp(`${name}:([^·\\n]*)`).exec(line)?.[1] ?? '';
  for (const dependency of segment('Dependências').match(/T-[A-Z0-9]+-\d+[a-z]?/g) ?? []) {
    if (!ids.has(dependency)) fail(`${block.id}: depends on unknown task ${dependency}`);
  }
  for (const gate of segment('Dependências').match(/HG-\d+/g) ?? []) {
    if (!specIds.gates.has(gate)) fail(`${block.id}: unknown gate ${gate}`);
  }
  for (const requirement of segment('Requisitos').match(/\bR-\d+/g) ?? []) {
    if (!specIds.requirements.has(requirement)) fail(`${block.id}: unknown requirement ${requirement}`);
  }
  for (const finding of segment('Requisitos').match(/\bF-\d+/g) ?? []) {
    if (!specIds.findings.has(finding)) fail(`${block.id}: unknown finding ${finding}`);
  }
}

function validateTaskSubtasks(block, fail) {
  if (!block.subtasks?.length) return;
  const leaves = block.subtasks.filter((row) => row.leaf);
  const current = leaves.filter((row) => row.mark === '>');
  if (block.status === '✓' && leaves.some((row) => row.mark !== 'x')) fail(`${block.id}: done but a subtask is not [x]`);
  if (block.status === '>' && current.length !== 1) fail(`${block.id}: the active task with subtasks must have exactly ONE current subtask [>], found ${current.length}`);
  if (block.status !== '>' && current.length) fail(`${block.id}: only the active task may have a current subtask [>]`);
}

function validateCompletedTask(block, line, validation, fail) {
  if (block.status !== '✓') return;
  if (!/IMPLEMENTATION_SHA/.test(line)) fail(`${block.id}: done without IMPLEMENTATION_SHA`);
  if (validation && !new RegExp(`^#{2,4} ${block.id}(?![A-Za-z0-9])`, 'm').test(validation)) {
    fail(`${block.id}: done but validation.md has no section "### ${block.id}"`);
  }
}

function validateTaskBlock(block, ids, specIds, validation, fail) {
  if (block.status === null) {
    fail(`${block.id}: no Status line`);
    return;
  }
  if (!(block.status in STATE_NAME)) fail(`${block.id}: status [${block.status}] is not one of ${Object.keys(STATE_NAME).join(' ')}`);
  const line = /^- Status:.*$/m.exec(block.body)?.[0] ?? '';
  validateTaskReferences(block, ids, specIds, line, fail);
  for (const message of block.subtaskProblems ?? []) fail(`${block.id}: ${message}`);
  validateTaskSubtasks(block, fail);
  validateCompletedTask(block, line, validation, fail);
}

function resolveActiveTask(blocks, fail) {
  const inProgress = blocks.filter((block) => block.status === '>');
  const idle = inProgress.length === 0 && !safeWorkRemaining(blocks);
  let active = null;
  if (inProgress.length !== 0 || !idle) {
    if (inProgress.length !== 1) fail(`exactly ONE task must be in progress ([>]) in tasks.md while safe work remains, found ${inProgress.length}`);
    else {
      active = inProgress[0];
      if (!/^- Próximo passo:/m.test(active.body)) fail(`${active.id}: active task has no "Próximo passo:" line`);
    }
  }
  return { active, idle };
}

function validateReadiness(blocks, active, io, program, fail) {
  const next = nextReady(blocks, program ?? '')[0] ?? null;
  for (const [role, block] of [['active', active], ['next', next]]) {
    if (!block) continue;
    const gaps = readinessGaps(block, blocks);
    if (gaps.length) fail(`EXECUTION_READY: ${role} task ${block.id} lacks: ${gaps.join(', ')}`);
    const generic = genericSubtasks(block);
    const genericList = generic.map((row) => `"${row.text}"`).join(', ');
    if (generic.length) fail(`${block.id}: generic subtask(s) cannot be verified: ${genericList}`);
  }
  const previous = io.previousTasks?.() ?? null;
  if (previous) for (const problem of preservationProblems(previous, io.read(`${FEATURE}/tasks.md`) ?? '')) fail(problem);
}

function validateTaskQueue(tasks, spec, validation, program, io, fail) {
  if (!tasks) return { active: null, idle: false };
  const blocks = taskBlocks(tasks);
  const ids = new Set(blocks.map((block) => block.id));
  if (ids.size !== blocks.length) fail('duplicate task ids in tasks.md');
  const specIds = specificationIds(spec);
  for (const block of blocks) validateTaskBlock(block, ids, specIds, validation, fail);
  const { active, idle } = resolveActiveTask(blocks, fail);
  validateReadiness(blocks, active, io, program, fail);
  return { active, idle };
}

function validatePlan(plan, idle, active, tasks, spec, program, io, fail) {
  if (!plan) return;
  const wantActive = idle ? 0 : 1;
  const activePhases = plan.match(/^### \[>\]/gm) ?? [];
  if (activePhases.length !== wantActive) fail(`conductor plan must have ${idle ? 'NO' : 'exactly ONE'} active phase ([>]), found ${activePhases.length}`);
  const activeRows = plan.split('\n').filter((line) => /^\s*- \[>\] \*\*T-/.test(line));
  if (activeRows.length !== wantActive) fail(`conductor plan must have ${idle ? 'NO' : 'exactly ONE'} active task row ([>]), found ${activeRows.length}`);
  const taskIds = plan.split('\n').map((line) => /^\s*- \[.\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\*/.exec(line)?.[1]).filter(Boolean);
  if (new Set(taskIds).size !== taskIds.length) fail('conductor plan lists a task more than once (FASES must hold each task exactly once)');
  const activeLabel = /^ATIVA AGORA:.*$/m.exec(plan)?.[0] ?? '';
  if (active && !activeLabel.startsWith(`ATIVA AGORA: ${active.id} `)) fail(`conductor plan "ATIVA AGORA" does not name the active task ${active.id}`);
  if (tasks) validatePlanProjection(plan, tasks, spec, program, io, fail);
}

function validatePlanProjection(plan, tasks, spec, program, io, fail) {
  const drift = planDrift(plan, { tasksText: tasks, programText: program ?? '', specText: spec ?? '', validationLine: io.validationLine?.() });
  if (drift.drift) fail(`conductor plan diverges from tasks.md: ${drift.reason}`);
}

function validateCanonicalReferences(text, io, fail) {
  for (const file of SCANNED) {
    const content = file === '.specs/STATE.md' ? io.read(file) : text[file];
    if (content === null || content === undefined) continue;
    for (const match of content.matchAll(/`((?:\.specs|conductor)\/[A-Za-z0-9_./-]+\.(?:md|json|mjs|txt))`/g)) {
      const ref = match[1];
      if (ref === '.specs/HANDOFF.md') continue;
      if (io.read(ref) === null) fail(`${file} references a missing file: ${ref}`);
      else if (!io.tracked(ref)) fail(`${file} references an untracked file: ${ref}`);
    }
  }
}

function collectArtifacts(artifacts, fail) {
  const entries = [];
  if (!artifacts) return entries;
  for (const block of artifacts.split(/^## (?=A-\d+)/m).slice(1)) {
    const id = /^(A-\d+)/.exec(block)?.[1];
    const get = (key) => new RegExp(`^- ${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? null;
    for (const key of ARTIFACT_KEYS) if (get(key) === null) fail(`ARTIFACTS ${id}: missing field ${key}`);
    entries.push({ id, location: get('CANONICAL_LOCATION') ?? '' });
  }
  if (entries.length === 0) fail('ARTIFACTS.md has no entries');
  return entries;
}

function* externalWindowsPaths(text) {
  const isAsciiLetter = (char) => char !== undefined && /[A-Za-z]/.test(char);
  const isPathChar = (char) => char !== undefined && /[A-Za-z0-9_.\\/-]/.test(char);
  const isTerminalPathChar = (char) => char !== undefined && /[A-Za-z0-9_-]/.test(char);
  let cursor = 0;
  while (cursor < text.length) {
    const start = cursor;
    if (!isAsciiLetter(text[start]) || isAsciiLetter(text[start - 1]) || text[start + 1] !== ':' || !/[\\/]/.test(text[start + 2] ?? '')) {
      cursor += 1;
      continue;
    }
    let end = start + 3;
    let lastTerminal = -1;
    while (isPathChar(text[end])) {
      if (isTerminalPathChar(text[end])) lastTerminal = end;
      end += 1;
    }
    if (lastTerminal >= start + 3) {
      yield text.slice(start, lastTerminal + 1);
      cursor = lastTerminal + 1;
    } else {
      cursor += 1;
    }
  }
}

function validateExternalArtifacts(artifacts, text, io, fail) {
  const entries = collectArtifacts(artifacts, fail);
  const locations = entries.flatMap((entry) => entry.location.split(';').map((location) => location.trim()).filter(Boolean).map(norm));
  const seen = new Set();
  for (const file of SCANNED) {
    const content = file === '.specs/STATE.md' ? io.read(file) : text[file];
    if (!content) continue;
    for (const path of externalWindowsPaths(content)) {
      const normalized = norm(path);
      if (normalized.startsWith(WORKTREE_PREFIX) || seen.has(normalized)) continue;
      seen.add(normalized);
      if (!locations.some((location) => location.startsWith(normalized) || normalized.startsWith(location))) {
        fail(`external path without an ARTIFACTS.md entry: ${path} (in ${file})`);
      }
    }
  }
}

/** @param io {read(path)->string|null, tracked(path)->bool, ignored(path)->bool} */
export function checkContext(io) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const text = readCanonical(io, fail);
  const tasks = text[`${FEATURE}/tasks.md`];
  const spec = text[`${FEATURE}/spec.md`];
  const validation = text[`${FEATURE}/validation.md`];
  const plan = text['conductor/tracks/hardening-roadmap-v1/plan.md'];
  const exec = text['.specs/EXECUTION.md'];
  const artifacts = text['.specs/ARTIFACTS.md'];
  const state = text['.specs/STATE.md'];
  validateLayering(exec, state, io, fail);
  validateExecutionReferences(exec, io, fail);
  const { active, idle } = validateTaskQueue(tasks, spec, validation, text[`${FEATURE}/PROGRAM.md`], io, fail);
  validatePlan(plan, idle, active, tasks, spec, text[`${FEATURE}/PROGRAM.md`], io, fail);
  validateCanonicalReferences(text, io, fail);
  validateExternalArtifacts(artifacts, text, io, fail);
  return { ok: problems.length === 0, problems, active: active?.id ?? null, idle };
}

/** Cold-start answers resolved ONLY from tracked canonical files. */
export function resumeSummary(io) {
  const tasks = io.read(`${FEATURE}/tasks.md`) ?? '';
  const spec = io.read(`${FEATURE}/spec.md`) ?? '';
  const validation = io.read(`${FEATURE}/validation.md`) ?? '';
  const active = taskBlocks(tasks).find((b) => b.status === '>');
  const field = (name) => active ? new RegExp(`^- ${name}:\\s*(.+)$`, 'm').exec(active.body)?.[1]?.trim() ?? null : null;
  const openFindings = /^## Achados abertos[^\n]*\n([\s\S]*?)(?=^## |\Z)/m.exec(tasks)?.[1] ?? '';
  const heads = [...validation.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
  const rule = (n) => new RegExp(`^${n}\\. (.+)$`, 'm').exec(tasks)?.[1]?.split('. ')[0] ?? null;
  return {
    CURRENT_PHASE: buildModel({ tasksText: tasks, programText: io.read(`${FEATURE}/PROGRAM.md`) ?? '', specText: spec }).marco,
    ACTIVE_TASK: active ? `${active.id} — ${/^[^\n]*/.exec(active.body)[0].replace(/^T-[A-Z0-9]+-\d+[a-z]?\s*—\s*/, '')}` : null,
    NEXT_ACTION: field('Próximo passo'),
    OPEN_DEFECTS: [...openFindings.matchAll(/^- (OPEN-\d+)/gm)].map((m) => m[1]),
    HUMAN_GATES: [...new Set([...spec.matchAll(/^\| (HG-\d+) \|/gm)].map((m) => m[1]))],
    PROHIBITIONS: [rule(8), rule(9)].filter(Boolean),
    LAST_PROOF: heads.at(-1) ?? null,
    NEXT_TEST_COMMAND: field('Comando'),
  };
}

/** Known work never silently disappears: a done task stays done with its subtasks; a done subtask never vanishes. (Removing the not-done list of a distant task is allowed.) */
function isDocumentedReopen(previous, current) {
  return previous.status === '✓' && current && current.status !== '✓' && /\bREABERTA\b/.test(current.statusLine);
}

function completionRegression(previous, current) {
  if (previous.status !== '✓' || (current && current.status === '✓')) return null;
  const currentStatus = current ? `[${current.status}]` : 'missing';
  return `COMPLETED_TASKS_PRESERVED: ${previous.id} was done and is now ${currentStatus}`;
}

function missingTaskMessage(task) {
  return `COMPLETED_TASKS_PRESERVED: task ${task.id} disappeared`;
}

function missingCompletedSubtasks(previous, current) {
  const keep = new Set(current.subtasks.map((row) => row.text));
  const missing = [];
  for (const row of previous.subtasks) {
    if (keep.has(row.text) || (previous.status !== '✓' && row.mark !== 'x')) continue;
    const kind = previous.status === '✓' ? 'a subtask of a done task' : 'the done subtask';
    missing.push(`COMPLETED_TASKS_PRESERVED: ${previous.id}: ${kind} disappeared: "${row.text.slice(0, 60)}"`);
  }
  return missing;
}

export function preservationProblems(previousText, currentText) {
  const currentById = new Map(taskBlocks(currentText).filter((block) => block.id).map((block) => [block.id, block]));
  const out = [];
  for (const previous of taskBlocks(previousText).filter((block) => block.id)) {
    const current = currentById.get(previous.id);
    // An explicit REABERTA status documents the only allowed reversal of a completed task.
    if (isDocumentedReopen(previous, current)) continue;
    const regression = completionRegression(previous, current);
    if (regression) { out.push(regression); continue; }
    if (!current) { out.push(missingTaskMessage(previous)); continue; }
    out.push(...missingCompletedSubtasks(previous, current));
  }
  return out;
}

const reportProperty = (name, pass, detail = '') => ({ name, pass: !!pass, detail });

function taskVisibilityProperty(plan, blocks) {
  const planIds = [...plan.matchAll(/^ *- \[.\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\*/gm)].map((match) => match[1]);
  const expectedIds = blocks.map((block) => block.id);
  const missing = expectedIds.filter((id) => planIds.filter((listed) => listed === id).length !== 1);
  const extra = planIds.filter((id) => !expectedIds.includes(id));
  let detail = `${planIds.length} rows for ${expectedIds.length} tasks`;
  if (missing.length) detail += `; missing/duplicated: ${missing.join(' ')}`;
  if (extra.length) detail += `; unknown: ${extra.join(' ')}`;
  return reportProperty('ALL_TASKS_VISIBLE', missing.length === 0 && extra.length === 0, detail);
}

function nextTaskProperty(blocks, model, eff) {
  const active = blocks.find((block) => block.status === '>') ?? null;
  const open = blocks.filter((block) => block.status !== '✓' && block.status !== '=');
  const next = model.ready[0] ?? null;
  const othersSafe = safeWorkRemaining(blocks.filter((block) => block.id !== active?.id), eff);
  let detail = 'none: the active task is the last executable one';
  if (next) detail = next.id;
  else if (othersSafe) detail = 'no ready task';
  return reportProperty('NEXT_TASK_IDENTIFIED', next || open.length === 0 || !othersSafe, detail);
}

function completedTaskProperty(io, read) {
  const previous = io.previousTasks?.() ?? null;
  const lost = previous ? preservationProblems(previous, read(FILES.tasks) ?? '') : [];
  const detail = previous ? (lost[0] ?? 'compared with the previous committed tasks.md') : 'no previous version to compare';
  return reportProperty('COMPLETED_TASKS_PRESERVED', lost.length === 0, detail);
}

function planSection(plan, name) {
  return new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |<!-- PLAN:END)`, 'm').exec(plan)?.[1] ?? '';
}

function humanGateProperty(plan, model, eff) {
  const planned = [...planSection(plan, 'DECISÕES HUMANAS PENDENTES').matchAll(/^- (T-[A-Z0-9]+-\d+[a-z]?) ·/gm)].map((match) => match[1]);
  const bad = planned.filter((id) => eff.get(id) !== 'D');
  const missed = model.decisions.map((decision) => decision.id).filter((id) => !planned.includes(id));
  let detail = `${planned.length} decisions`;
  if (bad.length) detail += `; a dependency is listed as a human decision: ${bad.join(' ')}`;
  if (missed.length) detail += `; missing: ${missed.join(' ')}`;
  return reportProperty('DEPENDENCY_VS_HUMAN_GATE', bad.length === 0 && missed.length === 0, detail);
}

function globalProgressProperty(plan, model) {
  const total = /TAREFAS: (\d+)\/(\d+)/.exec(plan);
  const phases = [...plan.matchAll(/^### \[.\] \S+ · .* — tarefas (\d+)\/(\d+)$/gm)]
    .reduce((sum, match) => [sum[0] + +match[1], sum[1] + +match[2]], [0, 0]);
  const valid = total && +total[1] === model.progress.tasksDone && +total[2] === model.progress.tasksTotal
    && phases[0] === model.progress.tasksDone && phases[1] === model.progress.tasksTotal;
  const detail = total
    ? `plan ${total[1]}/${total[2]}, tasks.md ${model.progress.tasksDone}/${model.progress.tasksTotal}, phases ${phases.join('/')}`
    : 'plan has no TAREFAS a/b';
  return reportProperty('GLOBAL_TASK_PROGRESS_VALID', valid, detail);
}

function fakeSubtaskProgressProperty(plan, read) {
  let cockpit = '';
  try { cockpit = resumeCockpit(read, { head: 'check' }).join('\n'); } catch { cockpit = ''; }
  const fake = /SUBTAREFAS: \d|SUBTASKS=\d|^### \[.\] .* subtarefas \d/m.test(plan) || /SUBTASKS=\d/.test(cockpit);
  const detail = fake ? 'a global subtask total appears in the plan or the cockpit' : 'subtask counts only for the active and next tasks';
  return reportProperty('NO_FAKE_GLOBAL_SUBTASK_PROGRESS', !fake, detail);
}

function planSyncProperty(io, inputs) {
  const drift = planDrift(io.read(FILES.plan) ?? '', inputs);
  const detail = drift.drift ? drift.reason : 'plan.md equals the projection of tasks.md';
  return reportProperty('PLAN_SYNC', !drift.drift, detail);
}

function contextCheckProperty(base) {
  let detail;
  if (!base.ok) detail = `${base.problems.length} problem(s): ${base.problems[0]}`;
  else if (base.idle) detail = 'ACTIVE_TASK=NONE · SAFE_WORK_REMAINING=NO';
  else detail = `active ${base.active}`;
  return reportProperty('CONTEXT_CHECK', base.ok, detail);
}

/**
 * The named properties that guard REAL STATE (each one gates context:check): no task lost or duplicated, a next task exists while safe
 * work remains, completed work preserved, human gates classified correctly, honest progress, plan == projection of tasks.md.
 * (Readiness and visibility of the plan view are covered by CONTEXT_CHECK and PLAN_SYNC, not restated as extra properties.)
 */
export function contextReport(io) {
  const base = checkContext(io);
  const read = io.read;
  const inputs = { ...readInputs(read), validationLine: io.validationLine?.() };
  const plan = normText(read(FILES.plan) ?? '');
  const model = buildModel(inputs);
  const results = [
    taskVisibilityProperty(plan, model.blocks),
    nextTaskProperty(model.blocks, model, model.eff),
    completedTaskProperty(io, read),
    humanGateProperty(plan, model, model.eff),
    globalProgressProperty(plan, model),
    fakeSubtaskProgressProperty(plan, read),
    planSyncProperty(io, inputs),
    contextCheckProperty(base),
  ];
  return { results, base, ok: base.ok && results.every((r) => r.pass) };
}

export function printReport(report) {
  for (const r of report.results) console.log(`${r.name}=${r.pass ? 'PASS' : 'FAIL'} · ${r.detail}`);
  return report.ok;
}

export function gitIo(root) {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git has no portable fixed executable path; the project supports Git installations on PATH across platforms.
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return {
    // a directory is not a readable document: it reads as null (missing) instead of crashing the check
    read: (p) => (existsSync(join(root, p)) && statSync(join(root, p)).isFile() ? readFileSync(join(root, p), 'utf8') : null),
    tracked: (p) => git(['ls-files', '--error-unmatch', p]).status === 0,
    ignored: (p) => git(['check-ignore', '-q', p]).status === 0,
    validationLine: () => headValidationFor(root).line,
    // the previous committed tasks.md: HEAD when the working tree differs from it, else HEAD~1 (removals of known work must be intentional)
    previousTasks: () => {
      const cur = existsSync(join(root, FILES.tasks)) ? readFileSync(join(root, FILES.tasks), 'utf8') : '';
      const head = git(['show', `HEAD:${FILES.tasks}`]);
      if (head.status !== 0) return null;
      if (normText(head.stdout) !== normText(cur)) return head.stdout;
      const prev = git(['show', `HEAD~1:${FILES.tasks}`]);
      return prev.status === 0 ? prev.stdout : null;
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git has no portable fixed executable path; the project supports Git installations on PATH across platforms.
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || process.cwd();
  const io = gitIo(root);
  const report = contextReport(io);
  const result = report.base;
  if (process.argv.includes('--resume')) console.log(JSON.stringify(resumeSummary(io), null, 2));
  if (!result.ok) {
    console.error(`CONTEXT_CHECK=FAIL (${result.problems.length})`);
    for (const p of result.problems) console.error(`  - ${p}`);
  } else if (result.idle) console.log(`CONTEXT_CHECK=PASS · ACTIVE_TASK=NONE · SAFE_WORK_REMAINING=NO · ${CANONICAL.length} canonical files tracked`);
  else console.log(`CONTEXT_CHECK=PASS · active task ${result.active} · ${CANONICAL.length} canonical files tracked`);
  console.log('--- named properties (PASS/FAIL) ---');
  const allOk = printReport(report);
  if (!result.ok || !allOk) {
    if (result.ok) {
      console.error('CONTEXT_CHECK=FAIL: a gating named property failed');
    }
    process.exit(1);
  }
}
