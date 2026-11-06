#!/usr/bin/env node
// P0 (PR #6 audit): "the restored dataset is present in code but nobody
// sees it unless they know to call a dev-console function" — this is the
// documented, one-command entry point that fixes that. Same pattern/
// precedent as scripts/dev-remote.mjs (a Node wrapper is used instead of
// `VAR=value vite` because that syntax doesn't work on Windows
// PowerShell/cmd, which this project develops on).
//
// Sets VITE_SEED_UAT_DATASET=1, read by src/db.js's own DEV-only
// first-run seed guard (both storage backends) to seed the rich ~9-
// discipline src/fixtures/uat-medical-dataset.js dataset instead of the
// small 2-subject src/fixtures/dev-dataset.js one — same safety
// invariants as that existing guard: only runs when import.meta.env.DEV
// (never in a production build), and only when the store is genuinely
// empty (never overwrites real data). See db.js for the exact guard.
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VITE_ENTRY = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const WORK_BRANCH = 'claude/smartlearn-v1-complete';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const branch = git(['branch', '--show-current'], ROOT);
console.log(`SMARTLEARN_ROOT=${ROOT}`);
console.log(`SMARTLEARN_BRANCH=${branch || '(detached HEAD)'}`);
if (branch !== WORK_BRANCH) {
  console.error('\nSMARTLEARN_WRONG_WORKTREE');
  console.error(`Development must run from ${WORK_BRANCH}.`);
  process.exit(1);
}

console.log(
  '\n[dev:uat] Seeding the rich ~9-discipline UAT dataset on first load ' +
  '(only if this browser profile/app-data is currently empty — an\n' +
  '[dev:uat] already-seeded profile from a plain `npm run dev` run will ' +
  'NOT be overwritten; clear this origin\'s storage or use a fresh\n' +
  '[dev:uat] profile/private window first if you need a clean rich seed).\n',
);

const child = spawn(process.execPath, [VITE_ENTRY], {
  cwd: ROOT,
  env: { ...process.env, VITE_SEED_UAT_DATASET: '1' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!child.killed) child.kill(); });
}
