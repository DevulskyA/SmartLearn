#!/usr/bin/env node
// Real-use proof of the installed "SmartLearn Homologacao", with free test data and no paid AI, WITHOUT touching its real data.
//
//   node scripts/homologation-proof.mjs snapshot <file>            metadata of every existing SmartLearn shortcut, its target and the human data (stat only)
//   node scripts/homologation-proof.mjs run --before <file> [--dest C:\Projetos\SmartLearn-Homologacao] [--exe <source exe>] [--scratch <dir>]
//
// The installed exe opens ISOLATED by itself: it reads app\homologation.json (read-only, next to it), which PREVAILS over the environment.
// Running the real install would therefore open and pollute the owner's real homologation data. So `run`:
//   1. checks the REAL install statically (never opens it): the shortcut starts the exe directly (no launcher, no arguments, read-only);
//      app\homologation.json is read-only and its db/sources/webviewDir are outside every human folder; launch.ps1 -CheckOnly (hash/identity);
//   2. installs a DISPOSABLE COPY with the real installer (scripts/homologation-install.mjs --dest <scratch>\inst --no-shortcut --provider FAKE,
//      data folder in scratch via SMARTLEARN_HOMOLOGACAO_DATA_DIR), outside SmartLearn-Homologacao, SmartLearn-DevData and com.devulsky.smartlearn;
//   3. opens <scratch>\inst\app\smartlearn.exe DIRECTLY (no launcher, no shortcut, no SMARTLEARN_* variable in its environment) and checks:
//      window title, exe + served content = the manifest, no visible Node console, backend ready, data only in the scratch folder (so the
//      file, not the environment, decided it), create + read data over the real HTTP API, graceful close, reopen, the data is still there,
//      the database file itself holds it;
//   4. fail closed: a second copy WITHOUT app\homologation.json (but with ..\manifest.json) must refuse to open: no app window, no backend,
//      no data. The exe reports the refusal in a message box (lib.rs report_startup_refusal); the probe closes it and expects exit code 1;
//   5. nothing the snapshot listed changed, the real install (exe, homologation.json, manifest, launcher, shortcut) is byte-identical, and the
//      scratch folder is deleted.
// It never opens, reads or writes a human database or the real homologation data: it only stats files. The decisions live in
// scripts/homologation-proof-lib.mjs (unit-tested without windows by test/homologation-proof.test.js).
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { failClosedProblems, homologationFileProblems, humanRootsOf, inside, installerArgs, installerEnv, lc, scratchLayout, scratchRootProblems, shortcutProblems, withoutSmartlearnEnv } from './homologation-proof-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const SYSTEM32 = join(SYSTEM_ROOT, 'System32');
const POWERSHELL_EXE = join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const ATTRIB_EXE = join(SYSTEM32, 'attrib.exe');
const TASKKILL_EXE = join(SYSTEM32, 'taskkill.exe');
const ps = (script, env) => execFileSync(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}\nexit 0`, 'utf16le').toString('base64')], { encoding: 'utf8', maxBuffer: 1 << 24, ...(env ? { env } : {}) }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const readOnlyFile = (file) => (statSync(file).mode & 0o200) === 0;
const OWN_SHORTCUT = /Homologa/i;

// ---------- snapshot of everything that must NOT change ----------
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else { const s = statSync(full); out.push({ file: full, size: s.size, mtimeMs: Math.round(s.mtimeMs) }); }
  }
  return out;
}

const humanRoots = humanRootsOf({ home: homedir(), appData: process.env.APPDATA, localAppData: process.env.LOCALAPPDATA });

function takeSnapshot() {
  const shortcuts = JSON.parse(ps(`
$shell = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('Programs'))
$out = foreach ($d in $dirs) { if ($d -and (Test-Path $d)) { Get-ChildItem $d -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'SmartLearn' } | ForEach-Object {
  $s = $shell.CreateShortcut($_.FullName)
  [pscustomobject]@{ path = $_.FullName; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(); target = $s.TargetPath; arguments = $s.Arguments; workingDirectory = $s.WorkingDirectory } } } }
