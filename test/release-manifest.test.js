import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReleaseManifest } from '../scripts/release-manifest.mjs';

function dist(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-release-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}
const opts = { commit: 'a'.repeat(40), version: '1.2.3', now: () => new Date('2026-09-19T12:00:00.000Z') };

test('the manifest names its source commit, version, dirty flag, every file hash and one tree hash', () => {
  const d = dist({ 'index.html': '<html>', 'assets/app.js': 'console.log(1)' });
  try {
    const m = buildReleaseManifest({ distDir: d.dir, ...opts, dirty: true });
    assert.equal(m.commit, 'a'.repeat(40));
    assert.equal(m.version, '1.2.3');
    assert.equal(m.dirty, true);
    assert.equal(m.builtAt, '2026-09-19T12:00:00.000Z');
    assert.deepEqual(m.files.map((f) => f.path), ['assets/app.js', 'index.html'], 'sorted, forward-slash paths');
    assert.match(m.treeSha256, /^[0-9a-f]{64}$/);
  } finally { d.cleanup(); }
});

test('the tree hash changes when any byte, any file name or the file set changes — and not otherwise', () => {
  const base = { 'index.html': 'A', 'assets/app.js': 'B' };
  const hashOf = (files) => { const d = dist(files); try { return buildReleaseManifest({ distDir: d.dir, ...opts }).treeSha256; } finally { d.cleanup(); } };
  const reference = hashOf(base);
  assert.equal(hashOf({ 'assets/app.js': 'B', 'index.html': 'A' }), reference, 'creation order does not matter');
  assert.notEqual(hashOf({ ...base, 'index.html': 'A2' }), reference, 'one changed byte');
  assert.notEqual(hashOf({ 'index.html': 'A', 'assets/other.js': 'B' }), reference, 'renamed file');
  assert.notEqual(hashOf({ ...base, 'extra.txt': 'x' }), reference, 'added file');
});

test('an artifact without a source commit, or built from an empty dist, is refused', () => {
  const d = dist({ 'index.html': 'A' });
  const empty = dist({});
  try {
    assert.throws(() => buildReleaseManifest({ distDir: d.dir, version: '1', commit: '' }), /commit is required/);
    assert.throws(() => buildReleaseManifest({ distDir: empty.dir, ...opts }), /run the build first/);
  } finally { d.cleanup(); empty.cleanup(); }
});
