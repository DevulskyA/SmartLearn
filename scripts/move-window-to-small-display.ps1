# Keeps the app window of an automated run on the SMALLEST display, so a test never opens over the display the person is working on.
# Started BEFORE the app (the driver waits for -ReadyFile): the app creates its window hidden on the primary display and shows it ~0.5 s later, so
# the window is found by process id even while hidden and moved before it is ever shown. It is then kept there for $HoldSeconds, because the app
# re-centres itself on the primary display about a second after launch. Never activates the window (SWP_NOACTIVATE) and never shows it itself.
# With a single display it does nothing (exit 0). Prints the final rectangle as JSON.
# Legacy mode: -ProcessId <pid> moves an already running app once and returns (no hold unless -HoldSeconds is given).
param([int]$ProcessId = 0, [string]$ExeName = 'smartlearn', [string]$ReadyFile = '', [int]$TimeoutSeconds = 60, [int]$HoldSeconds = 30)
if ($ProcessId -gt 0 -and -not $PSBoundParameters.ContainsKey('HoldSeconds')) { $HoldSeconds = 0 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SlWin {
  public delegate bool EnumCb(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumCb cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  // the debug build of the app owns a black console window: hide it (SW_HIDE), the person never needs it
  public static int HideConsoles(uint pid) {
    int n = 0;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p != pid || !IsWindowVisible(h)) return true; var sb = new StringBuilder(128); GetClassName(h, sb, 128); var c = sb.ToString(); if (c == "ConsoleWindowClass" || c == "CASCADIA_HOSTING_WINDOW_CLASS") { ShowWindow(h, 0); n++; } return true; }, IntPtr.Zero);
    return n;
  }
  // the app's main window, visible or not (Process.MainWindowHandle only sees visible ones)
  public static IntPtr MainWindow(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p != pid) return true; var sb = new StringBuilder(128); GetClassName(h, sb, 128); if (sb.ToString() == "Tauri Window") { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
'@

$screens = [System.Windows.Forms.Screen]::AllScreens
if ($ReadyFile) { Set-Content -LiteralPath $ReadyFile -Value 'ready' }   # compiled and waiting: the driver may start the app now
if ($screens.Count -lt 2) { Write-Output '{"moved":false,"reason":"single display"}'; exit 0 }
$target = $screens | Sort-Object { $_.WorkingArea.Width * $_.WorkingArea.Height } | Select-Object -First 1
$wa = $target.WorkingArea
$w = [Math]::Min(1280, $wa.Width - 40)
$h = [Math]::Min(820, $wa.Height - 40)
$x = $wa.X + [Math]::Floor(($wa.Width - $w) / 2)
$y = $wa.Y + [Math]::Floor(($wa.Height - $h) / 2)

# only a process that did not exist when this script started (never someone else's running app)
$before = @(Get-Process -Name $ExeName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$handle = [IntPtr]::Zero; $procId = 0
while ((Get-Date) -lt $deadline -and $handle -eq [IntPtr]::Zero) {
  $p = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction SilentlyContinue } else { Get-Process -Name $ExeName -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Select-Object -First 1 }
  if ($ProcessId -gt 0 -and -not $p) { Write-Output '{"moved":false,"reason":"process gone"}'; exit 0 }
  if ($p) { $procId = $p.Id; [void][SlWin]::HideConsoles([uint32]$procId); $handle = [SlWin]::MainWindow([uint32]$procId) }
  if ($handle -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 10 }
}
if ($handle -eq [IntPtr]::Zero) { Write-Output '{"moved":false,"reason":"no window"}'; exit 0 }

function Test-Inside { $r = New-Object SlWin+RECT; [void][SlWin]::GetWindowRect($handle, [ref]$r); return ($r.Left -ge $wa.X) -and ($r.Top -ge $wa.Y) -and ($r.Right -le $wa.X + $wa.Width) -and ($r.Bottom -le $wa.Y + $wa.Height) }
# SWP_NOZORDER 0x4 | SWP_NOACTIVATE 0x10
[void][SlWin]::SetWindowPos($handle, [IntPtr]::Zero, $x, $y, $w, $h, 0x14)
$moves = 1
$hold = (Get-Date).AddSeconds($HoldSeconds)
while ((Get-Date) -lt $hold) {
  Start-Sleep -Milliseconds 20
  if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) { break }
  [void][SlWin]::HideConsoles([uint32]$procId)
  $now = [SlWin]::MainWindow([uint32]$procId)
  if ($now -ne [IntPtr]::Zero) { $handle = $now }   # the app may replace its window: always follow the current one
  if (-not (Test-Inside)) { [void][SlWin]::SetWindowPos($handle, [IntPtr]::Zero, $x, $y, $w, $h, 0x14); $moves += 1 }
}
$r = New-Object SlWin+RECT
[void][SlWin]::GetWindowRect($handle, [ref]$r)
Write-Output ('{{"moved":true,"display":"{0}","rect":[{1},{2},{3},{4}],"insideTarget":{5},"moves":{6}}}' -f $target.DeviceName.Replace('\', '/'), $r.Left, $r.Top, $r.Right, $r.Bottom, (Test-Inside).ToString().ToLower(), $moves)
