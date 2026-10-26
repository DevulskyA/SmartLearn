// Inventory of user-visible Portuguese text that still lives in code instead of src/i18n. Reads the AST (espree, the parser ESLint
// already uses), so comments are never counted and only string literals / template text are looked at.
//
//   node scripts/scan-portuguese-i18n.mjs              -> per-file counts
//   node scripts/scan-portuguese-i18n.mjs --list       -> every finding with line and text
//   node scripts/scan-portuguese-i18n.mjs --update     -> rewrite scripts/i18n-baseline.json (the ratchet; only after a real migration)
//
// Categories (what to migrate is `visible`; `diagnostic` is shown only for the reader's information):
//   visible     text that reaches the screen: assigned to textContent/innerText/placeholder/title/aria-label, passed to
//               createTextElement/createTextNode/setAttribute, or prose anywhere else in src/ (labels, messages, error text shown to the student)
//   html        text inside a template literal assigned to innerHTML / insertAdjacentHTML
//   diagnostic  console.* and Error messages with no UI path proven here: a human-facing message that crosses to the screen is `visible`
//
// It is a heuristic for PROSE, not a translator: identifiers, selectors, URLs, SQL, event names and CSS classes are skipped on purpose.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = join(root, 'scripts', 'i18n-baseline.json');

const TEXT_PROPS = new Set(['textContent', 'innerText', 'placeholder', 'title', 'ariaLabel', 'alt', 'label']);
const HTML_PROPS = new Set(['innerHTML', 'outerHTML']);
const NON_TEXT_PROPS = new Set(['className', 'id', 'href', 'src', 'type', 'name', 'htmlFor', 'role', 'rel', 'target', 'autocomplete', 'inputMode']);
const ATTR_NAMES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-valuetext']);
const WRAPPERS = new Set(['ConditionalExpression', 'LogicalExpression', 'BinaryExpression', 'TemplateLiteral', 'ParenthesizedExpression']);
// Portuguese function words: with two or more words in a literal they separate prose from code strings.
const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'um', 'uma', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'sem', 'por', 'que', 'não', 'nao', 'ou', 'e', 'é', 'se', 'ao', 'você', 'voce', 'seu', 'sua', 'este', 'esta', 'foi', 'ser', 'mais', 'já', 'ainda', 'nenhum', 'nenhuma', 'todo', 'todos', 'sobre', 'entre', 'pelo', 'pela']);

const ACCENTED = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;

/** True when `text` reads like Portuguese prose a student could see (not an identifier, selector, URL, SQL or class list). */
export function looksLikeProse(text, { visibleContext = false } = {}) {
  const s = String(text).trim();
  if (s.length < 2 || !/\p{L}/u.test(s)) return false;
  if (/^[.#[]/.test(s) || /^(https?:|\/|\.\/|\.\.\/|data:|--)/.test(s)) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|WITH)\b/i.test(s)) return false;
  if (/^(WHERE|FROM|VALUES|ORDER BY|GROUP BY|LIMIT|JOIN)\b[^.!?]*=?\s*[$?:\w]*$/.test(s)) return false; // a clause of a statement built in pieces
  if (/^[\w-]+\s*:\s*[^;]+;/.test(s)) return false; // inline CSS declarations ("position:sticky;top:0")
  if (/^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]*([MmLlHhVvCcSsQqTtAaZz][\d\s.,-]*)*$/.test(s)) return false; // SVG path data
  if (!/\s/.test(s)) {
    // a single word: only counted where it is certainly shown ("Salvar", "Excluir"), and only if it looks like a word, not a token
    return visibleContext && /^[A-ZÀ-Ý][a-zà-ÿ]{2,}[.!?…:]?$/.test(s);
  }
  if (ACCENTED.test(s)) return true;
  const words = s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 2) return false;
  // CSS class lists and similar: all tokens lower-case with hyphens/digits and no stop-word
  if (/^[\w\s.#:\-[\]=>~*"',/()%]+$/.test(s) && !words.some((w) => STOPWORDS.has(w)) && !/^[A-ZÀ-Ý]/.test(s)) return false;
  return words.some((w) => STOPWORDS.has(w)) || /^[A-ZÀ-Ý]/.test(s);
}

function parentsOf(ast) {
  const parents = new Map();
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    parents.set(node, parent);
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else if (value && typeof value.type === 'string') visit(value, node);
    }
  };
  visit(ast, null);
  return parents;
}

