// Regression test for the UI driver's speed/safety guards. Needs a running driver (node scripts/zz-ui-driver.mjs start). Exit 0 only if all hold:
// stale control numbers fail fast with the cause (click/fill/upload/select), numbers are retired after a screen-changing action,
// an 8-line batch is quick, and the 17th separate call in a minute is refused while batch stays allowed.
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
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

rmSync(pace, { force: true });
let blockedAt = null;
for (let i = 1; i <= 20 && !blockedAt; i += 1) { if (run(['wait', '1']).code === 3) blockedAt = i; }
check('the 17th separate call in 60 s is refused', blockedAt === 17, `blocked at ${blockedAt}`);
check('batch stays allowed while blocked', run(['batch', file]).code === 0);
check('there is no bypass: the env var that used to override is ignored', run(['wait', '1'], { SL_DRIVER_ALLOW_SLOW: '1' }).code === 3);

rmSync(pace, { force: true });
rmSync(file, { force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
