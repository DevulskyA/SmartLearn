// Impact-based E2E selection for `scripts/e2e.mjs --changed`. Playwright's own --only-changed selects spec FILES that changed, so a change to
// src/lesson-editor-ui.js or a migration selected nothing. Here a changed product path selects the specs that exercise it:
//   docs/.specs/tests/tooling   -> nothing (cannot change what an E2E proves; same table as governance §9)
//   e2e/*.spec.js               -> itself;  e2e/support/*  -> the specs that import it
//   shared core (shell, api client, db, auth, migrations, global CSS, i18n) -> CORE set + name matches
//   other src/ or server/       -> specs naming the module (stem) or using an id/testid it defines, plus direct importers' stems and ids
//   nothing matched, or unknown -> CORE set (conservative, never "nothing" for product code)
//   package.json, playwright config, bundler, Tauri -> ESCALATE: CORE set now, and the reason says a full-suite milestone gate is justified
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, posix } from 'node:path';
import { SUITES } from '../e2e/support/suites.js';

export const CORE_SPECS = [...new Set([...SUITES.smoke, 'auth', 'first-run'])];
const DOC = /(^|\/)[^/]+\.md$|^(docs|\.specs|conductor|\.claude|\.planban|\.impeccable)\/|^plan\.md$/;
const NO_E2E = /^(test|server\/test|server\/scripts|src-tauri\/src\/tests)\//;
const ESCALATE = /^(package(-lock)?\.json|server\/package(-lock)?\.json|playwright\.config\.js|vite\.config\.[cm]?js|src-tauri\/(tauri\.conf\.json|Cargo\.toml|capabilities\/))/;
const SHARED_SERVER = /^server\/(migrations\/|src\/(main\.js|app\.js|db\.js|(db|auth|http|routes?)\/))/;
const SHARED_CLIENT = /^(src\/(app|api-client|db|remote-store|offline-store|theme|dom-utils)\.js|src\/i18n\/|src\/(styles|experience)\.css|index\.html)$/;
const isShared = (path) => SHARED_SERVER.test(path) || SHARED_CLIENT.test(path) || path.startsWith('src/i18n/');
const SHELL = new Set(['src/app.js']); // imports every screen: going through it would select the whole suite
const STOP = new Set(['index', 'main', 'app', 'src', 'server', 'sql', 'test', 'util', 'utils', 'core', 'base']);

const stemOf = (path) => posix.basename(path).replace(/\.[^.]+$/, '').replace(/^\d+-/, '');
const stemTokens = (stem) => { const base = stem.replace(/-(ui|dialog|api|view-model)$/, ''); return base.length >= 5 ? [base] : []; };
const wordsOf = (stem) => stem.split('-').filter((w) => w.length >= 5 && !STOP.has(w));
// ids a UI module defines or queries: these are what a spec clicks on
const QUOTE = '["\'`]';
const IDS = new RegExp(String.raw`(?:\bid=\s*${QUOTE}|data-testid=\s*${QUOTE}|getElementById\(\s*${QUOTE}|querySelector\(\s*${QUOTE}#)([A-Za-z][\w-]{5,})`, 'g');
export function identifiersOf(text) { return new Set([...text.matchAll(IDS)].map((m) => m[1])); }

function importersOf(path, modules) {
  const quoted = `['"][^'"]*/${posix.basename(path).replaceAll('.', '[.]')}['"]`;
  const importing = new RegExp(String.raw`from\s+${quoted}|import\(${quoted}\)`);
  return Object.entries(modules).filter(([other, text]) => other !== path && !SHELL.has(other) && importing.test(text)).map(([other]) => other);
}

/** A path that, by its name alone, selects nothing or a fixed set. Returns {specs, why, escalate} or null when the path needs name/id matching. */
function fixedRule(path, specs) {
  if (DOC.test(path)) return { specs: [], why: 'documentation, no E2E' };
  if (NO_E2E.test(path)) return { specs: [], why: 'unit/server test or tooling, no E2E' };
  if (path === 'scripts/e2e.mjs' || path.startsWith('scripts/e2e-')) return { specs: SUITES.smoke, why: 'the runner itself, smoke' };
  if (path.startsWith('scripts/')) return { specs: [], why: 'tooling, no E2E' };
  const own = path.match(/^e2e\/([^/]+)\.spec\.js$/);
  if (own) return { specs: [own[1]], why: 'the spec itself' };
  const support = path.match(/^e2e\/support\/([^/]+)\.js$/);
  if (support) {
    const users = Object.keys(specs).filter((name) => specs[name].includes(`support/${support[1]}`));
    return users.length ? { specs: users, why: `${users.length} spec(s) import it` } : { specs: CORE_SPECS, why: 'imported by no spec: CORE' };
  }
  if (ESCALATE.test(path)) return { specs: CORE_SPECS, escalate: true, why: 'build/test configuration, CORE now; a full-suite milestone gate is justified' };
  return null;
}

