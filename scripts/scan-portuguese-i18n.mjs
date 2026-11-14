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
const SQL_CLAUSE_PREFIX = /^(WHERE|FROM|VALUES|ORDER BY|GROUP BY|LIMIT|JOIN)\b/;
const SVG_COMMANDS = new Set('MmLlHhVvCcSsQqTtAaZz');

function isSqlClauseFragment(text) {
  const prefix = text.match(SQL_CLAUSE_PREFIX);
  if (!prefix) return false;
  const remainder = text.slice(prefix[0].length);
  return !/[.!?]/.test(remainder);
}

function isInlineCssDeclaration(text) {
  const colon = text.indexOf(':');
  if (colon < 1 || !/^[\w-]+\s*$/.test(text.slice(0, colon))) return false;
  const semicolon = text.indexOf(';', colon + 1);
  return semicolon > colon + 1;
}

function isSvgPathData(text) {
  if (!SVG_COMMANDS.has(text[0])) return false;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index];
    if (/[\d\s.,-]/.test(char)) continue;
    if (SVG_COMMANDS.has(char)) continue;
    return false;
  }
  return true;
}

/** True when `text` reads like Portuguese prose a student could see (not an identifier, selector, URL, SQL or class list). */
export function looksLikeProse(text, { visibleContext = false } = {}) {
  const s = String(text).trim();
  if (s.length < 2 || !/\p{L}/u.test(s)) return false;
  if (/^[.#[]/.test(s) || /^(https?:|\/|\.\/|\.\.\/|data:|--)/.test(s)) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|WITH)\b/i.test(s)) return false;
  if (isSqlClauseFragment(s)) return false; // a clause of a statement built in pieces
  if (isInlineCssDeclaration(s)) return false; // inline CSS declarations ("position:sticky;top:0")
  if (isSvgPathData(s)) return false; // SVG path data
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

const propName = (member) => {
  if (member?.type !== 'MemberExpression') return null;
  if (!member.computed) return member.property.name;
  return member.property.type === 'Literal' ? member.property.value : null;
};
const calleeName = (call) => (call.callee.type === 'Identifier' ? call.callee.name : propName(call.callee));
const isI18nCall = (node) => node?.type === 'CallExpression' && ['t', 'tn'].includes(calleeName(node));
const IGNORE_CALLS = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById', 'addEventListener', 'removeEventListener', 'getAttribute', 'removeAttribute', 'hasAttribute', 'getItem', 'setItem', 'removeItem']);
const DIRECT_CALL_DESTINATIONS = new Map([
  ['insertAdjacentHTML', { argument: 1, destination: 'html' }],
  ['createTextElement', { argument: 2, destination: 'visible' }],
  ['createTextNode', { argument: 0, destination: 'visible' }],
]);

function destinationForAssignment(node, parent) {
  if (parent.type !== 'AssignmentExpression' || parent.right !== node) return null;
  const name = propName(parent.left);
  if (HTML_PROPS.has(name)) return 'html';
  if (TEXT_PROPS.has(name)) return 'visible';
  if (NON_TEXT_PROPS.has(name)) return 'ignore';
  return null;
}

function destinationForCall(node, parent) {
  if (parent.type !== 'CallExpression') return null;
  const name = calleeName(parent);
  const index = parent.arguments.indexOf(node);
  const direct = DIRECT_CALL_DESTINATIONS.get(name);
  if (direct?.argument === index) return direct.destination;
  if (name === 'setAttribute' && index === 1 && parent.arguments[0]?.type === 'Literal') {
    return ATTR_NAMES.has(parent.arguments[0].value) ? 'visible' : 'ignore';
  }
  if (['add', 'remove', 'toggle', 'contains'].includes(name) && propName(parent.callee.object) === 'classList') return 'ignore';
  if (IGNORE_CALLS.has(name)) return 'ignore';
  if (parent.callee.type === 'MemberExpression' && parent.callee.object.name === 'console') return 'diagnostic';
  return null;
}

/** Where does this expression end up? 'visible' | 'html' | 'diagnostic' | null (unknown: judged by its text only) */
function destinationOf(node, parents) {
  let current = node;
  let parent = parents.get(current);
  while (parent && WRAPPERS.has(parent.type)) { current = parent; parent = parents.get(current); }
  if (!parent) return null;
  const assignment = destinationForAssignment(current, parent);
  if (assignment) return assignment;
  const call = destinationForCall(current, parent);
  if (call) return call;
  if (parent.type === 'NewExpression' && /Error$/.test(parent.callee.name ?? '') && parent.arguments[0] === current) return 'diagnostic';
  return null;
}

function isInsideI18n(parent, parents) {
  let current = parent;
  while (current) {
    if (isI18nCall(current)) return true;
    current = parents.get(current);
  }
  return false;
}

function skipLiteral(node, parent) {
  return parent?.type === 'ImportDeclaration' || parent?.type === 'ExportAllDeclaration' || parent?.type === 'ExportNamedDeclaration'
    || (parent?.type === 'Property' && parent.key === node && !parent.computed)
    || (parent?.type === 'MemberExpression' && parent.property === node)
    || parent?.type === 'ImportAttribute' || parent?.type === 'ExpressionStatement';
}

function inspectLiteral(node, parent, parents, add) {
  if (skipLiteral(node, parent)) return;
  const destination = destinationOf(node, parents);
  if (destination === 'ignore') return;
  if (destination === 'diagnostic') {
    if (looksLikeProse(node.value)) add('diagnostic', node, node.value);
    return;
  }
  if (looksLikeProse(node.value, { visibleContext: destination === 'visible' })) add('visible', node, node.value);
}

function inspectTemplate(node, parents, add) {
  const destination = destinationOf(node, parents);
  if (destination === 'ignore') return;
  const text = node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
  if (destination === 'html') {
    const plain = stripTags(text);
    if (looksLikeProse(plain, { visibleContext: true })) add('html', node, plain);
    return;
  }
  if (destination === 'diagnostic') {
    if (looksLikeProse(text)) add('diagnostic', node, text);
    return;
  }
  if (looksLikeProse(text, { visibleContext: destination === 'visible' })) add('visible', node, text);
}

function stripTags(text) {
  let output = '';
  let cursor = 0;
  while (cursor < text.length) {
    const opening = text.indexOf('<', cursor);
    if (opening === -1) return output + text.slice(cursor);
    const closing = text.indexOf('>', opening + 1);
    if (closing === -1) {
      output += text.slice(cursor, opening + 1);
      cursor = opening + 1;
      continue;
    }
    output += text.slice(cursor, opening) + ' ';
    cursor = closing + 1;
  }
  return output;
}

function inspectSourceNode(node, parent, parents, add) {
  if (isInsideI18n(parent, parents)) return;
  if (node.type === 'Literal' && typeof node.value === 'string') inspectLiteral(node, parent, parents, add);
  else if (node.type === 'TemplateLiteral') inspectTemplate(node, parents, add);
}

function visitSourceNode(node, parents, add) {
  if (!node || typeof node.type !== 'string') return;
  const parent = parents.get(node);
  inspectSourceNode(node, parent, parents, add);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) visitSourceNode(child, parents, add);
    } else if (value && typeof value.type === 'string') {
      visitSourceNode(value, parents, add);
    }
  }
}

