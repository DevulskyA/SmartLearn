import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// DESKTOP ENTRYPOINT: one canonical way for a human to open the Desktop, always THIS worktree's DEV build — never a release
// .exe found in a stale shortcut. The scripts are PowerShell; the contract is what they must (not) contain and that they parse.

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const launcher = read('scripts/launch-desktop-dev.ps1');
const installer = read('scripts/install-dev-shortcut.ps1');

test('the launcher resolves its own worktree, guards the branch and opens the DEV window (never a release build)', () => {
  assert.match(launcher, /Split-Path -Parent \$PSScriptRoot/);
  assert.match(launcher, /claude\/smartlearn-v1-complete/);
  assert.match(launcher, /npm run tauri dev/);
  assert.doesNotMatch(launcher, /target\release|tauri build|AppData\Local\SmartLearn/i);
});

test('the launcher stamps the build identity the app displays (commit, mode, provider) and keeps consent explicit', () => {
  assert.match(launcher, /SMARTLEARN_BUILD_HEAD/);
  assert.match(launcher, /SMARTLEARN_BUILD_MODE\s*=\s*'DEV'/);
  assert.match(launcher, /SMARTLEARN_AI_PROVIDER\s*=\s*\$Provider/);
  assert.match(launcher, /SMARTLEARN_AI_CONSENT\s*=\s*'true'/);
  assert.match(launcher, /SMARTLEARN_LOCAL_AUTHORITY\s*=\s*'true'/);
});

test('the launcher only replaces processes that belong to THIS worktree', () => {
  assert.match(launcher, /Get-Process -Name smartlearn/);
  assert.match(launcher, /\$_\.Path\.StartsWith\(\$root/);
  assert.doesNotMatch(launcher, /taskkill|Stop-Process -Name|Get-Process codex/i);
});

test('the shortcut installer points at the launcher, retires foreign shortcuts by MOVING them (never deleting)', () => {
  assert.match(installer, /launch-desktop-dev\.ps1/);
  assert.match(installer, /Move-Item/);
  assert.doesNotMatch(installer, /Remove-Item/);
  assert.match(installer, /StartsWith\(\$root/); // a shortcut already pointing inside this worktree is never retired
});

for (const [name, script] of [['launcher', 'scripts/launch-desktop-dev.ps1'], ['installer', 'scripts/install-dev-shortcut.ps1']]) {
  test(`the ${name} is valid PowerShell (parses with no errors)`, { skip: process.platform !== 'win32' }, () => {
    const path = fileURLToPath(new URL(`../${script}`, import.meta.url));
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile('${path.replace(/'/g, "''")}',[ref]$t,[ref]$e)|Out-Null;$e.Count`], { encoding: 'utf8' });
    assert.equal(out.trim(), '0');
  });
}

test('the launcher survives a CLEAN working tree (git prints nothing; a bare .Trim() on null crashed it)', () => {
  assert.doesNotMatch(launcher, /--untracked-files=no\)\.Trim/);
  assert.match(launcher, /git status[^)]*\|\s*Out-String\)\.Trim\(\)/);
});

test('the launcher PINS the persistent DEV datastore (never the app-data default), refuses a missing or busy one', () => {
  assert.match(launcher, /SmartLearn-DevData/);
  assert.match(launcher, /smartlearn-dev\.db/);
  assert.match(launcher, /\$env:SMARTLEARN_DB_PATH\s*=\s*\$devDb/);
  assert.match(launcher, /\$env:SMARTLEARN_SOURCES_DIR\s*=\s*\$devSources/);
  assert.match(launcher, /Test-Path \$devDb/);
  assert.match(launcher, /dev\.lock/);
  assert.doesNotMatch(launcher, /AppData|worktrees|\$root\data|\$PSScriptRoot\.*\.db/i);
});

test('the Tauri backend honours the pinned datastore (SMARTLEARN_DB_PATH / SMARTLEARN_SOURCES_DIR) and covers it with a unit test', () => {
  const lib = read('src-tauri/src/lib.rs');
  assert.match(lib, /fn with_data_overrides/);
  assert.match(lib, /std::env::var\("SMARTLEARN_DB_PATH"\)/);
  assert.match(lib, /std::env::var\("SMARTLEARN_SOURCES_DIR"\)/);
  assert.match(lib, /fn data_overrides_pin_the_dev_datastore_and_default_to_app_data/);
});

test('the launcher announces exactly which instance it opens (executable, database, sources, version, HEAD, branch) and verifies the running path', () => {
  for (const label of ['SMARTLEARN DEV', 'Executable:', 'Database:', 'Sources:', 'App version:', 'Git HEAD:', 'Branch:']) assert.ok(launcher.includes(label), `missing log line ${label}`);
  assert.ok(launcher.includes(['src-tauri', 'target', 'debug', 'smartlearn.exe'].join('\\')));
  assert.match(launcher, /last-launch\.json/);
  assert.match(launcher, /pathVerified/);
});

test('the launcher refuses a stale build: the packaged bundle must carry the identity of the current commit', () => {
  assert.match(launcher, /node scripts\/build-identity\.mjs/);
  assert.ok(launcher.includes(['dist-runtime', 'build-info.json'].join('\\')));
  assert.match(launcher, /distIsCurrent/);
  assert.match(launcher, /SMARTLEARN_BUILD_MODE\s*=\s*'DEV'/);
});

test('DEV persistent session is switched on ONLY by the DEV launcher and never by production code paths', () => {
  assert.match(launcher, /SMARTLEARN_DEV_PERSISTENT_SESSION\s*=\s*'true'/);
  const lib = read('src-tauri/src/lib.rs');
  assert.ok(!lib.includes('SMARTLEARN_DEV_PERSISTENT_SESSION'), 'the packaged Desktop must not enable it by itself');
  const main = read('server/src/main.js');
  assert.match(main, /process\.env\.SMARTLEARN_DEV_PERSISTENT_SESSION === 'true'/);
});

test('the launcher takes (and prints) a verified snapshot of the DEV datastore before it opens the Desktop', () => {
  assert.match(launcher, /scripts\/dev-snapshot\.mjs/);
  assert.match(launcher, /Write-Host \$snapshotOutput/);
  const at = (needle) => launcher.indexOf(needle);
  assert.ok(at('scripts/dev-snapshot.mjs') > 0 && at('scripts/dev-snapshot.mjs') < at('npm run tauri dev'), 'the snapshot comes before the app is opened');
  assert.match(launcher, /dev-snapshot\.mjs[^\n]*\n[^\n]*LASTEXITCODE/, 'a snapshot that could not be verified stops the launch');
});

test('the launcher also cleans orphaned backends of THIS worktree only, and says what it stopped', () => {
  assert.match(launcher, /Get-Process -Name node[^\n]*StartsWith\(\$root/);
  assert.match(launcher, /Write-Host "Encerrado/);
});

test('the launcher names the build in the window title and gives the local server the content hash it is compared by', () => {
  assert.match(launcher, /SMARTLEARN_WINDOW_TITLE\s*=\s*"SmartLearn DEV - v/);
  assert.match(launcher, /SMARTLEARN_BUILD_CONTENT\s*=\s*\$identity\.inputsHash/);
  assert.match(read('src-tauri/src/lib.rs'), /window_title\(std::env::var\("SMARTLEARN_WINDOW_TITLE"\)/);
});
