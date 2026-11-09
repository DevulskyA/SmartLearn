// Pure decisions of scripts/homologation-proof.mjs: no process, window, disk or environment is touched here, so test/homologation-proof.test.js
// can pin every one of them without opening anything. The proof itself (the instrument that opens a scratch copy of the installed app)
// lives in homologation-proof.mjs and only calls these.
import { join, resolve } from 'node:path';

export const lc = (p) => resolve(p).toLowerCase();
/** True when `p` is `root` or lives under it (case-insensitive, like Windows). */
export const inside = (p, root) => lc(p) === lc(root) || lc(p).startsWith(`${lc(root)}\\`);
const overlaps = (a, b) => inside(a, b) || inside(b, a);

/** The folders that hold the owner's real data: DEV datastore, Oficial Roaming app data and its Local twin. */
export function humanRootsOf({ home, appData, localAppData }) {
  return [join(home, 'SmartLearn-DevData'), join(appData ?? '', 'com.devulsky.smartlearn'), join(localAppData ?? '', 'com.devulsky.smartlearn')];
}

/** A copy of `env` with EVERY SMARTLEARN_* variable removed (Windows names are case-insensitive), then `extra` added. Never mutates `env`. */
export function withoutSmartlearnEnv(env, extra = {}) {
  const out = {};
  for (const [name, value] of Object.entries(env)) if (!/^smartlearn_/i.test(name)) out[name] = value;
  return { ...out, ...extra };
}

/** Where the disposable copies and their data live, all under one root so a single guarded delete removes everything. */
export function scratchLayout(root) {
  return {
    root,
    inst: join(root, 'inst'), data: join(root, 'data'),                        // the copy the checks run against
    instNoFile: join(root, 'inst-sem-arquivo'), dataNoFile: join(root, 'data-sem-arquivo'),   // the copy whose homologation.json is removed
  };
}

/**
 * Reasons the scratch root must NOT be used (and therefore deleted): it is, contains or sits inside a human data folder or
 * anything in `protectedPaths` (the real install folder, the real Homologacao data folder, ...). Empty list = safe.
 */
export function scratchRootProblems(root, humanRoots, protectedPaths = []) {
  const problems = [];
  if (!root || resolve(root).split(/[\\/]/).filter(Boolean).length < 4) problems.push(`scratch root is too shallow to delete safely: ${root}`);
  for (const p of [...humanRoots, ...protectedPaths].filter(Boolean)) if (overlaps(root, p)) problems.push(`scratch root ${root} overlaps ${p}`);
  return problems;
}

/** argv for scripts/homologation-install.mjs that installs the disposable copy: own folder, no shortcut, FREE provider. */
export function installerArgs({ script, exe, dest }) {
  return [script, '--exe', exe, '--dest', dest, '--no-shortcut', '--provider', 'FAKE'];
}

/** Env for that installer: the data folder it writes into homologation.json is the scratch one, never the default. */
export function installerEnv(env, dataDir) {
  return { ...env, SMARTLEARN_HOMOLOGACAO_DATA_DIR: dataDir };
}

/** The real shortcut must start the installed exe directly: no launcher, no arguments, working dir = install dir, read-only. */
export function shortcutProblems(sc, { dest, exe }) {
  const problems = [];
  if (lc(sc.target ?? '') !== lc(exe)) problems.push(`target is ${sc.target}, expected ${exe}`);
  if ((sc.arguments ?? '') !== '') problems.push(`arguments must be empty, got "${sc.arguments}"`);
  if (lc(sc.wd ?? '') !== lc(dest)) problems.push(`working directory is ${sc.wd}, expected ${dest}`);
  if (sc.readOnly !== true) problems.push('shortcut is not read-only');
  return problems;
}

/**
 * The real app\homologation.json: read-only, same identity as manifest.json, and its datastore, sources and WebView2 profile are
 * outside every human folder and outside the install folder (a reinstall replaces app\). Only paths are compared; no database is opened.
 */
export function homologationFileProblems(cfg, { humanRoots, appDir, manifest, readOnly }) {
  const problems = [];
  if (readOnly !== true) problems.push('homologation.json is not read-only');
  for (const key of ['db', 'sources', 'webviewDir']) {
    const value = cfg?.[key];
    if (typeof value !== 'string' || !/^[a-zA-Z]:\\/.test(value)) { problems.push(`${key} is not an absolute path: ${value}`); continue; }
    for (const human of humanRoots) if (overlaps(value, human)) problems.push(`${key} (${value}) overlaps the human folder ${human}`);
    if (inside(value, appDir)) problems.push(`${key} (${value}) is inside the install folder ${appDir}`);
  }
  if (cfg?.buildContent !== manifest.inputsHash) problems.push(`buildContent ${cfg?.buildContent} != manifest ${manifest.inputsHash}`);
  if (cfg?.buildHead !== manifest.commit) problems.push(`buildHead ${cfg?.buildHead} != manifest ${manifest.commit}`);
  if (cfg?.windowTitle !== `SmartLearn HOMOLOGACAO - v${manifest.version} - ${manifest.commit}`) problems.push(`windowTitle "${cfg?.windowTitle}" does not name manifest version and commit`);
  return problems;
}

/**
 * Verdict for the fail-closed probe (install folder with ..\manifest.json but WITHOUT app\homologation.json). The exe may refuse by
 * exiting at once or by showing its refusal message box (lib.rs report_startup_refusal blocks on it until closed); both are fine.
 * What is never fine: an app window, a backend, data created, or a process that survives our close.
 *   obs = { sawAppWindow, sawBackend, dataCreated: string[], stillAliveAfterClose, exitCode, messageBox }
 */
export function failClosedProblems(obs) {
  const problems = [];
  if (obs.sawAppWindow) problems.push('an application window opened');
  if (obs.sawBackend) problems.push('a backend (node) child was started');
  if (obs.dataCreated?.length) problems.push(`data was created: ${obs.dataCreated.join(', ')}`);
  if (obs.stillAliveAfterClose) problems.push('the process survived the close of its refusal box');
  else if (obs.exitCode !== 1) problems.push(`exit code is ${obs.exitCode}, expected 1 (refusal)`);
  return problems;
}