function nameTokens(path, modules) {
  const server = path.startsWith('server/');
  // src modules are named by the whole stem (lesson-editor-ui -> lesson-editor): a lone word like 'editor' names half the specs.
  // server paths are named by domain words (reuse, bibliography) and their folders.
  const tokens = new Set(server ? wordsOf(stemOf(path)) : stemTokens(stemOf(path)));
  if (server) for (const part of path.split('/').slice(2, -1)) wordsOf(part).forEach((w) => tokens.add(w));
  const ids = identifiersOf(modules[path] ?? '');
  const importers = path.startsWith('src/') ? importersOf(path, modules) : [];
  for (const imp of importers) {
    identifiersOf(modules[imp] ?? '').forEach((i) => ids.add(i));
    stemTokens(stemOf(imp)).forEach((t) => tokens.add(t));
  }
  return { tokens: [...tokens, ...ids], importers: importers.length };
}

/** Specs whose name or text holds a token. A token found in more than a fifth of the specs ("summary", "dialog") names no screen: ignored. */
function specsByTokens(tokens, specs) {
  const total = Object.keys(specs).length;
  const found = new Set();
  for (const token of tokens) {
    const names = Object.keys(specs).filter((name) => name.includes(token) || specs[name].includes(token));
    if (names.length && !(total >= 10 && names.length > total / 5)) names.forEach((n) => found.add(n));
  }
  return [...found];
}

function describeMatch({ shared, matched, importers, path }) {
  if (!matched.length) return shared ? 'shared core: CORE only' : 'no spec names it, CORE fallback';
  const via = importers ? `, via ${importers} importer(s) of ${posix.basename(path)}` : '';
  const named = `${matched.length} spec(s) by name/id${via}`;
  return shared ? `shared core: CORE + ${named}` : named;
}

/**
 * @param {{changed: string[], specs: Record<string,string>, modules?: Record<string,string>}} input
 *   specs: spec name (no extension) -> text; modules: repo path -> text for src/ files (for importer expansion)
 * @returns {{specs: string[], reasons: string[], escalate: boolean, none: boolean}}
 */
export function selectSpecs({ changed, specs, modules = {} }) {
  const picked = new Set();
  const reasons = [];
  let escalate = false;
  const add = (names) => names.filter((n) => n in specs).forEach((n) => picked.add(n));
  for (const path of changed.map((p) => p.replaceAll('\\', '/'))) {
    const fixed = fixedRule(path, specs);
    if (fixed) {
      add(fixed.specs);
      escalate ||= !!fixed.escalate;
      reasons.push(`${path}: ${fixed.why}`);
      continue;
    }
    const { tokens, importers } = nameTokens(path, modules);
    const matched = specsByTokens(tokens, specs);
    const shared = isShared(path);
    add(matched);
    if (shared || !matched.length) add(CORE_SPECS);
    reasons.push(`${path}: ${describeMatch({ shared, matched, importers, path })}`);
  }
  return { specs: [...picked].sort(), reasons, escalate, none: picked.size === 0 };
}

// ---- I/O wrapper ----
export function loadSpecs(root) {
  const dir = join(root, 'e2e');
  const specs = {};
  for (const f of readdirSync(dir)) if (f.endsWith('.spec.js')) specs[f.replace(/\.spec\.js$/, '')] = readFileSync(join(dir, f), 'utf8');
  return specs;
}

export function loadModules(root) {
  const out = {};
  const dir = join(root, 'src');
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) if (f.endsWith('.js')) out[`src/${f}`] = readFileSync(join(dir, f), 'utf8');
  return out;
}

/** Paths that differ from `base` in the working tree, plus untracked files. */
export function gitChangedPaths(root, base = 'HEAD', run = execFileSync) {
  const opts = { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }; // git's CRLF warnings are noise here
  const lines = (args) => run('git', args, opts).split(/\r?\n/).filter(Boolean);
  return [...new Set([...lines(['diff', '--name-only', base]), ...lines(['ls-files', '--others', '--exclude-standard'])])];
}

/** Maps the selection to Playwright arguments. */
export function playwrightArgsFor(selection) {
  return selection.specs.map((name) => `e2e/${name}.spec.js`);
}
