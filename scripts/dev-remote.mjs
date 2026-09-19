#!/usr/bin/env node
// ENV-NORMALIZE-01: single official entry point for developing/testing the
// remote-mode account flow (SERVIDOR CENTRAL login/register) locally.
// Plain `npm run dev` stays local-only (no server required) — this is an
// explicit opt-in for the flow that needs the API server. Spawns both
// processes directly by their JS entry point (never through a shell), so
// it behaves the same on Windows and POSIX without quoting landmines.
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { devDbPaths, snapshotDevDbIfNeeded, acquireDevLock } from './dev-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_DIR = path.join(ROOT, 'server');
const VITE_ENTRY = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const WORK_BRANCH = 'claude/smartlearn-v1-complete';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const branch = git(['branch', '--show-current'], ROOT);
console.log(`SMARTLEARN_ROOT=${ROOT}`);
console.log(`SMARTLEARN_BRANCH=${branch || '(detached HEAD)'}`);
if (branch !== WORK_BRANCH) {
  console.error('\nSMARTLEARN_WRONG_WORKTREE');
  console.error(`Development must run from ${WORK_BRANCH}.`);
  process.exit(1);
}

// Small fixed range covers Vite's automatic port fallback when 5173 is busy.
const DEV_ORIGINS = [5173, 5174, 5175, 5176, 5177]
  .map((p) => `http://localhost:${p}`)
  .join(',');

const children = [];
function spawnChild(name, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    for (const other of children) if (other !== child && !other.killed) other.kill();
  });
  children.push(child);
  return child;
}

// Durable dev data: one stable directory OUTSIDE any worktree (override with
// SMARTLEARN_DB_PATH / SMARTLEARN_SOURCES_DIR). Persist by default; a daily
// snapshot means an accidental wipe/import/seed is always recoverable.
const dev = devDbPaths();
const dbPath = process.env.SMARTLEARN_DB_PATH || dev.dbPath;
const sourcesDir = process.env.SMARTLEARN_SOURCES_DIR || dev.sourcesDir;
mkdirSync(dev.dir, { recursive: true });
// Only the default persistent DB is single-writer guarded (an explicit SMARTLEARN_DB_PATH is the operator's choice).
let releaseLock = () => {};
if (!process.env.SMARTLEARN_DB_PATH) {
  try { releaseLock = acquireDevLock(dev.dir, { root: ROOT }); } catch (err) { console.error(err.message); process.exit(1); }
  process.on('exit', () => releaseLock());
}
const snap = snapshotDevDbIfNeeded(dbPath, dev.snapshotsDir);
console.log(`SMARTLEARN_DEV_DB=${dbPath}`);
if (snap) console.log(`SMARTLEARN_DEV_SNAPSHOT=${snap}`);

spawnChild('server', process.execPath, ['src/main.js'], SERVER_DIR, {
  SMARTLEARN_ALLOWED_ORIGINS: DEV_ORIGINS,
  SMARTLEARN_DB_PATH: dbPath,
  SMARTLEARN_SOURCES_DIR: sourcesDir,
});
spawnChild('vite', process.execPath, [VITE_ENTRY], ROOT, {
  VITE_REMOTE_MODE: '1',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) if (!child.killed) child.kill();
    process.exit(0);
  });
}
