#!/usr/bin/env node
// Runs Playwright with ports that are free for THIS run (T-F6-02) and an output directory of its own, so an orphan from an
// earlier run - or a second run at the same time - cannot take the suite down.
//   node scripts/e2e.mjs [--suite materials] [playwright arguments...]
import net from 'node:net';
import { spawn } from 'node:child_process';
import { openSync, writeSync, closeSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { SUITE_WORKERS } from '../e2e/support/suites.js';

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

export function baselineIdentity({ suite, workers, args = [] }) {
  if (args.includes('--only-changed') || args.includes('--changed')) return { key: null, reason: '--changed selects the specs that differ from HEAD (the working tree), so two runs rarely select the same tests' };
  if (args.includes('--last-failed') || args.includes('--failed')) return { key: null, reason: '--failed selects what failed in the last run, so two runs rarely select the same tests' };
  const base = `${suite || 'full'}@${workers}w`;
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
  const workers = Number(env.E2E_WORKERS || SUITE_WORKERS[env.E2E_SUITE] || 3);
  env.E2E_WORKERS = String(workers);
  const { offset, vitePort, release } = await pickRunPorts({ workers });
  env.E2E_PORT_OFFSET = String(offset);
  env.E2E_VITE_PORT = String(vitePort);
  env.E2E_RUN_ID = `${Date.now()}-${process.pid}`;
  // T-F6-10: the spec servers (all started with NODE_ENV=test) hash passwords with cheap scrypt params; see server/src/auth/passwords.js
  env.SMARTLEARN_TEST_FAST_SCRYPT = '1';
  if (env.E2E_VERBOSE) console.log(`[e2e] run ${env.E2E_RUN_ID}: vite ${vitePort}, server ports +${offset}, ${workers} worker(s)${env.E2E_SUITE ? `, suite ${env.E2E_SUITE}` : ''}`);
  // --changed = only the specs whose files differ from HEAD (Playwright --only-changed); --failed = re-run last failures only
  for (const [flag, pw] of [['--changed', '--only-changed'], ['--failed', '--last-failed']]) { const k = args.indexOf(flag); if (k >= 0) args[k] = pw; }
  // token-cheap output by default: only failures and one summary line; E2E_VERBOSE=1 or an explicit --reporter keeps Playwright's own
  const identity = baselineIdentity({ suite: env.E2E_SUITE, workers, args: [...args] }); // the caller's arguments, not the reporter added below
  if (!env.E2E_VERBOSE && !args.some((a) => a === '--reporter' || a.startsWith('--reporter='))) args.push(`--reporter=${fileURLToPath(new URL('../e2e/support/quiet-reporter.js', import.meta.url))}`);
  // run Playwright's CLI directly: no npx/npm "notice" lines, no shell quoting
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const child = spawn(process.execPath, [cli, 'test', ...args], { env, stdio: 'inherit' });
  const t0 = Date.now();
  child.on('exit', (code) => { release(); const dev = checkDuration({ seconds: (Date.now() - t0) / 1000, key: identity.key, reason: identity.reason, code, record: rec >= 0 }); process.exit(code === 0 && dev ? 5 : (code ?? 1)); });
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
