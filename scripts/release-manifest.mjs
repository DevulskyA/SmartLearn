#!/usr/bin/env node
// T51: a release artifact must say WHAT it was built from. Produces release-manifest.json
// for a built dist/: source commit, dirty flag, package version, and the sha256 of every
// file plus one tree hash (order-independent of the filesystem listing order).
//   npm run build && node scripts/release-manifest.mjs [--dist dist] [--out release-manifest.json]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function buildReleaseManifest({ distDir, commit, dirty, version, now = () => new Date() }) {
  if (!commit) throw new Error('commit is required: a release artifact must name its source commit');
  const files = walk(distDir)
    .map((f) => ({ path: relative(distDir, f).split(sep).join('/'), sha256: sha256(readFileSync(f)), bytes: statSync(f).size }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (files.length === 0) throw new Error(`no files under ${distDir}: run the build first`);
  const treeSha256 = sha256(Buffer.from(files.map((f) => `${f.sha256}  ${f.path}`).join('\n')));
  return { manifestVersion: 1, builtAt: now().toISOString(), version, commit, dirty: Boolean(dirty), treeSha256, files };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const root = fileURLToPath(new URL('..', import.meta.url));
  const distDir = flag('--dist', join(root, 'dist'));
  const out = flag('--out', join(root, 'release-manifest.json'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  const manifest = buildReleaseManifest({
    distDir,
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain').length > 0,
    version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`release manifest: ${manifest.files.length} files, tree ${manifest.treeSha256.slice(0, 16)}…, commit ${manifest.commit.slice(0, 10)}${manifest.dirty ? ' (DIRTY working tree)' : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
