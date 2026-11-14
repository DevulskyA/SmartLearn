#!/usr/bin/env node
// Process lifecycle for heavy test runs (see docs/engineering/process-lifecycle.md). Deterministic, no AI:
//   spawnSupervised  every run is ONE identifiable Windows Job Object (scripts/job-run.ps1, KILL_ON_JOB_CLOSE, command created suspended), so its
//                    whole tree dies when the run ends, is cancelled, times out, or when this process is killed. No job => the run does not start.
//   admit            memory / CPU / concurrency gate over the registry shared by every worktree; reduces workers or refuses.
//   CLI              list | stop <runId> | gc | admit [workers]     (identity = runId + PID + creation time; never by image name)
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, freemem, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY_DIR = join(tmpdir(), 'sl-runs');
const HELPER = join(dirname(fileURLToPath(import.meta.url)), 'job-run.ps1');
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const POWERSHELL = join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const TASKKILL = join(SYSTEM_ROOT, 'System32', 'taskkill.exe');
export const EXIT = { PROTECTION_FAILED: 97, START_FAILED: 98, SUPERVISOR_DIED: 99, TIMEOUT: 124, REFUSED: 4 };

/** Resource limits, calibrated from measured peaks (PeakJobMemoryUsed in <runId>.result.json): 2 workers peaked at 2281 MB (1 spec) and 3276 MB (summary suite). */
export const LIMITS = { reserveMB: Number(process.env.SL_RESERVE_MB) || 1024, baseMB: 800, perWorkerMB: 1300, maxActive: 2, reserveCores: 4, cpuHalve: 0.7, cpuRefuse: 0.92 };

// ---------- admission (pure) ----------
/** @returns {{ok: boolean, workers: number, notes: string[]}} the workers allowed now, or a refusal with the reason */
export function admit({ freeMB, cores, cpuBusy, active, requestedWorkers }, limits = LIMITS) {
  const notes = [];
  if (active >= limits.maxActive) return { ok: false, workers: 0, notes: [`${active} heavy run(s) already active (limit ${limits.maxActive} across all worktrees)`] };
  const budget = freeMB - limits.reserveMB;
  if (budget < limits.baseMB + limits.perWorkerMB) return { ok: false, workers: 0, notes: [`memory pressure: ${Math.round(freeMB)} MB free, ${limits.reserveMB} MB are kept for Windows, Claude Code and development`] };
  if (cpuBusy >= limits.cpuRefuse) return { ok: false, workers: 0, notes: [`CPU busy at ${Math.round(cpuBusy * 100)}%`] };
  let workers = requestedWorkers;
  const byMemory = Math.floor((budget - limits.baseMB) / limits.perWorkerMB);
  const byCores = Math.max(1, cores - limits.reserveCores);
  if (byMemory < workers) { workers = byMemory; notes.push(`workers ${requestedWorkers} -> ${workers} (memory: ${Math.round(freeMB)} MB free)`); }
  if (byCores < workers) { workers = byCores; notes.push(`workers -> ${workers} (${cores} cores, ${limits.reserveCores} kept free)`); }
  if (cpuBusy >= limits.cpuHalve && workers > 1) { workers = Math.max(1, Math.floor(workers / 2)); notes.push(`workers -> ${workers} (CPU busy at ${Math.round(cpuBusy * 100)}%)`); }
  return { ok: true, workers, notes };
}

function cpuBusyFraction(sampleMs = 300) {
  const sum = () => cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t }; }, { idle: 0, total: 0 });
  const a = sum();
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sampleMs);
  const b = sum();
  return b.total === a.total ? 0 : 1 - (b.idle - a.idle) / (b.total - a.total);
}

export function admitNow(requestedWorkers, limits = LIMITS) {
  return admit({ freeMB: freemem() / 1048576, cores: cpus().length, cpuBusy: cpuBusyFraction(), active: listRuns().filter((r) => r.state === 'ACTIVE').length, requestedWorkers }, limits);
}

// ---------- identity ----------
/** pid -> {start (FILETIME), parent} for the pids that exist now; one PowerShell call. */
export function processInfo(pids) {
  const wanted = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  if (!wanted.length) return new Map();
  const filter = wanted.map((p) => `ProcessId=${p}`).join(' OR ');
  const script = `Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; start = $_.CreationDate.ToFileTimeUtc() } } | ConvertTo-Json -Compress`;
  const out = execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim();
  if (!out) return new Map();
  const parsed = JSON.parse(out);
  return new Map((Array.isArray(parsed) ? parsed : [parsed]).map((p) => [p.pid, p]));
}

