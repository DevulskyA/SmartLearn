// Pure pieces of the "TESTES AO VIVO" board section: what each suite runs, how its raw output becomes counts,
// how a stored artifact is judged against the CURRENT head and process, and how the section is rendered.
// The truth comes from the real runner's output and exit code (written by scripts/test-live.mjs) — never from
// text an agent typed. No I/O here except the small read/write helpers at the bottom.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from './tasklist.mjs';

/** Suites the wrapper knows. `args` are passed to node WITHOUT a shell (no quoting surprises on Windows). */
export const SUITES = {
  unit: { cwd: '.', args: ['--test', '--test-reporter=tap', 'test/*.test.js'], parser: 'tap' },
  server: { cwd: 'server', args: ['--test', '--test-reporter=tap'], parser: 'tap' }, // = server's `npm test` (`node --test`, default discovery — a narrower glob silently skipped one test)
  e2e: { cwd: '.', args: ['node_modules/@playwright/test/cli.js', 'test', '--reporter=list'], parser: 'playwright' },
};

const emptyCounts = () => ({ total: null, done: 0, passed: 0, failed: 0, skipped: 0 });

/**
 * Incremental parser: feed() raw stdout/stderr chunks, snapshot() the counts so far, finish() prefers the
 * runner's own end-of-run summary (authoritative) over the live tally.
 */
