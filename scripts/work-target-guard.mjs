#!/usr/bin/env node
// CANDIDATE replacement for scripts/require-work-branch.mjs (not wired into package.json; the owner decides). Same purpose: fail loudly when the
// app/build would run from the wrong checkout (WORKTREE_LAUNCH_ROOT_RESOLUTION). It checks two independent things instead of one branch name:
//   1. EXECUTION ROOT: the checkout that contains THIS script must be the checkout the command runs in (git toplevel of the cwd). A command run
//      from another worktree, or with another checkout's scripts/node_modules, is refused even on an allowed branch.
//   2. LINE OF WORK: the current branch must be named in scripts/work-branches.json. A detached HEAD has no line of work and is refused.
// CI is skipped exactly as before (fresh checkout of the ref under test, detached by design).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function branchAllowed(branch, allowed) {
  return allowed.some((rule) => (rule.endsWith('/*') ? branch.length > rule.length - 1 && branch.startsWith(rule.slice(0, -1)) : rule === branch));
}

/** Pure decision. env: process.env-like. Returns { ok, code, message }. Fails closed on any unreadable input. */
export function evaluate({ env, toplevel, branch, root, allowed, rootIsRepo = true }) {
  const ci = env.GITHUB_ACTIONS === 'true' || ['true', '1'].includes(String(env.CI ?? '').trim().toLowerCase());
  if (ci) return { ok: true, code: 'CI' };
  if (!toplevel) return rootIsRepo ? { ok: false, code: 'OUTSIDE_CHECKOUT', message: `Command runs outside any git checkout but its scripts live in the checkout ${root}. Run it from inside that checkout.` } : { ok: true, code: 'NOT_A_GIT_REPO' };
  const same = (a, b) => { try { return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase(); } catch { return false; } };
  if (!same(toplevel, root)) return { ok: false, code: 'WRONG_EXECUTION_ROOT', message: `Command runs in ${toplevel} but its scripts live in ${root}. Run it from the checkout that holds the scripts.` };
  if (!Array.isArray(allowed) || allowed.length === 0) return { ok: false, code: 'NO_ALLOWED_BRANCHES', message: 'scripts/work-branches.json has no allowed branches.' };
  if (!branch) return { ok: false, code: 'DETACHED_HEAD', message: `Detached HEAD at ${toplevel}: no named line of work. Check out an allowed branch (${allowed.join(', ')}).` };
  if (!branchAllowed(branch, allowed)) return { ok: false, code: 'WRONG_BRANCH', message: `Branch "${branch}" is not an allowed line of work (${allowed.join(', ')}).` };
  return { ok: true, code: 'OK' };
}

function resolveGitExecutable() {
  const candidates = process.platform === 'win32'
    ? [
      join(process.env.ProgramW6432 ?? 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
      join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'cmd', 'git.exe'),
    ]
    : ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git', '/opt/local/bin/git', '/bin/git'];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function main() {
  const gitExecutable = resolveGitExecutable();
  const git = (args) => {
    if (!gitExecutable) throw new Error('Git not found in a fixed system installation path');
    return execFileSync(gitExecutable, args, { cwd: process.cwd(), encoding: 'utf8' }).trim();
  };
  let toplevel = null; let branch = '';
  try { toplevel = git(['rev-parse', '--show-toplevel']); branch = git(['branch', '--show-current']); } catch { toplevel = null; }
  let allowed = [];
  try { allowed = JSON.parse(readFileSync(resolve(scriptRoot, 'scripts', 'work-branches.json'), 'utf8')).allowed ?? []; } catch { allowed = []; }
  let rootIsRepo = true;
  try {
    if (!gitExecutable) throw new Error('Git not found in a fixed system installation path');
    execFileSync(gitExecutable, ['rev-parse', '--show-toplevel'], { cwd: scriptRoot, stdio: 'ignore' });
  } catch { rootIsRepo = false; }
  const r = evaluate({ env: process.env, toplevel, branch, root: scriptRoot, allowed, rootIsRepo });
  console.log(`SMARTLEARN_ROOT=${toplevel ?? '(none)'}`);
  console.log(`SMARTLEARN_BRANCH=${branch || '(detached HEAD)'}`);
  if (!r.ok) { console.error(`\nSMARTLEARN_WRONG_WORKTREE ${r.code}\n${r.message}`); process.exit(1); }
}
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) main();
