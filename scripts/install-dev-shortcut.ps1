# Creates the ONE canonical "SmartLearn DEV" shortcut on the Desktop and RETIRES the shortcuts that point at any other
# SmartLearn executable (an old release / installed copy). Retired shortcuts are MOVED to a backup folder, never deleted, so
# the previous state is one move away. Idempotent. ASCII only (Windows PowerShell 5.1).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root 'scripts\launch-desktop-dev.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$icon = Join-Path $root 'src-tauri\icons\icon.ico'
$backup = Join-Path $env:USERPROFILE 'SmartLearn-DevData\retired-shortcuts'
New-Item -ItemType Directory -Force $backup | Out-Null

$shell = New-Object -ComObject WScript.Shell
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$retired = @()
foreach ($dir in @($desktop, [Environment]::GetFolderPath('CommonDesktopDirectory'), $startMenu)) {
  if (-not (Test-Path $dir)) { continue }
  foreach ($file in Get-ChildItem $dir -Filter *.lnk -ErrorAction SilentlyContinue) {
    if ($file.Name -eq 'SmartLearn DEV.lnk') { continue }
    $link = $shell.CreateShortcut($file.FullName)
    if ($link.TargetPath -match 'smartlearn\.exe$' -and -not $link.TargetPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $dest = Join-Path $backup ("{0:yyyyMMdd-HHmmss}-{1}" -f (Get-Date), $file.Name)
      try { Move-Item $file.FullName $dest -Force; $retired += "$($file.FullName) -> $($link.TargetPath)" } catch { Write-Warning "Nao foi possivel mover $($file.FullName): $_" }
    }
  }
}

$path = Join-Path $desktop 'SmartLearn DEV.lnk'
$shortcut = $shell.CreateShortcut($path)
$shortcut.TargetPath = (Get-Command powershell.exe).Source
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
if (Test-Path $icon) { $shortcut.IconLocation = $icon }
$shortcut.Description = 'SmartLearn Desktop DEV (worktree canonica)'
$shortcut.Save()

Write-Host "Atalho canonico: $path"
Write-Host "Aponta para: $launcher"
if ($retired.Count -gt 0) { Write-Host 'Atalhos antigos movidos para o backup:'; $retired | ForEach-Object { Write-Host "  $_" } } else { Write-Host 'Nenhum atalho antigo encontrado.' }
Write-Host "Backup: $backup"
