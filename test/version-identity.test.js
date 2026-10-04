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

// ---- T-F1-07: a build is identified by the CONTENT of its inputs, so a docs-only commit does not force a rebuild ----
import { mkdirSync, writeFileSync } from 'node:fs';
import { inputsHash } from '../scripts/build-identity.mjs';

function inputsTree() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-inputs-'));
  for (const d of ['src', 'shared', 'server/src', 'server/migrations', '.specs', 'docs']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"version":"0.1.0"}');
  writeFileSync(join(dir, 'index.html'), '<html></html>');
  writeFileSync(join(dir, 'src', 'app.js'), 'console.log(1);\n');
  writeFileSync(join(dir, 'shared', 'x.js'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'server', 'src', 'main.js'), 'start();\n');
  writeFileSync(join(dir, 'server', 'migrations', '001-a.sql'), 'CREATE TABLE a (id INTEGER);\n');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test('inputsHash: stable, ignores documentation and non-input files, but changes with any input that ends up in the app', () => {
  const t = inputsTree();
  try {
    const base = inputsHash(t.dir);
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(inputsHash(t.dir), base, 'deterministic');
    writeFileSync(join(t.dir, '.specs', 'STATE.md'), 'a docs-only change\n');
    writeFileSync(join(t.dir, 'docs', 'note.md'), 'notes\n');
    assert.equal(inputsHash(t.dir), base, 'a docs-only change does not change the build');
    for (const [file, content] of [['src/app.js', 'console.log(2);\n'], ['shared/x.js', 'export const x = 2;\n'], ['server/src/main.js', 'start2();\n'], ['server/migrations/001-a.sql', 'CREATE TABLE b (id INTEGER);\n'], ['index.html', '<html><body></body></html>'], ['package.json', '{"version":"0.1.1"}']]) {
      const before = readFileSync(join(t.dir, file), 'utf8');
      writeFileSync(join(t.dir, file), content);
      assert.notEqual(inputsHash(t.dir), base, `${file} is an input`);
      writeFileSync(join(t.dir, file), before);
      assert.equal(inputsHash(t.dir), base, `restoring ${file} restores the hash`);
    }
    writeFileSync(join(t.dir, 'src', 'new.js'), '// a new input file\n');
    assert.notEqual(inputsHash(t.dir), base, 'adding an input file changes it');
  } finally { t.cleanup(); }
});

test('inputsHash does not depend on line endings (CRLF checkout vs LF) or on a file the build never sees (node_modules)', () => {
  const t = inputsTree();
  try {
    const base = inputsHash(t.dir);
    writeFileSync(join(t.dir, 'src', 'app.js'), 'console.log(1);\r\n');
    assert.equal(inputsHash(t.dir), base);
    mkdirSync(join(t.dir, 'server', 'src', 'node_modules'), { recursive: true });
    writeFileSync(join(t.dir, 'server', 'src', 'node_modules', 'junk.js'), 'x');
    assert.equal(inputsHash(t.dir), base);
  } finally { t.cleanup(); }
});

test('the identity carries the inputs hash, the Vite build-info records it, and the launcher rebuilds by content, not by commit', () => {
  const id = readBuildIdentity({ env: {} });
  assert.match(id.inputsHash, /^[0-9a-f]{64}$/);
  assert.equal(id.inputsHash, inputsHash(root));
  const launcher = read('scripts/launch-desktop-dev.ps1');
  assert.match(launcher, /inputsHash/);
  assert.doesNotMatch(launcher, /BuildSha \$distInfo\.id\) -eq/, 'dist currency is no longer decided by the commit');
  assert.match(launcher, /Build: content/, 'the launcher says which content is open and at which commit');
});
