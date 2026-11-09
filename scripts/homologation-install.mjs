#!/usr/bin/env node
// Installs the candidate Desktop build as "SmartLearn Homologacao": its own folder, its own launcher, its own shortcut.
// Never touches the Oficial/DEV shortcuts, their executables or their data. Refuses a binary that does not serve the current content.
//
//   node scripts/homologation-install.mjs --exe <path to smartlearn.exe> [--dest C:\Projetos\SmartLearn-Homologacao] [--no-shortcut]
//
// The folder it writes is self-contained (no git, no npm): app\ (exe + dist-runtime + server-runtime + node-runtime + shared),
// launch.ps1 (scripts/launch-homologacao.ps1) and manifest.json (what was installed: content hash, exe sha256, commit).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const die = (message) => { console.error(`HOMOLOGATION INSTALL REFUSED: ${message}`); process.exit(1); };

export const DEFAULT_DEST = 'C:\\Projetos\\SmartLearn-Homologacao';
const SHORTCUT_NAME = `SmartLearn Homologa${'\u00e7\u00e3'}o.lnk`;
const RUNTIME_DIRS = ['dist-runtime', 'server-runtime', 'node-runtime', 'shared'];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}\nexit 0`, 'utf16le').toString('base64')], { encoding: 'utf8' }).trim();

function main() {
  const exeArg = arg('--exe') ?? die('--exe <path to smartlearn.exe> is required');
  const exe = resolve(exeArg);
  const dest = resolve(arg('--dest') ?? DEFAULT_DEST);
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
  if (existsSync(live)) { rmSync(join(dest, 'app.old'), { recursive: true, force: true }); renameSync(live, join(dest, 'app.old')); }
  renameSync(tmp, live);
  rmSync(join(dest, 'app.old'), { recursive: true, force: true });

  // 5. launcher + manifest (read-only after install; unlocked here only so a reinstall can replace them)
  for (const f of ['launch.ps1', 'manifest.json']) if (existsSync(join(dest, f))) execFileSync('attrib', ['-R', join(dest, f)]);
  copyFileSync(join(ROOT, 'scripts', 'launch-homologacao.ps1'), join(dest, 'launch.ps1'));
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const manifest = { schema: 1, version: identity.version, commit: head, inputsHash: identity.inputsHash, exeSha256: copiedSha, sourceExe: exe, installedAt: new Date().toISOString() };
  writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 6. the shortcut: independent, own target and working directory; refuses to overwrite a shortcut that is not ours
  let shortcut = null;
  if (!process.argv.includes('--no-shortcut')) {
    const launcher = join(dest, 'launch.ps1');
    const name = SHORTCUT_NAME.replace(/'/g, "''");
    shortcut = ps(`
$desktop = [Environment]::GetFolderPath('Desktop')
$path = Join-Path $desktop '${name}'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path $path) {
  Set-ItemProperty -LiteralPath $path -Name IsReadOnly -Value $false
  $old =$shell.CreateShortcut($path)
  if ($old.Arguments -notlike '*${launcher.replace(/'/g, "''")}*') { Write-Output 'FOREIGN'; exit 0 }
}
$s = $shell.CreateShortcut($path)
$s.TargetPath = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
$s.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher.replace(/'/g, "''")}"'
$s.WorkingDirectory = '${dest.replace(/'/g, "''")}'
$s.IconLocation = '${join(live, 'smartlearn.exe').replace(/'/g, "''")},0'
$s.Description = 'SmartLearn candidato isolado para homologacao (dados proprios)'
$s.Save()
Set-ItemProperty -LiteralPath $path -Name IsReadOnly -Value $true
Write-Output $path`);
    if (!shortcut) die('the shortcut could not be created');
    if (shortcut === 'FOREIGN') die(`a shortcut named ${SHORTCUT_NAME} already exists and is not this install's. Nothing overwritten.`);
  }
  for (const f of ['launch.ps1', 'manifest.json']) execFileSync('attrib', ['+R', join(dest, f)]);
  console.log(JSON.stringify({ ok: true, installDir: dest, executable: join(live, 'smartlearn.exe'), exeSha256: copiedSha, inputsHash: identity.inputsHash, commit: head, shortcut }, null, 2));
}

main();
