#!/usr/bin/env node
// PLAN SYNC. conductor/tracks/hardening-roadmap-v1/plan.md is a PURE PROJECTION of the normalized execution model (scripts/context-core.mjs
// buildModel), which is derived from tasks.md (+ PROGRAM.md for the order, spec.md for gate titles). Nothing is hand-written: deleting
// plan.md and running `npm run plan:sync` recreates it byte-identical, and `context:check` fails on any drift.
// PROGRESSIVE ELABORATION: AGORA (the active task, full subtask tree) · PRÓXIMO (execution-ready tasks with their subtasks) · ROADMAP
// (every task, one line each, nothing disappears) · BLOQUEADAS · DECISÕES HUMANAS PENDENTES · VALIDAÇÃO.
//   node scripts/plan-sync.mjs           rewrites (or creates) plan.md when stale
//   node scripts/plan-sync.mjs --check   exits 1 when plan.md differs from what tasks.md implies
//   node scripts/plan-sync.mjs --report  prints the named plan/context properties (PASS/FAIL)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { headValidationFor } from './test-live-core.mjs';
import { FILES, buildModel, orderProblems, norm } from './context-core.mjs';
export { cut, firstSentence, programSprints, orderProblems, phaseState } from './context-core.mjs';

export const BEGIN = '<!-- PLAN:BEGIN (gerado de tasks.md por node scripts/plan-sync.mjs; não edite à mão) -->';
export const END = '<!-- PLAN:END -->';
const REGION = /<!-- PLAN:BEGIN[^\n]*-->[\s\S]*?<!-- PLAN:END -->/;
export const NO_VALIDATION_LINE = 'VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA (nenhuma validação registrada para este HEAD)';

const LEGEND = 'Legenda das tarefas: [x] feita · [>] ativa · [ ] pendente · [!] bloqueada (aguarda dependência ou decisão humana, dita na linha; só segue sozinha se a causa for tarefa comum) · [H] decisão humana · [=] dividida. Subtarefas: [x] feita · [>] atual (← EM EXECUÇÃO) · [ ] pendente (subtarefas = itens de checklist dentro de um bloco de tarefa; as filhas de uma tarefa dividida contam como tarefas). Fase: [✓] concluída · [>] contém a ativa · [H] só decisões humanas restantes · [!] nada executável. Elaboração progressiva: AGORA = a tarefa ativa com a árvore completa; PRÓXIMO = as tarefas prontas (READY) com suas subtarefas; ROADMAP = todas as tarefas, uma linha cada (nenhuma some, as distantes não são expandidas); a linha completa de cada tarefa existe uma única vez, em ROADMAP. Subtarefas só existem para a ativa e as READY; o progresso global é só de tarefas.';

const subLines = (subtasks, base, mark = true) => subtasks.map((r) => `${' '.repeat(base + r.depth * 2)}- [${r.mark}] ${r.text}${mark && r.mark === '>' ? '  ← EM EXECUÇÃO' : ''}`);

/** The generated region (markers included) for a model. Pure. */
export function renderRegion(model, validationLine = NO_VALIDATION_LINE) {
  const { active, ready, blocked, decisions, phases, progress } = model;
  const out = [BEGIN, ''];
  out.push(`ATIVA AGORA: ${active ? `${active.id} (${active.group})` : 'nenhuma'}`
    + ` · PRÓXIMA: ${model.next ?? 'nenhuma elegível'} · TAREFAS: ${progress.tasksDone}/${progress.tasksTotal}`
    + ` · SUBTAREFAS DA ATIVA: ${progress.active ? `${progress.active.id} ${progress.active.done}/${progress.active.total}` : '—'}`
    + ` · HORIZONTE PREPARADO: ${progress.horizon.prepared}/${progress.horizon.total}`
    + ` · BLOQUEADAS: ${blocked.length} · DECISÕES HUMANAS: ${decisions.length}`, '');
  out.push(LEGEND, '');
  out.push('## AGORA', '');
  if (active) {
    out.push(`- ${active.id} · ${active.title} · ${active.group} · subtarefas ${active.counts.done}/${active.counts.total}`);
    for (const f of active.facts) out.push(`  ${f.label}: ${f.text}`);
    out.push(...subLines(active.subtasks, 2));
  } else out.push('- (nenhuma tarefa ativa: tasks.md deve marcar exatamente uma `[>]`)');
  out.push('', '## PRÓXIMO', '');
  if (ready.length === 0) out.push('- (nenhuma tarefa pronta pela ordem de PROGRAM.md)', '');
  for (const r of ready) {
    out.push(`### ${r.id} — ${r.label} — ${r.title}`, `  Por quê: ${r.why}`);
    if (r.ready) out.push(`  Subtarefas ${r.counts.done}/${r.counts.total}:`, ...subLines(r.subtasks, 2, false));
    out.push('');
  }
  out.push('## ROADMAP', '');
  for (const p of phases) {
    out.push(`### [${p.state}] ${p.id} · ${p.title} — tarefas ${p.done}/${p.total}`, '');
    for (const r of p.rows) out.push(`${r.indent}- [${r.mark}] **${r.id}** — ${r.title}${r.note}`); // one line per task: subtasks are never expanded here
    out.push('');
  }
  out.push('## BLOQUEADAS', '');
  if (blocked.length === 0) out.push('- (nenhuma)');
  for (const b of blocked) out.push(`- ${b.id} BLOQUEADA → ${b.chain}`);
  out.push('', '## DECISÕES HUMANAS PENDENTES', '');
  if (decisions.length === 0) out.push('- (nenhuma)');
  for (const d of decisions) out.push(`- ${d.id} · ${d.title} · ${d.text}${d.after.length ? ` (após ${d.after.join(', ')})` : ''}`);
  out.push('', '## VALIDAÇÃO', '');
  // the current-HEAD sha is NOT written to the tracked plan (it would change on every commit); 'testado <sha>' of recorded results stays
  out.push(validationLine.replace(/;\s*HEAD atual [0-9a-f]{7,40}/, '').replace(/ em [0-9a-f]{7,40}$/, ''), '');
  out.push(END);
  return out.join('\n');
}

