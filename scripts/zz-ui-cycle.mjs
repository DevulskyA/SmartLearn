// Runs the whole functional cycle in ONE go on the already-open app (no restarts, no fixing): every batch in lotes/CICLO.txt, in order,
// one result line each (time, lines, failures, slow lines, perf deviation), written to lotes/CICLO-RESULTADO.md. Problems are only registered here;
// fixes happen afterwards and the cycle is simply run again.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lotes = join(here, '..', '.specs', 'evidence', 'ui-funcional-2026-11-01', 'lotes');
const driver = join(here, 'zz-ui-driver.mjs');
const order = readFileSync(join(lotes, 'CICLO.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const rows = []; const t0 = Date.now();
for (const rel of order) {
  rmSync(join(tmpdir(), 'sl-ui-driver-pace.json'), { force: true });
  const t = Date.now();
  const r = spawnSync(process.execPath, [driver, 'batch', join(lotes, rel), ...(process.argv.includes('--record') ? ['--record'] : [])], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const line = out.match(/batch: (\d+) lines, (\d+) failed, (\d+) ms/);
  const errs = [...out.matchAll(/^ERR (.*)$/gm)].map((m) => m[1].slice(0, 70));
  rows.push({ rel, lines: line?.[1] ?? '?', failed: Number(line?.[2] ?? 0), ms: Number(line?.[3] ?? Date.now() - t), slow: /SLOW LINES/.test(out), deviation: /PERF DEVIATION/.test(out), nobase: /NO BASELINE/.test(out), errs });
}
const md = ['# Resultado do ciclo funcional', '', `Total: ${Date.now() - t0} ms, ${rows.length} lotes, ${rows.filter((r) => r.failed).length} com falha.`, '', '| Lote | Linhas | Falhas | ms | Lentas | Desvio de tempo | Sem medição |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.rel} | ${r.lines} | ${r.failed} | ${r.ms} | ${r.slow ? 'sim' : ''} | ${r.deviation ? 'SIM' : ''} | ${r.nobase ? 'sim' : ''} |`), '', '## Linhas com falha', ...rows.filter((r) => r.errs.length).flatMap((r) => [`- ${r.rel}`, ...r.errs.map((e) => `  - ${e}`)])];
writeFileSync(join(lotes, 'CICLO-RESULTADO.md'), md.join('\n') + '\n');
console.log(md.slice(0, 3).join('\n'));
console.log(rows.map((r) => `${r.rel}: ${r.failed} falhas, ${r.ms} ms${r.deviation ? ' DESVIO' : ''}`).join('\n'));
process.exit(rows.some((r) => r.failed || r.deviation) ? 1 : 0);