const SAME_INSTANT = 10_000_000; // 1 s in FILETIME ticks: CIM and .NET round the creation time differently
const sameProcess = (info, start) => !!info && Math.abs(info.start - start) < SAME_INSTANT;

/** Registered runs with their state: ACTIVE (helper alive and the same process), or STALE (record left behind by a helper that is gone). */
export function listRuns(dir = REGISTRY_DIR, info = processInfo) {
  if (!existsSync(dir)) return [];
  const records = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.result.json') && !f.endsWith('.spec.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8').replace(/^﻿/, ''))); // Windows PowerShell writes a BOM
  const live = info(records.flatMap((r) => [r.helperPid, r.childPid]));
  return records.map((r) => ({ ...r, state: sameProcess(live.get(r.helperPid), r.helperStart) ? 'ACTIVE' : 'STALE', childAlive: sameProcess(live.get(r.childPid), r.childStart) }));
}

/** Stops ONE run by closing its job: only a record whose helper is verified (PID + creation time) is touched. Returns what was done. */
export function stopRun(runId, dir = REGISTRY_DIR) {
  const run = listRuns(dir).find((r) => r.runId === runId);
  if (!run) return { stopped: false, why: 'unknown run id; nothing touched' };
  if (run.state !== 'ACTIVE') return { stopped: false, why: 'helper is not alive or its identity does not match; nothing touched', run };
  execFileSync(TASKKILL, ['/PID', String(run.helperPid), '/T', '/F'], { stdio: 'ignore' });
  return { stopped: true, run };
}

/** Removes records of dead helpers. A child that is still alive and verified as the recorded one is reported (the job should have ended it). */
export function gc(dir = REGISTRY_DIR) {
  const report = { removed: [], residue: [] };
  for (const run of listRuns(dir)) {
    if (run.state === 'ACTIVE') continue;
    if (run.childAlive) report.residue.push({ runId: run.runId, childPid: run.childPid });
    else { rmSync(join(dir, `${run.runId}.json`), { force: true }); report.removed.push(run.runId); }
  }
  return report;
}

// ---------- spawn ----------
const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg);
export const commandLine = (exe, args) => [exe, ...args].map(quote).join(' ');

/**
 * Starts `exe args` as one supervised run. On Windows the command lives in a kill-on-close Job Object owned by a helper that also dies with this
 * process; if the job cannot be set up the helper exits 97/98 and the command never ran. Elsewhere the command runs directly (no equivalent used).
 * @returns {{child: import('node:child_process').ChildProcess, runId: string, supervised: boolean}}
 */
/** Per-run ceiling: 1.5x what the calibrated model expects for this many workers (a runaway run is cut, a normal one has headroom). */
export const jobMemoryMB = (workers) => Math.round(1.5 * (LIMITS.baseMB + workers * LIMITS.perWorkerMB));

export function spawnSupervised({ exe, args = [], cwd = process.cwd(), env = process.env, stdio = 'inherit', label = 'run', timeoutSec = 0, memMB = 0, workers = 1, activeLimit = 0, dir = REGISTRY_DIR }) {
  const runId = `${Date.now().toString(36)}-${process.pid}-${randomBytes(3).toString('hex')}`;
  if (process.platform !== 'win32') return { child: spawn(exe, args, { cwd, env, stdio }), runId, supervised: false };
  mkdirSync(dir, { recursive: true });
  const specPath = join(dir, `${runId}.spec.json`);
  const spec = { runId, label, exe, commandLine: commandLine(exe, args), cwd, parentPid: process.pid, timeoutSec, memMB: memMB || jobMemoryMB(workers), workers, activeLimit, registryDir: dir };
  writeFileSync(specPath, JSON.stringify(spec));
  const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER, '-SpecPath', specPath], { cwd, env, stdio, windowsHide: true });
  child.on('exit', () => rmSync(specPath, { force: true }));
  return { child, runId, supervised: true };
}

// ---------- CLI ----------
function main(argv) {
  const [command, arg] = argv;
  if (command === 'list') {
    for (const r of listRuns()) console.log(`${r.runId} ${r.state} ${r.label} helper=${r.helperPid} child=${r.childPid}${r.childAlive ? ' (child alive)' : ''} since ${r.startedAt}`);
  } else if (command === 'stop') {
    console.log(JSON.stringify(stopRun(arg), null, 0));
  } else if (command === 'gc') {
    console.log(JSON.stringify(gc()));
  } else if (command === 'admit') {
    console.log(JSON.stringify(admitNow(Number(arg) || 3)));
  } else {
    console.log('usage: node scripts/process-supervisor.mjs list | stop <runId> | gc | admit [workers]');
    process.exitCode = 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
