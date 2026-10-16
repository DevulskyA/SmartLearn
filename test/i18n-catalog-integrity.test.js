import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
const sourceFiles = () => execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js') && !f.startsWith('src/i18n/'));

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

test('every call site passes exactly the parameters its catalog text declares ({name} never reaches the screen unfilled)', () => {
  const problems = [];
  let checked = 0;
  for (const f of sourceFiles()) {
    const ast = espree.parse(readFileSync(join(root, f), 'utf8').replace(/^﻿/, ''), { ecmaVersion: 'latest', sourceType: 'module', loc: true });
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && (n.callee.name === 't' || n.callee.name === 'tn') && n.arguments[0]?.type === 'Literal') {
        const plural = n.callee.name === 'tn';
        const key = n.arguments[0].value;
        const paramsArg = n.arguments[plural ? 2 : 1];
        const texts = plural ? Object.keys(ptBR).filter((k) => k.startsWith(`${key}.`) && PLURAL_SUFFIX.test(k)).map((k) => ptBR[k]) : [ptBR[key]].filter((x) => x !== undefined);
        // a parameter object built elsewhere (a variable, a spread) cannot be read from the call: those calls are not judged here
        if (texts.length > 0 && !(paramsArg && paramsArg.type !== 'ObjectExpression') && !paramsArg?.properties?.some((p) => p.type !== 'Property')) {
          checked += 1;
          const declared = new Set(texts.flatMap((x) => [...placeholdersOf(x)]));
          if (plural) declared.delete('count');
          const passed = new Set((paramsArg?.properties ?? []).map((p) => p.key.name ?? p.key.value));
          const at = `${f}:${n.loc.start.line} ${key}`;
          const localeAsSecondArg = typeof n.arguments[1]?.value === 'string';
          if (!paramsArg && declared.size > 0 && !localeAsSecondArg) problems.push(`${at}: declares {${[...declared]}} but no parameters are passed`);
          for (const name of declared) if (paramsArg && !passed.has(name)) problems.push(`${at}: {${name}} is never filled`);
          for (const name of passed) if (!declared.has(name) && !(plural && name === 'count')) problems.push(`${at}: parameter ${name} is not used by the text`);
        }
      }
      for (const k of Object.keys(n)) { const c = n[k]; if (Array.isArray(c)) c.forEach(walk); else if (c && typeof c === 'object') walk(c); }
    })(ast);
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
