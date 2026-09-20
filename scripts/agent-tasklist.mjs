#!/usr/bin/env node
// Consolidated two-lane tasklist for the two parallel agents (CLI and GUI).
//   GUI lane = the macro plan.md of the active track (structured tasks, full detail);
//   CLI lane = what the CLI agent publishes in its own coordination file (CLI.md).
// Read-only over both sources; the ONLY file it writes is the HTML board (owned by the GUI agent).
// One ACTIVE task per agent is valid (and expected), not "one global active".
//
// Usage: node scripts/agent-tasklist.mjs [--plan plan.md] [--coord <dir>] [--out tasklist.html]
import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parsePlan, renderChecklistHtml } from './tasklist.mjs';

/** KEY=value / KEY: value lines; indented (or non-key) lines continue the previous key. */
export function parseCoordFile(text) {
  const out = {};
  let last = null;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = raw.match(/^([A-Z][A-Z0-9_]*)(?:\s*\([^)]*\))?\s*[=:]\s*(.*)$/);
    if (m && !raw.startsWith(' ')) { last = m[1]; out[last] = m[2].trim(); continue; }
    if (last && raw.trim()) out[last] = `${out[last]} ${raw.trim()}`.trim();
  }
  return out;
}

const STATUS_TO_STATE = { RUNNING: '>', TESTING: '>', COMMITTING: '>', DONE: '✓', BLOCKED: '!' };

/** The CLI agent publishes a status file, not a plan: derive its current card and its declared NEXT. */
export function cliLane(coord) {
  const status = (coord.STATUS ?? '').split(/\s/)[0];
  // "STATUS=DONE" means "this slice is done"; a lane whose ACTIVE_TASK says PAUSED is stopped, not finished.
  const paused = /^PAUSED(?![A-Za-z])/i.test(coord.ACTIVE_TASK ?? '');
  const state = paused ? '-' : (STATUS_TO_STATE[status] ?? ' ');
  const fields = {};
  if (coord.GOAL) fields.SPRINT_GOAL = coord.GOAL;
  if (coord.SCOPE) fields.SCOPE = coord.SCOPE;
  if (coord.FILES_IN_FLIGHT) fields.FILES_IN_FLIGHT = coord.FILES_IN_FLIGHT;
  if (coord.CONTRACTS_CHANGED) fields.DETAILS = coord.CONTRACTS_CHANGED;
  if (coord.LAST_COMMIT) fields.COMMIT = coord.LAST_COMMIT;
  if (coord.STATUS) fields.EVIDENCE = coord.STATUS;
  const tasks = [{ state, id: 'CLI', title: coord.ACTIVE_TASK ?? '(sem tarefa publicada)', fields, free: '', detail: '', owner: 'CLI' }];
  if (coord.NEXT) tasks.push({ state: ' ', id: 'CLI-NEXT', title: 'Próximo declarado pelo CLI', fields: { DETAILS: coord.NEXT }, free: '', detail: '', owner: 'CLI' });
  return { title: 'AGENT_CLI', branch: coord.BRANCH ?? '', head: coord.HEAD ?? '', updated: coord.UPDATED_AT ?? '', status, tasks };
}




/** GUI plan tasks as the checklist; the CLI agent is one plain line under it. */
export function renderAgentBoard({ gui, cli }) {
  const c = cli.tasks[0];
  const cliState = c.state === '>' ? 'executando' : c.state === '-' ? 'pausado' : c.state === '!' ? 'bloqueado' : c.state === '✓' ? 'parado (fatia concluída)' : 'sem tarefa';
  const cliLine = `CLI (outro agente): ${cliState} — ${String(c.title).slice(0, 110)}`;
  return renderChecklistHtml({ tasks: gui.tasks, extraLines: [cliLine] });
}

function gitOut(cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); } catch { return ''; }
}

/**
 * The Conductor's "ACTIVE TRACK" paragraph, derived from plan.md so it can never disagree with it. Written
 * between the ACTIVE-TRACK markers of conductor/tracks.md by the same command that refreshes the boards.
 */
export function activeTrackBlock(plan, { planPath, branch = '', head = '', date = '' } = {}) {
  const ids = (state) => plan.tasks.filter((t) => t.state === state).map((t) => t.id);
  const list = (label, arr) => (arr.length ? ` · ${label}: ${arr.join(', ')}` : '');
  const done = ids('✓');
  const line = `**\`${planPath}\`** — ${plan.title} · Status: ${plan.status}`
    + list('ATIVA (GUI)', ids('>')) + list('próximas', ids(' ')) + list('adiadas', ids('-')) + list('bloqueadas', ids('!'))
    + ` · concluídas (${done.length}): ${done.join(', ') || '—'}`
    + (branch ? ` · branch \`${branch}\`` : '') + (head ? `@${head}` : '') + (date ? ` · sincronizado ${date}` : '');
  return `<!-- ACTIVE-TRACK:BEGIN (gerado por node scripts/agent-tasklist.mjs; não edite à mão) -->\n${line}\n<!-- ACTIVE-TRACK:END -->`;
}

