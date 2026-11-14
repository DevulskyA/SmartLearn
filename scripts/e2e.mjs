#!/usr/bin/env node
// Runs Playwright with ports that are free for THIS run (T-F6-02) and an output directory of its own, so an orphan from an
// earlier run - or a second run at the same time - cannot take the suite down.
//   node scripts/e2e.mjs [--suite materials] [playwright arguments...]
import net from 'node:net';
import { openSync, writeSync, closeSync, readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { SUITE_WORKERS } from '../e2e/support/suites.js';
import { admitNow, spawnSupervised, EXIT } from './process-supervisor.mjs';

const STABLE_DIR = fileURLToPath(new URL('../test-results', import.meta.url)); // holds the per-run output directories and the carried failure list

// the e2e specs use server/stub ports 13950..13998 (offset 0)
export const SPEC_PORT_MIN = 13950;
export const SPEC_PORT_MAX = 13999;

export function isFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, host, () => s.close(() => resolve(true)));
  });
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } };

/**
 * Reserves a block for this run in the OS temp directory, so two runs started at the same instant cannot both see it free
 * (the ports themselves are only bound later, by the specs). A reservation whose process is dead is stale and taken over.
 * Returns a release function, or null when another live run holds the block.
 */
export function claimBlock(offset, { dir = tmpdir(), pid = process.pid, alive = pidAlive } = {}) {
  const file = join(dir, `sl-e2e-block-${offset}.lock`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, String(pid));
      closeSync(fd);
      return () => rmSync(file, { force: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let holder = NaN;
      try { holder = Number(readFileSync(file, 'utf8')); } catch { /* vanished */ }
      if (holder && alive(holder) && holder !== pid) return null;
      rmSync(file, { force: true });
    }
  }
  return null;
}

/** A block of server ports (offset from the historical numbers) that is reserved for this run and free, and a free Vite port. */
export async function pickRunPorts({ random = Math.random, free = isFree, claim = claimBlock, attempts = 40, workers = 1 } = {}) {
  const slot = 1000 * workers; // one 1000-port lane per Playwright worker
  const maxOffset = 65000 - SPEC_PORT_MAX - slot;
  for (let i = 0; i < attempts; i += 1) {
    const offset = i === 0 ? 0 : slot * (1 + Math.floor(random() * Math.floor(maxOffset / slot)));
    const release = claim(offset);
    if (!release) continue;
    if (await blockFree(offset, free, workers)) return { offset, vitePort: await freePort(), release };
    release();
  }
  throw new Error('no free block of e2e ports found; stop the leftover test processes and retry');
}

async function blockFree(offset, free, workers = 1) {
  for (let w = 0; w < workers; w += 1) for (let p = SPEC_PORT_MIN; p <= SPEC_PORT_MAX; p += 1) if (!(await free(p + offset + 1000 * w))) return false;
  return true;
}

// ---- duration baseline identity ----
// A baseline is only a fair comparison for the SAME selection of tests on the SAME configuration. The key is the suite and workers, plus a short hash
// of the selection (spec files and the flags that change which tests run) when the caller passed any. Spelling does not matter (file order, path
// separators, -g/--grep, the reporter); the tests do. --changed and --failed select from the working tree / the last run, so they have no baseline.
const FLAG_ALIAS = { '-g': '--grep', '-j': '--workers', '-c': '--config' };
const VALUE_FLAGS = new Set(['--grep', '--grep-invert', '--project', '--repeat-each', '--retries', '--workers', '--timeout', '--shard', '--reporter', '--output', '--config', '--tag', '--max-failures']);
const NOT_PART_OF_SELECTION = new Set(['--reporter', '--output']);

function noBaselineReason(args) {
  if (args.includes('--only-changed') || args.includes('--changed')) return { key: null, reason: '--changed selects the specs that differ from HEAD (the working tree), so two runs rarely select the same tests' };
  if (args.includes('--last-failed') || args.includes('--failed')) return { key: null, reason: '--failed selects what failed in the last run, so two runs rarely select the same tests' };
  return null;
}

