import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homologationFileProblems, humanRootsOf, installerArgs, installerEnv, scratchLayout, scratchRootProblems, shortcutProblems, failClosedProblems, withoutSmartlearnEnv, inside } from '../scripts/homologation-proof-lib.mjs';

// Pure decisions of scripts/homologation-proof.mjs. Nothing here starts a process, opens a window or touches a database.
const home = 'C:\\Users\\Dono';
const humans = humanRootsOf({ home, appData: `${home}\\AppData\\Roaming`, localAppData: `${home}\\AppData\\Local` });
const dest = 'C:\\Projetos\\SmartLearn-Homologacao';
const realExe = `${dest}\\app\\smartlearn.exe`;
const manifest = { version: '0.1.0', commit: 'abc1234', inputsHash: 'f'.repeat(64) };
const goodCfg = () => ({ db: `${home}\\SmartLearn-Homologacao-Data\\smartlearn-homologacao.db`, sources: `${home}\\SmartLearn-Homologacao-Data\\sources`, webviewDir: `${home}\\SmartLearn-Homologacao-Data\\webview`, windowTitle: 'SmartLearn HOMOLOGACAO - v0.1.0 - abc1234', buildContent: manifest.inputsHash, buildHead: 'abc1234' });
const cfgProblems = (cfg, readOnly = true) => homologationFileProblems(cfg, { humanRoots: humans, appDir: `${dest}\\app`, manifest, readOnly });

test('human roots are the DEV datastore, the Oficial Roaming data and its Local twin', () => {
  assert.deepEqual(humans, [`${home}\\SmartLearn-DevData`, `${home}\\AppData\\Roaming\\com.devulsky.smartlearn`, `${home}\\AppData\\Local\\com.devulsky.smartlearn`]);
});

test('the scratch run strips EVERY SMARTLEARN_* variable, in any case, and adds nothing implicit', () => {
  const env = { PATH: 'x', SMARTLEARN_AI_PROVIDER: 'CODEX', smartlearn_db_path: 'y', SmartLearn_Window_Title: 'z', SMARTLEARN_HOMOLOGACAO_DATA_DIR: 'd', OTHER_SMARTLEARN_X: 'keep' };
  const clean = withoutSmartlearnEnv(env);
  assert.deepEqual(clean, { PATH: 'x', OTHER_SMARTLEARN_X: 'keep' });
  assert.equal(Object.keys(env).length, 6, 'the input must not be mutated');
  assert.deepEqual(withoutSmartlearnEnv(env, { SMARTLEARN_DB_PATH: 'safe' }), { PATH: 'x', OTHER_SMARTLEARN_X: 'keep', SMARTLEARN_DB_PATH: 'safe' });
});

test('the scratch installer is called with its own dest, no shortcut, the FREE provider, and its data folder in scratch', () => {
  assert.deepEqual(installerArgs({ script: 's.mjs', exe: 'C:\\e\\smartlearn.exe', dest: 'C:\\s\\inst' }), ['s.mjs', '--exe', 'C:\\e\\smartlearn.exe', '--dest', 'C:\\s\\inst', '--no-shortcut', '--provider', 'FAKE']);
  assert.equal(installerEnv({ A: '1', SMARTLEARN_HOMOLOGACAO_DATA_DIR: 'real' }, 'C:\\s\\data').SMARTLEARN_HOMOLOGACAO_DATA_DIR, 'C:\\s\\data');
  assert.equal(installerEnv({ A: '1' }, 'C:\\s\\data').A, '1');
});

test('scratch layout keeps both copies and both data folders under one root', () => {
  const l = scratchLayout('C:\\Users\\Dono\\SmartLearn-Prova-Descartavel');
  for (const p of [l.inst, l.data, l.instNoFile, l.dataNoFile]) assert.ok(inside(p, l.root), p);
  assert.notEqual(l.inst, l.instNoFile);
});

