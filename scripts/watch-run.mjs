#!/usr/bin/env node
// Roda um comando longo, grava toda a saída com hora num log e mostra um sinal de vida.
// Se ficar STALL_S segundos sem nenhuma saída, mata a árvore de processos e sai com 124.
// Uso: node scripts/watch-run.mjs [--stall=180] [--log=caminho] -- <comando> [args...]
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 0 || sep === argv.length - 1) {
  console.error('uso: node scripts/watch-run.mjs [--stall=180] [--log=arquivo] -- comando args...');
  process.exit(2);
}
const opt = (name, fallback) => argv.slice(0, sep).find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const stallMs = Number(opt('stall', 180)) * 1000;
// Fora de test-results/: o Playwright apaga essa pasta ao iniciar e ao terminar, e levaria o log junto.
const logPath = opt('log', join(tmpdir(), 'smartlearn-watch', `watch-${Date.now()}.log`));
const [cmd, ...args] = argv.slice(sep + 1);

mkdirSync(dirname(logPath), { recursive: true });
const log = createWriteStream(logPath, { flags: 'a' });
const stamp = () => new Date().toISOString().slice(11, 19);
const started = Date.now();
let lastOutput = Date.now();
let lines = 0;
let stalled = false;

// npx/npm são .cmd no Windows e exigem shell; nos demais, sem shell, para os argumentos não serem remontados.
const needsShell = /^(npx|npm|pnpm|yarn)(\.cmd)?$/i.test(cmd);
const quote = (a) => (/^[\w./:=@,+-]+$/.test(a) ? a : JSON.stringify(a));
const child = needsShell
  ? spawn([cmd, ...args.map(quote)].join(' '), { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  : spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const onData = (chunk) => {
  lastOutput = Date.now();
  for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
    lines++;
    log.write(`${stamp()} ${line}\n`);
  }
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

const beat = setInterval(() => {
  const idle = Math.round((Date.now() - lastOutput) / 1000);
  const total = Math.round((Date.now() - started) / 1000);
  const msg = `[watch] ${total}s no total, ${lines} linhas, ${idle}s sem saída (limite ${stallMs / 1000}s) log=${logPath}`;
  console.log(msg);
  log.write(`${stamp()} ${msg}\n`);
  if (Date.now() - lastOutput > stallMs) {
    const err = `[watch] TRAVADO: ${idle}s sem saída. Encerrando a árvore de processos ${child.pid}.`;
    console.error(err);
    log.write(`${stamp()} ${err}\n`);
    stalled = true;
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}, 30000);

child.on('exit', (code) => {
  clearInterval(beat);
  const msg = `[watch] terminou com código ${code} em ${Math.round((Date.now() - started) / 1000)}s, ${lines} linhas`;
  console.log(msg);
  log.write(`${stamp()} ${msg}\n`);
  log.end(() => process.exit(stalled ? 124 : (code ?? 1)));
});