function selectionParts(args) {
  const files = [];
  const flags = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('-')) { files.push(arg.replaceAll('\\', '/')); continue; }
    const eq = arg.indexOf('=');
    const name = FLAG_ALIAS[eq < 0 ? arg : arg.slice(0, eq)] ?? (eq < 0 ? arg : arg.slice(0, eq));
    let value = eq < 0 ? undefined : arg.slice(eq + 1);
    if (value === undefined && VALUE_FLAGS.has(name)) { value = args[i + 1] ?? ''; i += 1; }
    if (NOT_PART_OF_SELECTION.has(name)) continue;
    flags.push(`${name}=${value ?? ''}`);
  }
  return { files, flags };
}

export function baselineIdentity({ suite, workers, args = [] }) {
  const noBaseline = noBaselineReason(args);
  if (noBaseline) return noBaseline;
  const base = `${suite || 'full'}@${workers}w`;
  const { files, flags } = selectionParts(args);
  if (!files.length && !flags.length) return { key: base };
  const selection = JSON.stringify({ files: files.sort(), flags: flags.sort() });
  return { key: `${base}+sel-${createHash('sha1').update(selection).digest('hex').slice(0, 10)}`, selection };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const env = { ...process.env };
  const rec = args.indexOf('--record-baseline');
  if (rec >= 0) args.splice(rec, 1);
  const i = args.indexOf('--suite');
  if (i >= 0) { env.E2E_SUITE = args[i + 1]; args.splice(i, 2); }
  // full run = 3 workers (measured 2026-11-01: 2w 1024 s; 3w 799 s, 0 failures; 4w 653-852 s but 3 different tests failed in 3 of 3 runs, contention, not stable); area suites may override via SUITE_WORKERS
  // resource gate (docs/engineering/process-lifecycle.md): fewer workers under memory/CPU pressure, a refusal when the machine cannot take a run now
  const gate = admitNow(Number(env.E2E_WORKERS || SUITE_WORKERS[env.E2E_SUITE] || 3));
  if (!gate.ok) { console.log(`[e2e] refused, retry later: ${gate.notes.join('; ')}`); process.exit(EXIT.REFUSED); }
  for (const note of gate.notes) console.log(`[e2e] ${note}`);
  const workers = gate.workers;
  env.E2E_WORKERS = String(workers);
  const { offset, vitePort, release } = await pickRunPorts({ workers });
  env.E2E_PORT_OFFSET = String(offset);
  env.E2E_VITE_PORT = String(vitePort);
  env.E2E_RUN_ID = `${Date.now()}-${process.pid}`;
  // T-F6-10: the spec servers (all started with NODE_ENV=test) hash passwords with cheap scrypt params; see server/src/auth/passwords.js
  env.SMARTLEARN_TEST_FAST_SCRYPT = '1';
  if (env.E2E_VERBOSE) {
    const suiteDescription = env.E2E_SUITE ? `, suite ${env.E2E_SUITE}` : '';
    console.log(`[e2e] run ${env.E2E_RUN_ID}: vite ${vitePort}, server ports +${offset}, ${workers} worker(s)${suiteDescription}`);
  }
  const callerArgs = [...args]; // the caller's arguments (identity), before --changed/--failed are expanded and the reporter is added
  // --changed = the specs that exercise what differs from HEAD (or --base <ref>), by impact (scripts/e2e-impact.mjs), not Playwright's --only-changed
  // (which only picks spec FILES that changed); --dry-run prints the selection and stops; --explain also lists why each path selected what it did
  const take = (flag, withValue) => {
    const at = args.indexOf(flag);
    if (at < 0) return undefined;
    const value = withValue ? args[at + 1] : true;
    args.splice(at, withValue ? 2 : 1);
    return value;
  };
  const base = take('--base', true); const files = take('--files', true); const dryRun = take('--dry-run'); const explain = take('--explain');
  const k = args.indexOf('--changed');
  if (k >= 0) {
    args.splice(k, 1);
    const { selectSpecs, loadSpecs, loadModules, gitChangedPaths, playwrightArgsFor } = await import('./e2e-impact.mjs');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const selection = selectSpecs({ changed: files ? files.split(',').filter(Boolean) : gitChangedPaths(root, base || 'HEAD'), specs: loadSpecs(root), modules: loadModules(root) });
    const label = selection.none ? 'no E2E impacted (docs/tooling only)' : `${selection.specs.length} spec(s): ${selection.specs.join(' ')}`;
    const escalation = selection.escalate ? ' | ESCALATE: configuration changed, a full-suite milestone gate is justified' : '';
    console.log(`[e2e] --changed${base ? ' --base ' + base : ''}: ${label}${escalation}`);
    if (explain || env.E2E_VERBOSE) for (const r of selection.reasons) console.log(`  - ${r}`);
    if (dryRun || selection.none) { release(); process.exit(0); }
    args.push(...playwrightArgsFor(selection));
  } else if (dryRun) { release(); console.log('[e2e] --dry-run only applies to --changed'); process.exit(0); }
  // --failed = re-run only the tests that failed last time. Each run has its own output directory (E2E_RUN_ID), and Playwright keeps its failure list
  // inside it, so the list is carried in a stable file and copied into this run's directory; with nothing recorded it stops (Playwright would run everything).
  const stable = join(STABLE_DIR, '.last-failed.json');
  const runDir = join(STABLE_DIR, env.E2E_RUN_ID);
  const f = args.indexOf('--failed');
  if (f >= 0) {
    let failed = [];
    try { failed = JSON.parse(readFileSync(stable, 'utf8')).failedTests ?? []; } catch { /* none recorded */ }
    if (!failed.length) { release(); console.log('[e2e] --failed: no failures recorded from the last run; nothing to retry'); process.exit(0); }
    mkdirSync(runDir, { recursive: true });
    copyFileSync(stable, join(runDir, '.last-run.json'));
    args[f] = '--last-failed';
  }
  try { const holder = Number(readFileSync(join(STABLE_DIR, '.global-run.lock'), 'utf8')); if (holder && holder !== process.pid && pidAlive(holder)) console.log(`[e2e] a global run is in progress (pid ${holder}): this run shares CPU, slower timings are expected`); } catch { /* no global run */ }
  // token-cheap output by default: only failures and one summary line; E2E_VERBOSE=1 or an explicit --reporter keeps Playwright's own
  const identity = baselineIdentity({ suite: env.E2E_SUITE, workers, args: callerArgs });
  if (!env.E2E_VERBOSE && !args.some((a) => a === '--reporter' || a.startsWith('--reporter='))) args.push(`--reporter=${fileURLToPath(new URL('../e2e/support/quiet-reporter.js', import.meta.url))}`);
  // run Playwright's CLI directly: no npx/npm "notice" lines, no shell quoting
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  // the whole run lives in one Job Object: its servers and browsers end with it, even if this process is killed; no job => no run
  const { child } = spawnSupervised({ exe: process.execPath, args: [cli, 'test', ...args], env, stdio: 'inherit', label: `e2e ${env.E2E_RUN_ID}`, workers });
  const t0 = Date.now();
  child.on('exit', (code) => { release(); try { copyFileSync(join(runDir, '.last-run.json'), stable); } catch { /* the run wrote no failure list */ } const dev = checkDuration({ seconds: (Date.now() - t0) / 1000, key: identity.key, reason: identity.reason, code, record: rec >= 0 }); process.exit(code === 0 && dev ? 5 : (code ?? 1)); });
  process.on('SIGINT', () => { release(); process.exit(130); });
}

