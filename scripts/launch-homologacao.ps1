# SmartLearn Homologacao - launcher of the INSTALLED candidate (copied to <install dir>\launch.ps1 by scripts/homologation-install.mjs).
#
# Runs with no git checkout and no npm: it only needs the install folder (app\ + manifest.json). It refuses to open anything that is not
# exactly what was installed (exe hash, served content hash) and refuses any data path that is, or is inside, the human Oficial/DEV data.
# The datastore is its OWN persistent folder (default: <profile>\SmartLearn-Homologacao-Data), created on first start, never reset.
#
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less files as ANSI.
param(
  [string]$Provider = $(if ($env:SMARTLEARN_AI_PROVIDER) { $env:SMARTLEARN_AI_PROVIDER } else { 'CODEX' }),
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot

function Fail($message) {
  if ($CheckOnly) { Write-Error $message; exit 1 }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, 'SmartLearn Homologacao', 'OK', 'Error') | Out-Null
  exit 1
}
function Norm($p) { [System.IO.Path]::GetFullPath($p).TrimEnd('\').ToLowerInvariant() }
function Inside($path, $root) { $a = Norm $path; $r = Norm $root; return ($a -eq $r) -or $a.StartsWith($r + '\') }

$manifestPath = Join-Path $base 'manifest.json'
if (-not (Test-Path $manifestPath)) { Fail "manifest.json ausente em $base. Reinstale com scripts/homologation-install.mjs. Nada foi aberto." }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$exe = Join-Path $base 'app\smartlearn.exe'
if (-not (Test-Path $exe)) { Fail "Executavel ausente: $exe. Nada foi aberto." }

# What is about to open must be what was installed.
$sha = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -ne $manifest.exeSha256) { Fail "O executavel mudou desde a instalacao (sha256 $sha, esperado $($manifest.exeSha256)). Nada foi aberto." }
$infoPath = Join-Path $base 'app\dist-runtime\build-info.json'
$served = if (Test-Path $infoPath) { try { Get-Content $infoPath -Raw | ConvertFrom-Json } catch { $null } } else { $null }
if (-not $served -or $served.inputsHash -ne $manifest.inputsHash) { Fail "O conteudo servido ($($served.inputsHash)) nao e o instalado ($($manifest.inputsHash)). Nada foi aberto." }

# Own datastore. SMARTLEARN_HOMOLOGACAO_DATA_DIR overrides the default (used by the install proof); it is checked like the default.
$dataDir = if ($env:SMARTLEARN_HOMOLOGACAO_DATA_DIR) { $env:SMARTLEARN_HOMOLOGACAO_DATA_DIR } else { Join-Path $env:USERPROFILE 'SmartLearn-Homologacao-Data' }
$dataDir = [System.IO.Path]::GetFullPath($dataDir)
$dbPath = Join-Path $dataDir 'smartlearn-homologacao.db'
$sourcesDir = Join-Path $dataDir 'sources'
# The WebView2 profile (cookies, storage, cache) is part of the isolation: by default it would be shared with the Oficial and DEV apps.
$webviewDir = Join-Path $dataDir 'webview'
$human = @(
  (Join-Path $env:USERPROFILE 'SmartLearn-DevData'),
  (Join-Path $env:APPDATA 'com.devulsky.smartlearn'),
  (Join-Path $env:LOCALAPPDATA 'com.devulsky.smartlearn')
)
if ($env:SMARTLEARN_DEV_DATA_DIR) { $human += $env:SMARTLEARN_DEV_DATA_DIR }
foreach ($h in $human) {
  foreach ($p in @($dbPath, $sourcesDir, $dataDir)) {
    if ((Inside $p $h) -or (Inside $h $p)) { Fail "O caminho de dados da homologacao ($p) coincide com dados humanos ($h). Nada foi aberto." }
  }
}

# Single writer: this install is already open.
$running = Get-Process -Name smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ((Norm $_.Path) -eq (Norm $exe)) }
if ($running -and -not $CheckOnly) { Fail "A Homologacao ja esta aberta (pid $($running[0].Id)). Feche-a antes de abrir de novo." }

$title = "SmartLearn HOMOLOGACAO - v$($manifest.version) - $($manifest.commit)"
$plan = [ordered]@{
  executable = $exe; exeSha256 = $sha; inputsHash = $manifest.inputsHash; commit = $manifest.commit; provider = $Provider
  dataDir = $dataDir; database = $dbPath; sources = $sourcesDir; webviewProfile = $webviewDir; windowTitle = $title; humanDataRefused = $human
}
if ($CheckOnly) { $plan | ConvertTo-Json -Depth 4; exit 0 }

New-Item -ItemType Directory -Force -Path $dataDir, $sourcesDir, $webviewDir | Out-Null

# The backend the exe starts inherits exactly this. Human DEV pins are cleared so nothing can redirect it to the DEV datastore.
Remove-Item Env:SMARTLEARN_DEV_DATA_DIR -ErrorAction SilentlyContinue
Remove-Item Env:SMARTLEARN_AUTHORIZE_MIGRATIONS -ErrorAction SilentlyContinue
Remove-Item Env:SMARTLEARN_DEV_PERSISTENT_SESSION -ErrorAction SilentlyContinue
$env:SMARTLEARN_DB_PATH = $dbPath
$env:SMARTLEARN_SOURCES_DIR = $sourcesDir
$env:SMARTLEARN_WEBVIEW_DATA_DIR = $webviewDir
$env:SMARTLEARN_LOCAL_AUTHORITY = 'true'
$env:SMARTLEARN_AI_PROVIDER = $Provider
$env:SMARTLEARN_AI_CONSENT = 'true'
$env:SMARTLEARN_CODEX_TIMEOUT_MS = '1200000'
$env:SMARTLEARN_BUILD_MODE = 'DEV'
$env:SMARTLEARN_BUILD_HEAD = [string]$manifest.commit
$env:SMARTLEARN_BUILD_CONTENT = [string]$manifest.inputsHash
$env:SMARTLEARN_WINDOW_TITLE = $title

$proc = Start-Process -FilePath $exe -WorkingDirectory (Join-Path $base 'app') -PassThru
# Record the executable that is REALLY running, next to what it was launched with.
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not $proc.HasExited) {
  $p = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne 0) { break }
  Start-Sleep -Milliseconds 300
}
$plan['pid'] = $proc.Id
$plan['pathVerified'] = ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue).Path -ieq $exe)
$plan['startedAt'] = (Get-Date).ToString('o')
$plan | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $base 'last-launch.json') -Encoding ASCII
