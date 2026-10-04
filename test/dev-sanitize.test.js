import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planSanitize, applySanitize, ARTIFACT_CLASSES } from '../scripts/dev-sanitize.mjs';

// A fake machine: two worktrees (one canonical), cargo output, a human datastore and backups next to them.
function machine() {
  const base = mkdtempSync(join(tmpdir(), 'sl-sanitize-'));
  const put = (rel, bytes = 10) => { const p = join(base, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, Buffer.alloc(bytes, 1)); return p; };
  const canonical = join(base, 'wt-canonical');
  const other = join(base, 'wt-other');
  const files = {
    canonicalExe: put('wt-canonical/src-tauri/target/debug/smartlearn.exe', 100),
    canonicalDeps: put('wt-canonical/src-tauri/target/debug/deps/x.rlib', 1000),
    canonicalRelease: put('wt-canonical/src-tauri/target/release/smartlearn.exe', 200),
    canonicalReleaseDeps: put('wt-canonical/src-tauri/target/release/deps/y.rlib', 300),
    canonicalBundle: put('wt-canonical/src-tauri/target/release/bundle/nsis/setup.exe', 50),
    otherDebugExe: put('wt-other/src-tauri/target/debug/smartlearn.exe', 400),
    otherAndroid: put('wt-other/src-tauri/target/aarch64-linux-android/debug/a.rlib', 500),
    otherBundle: put('wt-other/src-tauri/target/release/bundle/msi/s.msi', 60),
    humanDb: put('FakeHumanData/human-fake.db', 70),
    humanSource: put('FakeHumanData/sources/book.pdf', 80),
    backup: put('SmartLearn-db-backups/p0/smartlearn.db', 90),
    sourceCode: put('wt-canonical/src/app.js', 5),
    tauriRust: put('wt-canonical/src-tauri/src/lib.rs', 5),
  };
  mkdirSync(join(canonical, 'src-tauri', 'target'), { recursive: true });
  return { base, roots: [canonical, other], canonical, files, cleanup: () => rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test('the plan only contains allowlisted artifact classes and never the canonical debug build, installers, human data or source', () => {
  const m = machine();
  try {
    const plan = planSanitize({ roots: m.roots, canonicalRoot: m.canonical });
    const paths = plan.items.map((i) => i.path);
    assert.ok(paths.some((p) => p.endsWith('release') === false && p.includes('wt-canonical') && p.includes('release')), 'canonical release cache is a candidate');
    assert.ok(paths.some((p) => p.includes('aarch64-linux-android')));
    assert.ok(paths.some((p) => p.includes('wt-other') && p.endsWith('debug')), 'a non-canonical debug build is a candidate');
    for (const protectedPath of [m.files.canonicalExe, m.files.canonicalDeps, m.files.canonicalBundle, m.files.otherBundle, m.files.humanDb, m.files.humanSource, m.files.backup, m.files.sourceCode, m.files.tauriRust]) {
      assert.ok(!paths.some((p) => protectedPath.startsWith(p)), `must not plan to remove ${protectedPath}`);
    }
    assert.ok(plan.recoverableBytes >= 200 + 300 + 400 + 500);
  } finally { m.cleanup(); }
});

test('dry run deletes nothing; apply deletes exactly the plan and reports the reclaimed space; a second run finds nothing', () => {
  const m = machine();
  try {
    const plan = planSanitize({ roots: m.roots, canonicalRoot: m.canonical });
    for (const f of Object.values(m.files)) assert.ok(existsSync(f));
    const result = applySanitize(plan, { roots: m.roots });
    assert.equal(result.reclaimedBytes, plan.recoverableBytes);
    assert.ok(!existsSync(m.files.canonicalRelease) && !existsSync(m.files.canonicalReleaseDeps));
    assert.ok(!existsSync(m.files.otherDebugExe) && !existsSync(m.files.otherAndroid));
    for (const kept of [m.files.canonicalExe, m.files.canonicalDeps, m.files.canonicalBundle, m.files.otherBundle, m.files.humanDb, m.files.humanSource, m.files.backup, m.files.sourceCode, m.files.tauriRust]) {
      assert.ok(existsSync(kept), `must still exist: ${kept}`);
    }
    const again = planSanitize({ roots: m.roots, canonicalRoot: m.canonical });
    assert.equal(again.items.length, 0);
    assert.equal(applySanitize(again, { roots: m.roots }).reclaimedBytes, 0);
  } finally { m.cleanup(); }
});

test('a directory with a running process inside it is skipped, not deleted', () => {
  const m = machine();
  try {
    const plan = planSanitize({ roots: m.roots, canonicalRoot: m.canonical, runningPaths: [m.files.otherDebugExe] });
    assert.ok(plan.skipped.some((s) => s.path.endsWith('debug') && /running process/.test(s.reason)));
    assert.ok(!plan.items.some((i) => i.path.includes('wt-other') && i.path.endsWith('debug')));
  } finally { m.cleanup(); }
});

test('the canonical root must be a known worktree, and a symlink at a candidate location is refused', () => {
  const m = machine();
  try {
    assert.throws(() => planSanitize({ roots: m.roots, canonicalRoot: join(m.base, 'somewhere-else') }), /canonical root/);
    // replace a candidate with a link to the human datastore: it must never be followed or deleted
    rmSync(join(m.roots[1], 'src-tauri', 'target', 'aarch64-linux-android'), { recursive: true, force: true });
    try { symlinkSync(join(m.base, 'FakeHumanData'), join(m.roots[1], 'src-tauri', 'target', 'aarch64-linux-android'), 'junction'); } catch { return; /* no permission to link on this machine */ }
    const plan = planSanitize({ roots: m.roots, canonicalRoot: m.canonical });
    assert.ok(plan.skipped.some((s) => /symlink|junction/.test(s.reason)));
    applySanitize(plan, { roots: m.roots });
    assert.ok(existsSync(m.files.humanDb), 'the human datastore behind the link is untouched');
  } finally { m.cleanup(); }
});

test('the allowlist is a short explicit list under src-tauri/target, never a name search', () => {
  assert.ok(ARTIFACT_CLASSES.length <= 6);
  for (const cls of ARTIFACT_CLASSES) {
    assert.ok(cls.path && !cls.path.includes('..') && !/[*?]/.test(cls.path), `class ${cls.id} must be a fixed relative path`);
    assert.ok(cls.why);
  }
  assert.ok(!ARTIFACT_CLASSES.some((c) => /DevData|backup|sources|src(\/|$)/i.test(c.path)));
});
