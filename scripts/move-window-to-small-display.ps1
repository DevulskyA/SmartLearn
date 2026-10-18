# Moves the main window of process -ProcessId onto the SMALLEST display, so an automated run never opens over the display the person is working on.
# Does nothing (exit 0) when there is a single display. Does not steal focus (SWP_NOACTIVATE). Prints the final rectangle as JSON.
param([Parameter(Mandatory = $true)][int]$ProcessId, [int]$TimeoutSeconds = 60)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SlWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
'@

$screens = [System.Windows.Forms.Screen]::AllScreens
if ($screens.Count -lt 2) { Write-Output '{"moved":false,"reason":"single display"}'; exit 0 }
$target = $screens | Sort-Object { $_.WorkingArea.Width * $_.WorkingArea.Height } | Select-Object -First 1

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$handle = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) {
  $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { Write-Output '{"moved":false,"reason":"process gone"}'; exit 0 }
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $handle = $p.MainWindowHandle; break }
  Start-Sleep -Milliseconds 100
}
if ($handle -eq [IntPtr]::Zero) { Write-Output '{"moved":false,"reason":"no window"}'; exit 0 }

$wa = $target.WorkingArea
$w = [Math]::Min(1280, $wa.Width - 40)
$h = [Math]::Min(820, $wa.Height - 40)
$x = $wa.X + [Math]::Floor(($wa.Width - $w) / 2)
$y = $wa.Y + [Math]::Floor(($wa.Height - $h) / 2)
[void][SlWin]::ShowWindow($handle, 9)   # SW_RESTORE
# SWP_NOZORDER 0x4 | SWP_NOACTIVATE 0x10
[void][SlWin]::SetWindowPos($handle, [IntPtr]::Zero, $x, $y, $w, $h, 0x14)
$r = New-Object SlWin+RECT
[void][SlWin]::GetWindowRect($handle, [ref]$r)
$inside = ($r.Left -ge $wa.X) -and ($r.Top -ge $wa.Y) -and ($r.Right -le $wa.X + $wa.Width) -and ($r.Bottom -le $wa.Y + $wa.Height)
Write-Output ('{{"moved":true,"display":"{0}","rect":[{1},{2},{3},{4}],"insideTarget":{5}}}' -f $target.DeviceName.Replace('\', '/'), $r.Left, $r.Top, $r.Right, $r.Bottom, $inside.ToString().ToLower())
