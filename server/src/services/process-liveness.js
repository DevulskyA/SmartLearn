// PROCESS LIVENESS (R-04 AC-04.2). A provider step can be long and silent (a model "thinking") yet perfectly healthy, so the only
// output of `codex exec` is not enough to call a job stuck. This samples what the provider's PROCESS TREE is doing: the total CPU
// time it has used and the number of OS handles/file descriptors it holds. The runner treats a change as a signal of life.
//
// It only OBSERVES: no process is touched. Anything that goes wrong (the process is gone, the tool is missing, a timeout) is
// "no signal" (null), never an error: the stalled policy is a warning, so a missing sample can only make it more cautious.
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const SAMPLE_TIMEOUT_MS = 10_000;

const run = (file, args) => new Promise((resolve) => {
  execFile(file, args, { timeout: SAMPLE_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err ? null : String(stdout)));
});

// One PowerShell call: the process and all its descendants, summed.
const WINDOWS_SCRIPT = (pid) => `
$ErrorActionPreference = 'SilentlyContinue'
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
$ids = New-Object 'System.Collections.Generic.HashSet[int]'
if (-not (Get-Process -Id ${pid})) { return }
[void]$ids.Add(${pid})
do { $n = $ids.Count; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } } while ($ids.Count -gt $n)
$cpu = 0.0; $handles = 0; $count = 0
foreach ($i in $ids) { $pr = Get-Process -Id $i; if ($pr) { $cpu += $pr.TotalProcessorTime.TotalMilliseconds; $handles += $pr.HandleCount; $count += 1 } }
"$([int64]$cpu) $handles $count"
`;

async function sampleWindows(pid) {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT(pid)]);
  const m = out && /^(\d+) (\d+) (\d+)\s*$/.exec(out.trim());
  return m && Number(m[3]) > 0 ? { cpuMs: Number(m[1]), handles: Number(m[2]), processes: Number(m[3]) } : null;
}

async function samplePosix(pid) {
  const out = await run('ps', ['-e', '-o', 'pid=,ppid=']);
  if (!out) return null;
  const parent = new Map(out.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)).map(([p, pp]) => [p, pp]));
  if (!parent.has(pid)) return null;
  const ids = new Set([pid]);
  for (let grew = true; grew;) { grew = false; for (const [p, pp] of parent) if (!ids.has(p) && ids.has(pp)) { ids.add(p); grew = true; } }
  let ticks = 0;
  let handles = 0;
  for (const id of ids) {
    try {
      const stat = readFileSync(`/proc/${id}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // utime and stime are fields 14 and 15 of the full line
      ticks += Number(fields[11]) + Number(fields[12]);
      handles += readdirSync(`/proc/${id}/fd`).length;
    } catch { /* gone while sampling */ }
  }
  return { cpuMs: Math.round((ticks * 1000) / 100), handles, processes: ids.size };
}

/** @returns {Promise<{cpuMs: number, handles: number, processes: number} | null>} totals over the process and its descendants */
export async function sampleProcessTree(pid, { platform = process.platform } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    return platform === 'win32' ? await sampleWindows(pid) : await samplePosix(pid);
  } catch {
    return null;
  }
}