export function createParser(kind) {
  let rest = '';
  const live = emptyCounts();
  let summary = null;
  let lastTest = null;
  const frames = []; // tap: open "# Subtest:" frames, to tell a leaf test from a suite

  function tapLine(line) {
    const sub = line.match(/^(\s*)# Subtest: (.*)$/);
    if (sub) {
      const indent = sub[1].length;
      const parent = [...frames].reverse().find((f) => f.indent < indent);
      if (parent) parent.suite = true;
      frames.push({ indent, suite: false });
      return;
    }
    const sum = line.match(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/);
    if (sum) { summary ??= {}; summary[sum[1]] = Number(sum[2]); return; }
    const res = line.match(/^(\s*)(not ok|ok) \d+ - (.*)$/);
    if (!res) return;
    const indent = res[1].length;
    while (frames.length && frames[frames.length - 1].indent > indent) frames.pop();
    const frame = frames[frames.length - 1]?.indent === indent ? frames.pop() : { suite: false };
    if (frame.suite) return; // suites are containers, the summary does not count them as tests
    const name = res[3];
    live.done += 1;
    if (/ # (SKIP|TODO)\b/i.test(name)) live.skipped += 1;
    else if (res[2] === 'ok') live.passed += 1;
    else live.failed += 1;
    lastTest = name.replace(/ # (SKIP|TODO).*$/i, '');
  }

  function playwrightLine(line) {
    const run = line.match(/^Running (\d+) tests? using/);
    if (run) { live.total = Number(run[1]); return; }
    const res = line.match(/^\s*(✓|✔|ok|✘|✗|×|x|-)\s+(\d+)\s+(.*?)(?:\s+\([\d.]+m?s\))?$/);
    if (res) {
      live.done += 1;
      if (res[1] === '-') live.skipped += 1;
      else if (['✓', '✔', 'ok'].includes(res[1])) live.passed += 1;
      else live.failed += 1;
      lastTest = res[3];
      return;
    }
    const end = line.match(/^\s+(\d+) (passed|failed|skipped|flaky|did not run)\b/);
    if (end) { summary ??= {}; summary[end[2]] = Number(end[1]); }
  }

  const handle = kind === 'tap' ? tapLine : playwrightLine;
  return {
    feed(chunk) {
      rest += chunk;
      const lines = rest.split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) handle(l);
    },
    snapshot() { return { counts: { ...live }, lastTest }; },
    finish() {
      if (rest) { handle(rest); rest = ''; }
      const c = { ...live };
      if (summary && kind === 'tap' && summary.tests != null) {
        Object.assign(c, { total: summary.tests, done: summary.tests, passed: summary.pass ?? 0, failed: (summary.fail ?? 0) + (summary.cancelled ?? 0), skipped: (summary.skipped ?? 0) + (summary.todo ?? 0) });
      } else if (summary && kind === 'playwright') {
        const passed = (summary.passed ?? 0) + (summary.flaky ?? 0);
        const failed = summary.failed ?? 0;
        const skipped = (summary.skipped ?? 0) + (summary['did not run'] ?? 0);
        Object.assign(c, { passed, failed, skipped, done: passed + failed + skipped, total: c.total ?? passed + failed + skipped });
      } else if (c.total == null) c.total = c.done;
      return { counts: c, lastTest };
    },
  };
}

/** True while the process exists (signal 0 only probes). EPERM = exists but not ours = alive. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const HEARTBEAT_STALE_MS = 15000;

/**
 * What the board must SHOW for one stored artifact, given the head and the processes as they are NOW.
 *   RUNNING  only while the runner process is alive
 *   ABORTED  the runner is gone without a terminal state (killed), or it wrote ABORTED itself
 *   STALE    a finished result whose tested head is not the current head — it proves nothing about this code
 *   PASS/FAIL  finished, tested head == current head
 */
export function effectiveState(artifact, { currentHead, alive = pidAlive, now = Date.now(), docsOnlySince = null } = {}) {
  const stored = artifact.state;
  const sameHead = !!currentHead && artifact.headTested === currentHead;
  // Commits made after the run that touch ONLY conductor/ (the plan, tracks, notes that record the result) cannot
  // change what was tested: the result still holds. Any other changed file makes it STALE.
  const docsOnly = !sameHead && !!currentHead && !!docsOnlySince && docsOnlySince(artifact.headTested, currentHead) === true;
  const headMatches = sameHead || docsOnly;
  if (stored === 'RUNNING') {
    if (!alive(artifact.runnerPid)) return { state: 'ABORTED', note: 'processo do runner não existe mais (sem estado final)', headMatches };
    const age = now - Date.parse(artifact.updatedAt);
    const note = [!headMatches ? 'HEAD mudou durante a execução' : '', age > HEARTBEAT_STALE_MS ? `sem sinal há ${Math.round(age / 1000)}s` : ''].filter(Boolean).join('; ');
    return { state: 'RUNNING', note, headMatches, docsOnly };
  }
  if (!headMatches) return { state: 'STALE', note: `último resultado ${stored}`, headMatches };
  return { state: stored, note: docsOnly ? 'commits posteriores só mudam conductor/ (docs)' : '', headMatches, docsOnly };
}

/** True when every changed path is under conductor/ (and there is at least one) — pure, the caller supplies the list. */
export function onlyConductorDocs(paths) {
  const list = (paths ?? []).map((x) => String(x).trim().replace(/\\/g, '/')).filter(Boolean);
  return list.length > 0 && list.every((f) => f.startsWith('conductor/'));
}

export function fmtDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

const short = (h) => (h ? h.slice(0, 7) : '?');
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '—');

/** The board section. Plain lines in the board's existing style (no cards); one small block per suite. */
export function renderTestsSection(artifacts, { currentHead, alive, now, docsOnlySince } = {}) {
  if (!artifacts.length) {
    return '<div class="goal"><strong>TESTES AO VIVO:</strong><p class="muted">nenhuma execução registrada (rode: node scripts/test-live.mjs unit|server|e2e)</p></div>';
  }
  const rows = artifacts.map((a) => {
    const eff = effectiveState(a, { currentHead, alive, now, docsOnlySince });
    const c = a.counts ?? emptyCounts();
    const total = c.total ?? '?';
    const head = eff.docsOnly ? `HEAD testado ${short(a.headTested)} (atual ${short(currentHead)}, só docs depois)` : eff.headMatches ? `HEAD ${short(a.headTested)} = atual` : `HEAD testado ${short(a.headTested)} ≠ atual ${short(currentHead)}`;
    const running = eff.state === 'RUNNING';
    const dur = running ? fmtDuration(Date.now() - Date.parse(a.startedAt)) : fmtDuration(a.durationMs ?? Date.parse(a.updatedAt) - Date.parse(a.startedAt));
    return `<div class="tl ${esc(eff.state.toLowerCase())}"${running ? ` data-hb="${esc(a.updatedAt)}"` : ''}>
<div><span class="st">${esc(eff.state)}</span> <strong>${esc(a.suite)}</strong> · ${c.done}/${total} feitos · ${c.passed} ok · ${c.failed} falhas · ${c.skipped} pulados · ${esc(dur)}</div>
<div class="muted">${esc(head)}${eff.note ? ` · ${esc(eff.note)}` : ''} · exit ${a.exitCode ?? '—'} · pid ${a.runnerPid ?? '—'} ${running ? '(vivo)' : '(fim)'} · atualizado ${esc(clock(a.updatedAt))}</div>
<div class="muted">${a.lastTest ? `último: ${esc(String(a.lastTest).slice(0, 110))} · ` : ''}cmd: ${esc(a.cmd)} · log: ${esc(a.log ?? '—')}</div>
</div>`;
  });
  return `<div class="goal"><strong>TESTES AO VIVO:</strong>${rows.join('')}</div>`;
}

export const HEARTBEAT_SCRIPT = `<script>document.querySelectorAll('[data-hb]').forEach(function(e){var a=Date.now()-Date.parse(e.dataset.hb);if(a>${HEARTBEAT_STALE_MS}){e.querySelector('.st').textContent='SEM SINAL (possível ABORTED)';e.classList.add('aborted')}})</script>`;

// ---- artifact files (atomic: tmp + rename, so a reader never sees half a JSON) ----
export const artifactDir = (root) => join(root, 'conductor', '.view', 'test-live');

export function writeArtifact(dir, artifact) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${artifact.suite}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(artifact, null, 2));
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return file; } catch (e) {
      if (i >= 5) { writeFileSync(file, JSON.stringify(artifact, null, 2)); return file; } // Windows: reader briefly holds the file
    }
  }
}

export function readArtifacts(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try { out.push(JSON.parse(readFileSync(join(dir, name), 'utf8'))); } catch { /* being replaced; next refresh picks it up */ }
  }
  return out;
}
