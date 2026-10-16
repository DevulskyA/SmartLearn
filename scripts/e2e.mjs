#!/usr/bin/env node
// Runs Playwright with ports that are free for THIS run (T-F6-02) and an output directory of its own, so an orphan from an
// earlier run - or a second run at the same time - cannot take the suite down.
//   node scripts/e2e.mjs [--suite materials] [playwright arguments...]
import net from 'node:net';
import { spawn } from 'node:child_process';
import { openSync, writeSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const env = { ...process.env };
  const i = args.indexOf('--suite');
  if (i >= 0) { env.E2E_SUITE = args[i + 1]; args.splice(i, 2); }
  const workers = Number(env.E2E_WORKERS || 2);
  env.E2E_WORKERS = String(workers);
  const { offset, vitePort, release } = await pickRunPorts({ workers });
  env.E2E_PORT_OFFSET = String(offset);
  env.E2E_VITE_PORT = String(vitePort);
  env.E2E_RUN_ID = `${Date.now()}-${process.pid}`;
  // T-F6-10: the spec servers (all started with NODE_ENV=test) hash passwords with cheap scrypt params; see server/src/auth/passwords.js
  env.SMARTLEARN_TEST_FAST_SCRYPT = '1';
  console.log(`[e2e] run ${env.E2E_RUN_ID}: vite ${vitePort}, server ports +${offset}, ${workers} worker(s)${env.E2E_SUITE ? `, suite ${env.E2E_SUITE}` : ''}`);
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test', ...args], { env, stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => { release(); process.exit(code ?? 1); });
  process.on('SIGINT', () => { release(); process.exit(130); });
}
