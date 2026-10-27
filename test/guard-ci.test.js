import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/require-work-branch.mjs', import.meta.url));

function runGuard(branch, vars = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sl-branch-'));
  try {
    execFileSync('git', ['init', '-q', '-b', branch], { cwd: root });
    const env = { ...process.env };
    delete env.CI;
    delete env.GITHUB_ACTIONS;
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      env: { ...env, ...vars },
      encoding: 'utf8',
    });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [value, shouldAllow] of [[undefined, false], ['false', false], ['0', false], ['off', false], ['true', true], ['1', true]]) {
  test('non-approved worktree CI=' + String(value) + (shouldAllow ? ' allowed' : ' denied'), () => {
    const vars = value === undefined ? {} : { CI: value };
    const result = runGuard('claude/audit-branch', vars);
    assert.equal(result.status, shouldAllow ? 0 : 1, result.output);
    if (!shouldAllow) assert.match(result.output, /SMARTLEARN_WRONG_WORKTREE/);
  });
}

test('approved V1 work branch is allowed without CI', () => {
  assert.equal(runGuard('claude/smartlearn-v1-complete').status, 0);
});

test('GitHub Actions is explicitly allowed', () => {
  const result = runGuard('claude/audit-branch', { GITHUB_ACTIONS: 'true' });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /SMARTLEARN_CI=github-actions/);
});
