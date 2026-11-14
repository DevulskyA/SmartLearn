#!/usr/bin/env node
// One GLOBAL E2E run for one verifiable snapshot, meant to be started in the background (Claude Code: Bash run_in_background; the harness
// notifies on exit, so nobody polls a log). Governance §7/§9: the full suite is an integration gate for milestones, once per snapshot.
//   node scripts/e2e-global.mjs [--ref <git ref>] [--force] [-- <extra e2e.mjs arguments>]
// 1. snapshot = a detached git worktree of the commit (default HEAD) in the OS temp dir: other fronts' uncommitted work is neither tested nor touched
// 2. runs scripts/test-live.mjs e2e there (the governed runner: own ports and output dir, evidence artifact with the tested SHA)
// 3. copies the artifact and the full log back to conductor/.view/test-live/ and writes test-results/global/<sha7>/summary.json
// 4. prints ONE compact block (state, SHA, counts, duration, first failures, evidence path), removes the snapshot
// A second global run for the same SHA is refused (a finished one is evidence, a running one is still running) unless --force.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_LOCK = join(root, 'test-results', '.global-run.lock');
const GIT = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git'; // fixed path, as scripts/test-live.mjs does
const git = (args, cwd = root) => execFileSync(GIT, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Decides whether a global run for `sha` may start, from the recorded artifact (pure; `artifact` may be null). */
export function guardGlobalRun({ artifact, sha, force = false, isAlive = alive }) {
  if (force || !artifact || artifact.headTested !== sha) return { ok: true };
  if (artifact.state === 'RUNNING' && isAlive(artifact.runnerPid)) return { ok: false, reason: `a global run for ${sha.slice(0, 7)} is still running (pid ${artifact.runnerPid})` };
  if (artifact.state === 'PASS' || artifact.state === 'FAIL') return { ok: false, reason: `${sha.slice(0, 7)} already has a finished global result (${artifact.state}); change the code or use --force` };
  return { ok: true };
}

export function compactSummary({ artifact, sha, evidenceDir, failures = [] }) {
  const c = artifact.counts;
  // e2e.mjs exits 5 when every test passed but the duration is far from its baseline: not a test failure, an instrument signal to investigate
  const state = artifact.exitCode === 5 && c.failed === 0 ? 'PASS WITH PERF DEVIATION (exit 5)' : artifact.state;
  return [
    `GLOBAL E2E ${state} | SHA ${sha.slice(0, 12)} | ${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped of ${c.total ?? '?'} | ${Math.round((artifact.durationMs ?? 0) / 1000)} s`,
    ...(failures.length ? failures.slice(0, 8).map((f) => `  FAIL ${f}`) : []),
    `evidence: ${evidenceDir}`,
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf('--');
  const own = sep < 0 ? argv : argv.slice(0, sep);
  const extra = sep < 0 ? [] : argv.slice(sep + 1);
  const refAt = own.indexOf('--ref');
  const sha = git(['rev-parse', refAt >= 0 ? own[refAt + 1] : 'HEAD']);
  const evidenceLive = join(root, 'conductor', '.view', 'test-live');
  let previous = null;
  try { previous = JSON.parse(readFileSync(join(evidenceLive, 'e2e.json'), 'utf8')); } catch { /* none */ }
  const guard = guardGlobalRun({ artifact: extra.length ? null : previous, sha, force: own.includes('--force') });
  if (!guard.ok) { console.log(`GLOBAL E2E refused: ${guard.reason}`); process.exit(3); }

  const snap = join(tmpdir(), `sl-e2e-snap-${sha.slice(0, 7)}-${process.pid}`);
  git(['worktree', 'add', '--detach', snap, sha]);
  const cleanup = () => { try { git(['worktree', 'remove', '--force', snap]); } catch { rmSync(snap, { recursive: true, force: true }); } rmSync(GLOBAL_LOCK, { force: true }); };
  try {
    for (const dir of ['node_modules', join('server', 'node_modules')]) {
      if (existsSync(join(root, dir)) && !existsSync(join(snap, dir))) symlinkSync(join(root, dir), join(snap, dir), 'junction');
    }
    mkdirSync(dirname(GLOBAL_LOCK), { recursive: true });
    writeFileSync(GLOBAL_LOCK, String(process.pid)); // targeted runs print a one-line warning while this is alive (CPU is shared)
    const res = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['scripts/test-live.mjs', 'e2e', ...extra], { cwd: snap, env: { ...process.env, TEST_LIVE_PLANBAN: '0' }, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
      child.on('close', (code) => resolve(code));
      child.on('error', () => resolve(-1));
    });
    const snapLive = join(snap, 'conductor', '.view', 'test-live');
    const artifact = JSON.parse(readFileSync(join(snapLive, 'e2e.json'), 'utf8'));
    const evidenceDir = join(root, 'test-results', 'global', sha.slice(0, 7));
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(evidenceLive, { recursive: true });
    copyFileSync(join(snapLive, 'e2e.log'), join(evidenceDir, 'e2e.log'));
    const failures = readFileSync(join(evidenceDir, 'e2e.log'), 'utf8').split(/\r?\n/).filter((l) => /^\s+[✘✗×x]\s+\d+/.test(l)).map((l) => l.trim().slice(0, 160));
    if (!extra.length) { // only the unrestricted run is the GLOBAL evidence of this SHA; a short run (proof of the mechanism) is not
      copyFileSync(join(snapLive, 'e2e.log'), join(evidenceLive, 'e2e.log'));
      writeFileSync(join(evidenceLive, 'e2e.json'), JSON.stringify({ ...artifact, log: join(evidenceLive, 'e2e.log') }, null, 2));
    }
    writeFileSync(join(evidenceDir, 'summary.json'), JSON.stringify({ sha, state: artifact.state, counts: artifact.counts, durationMs: artifact.durationMs, scope: extra.length ? `PARTIAL: ${extra.join(' ')}` : 'GLOBAL', failures, exit: res }, null, 2));
    console.log(compactSummary({ artifact, sha, evidenceDir, failures }) + (extra.length ? `\nscope: PARTIAL (${extra.join(' ')}), not a global validation` : ''));
    process.exitCode = artifact.state === 'PASS' ? 0 : 1;
  } finally {
    cleanup();
  }
}
