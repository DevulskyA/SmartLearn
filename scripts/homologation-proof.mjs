#!/usr/bin/env node
// Real-use proof of the installed "SmartLearn Homologacao" shortcut, with free test data and no paid AI.
//
//   node scripts/homologation-proof.mjs snapshot <file>            metadata of every existing SmartLearn shortcut, its target and the human data (stat only)
//   node scripts/homologation-proof.mjs run --before <file> [--dest C:\Projetos\SmartLearn-Homologacao]
//
// `run` opens the app THROUGH the .lnk (provider FAKE, data in a scratch folder the launcher checks like the default one), then checks:
// window title, exe + served content = the manifest, no visible Node console, backend ready, data only in the homologation folder,
// create + read data over the real HTTP API, graceful close, reopen THROUGH the shortcut, the data is still there, the database file itself
// holds it, and nothing the snapshot listed changed. It never opens, reads or writes a human database: it only stats files.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}\nexit 0`, 'utf16le').toString('base64')], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const lc = (p) => resolve(p).toLowerCase();
const inside = (p, root) => lc(p) === lc(root) || lc(p).startsWith(`${lc(root)}\\`);
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

function takeSnapshot() {
  const shortcuts = JSON.parse(ps(`
$shell = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('Programs'))
$out = foreach ($d in $dirs) { if ($d -and (Test-Path $d)) { Get-ChildItem $d -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'SmartLearn' } | ForEach-Object {
  $s = $shell.CreateShortcut($_.FullName)
  [pscustomobject]@{ path = $_.FullName; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(); target = $s.TargetPath; arguments = $s.Arguments; workingDirectory = $s.WorkingDirectory } } } }
ConvertTo-Json -InputObject @($out) -Depth 3`) || '[]').filter((s) => !OWN_SHORTCUT.test(s.path));
  const targets = shortcuts.filter((s) => /\.exe$/i.test(s.target) && existsSync(s.target)).map((s) => ({ target: s.target, size: statSync(s.target).size, sha256: sha256(s.target) }));
  const humanDirs = [join(homedir(), 'SmartLearn-DevData'), join(process.env.APPDATA ?? '', 'com.devulsky.smartlearn'), join(process.env.LOCALAPPDATA ?? '', 'com.devulsky.smartlearn')];
  return { takenAt: new Date().toISOString(), shortcuts, targets, humanData: Object.fromEntries(humanDirs.map((d) => [d, walk(d)])) };
}

function diffSnapshots(before, after) {
  const changes = [];
  const key = (x) => JSON.stringify(x);
  const byPath = new Map(after.shortcuts.map((s) => [s.path, s]));
  for (const s of before.shortcuts) if (key(byPath.get(s.path)) !== key(s)) changes.push(`shortcut changed or removed: ${s.path}`);
  const byTarget = new Map(after.targets.map((t) => [t.target, t]));
  for (const t of before.targets) if (key(byTarget.get(t.target)) !== key(t)) changes.push(`shortcut target changed: ${t.target}`);
  for (const [dir, files] of Object.entries(before.humanData)) {
    const now = new Map((after.humanData[dir] ?? []).map((f) => [f.file, f]));
    for (const f of files) { const g = now.get(f.file); if (!g || g.size !== f.size || g.mtimeMs !== f.mtimeMs) changes.push(`human data changed: ${f.file}`); }
    for (const f of now.keys()) if (!files.some((x) => x.file === f)) changes.push(`human data file appeared: ${f}`);
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
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail: detail ?? null }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); return ok; };

const manifest = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
const exe = join(dest, 'app', 'smartlearn.exe');
const shortcutPath = ps(`Join-Path ([Environment]::GetFolderPath('Desktop')) ('SmartLearn Homologa' + [char]0xE7 + [char]0xE3 + 'o.lnk')`);
const scratch = join(homedir(), 'SmartLearn-Homologacao-Prova');  // inside the profile like the default; removed at the end
const humanRoots = [join(homedir(), 'SmartLearn-DevData'), join(process.env.APPDATA ?? '', 'com.devulsky.smartlearn'), join(process.env.LOCALAPPDATA ?? '', 'com.devulsky.smartlearn')];

function appProcess() {
  const out = ps(`Get-Process -Name smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq '${exe.replace(/'/g, "''")}' } | Select-Object -First 1 | ForEach-Object { "$($_.Id)|$($_.MainWindowTitle)|$($_.MainWindowHandle)" }`);
  if (!out) return null;
  const [pid, title, handle] = out.split('|');
  return { pid: Number(pid), title, handle };
}