ConvertTo-Json -InputObject @($out) -Depth 3`) || '[]').filter((s) => !OWN_SHORTCUT.test(s.path));
  const targets = shortcuts.filter((s) => /\.exe$/i.test(s.target) && existsSync(s.target)).map((s) => ({ target: s.target, size: statSync(s.target).size, sha256: sha256(s.target) }));
  return { takenAt: new Date().toISOString(), shortcuts, targets, humanData: Object.fromEntries(humanRoots.map((d) => [d, walk(d)])) };
}

function diffSnapshots(before, after) {
  const changes = [];
  changes.push(...changedShortcuts(before.shortcuts, after.shortcuts));
  changes.push(...changedTargets(before.targets, after.targets));
  changes.push(...changedHumanData(before.humanData, after.humanData));
  return changes;
}

function changedShortcuts(before, after) {
  const byPath = new Map(after.map((shortcut) => [shortcut.path, shortcut]));
  return before.filter((shortcut) => JSON.stringify(byPath.get(shortcut.path)) !== JSON.stringify(shortcut))
    .map((shortcut) => `shortcut changed or removed: ${shortcut.path}`);
}

function changedTargets(before, after) {
  const byTarget = new Map(after.map((target) => [target.target, target]));
  return before.filter((target) => JSON.stringify(byTarget.get(target.target)) !== JSON.stringify(target))
    .map((target) => `shortcut target changed: ${target.target}`);
}

function changedHumanData(before, after) {
  const changes = [];
  for (const [dir, files] of Object.entries(before)) {
    const current = new Map((after[dir] ?? []).map((file) => [file.file, file]));
    for (const file of files) {
      const currentFile = current.get(file.file);
      if (!currentFile || currentFile.size !== file.size || currentFile.mtimeMs !== file.mtimeMs) changes.push(`human data changed: ${file.file}`);
    }
    for (const file of current.keys()) if (!files.some((original) => original.file === file)) changes.push(`human data file appeared: ${file}`);
  }
  return changes;
}

if (process.argv[2] === 'snapshot') {
  const out = arg('snapshot') ?? process.argv[3];
  const snap = takeSnapshot();
  writeFileSync(out, JSON.stringify(snap, null, 2));
  console.log(JSON.stringify({ ok: true, file: out, shortcuts: snap.shortcuts.length, targets: snap.targets.length, humanFiles: Object.fromEntries(Object.entries(snap.humanData).map(([d, f]) => [d, f.length])) }));
  process.exit(0);
}

// ---------- the real run ----------
const dest = resolve(arg('--dest') ?? 'C:\\Projetos\\SmartLearn-Homologacao');
const beforeFile = arg('--before');
const results = [];
function formatCheck(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  if (detail === undefined) return `${status} ${name}`;
  const renderedDetail = typeof detail === 'string' ? detail : JSON.stringify(detail);
  return `${status} ${name} :: ${renderedDetail}`;
}
const check = (name, ok, detail) => {
    results.push({ name, ok: Boolean(ok), detail: detail ?? null });
    console.log(formatCheck(name, ok, detail));
    return ok;
  };

const manifest = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
const realApp = join(dest, 'app');
const realExe = join(realApp, 'smartlearn.exe');
const realCfgPath = join(realApp, 'homologation.json');
const sourceExe = resolve(arg('--exe') ?? realExe);
const shortcutPath = ps(`Join-Path ([Environment]::GetFolderPath('Desktop')) ('SmartLearn Homologa' + [char]0xE7 + [char]0xE3 + 'o.lnk')`);
const L = scratchLayout(resolve(arg('--scratch') ?? join(homedir(), 'SmartLearn-Prova-Descartavel')));  // removed at the end, never the real data
const instApp = join(L.inst, 'app');
const instExe = join(instApp, 'smartlearn.exe');
const noFileExe = join(L.instNoFile, 'app', 'smartlearn.exe');

function readJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }
const realCfg = readJson(realCfgPath);
// The real install is never opened or deleted; the scratch root must not overlap it, its data, or any human folder.
const protectedPaths = [dest, join(homedir(), 'SmartLearn-Homologacao-Data'), realCfg?.db ? dirname(realCfg.db) : null, realCfg?.webviewDir ? dirname(realCfg.webviewDir) : null];
const rootProblems = scratchRootProblems(L.root, humanRoots, protectedPaths);
if (rootProblems.length) { console.error(`PROOF REFUSED: ${rootProblems.join('; ')}`); process.exit(2); }

/** Deletes the scratch root (read-only flags removed first). Guarded again here: it is the only recursive delete of the proof. */
function wipeScratch() {
  if (scratchRootProblems(L.root, humanRoots, protectedPaths).length) throw new Error(`refusing to delete ${L.root}`);
  if (!existsSync(L.root)) return;
  try { execFileSync(ATTRIB_EXE, ['-R', join(L.root, '*'), '/S', '/D'], { stdio: 'ignore' }); } catch { /* nothing read-only */ }
  rmSync(L.root, { recursive: true, force: true });
}

/** sha256 of everything that makes up the REAL install and its shortcut: the proof must leave all of it byte-identical. */
function realInstallFingerprint() {
  const files = [realExe, realCfgPath, join(dest, 'manifest.json'), join(dest, 'launch.ps1'), shortcutPath];
  return Object.fromEntries(files.map((f) => [f, existsSync(f) ? sha256(f) : 'absent']));
}

function appProcess(exePath) {
  const out = ps(`Get-Process -Name smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq '${exePath.replace(/'/g, "''")}' } | Select-Object -First 1 | ForEach-Object { "$($_.Id)|$($_.MainWindowTitle)|$($_.MainWindowHandle)" }`);
  if (!out) return null;
  const [pid, title, handle] = out.split('|');
  return { pid: Number(pid), title, handle };
}