const propName = (member) => (member?.type === 'MemberExpression' && !member.computed ? member.property.name : member?.type === 'MemberExpression' && member.property.type === 'Literal' ? member.property.value : null);
const calleeName = (call) => (call.callee.type === 'Identifier' ? call.callee.name : propName(call.callee));
const isI18nCall = (node) => node?.type === 'CallExpression' && ['t', 'tn'].includes(calleeName(node));

/** Where does this expression end up? 'visible' | 'html' | 'diagnostic' | null (unknown: judged by its text only) */
function destinationOf(node, parents) {
  let current = node;
  let parent = parents.get(current);
  while (parent && WRAPPERS.has(parent.type)) { current = parent; parent = parents.get(current); }
  if (!parent) return null;
  if (parent.type === 'AssignmentExpression' && parent.right === current) {
    const name = propName(parent.left);
    if (HTML_PROPS.has(name)) return 'html';
    if (TEXT_PROPS.has(name)) return 'visible';
    if (NON_TEXT_PROPS.has(name)) return 'ignore';
    return null;
  }
  if (parent.type === 'CallExpression') {
    const name = calleeName(parent);
    const index = parent.arguments.indexOf(current);
    if (name === 'insertAdjacentHTML' && index === 1) return 'html';
    if (name === 'createTextElement' && index === 2) return 'visible';
    if (name === 'createTextNode' && index === 0) return 'visible';
    if (name === 'setAttribute' && index === 1 && parent.arguments[0]?.type === 'Literal') return ATTR_NAMES.has(parent.arguments[0].value) ? 'visible' : 'ignore';
    if (['add', 'remove', 'toggle', 'contains'].includes(name) && propName(parent.callee.object) === 'classList') return 'ignore';
    if (['querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById', 'addEventListener', 'removeEventListener', 'getAttribute', 'removeAttribute', 'hasAttribute', 'getItem', 'setItem', 'removeItem'].includes(name)) return 'ignore';
    if (parent.callee.type === 'MemberExpression' && parent.callee.object.name === 'console') return 'diagnostic';
  }
  if (parent.type === 'NewExpression' && /Error$/.test(parent.callee.name ?? '') && parent.arguments[0] === current) return 'diagnostic';
  return null;
}

export function scanSource(source, file = '<memory>') {
  const code = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true });
  const parents = parentsOf(ast);
  const findings = [];
  const add = (category, node, text) => findings.push({ file, line: node.loc.start.line, category, text: text.replace(/\s+/g, ' ').trim().slice(0, 90) });

  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    const parent = parents.get(node);
    const insideI18n = (() => { let p = parent; while (p) { if (isI18nCall(p)) return true; p = parents.get(p); } return false; })();
    if (!insideI18n && node.type === 'Literal' && typeof node.value === 'string') {
      const skip = parent?.type === 'ImportDeclaration' || parent?.type === 'ExportAllDeclaration' || parent?.type === 'ExportNamedDeclaration'
        || (parent?.type === 'Property' && parent.key === node && !parent.computed) || (parent?.type === 'MemberExpression' && parent.property === node)
        || parent?.type === 'ImportAttribute' || parent?.type === 'ExpressionStatement' /* 'use strict' */;
      if (!skip) {
        const destination = destinationOf(node, parents);
        if (destination === 'ignore') { /* a class list, id, selector or attribute value: not text */ }
        else if (destination === 'diagnostic') { if (looksLikeProse(node.value)) add('diagnostic', node, node.value); }
        else if (looksLikeProse(node.value, { visibleContext: destination === 'visible' })) add('visible', node, node.value);
      }
    } else if (!insideI18n && node.type === 'TemplateLiteral') {
      const destination = destinationOf(node, parents);
      const text = node.quasis.map((q) => q.value.cooked ?? '').join(' ');
      if (destination === 'ignore') { /* not text */ }
      else if (destination === 'html') {
        const plain = text.replace(/<[^>]*>/g, ' ');
        if (looksLikeProse(plain, { visibleContext: true })) add('html', node, plain);
      } else if (destination === 'diagnostic') {
        if (looksLikeProse(text)) add('diagnostic', node, text);
      } else if (looksLikeProse(text, { visibleContext: destination === 'visible' })) {
        add('visible', node, text);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  walk(ast);
  return findings;
}

/**
 * Client files under src/ (the catalog itself, fixtures and the vendored dev seed are not UI code): tracked AND new untracked ones, so a file with
 * fixed text is seen BEFORE it is added to git, not after. Files deleted from the working tree are skipped.
 */
export function clientFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((f) => f.endsWith('.js') && !f.startsWith('src/i18n/locales/') && !f.startsWith('src/fixtures/') && existsSync(join(root, f)));
}

