// BUILD IDENTITY: which SmartLearn is this? One computation shared by the Vite build (embedded into the app), the DEV launcher
// (logged and compared with what the app embeds) and the tests. The version has ONE source of truth: the root package.json.
// The commit is derived from git at BUILD time (no git at runtime); a tracked-file change adds "+local".
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(root, ...args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

// T-F1-07: what goes INTO the app. A build is current when this hash is unchanged, whatever the commit (a docs-only commit must not
// force a rebuild); the commit still says where the content came from. Line endings are normalised so a CRLF checkout hashes like LF.
const INPUT_DIRS = ['src', 'shared', 'server/src', 'server/migrations'];
const INPUT_FILES = ['index.html', 'package.json'];

function listFiles(dir, base, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, `${base}/${entry.name}`, out);
    else if (entry.isFile()) out.push({ rel: `${base}/${entry.name}`, full });
  }
}

export function inputsHash(root = defaultRoot) {
  const files = [];
  for (const d of INPUT_DIRS) listFiles(join(root, d), d, files);
  for (const f of INPUT_FILES) if (existsSync(join(root, f))) files.push({ rel: f, full: join(root, f) });
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(`${f.rel}\n`);
    hash.update(readFileSync(f.full, 'utf8').replaceAll('\r\n', '\n'));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function readBuildIdentity({ root = defaultRoot, env = process.env, command = 'build' } = {}) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const commit = git(root, 'rev-parse', '--short', 'HEAD') ?? 'unknown';
  const dirty = Boolean(git(root, 'status', '--porcelain', '--untracked-files=no'));
  const channel = env.SMARTLEARN_BUILD_MODE || (command === 'serve' ? 'DEV' : 'RELEASE');
  return { version, commit, dirty, channel, id: `${commit}${dirty ? '+local' : ''}`, inputsHash: inputsHash(root) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(readBuildIdentity()));
}