/** Starts the exe itself: no launcher, no shortcut, and not one SMARTLEARN_* variable, so homologation.json alone decides. */
const CDP_PORT = 9347;  // WebView2 debugging endpoint of the DISPOSABLE copy only: lets the proof drive the real login form like a person would
function startDirect(exePath) {
  const env = { ...withoutSmartlearnEnv(process.env), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}` };
  const child = spawn(exePath, [], { cwd: dirname(dirname(exePath)), env, stdio: 'ignore' });
  const state = { exited: false, exitCode: null };
  child.on('exit', (code) => { state.exited = true; state.exitCode = code; });
  child.on('error', () => { state.exited = true; });
  return { child, state, smartlearnEnvVars: Object.keys(env).filter((k) => /^smartlearn_/i.test(k)) };
}


/** Attaches to the window of the disposable copy through CDP and returns its page; waits until the app UI is up. */
async function attachWindow() {
  const until = Date.now() + 45000;
  let lastError;
  while (Date.now() < until) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      const page = browser.contexts().flatMap((c) => c.pages()).find((p) => /127\.0\.0\.1|localhost/.test(p.url()));
      if (page) { await page.waitForSelector('[data-screen="account"]', { timeout: 20000 }); return { browser, page }; }
      await browser.close();
    } catch (e) { lastError = e; }
    await sleep(700);
  }
  throw new Error(`could not attach to the app window over CDP port ${CDP_PORT}: ${lastError?.message ?? 'no page'}`);
}

/** Opens Conta in the real window and reports what a person sees: the login form or the logged-in view. */
async function accountState(page) {
  await page.locator('[data-screen="account"]:visible').first().click();
  await page.waitForFunction(() => ['#account-logged-in-view', '#account-login-email'].some((sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0; }), null, { timeout: 15000 });
  return (await page.locator('#account-logged-in-view').isVisible()) ? 'logged-in' : 'login-form';
}

async function openDirect(exePath) {
  if (appProcess(exePath)) throw new Error(`the disposable copy is already open: ${exePath}`);
  const started = startDirect(exePath);
  const until = Date.now() + 60000;
  let app = null;
  while (Date.now() < until) {
    const current = appProcess(exePath);
    if (current) { app = current; break; }
    await sleep(500);
  }
  if (!app) throw new Error('the disposable copy did not start within 60 s (a refusal message box would still show a process)');
  const untilWindow = Date.now() + 30000;
  while (Date.now() < untilWindow && (!app.title || app.handle === '0')) { await sleep(500); app = appProcess(exePath) ?? app; }
  return { app, started };
}

function backendOf(pid) {
  const rows = ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid} AND Name='node.exe'" | ForEach-Object { $h = (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle; "$($_.ProcessId)|$($_.ExecutablePath)|$h" }`);
  return rows.split(/\r?\n/).filter(Boolean).map((r) => { const [p, path, handle] = r.split('|'); return { pid: Number(p), path, handle }; });
}

