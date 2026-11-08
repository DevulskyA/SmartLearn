// What the Desktop exe REALLY serves, compared with the content the sources have now.
//
// The exe serves the frontend that sits beside it (<exe dir>/dist-runtime), a copy made when the exe was built. The build identity of that copy is
// its build-info.json (scripts/build-identity.mjs: inputsHash of src/, shared/, server/, index.html and package.json). This reads THAT file, not the
// staging area (src-tauri/resources/dist-runtime) that scripts/launch-desktop-dev.ps1 looks at: the staging can be current while the exe is not.
//
//   node scripts/desktop-identity.mjs <exe>            exit 0 = the exe serves the current content; 1 = it does not (the reason is printed)
//   node scripts/desktop-identity.mjs <exe> --expected <inputsHash>
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildIdentity } from './build-identity.mjs';

/** The build-info.json beside the exe: { path, info } with info null when it is missing or unreadable (and why). */
export function readServedIdentity(exe) {
  const path = join(dirname(resolve(exe)), 'dist-runtime', 'build-info.json');
  if (!existsSync(path)) return { path, info: null, problem: 'build-info.json is missing next to the exe' };
  try {
    return { path, info: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { path, info: null, problem: `build-info.json is unreadable (${String(error?.message ?? error).split('\n')[0]})` };
  }
}

/** Fail closed: ok only when the served inputsHash is present and equals the expected one. */
export function verifyServedIdentity({ exe, expected }) {
  const { path, info, problem } = readServedIdentity(exe);
  if (!expected) return { ok: false, reason: 'no expected content identity to compare with', path };
  if (!info) return { ok: false, reason: `cannot tell what ${exe} serves: ${problem} (${path})`, path };
  if (typeof info.inputsHash !== 'string' || !info.inputsHash) return { ok: false, reason: `the frontend next to ${exe} carries no inputsHash (${path})`, path, served: info };
  if (info.inputsHash !== expected) {
    return {
      ok: false,
      path,
      served: info,
      reason: `${exe} serves content ${info.inputsHash.slice(0, 12)} (built at ${info.id ?? info.commit ?? 'unknown commit'}, ${info.builtAt ?? 'unknown time'}), not the current ${expected.slice(0, 12)}. Rebuild the exe (npm run build:exe) and open it again.`,
    };
  }
  return { ok: true, path, served: info };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const exe = args.find((a) => !a.startsWith('--'));
  const at = args.indexOf('--expected');
  if (!exe) { console.error('usage: node scripts/desktop-identity.mjs <exe> [--expected <inputsHash>]'); process.exit(2); }
  const expected = at >= 0 ? args[at + 1] : readBuildIdentity({ env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }).inputsHash;
  const result = verifyServedIdentity({ exe, expected });
  console.log(JSON.stringify({ ok: result.ok, exe: resolve(exe), servedInputsHash: result.served?.inputsHash ?? null, servedId: result.served?.id ?? null, expectedInputsHash: expected, reason: result.reason ?? null }));
  process.exit(result.ok ? 0 : 1);
}