/** Replaces the marked block in tracks.md text; returns null when the markers are missing. */
export function syncActiveTrack(tracksMd, block) {
  const re = /<!-- ACTIVE-TRACK:BEGIN[\s\S]*?<!-- ACTIVE-TRACK:END -->/;
  return re.test(tracksMd) ? tracksMd.replace(re, () => block) : null;
}

/** conductor/.view/tasklist.html for every worktree that has a conductor/ folder (git worktree list). */
export function worktreeBoards(root) {
  try {
    const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
    return listing.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim())
      .filter((wt) => existsSync(join(wt, 'conductor'))).map((wt) => join(wt, 'conductor', '.view', 'tasklist.html'));
  } catch { return []; }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

/** Regenerates every board copy + the Conductor's ACTIVE TRACK block from plan.md / GUI.md / CLI.md. */
function regenerate(root, coordDir) {
  const tracksMd = readFileSync(join(root, 'conductor', 'tracks.md'), 'utf8');
  const rel = (tracksMd.match(/conductor\/tracks\/([\w-]+)\/plan\.md/) ?? [])[1];
  const planPath = arg('--plan', rel ? join(root, 'conductor', 'tracks', rel, 'plan.md') : null);
  const plan = parsePlan(readFileSync(planPath, 'utf8'));
  if (plan.skipped.length) console.error(`[agent-tasklist] ERRO: tarefa(s) fora do padrão de id NÃO aparecem no painel: ${plan.skipped.join(', ')} (use LETRAS-NÚMERO, ex.: ACCESS-1)`);
  const guiCoord = existsSync(join(coordDir, 'GUI.md')) ? parseCoordFile(readFileSync(join(coordDir, 'GUI.md'), 'utf8')) : {};
  const cliCoord = existsSync(join(coordDir, 'CLI.md')) ? parseCoordFile(readFileSync(join(coordDir, 'CLI.md'), 'utf8')) : {};
  const gui = { title: 'AGENT_GUI', branch: guiCoord.BRANCH ?? '', head: guiCoord.HEAD ?? '', updated: guiCoord.UPDATED_AT ?? '', tasks: plan.tasks.map((t) => ({ ...t, owner: t.owner ?? 'GUI' })) };
  // ONE command refreshes EVERY copy of the board the user might have open: the shared coordination copy and
  // conductor/.view/tasklist.html of every worktree of this repo (a stale copy that says "all done" while work
  // continues leaves the user lost). --out writes only that single file.
  const explicit = arg('--out', null);
  const outs = explicit ? [explicit] : [join(coordDir, 'tasklist.html'), ...worktreeBoards(root)];
  const html = renderAgentBoard({ gui, cli: cliLane(cliCoord) });
  for (const out of outs) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, html); }
  const out = outs.join(' + ');
  // Conductor: keep tracks.md's ACTIVE TRACK in step with plan.md (same command, so it cannot go stale)
  const tracksPath = join(root, 'conductor', 'tracks.md');
  const tracksLf = tracksMd.replace(/\r\n/g, '\n');
  const synced = syncActiveTrack(tracksLf, activeTrackBlock(plan, {
    planPath: `conductor/tracks/${rel}/plan.md`,
    branch: gitOut(root, ['branch', '--show-current']),
    head: gitOut(root, ['rev-parse', '--short', 'HEAD']),
    date: new Date().toISOString().slice(0, 10),
  }));
  if (synced === null) console.warn('[agent-tasklist] AVISO: conductor/tracks.md sem marcadores ACTIVE-TRACK; não sincronizado.');
  else if (synced !== tracksLf) writeFileSync(tracksPath, tracksMd.includes('\r\n') ? synced.replace(/\n/g, '\r\n') : synced);
  console.log(`[agent-tasklist] ${out} — GUI ${gui.tasks.length} tarefas (${gui.tasks.filter((t) => t.state === '>').map((t) => t.id).join(',') || 'nenhuma ativa'}), CLI ${cliLane(cliCoord).tasks[0].title.slice(0, 60)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const coordDir = arg('--coord', join(homedir(), 'SmartLearn-AgentCoord'));
  regenerate(root, coordDir);
  // --watch: any change to the plan, GUI.md or CLI.md refreshes the boards within a second, so nobody has to
  // remember to run this by hand (a stale checklist is a bug).
  if (process.argv.includes('--watch')) {
    const tracksMd = readFileSync(join(root, 'conductor', 'tracks.md'), 'utf8');
    const rel = (tracksMd.match(/conductor\/tracks\/([\w-]+)\/plan\.md/) ?? [])[1];
    const targets = [join(root, 'conductor', 'tracks', rel ?? '', 'plan.md'), join(coordDir, 'GUI.md'), join(coordDir, 'CLI.md')].filter(existsSync);
    let timer = null;
    for (const file of targets) {
      watch(file, () => {
        clearTimeout(timer);
        timer = setTimeout(() => { try { regenerate(root, coordDir); } catch (err) { console.error('[agent-tasklist] falha ao regenerar:', err.message); } }, 400);
      });
    }
    console.log('[agent-tasklist] observando ' + targets.length + ' arquivo(s); Ctrl+C para parar.');
  }
}