const HTML_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];

/**
 * Static text of an HTML page that no data-i18n / data-i18n-<attr> attribute backs (so the catalog never reaches it): same ratchet as the
 * JavaScript, no NEW ones. Text a script overwrites at start-up is still counted: the page must not depend on that.
 */
export function scanHtml(source, file = '<html>') {
  const html = source.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, (c) => c.replace(/[^\n]/g, ' '));
  const lineAt = (index) => html.slice(0, index).split('\n').length;
  const findings = [];
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>([^<]*)/g)) {
    const [, , attrs, raw] = m;
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text && !/\sdata-i18n=/.test(attrs) && looksLikeProse(text, { visibleContext: true })) findings.push({ file, line: lineAt(m.index), category: 'visible', text: text.slice(0, 90) });
    for (const name of HTML_ATTRS) {
      const a = new RegExp(`\\s${name}="([^"]+)"`).exec(attrs);
      if (a && !new RegExp(`\\sdata-i18n-${name}=`).test(attrs) && looksLikeProse(a[1], { visibleContext: true })) findings.push({ file, line: lineAt(m.index), category: 'visible', text: `${name}="${a[1]}"`.slice(0, 90) });
    }
  }
  return findings;
}

export function scanAll() {
  const byFile = {};
  const findings = [];
  for (const file of clientFiles()) {
    const found = scanSource(readFileSync(join(root, file), 'utf8'), file);
    findings.push(...found);
    byFile[file] = { visible: 0, html: 0, diagnostic: 0 };
    for (const f of found) byFile[file][f.category] += 1;
  }
  const pages = ['index.html'].filter((page) => existsSync(join(root, page)));
  for (const page of pages) {
    const found = scanHtml(readFileSync(join(root, page), 'utf8'), page);
    findings.push(...found);
    byFile[page] = { visible: found.length, html: 0, diagnostic: 0 };
  }
  return { byFile, findings };
}

/**
 * Portuguese prose in server/ and shared/ code: texts the server returns to the screen (audit findings, import notices, backup text) or sends to a
 * model (prompts). The client cannot translate them. MEASURED and frozen here, not migrated: moving them needs a contract decision (a code plus
 * parameters from the server, the text in the client catalog), which is the product owner's. Lower the number when that migration happens.
 */
export const SERVER_PROSE_BASELINE = 577;
export function scanServerAndShared() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'server/src', 'shared'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((f) => f.endsWith('.js') && existsSync(join(root, f)));
  const byFile = {};
  let total = 0;
  for (const file of files) {
    const count = scanSource(readFileSync(join(root, file), 'utf8'), file).length;
    if (count > 0) byFile[file] = count;
    total += count;
  }
  return { byFile, total };
}

/** What the ratchet counts: text that must eventually move to the catalog (visible + html). */
export const toMigrate = (counts) => (counts?.visible ?? 0) + (counts?.html ?? 0);

const isMain = process.argv[1] && import.meta.url.toLowerCase().endsWith('scan-portuguese-i18n.mjs') && process.argv[1].toLowerCase().endsWith('scan-portuguese-i18n.mjs');
if (isMain) {
  const { byFile, findings } = scanAll();
  if (process.argv.includes('--update')) {
    const baseline = Object.fromEntries(Object.entries(byFile).map(([f, c]) => [f, toMigrate(c)]).filter(([, n]) => n > 0));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`baseline written: ${Object.keys(baseline).length} files, ${Object.values(baseline).reduce((a, b) => a + b, 0)} strings`);
  } else if (process.argv.includes('--server')) {
    const { byFile: serverFiles, total } = scanServerAndShared();
    for (const [file, count] of Object.entries(serverFiles).sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(4)}  ${file}`);
    console.log(`SERVER+SHARED Portuguese prose: ${total} (frozen at ${SERVER_PROSE_BASELINE})`);
  } else if (process.argv.includes('--list')) {
    for (const f of findings) console.log(`${f.file}:${f.line} [${f.category}] ${f.text}`);
  } else {
    const rows = Object.entries(byFile).map(([f, c]) => ({ f, ...c, total: toMigrate(c) })).filter((r) => r.total + r.diagnostic > 0).sort((a, b) => b.total - a.total);
    for (const r of rows) console.log(`${String(r.total).padStart(4)} to migrate (visible ${r.visible}, html ${r.html}) · diagnostic ${r.diagnostic}  ${r.f}`);
    console.log(`TOTAL to migrate: ${rows.reduce((a, r) => a + r.total, 0)}`);
  }
}