test('scratch root is refused when it is, contains or sits inside human data, the real install or the real data; shallow roots too', () => {
  const protectedPaths = [dest, `${home}\\SmartLearn-Homologacao-Data`];
  const ok = `${home}\\SmartLearn-Prova-Descartavel`;
  assert.deepEqual(scratchRootProblems(ok, humans, protectedPaths), []);
  for (const bad of [home, `${home}\\SmartLearn-DevData`, `${home}\\SmartLearn-DevData\\prova`, `${home}\\AppData\\Roaming\\com.devulsky.smartlearn\\x`, `${home}\\AppData\\Local`, dest, `${dest}\\app`, 'C:\\Projetos', `${home}\\SmartLearn-Homologacao-Data`, `${home}\\SmartLearn-Homologacao-Data\\webview`, 'C:\\', 'C:\\Users\\Dono']) {
    assert.ok(scratchRootProblems(bad, humans, protectedPaths).length > 0, `${bad} must be refused`);
  }
});

test('real shortcut: exact target, empty arguments, working dir = dest, read-only', () => {
  const sc = { target: realExe.toUpperCase(), arguments: '', wd: `${dest}\\`.slice(0, -1), readOnly: true };
  assert.deepEqual(shortcutProblems(sc, { dest, exe: realExe }), [], 'case differences do not matter');
  assert.equal(shortcutProblems({ ...sc, target: `${dest}\\launch.ps1` }, { dest, exe: realExe }).length, 1);
  assert.equal(shortcutProblems({ ...sc, target: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', arguments: `-File "${dest}\\launch.ps1"` }, { dest, exe: realExe }).length, 2);
  assert.equal(shortcutProblems({ ...sc, wd: `${dest}\\app` }, { dest, exe: realExe }).length, 1);
  assert.equal(shortcutProblems({ ...sc, readOnly: false }, { dest, exe: realExe }).length, 1);
  assert.ok(shortcutProblems({ target: null, arguments: null, wd: null, readOnly: false }, { dest, exe: realExe }).length >= 3);
});

test('homologation.json: accepted when read-only, identical to the manifest and outside every human folder', () => {
  assert.deepEqual(cfgProblems(goodCfg()), []);
});

test('homologation.json: refused when writable, or any path is human, relative, or inside the install folder', () => {
  assert.equal(cfgProblems(goodCfg(), false).length, 1);
  for (const key of ['db', 'sources', 'webviewDir']) {
    for (const bad of [`${home}\\SmartLearn-DevData\\x`, `${home}\\AppData\\Roaming\\com.devulsky.smartlearn\\${key}`, `${home}\\AppData\\Local\\com.devulsky.smartlearn\\EBWebView`, `${home}\\AppData\\Roaming`, `${dest}\\app\\data`, 'relative\\path', '']) {
      assert.ok(cfgProblems({ ...goodCfg(), [key]: bad }).length > 0, `${key}=${bad} must be refused`);
    }
  }
});

test('homologation.json: refused when its identity differs from the manifest', () => {
  assert.equal(cfgProblems({ ...goodCfg(), buildContent: 'a'.repeat(64) }).length, 1);
  assert.equal(cfgProblems({ ...goodCfg(), buildHead: 'zzz9999' }).length, 1);
  assert.equal(cfgProblems({ ...goodCfg(), windowTitle: 'SmartLearn' }).length, 1);
  assert.ok(cfgProblems(null).length > 0);
});

test('fail closed verdict: accepts an immediate exit or a refusal box closed to exit code 1, rejects window, backend, data and survivors', () => {
  const ok = { sawAppWindow: false, sawBackend: false, dataCreated: [], stillAliveAfterClose: false, exitCode: 1, messageBox: true };
  assert.deepEqual(failClosedProblems(ok), []);
  assert.deepEqual(failClosedProblems({ ...ok, messageBox: false }), []);
  assert.equal(failClosedProblems({ ...ok, sawAppWindow: true }).length, 1);
  assert.equal(failClosedProblems({ ...ok, sawBackend: true }).length, 1);
  assert.equal(failClosedProblems({ ...ok, dataCreated: ['C:\\s\\data-sem-arquivo\\x.db'] }).length, 1);
  assert.equal(failClosedProblems({ ...ok, stillAliveAfterClose: true, exitCode: null }).length, 1);
  assert.equal(failClosedProblems({ ...ok, exitCode: 0 }).length, 1);
});
