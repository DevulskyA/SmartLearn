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
import { FILES, taskBlocks, programOrder, norm } from './context-core.mjs';

export const BEGIN = '<!-- PLAN:BEGIN (gerado de tasks.md por node scripts/plan-sync.mjs; não edite à mão) -->';
export const END = '<!-- PLAN:END -->';
const REGION = /<!-- PLAN:BEGIN[^\n]*-->[\s\S]*?<!-- PLAN:END -->/;

// HR-n identifies a phase of the macro plan; it does NOT define execution order (PROGRAM.md does).
const HR = { F0: 0, F1: 1, F6: 2, F2: 3, F4: 4, F3: 5, F8: 6, F5: 7, F7: 8, F9: 9, F10: 10 };
const hrId = (code) => `HR-${HR[code] ?? code}`;
const hrNum = (code) => HR[code] ?? 999;
const phaseOf = (id) => /^T-(F\d+)-/.exec(id)?.[1] ?? null;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function phaseTitles(tasksText) {
  const out = {};
  for (const m of norm(tasksText).matchAll(/^## (F\d+) — (.+)$/gm)) out[m[1]] = m[2].replace(/\s*—\s*(após|por último).*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  return out;
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

  const phases = new Map();
  for (const b of blocks) { const c = phaseOf(b.id) ?? 'F?'; if (!phases.has(c)) phases.set(c, []); phases.get(c).push(b); }
  const codes = [...phases.keys()].sort((a, b) => hrNum(a) - hrNum(b));
  const titles = phaseTitles(tasksText);
  const activePhase = active ? phaseOf(active.id) : null;

  const blocked = blocks.filter((b) => b.status === '!'
    || (b.status === ' ' && b.deps.some((d) => byId.get(d)?.status === 'H' || byId.get(d)?.status === '!')));
  const humans = blocks.filter((b) => b.status === 'H');

  const out = [BEGIN, ''];
  out.push(`ATIVA AGORA: ${active ? `${active.id} (${hrId(activePhase)})` : 'nenhuma'}`
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
  for (const code of codes) {
    const bs = phases.get(code);
    const children = (b) => bs.filter((c) => c.id !== b.id && c.id.startsWith(b.id) && /^[a-z]$/.test(c.id.slice(b.id.length)));
    const childIds = new Set(bs.flatMap((b) => (b.status === '=' ? children(b).map((c) => c.id) : [])));
    out.push(`### [${phaseState(bs, byId)}] ${hrId(code)} · ${code} — ${titles[code] ?? code}`, '');
    for (const b of bs) {
      if (childIds.has(b.id)) continue;
      const tag = b.status === '>' ? '  ← EM EXECUÇÃO' : b.status === 'H' ? '  — HUMAN GATE' : b.status === '!' ? '  — BLOQUEADA' : b.status === '=' ? '  — DIVIDIDA em subtarefas' : '';
      out.push(line(b, tag));
      if (b.status === '=') for (const c of children(b)) out.push(`  ${line(c, c.status === 'H' ? '  — HUMAN GATE' : c.status === '>' ? '  ← EM EXECUÇÃO' : '')}`);
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