async function openThroughShortcut(dataDir) {
  if (appProcess()) throw new Error('the Homologacao is already open; close it before the proof');
  const env = { ...process.env, SMARTLEARN_AI_PROVIDER: 'FAKE', SMARTLEARN_HOMOLOGACAO_DATA_DIR: dataDir };
  delete env.SMARTLEARN_DEV_DATA_DIR; delete env.SMARTLEARN_DB_PATH; delete env.SMARTLEARN_SOURCES_DIR;
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${shortcutPath.replace(/'/g, "''")}'`], { env, stdio: 'ignore', windowsHide: true }).unref();
  const until = Date.now() + 60000;
  let app = null;
  while (Date.now() < until && !(app = appProcess())) await sleep(500);
  if (!app) throw new Error('the shortcut did not start the installed executable within 60 s');
  const untilWindow = Date.now() + 30000;
  while (Date.now() < untilWindow && (!app.title || app.handle === '0')) { await sleep(500); app = appProcess() ?? app; }
  return app;
}

function backendOf(pid) {
  const rows = ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid} AND Name='node.exe'" | ForEach-Object { $h = (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle; "$($_.ProcessId)|$($_.ExecutablePath)|$h" }`);
  return rows.split(/\r?\n/).filter(Boolean).map((r) => { const [p, path, handle] = r.split('|'); return { pid: Number(p), path, handle }; });
}

// Independent of MainWindowHandle (0 for a console app even when its console IS on screen): enumerate EVERY visible top-level window of the system
// and keep the ones owned by the backend, or by a console host (conhost/OpenConsole) the backend is the parent of.
function consoleWindowsOf(backendPids) {
  const rows = ps(`& '${join(ROOT, 'scripts', 'list-visible-windows.ps1').replace(/'/g, "''")}' -Match 'node|conhost|OpenConsole|cmd|WindowsTerminal'`).split(/\r?\n/).filter(Boolean);
  return rows.filter((r) => { const [pid, , , , ppid] = r.split('|'); return backendPids.includes(Number(pid)) || backendPids.includes(Number(ppid.replace('ppid=', ''))); });
}

async function backendPort(nodePid, scratchDir = scratch) {
  // The app remembers its backend port next to the database (stable origin for the WebView's localStorage). Process-to-socket ownership is not
  // reliable from a sandboxed shell (owner 0), so the port comes from that file and the identity is then proven over HTTP (/health/build).
  const portFile = join(scratchDir, 'smartlearn-homologacao.port');
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

async function closeGracefully(app) {
  const children = backendOf(app.pid).map((c) => c.pid);
  try { execFileSync('taskkill', ['/PID', String(app.pid)], { stdio: 'ignore' }); } catch { /* window may refuse */ }
  const until = Date.now() + 25000;
  while (Date.now() < until && appProcess()) await sleep(400);
  const how = appProcess() ? 'forced' : 'graceful';
  if (how === 'forced') { try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(2500);
  const left = children.filter((p) => ps(`Get-Process -Id ${p} -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }`));
  for (const p of left) { try { execFileSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  return { how, backendChildren: children.length, leftoversKilled: left.length };
}

async function main() {
  const before = beforeFile ? JSON.parse(readFileSync(beforeFile, 'utf8')) : null;
  check('shortcut exists with its own target and working directory', existsSync(shortcutPath), shortcutPath);
  const sc = JSON.parse(ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); ConvertTo-Json @{ target = $s.TargetPath; arguments = $s.Arguments; wd = $s.WorkingDirectory }`));
  check('shortcut points to the installed launcher, working dir is the install dir', sc.arguments.toLowerCase().includes(join(dest, 'launch.ps1').toLowerCase()) && lc(sc.wd) === lc(dest), sc);

  // default data location, from the launcher itself: nothing is started, nothing is created
  const defaults = JSON.parse(ps(`& '${join(dest, 'launch.ps1').replace(/'/g, "''")}' -CheckOnly`));
  check('default datastore is its own folder and no human data path is inside or contains it', [defaults.database, defaults.sources, defaults.dataDir].every((p) => !humanRoots.some((h) => inside(p, h) || inside(h, p))), { dataDir: defaults.dataDir });
  check('launcher check: exe hash and served content equal the manifest', defaults.exeSha256 === manifest.exeSha256 && defaults.inputsHash === manifest.inputsHash, { exeSha256: defaults.exeSha256.slice(0, 12), content: defaults.inputsHash.slice(0, 12) });

  rmSync(scratch, { recursive: true, force: true });
  const email = `prova-${Date.now()}@homologacao.test`;
  const password = 'a genuinely long test password 1';
  let subjectId;

  // first open, through the shortcut
  let app = await openThroughShortcut(scratch);
  const t0 = Date.now();
  check('opened THROUGH the shortcut: process path is the installed executable', lc(exe) === lc(ps(`(Get-Process -Id ${app.pid}).Path`)), { pid: app.pid });
  check('window title names the Homologacao build', /^SmartLearn HOMOLOGACAO - v\S+ - \S+$/.test(app.title), app.title);
  const backend = backendOf(app.pid);
  check('backend is the installed node-runtime child', backend.length >= 1 && backend.every((b) => lc(b.path).startsWith(lc(join(dest, 'app')))), backend.map((b) => b.path));
  check('NO visible Node console: every backend window handle is 0', backend.length >= 1 && backend.every((b) => b.handle === '0'), backend.map((b) => b.handle));
  const consoles1 = consoleWindowsOf(backend.map((b) => b.pid));
  check('NO console window on screen for the backend (all visible windows of the system enumerated)', consoles1.length === 0, consoles1.length ? consoles1 : 'none');
  const port = await backendPort(backend[0].pid);
  const base = `http://127.0.0.1:${port}`;
  check('backend ready', await waitReady(base), base);
  const build = await (await fetch(`${base}/health/build`)).json();
  check('served build = installed manifest (content hash and commit)', build.content === manifest.inputsHash && String(build.head) === manifest.commit, { content: String(build.content).slice(0, 12), head: build.head, mode: build.mode, provider: build.provider });
  check('provider is the free FAKE one (no paid call possible)', build.provider === 'FAKE', build.provider);
  const staged = JSON.parse(readFileSync(join(dest, 'app', 'dist-runtime', 'build-info.json'), 'utf8'));
  check('bundled frontend identity = manifest', staged.inputsHash === manifest.inputsHash, staged.inputsHash.slice(0, 12));
  const dbFile = join(scratch, 'smartlearn-homologacao.db');
  check('database created in the homologation data folder, none anywhere human', existsSync(dbFile) && existsSync(join(scratch, 'sources')), dbFile);
  const profileFiles = walk(join(scratch, 'webview')).length;
  check('own WebView2 profile (cookies, storage) lives in the homologation folder, not in the Oficial/DEV one', profileFiles > 0, { files: profileFiles });

  const api = client(base);
  await api.call('POST', '/v1/auth/register', { email, password });
  await api.login(email, password);
  const created = await api.call('POST', '/v1/subjects', { name: 'Farmacologia' });
  subjectId = created.subject.id;
  const list1 = await api.call('GET', '/v1/subjects');
  check('create + read over the real API', list1.subjects.some((s) => s.id === subjectId && s.name === 'Farmacologia'), { subjectId });

  const closed1 = await closeGracefully(app);
  check('app closes by itself and leaves no backend behind', closed1.how === 'graceful' && closed1.leftoversKilled === 0, closed1);

  // second open, through the shortcut again
  app = await openThroughShortcut(scratch);
  const backend2 = backendOf(app.pid);
  check('second open: still no visible Node console', backend2.length >= 1 && backend2.every((b) => b.handle === '0'), backend2.map((b) => b.handle));
  const consoles2 = consoleWindowsOf(backend2.map((b) => b.pid));
  check('second open: NO console window on screen for the backend (all visible windows enumerated)', consoles2.length === 0, consoles2.length ? consoles2 : 'none');
  const base2 = `http://127.0.0.1:${await backendPort(backend2[0].pid)}`;
  check('second open: backend ready', await waitReady(base2), base2);
  const api2 = client(base2);
  await api2.login(email, password);
  const list2 = await api2.call('GET', '/v1/subjects');
  check('data created before the restart is still there', list2.subjects.some((s) => s.id === subjectId && s.name === 'Farmacologia'), list2.subjects.map((s) => s.name));
  const closed2 = await closeGracefully(app);
  check('second close is clean', closed2.how === 'graceful' && closed2.leftoversKilled === 0, closed2);

  // the file itself
  const Database = createRequire(join(ROOT, 'server', 'package.json'))('better-sqlite3');
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  const rows = { users: db.prepare('SELECT COUNT(*) n FROM users').get().n, subjects: db.prepare("SELECT COUNT(*) n FROM subjects WHERE name = 'Farmacologia'").get().n, version: db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v, integrity: db.pragma('integrity_check', { simple: true }) };
  db.close();
  check('the homologation database file holds the data (v41, integrity ok)', rows.users === 1 && rows.subjects === 1 && rows.integrity === 'ok' && rows.version >= 41, rows);

  // nothing existing changed
  if (before) {
    const changes = diffSnapshots(before, takeSnapshot());
    check('Oficial/DEV shortcuts, their targets and the human data are unchanged (stat + hash)', changes.length === 0, changes.length ? changes : { shortcuts: before.shortcuts.length, humanFiles: Object.values(before.humanData).reduce((n, f) => n + f.length, 0) });
  } else check('before-snapshot supplied', false, 'pass --before <file>');

  rmSync(scratch, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ result: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed: failed.map((f) => f.name), seconds: Math.round((Date.now() - t0) / 1000) }));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(`PROOF ERROR: ${error.stack ?? error}`); try { const a = appProcess(); if (a) execFileSync('taskkill', ['/PID', String(a.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* nothing */ } process.exit(2); });
