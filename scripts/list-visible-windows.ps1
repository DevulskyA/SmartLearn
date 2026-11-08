param([string]$Match = 'node|conhost|cmd|WindowsTerminal|OpenConsole|powershell|smartlearn')
# Lists EVERY visible top-level window with its owner process and class, so a console window cannot hide behind MainWindowHandle = 0.
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static List<string> All() {
    var rows = new List<string>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      int pid; GetWindowThreadProcessId(h, out pid);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      rows.Add(pid + "|" + c + "|" + t);
      return true;
    }, IntPtr.Zero);
    return rows;
  }
}
"@
$procs = @{}
Get-CimInstance Win32_Process | ForEach-Object { $procs[[int]$_.ProcessId] = $_ }
foreach ($row in [Win]::All()) {
  $parts = $row.Split('|')
  $p = $procs[[int]$parts[0]]
  $name = if ($p) { $p.Name } else { '?' }
  $ppid = if ($p) { $p.ParentProcessId } else { 0 }
  if ($name -match $Match -or $parts[1] -match 'Console|CASCADIA') { "{0}|{1}|class={2}|title={3}|ppid={4}" -f $parts[0], $name, $parts[1], $parts[2], $ppid }
}
exit 0
