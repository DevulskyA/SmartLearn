#!/usr/bin/env node
// Homologation in LIVE-CODE mode: the Homologation database and sources, served from the source tree with hot reload.
// Edit src/ or server/ and the browser updates by itself; no build, no install. Install the .exe only once, when the batch is ready.
//
//   node scripts/homologation-dev.mjs            (or: npm run homologation:dev)
//
// Open http://localhost:5183 and log in with the Homologation account. Ctrl+C stops everything. Nothing is installed or registered:
// to remove this mode delete this file and the "homologation:dev" line in package.json. The .exe install is not touched.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.SMARTLEARN_HOMOLOGATION_DATA || path.join(homedir(), 'SmartLearn-Homologacao-Data');
const DB_PATH = path.join(DATA_DIR, 'smartlearn-homologacao.db');
const SOURCES_DIR = path.join(DATA_DIR, 'sources');
const API_PORT = 3000; // the front end calls http://localhost:3000 directly (src/auth-ui.js API_BASE)
const WEB_PORT = 5183;
const EXE = path.join('C:', 'Projetos', 'SmartLearn-Homologacao', 'app', 'smartlearn.exe');
const POWERSHELL = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

if (spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'work-target-guard.mjs')], { stdio: 'inherit' }).status !== 0) process.exit(1);
if (!existsSync(DB_PATH)) { console.error(`Banco da Homologacao nao encontrado: ${DB_PATH}`); process.exit(1); }
mkdirSync(SOURCES_DIR, { recursive: true });

// Two writers on one SQLite file is the one thing that corrupts data: close the installed Homologation app (only that exact exe) first.
const closeInstalled = `$p = Get-Process smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${EXE}' }; foreach ($x in $p) { [void]$x.CloseMainWindow(); if (-not $x.WaitForExit(15000)) { $x.Kill() } }; @($p).Count`;
const closed = spawnSync(POWERSHELL, ['-NoProfile', '-Command', closeInstalled], { encoding: 'utf8' });
if (closed.stdout?.trim() && closed.stdout.trim() !== '0') console.log('Homologacao instalada estava aberta: fechada para liberar o banco.');

const children = [];
function run(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
  child.on('exit', (code) => { console.log(`[${name}] terminou (${code})`); for (const o of children) if (o !== child && !o.killed) o.kill(); });
  children.push(child);
}

console.log(`Banco: ${DB_PATH}\nSite:  http://localhost:${WEB_PORT}   (codigo vivo, recarrega sozinho)\n`);
run('api', ['src/main.js'], path.join(ROOT, 'server'), {
  PORT: String(API_PORT),
  SMARTLEARN_DB_PATH: DB_PATH,
  SMARTLEARN_SOURCES_DIR: SOURCES_DIR,
  SMARTLEARN_ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
});
run('web', [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(WEB_PORT)], ROOT, {
  VITE_REMOTE_MODE: '1',
  SMARTLEARN_API_PROXY_TARGET: `http://localhost:${API_PORT}`,
});
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, () => {
    for (const c of children) {
      if (!c.killed) c.kill();
    }
    process.exit(0);
  });
}
