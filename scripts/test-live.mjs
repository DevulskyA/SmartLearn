#!/usr/bin/env node
// Runs a REAL test suite and publishes what the runner itself reports (counts, exit code, raw log, the git head
// that was tested, the pid) to conductor/.view/test-live/<suite>.json, then refreshes the board.
// Nobody writes a status by hand: PASS/FAIL come from the exit code, RUNNING lives only while the runner
// process lives, and the board turns a result STALE when the head moved on.
//
// Usage: node scripts/test-live.mjs <unit|server|e2e> [extra runner args...]
//        node scripts/test-live.mjs status     (prints the effective state of every recorded suite)
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES, createParser, artifactDir, writeArtifact, readArtifacts, effectiveState } from './test-live-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = artifactDir(root);

function refreshBoard() {
  // fire-and-forget: the board is derived, a slow/failed refresh must never affect the run
  try { spawn(process.execPath, [join(root, 'scripts', 'agent-tasklist.mjs')], { cwd: root, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref(); } catch { /* ignore */ }
}

const [, , suiteName, ...extra] = process.argv;

if (suiteName === 'status') {
  const head = git(['rev-parse', 'HEAD']);
  for (const a of readArtifacts(dir)) {
    const eff = effectiveState(a, { currentHead: head });
    console.log(`${a.suite.padEnd(7)} ${eff.state.padEnd(8)} ${a.counts.done}/${a.counts.total ?? '?'} ok=${a.counts.passed} fail=${a.counts.failed} skip=${a.counts.skipped} exit=${a.exitCode ?? '-'} head=${a.headTested.slice(0, 7)}${eff.note ? ` (${eff.note})` : ''}`);
  }
  process.exit(0);
}

const suite = SUITES[suiteName];
if (!suite) {
  console.error(`uso: node scripts/test-live.mjs <${Object.keys(SUITES).join('|')}|status> [args do runner]`);
  process.exit(2);
}

const cwd = join(root, suite.cwd);
const args = [...suite.args, ...extra];
const logPath = join(dir, `${suiteName}.log`);
const artifact = {
  schema: 1, suite: suiteName, cmd: `node ${args.join(' ')}${suite.cwd !== '.' ? `  (em ${suite.cwd}/)` : ''}`,
  headTested: git(['rev-parse', 'HEAD']), runnerPid: process.pid, pid: null, state: 'RUNNING',
  startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), durationMs: null, exitCode: null,
  counts: { total: null, done: 0, passed: 0, failed: 0, skipped: 0 }, lastTest: null, log: logPath,
};
const save = () => { artifact.updatedAt = new Date().toISOString(); writeArtifact(dir, artifact); };

writeArtifact(dir, artifact); // creates the dir; log stream below needs it
const log = createWriteStream(logPath);
const parser = createParser(suite.parser);
const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
artifact.pid = child.pid;
save();
refreshBoard();

const onData = (buf) => {
  log.write(buf);
  process.stdout.write(buf);
  parser.feed(buf.toString('utf8'));
  const snap = parser.snapshot();
  artifact.counts = snap.counts;
  artifact.lastTest = snap.lastTest;
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

// heartbeat: rewrites the artifact every second, so "updatedAt" proves the runner is still there
const beat = setInterval(save, 1000);
let lastRefresh = Date.now();
const refreshTimer = setInterval(() => { if (Date.now() - lastRefresh >= 4000) { lastRefresh = Date.now(); refreshBoard(); } }, 1000);

function killTree() {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
}

let finished = false;
function finish(state, exitCode) {
  if (finished) return;
  finished = true;
  clearInterval(beat); clearInterval(refreshTimer);
  const fin = parser.finish();
  artifact.counts = fin.counts;
  artifact.lastTest = fin.lastTest;
  artifact.state = state;
  artifact.exitCode = exitCode;
  artifact.durationMs = Date.now() - Date.parse(artifact.startedAt);
  save();
  log.end(() => {
    refreshBoard();
    setTimeout(() => process.exit(exitCode ?? 1), 300); // let the last board refresh start
  });
}

child.on('error', (err) => { console.error(`[test-live] falha ao iniciar: ${err.message}`); finish('FAIL', -1); });
child.on('close', (code) => finish(code === 0 ? 'PASS' : 'FAIL', code));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => { killTree(); finish('ABORTED', 130); });
}