function visibleWindows(match) {
  return ps(`& '${join(ROOT, 'scripts', 'list-visible-windows.ps1').replace(/'/g, "''")}' -Match '${match}'`).split(/\r?\n/).filter(Boolean);
}

// Independent of MainWindowHandle (0 for a console app even when its console IS on screen): enumerate EVERY visible top-level window of the system
// and keep the ones owned by the backend, or by a console host (conhost/OpenConsole) the backend is the parent of.
function consoleWindowsOf(backendPids) {
  return visibleWindows('node|conhost|OpenConsole|cmd|WindowsTerminal').filter((r) => { const [pid, , , , ppid] = r.split('|'); return backendPids.includes(Number(pid)) || backendPids.includes(Number(ppid.replace('ppid=', ''))); });
}

async function backendPort(nodePid, dataDir) {
  // The app remembers its backend port next to the database (stable origin for the WebView's localStorage). Process-to-socket ownership is not
  // reliable from a sandboxed shell (owner 0), so the port comes from that file and the identity is then proven over HTTP (/health/build).
  const portFile = join(dataDir, 'smartlearn-homologacao.port');
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    try {
      const port = Number(readFileSync(portFile, 'utf8').trim());
      if (Number.isInteger(port) && port > 0 && (await fetch(`http://127.0.0.1:${port}/health/live`)).ok) return port;
    } catch { /* not written / not up yet */ }
    await sleep(500);
  }
  throw new Error(`the backend (pid ${nodePid}) did not answer on the port recorded in ${portFile}`);
}

async function waitReady(base) {
  const until = Date.now() + 30000;
  while (Date.now() < until) { try { if ((await fetch(`${base}/health/ready`)).status === 200) return true; } catch { /* not yet */ } await sleep(400); }
  return false;
}

