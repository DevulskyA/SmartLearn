# Runs ONE command inside a Windows Job Object with KILL_ON_JOB_CLOSE (same mechanism as src-tauri/src/kill_on_close_job.rs), so the whole
# process tree dies with this helper, however the helper ends (normal exit, taskkill, supervisor death, timeout).
# The command is created SUSPENDED, put in the job, and only then resumed: nothing can escape before the association.
# If the job cannot be created/assigned the command never runs (exit 97/98). Used by scripts/process-supervisor.mjs; not meant to be called by hand.
# Exit codes: the command's own; 97 job creation failed; 98 assignment/start failed; 99 supervisor died; 124 timeout.
param([Parameter(Mandatory = $true)][string]$SpecPath)
$ErrorActionPreference = 'Stop'
$spec = Get-Content -Raw -LiteralPath $SpecPath | ConvertFrom-Json # (a different name: a [string] parameter would turn the object back into text)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class JobRun {
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinWs, MaxWs;
    public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED {
    public BASIC Basic; public IO_COUNTERS Io; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved, lpDesktop, lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr a, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref EXTENDED info, int len);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int cls, out EXTENDED info, int len, IntPtr ret);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr t);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr p, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int n);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForMultipleObjects(uint n, IntPtr[] h, bool all, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr p, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  public static IntPtr Job;
  public static IntPtr Proc;
  public static int ChildPid;
  public static string Error = "";

  public static bool Start(string exe, string cmdline, string cwd, long memBytes, int activeLimit) {
    Job = CreateJobObjectW(IntPtr.Zero, null);
    if (Job == IntPtr.Zero) { Error = "CreateJobObject " + Marshal.GetLastWin32Error(); return false; }
    var info = new EXTENDED();
    info.Basic.LimitFlags = 0x2000 | 0x400; // KILL_ON_JOB_CLOSE | DIE_ON_UNHANDLED_EXCEPTION
    if (memBytes > 0) { info.Basic.LimitFlags |= 0x200; info.JobMemoryLimit = new UIntPtr((ulong)memBytes); }
    if (activeLimit > 0) { info.Basic.LimitFlags |= 0x8; info.Basic.ActiveProcessLimit = (uint)activeLimit; }
    if (!SetInformationJobObject(Job, 9, ref info, Marshal.SizeOf(typeof(EXTENDED)))) { Error = "SetInformationJobObject " + Marshal.GetLastWin32Error(); return false; }
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.dwFlags = 0x100; // USESTDHANDLES
    si.hStdInput = GetStdHandle(-10); si.hStdOutput = GetStdHandle(-11); si.hStdError = GetStdHandle(-12);
    foreach (var h in new[] { si.hStdInput, si.hStdOutput, si.hStdError }) if (h != IntPtr.Zero && h != new IntPtr(-1)) SetHandleInformation(h, 1, 1);
    PROCESS_INFORMATION pi;
    // CREATE_SUSPENDED: the command cannot run (or start children) until it belongs to the job
    if (!CreateProcessW(exe, new StringBuilder(cmdline), IntPtr.Zero, IntPtr.Zero, true, 0x4 | 0x08000000, IntPtr.Zero, cwd, ref si, out pi)) { Error = "CreateProcess " + Marshal.GetLastWin32Error(); return false; }
    Proc = pi.hProcess; ChildPid = pi.dwProcessId;
    if (!AssignProcessToJobObject(Job, pi.hProcess)) { Error = "AssignProcessToJobObject " + Marshal.GetLastWin32Error(); TerminateProcess(pi.hProcess, 98); return false; }
    ResumeThread(pi.hThread); CloseHandle(pi.hThread);
    return true;
  }

  /** 0 = command finished (code in exitCode), 1 = supervisor died, 2 = timeout */
  public static int Wait(int parentPid, uint timeoutMs, out uint exitCode) {
    exitCode = 0;
    IntPtr parent = OpenProcess(0x00100000, false, parentPid); // SYNCHRONIZE
    if (parent == IntPtr.Zero) return 1;
    uint r = WaitForMultipleObjects(2, new[] { Proc, parent }, false, timeoutMs == 0 ? 0xFFFFFFFF : timeoutMs);
    if (r == 0) { GetExitCodeProcess(Proc, out exitCode); return 0; }
    return r == 1 ? 1 : 2;
  }

  public static long PeakJobMemory() {
    EXTENDED i; if (!QueryInformationJobObject(Job, 9, out i, Marshal.SizeOf(typeof(EXTENDED)), IntPtr.Zero)) return -1;
    return (long)(ulong)i.PeakJobMemoryUsed;
  }
}
'@

$self = [System.Diagnostics.Process]::GetCurrentProcess()
$memBytes = [long]$spec.memMB * 1MB
$ok = [JobRun]::Start($spec.exe, $spec.commandLine, $spec.cwd, $memBytes, [int]$spec.activeLimit)
if (-not $ok) {
  [Console]::Error.WriteLine("[job-run] protection failed, command NOT run: $([JobRun]::Error)")
  if ([JobRun]::Error -like 'CreateJobObject*' -or [JobRun]::Error -like 'SetInformation*') { exit 97 } else { exit 98 }
}

# identity record: what process-supervisor.mjs validates (PID + creation time + parent) before it ever stops anything
$child = Get-Process -Id ([JobRun]::ChildPid) -ErrorAction SilentlyContinue
$record = [ordered]@{
  runId = $spec.runId; label = $spec.label; helperPid = $self.Id; helperStart = $self.StartTime.ToFileTimeUtc()
  childPid = [JobRun]::ChildPid; childStart = $(if ($child) { $child.StartTime.ToFileTimeUtc() } else { 0 })
  supervisorPid = [int]$spec.parentPid; startedAt = (Get-Date).ToUniversalTime().ToString('o'); memMB = [int]$spec.memMB; workers = [int]$spec.workers
}
$recordPath = Join-Path $spec.registryDir "$($spec.runId).json"
$record | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8

[uint32]$code = 0
$how = [JobRun]::Wait([int]$spec.parentPid, [uint32]([int]$spec.timeoutSec * 1000), [ref]$code)
$peak = [JobRun]::PeakJobMemory()
$resultPath = Join-Path $spec.registryDir "$($spec.runId).result.json"
@{ runId = $spec.runId; how = @('exited', 'supervisor-died', 'timeout')[$how]; exitCode = [int64]$code; peakJobMemMB = [math]::Round($peak / 1MB); endedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
Remove-Item -LiteralPath $recordPath -Force -ErrorAction SilentlyContinue
# leaving the process closes the job handle: KILL_ON_JOB_CLOSE ends every descendant that is still alive
if ($how -eq 0) { exit ([int]$code) }
if ($how -eq 1) { exit 99 }
exit 124
