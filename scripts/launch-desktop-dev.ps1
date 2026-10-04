# SmartLearn Desktop DEV - the ONE human entry point.
#
# Why this exists: a desktop shortcut once opened an old release .exe (07/09) and a whole validation round was lost on a build
# that was not the one under test. This launcher always resolves the worktree it lives in, refuses to run from any other
# branch, rebuilds the frontend/backend resources when they are older than the sources, stamps the build identity
# (commit, mode, provider) so the app can show it, and opens the Tauri DEV window for THIS worktree - never a release.
#
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less files as ANSI.
param(
  [string]$Provider = $(if ($env:SMARTLEARN_AI_PROVIDER) { $env:SMARTLEARN_AI_PROVIDER } else { 'CODEX' }),
  [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($message) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, 'SmartLearn DEV', 'OK', 'Error') | Out-Null
  exit 1
}

$expectedBranch = 'claude/smartlearn-v1-complete'
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne $expectedBranch) { Fail "Esta pasta esta na branch '$branch', nao em '$expectedBranch'. Nada foi aberto." }
$head = (git rev-parse --short HEAD).Trim()
$dirty = if ((git status --porcelain --untracked-files=no | Out-String).Trim()) { '+local' } else { '' }

# Only this worktree's own DEV processes are replaced; nothing else is touched.
Get-Process -Name smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
Start-Sleep -Milliseconds 500

function Newest($paths) {
  $items = foreach ($p in $paths) { Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue }
  ($items | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
}

if (-not $NoBuild) {
  $dist = Join-Path $root 'dist\index.html'
  $srcNewest = Newest @("$root\src", "$root\index.html", "$root\shared")
  if (-not (Test-Path $dist) -or (Get-Item $dist).LastWriteTime -lt $srcNewest) {
    Write-Host 'Compilando o frontend...'
    npm run build | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'O build do frontend falhou. Veja o console.' }
  }
  $staged = Join-Path $root 'src-tauri\resources\server-runtime\src\main.js'
  $needStage = -not (Test-Path $staged) -or (Get-Item $staged).LastWriteTime -lt (Newest @("$root\server\src", "$root\server\migrations")) -or (Get-Item $staged).LastWriteTime -lt (Get-Item $dist).LastWriteTime
  if ($needStage) {
    Write-Host 'Empacotando backend e frontend para o Desktop...'
    npm run package:standalone | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'O empacotamento do backend falhou. Veja o console.' }
  }
}

# The Desktop starts its own local backend (loopback, dynamic port) and inherits these.
$env:SMARTLEARN_LOCAL_AUTHORITY = 'true'
$env:SMARTLEARN_AI_PROVIDER = $Provider
$env:SMARTLEARN_AI_CONSENT = 'true'
$env:SMARTLEARN_CODEX_TIMEOUT_MS = '1200000'
$env:SMARTLEARN_BUILD_HEAD = "$head$dirty"
$env:SMARTLEARN_BUILD_MODE = 'DEV'

Write-Host "SmartLearn DEV  commit $head$dirty  provedor $Provider"
Write-Host "Raiz: $root"
$host.UI.RawUI.WindowTitle = "SmartLearn DEV $head - feche esta janela para encerrar"
npm run tauri dev
