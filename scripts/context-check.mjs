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
import { FEATURE, FILES, STATE_NAME, taskBlocks, taskField, resumeCockpit, nextReady, executionReady, genericSubtasks, missingMinimum, buildModel, readinessGaps, classifyTasks, safeWorkRemaining, norm as normText } from './context-core.mjs';
import { planDrift, renderPlanFile, readInputs } from './plan-sync.mjs';
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
/** @param io {read(path)->string|null, tracked(path)->bool, ignored(path)->bool} */
export function checkContext(io) {
  const problems = [];
  const warnings = [];
  const fail = (msg) => problems.push(msg);
  const text = {};
  for (const f of CANONICAL) {
    const t = io.read(f);
    if (t === null) { fail(`MISSING canonical file: ${f}`); continue; }
    text[f] = t;
    if (!io.tracked(f)) fail(`NOT TRACKED by Git: ${f}`);
    if (io.ignored(f)) fail(`GITIGNORED canonical file: ${f}`);
  }
  const tasks = text[`${FEATURE}/tasks.md`];
  const spec = text[`${FEATURE}/spec.md`];
  const validation = text[`${FEATURE}/validation.md`];
  const plan = text['conductor/tracks/hardening-roadmap-v1/plan.md'];
  const exec = text['.specs/EXECUTION.md'];
  const artifacts = text['.specs/ARTIFACTS.md'];
  const state = text['.specs/STATE.md'];

  // ---- layering: STATE and the resume map stay short; STATE carries its five fields; the cockpit stays compact
  const lineCount = (s) => s.replace(/\n+$/, '').split('\n').length;
  if (exec && lineCount(exec) > MAX_MAP_LINES) fail(`EXECUTION.md has ${lineCount(exec)} lines (max ${MAX_MAP_LINES}): it is a map, not memory`);
  if (state) {
    if (lineCount(state) > MAX_MAP_LINES) fail(`STATE.md has ${lineCount(state)} lines (max ${MAX_MAP_LINES})`);
    for (const key of STATE_KEYS) if (!new RegExp(`^${key}=`, 'm').test(state)) fail(`STATE.md is missing ${key}=`);
  }
  {
    const cockpit = resumeCockpit(io.read, { head: 'check' });
    if (cockpit.length > MAX_MAP_LINES) fail(`the context:resume cockpit has ${cockpit.length} lines (max ${MAX_MAP_LINES})`);
  }

  // ---- the resume map only points at durable files
  if (exec) {
    if (!/nunca é autoridade|NEVER authority/i.test(exec)) fail('EXECUTION.md must say HANDOFF.md is never authority');
    for (const m of exec.matchAll(/`((?:\.specs|conductor|scripts)\/[^`*\s]+|CLAUDE\.md)`/g)) {
      const ref = m[1];
      if (ref === '.specs/HANDOFF.md' || ref.endsWith('/')) continue; // derived convenience (may be absent) / a directory
      if (io.read(ref) === null) fail(`EXECUTION.md points to a missing file: ${ref}`);
      else if (!io.tracked(ref)) fail(`EXECUTION.md points to an untracked file: ${ref}`);
      else if (io.ignored(ref)) fail(`EXECUTION.md points to a gitignored file: ${ref}`);
    }
  }

  // ---- task queue
  let active = null;
  let idle = false; // no active task AND no safe work left: every remaining task is a human decision or waits for one
  const context = { minimum: { noOutcome: [], noGate: [] } };
  if (tasks) {
    const blocks = taskBlocks(tasks);
    const ids = new Set(blocks.map((b) => b.id));
    if (ids.size !== blocks.length) fail('duplicate task ids in tasks.md');
    const specR = new Set([...(spec ?? '').matchAll(/^### (R-\d+)/gm)].map((m) => m[1]));
    const specHG = new Set([...(spec ?? '').matchAll(/^\| (HG-\d+) \|/gm)].map((m) => m[1]));
    const specF = new Set([...(spec ?? '').matchAll(/^\| (F-\d+) \|/gm)].map((m) => m[1]));
    for (const b of blocks) {
      if (b.status === null) { fail(`${b.id}: no Status line`); continue; }
      if (!(b.status in STATE_NAME)) fail(`${b.id}: status [${b.status}] is not one of ${Object.keys(STATE_NAME).join(' ')}`);
      const line = /^- Status:.*$/m.exec(b.body)?.[0] ?? '';
      const segment = (name) => new RegExp(`${name}:([^·\\n]*)`).exec(line)?.[1] ?? '';
      for (const dep of segment('Dependências').match(/T-[A-Z0-9]+-\d+[a-z]?/g) ?? []) if (!ids.has(dep)) fail(`${b.id}: depends on unknown task ${dep}`);
      for (const hg of segment('Dependências').match(/HG-\d+/g) ?? []) if (!specHG.has(hg)) fail(`${b.id}: unknown gate ${hg}`);
      for (const r of segment('Requisitos').match(/\bR-\d+/g) ?? []) if (!specR.has(r)) fail(`${b.id}: unknown requirement ${r}`);
      for (const f of segment('Requisitos').match(/\bF-\d+/g) ?? []) if (!specF.has(f)) fail(`${b.id}: unknown finding ${f}`);
      for (const msg of b.subtaskProblems ?? []) fail(`${b.id}: ${msg}`);
      if (b.subtasks?.length) {
        const leaves = b.subtasks.filter((r) => r.leaf);
        const current = leaves.filter((r) => r.mark === '>');
        if (b.status === '✓' && leaves.some((r) => r.mark !== 'x')) fail(`${b.id}: done but a subtask is not [x]`);
        if (b.status === '>' && current.length !== 1) fail(`${b.id}: the active task with subtasks must have exactly ONE current subtask [>], found ${current.length}`);
        if (b.status !== '>' && current.length) fail(`${b.id}: only the active task may have a current subtask [>]`);
      }
      if (b.status === '✓') {
        if (!/IMPLEMENTATION_SHA/.test(line)) fail(`${b.id}: done without IMPLEMENTATION_SHA`);
        if (validation && !new RegExp(`^#{2,4} ${b.id}(?![A-Za-z0-9])`, 'm').test(validation)) fail(`${b.id}: done but validation.md has no section "### ${b.id}"`);
      }
    }
    const inProgress = blocks.filter((b) => b.status === '>');
    idle = inProgress.length === 0 && !safeWorkRemaining(blocks);
    if (inProgress.length === 0 && idle) { /* legitimate: ACTIVE_TASK=NONE, SAFE_WORK_REMAINING=NO */ }
    else if (inProgress.length !== 1) fail(`exactly ONE task must be in progress ([>]) in tasks.md while safe work remains, found ${inProgress.length}`);
    else {
      active = inProgress[0];
      if (!/^- Próximo passo:/m.test(active.body)) fail(`${active.id}: active task has no "Próximo passo:" line`);
      // "Comando:" is optional; "Próximo passo:" belongs to the active task only
    }

    // ---- PROGRESSIVE ELABORATION: detail just in time. A task is worked only when it is EXECUTION_READY (a "Subtarefas:" list
    // with at least one verifiable leaf); the next ready task must be ready BEFORE it is promoted; distant tasks stay one line.
    const programText = text[`${FEATURE}/PROGRAM.md`] ?? '';
    const ready = nextReady(blocks, programText);
    const lacks = (b) => !executionReady(b);
    if (active && lacks(active)) fail(`EXECUTION_READY: the active task ${active.id} has no "Subtarefas:" list with at least one verifiable leaf`);
    if (ready[0] && lacks(ready[0])) fail(`EXECUTION_READY: ${ready[0].id} is the next ready task but has no "Subtarefas:" list; elaborate it before promoting it`);
    if (ready[0] && !lacks(ready[0])) { const gaps = readinessGaps(ready[0], blocks); if (gaps.length) fail(`EXECUTION_READY: ${ready[0].id} is the next ready task but lacks: ${gaps.join(', ')}`); }
    if (!active && ready[0] && lacks(ready[0])) fail(`PROMOTION: the active task was closed but the next ready task ${ready[0].id} has no "Subtarefas:"; elaborate it first`);
    for (const b of ready.slice(1)) if (lacks(b)) warnings.push(`${b.id} is shown in PRÓXIMO without subtasks (SEM SUBTAREFAS)`);
    const shownIds = new Set([...(active ? [active.id] : []), ...ready.map((b) => b.id)]);
    for (const b of blocks) {
      const generic = genericSubtasks(b);
      if (!generic.length) continue;
      if (shownIds.has(b.id)) fail(`${b.id}: generic subtask(s) cannot be verified: ${generic.map((r) => `"${r.text}"`).join(', ')}`);
      else warnings.push(`${b.id}: generic subtask(s): ${generic.map((r) => `"${r.text}"`).join(', ')}`);
    }
    // premature elaboration is reported, never hidden: a task with subtasks that is neither active nor shown in PRÓXIMO
    const premature = blocks.filter((b) => b.subtasks.length && b.status !== '✓' && !shownIds.has(b.id)).map((b) => b.id);
    if (premature.length) warnings.push(`premature subtask lists (distant tasks should stay one line): ${premature.join(', ')}`);
    // minimum for a deterministic state: Outcome/Fazer and Gate; fails only for the active and the shown (READY) tasks
    const min = missingMinimum(blocks);
    for (const b of blocks.filter((x) => shownIds.has(x.id))) {
      if (min.noOutcome.includes(b.id)) fail(`${b.id}: no Outcome/Fazer line (the active and READY tasks need one)`);
      if (min.noGate.includes(b.id)) fail(`${b.id}: no Gate line (the active and READY tasks need one)`);
    }
    const otherNoOutcome = min.noOutcome.filter((id) => !shownIds.has(id));
    const otherNoGate = min.noGate.filter((id) => !shownIds.has(id));
    if (otherNoOutcome.length || otherNoGate.length) warnings.push(`task blocks below the minimum: ${otherNoOutcome.length} without Outcome/Fazer, ${otherNoGate.length} without Gate`);
    context.minimum = { noOutcome: otherNoOutcome, noGate: otherNoGate };
    const previous = io.previousTasks?.() ?? null;
    if (previous) for (const m of preservationProblems(previous, tasks)) fail(m);
  }
  if (plan) {
    const actives = plan.match(/^### \[>\]/gm) ?? [];
    const wantActive = idle ? 0 : 1; // an idle program (nothing safe left) has no active phase or row
    if (actives.length !== wantActive) fail(`conductor plan must have ${idle ? 'NO' : 'exactly ONE'} active phase ([>]), found ${actives.length}`);
    const activeRows = plan.match(/^\s*- \[>\] \*\*T-/gm) ?? [];
    if (activeRows.length !== wantActive) fail(`conductor plan must have ${idle ? 'NO' : 'exactly ONE'} active task row ([>]), found ${activeRows.length}`);
    const taskIds = [...plan.matchAll(/^\s*- \[.\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\*/gm)].map((m) => m[1]);
    if (new Set(taskIds).size !== taskIds.length) fail('conductor plan lists a task more than once (FASES must hold each task exactly once)');
    const line = /^ATIVA AGORA:.*$/m.exec(plan)?.[0] ?? '';
    if (active && !line.startsWith(`ATIVA AGORA: ${active.id} `)) fail(`conductor plan "ATIVA AGORA" does not name the active task ${active.id}`);
    // the plan is the executable VIEW of tasks.md: its generated region must be exactly what tasks.md implies (npm run plan:sync)
    if (tasks) {
      const drift = planDrift(plan, { tasksText: tasks, programText: text[`${FEATURE}/PROGRAM.md`] ?? '', specText: spec ?? '', validationLine: io.validationLine?.() });
      if (drift.drift) fail(`conductor plan diverges from tasks.md: ${drift.reason}`);
    }
  }

  // ---- documents referenced by the canonical files exist and are tracked
  for (const f of SCANNED) {
    const t = f === '.specs/STATE.md' ? io.read(f) : text[f];
    if (t === null || t === undefined) continue;
    for (const m of t.matchAll(/`((?:\.specs|conductor)\/[A-Za-z0-9_./-]+\.(?:md|json|mjs|txt))`/g)) {
      const ref = m[1];
      if (ref === '.specs/HANDOFF.md') continue;
      if (io.read(ref) === null) fail(`${f} references a missing file: ${ref}`);
      else if (!io.tracked(ref)) fail(`${f} references an untracked file: ${ref}`);
    }
  }

  // ---- external artifacts
  const entries = [];
  if (artifacts) {
    for (const block of artifacts.split(/^## (?=A-\d+)/m).slice(1)) {
      const id = /^(A-\d+)/.exec(block)?.[1];
      const get = (key) => new RegExp(`^- ${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? null;
      for (const key of ARTIFACT_KEYS) if (get(key) === null) fail(`ARTIFACTS ${id}: missing field ${key}`);
      entries.push({ id, location: get('CANONICAL_LOCATION') ?? '' });
    }
    if (entries.length === 0) fail('ARTIFACTS.md has no entries');
  }
  const locations = entries.flatMap((e) => e.location.split(/\s*;\s*/).filter(Boolean).map(norm));
  const seen = new Set();
  for (const f of SCANNED) {
    const t = f === '.specs/STATE.md' ? io.read(f) : text[f];
    if (!t) continue;
    for (const m of t.matchAll(/(?<![A-Za-z])[A-Za-z]:[\\/][A-Za-z0-9_.\\/-]*[A-Za-z0-9_-]/g)) {
      const p = norm(m[0]);
      if (p.startsWith(WORKTREE_PREFIX) || seen.has(p)) continue;
      seen.add(p);
      if (!locations.some((l) => l.startsWith(p) || p.startsWith(l))) fail(`external path without an ARTIFACTS.md entry: ${m[0]} (in ${f})`);
    }
  }
  return { ok: problems.length === 0, problems, warnings, minimum: context.minimum, active: active?.id ?? null, idle };
}

/** Cold-start answers resolved ONLY from tracked canonical files. */
export function resumeSummary(io) {
  const tasks = io.read(`${FEATURE}/tasks.md`) ?? '';
  const spec = io.read(`${FEATURE}/spec.md`) ?? '';
  const validation = io.read(`${FEATURE}/validation.md`) ?? '';
  const plan = io.read('conductor/tracks/hardening-roadmap-v1/plan.md') ?? '';
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
export function preservationProblems(previousText, currentText) {
  const now = new Map(taskBlocks(currentText).filter((b) => b.id).map((b) => [b.id, b]));
  const out = [];
  for (const p of taskBlocks(previousText).filter((b) => b.id)) {
    const c = now.get(p.id);
    // an explicit, documented REOPEN (a close that was wrong) is the only way a done task stops being done; it must say so in its status line
    if (p.status === '✓' && c && c.status !== '✓' && /\bREABERTA\b/.test(c.statusLine)) continue;
    if (p.status === '✓' && (!c || c.status !== '✓')) { out.push(`COMPLETED_TASKS_PRESERVED: ${p.id} was done and is now ${c ? `[${c.status}]` : 'missing'}`); continue; }
    if (!c) { out.push(`COMPLETED_TASKS_PRESERVED: task ${p.id} disappeared`); continue; }
    const keep = new Set(c.subtasks.map((r) => r.text));
    for (const r of p.subtasks) {
      if (keep.has(r.text)) continue;
      if (p.status === '✓' || r.mark === 'x') out.push(`COMPLETED_TASKS_PRESERVED: ${p.id}: ${p.status === '✓' ? 'a subtask of a done task' : 'the done subtask'} disappeared: "${r.text.slice(0, 60)}"`);
    }
  }
  return out;
}

/**
 * The named properties of the progressive-elaboration contract, each PASS or FAIL (gating ones fail context:check; the horizon and the
 * premature-expansion lint are reported but never block). Derived from tasks.md (+ PROGRAM/spec) and compared with plan.md.
 */
export function contextReport(io) {
  const base = checkContext(io);
  const read = io.read;
  const inputs = { ...readInputs(read), validationLine: io.validationLine?.() };
  const plan = normText(read(FILES.plan) ?? '');
  const model = buildModel(inputs);
  const blocks = model.blocks;
  const eff = model.eff;
  const section = (name) => new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |<!-- PLAN:END)`, 'm').exec(plan)?.[1] ?? '';
  const results = [];
  const add = (name, pass, detail = '', gating = true) => results.push({ name, pass: !!pass, detail, gating });

  const planIds = [...plan.matchAll(/^ *- \[.\] \*\*(T-[A-Z0-9]+-\d+[a-z]?)\*\*/gm)].map((m) => m[1]);
  const want = blocks.map((b) => b.id);
  const missing = want.filter((id) => planIds.filter((x) => x === id).length !== 1);
  const extra = planIds.filter((id) => !want.includes(id));
  add('ALL_TASKS_VISIBLE', missing.length === 0 && extra.length === 0, `${planIds.length} rows for ${want.length} tasks${missing.length ? `; missing/duplicated: ${missing.join(' ')}` : ''}${extra.length ? `; unknown: ${extra.join(' ')}` : ''}`);

  const activeBlock = blocks.find((b) => b.status === '>');
  const leaves = activeBlock?.subtasks.filter((r) => r.leaf) ?? [];
  const current = leaves.filter((r) => r.mark === '>');
  const idle = !activeBlock && !safeWorkRemaining(blocks, eff); // nothing active and nothing safe left: the gaps below do not apply
  const gaps = idle ? [] : activeBlock ? [...(leaves.length ? [] : ['subtasks']), ...(current.length === 1 ? [] : [`exactly one current subtask (found ${current.length})`]), ...(genericSubtasks(activeBlock).length ? ['generic subtasks'] : []), ...readinessGaps(activeBlock, blocks).filter((g) => /Outcome|Gate/.test(g))] : ['no active task'];
  add('ACTIVE_TASK_FULLY_DECOMPOSED', gaps.length === 0, activeBlock ? `${activeBlock.id}: ${gaps.join(', ') || `${leaves.length} leaves, current subtask marked`}` : idle ? 'ACTIVE_TASK=NONE · SAFE_WORK_REMAINING=NO' : 'no active task');

  const agora = section('AGORA');
  add('ACTIVE_SUBTASK_VISIBLE', idle || current.length === 1 && agora.includes(`- [>] ${current[0].text}  ← EM EXECUÇÃO`), current.length === 1 ? `"${current[0].text.slice(0, 50)}"` : idle ? 'none (idle)' : 'no single current subtask');

  const open = blocks.filter((b) => b.status !== '✓' && b.status !== '=');
  const next = model.ready[0] ?? null;
  add('NEXT_TASK_IDENTIFIED', next || open.length === 0 || !safeWorkRemaining(blocks, eff), next ? next.id : safeWorkRemaining(blocks, eff) ? 'no ready task' : 'none: SAFE_WORK_REMAINING=NO');
  const nextBlock = next ? model.byId.get(next.id) : null;
  const nextGaps = nextBlock ? readinessGaps(nextBlock, blocks) : [];
  add('NEXT_TASK_EXECUTION_READY', !nextBlock || nextGaps.length === 0, nextBlock ? `${nextBlock.id}${nextGaps.length ? ` lacks: ${nextGaps.join(', ')}` : ' ready'}` : 'nothing to promote');
  const near = model.ready.slice(1).filter((r) => !r.ready).map((r) => r.id);
  add('NEAR_HORIZON_PREPARED', near.length === 0, `${model.progress.horizon.prepared}/${model.progress.horizon.total} prepared${near.length ? `; without subtasks: ${near.join(' ')}` : ''}`, false);
  const shownIds = new Set([...(activeBlock ? [activeBlock.id] : []), ...model.ready.map((r) => r.id)]);
  const premature = open.filter((b) => b.subtasks.length && !shownIds.has(b.id)).map((b) => b.id);
  add('DISTANT_TASKS_NOT_PREMATURELY_EXPANDED', premature.length === 0, premature.length ? `beyond NEXT 3 with subtasks: ${premature.join(' ')}` : 'distant tasks are one line', false);

  const previous = io.previousTasks?.() ?? null;
  const lost = previous ? preservationProblems(previous, read(FILES.tasks) ?? '') : [];
  add('COMPLETED_TASKS_PRESERVED', lost.length === 0, previous ? (lost[0] ?? 'compared with the previous committed tasks.md') : 'no previous version to compare');

  const subLine = /^ +- \[(?:x|>| |!)\] (?!\*\*).+$/;
  const planSubs = (name) => section(name).split('\n').filter((l) => subLine.test(l));
  const rendered = normText(renderPlanFile({ ...inputs, validationLine: undefined }));
  const renderedSub = (name) => (new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |<!-- PLAN:END)`, 'm').exec(rendered)?.[1] ?? '').split('\n').filter((l) => subLine.test(l));
  const durable = ['AGORA', 'PRÓXIMO'].every((n) => JSON.stringify(planSubs(n)) === JSON.stringify(renderedSub(n)));
  add('SUBTASK_STATE_DURABLE', durable, durable ? 'plan subtasks == tasks.md subtasks (plan.md can be deleted and regenerated)' : 'plan.md carries subtask state that tasks.md does not imply');

  const plannedDecisions = [...section('DECISÕES HUMANAS PENDENTES').matchAll(/^- (T-[A-Z0-9]+-\d+[a-z]?) ·/gm)].map((m) => m[1]);
  const badDecisions = plannedDecisions.filter((id) => eff.get(id) !== 'D');
  const missedDecisions = model.decisions.map((d) => d.id).filter((id) => !plannedDecisions.includes(id));
  add('DEPENDENCY_VS_HUMAN_GATE', badDecisions.length === 0 && missedDecisions.length === 0, `${plannedDecisions.length} decisions${badDecisions.length ? `; a dependency is listed as a human decision: ${badDecisions.join(' ')}` : ''}${missedDecisions.length ? `; missing: ${missedDecisions.join(' ')}` : ''}`);

  const t = /TAREFAS: (\d+)\/(\d+)/.exec(plan);
  const phaseTotals = [...plan.matchAll(/^### \[.\] \S+ · .* — tarefas (\d+)\/(\d+)$/gm)].reduce((a, m) => [a[0] + +m[1], a[1] + +m[2]], [0, 0]);
  const validProgress = t && +t[1] === model.progress.tasksDone && +t[2] === model.progress.tasksTotal && phaseTotals[0] === model.progress.tasksDone && phaseTotals[1] === model.progress.tasksTotal;
  add('GLOBAL_TASK_PROGRESS_VALID', validProgress, t ? `plan ${t[1]}/${t[2]}, tasks.md ${model.progress.tasksDone}/${model.progress.tasksTotal}, phases ${phaseTotals.join('/')}` : 'plan has no TAREFAS a/b');

  let cockpit = '';
  try { cockpit = resumeCockpit(read, { head: 'check' }).join('\n'); } catch { cockpit = ''; }
  const fake = /SUBTAREFAS: \d|SUBTASKS=\d|^### \[.\] .* subtarefas \d/m.test(plan) || /SUBTASKS=\d/.test(cockpit);
  add('NO_FAKE_GLOBAL_SUBTASK_PROGRESS', !fake, fake ? 'a global subtask total appears in the plan or the cockpit' : 'subtask counts only for the active and READY tasks');

  const drift = planDrift(read(FILES.plan) ?? '', inputs);
  add('PLAN_SYNC', !drift.drift, drift.drift ? drift.reason : 'plan.md equals the projection of tasks.md');
  add('CONTEXT_CHECK', base.ok, base.ok ? (base.idle ? 'ACTIVE_TASK=NONE · SAFE_WORK_REMAINING=NO' : `active ${base.active}`) : `${base.problems.length} problem(s): ${base.problems[0]}`);
  return { results, base, ok: base.ok && results.every((r) => r.pass || !r.gating) };
}

export function printReport(report) {
  for (const r of report.results) console.log(`${r.name}=${r.pass ? 'PASS' : 'FAIL'}${r.gating ? '' : ' (aviso)'} · ${r.detail}`);
  return report.ok;
}

export function gitIo(root) {
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
  if (result.warnings.length) {
    console.log(`CONTEXT_WARN (${result.warnings.length}, not failures):`);
    for (const w of result.warnings) console.log(`  - ${w}`);
    const m = result.minimum;
    if (m.noOutcome.length) console.log(`  · without Outcome/Fazer: ${m.noOutcome.join(' ')}`);
    if (m.noGate.length) console.log(`  · without Gate: ${m.noGate.join(' ')}`);
  }
  if (!result.ok || !allOk) { if (result.ok) console.error('CONTEXT_CHECK=FAIL: a gating named property failed'); process.exit(1); }
}