/** Region from the three authority texts (tests and tools that only need the generated region). */
export function renderPlanRegion({ tasksText, programText = '', specText = '', validationLine = NO_VALIDATION_LINE }) {
  return renderRegion(buildModel({ tasksText, programText, specText }), validationLine);
}

/** The WHOLE plan.md: nothing in it is hand-written, so it can be recreated from tasks.md alone. */
export function renderPlanFile(inputs) {
  const model = buildModel(inputs);
  const head = [
    '# SMARTLEARN — DESENVOLVIMENTO', '',
    '> PROJEÇÃO GERADA: este arquivo é a visão executável legível de `.specs/features/hardening-roadmap-v1/tasks.md` (+ `PROGRAM.md` para a ordem, `spec.md` para os títulos dos gates). Apagar e rodar `npm run plan:sync` recria idêntico; `npm run context:check` falha se divergir. Não edite à mão: mude `tasks.md` e sincronize.',
    '> Autoridades (nada disto é copiado para cá): `PROGRAM.md` = ordem macro · `tasks.md` = ids, dependências, estado técnico e subtarefas · `spec.md` = requisitos/invariantes · `validation.md` = provas · `uat-visual.md` = UAT · Git/testes = realidade.',
    '> NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE. Tarefa em DECISÕES HUMANAS PENDENTES depende de decisão do usuário (HG-xx em `spec.md` §8): parar e perguntar.', '',
    '```', `Track:    hardening-roadmap-v1                 Status: ${model.status}`, `MARCO ATUAL: ${model.marco}`, 'Iniciado: 2026-10-04', '```', '',
  ].join('\n');
  return `${head}\n${renderRegion(model, inputs.validationLine ?? NO_VALIDATION_LINE)}\n`;
}

/** Replaces the generated region of plan.md text; returns null when the markers are missing. */
export function applyRegion(planText, region) {
  const lf = planText.replace(/\r\n/g, '\n');
  return REGION.test(lf) ? lf.replace(REGION, () => region) : null;
}

const VALIDATION = /^VALIDAÇÃO DO HEAD ATUAL:.*$/m;
const provenClass = (line) => /^VALIDAÇÃO DO HEAD ATUAL: ✓/.test(line ?? '');

/**
 * True when plan.md already equals what tasks.md implies (the whole file). The validation line is derived from recorded test results,
 * so it is compared by CLASS (proven for this head or not): an old "✓ PASS" in the plan is drift as soon as the head is no longer proven.
 */
export function planDrift(planText, inputs) {
  const lf = norm(planText ?? '');
  if (!REGION.test(lf)) return { drift: true, reason: 'plan.md has no PLAN:BEGIN/PLAN:END generated region' };
  const bad = orderProblems(inputs);
  if (bad.length) return { drift: true, reason: `execution order violates dependencies: ${bad.join('; ')}` };
  const want = renderPlanFile(inputs);
  const haveLine = VALIDATION.exec(lf)?.[0];
  const wantLine = VALIDATION.exec(want)?.[0];
  if (!haveLine || provenClass(haveLine) !== provenClass(wantLine)) return { drift: true, reason: 'plan validation line is stale: it does not match the recorded validation of the current head (run: npm run plan:sync)' };
  return lf.replace(VALIDATION, '') === want.replace(VALIDATION, '') ? { drift: false } : { drift: true, reason: 'plan.md differs from what tasks.md implies (run: npm run plan:sync)' };
}

export function readInputs(read) {
  return { tasksText: read(FILES.tasks) ?? '', programText: read(FILES.program) ?? '', specText: read(FILES.spec) ?? '' };
}

/** Rewrites (or creates) plan.md when stale (keeps CRLF if the file used it). Returns true when it wrote. */
export function syncPlanFile(root, { validationLine } = {}) {
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  const planPath = join(root, FILES.plan);
  const raw = existsSync(planPath) ? readFileSync(planPath, 'utf8') : null;
  const next = renderPlanFile({ ...readInputs(read), ...(validationLine ? { validationLine } : {}) });
  if (raw !== null && raw.replace(/\r\n/g, '\n') === next) return false;
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, raw?.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  if (process.argv.includes('--report')) {
    // the named properties live in context-check (it imports this module, so run it as a child instead of importing it back)
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'context-check.mjs')], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  } else if (process.argv.includes('--check')) {
    const r = planDrift(read(FILES.plan) ?? '', { ...readInputs(read), validationLine: headValidationFor(root).line });
    if (r.drift) { console.error(`PLAN_SYNC=FAIL ${r.reason}`); process.exit(1); }
    console.log('PLAN_SYNC=PASS');
  } else console.log(syncPlanFile(root, { validationLine: headValidationFor(root).line }) ? 'plan.md regenerated from tasks.md' : 'plan.md already in sync');
}
