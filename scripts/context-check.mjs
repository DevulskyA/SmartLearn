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
import { FEATURE, FILES, STATE_NAME, taskBlocks, taskField, resumeCockpit } from './context-core.mjs';
import { planDrift } from './plan-sync.mjs';
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
      if (b.status === '✓') {
        if (!/IMPLEMENTATION_SHA/.test(line)) fail(`${b.id}: done without IMPLEMENTATION_SHA`);
        if (validation && !new RegExp(`^#{2,4} ${b.id}(?![A-Za-z0-9])`, 'm').test(validation)) fail(`${b.id}: done but validation.md has no section "### ${b.id}"`);
      }
    }
    const inProgress = blocks.filter((b) => b.status === '>');
    if (inProgress.length !== 1) fail(`exactly ONE task must be in progress ([>]) in tasks.md, found ${inProgress.length}`);
    else {
      active = inProgress[0];
      if (!/^- Próximo passo:/m.test(active.body)) fail(`${active.id}: active task has no "Próximo passo:" line`);
      if (!/^- Comando:/m.test(active.body)) fail(`${active.id}: active task has no "Comando:" line`);
    }
  }
  if (plan) {
    const actives = plan.match(/^### \[>\]/gm) ?? [];
    if (actives.length !== 1) fail(`conductor plan must have exactly ONE active phase ([>]), found ${actives.length}`);
    const line = /^ATIVA AGORA:.*$/m.exec(plan)?.[0] ?? '';
    if (active && !line.includes(active.id)) fail(`conductor plan "ATIVA AGORA" does not name the active task ${active.id}`);
    // the plan is the executable VIEW of tasks.md: its generated region must be exactly what tasks.md implies (npm run plan:sync)
    if (tasks) {
      const drift = planDrift(plan, { tasksText: tasks, programText: text[`${FEATURE}/PROGRAM.md`] ?? '', specText: spec ?? '' });
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
  return { ok: problems.length === 0, problems, active: active?.id ?? null };
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
    CURRENT_PHASE: /^MARCO ATUAL:\s*(.+)$/m.exec(plan)?.[1] ?? null,
    ACTIVE_TASK: active ? `${active.id} — ${/^[^\n]*/.exec(active.body)[0].replace(/^T-[A-Z0-9]+-\d+[a-z]?\s*—\s*/, '')}` : null,
    NEXT_ACTION: field('Próximo passo'),
    OPEN_DEFECTS: [...openFindings.matchAll(/^- (OPEN-\d+)/gm)].map((m) => m[1]),
    HUMAN_GATES: [...new Set([...spec.matchAll(/^\| (HG-\d+) \|/gm)].map((m) => m[1]))],
    PROHIBITIONS: [rule(8), rule(9)].filter(Boolean),
    LAST_PROOF: heads.at(-1) ?? null,
    NEXT_TEST_COMMAND: field('Comando'),
  };
}

export function gitIo(root) {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return {
    // a directory is not a readable document: it reads as null (missing) instead of crashing the check
    read: (p) => (existsSync(join(root, p)) && statSync(join(root, p)).isFile() ? readFileSync(join(root, p), 'utf8') : null),
    tracked: (p) => git(['ls-files', '--error-unmatch', p]).status === 0,
    ignored: (p) => git(['check-ignore', '-q', p]).status === 0,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || process.cwd();
  const io = gitIo(root);
  const result = checkContext(io);
  if (process.argv.includes('--resume')) console.log(JSON.stringify(resumeSummary(io), null, 2));
  if (!result.ok) {
    console.error(`CONTEXT_CHECK=FAIL (${result.problems.length})`);
    for (const p of result.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`CONTEXT_CHECK=PASS · active task ${result.active} · ${CANONICAL.length} canonical files tracked`);
}
