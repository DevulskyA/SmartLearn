#!/usr/bin/env node
// LOCAL-01B: stages everything the Desktop app needs to run its local-authority
// backend WITHOUT any Node.js installed on the end-user machine.
//
// Copies (never symlinks, so the result is self-contained and movable):
//   - server/src, server/migrations, server/node_modules, server/package.json
//       -> src-tauri/resources/server-runtime/
//     (server/package.json has no devDependencies section -- its whole
//     node_modules IS the production dependency set already used by the
//     passing server test suite; no npm re-install, no network call, no
//     native-binding rebuild, zero drift risk from the tested tree.)
//   - dist/ (the already-built frontend, `npm run build`'s output)
//       -> src-tauri/resources/dist-runtime/
//   - the CURRENTLY RUNNING node binary (process.execPath -- not a PATH
//     lookup, so this is accurate even if multiple Node installs exist)
//       -> src-tauri/resources/node-runtime/node.exe (or `node` on non-Windows)
//
// tauri.conf.json's bundle.resources copies these three directories into the
// packaged app's resource_dir at build time; lib.rs's `standalone_backend_paths`
// resolves them at runtime and never falls back to a bare "node" PATH lookup
// once they exist (see lib.rs's `resolve_backend_launch`).
//
// Re-run this before every `tauri build` / standalone `tauri dev` proof --
// it is not run automatically by `npm run build` (server-runtime is a large,
// slow-to-copy tree; keeping it a separate explicit step keeps the normal
// dev loop fast).

import { existsSync, cpSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER_DIR = join(ROOT, 'server');
const SHARED_DIR = join(ROOT, 'shared');
const DIST_DIR = join(ROOT, 'dist');
const RESOURCES_DIR = join(ROOT, 'src-tauri', 'resources');

function fail(message) {
  console.error(`[package-standalone] ${message}`);
  process.exit(1);
}

if (!existsSync(join(SERVER_DIR, 'node_modules'))) {
  fail(`${join(SERVER_DIR, 'node_modules')} missing -- run \`npm --prefix server install\` first.`);
}
if (!existsSync(DIST_DIR)) {
  fail(`${DIST_DIR} missing -- run \`npm run build\` first.`);
}

// Placeholder `.gitkeep` files (tracked in git) keep these four
// directories present in a fresh checkout so `cargo build`/`tauri dev`
// never fails just because nobody has run this script yet -- resources
// only need to exist for tauri_build's resource-copy step; whether they
// contain a real standalone backend is decided at runtime by
// `standalone_backend_paths` (lib.rs). Replaced (not merged) below, then
// re-created so the worktree stays clean after a packaging run.
const serverRuntimeDir = join(RESOURCES_DIR, 'server-runtime');
const sharedDir = join(RESOURCES_DIR, 'shared');
const distRuntimeDir = join(RESOURCES_DIR, 'dist-runtime');
const nodeRuntimeDir = join(RESOURCES_DIR, 'node-runtime');
for (const dir of [serverRuntimeDir, sharedDir, distRuntimeDir, nodeRuntimeDir]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

// server-runtime: src + migrations + node_modules + package.json, same
// relative layout as server/ itself (migrations.js/app.js resolve
// `../migrations` from their own file URL -- preserving the sibling
// relationship is what makes that resolution work unchanged post-copy).
for (const entry of ['src', 'migrations', 'node_modules', 'package.json']) {
  const from = join(SERVER_DIR, entry);
  if (!existsSync(from)) fail(`${from} missing -- cannot stage server-runtime.`);
  cpSync(from, join(serverRuntimeDir, entry), { recursive: true });
}

// shared/: several server/src/services/*.js import from repo-root
// `../../../shared/*.js` (e.g. text-validation.js, review-schedule.js,
// import-normalization.js) -- three levels up from server/src/services is
// shared/'s sibling `server/`, so in the staged tree `shared` must be a
// sibling of `server-runtime` for that same relative import to keep
// resolving unchanged.
if (!existsSync(SHARED_DIR)) fail(`${SHARED_DIR} missing -- cannot stage shared/.`);
cpSync(SHARED_DIR, sharedDir, { recursive: true });

// dist-runtime: the built frontend, served as SMARTLEARN_STATIC_DIR.
cpSync(DIST_DIR, distRuntimeDir, { recursive: true });

// node-runtime: the exact binary currently running this script -- not a
// PATH lookup. `process.execPath` is Node's own resolved path to itself.
const nodeBinaryName = process.platform === 'win32' ? 'node.exe' : 'node';
copyFileSync(process.execPath, join(nodeRuntimeDir, nodeBinaryName));

for (const dir of [serverRuntimeDir, sharedDir, distRuntimeDir, nodeRuntimeDir]) {
  writeFileSync(join(dir, '.gitkeep'), '');
}

console.log('[package-standalone] staged:');
console.log(`  ${serverRuntimeDir}`);
console.log(`  ${join(RESOURCES_DIR, 'dist-runtime')}`);
console.log(`  ${join(nodeRuntimeDir, nodeBinaryName)} (from ${process.execPath}, ${process.version})`);
