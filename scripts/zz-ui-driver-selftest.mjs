// Regression test for the UI driver's speed/safety guards. Needs a running driver (node scripts/zz-ui-driver.mjs start). Exit 0 only if all hold:
// stale control numbers fail fast with the cause (click/fill/upload/select), numbers are retired after a screen-changing action,
// an 8-line batch is quick, and the 17th separate call in a minute is refused while batch stays allowed.
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const driver = new URL('./zz-ui-driver.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (args, env = {}) => { const t = Date.now(); const r = spawnSync(process.execPath, [driver, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }); return { ms: Date.now() - t, code: r.status, out: `${r.stdout}${r.stderr}` }; };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };
const pace = join(tmpdir(), 'sl-ui-driver-pace.json');
const file = join(tmpdir(), 'sl-ui-selftest-batch.txt');

rmSync(pace, { force: true });
for (const cmd of [['click', '9999'], ['fill', '9999', 'x'], ['upload', '9999', driver], ['select', '9999', 'x']]) {
  const r = run(cmd);
  check(`stale number fails fast with the cause: ${cmd[0]}`, r.code === 2 && r.ms < 1500 && /não existe mais/.test(r.out), `${r.ms} ms`);
}

writeFileSync(file, 'snap\nclick Plano\nclick 2\n');
const retired = run(['batch', file]);
check('a number is retired after a screen-changing action (no silent wrong click)', /ERR click 2/.test(retired.out) && /não existe mais/.test(retired.out));

writeFileSync(file, ['click Plano', 'snap', 'click Estatísticas', 'snap', 'click Configurações', 'snap', 'click Hoje', 'snap'].join('\n'));
const fast = run(['batch', file]);
check('an 8-line batch finishes in under 3 s, all ok', fast.code === 0 && fast.ms < 3000, `${fast.ms} ms`);

check('a fast batch reports no slow lines', !/SLOW LINES/.test(fast.out));
writeFileSync(file, 'click Plano\nclick "texto que nao existe em lugar nenhum"\nsnap\n');
const slowRun = run(['batch', file]);
check('a batch line that waits on a missing target is named as slow', /SLOW LINES.*#2/.test(slowRun.out), slowRun.out.match(/SLOW LINES[^\n]*/)?.[0]?.slice(0, 80));
writeFileSync(file, 'click Plano\nexpect "texto que nunca aparece"\nsnap\n');
const rejected = run(['batch', file]);
check('a batch with a line over 1.5 s is rejected (exit 4)', rejected.code === 4 && /REJECTED AS SLOW/.test(rejected.out), `exit ${rejected.code}`);

// measured baseline: a clean run is recorded, the same run passes, and any change in time or in step count is a deviation (exit 5)
const dir = join(tmpdir(), 'sl-selftest-baseline'); mkdirSync(dir, { recursive: true });
const bfile = join(dir, 't.txt');
writeFileSync(bfile, 'click Plano\nsnap\nclick Hoje\nsnap\n');
const rec = run(['batch', bfile, '--record']);
check('a clean run records its baseline', /BASELINE RECORDED/.test(rec.out), rec.out.match(/BASELINE RECORDED[^\n]*/)?.[0]);
check('the same run matches its baseline (exit 0)', run(['batch', bfile]).code === 0);
writeFileSync(bfile, 'click Plano\nsnap\n');
const fewer = run(['batch', bfile]);
check('fewer steps than the baseline is a deviation (exit 5)', fewer.code === 5 && /PERF DEVIATION/.test(fewer.out), `exit ${fewer.code}`);
writeFileSync(bfile, 'click Plano\nsnap\nclick Hoje\nsnap\n'); writeFileSync(join(dir, 'baseline.json'), JSON.stringify({ 't.txt': { ms: 5000, lines: 4 } }));
const drift = run(['batch', bfile]);
check('a time far from the baseline is a deviation (exit 5)', drift.code === 5, `exit ${drift.code}, ${drift.out.match(/PERF DEVIATION[^\n]*/)?.[0]?.slice(0, 70) ?? ''}`);
writeFileSync(file, 'click Plano\nsnap\n');
check('a batch with no baseline says so', /NO BASELINE/.test(run(['batch', file]).out));
rmSync(dir, { recursive: true, force: true });

// T04: a failing line saves its own evidence (screenshot + screen text + console) and names it; every batch leaves a complete log file.
{
  const bd = join(tmpdir(), 'sl-ui-selftest-evid'); rmSync(bd, { recursive: true, force: true }); mkdirSync(bd, { recursive: true });
  const bf = join(bd, 'falha.txt'); writeFileSync(bf, 'click Plano\nclick "controle que nao existe xyz"\nsnap\n');
  const r = run(['batch', bf]);
  const ev = r.out.match(/EVIDENCE (\S.*)$/m)?.[1]?.trim();
  check('a failing batch line names its evidence folder', r.code === 2 && !!ev && /falha-L2$/.test(ev), ev ?? 'none');
  check('the evidence has screenshot and screen text', !!ev && existsSync(join(ev, 'falha.png')) && /--- controls/.test(readFileSync(join(ev, 'tela.txt'), 'utf8')));
  check('the full log is written to a file', existsSync(join(bd, 'logs', 'falha.log')) && /click Plano/.test(readFileSync(join(bd, 'logs', 'falha.log'), 'utf8')));
  check('a quoted multi-word selector reaches the driver whole (error names it)', /controle que nao existe xyz/.test(r.out));
  rmSync(bd, { recursive: true, force: true });
}

rmSync(pace, { force: true });
let blockedAt = null;
for (let i = 1; i <= 20 && !blockedAt; i += 1) { if (run(['wait', '1']).code === 3) blockedAt = i; }
check('the 17th separate call in 60 s is refused', blockedAt === 17, `blocked at ${blockedAt}`);
writeFileSync(file, 'click Plano\nsnap\n');
check('batch stays allowed while blocked', run(['batch', file]).code === 0);
check('there is no bypass: the env var that used to override is ignored', run(['wait', '1'], { SL_DRIVER_ALLOW_SLOW: '1' }).code === 3);

rmSync(pace, { force: true });
rmSync(file, { force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
