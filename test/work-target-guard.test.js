import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolveGitExecutable } from './system-executables.mjs';
import { fileURLToPath } from 'node:url';
import { evaluate, branchAllowed } from '../scripts/work-target-guard.mjs';

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const ALLOWED = ['claude/smartlearn-v1-complete', 'candidate/*'];

function repo(branch, { detach = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sl-guard-'));
  execFileSync(resolveGitExecutable(), ['init', '-q', '-b', branch], { cwd: root });
  mkdirSync(join(root, 'scripts'));
  for (const f of ['work-target-guard.mjs', 'work-branches.json']) copyFileSync(join(scripts, f), join(root, 'scripts', f));
  execFileSync(resolveGitExecutable(), ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: root });
  if (detach) execFileSync(resolveGitExecutable(), ['checkout', '-q', '--detach'], { cwd: root });
  return root;
}
function run(cwd, scriptRoot, vars = {}) {
  const env = { ...process.env }; delete env.CI; delete env.GITHUB_ACTIONS;
  const r = spawnSync(process.execPath, [join(scriptRoot, 'scripts', 'work-target-guard.mjs')], { cwd, env: { ...env, ...vars }, encoding: 'utf8' });
  return { status: r.status, output: r.stdout + r.stderr };
}
const withRepos = (specs, fn) => {
  const roots = specs.map((s) => repo(...s));
  try { fn(...roots); } finally { for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
};

test('branch rules: exact name, prefix wildcard, no partial matches', () => {
  assert.equal(branchAllowed('claude/smartlearn-v1-complete', ALLOWED), true);
  assert.equal(branchAllowed('candidate/combinada-2026-11-08', ALLOWED), true);
  assert.equal(branchAllowed('candidate/', ALLOWED), false);
  assert.equal(branchAllowed('candidates/x', ALLOWED), false);
  assert.equal(branchAllowed('claude/smartlearn-v1-complete-old', ALLOWED), false);
});

test('correct branch in its own checkout is allowed (also from a subdirectory)', () => withRepos([['candidate/x']], (r) => {
  assert.equal(run(r, r).status, 0);
  mkdirSync(join(r, 'server'));
  assert.equal(run(join(r, 'server'), r).status, 0);
}));

test('wrong branch is refused', () => withRepos([['claude/audit-branch']], (r) => {
  const out = run(r, r);
  assert.equal(out.status, 1, out.output);
  assert.match(out.output, /WRONG_BRANCH/);
}));

test('detached HEAD is refused without CI and allowed with CI', () => withRepos([['candidate/x', { detach: true }]], (r) => {
  const out = run(r, r);
  assert.equal(out.status, 1, out.output);
  assert.match(out.output, /DETACHED_HEAD/);
  assert.equal(run(r, r, { CI: 'true' }).status, 0);
}));

test('wrong execution directory is refused even on an allowed branch', () => withRepos([['candidate/a'], ['candidate/b']], (a, b) => {
  const out = run(b, a); // scripts of checkout A, command running inside checkout B
  assert.equal(out.status, 1, out.output);
  assert.match(out.output, /WRONG_EXECUTION_ROOT/);
}));

test('CI (GitHub Actions or CI=true/1) skips the check; CI=false/0 does not', () => withRepos([['claude/audit-branch']], (r) => {
  assert.equal(run(r, r, { GITHUB_ACTIONS: 'true' }).status, 0);
  for (const v of ['true', '1']) assert.equal(run(r, r, { CI: v }).status, 0, v);
  for (const v of ['false', '0', 'off']) assert.equal(run(r, r, { CI: v }).status, 1, v);
}));

test('fails closed: empty allowed list refuses; no git repo is not a decision', () => {
  assert.equal(evaluate({ env: {}, toplevel: process.cwd(), branch: 'x', root: process.cwd(), allowed: [] }).ok, false);
  assert.equal(evaluate({ env: {}, toplevel: null, branch: '', root: process.cwd(), allowed: ALLOWED, rootIsRepo: false }).code, 'NOT_A_GIT_REPO');
  assert.equal(evaluate({ env: {}, toplevel: null, branch: '', root: process.cwd(), allowed: ALLOWED, rootIsRepo: true }).code, 'OUTSIDE_CHECKOUT');
});

test('running the scripts of a checkout from a directory outside any repository is refused', () => withRepos([['candidate/x']], (r) => {
  const outside = mkdtempSync(join(tmpdir(), 'sl-outside-'));
  try {
    const out = run(outside, r);
    assert.equal(out.status, 1, out.output);
    assert.match(out.output, /OUTSIDE_CHECKOUT/);
  } finally { rmSync(outside, { recursive: true, force: true }); }
}));
