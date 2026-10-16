#!/usr/bin/env node
// T-F8-01 / R-09 (AC-09.1, AC-09.2): inspects the STAGED standalone artifact (what `tauri build` bundles) and the Tauri
// configuration, and reports every way the DEV configuration could leak into a release:
//   - the fixture password (scripts/seed-dev.mjs) anywhere in any staged file;
//   - the persistent DEV datastore path name anywhere outside its one reviewed module;
//   - a DEV/AI environment variable DEFINED (assigned, put in an env object, in a .env file) by anything that ships;
//   - a DEV/AI variable NAME referenced by first-party shipped code outside the reviewed read-only modules;
//   - the backend environment the Tauri shell hands to the packaged server (src-tauri/src/lib.rs `local_backend_env`):
//     exactly the reviewed keys, and never NODE_ENV (existing decision: loopback HTTP keeps the non-Secure cookie path).
// READING a variable (`process.env.X === 'true'`) is how the server stays opt-in; only DEFINING it is a leak.
//
// CLI: node scripts/inspect-package.mjs [resourcesDir]   (default src-tauri/resources; exit 1 on any finding)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const FIXTURE_PASSWORD = 'SmartLearn-dev-2026-local-only'; // same literal as scripts/seed-dev.mjs DEV_ACCOUNT.password
export const DEV_DATA_DIRNAME = 'SmartLearn-DevData';
export const DEV_ENV_VARS = [
  'SMARTLEARN_DEV_PERSISTENT_SESSION',
  'SMARTLEARN_DEV_DATA_DIR',
  'SMARTLEARN_AI_CONSENT',
  'SMARTLEARN_AI_PROVIDER',
  'SMARTLEARN_AI_API_KEY',
];

// Reviewed first-party modules that may NAME the variables (to read them / explain a refusal). Anything else is a finding.
export const READ_ONLY_VAR_MODULES = new Set([
  'server-runtime/src/config.js',
  'server-runtime/src/main.js',
  'server-runtime/src/production-config.js',
  'server-runtime/src/auth/session-tokens.js',
  'server-runtime/src/services/generated-drafts.js',
  'server-runtime/src/dev-datastore.js',
]);
// Reviewed: dev-datastore.js ships only because main.js imports its lock/identity helpers; it names the DEV data directory as
// the DEFAULT it compares against, it never creates or selects it for the packaged app.
export const DEV_DATA_PATH_MODULES = new Set(['server-runtime/src/dev-datastore.js']);