function client(base) {
  let cookie = '';
  let csrf = '';
  const call = async (method, path, body) => {
    const headers = { Origin: base, 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (csrf && !path.startsWith('/v1/auth/login') && !path.startsWith('/v1/auth/register')) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  };
  return { call, async login(email, password) { await call('POST', '/v1/auth/login', { email, password }); csrf = (await call('GET', '/v1/auth/me')).csrfToken; } };
}

async function closeGracefully(app, exePath) {
  const children = backendOf(app.pid).map((c) => c.pid);
  try { execFileSync(TASKKILL_EXE, ['/PID', String(app.pid)], { stdio: 'ignore' }); } catch { /* window may refuse */ }
  const until = Date.now() + 25000;
  while (Date.now() < until && appProcess(exePath)) await sleep(400);
  const how = appProcess(exePath) ? 'forced' : 'graceful';
  if (how === 'forced') { try { execFileSync(TASKKILL_EXE, ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(2500);
  const left = children.filter((p) => ps(`Get-Process -Id ${p} -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }`));
  for (const p of left) { try { execFileSync(TASKKILL_EXE, ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  return { how, backendChildren: children.length, leftoversKilled: left.length };
}

/**
 * Fail-closed probe: opens the copy that has ..\manifest.json but NO app\homologation.json and records what happens for up to ~15 s.
 * Safety net: if the guard were broken the app would fall back to the Oficial/DEV behaviour, so the data variables point into the scratch
 * folder (the guard refuses before reading them, so a correct build never sees them). The probe always ends with the process gone.
 */
function observeFailClosedApp(exePath, observation) {
  const app = appProcess(exePath);
  if (!app) return;
  observation.polls += 1;
  const rows = visibleWindows('smartlearn').filter((row) => Number(row.split('|')[0]) === app.pid);
  for (const row of rows) {
    const title = row.split('|').find((part) => part.startsWith('title='))?.slice(6) ?? '';
    if (!observation.windows.includes(title)) observation.windows.push(title);
    if (/^SmartLearn HOMOLOGACAO - /.test(title)) observation.sawAppWindow = true;
    if (title === 'SmartLearn Homologacao') observation.messageBox = true;
  }
  if (backendOf(app.pid).length) observation.sawBackend = true;
}

async function closeFailClosedProbe(child, state, observation) {
  observation.wasAliveAfterWindow = !state.exited;
  if (!state.exited) {
    try { execFileSync(TASKKILL_EXE, ['/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* already gone */ }
    const closeBy = Date.now() + 10000;
    while (Date.now() < closeBy && !state.exited) await sleep(300);
  }
  observation.stillAliveAfterClose = !state.exited;
  if (observation.stillAliveAfterClose) {
    try { execFileSync(TASKKILL_EXE, ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    await sleep(1500);
  }
  observation.exitCode = state.exitCode;
}

async function probeFailClosed(exePath, dataDir) {
  const env = withoutSmartlearnEnv(process.env, { SMARTLEARN_DB_PATH: join(dataDir, 'smartlearn-homologacao.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), SMARTLEARN_WEBVIEW_DATA_DIR: join(dataDir, 'webview'), SMARTLEARN_AI_PROVIDER: 'FAKE' });
  const child = spawn(exePath, [], { cwd: dirname(dirname(exePath)), env, stdio: 'ignore' });
  const state = { exited: false, exitCode: null };
  child.on('exit', (code) => { state.exited = true; state.exitCode = code; });
  child.on('error', () => { state.exited = true; });
  const obs = { sawAppWindow: false, sawBackend: false, messageBox: false, windows: [], polls: 0 };
  const until = Date.now() + 15000;
  while (Date.now() < until && !state.exited) {
    observeFailClosedApp(exePath, obs);
    await sleep(400);
  }
  // end the probe: close the refusal box like a person would (WM_CLOSE); anything still there afterwards survived its refusal
  await closeFailClosedProbe(child, state, obs);
  obs.dataCreated = existsSync(dataDir) ? walk(dataDir).map((f) => f.file) : [];
  if (existsSync(dataDir) && !obs.dataCreated.length) obs.dataCreated = [`${dataDir} (folder)`];
  return obs;
}

async function main() {
  const before = beforeFile ? JSON.parse(readFileSync(beforeFile, 'utf8')) : null;
  const realBefore = realInstallFingerprint();
  let scratchCfg;
  let scratchManifest;
  let email;
  let password;
  let subjectId;
  let app;
  let t0;
  let dbFile;

  await (async () => {
  // ---- (1) the REAL install, statically: nothing of it is opened ----
  check('shortcut exists', existsSync(shortcutPath), shortcutPath);
  const sc = existsSync(shortcutPath)
    ? JSON.parse(ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); ConvertTo-Json @{ target = $s.TargetPath; arguments = $s.Arguments; wd = $s.WorkingDirectory }`))
    : { target: null, arguments: null, wd: null };
  sc.readOnly = existsSync(shortcutPath) ? readOnlyFile(shortcutPath) : false;
  const scProblems = shortcutProblems(sc, { dest, exe: realExe });
  check('real shortcut starts the installed exe directly: target = <dest>\\app\\smartlearn.exe, no arguments, working dir = dest, read-only', scProblems.length === 0, scProblems.length ? scProblems : sc);

  const cfgProblems = realCfg
    ? homologationFileProblems(realCfg, { humanRoots, appDir: realApp, manifest, readOnly: readOnlyFile(realCfgPath) })
    : [`${realCfgPath} is missing or not valid JSON`];
  check('real app\\homologation.json is read-only, matches the manifest, and its db/sources/webviewDir are outside every human folder (no database opened)', cfgProblems.length === 0, cfgProblems.length ? cfgProblems : { db: realCfg.db, sources: realCfg.sources, webviewDir: realCfg.webviewDir, provider: realCfg.provider });

  // the launcher stays as hash/identity verifier: nothing is started, nothing is created; env cleaned so its defaults are the real ones
  const defaults = JSON.parse(ps(`& '${join(dest, 'launch.ps1').replace(/'/g, "''")}' -CheckOnly`, withoutSmartlearnEnv(process.env)));
  check('launcher default datastore is its own folder and no human data path is inside or contains it', [defaults.database, defaults.sources, defaults.dataDir].every((p) => !humanRoots.some((h) => inside(p, h) || inside(h, p))), { dataDir: defaults.dataDir });
  check('launcher check (-CheckOnly): exe hash and served content equal the manifest', defaults.exeSha256 === manifest.exeSha256 && defaults.inputsHash === manifest.inputsHash, { exeSha256: defaults.exeSha256.slice(0, 12), content: defaults.inputsHash.slice(0, 12) });
  })();

  await (async () => {
  // ---- (2) the disposable copies, installed by the real installer ----
  wipeScratch();
  const install = spawnSync(process.execPath, installerArgs({ script: join(ROOT, 'scripts', 'homologation-install.mjs'), exe: sourceExe, dest: L.inst }), { cwd: ROOT, encoding: 'utf8', env: installerEnv(process.env, L.data), timeout: 300000 });
  if (install.status !== 0) throw new Error(`the installer refused the disposable copy: ${install.stdout}${install.stderr}`);
  scratchCfg = readJson(join(instApp, 'homologation.json'));
  scratchManifest = readJson(join(L.inst, 'manifest.json'));
  const scratchProblems = [
    ...(scratchCfg ? homologationFileProblems(scratchCfg, { humanRoots, appDir: instApp, manifest: scratchManifest, readOnly: readOnlyFile(join(instApp, 'homologation.json')) }) : ['scratch homologation.json missing']),
    ...(scratchCfg?.provider !== 'FAKE' || scratchCfg?.consent ? [`provider ${scratchCfg?.provider} consent ${scratchCfg?.consent}: must be FAKE without consent`] : []),
    ...(scratchCfg && ![scratchCfg.db, scratchCfg.sources, scratchCfg.webviewDir].every((p) => inside(p, L.data)) ? ['scratch datastore is not inside the scratch data folder'] : []),
    ...(scratchManifest?.inputsHash !== manifest.inputsHash ? [`scratch content ${scratchManifest?.inputsHash} != real install ${manifest.inputsHash}`] : []),
    ...(sha256(instExe) !== sha256(sourceExe) ? ['scratch exe differs from its source'] : []),
  ];
  check('disposable copy installed by the real installer: own folder, FAKE provider without consent, data in scratch, same exe and content as the source', scratchProblems.length === 0, scratchProblems.length ? scratchProblems : { dest: L.inst, data: L.data });
  // second copy for the fail-closed probe, made BEFORE anything ever ran: same files, minus the isolation file
  cpSync(L.inst, L.instNoFile, { recursive: true });
  try { execFileSync(ATTRIB_EXE, ['-R', join(L.instNoFile, 'app', 'homologation.json')], { stdio: 'ignore' }); } catch { /* not there */ }
  rmSync(join(L.instNoFile, 'app', 'homologation.json'), { force: true });

  email = `prova-${Date.now()}@homologacao.test`;
  password = 'a genuinely long test password 1';
  })();

  await (async () => {
  // ---- (3) first open, DIRECTLY ----
  const first = await openDirect(instExe);
  app = first.app;
  t0 = Date.now();
  check('opened DIRECTLY (no launcher, no shortcut, no SMARTLEARN_* in its environment): process path is the disposable exe', lc(instExe) === lc(ps(`(Get-Process -Id ${app.pid}).Path`)) && first.started.smartlearnEnvVars.length === 0, { pid: app.pid, smartlearnEnvVars: first.started.smartlearnEnvVars });
  check('window title names the Homologacao build, as homologation.json says', /^SmartLearn HOMOLOGACAO - v\S+ - \S+$/.test(app.title) && app.title === scratchCfg.windowTitle, app.title);
  const backend = backendOf(app.pid);
  check('backend is the installed node-runtime child', backend.length >= 1 && backend.every((b) => lc(b.path).startsWith(lc(instApp))), backend.map((b) => b.path));
  check('NO visible Node console: every backend window handle is 0', backend.length >= 1 && backend.every((b) => b.handle === '0'), backend.map((b) => b.handle));
  const consoles1 = consoleWindowsOf(backend.map((b) => b.pid));
  check('NO console window on screen for the backend (all visible windows of the system enumerated)', consoles1.length === 0, consoles1.length ? consoles1 : 'none');
  const port = await backendPort(backend[0].pid, L.data);
  const base = `http://127.0.0.1:${port}`;
  check('backend ready', await waitReady(base), base);
  const build = await (await fetch(`${base}/health/build`)).json();
  check('served build = installed manifest (content hash and commit)', build.content === scratchManifest.inputsHash && build.content === manifest.inputsHash && String(build.head) === scratchManifest.commit, { content: String(build.content).slice(0, 12), head: build.head, mode: build.mode, provider: build.provider });
  check('provider is the free FAKE one, from homologation.json alone (no paid call possible)', build.provider === 'FAKE', build.provider);
  const staged = JSON.parse(readFileSync(join(instApp, 'dist-runtime', 'build-info.json'), 'utf8'));
  check('bundled frontend identity = manifest', staged.inputsHash === manifest.inputsHash, staged.inputsHash.slice(0, 12));
  dbFile = join(L.data, 'smartlearn-homologacao.db');
  check('database created in the scratch data folder named by homologation.json (no env was set), none anywhere human', existsSync(dbFile) && existsSync(join(L.data, 'sources')), dbFile);
  const profileFiles = walk(join(L.data, 'webview')).length;
  check('own WebView2 profile (cookies, storage) lives in the homologation data folder, not in the Oficial/DEV one', profileFiles > 0, { files: profileFiles });

  const api = client(base);
  await api.call('POST', '/v1/auth/register', { email, password });
  await api.login(email, password);
  const created = await api.call('POST', '/v1/subjects', { name: 'Farmacologia' });
  subjectId = created.subject.id;
  const list1 = await api.call('GET', '/v1/subjects');
  check('create + read over the real API', list1.subjects.some((s) => s.id === subjectId && s.name === 'Farmacologia'), { subjectId });

  // the REAL window: a fresh WebView2 profile has no session, so the login form is what a person sees; sign in through it (disposable account)
  const ui1 = await attachWindow();
  const stateBefore = await accountState(ui1.page);
  check('first open, real window: no session yet, the login form is shown', stateBefore === 'login-form', stateBefore);
  await ui1.page.locator('#account-login-email').fill(email);
  await ui1.page.locator('#account-login-password').fill(password);
  await ui1.page.locator('#account-login-form button[type="submit"]').click();
  await ui1.page.locator('#account-logged-in-view').waitFor({ state: 'visible', timeout: 15000 });
  check('first open, real window: signed in through the login form', await ui1.page.locator('#account-logged-in-view').isVisible(), email);
  const cookieMeta = await ui1.page.context().cookies();
  const sess = cookieMeta.find((c) => /^sl_session/.test(c.name));
  check('session cookie in the WebView2 profile is persistent (has an expiry), not a session cookie', Boolean(sess) && sess.expires > Date.now() / 1000 + 6 * 86400, sess ? { name: sess.name, expiresInDays: Math.round((sess.expires - Date.now() / 1000) / 864) / 100, httpOnly: sess.httpOnly } : 'no sl_session cookie');
  await ui1.browser.close();

  const closed1 = await closeGracefully(app, instExe);
  check('app closes by itself and leaves no backend behind', closed1.how === 'graceful' && closed1.leftoversKilled === 0, closed1);
  })();

  await (async () => {
  // ---- second open, DIRECTLY again ----
  app = (await openDirect(instExe)).app;
  const backend2 = backendOf(app.pid);
  check('second open: still no visible Node console', backend2.length >= 1 && backend2.every((b) => b.handle === '0'), backend2.map((b) => b.handle));
  const consoles2 = consoleWindowsOf(backend2.map((b) => b.pid));
  check('second open: NO console window on screen for the backend (all visible windows enumerated)', consoles2.length === 0, consoles2.length ? consoles2 : 'none');
  const base2 = `http://127.0.0.1:${await backendPort(backend2[0].pid, L.data)}`;
  check('second open: backend ready', await waitReady(base2), base2);
  // the decisive check: after closing and reopening the exe, the window is STILL signed in, with no password typed
  const ui2 = await attachWindow();
  const stateAfter = await accountState(ui2.page);
  check('REOPENED real window: still signed in, no login form, no password typed (session survived the close)', stateAfter === 'logged-in', stateAfter);
  const meAfter = await ui2.page.evaluate(async () => { const r = await fetch('/v1/auth/me', { credentials: 'include' }); return { status: r.status, body: r.ok ? await r.json() : null }; });
  check('reopened window: /v1/auth/me answers 200 for the same account', meAfter.status === 200 && JSON.stringify(meAfter.body).includes(email), meAfter.status);
  await ui2.browser.close();
  const api2 = client(base2);
  await api2.login(email, password);
  const list2 = await api2.call('GET', '/v1/subjects');
  check('data created before the restart is still there', list2.subjects.some((s) => s.id === subjectId && s.name === 'Farmacologia'), list2.subjects.map((s) => s.name));
  const closed2 = await closeGracefully(app, instExe);
  check('second close is clean', closed2.how === 'graceful' && closed2.leftoversKilled === 0, closed2);

  // the file itself
  const Database = createRequire(join(ROOT, 'server', 'package.json'))('better-sqlite3');
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  const rows = { users: db.prepare('SELECT COUNT(*) n FROM users').get().n, subjects: db.prepare("SELECT COUNT(*) n FROM subjects WHERE name = 'Farmacologia'").get().n, version: db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v, integrity: db.pragma('integrity_check', { simple: true }) };
  db.close();
  check('the scratch database file holds the data (v41, integrity ok)', rows.users === 1 && rows.subjects === 1 && rows.integrity === 'ok' && rows.version >= 41, rows);
  })();

  await (async () => {
  // ---- (4) fail closed: manifest.json present, homologation.json absent ----
  const layoutOk = existsSync(join(L.instNoFile, 'manifest.json')) && !existsSync(join(L.instNoFile, 'app', 'homologation.json'));
  const probe = await probeFailClosed(noFileExe, L.dataNoFile);
  const closedProblems = [...(layoutOk ? [] : ['probe layout wrong: needs ..\\manifest.json and no app\\homologation.json']), ...failClosedProblems(probe)];
  check('fail closed: a copy WITHOUT app\\homologation.json (but with ..\\manifest.json) refuses to open: no app window, no backend, no data, exits with code 1 once its refusal box is closed', closedProblems.length === 0, closedProblems.length ? { problems: closedProblems, ...probe } : { messageBox: probe.messageBox, windows: probe.windows, exitCode: probe.exitCode, exitedOnItsOwn: !probe.wasAliveAfterWindow });

  // ---- (5) nothing existing changed ----
  if (before) {
    const changes = diffSnapshots(before, takeSnapshot());
    check('Oficial/DEV shortcuts, their targets and the human data are unchanged (stat + hash)', changes.length === 0, changes.length ? changes : { shortcuts: before.shortcuts.length, humanFiles: Object.values(before.humanData).reduce((n, f) => n + f.length, 0) });
  } else check('before-snapshot supplied', false, 'pass --before <file>');
  const realAfter = realInstallFingerprint();
  const touched = Object.keys(realBefore).filter((f) => realBefore[f] !== realAfter[f]);
  check('the REAL install (exe, homologation.json, manifest, launcher, shortcut) is byte-identical after the proof', touched.length === 0, touched.length ? touched : Object.keys(realBefore).length);

  wipeScratch();
  check('disposable copies and their data are deleted', !existsSync(L.root), L.root);
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ result: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed: failed.map((f) => f.name), seconds: Math.round((Date.now() - t0) / 1000) }));
  process.exit(failed.length ? 1 : 0);
  })();
}

function killScratchProcesses() {
  for (const exePath of [instExe, noFileExe]) {
    try { const a = appProcess(exePath); if (a) execFileSync(TASKKILL_EXE, ['/PID', String(a.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* nothing */ }
  }
}

main().catch((error) => {
  console.error(`PROOF ERROR: ${error.stack ?? error}`);
  killScratchProcesses();
  try { wipeScratch(); } catch (cleanup) { console.error(`scratch cleanup failed: ${cleanup.message}`); }
  process.exit(2);
});
