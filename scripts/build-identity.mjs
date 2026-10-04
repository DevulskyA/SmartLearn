// BUILD IDENTITY: which SmartLearn is this? One computation shared by the Vite build (embedded into the app), the DEV launcher
// (logged and compared with what the app embeds) and the tests. The version has ONE source of truth: the root package.json.
// The commit is derived from git at BUILD time (no git at runtime); a tracked-file change adds "+local".
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(root, ...args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

export function readBuildIdentity({ root = defaultRoot, env = process.env, command = 'build' } = {}) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const commit = git(root, 'rev-parse', '--short', 'HEAD') ?? 'unknown';
  const dirty = Boolean(git(root, 'status', '--porcelain', '--untracked-files=no'));
  const channel = env.SMARTLEARN_BUILD_MODE || (command === 'serve' ? 'DEV' : 'RELEASE');
  return { version, commit, dirty, channel, id: `${commit}${dirty ? '+local' : ''}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(readBuildIdentity()));
}
