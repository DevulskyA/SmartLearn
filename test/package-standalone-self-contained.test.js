import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, copyFileSync, lstatSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// scripts/package-standalone.mjs promises a self-contained result ("copies, never symlinks"). When server/node_modules is itself a link (a worktree
// that shares the dependencies of another checkout through a junction or a symlink), cpSync copied the LINK: the staged folder then held a link to
// somebody else's checkout, tauri's resource copy skipped it, and the exe died at start with code 101 ("Cannot find package 'better-sqlite3'").
// This runs the real script on a tiny fake repository whose server/node_modules is a link, and asks for real files.

const SCRIPT = fileURLToPath(new URL('../scripts/package-standalone.mjs', import.meta.url));

function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'sl-package-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(SCRIPT, join(root, 'scripts', 'package-standalone.mjs'));
  mkdirSync(join(root, 'server', 'src'), { recursive: true });
  mkdirSync(join(root, 'server', 'migrations'));
  writeFileSync(join(root, 'server', 'src', 'main.js'), '// stub');
  writeFileSync(join(root, 'server', 'migrations', '001-x.sql'), '-- stub');
  writeFileSync(join(root, 'server', 'package.json'), '{}');
  mkdirSync(join(root, 'shared'));
  writeFileSync(join(root, 'shared', 'a.js'), '// stub');
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>');
  // the dependencies live OUTSIDE the repository, as in a worktree that shares another checkout's node_modules
  const shared = mkdtempSync(join(tmpdir(), 'sl-package-deps-'));
  mkdirSync(join(shared, 'better-sqlite3'));
  writeFileSync(join(shared, 'better-sqlite3', 'package.json'), '{"name":"better-sqlite3"}');
  symlinkSync(shared, join(root, 'server', 'node_modules'), 'junction');
  return { root, shared, cleanup: () => { rmSync(root, { recursive: true, force: true }); rmSync(shared, { recursive: true, force: true }); } };
}

test('staging server-runtime from a repository whose node_modules is a link produces real files, not a link into another checkout', () => {
  const { root, cleanup } = fakeRepo();
  try {
    const resources = join(root, 'out');
    const run = spawnSync(process.execPath, [join(root, 'scripts', 'package-standalone.mjs')], { cwd: root, encoding: 'utf8', env: { ...process.env, SMARTLEARN_PACKAGE_RESOURCES_DIR: resources, SMARTLEARN_PACKAGE_SKIP_NODE: '1' } });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const staged = join(resources, 'server-runtime', 'node_modules');
    assert.equal(lstatSync(staged).isSymbolicLink(), false, 'the staged dependencies must not be a link');
    assert.ok(existsSync(join(staged, 'better-sqlite3', 'package.json')), 'the dependency files are really there');
    assert.deepEqual(readdirSync(staged), ['better-sqlite3']);
  } finally { cleanup(); }
});
