import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveWindowsPowerShellExecutable } from './system-executables.mjs';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('../scripts/launch-homologacao.ps1', import.meta.url));
const windows = process.platform === 'win32';

// A fake install folder (no real executable): enough for the launcher's -CheckOnly, which starts nothing and creates nothing.
function install({ exeBytes = 'fake-exe', servedHash = 'aaa', manifestHash = 'aaa' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-homolog-'));
  mkdirSync(join(dir, 'app', 'dist-runtime'), { recursive: true });
  writeFileSync(join(dir, 'app', 'smartlearn.exe'), exeBytes);
  writeFileSync(join(dir, 'app', 'dist-runtime', 'build-info.json'), JSON.stringify({ inputsHash: servedHash }));
  const sha = createHash('sha256').update('fake-exe').digest('hex');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version: '0.1.0', commit: 'abc1234', inputsHash: manifestHash, exeSha256: sha }));
  copyFileSync(launcher, join(dir, 'launch.ps1'));
  return dir;
}
function check(dir, dataDir, extraEnv = {}) {
  const env = { ...process.env, SMARTLEARN_HOMOLOGACAO_DATA_DIR: dataDir, ...extraEnv };
  delete env.SMARTLEARN_DEV_DATA_DIR;
  Object.assign(env, extraEnv);
  const r = spawnSync(resolveWindowsPowerShellExecutable(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'launch.ps1'), '-CheckOnly'], { env, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const withInstall = (opts, fn) => { const dir = install(opts); try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const scratchData = () => join(tmpdir(), `sl-homolog-data-${process.pid}`);

test('launcher plans an isolated datastore (own db, sources and WebView2 profile) and creates nothing', { skip: !windows }, () => withInstall({}, (dir) => {
  const data = scratchData();
  const r = check(dir, data);
  assert.equal(r.status, 0, r.err);
  const plan = JSON.parse(r.out);
  assert.equal(plan.database, join(data, 'smartlearn-homologacao.db'));
  assert.equal(plan.sources, join(data, 'sources'));
  assert.equal(plan.webviewProfile, join(data, 'webview'));
  assert.match(plan.windowTitle, /^SmartLearn HOMOLOGACAO - v0\.1\.0 - abc1234$/);
}));

test('launcher refuses a data path that is, contains or sits inside human Oficial/DEV data', { skip: !windows }, () => withInstall({}, (dir) => {
  const humans = [join(homedir(), 'SmartLearn-DevData'), join(homedir(), 'SmartLearn-DevData', 'sources'), join(process.env.APPDATA ?? 'C:\\x', 'com.devulsky.smartlearn'), join(process.env.LOCALAPPDATA ?? 'C:\\x', 'com.devulsky.smartlearn', 'EBWebView'), homedir()];
  for (const human of humans) {
    const r = check(dir, human);
    assert.equal(r.status, 1, `${human} must be refused: ${r.out}`);
    assert.match(r.err, /coincide com\s+dados humanos/, human);
  }
}));

test('launcher refuses a data path named by SMARTLEARN_DEV_DATA_DIR', { skip: !windows }, () => withInstall({}, (dir) => {
  const data = scratchData();
  const r = check(dir, data, { SMARTLEARN_DEV_DATA_DIR: data });
  assert.equal(r.status, 1, r.out);
}));

test('launcher refuses an executable that changed since the install and content that is not the installed one', { skip: !windows }, () => {
  withInstall({ exeBytes: 'tampered-exe' }, (dir) => {
    const r = check(dir, scratchData());
    assert.equal(r.status, 1, r.out);
    assert.match(r.err, /executavel\s+mudou/);
  });
  withInstall({ servedHash: 'bbb' }, (dir) => {
    const r = check(dir, scratchData());
    assert.equal(r.status, 1, r.out);
    assert.match(r.err, /conteudo\s+servido/);
  });
});