export function scanSource(source, file = '<memory>') {
  const code = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true });
  const parents = parentsOf(ast);
  const findings = [];
  const add = (category, node, text) => findings.push({ file, line: node.loc.start.line, category, text: text.replace(/\s+/g, ' ').trim().slice(0, 90) });
  visitSourceNode(ast, parents, add);
  return findings;
}

/**
 * Client files under src/ (the catalog itself, fixtures and the vendored dev seed are not UI code): tracked AND new untracked ones, so a file with
 * fixed text is seen BEFORE it is added to git, not after. Files deleted from the working tree are skipped.
 */
function clientFiles() {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git has no portable fixed executable path; installed Git on PATH is required across supported platforms.
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
  for (const { index, attrs, raw } of htmlTextNodes(html)) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text && !/\sdata-i18n=/.test(attrs) && looksLikeProse(text, { visibleContext: true })) findings.push({ file, line: lineAt(index), category: 'visible', text: text.slice(0, 90) });
    for (const name of HTML_ATTRS) {
      const a = new RegExp(`\\s${name}="([^"]+)"`).exec(attrs);
      if (a && !new RegExp(`\\sdata-i18n-${name}=`).test(attrs) && looksLikeProse(a[1], { visibleContext: true })) findings.push({ file, line: lineAt(index), category: 'visible', text: `${name}="${a[1]}"`.slice(0, 90) });
    }
  }
  return findings;
}

