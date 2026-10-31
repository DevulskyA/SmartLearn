#!/usr/bin/env node
// Vite for the e2e run, with its output written to a log file instead of the console (playwright.config.js webServer).
// A wrapper and not a shell redirection: the webServer command runs in cmd on Windows and bash elsewhere, and the
// redirection path quoting differs between them.
//   node scripts/e2e-vite.mjs <port> <log file>
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const [, , port, logFile] = process.argv;
const vite = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'vite', 'bin', 'vite.js');
mkdirSync(dirname(logFile), { recursive: true });
const fd = openSync(logFile, 'w');
const child = spawn(process.execPath, [vite, '--port', port, '--strictPort'], { stdio: ['ignore', fd, fd], windowsHide: true });
closeSync(fd);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => child.kill(sig === 'SIGINT' ? 'SIGINT' : 'SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
