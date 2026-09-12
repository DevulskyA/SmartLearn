#!/usr/bin/env node
// ENV-NORMALIZE-01 guard: runs as predev/prebuild/prepreview/prestart so the
// official app-launch scripts refuse to run outside the one active work
// branch. This exists because a prior session ran `npm run dev` believing
// it was in the worktree while actually executing from the main repo's
// node_modules (WORKTREE_LAUNCH_ROOT_RESOLUTION) — this check makes that
// mistake fail loudly instead of silently serving the wrong app.
import { execFileSync } from 'node:child_process';

const WORK_BRANCH = 'claude/smartlearn-v1-complete';

function git(args) {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim();
}

let root, branch;
try {
  root = git(['rev-parse', '--show-toplevel']);
  branch = git(['branch', '--show-current']);
} catch {
  // Not a git repo (or git missing) — nothing for this guard to check.
  process.exit(0);
}

console.log(`SMARTLEARN_ROOT=${root}`);
console.log(`SMARTLEARN_BRANCH=${branch || '(detached HEAD)'}`);

if (branch !== WORK_BRANCH) {
  console.error('');
  console.error('SMARTLEARN_WRONG_WORKTREE');
  console.error(`Development must run from ${WORK_BRANCH}.`);
  console.error(`Detected branch "${branch || '(detached HEAD)'}" at ${root}.`);
  process.exit(1);
}