function* htmlTextNodes(html) {
  let cursor = 0;
  while (cursor < html.length) {
    const opening = html.indexOf('<', cursor);
    if (opening === -1) return;
    if (!/[a-zA-Z]/.test(html[opening + 1] ?? '')) {
      cursor = opening + 1;
      continue;
    }
    let nameEnd = opening + 2;
    while (html[nameEnd] && /[\w-]/.test(html[nameEnd])) nameEnd += 1;
    const tagEnd = html.indexOf('>', nameEnd);
    if (tagEnd === -1) {
      cursor = opening + 1;
      continue;
    }
    const textStart = tagEnd + 1;
    const nextTag = html.indexOf('<', textStart);
    const textEnd = nextTag === -1 ? html.length : nextTag;
    yield { index: opening, attrs: html.slice(nameEnd, tagEnd), raw: html.slice(textStart, textEnd) };
    cursor = textEnd;
  }
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
// 576 -> 580: the 4 sentences of server/src/migration-authorization.js are operator messages printed to stderr by the backend and the CLI scripts
// (never returned to a screen), like the ones already counted in main.js.
// 580 -> 582: DELETE /sources/:id refuses with SOURCE_HAS_UNITS / SOURCE_GENERATION_RUNNING; dm() needs the server-side sentence, and the screen
// shows the client-catalog twin (api.msg.SOURCE_HAS_UNITS, api.msg.SOURCE_GENERATION_RUNNING) through the code, per the contract.
// 582 -> 584: lessonDate validation refuses with LESSON_DATE_INVALID / LESSON_DATE_AFTER_STUDY; dm() needs the server-side sentence, and the screen
// shows the client-catalog twin (api.msg.LESSON_DATE_INVALID, api.msg.LESSON_DATE_AFTER_STUDY) through the code, per the contract.
// 584 -> 587: the draft replacement decision (migration 043) refuses with DECISION_PENDING, a decision with nothing pending, a decision on a
// draft that already became a lesson, and an invalid decision value. They are plain sentences for now (the screen that will show them is not
// built yet, and the client falls back to the server text without a code): move them to dm() + client catalog when that screen consumes them.
// 587 -> 588: DISCARD_NEEDS_CONFIRMATION, a decision that would delete a draft the student edited is refused until it is confirmed
// (confirmDiscard: true). Same plain-sentence status as the four above: move to dm() + client catalog with the screen.
// 588 -> 589: assertPayloadWithinScope refuses unreadable stored spans (ScopeViolation, same plain-sentence status as the other ScopeViolation texts).
// 589 -> 595: reserve sentences in api-error-messages.js for new coded errors (code + params; text in the client catalog `api.msg.*`):
// DRAFT_ALREADY_LESSON, DRAFT_IN_DECISION, DRAFT_DISCARD_CONFIRM (discard an unfinished summary) and the book-page-range messages
// (PAGE_RANGE_OUTSIDE_BOOK, the reworded PROPOSAL_INPUT_TOO_LARGE). These are the contract's own table, not free text on a screen.
export const SERVER_PROSE_BASELINE = 595;
export function scanServerAndShared() {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git has no portable fixed executable path; installed Git on PATH is required across supported platforms.
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
