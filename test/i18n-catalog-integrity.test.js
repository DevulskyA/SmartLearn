import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolveGitExecutable } from './system-executables.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';
import ptBR from '../src/i18n/locales/pt-BR.js';
import { t, tn, setLocale, registerCatalog } from '../src/i18n/index.js';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../shared/locales.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;
const placeholdersOf = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const pluralGroups = () => {
  const groups = new Map();
  for (const key of Object.keys(ptBR)) {
    const m = key.match(PLURAL_SUFFIX);
    if (!m) continue;
    const base = key.slice(0, -m[0].length);
    groups.set(base, [...(groups.get(base) ?? []), m[1]]);
  }
  return groups;
};
const sourceFiles = () => execFileSync(resolveGitExecutable(), ['ls-files', 'src'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js') && !f.startsWith('src/i18n/'));

test('every plural group has an .other form, and every form of a group carries the same placeholders', () => {
  // {count} is NOT required: a group may only change a word ("página"/"páginas") and be chosen by tn() or by an explicit n === 1 test.
  const problems = [];
  for (const [base, forms] of pluralGroups()) {
    if (!forms.includes('other')) problems.push(`${base}: no .other`);
    const sets = forms.map((f) => [f, placeholdersOf(ptBR[`${base}.${f}`])]);
    for (const [form, set] of sets) {
      if ([...set].sort().join() !== [...sets[0][1]].sort().join()) problems.push(`${base}.${form}: placeholders differ from ${base}.${sets[0][0]}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('pt-BR plural rule: 0 and 1 are singular ("one"), 2 and more are "other"; every plural reads correctly for 0, 1, 2 and 12', () => {
  const rule = new Intl.PluralRules('pt-BR');
  assert.deepEqual([0, 1, 2, 5, 12].map((n) => rule.select(n)), ['one', 'one', 'other', 'other', 'other']);
  assert.ok(pluralGroups().size > 0, 'the catalog must have plural groups for this test to check anything');
  for (const [base, forms] of pluralGroups()) {
    const dummy = Object.fromEntries([...placeholdersOf(ptBR[`${base}.${forms[0]}`])].filter((name) => name !== 'count').map((name) => [name, 'X']));
    for (const n of [0, 1, 2, 12]) {
      const text = tn(base, n, dummy);
      assert.ok(!text.includes('{') && !text.includes('undefined'), `${base} with ${n}: "${text}"`);
      if (placeholdersOf(ptBR[`${base}.${rule.select(n)}`] ?? ptBR[`${base}.other`]).has('count')) assert.ok(text.includes(String(n)), `${base} with ${n} must show the number: "${text}"`);
    }
  }
});

function translationCallDetails(node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || !['t', 'tn'].includes(node.callee.name) || node.arguments[0]?.type !== 'Literal') return null;
  const plural = node.callee.name === 'tn';
  const key = node.arguments[0].value;
  const paramsArg = node.arguments[plural ? 2 : 1];
  const texts = plural
    ? Object.keys(ptBR).filter((catalogKey) => catalogKey.startsWith(`${key}.`) && PLURAL_SUFFIX.test(catalogKey)).map((catalogKey) => ptBR[catalogKey])
    : [ptBR[key]].filter((text) => text !== undefined);
  // A parameter object built elsewhere or containing a spread cannot be read reliably at the call site.
  const paramsAreReadable = !(paramsArg && paramsArg.type !== 'ObjectExpression') && !paramsArg?.properties?.some((property) => property.type !== 'Property');
  if (texts.length === 0 || !paramsAreReadable) return null;
  return { plural, key, paramsArg, texts };
}

function inspectTranslationCall(node, file, problems) {
  const call = translationCallDetails(node);
  if (!call) return 0;
  const { plural, key, paramsArg, texts } = call;
  const declared = new Set(texts.flatMap((text) => [...placeholdersOf(text)]));
  if (plural) declared.delete('count');
  const passed = new Set((paramsArg?.properties ?? []).map((property) => property.key.name ?? property.key.value));
  const at = `${file}:${node.loc.start.line} ${key}`;
  const localeAsSecondArg = typeof node.arguments[1]?.value === 'string';
  if (!paramsArg && declared.size > 0 && !localeAsSecondArg) problems.push(`${at}: declares {${[...declared]}} but no parameters are passed`);
  for (const name of declared) if (paramsArg && !passed.has(name)) problems.push(`${at}: {${name}} is never filled`);
  for (const name of passed) if (!declared.has(name) && !(plural && name === 'count')) problems.push(`${at}: parameter ${name} is not used by the text`);
  return 1;
}

function visitAst(node, visitor) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((item) => visitAst(item, visitor));
    else if (child && typeof child === 'object') visitAst(child, visitor);
  }
}

test('every call site passes exactly the parameters its catalog text declares ({name} never reaches the screen unfilled)', () => {
  const problems = [];
  let checked = 0;
  for (const file of sourceFiles()) {
    const ast = espree.parse(readFileSync(join(root, file), 'utf8').replace(/^﻿/, ''), { ecmaVersion: 'latest', sourceType: 'module', loc: true });
    visitAst(ast, (node) => { checked += inspectTranslationCall(node, file, problems); });
  }
  assert.ok(checked > 100, `only ${checked} calls were checked: the scan is not looking at the code`);
  assert.deepEqual(problems, []);
});

test('every supported locale resolves every key: a locale without its own catalog shows the pt-BR text, never a bare key', () => {
  assert.deepEqual([...SUPPORTED_LOCALES].sort(), ['en', 'es', 'pt-BR']);
  try {
    for (const locale of SUPPORTED_LOCALES) {
      setLocale(locale);
      const gaps = Object.keys(ptBR).filter((key) => !PLURAL_SUFFIX.test(key) && t(key) === key);
      assert.deepEqual(gaps, [], `${locale} leaves keys unresolved`);
    }
  } finally {
    setLocale(DEFAULT_LOCALE);
  }
});

test('a translated catalog is used key by key, and a key it lacks falls back to pt-BR instead of breaking (pseudo-locale, not a real translation)', () => {
  const pseudo = Object.fromEntries(Object.entries(ptBR).filter((_, i) => i % 2 === 0).map(([key, value]) => [key, `[en] ${value}`]));
  registerCatalog('en', pseudo);
  try {
    setLocale('en');
    const translated = Object.keys(pseudo).filter((k) => !PLURAL_SUFFIX.test(k));
    const absent = Object.keys(ptBR).filter((k) => !(k in pseudo) && !PLURAL_SUFFIX.test(k));
    assert.ok(translated.length > 0 && absent.length > 0);
    for (const key of translated) assert.ok(t(key).startsWith('[en] '), key);
    for (const key of absent) assert.equal(t(key), ptBR[key], key);
  } finally {
    registerCatalog('en', undefined);
    setLocale(DEFAULT_LOCALE);
  }
});

test('no pt-BR text ends in a stray capital glued to a lowercase letter ("resumoX"), and the lesson-editor save button keeps its original wording', () => {
  // Found in the real catalog: 'editor.summary.save' read "Salvar resumoX" since the migration (9d2ac40); no spec looked at the label text.
  const stray = Object.entries(ptBR).filter(([, value]) => /[a-zà-ú][A-Z]$/.test(String(value).trim())).map(([key, value]) => `${key}: ${value}`);
  assert.deepEqual(stray, []);
  assert.equal(ptBR['editor.summary.save'], 'Salvar resumo');
});
