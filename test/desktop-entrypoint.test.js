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
