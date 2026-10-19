# Reads (and, with -X/-Y/-W/-H, first sets) the outer rectangle of the main window of process -ProcessId. Prints one JSON line: {"rect":[l,t,r,b]}.
# Used by the isolated Desktop journey to prove the window comes back where it was. Never steals focus (SWP_NOACTIVATE).
param([Parameter(Mandatory = $true)][int]$ProcessId, [int]$X = [int]::MinValue, [int]$Y = 0, [int]$W = 0, [int]$H = 0, [int]$TimeoutSeconds = 60)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SlRect {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
'@

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$handle = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) {
  $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { Write-Output '{"rect":null,"reason":"process gone"}'; exit 0 }
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $handle = $p.MainWindowHandle; break }
  Start-Sleep -Milliseconds 100
}
if ($handle -eq [IntPtr]::Zero) { Write-Output '{"rect":null,"reason":"no window"}'; exit 0 }

# SWP_NOZORDER 0x4 | SWP_NOACTIVATE 0x10
if ($X -ne [int]::MinValue) { [void][SlRect]::SetWindowPos($handle, [IntPtr]::Zero, $X, $Y, $W, $H, 0x14) }
$r = New-Object SlRect+RECT
[void][SlRect]::GetWindowRect($handle, [ref]$r)
Write-Output ('{{"rect":[{0},{1},{2},{3}]}}' -f $r.Left, $r.Top, $r.Right, $r.Bottom)
