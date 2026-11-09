#!/usr/bin/env node
// Installs the candidate Desktop build as "SmartLearn Homologacao": its own folder, its own launcher, its own shortcut.
// Never touches the Oficial/DEV shortcuts, their executables or their data. Refuses a binary that does not serve the current content.
//
//   node scripts/homologation-install.mjs --exe <path to smartlearn.exe> [--dest C:\Projetos\SmartLearn-Homologacao] [--no-shortcut]
//
// The folder it writes is self-contained (no git, no npm): app\ (exe + dist-runtime + server-runtime + node-runtime + shared +
// homologation.json), launch.ps1 (scripts/launch-homologacao.ps1, kept as a verifier/alternative) and manifest.json (what was installed:
// content hash, exe sha256, commit). app\homologation.json is what makes app\smartlearn.exe open ISOLATED when run directly (own database,
// sources, WebView2 profile, title, provider/consent, build identity): src-tauri/src/lib.rs reads it at start-up.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const die = (message) => { console.error(`HOMOLOGATION INSTALL REFUSED: ${message}`); process.exit(1); };

export const DEFAULT_DEST = 'C:\\Projetos\\SmartLearn-Homologacao';
const SHORTCUT_NAME = `SmartLearn Homologa${'\u00e7\u00e3'}o.lnk`;
const RUNTIME_DIRS = ['dist-runtime', 'server-runtime', 'node-runtime', 'shared'];

