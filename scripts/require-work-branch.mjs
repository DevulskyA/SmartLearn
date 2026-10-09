#!/usr/bin/env node
// ENV-NORMALIZE-01 guard: runs as predev/prebuild/prepreview/prestart so the
// official app-launch scripts refuse to run outside the one active work
// branch. This exists because a prior session ran `npm run dev` believing
// it was in the worktree while actually executing from the main repo's
// node_modules (WORKTREE_LAUNCH_ROOT_RESOLUTION) — this check makes that
// mistake fail loudly instead of silently serving the wrong app.
import { execFileSync } from 'node:child_process';

const WORK_BRANCH = 'claude/smartlearn-v1-complete';

// The guard's whole purpose is catching an *interactive* session that
// believes it's in the worktree but is actually running elsewhere
// (WORKTREE_LAUNCH_ROOT_RESOLUTION). A CI runner has no such ambiguity — it
// always checks out exactly the ref under test, fresh, in detached HEAD (no
// local branch name at all) — so the check has nothing to protect against
// there and would otherwise fail every PR build unconditionally.
//
// Recognize CI explicitly: GitHub Actions sets both `GITHUB_ACTIONS=true`
// and the generic `CI=true` (a convention most other CI providers also
// follow). Check the specific flag first, fall back to the generic one, and
// log the run context when we skip so a CI log makes the decision obvious.
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const isCi = isGithubActions || Boolean(process.env.CI);
if (isCi) {
  if (isGithubActions) {
    console.log('SMARTLEARN_CI=github-actions');
    console.log(`SMARTLEARN_GITHUB_REF=${process.env.GITHUB_REF || '(unset)'}`);
    console.log(`SMARTLEARN_GITHUB_HEAD_REF=${process.env.GITHUB_HEAD_REF || '(unset, not a pull_request event)'}`);
    console.log(`SMARTLEARN_GITHUB_SHA=${process.env.GITHUB_SHA || '(unset)'}`);
  } else {
    console.log('SMARTLEARN_CI=generic (CI env var set, not GitHub Actions)');
  }
  process.exit(0);
}

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