// every run has a measured baseline: a full-suite duration far from the recorded one means a slow target, a broken runner or skipped tests (exit 5 if the run was otherwise green)
export function checkDuration({ seconds, key, reason, code, record, file = new URL('../e2e/.duration-baseline.json', import.meta.url), log = console.log }) {
  // a run whose selection has no stable identity (--changed, --failed) is neither compared nor recorded: any "deviation" would only mean "other tests"
  if (!key) { log(`[e2e] no comparable baseline: ${reason}${record ? '; --record-baseline ignored, nothing recorded' : ''}`); return; }
  let all = {};
  try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  if (record && code === 0) { all[key] = Math.round(seconds); writeFileSync(file, JSON.stringify(all, null, 2) + '\n'); log(`[e2e] baseline ${key} = ${Math.round(seconds)} s recorded`); return; }
  const base = all[key];
  if (!base) { log(`[e2e] NO BASELINE for ${key} (${Math.round(seconds)} s); record one from a clean run with --record-baseline`); return; }
  const dev = (seconds - base) / base;
  if (Math.abs(dev) > 0.3) { log(`[e2e] PERF DEVIATION ${key}: ${Math.round(seconds)} s vs baseline ${base} s (${dev > 0 ? '+' : ''}${Math.round(dev * 100)}%): investigate runner/target before trusting the result`); return true; }
}
