import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readBuildIdentity } from '../scripts/build-identity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const rootVersion = JSON.parse(read('package.json')).version;

test('VERSION: one source of truth (root package.json); Tauri references it, the others are guarded equal', () => {
  assert.match(rootVersion, /^\d+\.\d+\.\d+/);
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(tauri.version, '../package.json', 'tauri.conf.json must not carry its own number');
  assert.equal(JSON.parse(read('server/package.json')).version, rootVersion, 'server/package.json drifted from the root version');
  assert.equal(/^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))[1], rootVersion, 'Cargo.toml drifted from the root version');
});

test('readBuildIdentity derives version from package.json and the commit from git, with the channel from the environment', () => {
  const dev = readBuildIdentity({ env: { SMARTLEARN_BUILD_MODE: 'DEV' } });
  assert.equal(dev.version, rootVersion);
  assert.equal(dev.channel, 'DEV');
  assert.equal(dev.commit, execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  assert.ok(dev.id === dev.commit || dev.id === `${dev.commit}+local`);
  assert.equal(readBuildIdentity({ env: {} }).channel, 'RELEASE', 'a build nobody stamped as DEV never claims to be DEV');
  assert.equal(readBuildIdentity({ env: {}, command: 'serve' }).channel, 'DEV');
});

test('a real Vite build embeds the identity in the bundle and emits build-info.json with the same values', () => {
  const out = mkdtempSync(join(tmpdir(), 'sl-build-'));
  try {
    execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', out, '--emptyOutDir'], {
      cwd: root, env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' }, stdio: 'ignore',
    });
    const info = JSON.parse(readFileSync(join(out, 'build-info.json'), 'utf8'));
    const expected = readBuildIdentity({ env: { SMARTLEARN_BUILD_MODE: 'DEV' } });
    assert.equal(info.version, rootVersion);
    assert.equal(info.channel, 'DEV');
    assert.equal(info.commit, expected.commit);
    const dir = join(out, 'assets');
    const assets = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join(' ');
    // esbuild inlines the define as an object literal; the quote style is its choice, the value is ours
    const has = (key, value) => [`"`, "'", '`'].some((q) => assets.includes(`${key}:${q}${value}${q}`));
    assert.ok(has('commit', expected.commit) && has('version', rootVersion) && has('channel', 'DEV'), 'the bundle carries the identity it was built with');
  } finally { rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