// The exact backend environment the Tauri shell may set (lib.rs local_backend_env). Adding a key is a reviewed change.
export const ALLOWED_BACKEND_ENV_KEYS = ['HOST', 'PORT', 'SMARTLEARN_DB_PATH', 'SMARTLEARN_SOURCES_DIR', 'SMARTLEARN_STATIC_DIR', 'SMARTLEARN_ALLOWED_ORIGINS'];

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.txt', '.md', '.ps1', '.bat', '.cmd', '.sh', '.env', '.toml', '.yml', '.yaml', '.svg']);
const FIRST_PARTY_PREFIXES = ['server-runtime/src/', 'shared/', 'dist-runtime/'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Patterns that DEFINE `name` (as opposed to reading it). */
function definitionPatterns(name) {
  const n = escapeRe(name);
  return [
    new RegExp(`process\\.env\\.${n}\\s*=(?!=)`),
    new RegExp(`process\\.env\\[\\s*['"\`]${n}['"\`]\\s*\\]\\s*=(?!=)`),
    new RegExp(`\\benv\\.${n}\\s*=(?!=)`),
    new RegExp(`['"\`]${n}['"\`]\\s*:\\s*['"\`\\w]`), // { 'SMARTLEARN_X': 'true' } passed as an env object
    new RegExp(`(^|[\\r\\n])\\s*(export\\s+|set\\s+)?${n}\\s*=`), // .env / batch / shell line
    new RegExp(`\\$env:${n}\\s*=`, 'i'), // PowerShell
    new RegExp(`\\.env\\(\\s*["']${n}["']`), // Rust Command::env("X", ..)
  ];
}

/** Keys of the string pairs inside lib.rs `fn local_backend_env(...)`. */
export function backendEnvKeys(libRsText) {
  const start = libRsText.indexOf('fn local_backend_env');
  if (start < 0) return null;
  const open = libRsText.indexOf('vec![', start);
  const close = libRsText.indexOf('\n    ]', open);
  if (open < 0 || close < 0) return null;
  const body = libRsText.slice(open, close);
  return [...body.matchAll(/"([A-Z][A-Z0-9_]*)"\.to_string\(\)\s*,/g)].map((m) => m[1]);
}

/**
 * @param {{resourcesDir: string, tauriConfPath?: string, libRsPath?: string}} opts
 * @returns {{kind: string, file: string, detail: string}[]} empty = clean
 */
export function inspectPackage({ resourcesDir, tauriConfPath, libRsPath }) {
  const findings = [];
  const add = (kind, file, detail) => findings.push({ kind, file, detail });
  const base = resolve(resourcesDir);
  const files = walk(base);
  if (!files.some((f) => relative(base, f).split(sep).join('/').startsWith('server-runtime/src/'))) {
    add('NOT_STAGED', base, 'server-runtime/src is empty: nothing was staged, the inspection would prove nothing');
  }

  const scan = (abs, rel, isFirstParty) => {
    const buf = readFileSync(abs);
    if (buf.includes(FIXTURE_PASSWORD)) add('FIXTURE_PASSWORD', rel, 'the DEV fixture password ships');
    if (buf.includes(DEV_DATA_DIRNAME) && !DEV_DATA_PATH_MODULES.has(rel)) add('DEV_DATA_PATH', rel, `${DEV_DATA_DIRNAME} is named outside its reviewed module`);
    const name = rel.split('/').pop();
    const ext = name.includes('.') ? `.${name.split('.').pop().toLowerCase()}` : '';
    if (/^\.env(\.|$)/i.test(name) && !rel.includes('/node_modules/')) add('DOTENV_FILE', rel, 'an environment file ships');
    if (!TEXT_EXT.has(ext) || !isFirstParty) return;
    const text = buf.toString('utf8');
    for (const v of DEV_ENV_VARS) {
      if (!text.includes(v)) continue;
      for (const re of definitionPatterns(v)) if (re.test(text)) { add('DEV_VAR_DEFINED', rel, `${v} is defined by shipped code`); break; }
      if (!READ_ONLY_VAR_MODULES.has(rel)) add('DEV_VAR_NAMED', rel, `${v} is named outside the reviewed read-only modules`);
    }
  };

  for (const abs of files) {
    const rel = relative(base, abs).split(sep).join('/');
    scan(abs, rel, FIRST_PARTY_PREFIXES.some((p) => rel.startsWith(p)));
  }

  if (tauriConfPath) {
    const text = readFileSync(tauriConfPath, 'utf8');
    if (text.includes(FIXTURE_PASSWORD)) add('FIXTURE_PASSWORD', 'tauri.conf.json', 'the DEV fixture password is in the Tauri config');
    for (const v of DEV_ENV_VARS) if (text.includes(v)) add('DEV_VAR_DEFINED', 'tauri.conf.json', `${v} appears in the Tauri config`);
    if (text.includes(DEV_DATA_DIRNAME)) add('DEV_DATA_PATH', 'tauri.conf.json', 'the DEV data directory is in the Tauri config');
  }
  if (libRsPath) {
    const text = readFileSync(libRsPath, 'utf8');
    if (text.includes(FIXTURE_PASSWORD)) add('FIXTURE_PASSWORD', 'lib.rs', 'the DEV fixture password is in the native shell');
    const keys = backendEnvKeys(text);
    if (!keys) add('BACKEND_ENV_UNPARSEABLE', 'lib.rs', 'local_backend_env was not found/parsed: the inspection would prove nothing');
    else {
      for (const k of keys) if (!ALLOWED_BACKEND_ENV_KEYS.includes(k)) add('BACKEND_ENV_KEY', 'lib.rs', `${k} is set for the packaged backend but is not in the reviewed list`);
      if (keys.includes('NODE_ENV')) add('BACKEND_ENV_KEY', 'lib.rs', 'NODE_ENV is set by the shell; the existing decision is loopback HTTP without Secure cookies');
    }
    // The shell may only ever pass the DEV pin through (with_data_overrides), never invent a DEV variable.
    for (const v of DEV_ENV_VARS) {
      if (new RegExp(`\\.env\\(\\s*"${escapeRe(v)}"`).test(text) || new RegExp(`"${escapeRe(v)}"\\.to_string\\(\\)\\s*,`).test(text)) add('DEV_VAR_DEFINED', 'lib.rs', `${v} is set by the native shell`);
    }
  }
  return findings;
}

export function defaultInspection(resourcesDir = join(ROOT, 'src-tauri', 'resources')) {
  return inspectPackage({
    resourcesDir,
    tauriConfPath: join(ROOT, 'src-tauri', 'tauri.conf.json'),
    libRsPath: join(ROOT, 'src-tauri', 'src', 'lib.rs'),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? resolve(process.argv[2]) : undefined;
  try { statSync(dir ?? join(ROOT, 'src-tauri', 'resources')); } catch { console.error('[inspect-package] resources dir missing'); process.exit(2); }
  const findings = defaultInspection(dir);
  if (findings.length === 0) console.log('[inspect-package] clean');
  else {
    for (const f of findings) console.error(`[inspect-package] ${f.kind} ${f.file}: ${f.detail}`);
    process.exit(1);
  }
}
