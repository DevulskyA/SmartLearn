import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export function resolveGitExecutable() {
  const configured = process.env.GIT_EXECUTABLE;
  const candidates = [
    ...(configured && isAbsolute(configured) ? [configured] : []),
    ...(process.platform === 'win32'
      ? [
        join(process.env.ProgramW6432 ?? 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
        join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
        join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'cmd', 'git.exe'),
      ]
      : ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git', '/opt/local/bin/git', '/bin/git']),
  ];
  const executable = candidates.find((candidate) => isAbsolute(candidate) && existsSync(candidate));
  if (!executable) throw new Error('Git executable not found in a validated absolute path');
  return executable;
}

export function resolveWindowsPowerShellExecutable() {
  const systemRoot = process.env.SystemRoot;
  const executable = systemRoot && join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (!executable || !isAbsolute(executable) || !existsSync(executable)) {
    throw new Error('Windows PowerShell executable not found under SystemRoot');
  }
  return executable;
}