const HOMOLOGATION_FILE = 'homologation.json';
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}\nexit 0`, 'utf16le').toString('base64')], { encoding: 'utf8' }).trim();

function main() {
  const exeArg = arg('--exe') ?? die('--exe <path to smartlearn.exe> is required');
  const exe = resolve(exeArg);
  const dest = resolve(arg('--dest') ?? DEFAULT_DEST);
  const provider = arg('--provider') ?? 'CODEX';
  if (!existsSync(exe)) die(`executable not found: ${exe}`);

  // 1. the identity guard: right checkout, allowed line of work
  if (spawnSync(process.execPath, [join(ROOT, 'scripts', 'work-target-guard.mjs')], { stdio: 'inherit' }).status !== 0) die('work-target-guard refused this checkout');

  // 2. the binary serves the current content (same check as the launcher and the journey)
  const identity = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-identity.mjs')], { cwd: ROOT, encoding: 'utf8' }));
  const check = spawnSync(process.execPath, [join(ROOT, 'scripts', 'desktop-identity.mjs'), exe, '--expected', identity.inputsHash], { encoding: 'utf8' });
  if (check.status !== 0) die(`the executable does not serve the current content: ${check.stdout}${check.stderr}`);

  // 3. never replace a running install
  const running = ps(`Get-Process -Name smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${dest.replace(/'/g, "''")}', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.Id }`);
  if (running) die(`the installed Homologacao is open (pid ${running.split(/\s+/)[0]}). Close it first.`);

  // 4. copy next to a temporary name, verify, then swap
  const exeDir = dirname(exe);
  const tmp = join(dest, 'app.new');
  const live = join(dest, 'app');
  mkdirSync(dest, { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  copyFileSync(exe, join(tmp, 'smartlearn.exe'));
  for (const dir of RUNTIME_DIRS) {
    if (!existsSync(join(exeDir, dir))) die(`resource folder missing next to the executable: ${join(exeDir, dir)}`);
    cpSync(join(exeDir, dir), join(tmp, dir), { recursive: true });
  }
  const copiedSha = sha256(join(tmp, 'smartlearn.exe'));
  if (copiedSha !== sha256(exe)) die('the copied executable differs from the source');
  const recheck = spawnSync(process.execPath, [join(ROOT, 'scripts', 'desktop-identity.mjs'), join(tmp, 'smartlearn.exe'), '--expected', identity.inputsHash], { encoding: 'utf8' });
  if (recheck.status !== 0) die(`the installed copy does not serve the current content: ${recheck.stdout}${recheck.stderr}`);
  // 4b. the isolation file, written next to the verified copy BEFORE the swap so exe and file arrive together (the identity check above
  // starts nothing, so the exe never saw it). The datastore is its own persistent folder, never reset; SMARTLEARN_HOMOLOGACAO_DATA_DIR
  // moves it (install proofs), exactly as it did for the launcher.
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dataDir = resolve(process.env.SMARTLEARN_HOMOLOGACAO_DATA_DIR || join(homedir(), 'SmartLearn-Homologacao-Data'));
  const homologation = {
    db: join(dataDir, 'smartlearn-homologacao.db'),
    sources: join(dataDir, 'sources'),
    webviewDir: join(dataDir, 'webview'),
    windowTitle: `SmartLearn HOMOLOGACAO - v${identity.version} - ${head}`,
    provider,
    // Paid-AI consent only for the real CODEX provider (owner decision 2026-11-08); lib.rs refuses consent with any other provider.
    consent: provider === 'CODEX',
    codexTimeoutMs: 1200000,
    buildMode: 'DEV',
    buildHead: head,
    buildContent: identity.inputsHash,
  };
  writeFileSync(join(tmp, HOMOLOGATION_FILE), JSON.stringify(homologation, null, 2));
  for (const folder of [dataDir, homologation.sources, homologation.webviewDir]) mkdirSync(folder, { recursive: true });
  if (existsSync(join(live, HOMOLOGATION_FILE))) execFileSync('attrib', ['-R', join(live, HOMOLOGATION_FILE)]);
  if (existsSync(live)) { rmSync(join(dest, 'app.old'), { recursive: true, force: true }); renameSync(live, join(dest, 'app.old')); }
  renameSync(tmp, live);
  rmSync(join(dest, 'app.old'), { recursive: true, force: true });

  // 5. launcher + manifest (read-only after install; unlocked here only so a reinstall can replace them)
  for (const f of ['launch.ps1', 'manifest.json']) if (existsSync(join(dest, f))) execFileSync('attrib', ['-R', join(dest, f)]);
  copyFileSync(join(ROOT, 'scripts', 'launch-homologacao.ps1'), join(dest, 'launch.ps1'));
  const manifest = { schema: 1, version: identity.version, commit: head, inputsHash: identity.inputsHash, exeSha256: copiedSha, sourceExe: exe, installedAt: new Date().toISOString() };
  writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 6. the shortcut: independent, targets the installed exe directly (no launcher, no arguments); refuses to overwrite a shortcut that is
  // not ours. "Ours" = the previous installer shortcut (its Arguments run this install's launch.ps1) or one already aimed at this exe.
  let shortcut = null;
  if (!process.argv.includes('--no-shortcut')) {
    const launcher = join(dest, 'launch.ps1');
    const exeInLive = join(live, 'smartlearn.exe');
    const name = SHORTCUT_NAME.replace(/'/g, "''");
    shortcut = ps(`
$desktop = [Environment]::GetFolderPath('Desktop')
$path = Join-Path $desktop '${name}'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path $path) {
  # Ownership is decided BEFORE the read-only flag is touched: a foreign shortcut is refused exactly as it was found.
  $old = $shell.CreateShortcut($path)
  $oursOld = $old.Arguments.IndexOf('${launcher.replace(/'/g, "''")}', [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  $oursNew = $old.TargetPath -ieq '${exeInLive.replace(/'/g, "''")}'
  if (-not ($oursOld -or $oursNew)) { Write-Output 'FOREIGN'; exit 0 }
  Set-ItemProperty -LiteralPath $path -Name IsReadOnly -Value $false
}
$s = $shell.CreateShortcut($path)
$s.TargetPath = '${exeInLive.replace(/'/g, "''")}'
$s.Arguments = ''
$s.WorkingDirectory = '${dest.replace(/'/g, "''")}'
$s.IconLocation = '${exeInLive.replace(/'/g, "''")},0'
$s.Description = 'SmartLearn candidato isolado para homologacao (dados proprios)'
$s.Save()
Set-ItemProperty -LiteralPath $path -Name IsReadOnly -Value $true
Write-Output $path`);
    if (!shortcut) die('the shortcut could not be created');
    if (shortcut === 'FOREIGN') die(`a shortcut named ${SHORTCUT_NAME} already exists and is not this install's. Nothing overwritten.`);
  }
  for (const f of ['launch.ps1', 'manifest.json']) execFileSync('attrib', ['+R', join(dest, f)]);
  execFileSync('attrib', ['+R', join(live, HOMOLOGATION_FILE)]);
  console.log(JSON.stringify({ ok: true, installDir: dest, executable: join(live, 'smartlearn.exe'), exeSha256: copiedSha, inputsHash: identity.inputsHash, commit: head, homologation: join(live, HOMOLOGATION_FILE), shortcut }, null, 2));
}

main();
